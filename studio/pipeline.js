// pipeline — the ONLY orchestrator.
//
// Walks the stage registry, hands each agent its input off the blackboard,
// charges the budget, and writes every artifact through run-store. The CLI and
// (later) the Review Studio server both call runPipeline directly; neither
// shells out, and neither writes a run file itself.
//
// Three rules shape the whole module:
//
//   It never touches the filesystem. Every read and write goes through
//   run-store, which owns the run-directory contract. There is no `fs` import
//   here and there never should be.
//
//   It never crashes a run. A stage that fails is a recorded outcome — a
//   failure.json, a failed attempt, a returned result — not a thrown error
//   escaping to the caller. The only things that escape are programmer errors.
//
//   Every loop is bounded. Validation retries, integrity retries and revisions
//   all have small explicit limits from pipeline-config. There is no
//   self-repair loop that can run forever.

import { STAGES, stageById, stagesFrom } from './stage-registry.js';
import { loadAgent } from './agents/index.js';
import { createLlm } from './llm.js';
import { createBlackboard } from './blackboard.js';
import { createBudget } from './budget.js';
import { StudioFailure, TERMINAL_CONTENT } from './failures.js';
import {
  DEFAULT_CONFIG,
  effortFor,
  modelFor,
  maxTokensFor,
  retriesFor,
} from './pipeline-config.js';
import { validatePuzzle } from '../src/source/validate-puzzle.js';
import { checkBoard } from '../src/engine/board-integrity.js';
import { deriveWords } from '../src/engine/arrangements.js';

const FIRST_STAGE = STAGES[0].id;
const RATER_STAGE = '03-difficulty-rater';
const BOARD_STAGE = '04-board-builder';
const GATE_STAGE = '04a-integrity';

// How each stage's input is assembled from what earlier stages produced. This
// is orchestration knowledge — which output feeds which input — so it lives
// here rather than inside the agents, which stay unaware of each other.
const STAGE_INPUTS = {
  '01-pair-author': (board, { manifest }) => ({ brief: manifest.brief, theme: manifest.theme }),
  '02-theme-grouper': (board) => ({ pairs: board.get('01-pair-author')?.pairs ?? [] }),
  '03-difficulty-rater': (board) => ({ sets: board.get('02-theme-grouper')?.sets ?? [] }),
  [BOARD_STAGE]: (board) => ({ gradedSets: gradedSets(board) }),
  '05-analogy-validator': (board) => ({ board: boardOf(board) }),
  '06-adversarial-solver': (board) => ({
    board: boardOf(board),
    integrity: board.get(GATE_STAGE) ?? null,
  }),
  '07-test-player': (board, { config }) => ({
    words: deriveWords(boardOf(board)?.sets ?? []),
    maxMistakes: config.maxMistakes ?? 4,
  }),
  '08-style-guide': (board) => {
    const puzzle = boardOf(board);
    return {
      title: puzzle?.title ?? null,
      items: (puzzle?.sets ?? []).map((set) => ({
        setId: set.id,
        relationshipLabel: set.relationshipLabel,
        explanation: set.explanation,
      })),
    };
  },
};

const boardOf = (blackboard) => blackboard.get(BOARD_STAGE)?.board ?? null;

// The board builder chooses from candidate sets it has both a grouping and a
// grade for; joining them here keeps both upstream agents ignorant of the other.
function gradedSets(blackboard) {
  const sets = blackboard.get('02-theme-grouper')?.sets ?? [];
  const grades = new Map(
    (blackboard.get('03-difficulty-rater')?.grades ?? []).map((grade) => [grade.setId, grade]),
  );
  return sets.map((set) => {
    const grade = grades.get(set.id);
    return grade ? { ...set, difficulty: grade.difficulty, abstained: grade.abstained, rationale: grade.rationale } : set;
  });
}

/**
 * Runs one attempt of a run to completion or to a recorded failure.
 *
 * Picks up whatever the run needs next: a fresh attempt, an interrupted one to
 * resume, or a revision child created by requestRevision(). Resume is the
 * default — completed stages are paid-for work — and `fresh: true` forces a
 * new attempt instead.
 *
 * @returns {{ runId, attemptId, status: 'complete'|'failed', board?, failure?, usage, resumedAt? }}
 */
export async function runPipeline({
  runId,
  store,
  transport,
  config = DEFAULT_CONFIG,
  context = {},
  fresh = false,
  clock = () => new Date().toISOString(),
  sleep,
  now,
}) {
  const manifest = store.readManifest(runId);
  const llm = createLlm({ transport, clock, ...(sleep ? { sleep } : {}), ...(now ? { now } : {}) });

  const { attemptId, entryStage, resumed } = resolveAttempt(store, runId, manifest, fresh);
  const attempt = store.readAttempt(runId, attemptId);

  moveRunToWorking(store, runId);

  const budget = createBudget({
    limits: config.limits,
    rates: config.rates,
    priorUsage: runUsageBefore(store, runId, attemptId),
    priorAttemptUsage: attempt.usage?.attempt,
  });

  const blackboard = createBlackboard(
    replayOutputs(store, runId, attemptId, attempt.parentAttemptId, entryStage),
  );

  const ctx = { store, runId, attemptId, llm, blackboard, budget, config, context, manifest };

  // Written after every stage, not only at the end. A process killed mid-run
  // must not lose what it already spent — otherwise each resume would start
  // the attempt's allowance over and the cap would never bite. It also leaves
  // an interrupted attempt with a readable partial blackboard.
  const persistProgress = () => {
    store.writeAttemptArtifact(runId, attemptId, 'blackboard.json', blackboard.snapshot());
    store.recordUsage(runId, attemptId, {
      usage: budget.usage(),
      pricingVersion: config.pricingVersion,
    });
  };

  if (resumed) store.recordResume(runId, attemptId, { reenteredAt: entryStage });

  try {
    for (const stage of stagesFrom(entryStage)) {
      budget.beginStage(stage.id);
      budget.check();
      if (stage.kind === 'gate') await runIntegrityGate(ctx);
      else await runAgentStage(ctx, stage);
      store.recordStageStatus(runId, attemptId, stage.id, { status: 'complete' });
      persistProgress();
    }
  } catch (error) {
    // A StudioFailure is an expected outcome of running models against the
    // world. Anything else is a bug in this file, and is allowed to escape.
    if (!(error instanceof StudioFailure)) throw error;
    return recordFailure(ctx, persistProgress, error, entryStage, resumed);
  }

  const board = boardOf(blackboard);
  store.writeAttemptArtifact(runId, attemptId, 'board.json', board);
  persistProgress();
  store.completeAttempt(runId, attemptId, { status: 'complete' });
  store.updateStatus(runId, 'awaiting-review');
  store.appendDecision(runId, { type: 'attempt-completed', attemptId, boardId: board?.id ?? null });

  return {
    runId,
    attemptId,
    status: 'complete',
    board,
    usage: budget.usage(),
    ...(resumed ? { resumedAt: entryStage } : {}),
  };
}

/**
 * Opens a revision: a child attempt that re-enters at `fromStage`, references
 * the parent's earlier artifacts instead of re-running them, and leaves the
 * parent byte-identical. Run runPipeline() afterwards to execute it.
 */
export function requestRevision(store, runId, { fromStage, notes = '', scope = null, config = DEFAULT_CONFIG }) {
  const manifest = store.readManifest(runId);
  if (manifest.revisionCount >= config.maxRevisions) {
    throw new StudioFailure(
      TERMINAL_CONTENT,
      `revision limit reached: ${manifest.revisionCount} of ${config.maxRevisions}`,
      { runId },
    );
  }
  const parentAttemptId = manifest.currentAttemptId;
  store.updateStatus(runId, 'revision-requested');
  const attemptId = store.createAttempt(runId, { parentAttemptId, startingStage: fromStage });

  // What was reused, and why the revision was asked for — the editorial path
  // has to stay readable long after the fact.
  store.writeAttemptArtifact(runId, attemptId, 'parent-attempt.json', {
    parentAttemptId,
    reusedStages: STAGES.slice(0, STAGES.findIndex((s) => s.id === fromStage)).map((s) => s.id),
  });
  store.writeAttemptArtifact(runId, attemptId, 'revision.json', {
    fromStage,
    notes,
    scope,
    requestedAt: manifest.createdAt,
  });
  store.appendDecision(runId, { type: 'revision-requested', attemptId, parentAttemptId, fromStage, notes });
  return attemptId;
}

// --- attempt resolution -------------------------------------------------

function resolveAttempt(store, runId, manifest, fresh) {
  if (!fresh && manifest.currentAttemptId !== null) {
    const current = store.readAttempt(runId, manifest.currentAttemptId);
    if (current.status === 'running') {
      // Either an interrupted attempt or a revision child that has not started.
      // Both re-enter through the same machinery, pointed at the first stage
      // that has no complete, valid output.
      const incomplete = store.findFirstIncompleteStage(runId, current.attemptId);
      return {
        attemptId: current.attemptId,
        entryStage: incomplete ?? current.startingStage,
        // A child attempt that has run nothing is starting, not resuming.
        resumed: incomplete !== current.startingStage && incomplete !== null,
      };
    }
  }
  return { attemptId: store.createAttempt(runId), entryStage: FIRST_STAGE, resumed: false };
}

function moveRunToWorking(store, runId) {
  const { status } = store.readManifest(runId);
  if (status === 'running' || status === 'revising') return;
  store.updateStatus(runId, status === 'revision-requested' ? 'revising' : 'running');
}

// Stages before the entry point are read back rather than re-run: from this
// attempt when it is a resume, from the parent when it is a revision. This is
// what "references earlier accepted artifacts" means in practice — nothing is
// copied, and the parent is never opened for writing.
function replayOutputs(store, runId, attemptId, parentAttemptId, entryStage) {
  const outputs = {};
  for (const stage of STAGES) {
    if (stage.id === entryStage) break;
    for (const source of [attemptId, parentAttemptId]) {
      if (!source) continue;
      if (!store.hasStageArtifact(runId, source, stage.id, 'output.json')) continue;
      outputs[stage.id] = store.readStageArtifact(runId, source, stage.id, 'output.json');
      break;
    }
  }
  return outputs;
}

function runUsageBefore(store, runId, attemptId) {
  const total = { requests: 0, tokens: 0, costUsd: 0, ms: 0 };
  for (const id of store.listAttempts(runId)) {
    if (id === attemptId) continue;
    const spent = store.readAttempt(runId, id).usage?.attempt;
    if (!spent) continue;
    for (const metric of Object.keys(total)) total[metric] += spent[metric] ?? 0;
  }
  return total;
}

// --- stages -------------------------------------------------------------

async function runAgentStage(ctx, stage, { feedback: seedFeedback } = {}) {
  const { store, runId, attemptId, llm, blackboard, budget, config, context, manifest } = ctx;
  const agent = loadAgent(stage.agent);
  const input = STAGE_INPUTS[stage.id](blackboard, { manifest, config });
  const prompt = agent.buildPrompt(input, context);
  const effort = effortFor(stage.id, config);
  const request = {
    stageId: stage.id,
    model: modelFor(stage.id, config),
    prompt,
    maxTokens: maxTokensFor(stage.id, config),
    // Spread, not set to null: an absent effort must reach the transport as
    // an absent key, because some models reject the parameter outright.
    ...(effort ? { effort } : {}),
  };
  const { transport: transportRetries, validation: validationRetries } = retriesFor(stage.id, config);

  let feedback = seedFeedback;
  for (let round = 1; round <= validationRetries + 1; round += 1) {
    const { text, record } = await sendOrRecord(ctx, stage, request, {
      maxAttempts: transportRetries,
      feedback,
    });

    store.writeStageArtifact(runId, attemptId, stage.id, 'request.json', record);
    store.writeStageText(runId, attemptId, stage.id, 'prompt.txt', record.prompt);
    store.writeStageText(runId, attemptId, stage.id, 'response.txt', text);

    const parsed = agent.parse(text);
    const validation = parsed.ok ? agent.validateOutput(parsed.value) : parsed.failure;
    if (parsed.ok) {
      store.writeStageArtifact(runId, attemptId, stage.id, 'output.json', parsed.value);
    }

    if (parsed.ok && validation.ok) {
      // validation.json is written last and only on success, so a stage that
      // has one is genuinely finished — which is exactly what resume asks.
      store.writeStageArtifact(runId, attemptId, stage.id, 'validation.json', validation);
      blackboard.put(stage.id, parsed.value);
      return parsed.value;
    }

    // A rejected round is kept, never erased: its response and its reasons
    // are what a reviewer needs to understand why the retry happened.
    const errors = parsed.ok ? validation.errors : [{ path: '', message: validation.message }];
    store.writeStageArtifact(runId, attemptId, stage.id, `validation.rejected-${round}.json`, {
      ok: false,
      errors,
    });
    store.writeStageText(runId, attemptId, stage.id, `response.rejected-${round}.txt`, text);
    store.recordStageStatus(runId, attemptId, stage.id, { status: 'rejected', round, errors });

    if (round > validationRetries) {
      throw new StudioFailure(
        TERMINAL_CONTENT,
        `${stage.id} produced invalid output after ${round} round(s)`,
        { stageId: stage.id, errors },
      );
    }
    feedback = feedbackFrom(errors);
  }
  /* c8 ignore next */
  throw new Error(`unreachable: ${stage.id} retry loop fell through`);
}

/**
 * send(), plus the evidence a stage that never gets a reply would otherwise
 * not leave. Until now the request record was written only after a successful
 * call, so a stage that died in transport left an empty run directory and a
 * failure naming no stage at all — which is exactly how the 2026-08-02 run had
 * to be diagnosed by arithmetic. The prompt exists before the first call, and
 * llm.js already attaches the attempts and the ceiling to the failure, so all
 * of this is knowable at the moment it goes wrong.
 */
async function sendOrRecord(ctx, stage, request, options) {
  const { store, runId, attemptId, llm, budget } = ctx;
  try {
    return await send(llm, budget, request, options);
  } catch (error) {
    if (!(error instanceof StudioFailure)) throw error;

    // recordFailure already reads failure.stageId; nothing on this path ever
    // set it. `??=` so a failure that already knows better keeps its own.
    error.stageId ??= stage.id;

    // A distinct filename from request.json on purpose: resume treats a stage
    // with validation.json as finished, and nothing here should look like a
    // stage that got as far as producing output.
    store.writeStageText(runId, attemptId, stage.id, 'prompt.txt', request.prompt);
    store.writeStageArtifact(runId, attemptId, stage.id, 'request.failed.json', {
      stageId: stage.id,
      model: request.model,
      // Two numbers because a truncation raises the ceiling once: the one we
      // configured, and the one the last attempt actually went out with.
      maxTokensConfigured: request.maxTokens,
      maxTokens: error.maxTokens ?? request.maxTokens,
      effort: request.effort ?? null,
      category: error.category,
      message: error.message,
      requests: error.requests ?? [],
      inputTokens: error.inputTokens ?? 0,
      outputTokens: error.outputTokens ?? 0,
    });
    store.recordStageStatus(runId, attemptId, stage.id, {
      status: 'failed',
      category: error.category,
      message: error.message,
    });
    throw error;
  }
}

// Every call is charged, success or failure — the spend happened either way.
async function send(llm, budget, request, options) {
  try {
    const reply = await llm.send(request, options);
    budget.charge({
      model: reply.record.model,
      requests: reply.record.requests.length,
      inputTokens: reply.record.inputTokens,
      outputTokens: reply.record.outputTokens,
      ms: reply.record.durationMs,
    });
    return reply;
  } catch (error) {
    if (error instanceof StudioFailure && Array.isArray(error.requests)) {
      budget.charge({
        model: request.model,
        requests: error.requests.length,
        inputTokens: error.inputTokens ?? 0,
        outputTokens: error.outputTokens ?? 0,
      });
    }
    throw error;
  }
}

const feedbackFrom = (errors) =>
  [
    'Your previous reply was rejected by the output schema. Fix exactly these problems and reply again:',
    ...errors.slice(0, 8).map((error) => `- ${error.path ? `${error.path}: ` : ''}${error.message}`),
  ].join('\n');

// --- the mechanical gate ------------------------------------------------

// Deterministic, free, and placed before the four expensive taste stages: a
// board that is mechanically broken should never reach a model that is being
// asked for judgement about it. The game's own validators decide — the Studio
// keeps no competing copy of the schema.
//
// Be clear about which half does the work. In practice `validatePuzzle` is
// what rejects boards: it catches the pre-v1.0 shapes a model drifts into
// (`words[]`, a per-set `tier`) that the Board Builder's own checks let past.
// `checkBoard` cannot reject a schema-valid board — with sixteen distinct
// words no two sets can share an ordered tuple, so the count is always exactly
// sixteen. It is here as a regression guard on the ENGINE (see
// board-integrity.js), and its report is what the Adversarial Solver reads
// next. Nothing mechanical catches a board that is merely *bad*; that is
// stage 06's job and, finally, Max's.
async function runIntegrityGate(ctx) {
  const { store, runId, attemptId, blackboard, budget, config } = ctx;

  for (let round = 1; round <= config.maxIntegrityRetries + 1; round += 1) {
    const report = gateReport(blackboard);

    if (report.ok) {
      store.writeStageArtifact(runId, attemptId, GATE_STAGE, 'integrity.json', report);
      store.writeStageArtifact(runId, attemptId, GATE_STAGE, 'output.json', report);
      store.writeStageArtifact(runId, attemptId, GATE_STAGE, 'validation.json', { ok: true, errors: [] });
      blackboard.put(GATE_STAGE, report);
      return report;
    }

    store.writeStageArtifact(runId, attemptId, GATE_STAGE, `integrity.rejected-${round}.json`, report);
    store.recordStageStatus(runId, attemptId, GATE_STAGE, { status: 'rejected', round });

    if (round > config.maxIntegrityRetries) {
      throw new StudioFailure(
        TERMINAL_CONTENT,
        `board failed integrity after ${config.maxIntegrityRetries} rebuild(s): ${report.reasons.join('; ')}`,
        { stageId: GATE_STAGE, report },
      );
    }

    // Bounded rebuild: send the collisions back to the board builder, then
    // re-gate. No unbounded self-repair.
    budget.beginStage(BOARD_STAGE);
    budget.check();
    await runAgentStage(ctx, stageById(BOARD_STAGE), { feedback: gateFeedback(report) });
    budget.beginStage(GATE_STAGE);
  }
  /* c8 ignore next */
  throw new Error('unreachable: integrity gate loop fell through');
}

function gateReport(blackboard) {
  const output = blackboard.get(BOARD_STAGE) ?? {};
  const graded = new Set(
    (blackboard.get(RATER_STAGE)?.grades ?? []).map((grade) => grade.setId),
  );
  if (!output.board) {
    return {
      ok: false,
      reasons: [`board builder returned no board: ${output.insufficientSets ?? 'no reason given'}`],
      schema: { ok: false, errors: [] },
    };
  }

  const schema = validatePuzzle(output.board);
  if (!schema.ok) {
    // The game validator reports {path, message}; the gate's reasons are the
    // lines that go back to the board builder, so flatten them here.
    return { ok: false, reasons: schema.errors.map(describe), schema };
  }

  const integrity = checkBoard(output.board);
  const reasons = [];
  if (integrity.duplicateWords.length > 0) {
    reasons.push(`duplicate words: ${integrity.duplicateWords.join(', ')}`);
  }
  if (integrity.acceptedCount !== integrity.expectedAccepted) {
    reasons.push(
      `accepts ${integrity.acceptedCount} ordered tuples, expected exactly ${integrity.expectedAccepted}`,
    );
  }
  for (const collision of integrity.collisions) {
    reasons.push(`${collision.order.join(' : ')} is claimed by ${collision.setIds.join(' and ')}`);
  }

  // The builder may relabel a set's difficulty (promotion) but may not author
  // one. An invented set carries no independent difficulty judgement, which
  // is precisely the signal the review loop exists to sharpen. A rule can
  // enforce this; a prompt can only ask.
  const invented = output.board.sets.map((set) => set.id).filter((id) => !graded.has(id));
  if (graded.size > 0 && invented.length > 0) {
    reasons.push(
      `${invented.join(', ')} ${invented.length === 1 ? 'is' : 'are'} not among the graded candidates — choose from the rated sets and promote one if you need a harder tier, never author a new set`,
    );
  }

  const variety = relationVariety(output.board);
  if (!variety.ok) {
    reasons.push(
      `only ${variety.distinct} distinct relationship label(s) across four sets, need ${MIN_DISTINCT_RELATIONS}: ${variety.labels.join(' | ')}`,
    );
  }

  // `ok` last, and derived from the reasons: `...integrity` carries an `ok` of
  // its own that would otherwise silently win and re-admit the board.
  return { ...integrity, schema, variety, reasons, ok: reasons.length === 0 };
}

// Four sets that all express the same kind of relationship make a board that
// is schema-valid and dull. The prototype crew hit this with an ocean board
// that used two relation types across four sets, and added this gate in
// response (lessons-learned.md section 3.3).
//
// This is the only check here that can fail a board the schema accepts —
// `checkBoard` structurally cannot, since sixteen distinct words make an
// ordered-tuple collision impossible.
const MIN_DISTINCT_RELATIONS = 4;

function relationVariety(board) {
  const labels = board.sets.map((set) => set.relationshipLabel ?? '');
  // Normalized the way the board's own word comparison is: a label repeated
  // with different capitalization is the same relationship, not a new one.
  const distinct = new Set(labels.map((label) => label.trim().toLowerCase().replace(/\s+/g, ' ')));
  return {
    ok: distinct.size >= MIN_DISTINCT_RELATIONS,
    distinct: distinct.size,
    labels,
  };
}

const describe = (error) => `${error.path ? `${error.path}: ` : ''}${error.message}`;

const gateFeedback = (report) =>
  [
    'The board you produced was rejected by the mechanical integrity check. Rebuild it, fixing exactly these problems:',
    ...report.reasons.map((reason) => `- ${reason}`),
    'A board must accept exactly four ordered readings per set and nothing else. If two sets can be regrouped into another valid analogy, choose different sets.',
    `The four sets must also express ${MIN_DISTINCT_RELATIONS} genuinely different relationships. Reusing one relationship across sets is legal and dull; pick sets whose relationships differ in kind, not only in wording.`,
  ].join('\n');

// --- failure ------------------------------------------------------------

function recordFailure(ctx, persistProgress, failure, entryStage, resumed) {
  const { store, runId, attemptId, budget } = ctx;
  const record = {
    category: failure.category,
    message: failure.message,
    stageId: failure.stageId ?? null,
    ...(failure.errors ? { errors: failure.errors } : {}),
    ...(failure.scope ? { scope: failure.scope, metric: failure.metric, cap: failure.cap } : {}),
  };

  store.writeAttemptArtifact(runId, attemptId, 'failure.json', record);
  persistProgress();
  store.completeAttempt(runId, attemptId, { status: 'failed', failureReason: failure.message });
  store.updateStatus(runId, 'failed');
  store.appendDecision(runId, { type: 'attempt-failed', attemptId, ...record });

  return {
    runId,
    attemptId,
    status: 'failed',
    failure: record,
    usage: budget.usage(),
    ...(resumed ? { resumedAt: entryStage } : {}),
  };
}

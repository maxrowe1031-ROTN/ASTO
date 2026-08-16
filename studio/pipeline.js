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
import { isSymmetric, stanceOf, symmetricNote } from './corpus/vocabulary.js';
import { selfMatchingBySet, selfMatchingCount } from './corpus/lexical.js';
import { validatePuzzle } from '../src/source/validate-puzzle.js';
import { checkBoard } from '../src/engine/board-integrity.js';
import { crossPairings, deriveWords } from '../src/engine/arrangements.js';

const FIRST_STAGE = STAGES[0].id;
// A board is four sets, one per difficulty — so four is also the smallest
// candidate pool the builder can possibly build from.
const SETS_PER_BOARD = 4;

const RATER_STAGE = '03-difficulty-rater';
const BOARD_STAGE = '04-board-builder';
const GATE_STAGE = '04a-integrity';

// How each stage's input is assembled from what earlier stages produced. This
// is orchestration knowledge — which output feeds which input — so it lives
// here rather than inside the agents, which stay unaware of each other.
// `revision` reaches the three GENERATIVE stages and no others. The evaluators
// (05–08) are deliberately blind to it: their job is to judge the board in
// front of them, and an evaluator that had read the editor's instructions
// would be marking its own homework — agreeing that the asked-for change was
// made is not the same as finding the board good. See design.md D-11.
//
// Exported (2026-08-16) so tools/run-evaluator.js re-runs an evaluator against
// an archived board through the SAME builders — a second copy of "what does 08
// get asked" is exactly the drift this map exists to prevent.
export const STAGE_INPUTS = {
  '01-pair-author': (board, { manifest, revision }) => ({
    brief: manifest.brief,
    theme: manifest.theme,
    revision,
  }),
  '02-theme-grouper': (board, { revision }) => ({
    pairs: board.get('01-pair-author')?.pairs ?? [],
    revision,
  }),
  // Sets are handed to the rater with their stance made explicit: the kind of
  // question a set asks changes what the player does (design.md D-3), so it is
  // difficulty-relevant context, not decoration the rater should re-derive.
  '03-difficulty-rater': (board) => ({
    sets: (board.get('02-theme-grouper')?.sets ?? []).map((set) => ({
      ...set,
      stance: stanceOf(set.shape) ?? 'unknown',
      // A fact the rater cannot derive from the relationship it is grading:
      // how many of the set's pairs a player can match on sight, without
      // reading the relationship at all (design.md D-12). Difficulty-relevant
      // by construction — a set that assembles itself is easier than the
      // question it asks.
      selfMatchingPairs: selfMatchingCount(set),
    })),
  }),
  // The builder gets the hardest-slot ask as well as the author, because the
  // builder is what actually assigns difficulty 4 (design.md D-13). Steering
  // 01 alone only changes what is available; a pool can still be topped
  // against the ask. Only these two fields travel — the rest of the brief is
  // 01's business.
  [BOARD_STAGE]: (board, { manifest, revision }) => ({
    gradedSets: gradedSets(board),
    hardestStanceAsk: manifest?.brief?.hardestStanceAsk ?? [],
    hardestStanceLean: manifest?.brief?.hardestStanceLean ?? null,
    revision,
  }),
  '05-analogy-validator': (board) => ({ board: boardOf(board) }),
  '06-adversarial-solver': (board) => ({
    board: boardOf(board),
    integrity: board.get(GATE_STAGE) ?? null,
  }),
  '07-test-player': (board, { config }) => ({
    words: deriveWords(boardOf(board)?.sets ?? []),
    maxMistakes: config.maxMistakes ?? 4,
  }),
  // The glossary author defines the board's hardest word, or declines (D-18).
  // It gets the full board — to know which relationships must not leak — and
  // 07's knowledge-gated flags, which are its only candidates.
  '09-glossary-author': (board) => ({
    board: boardOf(board),
    knowledgeGated: board.get('07-test-player')?.knowledgeGated ?? [],
  }),
  '08-style-guide': (board, { manifest }) => {
    const puzzle = boardOf(board);
    return {
      title: puzzle?.title ?? null,
      // The theme Max actually typed, for the evocativeness verdict. The board's
      // own title is the BUILDER's read of the subject, so judging "does this
      // evoke the subject" against it would only ask whether the board agrees
      // with itself.
      theme: manifest?.theme ?? null,
      // The sixteen words, for the unity verdict: 08 judges whether they read
      // as one world, which it cannot do from labels and explanations alone.
      words: puzzle ? deriveWords(puzzle.sets) : [],
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
    const withStance = { ...set, stance: stanceOf(set.shape) ?? 'unknown' };
    return grade
      ? {
          ...withStance,
          difficulty: grade.difficulty,
          abstained: grade.abstained,
          rationale: grade.rationale,
          // Carried through so 04 can compose with WHERE the difficulty comes
          // from, not just how much of it there is. Without this the builder
          // ranks by number alone, and since a rare word reads as a high
          // number, the vocabulary-hard set won every Black (design.md D-8).
          difficultySource: grade.difficultySource,
        }
      : withStance;
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

  const ctx = {
    store,
    runId,
    attemptId,
    llm,
    blackboard,
    budget,
    config,
    context,
    manifest,
    revision: revisionOf(store, runId, attempt),
  };

  // Written after every stage, not only at the end. A process killed mid-run
  // must not lose what it already spent — otherwise each resume would start
  // the attempt's allowance over and the cap would never bite. It also leaves
  // an interrupted attempt with a readable partial blackboard.
  const persistProgress = () => {
    store.writeAttemptArtifact(runId, attemptId, 'blackboard.json', blackboard.snapshot());
    store.recordUsage(runId, attemptId, {
      usage: budget.usage(),
      pricingVersion: config.pricingVersion,
      effortProfile: config.effortProfile,
    });
  };

  if (resumed) store.recordResume(runId, attemptId, { reenteredAt: entryStage });

  try {
    for (const stage of stagesFrom(entryStage)) {
      budget.beginStage(stage.id);
      budget.check();
      if (stage.kind === 'gate') await runIntegrityGate(ctx);
      else await runAgentStage(ctx, stage);
      // The unity gate on revisions (D-17 second amendment, 2026-08-11): a
      // word a revision INTRODUCED that 08 names as a unity outlier fails the
      // attempt. On a fresh board unity stays advisory — Max judges those
      // himself — but a revision was asked to repair a board, and importing
      // "kickoff" onto a boat board (mending nets) is not a repair.
      if (stage.id === '08-style-guide' && ctx.revision?.parentBoard) {
        enforceRevisionUnity(ctx);
      }
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

/**
 * What a revision attempt is revising: the editor's notes, and the parent's
 * finished board.
 *
 * `requestRevision` has written `revision.json` since the beginning; until
 * 2026-08-08 **nothing read it back**, so a revision was a blind re-roll of
 * the theme and Max kept getting an entirely new board when he had asked for
 * one small change. This function is the missing half of that channel. It is
 * the sibling of `replayOutputs` above — that one carries forward what the
 * parent MADE, this one carries forward what the editor SAID about it.
 *
 * Returns null for a fresh attempt or a resume. Degrades rather than throws: a
 * parent that failed before producing a board still lets the notes travel,
 * because the notes are the part that cannot be re-derived.
 */
function revisionOf(store, runId, attempt) {
  if (!attempt.parentAttemptId) return null;

  let revision;
  try {
    revision = store.readAttemptArtifact(runId, attempt.attemptId, 'revision.json');
  } catch {
    return null; // a child attempt that is not a revision has nothing to say
  }

  let parentBoard = null;
  try {
    parentBoard = store.readAttemptArtifact(runId, attempt.parentAttemptId, 'board.json');
  } catch {
    // The parent never finished a board. Less context, not a failure.
  }

  const notes = revision.notes ?? '';
  if (!notes.trim() && !parentBoard) return null;
  return { notes, fromStage: revision.fromStage ?? null, scope: revision.scope ?? null, parentBoard };
}

/**
 * Fail a revision attempt whose NEW words break the theme's world.
 *
 * Deterministic join of two things the attempt already holds: the words the
 * revision introduced (current board minus parent board, case-insensitive) and
 * 08's unity outliers. A word in both is an import the revision was never
 * asked to make. Throws the same terminal failure shape as the integrity gate,
 * so the review card names it loudly and Max can re-request.
 */
function enforceRevisionUnity(ctx) {
  const board = boardOf(ctx.blackboard);
  const parent = ctx.revision?.parentBoard;
  if (!board || !parent) return;

  const parentWords = new Set(deriveWords(parent.sets ?? []).map((word) => word.toLowerCase()));
  const introduced = new Set(
    deriveWords(board.sets ?? [])
      .map((word) => word.toLowerCase())
      .filter((word) => !parentWords.has(word)),
  );
  if (introduced.size === 0) return;

  const outliers = ctx.blackboard.get('08-style-guide')?.unity?.outliers ?? [];
  const breaches = outliers.filter((outlier) => introduced.has(outlier.word?.toLowerCase()));
  if (breaches.length === 0) return;

  throw new StudioFailure(
    TERMINAL_CONTENT,
    `the revision introduced word(s) outside the theme's world: ${breaches
      .map((breach) => `"${breach.word}" (${breach.note ?? 'unity outlier'})`)
      .join('; ')}`,
    { stageId: '08-style-guide', breaches },
  );
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
  const { store, runId, attemptId, llm, blackboard, budget, config, context, manifest, revision } = ctx;
  const agent = loadAgent(stage.agent);
  const input = STAGE_INPUTS[stage.id](blackboard, { manifest, config, revision });
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
    // The stage's own input is handed to the validator, so a check can compare
    // the answer against the question. Without it a validator can only ask
    // whether output is well-formed, never whether it actually addressed what
    // was asked — which is how 06 could return a confident report that had
    // skipped the readings it was handed. Agents that do not need it ignore the
    // second argument; `revision-proposer.js` already used this shape.
    const validation = parsed.ok
      ? agent.validateOutput(parsed.value, { input })
      : parsed.failure;
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

    // What the model managed to say before it died, when it said anything.
    // Named apart from response.txt on purpose: resume must never mistake this
    // for a stage that produced output. Five runs died truncated on 2026-08-08
    // and all five threw their partial answers away, so the one question worth
    // asking — what was it doing with all those tokens? — had no evidence at
    // all. A dead run should at least leave a body.
    if (error.partialText) {
      store.writeStageText(runId, attemptId, stage.id, 'response.truncated.txt', error.partialText);
    }

    store.writeStageArtifact(runId, attemptId, stage.id, 'request.failed.json', {
      stageId: stage.id,
      model: request.model,
      // Two numbers each, because a truncation changes both once: what we
      // configured, and what the last attempt actually went out with.
      maxTokensConfigured: request.maxTokens,
      maxTokens: error.maxTokens ?? request.maxTokens,
      effortConfigured: request.effort ?? null,
      effort: error.effort ?? request.effort ?? null,
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

    // Some rejections cannot be rebuilt out of. Spending the attempts anyway
    // is the blind re-roll the handbook warns about, and it is not cheap:
    // the builder runs at the highest effort setting in the pipeline.
    if (report.fatal) {
      throw new StudioFailure(TERMINAL_CONTENT, report.reasons.join('; '), {
        stageId: GATE_STAGE,
        report,
      });
    }

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

  // Checked before anything else, and marked `fatal` so the caller does not
  // enter its rebuild loop. A board needs four sets and the builder may not
  // invent one, so re-asking it against the same short pool buys the same
  // refusal at the same price — three times over, in the run that prompted
  // this. The failure has to name the pool, not the builder, or it points the
  // reader at the wrong stage entirely.
  if (graded.size > 0 && graded.size < SETS_PER_BOARD) {
    return {
      ok: false,
      fatal: true,
      reasons: [
        `only ${graded.size} graded candidate set(s) reached the builder; a board needs ${SETS_PER_BOARD}, and a rebuild cannot add candidates — the pool was already too small when grouping finished`,
      ],
      schema: { ok: false, errors: [] },
    };
  }
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

  const stances = stanceComposition(output.board, blackboard);
  if (!stances.ok) {
    reasons.push(
      `the four sets ask only ${stances.distinct} kind(s) of question (${stances.summary}); ` +
      `a board needs ${MIN_DISTINCT_STANCES} different stances — swap sets so no kind repeats`,
    );
  }

  const orderFairness = orderIndistinguishability(output.board, blackboard);

  // Which sets can be paired up on sight, without the relationship being read
  // (design.md D-12). Reports only, and for a stronger reason than probation:
  // Max is genuinely torn on whether these sets are bad — *"It seems too easy
  // but maybe that needs testing from other audiences"* — and one of his
  // favourite sets ever carries one. A gate would decide a question he has
  // explicitly left open.
  const lexical = { bySet: selfMatchingBySet(output.board.sets) };

  const spanFairness = spanCrossReadings(output.board, blackboard);

  // `ok` last, and derived from the reasons: `...integrity` carries an `ok` of
  // its own that would otherwise silently win and re-admit the board.
  //
  // `orderFairness`, `lexical` and `spanFairness` are deliberately absent from
  // `reasons` — they report and do not gate (design.md D-9, D-12, D-13), the
  // same probation the cross-reading check served.
  return {
    ...integrity,
    schema,
    variety,
    stances,
    orderFairness,
    lexical,
    spanFairness,
    reasons,
    ok: reasons.length === 0,
  };
}

/**
 * Time-stance sets, with the readings the engine refuses spelled out.
 *
 * The structural finding behind design.md D-13: when a set's four words all lie
 * on ONE timeline — `seed → bud → bloom → wilt` — regrouping them still reads
 * "earlier : later". The cross-reading is a valid analogy, the engine rejects
 * it, and a player who finds it is marked wrong for being right. That is D-7's
 * `second-valid-reading`, and the span stance manufactures it.
 *
 * Deterministic on purpose. 06 was asked this question three times and answered
 * `valid: false` with an empty note on the very set Max caught by hand, so the
 * semantic check is being repaired separately — but a structural risk should
 * not depend on a model noticing it. This cannot go quiet: if the stance is
 * time, the readings are listed, full stop.
 *
 * Reports, never gates. A span set is not a defect — `sunrise : sunset` is a
 * fine set, and Max has approved several. What is a defect is one reaching
 * review UNEXAMINED.
 */
const TIME_STANCE = 'time';

function spanCrossReadings(board, blackboard) {
  const grouped = new Map(
    (blackboard.get('02-theme-grouper')?.sets ?? []).map((set) => [set.id, set]),
  );

  const flagged = (board.sets ?? [])
    .map((set) => {
      const shape = grouped.get(set.id)?.shape ?? null;
      if (stanceOf(shape) !== TIME_STANCE) return null;
      let readings;
      try {
        // `A : B :: C : D`, the form the game and the review card both speak.
        // A flat join reads as one four-term list and hides where the analogy
        // breaks in half.
        readings = crossPairings(set.pairs).map(([a, b, c, d]) => `${a} : ${b} :: ${c} : ${d}`);
      } catch {
        return null; // malformed pairs are the schema check's business, not this one
      }
      return { setId: set.id, shape, difficulty: set.difficulty ?? null, readings };
    })
    .filter(Boolean);

  return {
    // Same honest word as orderFairness: this check cannot fail a board.
    enforced: false,
    flagged,
    count: flagged.length,
  };
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

// Four sets in four different STANCES — kinds of question — is the board
// composition rule from the two blind playtests (design.md D-3): the board
// mixing four stances was "the best puzzle yet"; both single-stance boards
// were rejected as one trick repeated. The stance comes from the grouper's
// declared shape, joined by set id, so the puzzle schema stays untouched.
//
// A known limit, recorded rather than papered over: stance is a per-shape
// proxy for the felt "arrow", and word choice can defeat it — round 1's
// kitchen board declares four stances under this vocabulary yet Max read it
// as one. The gate catches the worst case (a monostance board); the review
// card shows the claimed stances so Max's eye covers the rest.
//
// Enforced only when every set's stance is known. The grouper's enum makes
// that the normal case; a revision replaying an older attempt may not carry
// shapes, and a gate that guessed would reject boards on missing data.
const MIN_DISTINCT_STANCES = 4;

function stanceComposition(board, blackboard) {
  const grouped = new Map(
    (blackboard.get('02-theme-grouper')?.sets ?? []).map((set) => [set.id, set]),
  );
  const bySet = Object.fromEntries(
    board.sets.map((set) => [set.id, stanceOf(grouped.get(set.id)?.shape) ?? null]),
  );
  const known = Object.values(bySet).filter(Boolean);
  const distinct = new Set(known).size;
  const allKnown = known.length === board.sets.length;
  return {
    ok: !allKnown || distinct >= MIN_DISTINCT_STANCES,
    enforced: allKnown,
    distinct,
    bySet,
    summary: board.sets.map((set) => `${set.id}: ${bySet[set.id] ?? 'unknown'}`).join(', '),
  };
}

// Sets whose shape gives the player no way to read the intended orientation
// (design.md D-9). Arithmetic on the taxonomy, not a judgement: the shape comes
// from the grouper's declared `shape`, joined by set id exactly as the stance
// check above does, so the puzzle schema stays untouched.
//
// Why this is the gate stage's business rather than an agent's. 06 already had
// an `ambiguous-order` finding kind and returned nothing on either board where
// every one of Max's four mistakes was an ordering mistake — an open-ended
// search cannot reliably see a structural property. So the structure is
// computed here and handed to 06 as a checklist, which is the same move that
// fixed the cross-reading search.
//
// REPORTS, NEVER GATES. A symmetric shape whose words carry a convention
// (`north : south :: east : west`) is perfectly fair; only 06 can tell those
// apart, and until the flags have been read against real playthroughs a veto
// here would reject good boards on a proxy.
function orderIndistinguishability(board, blackboard) {
  const grouped = new Map(
    (blackboard.get('02-theme-grouper')?.sets ?? []).map((set) => [set.id, set]),
  );

  const flagged = board.sets
    .map((set) => {
      const shape = grouped.get(set.id)?.shape ?? null;
      if (!isSymmetric(shape)) return null;
      return {
        setId: set.id,
        shape,
        kind: 'order-indistinguishable',
        note: symmetricNote(shape),
      };
    })
    .filter(Boolean);

  return {
    // `enforced: false` is the honest word for a check that cannot fail a
    // board. It is here so the review page and any later promotion read the
    // same field the stance check uses, rather than inferring probation.
    enforced: false,
    flagged,
    count: flagged.length,
  };
}

const describe = (error) => `${error.path ? `${error.path}: ` : ''}${error.message}`;

const gateFeedback = (report) =>
  [
    'The board you produced was rejected by the mechanical integrity check. Rebuild it, fixing exactly these problems:',
    ...report.reasons.map((reason) => `- ${reason}`),
    'A board must accept exactly four ordered readings per set and nothing else. If two sets can be regrouped into another valid analogy, choose different sets.',
    `The four sets must also express ${MIN_DISTINCT_RELATIONS} genuinely different relationships. Reusing one relationship across sets is legal and dull; pick sets whose relationships differ in kind, not only in wording.`,
    `And they must ask ${MIN_DISTINCT_STANCES} different kinds of question — each candidate set carries a "stance"; no stance may appear twice on the board.`,
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

// auto-revise — the pre-review fix loop (design.md D-14).
//
// After a run's evaluators complete, if an ALLOWLISTED structural finding
// fired, the Revision Proposer runs once on the machine's findings, its brief
// feeds the existing `requestRevision` machinery, and the revised board is
// what reaches Max — with the whole intervention audited on the review card.
//
// The allowlist is Max's, chosen explicitly (2026-08-09), and it is the whole
// authority this module has:
//
//   06 `cross-set-association` at `high` severity, and the order-ambiguity
//   cluster — v4 cross-reading HOLDS, 04a's symmetric flag when 06 did not
//   clear it, 07's `orderGuessed`.
//
//   `knowledgeGated` is OFF the list — a flag that names a wall without
//   condemning a set (medicine was his best board) must not trigger surgery.
//   Taste NEVER triggers revision. Nothing from 05 or 08 is read at all.
//
// Bounds, all from the design: one auto-revision per run, ever, inside the
// existing revision cap — never in addition to it. If the revision still trips
// the allowlist, the board goes to Max as-is with the findings AND the
// failed-fix diagnosis — never a second loop. And the loop fires only on
// attempts that are not themselves revisions: after a Max-requested revision
// his judgement exists, so the pre-review exception to D-5's authority
// ordering (his reads outrank the machine's) no longer applies.
//
// Shared by both doors on purpose — runner.js (Studio) and run.js (CLI) call
// the same three functions. A rule at one door is the repo's recurring scar,
// paid for three times before this module existed (the 04a count floor, D-11's
// revision channel, D-13's themed-brief steer).
//
// Boundary law: no fs, no fetch. Every read and write goes through run-store;
// the one model call goes through proposeRevision, which owns its own llm.

import { requestRevision } from './pipeline.js';
import { proposeRevision } from './review/proposer.js';
import { briefText } from './review/brief-text.js';
import { DEFAULT_CONFIG } from './pipeline-config.js';

/** The audit artifact the review card reads: findings, brief, and linkage. */
export const autoRevisionFile = (attemptId) => `auto-revision-${attemptId}.json`;

const SOLVER_STAGE = '06-adversarial-solver';
const PLAYER_STAGE = '07-test-player';
const GATE_STAGE = '04a-integrity';

/**
 * The allowlisted findings on one attempt's evaluator reports. Pure.
 *
 * `reports` is stage-id → output, the same shape the review page's
 * machine-notes.js consumes — and the joins here are deliberately the same as
 * its: cross-reading ids resolve via `#`-split, 07's words map to a set only
 * when they all belong to one, and a symmetric flag is quiet when 06's
 * orderReadings marked the set inferable.
 *
 * Returns [{ source, kind, severity, setIds, note }]. `setIds` may name more
 * than one set (a cross-set association is about the pull between sets) or be
 * empty when the words span sets in a way no single set owns.
 */
export function detectFindings({ board, reports = {} } = {}) {
  const findings = [];

  const setIdsByWord = new Map();
  for (const set of board?.sets ?? []) {
    for (const word of (set.pairs ?? []).flat()) setIdsByWord.set(word, set.id);
  }
  const ownersOf = (words) =>
    [...new Set((words ?? []).map((word) => setIdsByWord.get(word)).filter(Boolean))];

  const solver = reports[SOLVER_STAGE];

  // 06 cross-set-association at high. Lower severities stay advisory — the
  // evaluator report shows 06 flags plenty Max keeps.
  for (const finding of solver?.findings ?? []) {
    if (finding.kind !== 'cross-set-association' || finding.severity !== 'high') continue;
    findings.push({
      source: SOLVER_STAGE,
      kind: 'cross-set-association',
      severity: 'high',
      setIds: ownersOf(finding.words),
      note: finding.note ?? '',
    });
  }

  // v4 cross-reading HOLDS: the one defect that makes a board actively unfair
  // — the engine refuses that reading, so a player who finds it is marked
  // wrong for being right.
  for (const reading of solver?.crossReadings ?? []) {
    if (reading.valid !== true) continue;
    const setId = String(reading.id ?? '').split('#')[0];
    if (!setId) continue;
    const relations =
      reading.leftRelation && reading.rightRelation
        ? ` Both halves read as: "${reading.leftRelation}" and "${reading.rightRelation}".`
        : '';
    findings.push({
      source: SOLVER_STAGE,
      kind: 'cross-reading-holds',
      severity: 'high',
      setIds: [setId],
      note: `${reading.note ?? ''}${relations}`.trim(),
    });
  }

  // 04a's symmetric flag, minus the sets 06 cleared — the same join the
  // review card draws before saying "order may be a coin flip".
  const cleared = new Set(
    (solver?.orderReadings ?? []).filter((entry) => entry.inferable).map((entry) => entry.setId),
  );
  for (const flag of reports[GATE_STAGE]?.orderFairness?.flagged ?? []) {
    if (cleared.has(flag.setId)) continue;
    findings.push({
      source: GATE_STAGE,
      kind: 'order-indistinguishable',
      severity: 'high',
      setIds: [flag.setId],
      note: flag.note ?? `this set's relationship reads the same both ways round`,
    });
  }

  // 07 guessed the order. Blind by construction — it names words, never sets —
  // so the mapping happens here; four words spanning sets are not one set's
  // defect and are left to Max.
  for (const guessed of reports[PLAYER_STAGE]?.orderGuessed ?? []) {
    const owners = ownersOf(guessed.words);
    if (owners.length !== 1) continue;
    findings.push({
      source: PLAYER_STAGE,
      kind: 'order-guessed',
      severity: 'medium',
      setIds: owners,
      note: guessed.note ?? '',
    });
  }

  return findings;
}

/**
 * Whether the loop may fire. Pure; returns { ok, reason } so callers can log
 * the refusal without re-deriving it.
 *
 * The order is deliberate: cheapest checks first, and "nothing to fix" before
 * any policy answer, so a quiet board reports `no-findings` rather than
 * whatever switch happens also to be off.
 */
export function shouldAutoRevise({ manifest, decisions = [], findings, attempt, config }) {
  if (!findings || findings.length === 0) return { ok: false, reason: 'no-findings' };
  if (config?.autoRevise === false) return { ok: false, reason: 'config-off' };
  if (manifest?.brief?.autoRevise === false) return { ok: false, reason: 'run-off' };
  // A revision means Max's judgement exists on this run, and machine findings
  // do not outrank it (D-5). The loop is strictly pre-review.
  if (attempt?.parentAttemptId) return { ok: false, reason: 'attempt-is-a-revision' };
  if (decisions.some((event) => event.type === 'auto-revision')) {
    return { ok: false, reason: 'already-auto-revised' };
  }
  if ((manifest?.revisionCount ?? 0) >= (config?.maxRevisions ?? 0)) {
    return { ok: false, reason: 'revision-cap' };
  }
  return { ok: true, reason: null };
}

// The evaluator outputs detection reads, replayed from the store. Absence is
// evidence-less, not fatal — same stance as proposer.buildInput.
function reportsOf(store, runId, attemptId) {
  const reports = {};
  for (const [stageId, filename] of [
    [GATE_STAGE, 'integrity.json'],
    [SOLVER_STAGE, 'output.json'],
    [PLAYER_STAGE, 'output.json'],
  ]) {
    try {
      reports[stageId] = store.readStageArtifact(runId, attemptId, stageId, filename);
    } catch {
      // an interrupted or older attempt may not carry every report
    }
  }
  return reports;
}

const readOptional = (fn) => {
  try {
    return fn();
  } catch {
    return null;
  }
};

/**
 * The whole decision, up to and including opening the child attempt. Called by
 * both doors when an attempt completes. Returns null when the loop does not
 * fire (a proposer failure is recorded as a decision on the way out), or
 * `{ attemptId, parentAttemptId, findings }` with the child attempt created —
 * the CALLER runs it, through whatever launch machinery it already owns.
 *
 * Never throws for expected reasons: a board that cannot be auto-revised is a
 * board that reaches Max as-is, which is exactly what happened before this
 * module existed.
 */
export async function autoReviseIfNeeded({
  store,
  runId,
  attemptId,
  transport,
  context = {},
  config = DEFAULT_CONFIG,
  clock = () => new Date().toISOString(),
}) {
  const manifest = readOptional(() => store.readManifest(runId));
  const attempt = readOptional(() => store.readAttempt(runId, attemptId));
  const board = readOptional(() => store.readAttemptArtifact(runId, attemptId, 'board.json'));
  if (!manifest || !attempt || !board) return null;

  const findings = detectFindings({ board, reports: reportsOf(store, runId, attemptId) });
  const verdict = shouldAutoRevise({
    manifest,
    decisions: store.readDecisions(runId),
    findings,
    attempt,
    config,
  });
  if (!verdict.ok) return null;

  const proposal = await proposeRevision({
    store,
    runId,
    attemptId,
    feedback: [],
    transport,
    context,
    config,
    clock,
    preReview: { findings },
  });

  if (!proposal) {
    // The proposer failed twice and recorded why (its failure artifact carries
    // the rounds and the raw reply). The decision line is what makes the skip
    // visible in the run's history without opening artifacts.
    store.appendDecision(runId, {
      type: 'auto-revision-skipped',
      attemptId,
      reason: 'proposer-failed',
      findings,
      at: clock(),
    });
    return null;
  }

  // The same rendering the review page previews — one brief, one text — with
  // the protection reason told honestly: pre-review, nothing was "approved".
  const notes = briefText(proposal, { protectedReason: 'no allowlisted finding touches them' });

  // Recorded BEFORE the child attempt exists, so a crash between the two
  // leaves a readable trace of what was intended rather than an orphan child.
  store.appendDecision(runId, {
    type: 'auto-revision',
    attemptId,
    fromStage: proposal.fromStage,
    findings,
    at: clock(),
  });

  const childAttemptId = requestRevision(store, runId, {
    fromStage: proposal.fromStage,
    notes,
    scope: null,
    config,
  });

  // The card's evidence, keyed by the CHILD: the attempt Max lands on is the
  // revised one, and the panel answers "why does this attempt exist".
  store.writeRunArtifact(runId, autoRevisionFile(childAttemptId), {
    parentAttemptId: attemptId,
    findings,
    proposal,
    notes,
    at: clock(),
  });

  return { attemptId: childAttemptId, parentAttemptId: attemptId, findings };
}

/**
 * What the auto-revision achieved, recorded once its pipeline run settles.
 *
 * On success: which sets actually changed against the parent board, and
 * whether the allowlist STILL fires on the result — the failed-fix diagnosis
 * D-14 requires on the card in place of a second loop. On failure: a loud
 * decision naming the parent attempt, which still holds a complete, reviewable
 * board (`failed → running` is already a legal resume).
 */
export function recordAutoRevisionOutcome({
  store,
  runId,
  auto,
  result,
  clock = () => new Date().toISOString(),
}) {
  if (result?.status !== 'complete') {
    store.appendDecision(runId, {
      type: 'auto-revision-failed',
      attemptId: auto.attemptId,
      parentAttemptId: auto.parentAttemptId,
      reason: result?.failure?.message ?? 'the revision attempt did not complete',
      at: clock(),
    });
    return;
  }

  const board = readOptional(() => store.readAttemptArtifact(runId, auto.attemptId, 'board.json'));
  const parentBoard = readOptional(() =>
    store.readAttemptArtifact(runId, auto.parentAttemptId, 'board.json'),
  );

  // A set "changed" when its pairs did — id-joined, order-sensitive, because
  // order is the game. A set present on one board only counts as changed too.
  const pairsById = (b) =>
    new Map((b?.sets ?? []).map((set) => [set.id, JSON.stringify(set.pairs ?? [])]));
  const before = pairsById(parentBoard);
  const after = pairsById(board);
  const changedSetIds = [...new Set([...before.keys(), ...after.keys()])].filter(
    (id) => before.get(id) !== after.get(id),
  );

  const persisted = board
    ? detectFindings({ board, reports: reportsOf(store, runId, auto.attemptId) })
    : [];

  store.appendDecision(runId, {
    type: 'auto-revision-outcome',
    attemptId: auto.attemptId,
    parentAttemptId: auto.parentAttemptId,
    status: 'complete',
    changedSetIds,
    // Non-empty means the fix failed: the board goes to Max as-is with the
    // findings and this diagnosis on the card — never a second loop.
    persisted,
    at: clock(),
  });
}

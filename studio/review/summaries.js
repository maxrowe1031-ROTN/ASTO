// summaries.js — one run, one row (D-35).
//
// The Desk queue, the Runs table and the batch panel all read the same summary
// shape, so it is derived in exactly one place, from the artifacts the store
// already keeps: the manifest, the current attempt (cost, stage statuses), the
// feedback and decision ledgers (your read, the publish), and four evaluator
// outputs (the machine's read). Pure: no fs, no clock — api.js gathers, this
// file shapes. Every reading is nullable, because a run can be missing any of
// them and the list must never blank on one bad directory.

import { dateKeyFor } from '../../src/source/release.js';
import { STAGES } from '../stage-registry.js';

const BOARD_VERDICTS = new Set(['approve-board', 'revise-board', 'reject-board']);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-08-19' → '19 Aug'. */
const dayLabel = (dateKey) => {
  const [, month, day] = dateKey.split('-').map(Number);
  return `${day} ${MONTHS[month - 1]}`;
};

/**
 * Which batch a run belongs to. A batched run says so on its brief (additive
 * fields, written by POST /api/batches); everything before batches existed
 * groups under its creation day in the game's one timezone — the same day
 * the calendar keeps — so the UI never has to reason about the fallback.
 */
export function batchOf(manifest) {
  const brief = manifest.brief ?? {};
  if (typeof brief.batchId === 'string' && brief.batchId.length > 0) {
    const label =
      typeof brief.batchLabel === 'string' && brief.batchLabel.length > 0
        ? brief.batchLabel
        : `Batch · ${dayLabel(dateKeyFor(new Date(brief.batchId.replace(/-(\d{2})-(\d{2})\.(\d{3})Z$/, ':$1:$2.$3Z'))))}`;
    return { id: brief.batchId, label };
  }
  const day = dateKeyFor(new Date(manifest.createdAt));
  return { id: `date:${day}`, label: `Unbatched · ${dayLabel(day)}` };
}

/**
 * Cost and duration are the attempt's cumulative RUN usage — a revised run's
 * second attempt carries the first's spend too, which is what "what did this
 * board cost" means.
 */
export function costOf(attempt) {
  const run = attempt?.usage?.run;
  return {
    costUsd: typeof run?.costUsd === 'number' ? run.costUsd : null,
    durationMs: typeof run?.ms === 'number' ? run.ms : null,
  };
}

/**
 * Max's newest board-level word on the current attempt. The ledger is
 * append-only, so the last matching row is the latest. `boardVerdict` is the
 * newest event whose action IS a board verdict; `taste` the newest taste said.
 */
export function latestBoardRead(feedback, attemptId) {
  const rows = (feedback ?? []).filter(
    (event) => event.attemptId === attemptId && event.scope?.type === 'board',
  );
  if (rows.length === 0) return null;
  const verdictRow = [...rows].reverse().find((event) => BOARD_VERDICTS.has(event.action));
  const tasteRow = [...rows].reverse().find((event) => typeof event.taste === 'string');
  return { boardVerdict: verdictRow?.action ?? null, taste: tasteRow?.taste ?? null };
}

/** The last publish decision, or null. `date` arrives only on records written since D-35. */
export function lastPublish(decisions) {
  const row = [...(decisions ?? [])].reverse().find((event) => event.type === 'publish');
  if (!row) return null;
  return {
    publishedAs: row.publishedAs ?? null,
    publishedId: row.publishedId ?? null,
    at: row.at ?? null,
    date: typeof row.date === 'string' ? row.date : null,
  };
}

/**
 * The machine's read in four chips. Only the evaluators whose output exists
 * contribute; a run that never reached them reads null for that chip, and a
 * run with none of them reads null altogether.
 */
export function machineChips(reports) {
  if (!reports) return null;
  const validator = reports['05-analogy-validator'];
  const solver = reports['06-adversarial-solver'];
  const player = reports['07-test-player'];
  const style = reports['08-style-guide'];
  if (!validator && !solver && !player && !style) return null;

  const verdicts = validator?.verdicts ?? [];
  const holds = (solver?.crossReadings ?? []).some((reading) => reading.valid === true);
  return {
    validator: validator ? { clear: verdicts.filter((v) => v.pass !== false).length, total: verdicts.length } : null,
    solver: solver ? (holds || (solver.findings ?? []).length > 0 ? 'flag' : 'clear') : null,
    testPlayer: player ? { gated: (player.knowledgeGated ?? []).length } : null,
    unity: style ? (style.unity?.verdict ?? null) : null,
  };
}

/**
 * The stage a running attempt is on: the first stage in pipeline order with no
 * terminal status. The store records a stage only once it finishes, so this is
 * an inference, and it is the only one available (design.md D-35).
 */
export function currentStageOf(stageStatuses) {
  const done = stageStatuses ?? {};
  return STAGES.find((stage) => done[stage.id] === undefined)?.id ?? null;
}

export function summarizeRun({ manifest, attempt, feedback, decisions, reports, inProcess, reviewableAttemptId }) {
  const brief = manifest.brief ?? {};
  const live = Boolean(inProcess?.running || inProcess?.queued);
  const row = {
    runId: manifest.runId,
    status: manifest.status,
    theme: manifest.theme,
    createdAt: manifest.createdAt,
    currentAttemptId: manifest.currentAttemptId,
    attemptCount: manifest.attemptCount,
    revisionCount: manifest.revisionCount,
    reviewableAttemptId: reviewableAttemptId ?? null,
    ...costOf(attempt),
    mock: brief.mock === true,
    autoRevise: brief.autoRevise !== false,
    subjectRegister: typeof brief.subjectRegister === 'string' ? brief.subjectRegister : null,
    subjectStyle: typeof brief.subjectStyle === 'string' ? brief.subjectStyle : null,
    batch: batchOf(manifest),
    yourRead: latestBoardRead(feedback, manifest.currentAttemptId),
    published: lastPublish(decisions),
    machine: machineChips(reports),
    inProcess: inProcess ? { ...inProcess, ...(live ? { currentStage: currentStageOf(attempt?.stageStatuses) } : {}) } : null,
  };
  if (live) row.stageStatuses = attempt?.stageStatuses ?? {};
  return row;
}

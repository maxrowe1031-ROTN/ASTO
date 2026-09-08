// rollups.js — the Desk's arithmetic over the run list (D-35).
//
// Counts, groups, sums and one estimate, all computed from the rows
// GET /api/runs already serves. Nothing here is a domain rule: which runs
// are publishable, what a status means, what a slug becomes — the server
// decides those and this file only adds them up. Pure, tested under node.

const IN_FLIGHT = new Set(['created', 'running', 'revising', 'revision-requested']);
const isVerify = (run) => run.mock === true || /Z-verify-/.test(run.runId);

/**
 * Runs the server is actually working on right now — live runner state, not
 * the manifest's status. A manifest can say `running` forever after a crash
 * or a killed server; the process either holds the run or it does not.
 */
export const inFlight = (runs) => runs.filter((run) => run.inProcess?.running || run.inProcess?.queued);

/** Every board waiting for Max's read, oldest first — a board waits until he decides. */
export function queueOrder(runs) {
  return runs
    .filter((run) => run.status === 'awaiting-review' || run.reviewableAttemptId)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

const FILTERS = {
  all: (run) => run.status !== 'archived',
  awaiting: (run) => run.status === 'awaiting-review',
  running: (run) => IN_FLIGHT.has(run.status),
  approved: (run) => run.status === 'approved',
  published: (run) => run.status === 'approved' && run.published !== null,
  rejected: (run) => run.status === 'rejected',
  failed: (run) => run.status === 'failed',
  mockVerify: (run) => run.status !== 'archived' && isVerify(run),
  archived: (run) => run.status === 'archived',
};

export const FILTER_KEYS = Object.keys(FILTERS);

export function applyFilter(runs, filter) {
  return runs.filter(FILTERS[filter] ?? FILTERS.all);
}

export function filterCounts(runs) {
  return Object.fromEntries(FILTER_KEYS.map((key) => [key, runs.filter(FILTERS[key]).length]));
}

const emptyTotals = () => ({ count: 0, approved: 0, rejected: 0, failed: 0, awaiting: 0, costUsd: 0 });

const round = (usd) => Math.round(usd * 100) / 100;

/** A group's yield and spend — the batch header row. */
export function batchTotals(runs) {
  const totals = emptyTotals();
  for (const run of runs) {
    totals.count += 1;
    if (run.status === 'approved') totals.approved += 1;
    if (run.status === 'rejected') totals.rejected += 1;
    if (run.status === 'failed') totals.failed += 1;
    if (run.status === 'awaiting-review') totals.awaiting += 1;
    if (typeof run.costUsd === 'number') totals.costUsd += run.costUsd;
  }
  totals.costUsd = round(totals.costUsd);
  return totals;
}

const keyFor = {
  batch: (run) => [run.batch.id, run.batch.label],
  date: (run) => [run.createdAt.slice(0, 10), run.createdAt.slice(0, 10)],
  status: (run) => [run.status, run.status],
};

/**
 * Runs in groups, newest group first, list order kept inside each group. The
 * list arrives newest-first, so the first run seen in a group is its newest.
 */
export function groupRuns(runs, by = 'batch') {
  const pick = keyFor[by] ?? keyFor.batch;
  const groups = new Map();
  for (const run of runs) {
    const [key, label] = pick(run);
    if (!groups.has(key)) groups.set(key, { key, label, runs: [], newest: run.createdAt });
    const group = groups.get(key);
    group.runs.push(run);
    if (run.createdAt > group.newest) group.newest = run.createdAt;
  }
  return [...groups.values()]
    .sort((a, b) => (a.newest === b.newest ? 0 : a.newest < b.newest ? 1 : -1))
    .map(({ key, label, runs: members }) => ({ key, label, runs: members, totals: batchTotals(members) }));
}

/** Real spend only — a mock run's zero is not spend, and a missing cost is not zero. */
export function spend(runs, todayKey) {
  const weekAgo = new Date(Date.UTC(...todayKey.split('-').map((n, i) => Number(n) - (i === 1 ? 1 : 0))) - 6 * 86400000)
    .toISOString()
    .slice(0, 10);
  let week = 0;
  let allTime = 0;
  for (const run of runs) {
    if (run.mock || typeof run.costUsd !== 'number') continue;
    allTime += run.costUsd;
    if (run.createdAt.slice(0, 10) >= weekAgo) week += run.costUsd;
  }
  return { week: round(week), allTime: round(allTime) };
}

const ESTIMATE_BASIS = 20;

/**
 * What N runs will probably cost: the mean of the twenty newest real runs
 * with a recorded cost, ±20%. Labelled as an estimate wherever it is shown —
 * the pipeline's caps are ceilings, not predictions.
 */
export function estimateCost(runs, count, { mock = false } = {}) {
  if (mock) return { low: 0, high: 0, perRun: 0, basis: 0 };
  const costs = runs
    .filter((run) => !run.mock && typeof run.costUsd === 'number')
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, ESTIMATE_BASIS)
    .map((run) => run.costUsd);
  if (costs.length === 0) return null;
  const perRun = costs.reduce((sum, c) => sum + c, 0) / costs.length;
  return {
    low: round(perRun * 0.8 * count),
    high: round(perRun * 1.2 * count),
    perRun: round(perRun),
    basis: costs.length,
  };
}

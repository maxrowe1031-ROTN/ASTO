// The Desk's arithmetic over the run list (D-35). Pure, and deliberately not a
// domain rule anywhere: counts, groups, sums and an estimate labelled as one.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyFilter,
  inFlight,
  estimateCost,
  filterCounts,
  groupRuns,
  queueOrder,
  spend,
} from '../../../studio/review/ui/rollups.js';

const run = (over = {}) => ({
  runId: `2026-08-19T16-00-00.000Z-${over.slug ?? 'x'}`,
  status: 'approved',
  theme: 'x',
  createdAt: '2026-08-19T16:00:00.000Z',
  currentAttemptId: '0001',
  attemptCount: 1,
  revisionCount: 0,
  reviewableAttemptId: null,
  costUsd: 0.5,
  durationMs: 1000,
  mock: false,
  autoRevise: true,
  subjectRegister: null,
  subjectStyle: null,
  batch: { id: 'date:2026-08-19', label: 'Unbatched · 19 Aug' },
  yourRead: null,
  published: null,
  machine: null,
  inProcess: null,
  ...over,
});

test('the queue is every board waiting for a read, oldest first, failed-but-reviewable included', () => {
  const runs = [
    run({ slug: 'c', status: 'awaiting-review', createdAt: '2026-08-19T16:00:00.000Z' }),
    run({ slug: 'a', status: 'awaiting-review', createdAt: '2026-08-11T16:00:00.000Z' }),
    run({ slug: 'f', status: 'failed', reviewableAttemptId: '0001', createdAt: '2026-08-15T16:00:00.000Z' }),
    run({ slug: 'r', status: 'rejected' }),
    run({ slug: 'g', status: 'failed' }),
  ];
  assert.deepEqual(queueOrder(runs).map((r) => r.theme ?? r.runId.split('-').at(-1)), ['x', 'x', 'x']);
  assert.deepEqual(queueOrder(runs).map((r) => r.runId.split('Z-')[1]), ['a', 'f', 'c']);
});

test('filter counts partition the corpus the way the chips read', () => {
  const runs = [
    run({ status: 'awaiting-review' }),
    run({ status: 'running' }),
    run({ status: 'revising' }),
    run({ status: 'approved' }),
    run({ status: 'approved', published: { publishedAs: 'a.json', date: '2026-09-19' } }),
    run({ status: 'rejected' }),
    run({ status: 'failed' }),
    run({ status: 'approved', mock: true }),
    run({ status: 'rejected', slug: 'verify-form', runId: '2026-08-05T10-00-00.000Z-verify-form' }),
    run({ status: 'archived' }),
  ];
  assert.deepEqual(filterCounts(runs), {
    all: 9, // archived is out of the default corpus
    awaiting: 1,
    running: 2,
    approved: 3, // includes the published one and the mock one
    published: 1,
    rejected: 2,
    failed: 1,
    mockVerify: 2,
    archived: 1,
  });
  assert.equal(applyFilter(runs, 'all').length, 9);
  assert.equal(applyFilter(runs, 'published').length, 1);
  assert.equal(applyFilter(runs, 'mockVerify').length, 2);
  assert.equal(applyFilter(runs, 'archived').length, 1);
  assert.equal(applyFilter(runs, 'running').length, 2);
});

test('grouping by batch keeps newest batch first and totals each one', () => {
  const runs = [
    run({ slug: 'a', batch: { id: 'date:2026-08-18', label: 'Unbatched · 18 Aug' }, createdAt: '2026-08-18T16:00:00.000Z', status: 'approved', costUsd: 0.7 }),
    run({ slug: 'b', batch: { id: 'date:2026-08-19', label: 'Unbatched · 19 Aug' }, status: 'rejected', costUsd: 0.5 }),
    run({ slug: 'c', batch: { id: 'date:2026-08-19', label: 'Unbatched · 19 Aug' }, status: 'failed', costUsd: 0.8 }),
    run({ slug: 'd', batch: { id: 'date:2026-08-19', label: 'Unbatched · 19 Aug' }, status: 'awaiting-review', costUsd: null }),
  ];
  const groups = groupRuns(runs, 'batch');
  assert.deepEqual(groups.map((g) => g.label), ['Unbatched · 19 Aug', 'Unbatched · 18 Aug']);
  assert.deepEqual(groups[0].totals, { count: 3, approved: 0, rejected: 1, failed: 1, awaiting: 1, costUsd: 1.3 });
  assert.deepEqual(groups[1].totals, { count: 1, approved: 1, rejected: 0, failed: 0, awaiting: 0, costUsd: 0.7 });
  assert.equal(groups[0].runs[0].runId.endsWith('-b'), true, 'runs inside a group keep list order');
});

test('grouping by status uses the status as the label; by date uses the creation day', () => {
  const runs = [run({ status: 'approved' }), run({ status: 'rejected' }), run({ status: 'approved' })];
  assert.deepEqual(groupRuns(runs, 'status').map((g) => [g.label, g.totals.count]), [['approved', 2], ['rejected', 1]]);
  assert.deepEqual(groupRuns(runs, 'date').map((g) => g.label), ['2026-08-19']);
});

test('spend sums real runs only, this week and all time', () => {
  const runs = [
    run({ createdAt: '2026-09-07T10:00:00.000Z', costUsd: 0.6 }),
    run({ createdAt: '2026-08-19T10:00:00.000Z', costUsd: 0.5 }),
    run({ createdAt: '2026-09-08T10:00:00.000Z', costUsd: 0.4, mock: true }),
    run({ createdAt: '2026-09-08T10:00:00.000Z', costUsd: null }),
  ];
  assert.deepEqual(spend(runs, '2026-09-08'), { week: 0.6, allTime: 1.1 });
});

test('the estimate is a labelled mean of recent real runs, zero for mock, null with no history', () => {
  const runs = [
    run({ createdAt: '2026-08-19T10:00:00.000Z', costUsd: 0.5 }),
    run({ createdAt: '2026-08-18T10:00:00.000Z', costUsd: 0.7 }),
    run({ createdAt: '2026-08-17T10:00:00.000Z', costUsd: null }),
    run({ createdAt: '2026-08-16T10:00:00.000Z', costUsd: 9, mock: true }),
  ];
  assert.deepEqual(estimateCost(runs, 6), { low: 2.88, high: 4.32, perRun: 0.6, basis: 2 });
  assert.deepEqual(estimateCost(runs, 6, { mock: true }), { low: 0, high: 0, perRun: 0, basis: 0 });
  assert.equal(estimateCost([], 6), null);
});

test('the estimate reads at most the twenty newest real runs', () => {
  const runs = Array.from({ length: 30 }, (_, i) =>
    run({ createdAt: `2026-08-${String(31 - i).padStart(2, '0')}T10:00:00.000Z`, costUsd: i < 20 ? 1 : 100 }),
  );
  assert.equal(estimateCost(runs, 1).perRun, 1);
  assert.equal(estimateCost(runs, 1).basis, 20);
});

test('in flight means the process holds the run, not what the manifest says', () => {
  const runs = [
    run({ status: 'running', inProcess: { running: true } }),
    run({ status: 'created', inProcess: { running: false, queued: true } }),
    run({ status: 'running', inProcess: null }),
    run({ status: 'running', inProcess: { running: false, status: 'crashed' } }),
  ];
  assert.equal(inFlight(runs).length, 2);
});

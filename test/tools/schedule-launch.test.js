// The launch plan, tested pure — the writes go through puzzle-store.reschedule,
// which has its own tests. What matters here is that the PLAN is right, because
// the plan is what Max reads before saying --commit.

import test from 'node:test';
import assert from 'node:assert/strict';

import { planLaunch, shiftDay } from '../../tools/schedule-launch.js';

const listed = (slugs) => slugs.map((slug) => ({ slug }));
const anyExists = () => true;

test('shiftDay walks backward across month and year lines', () => {
  assert.equal(shiftDay('2026-09-01', -1), '2026-08-31');
  assert.equal(shiftDay('2027-01-01', -1), '2026-12-31');
  assert.equal(shiftDay('2026-09-01', -29), '2026-08-03');
});

test('the last kept board lands on launch day; the rest walk backward one per day', () => {
  const plan = planLaunch(['a', 'b', 'c'], '2026-09-01', listed(['a', 'b', 'c']), anyExists);
  assert.deepEqual(plan.assignments, [
    { slug: 'a', date: '2026-08-30' },
    { slug: 'b', date: '2026-08-31' },
    { slug: 'c', date: '2026-09-01' },
  ]);
  assert.deepEqual(plan.cuts, []);
});

test('every listed board not kept is a cut', () => {
  const plan = planLaunch(['b'], '2026-09-01', listed(['a', 'b', 'c']), anyExists);
  assert.deepEqual(plan.cuts, ['a', 'c']);
});

test('a keep slug with no board file is an error, and errors mean no plan', () => {
  const plan = planLaunch(['a', 'ghost'], '2026-09-01', listed(['a']), (slug) => slug === 'a');
  assert.equal(plan.errors.length, 1);
  assert.deepEqual(plan.assignments, []);
});

test('a duplicate in the keep list is an error — one board, one day', () => {
  const plan = planLaunch(['a', 'a'], '2026-09-01', listed(['a']), anyExists);
  assert.match(plan.errors[0], /twice/);
});

test('a malformed launch date is refused before any math happens', () => {
  const plan = planLaunch(['a'], 'next tuesday', listed(['a']), anyExists);
  assert.equal(plan.errors.length, 1);
});

// The schedule analysis lives in studio/schedule.js so the Studio's server and
// the check-schedule CLI read the same arithmetic. The CLI's own test keeps
// covering render(); this pins the move.

import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeSchedule } from '../../studio/schedule.js';
import { analyzeSchedule as fromTool } from '../../tools/check-schedule.js';

test('the CLI re-exports the studio module\'s analysis, not a copy', () => {
  assert.equal(fromTool, analyzeSchedule);
});

test('entries come back sorted by date so a panel can list them in order', () => {
  const report = analyzeSchedule(
    [{ slug: 'b', date: '2026-09-10' }, { slug: 'a', date: '2026-09-09' }],
    [],
    '2026-09-09',
  );
  assert.deepEqual(report.entries.map((e) => e.slug), ['a', 'b']);
});

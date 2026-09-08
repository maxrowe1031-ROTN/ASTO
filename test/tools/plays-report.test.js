import test from 'node:test';
import assert from 'node:assert/strict';

import { renderReport } from '../../tools/plays-report.js';
import { summarizePlays } from '../../studio/plays-summary.js';

const TODAY = '2026-09-08';
const C1 = '11111111-1111-4111-8111-111111111111';
const row = (date, event, client, over = {}) => ({
  created_at: `${date}T15:00:00.000Z`, puzzle_slug: 'first-light', event, client_id: client, ...over
});

test('an empty table says so, in one line', () => {
  const text = renderReport(summarizePlays([], { today: TODAY }));
  assert.match(text, /No plays recorded yet/);
  assert.equal(text.trim().split('\n').length, 1);
});

test('the report carries the totals, fourteen day rows, and the boards', () => {
  const rows = [row(TODAY, 'start', C1), row(TODAY, 'finish', C1, { won: true }), row('2026-09-06', 'start', C1)];
  const text = renderReport(summarizePlays(rows, { today: TODAY }));
  assert.match(text, /Plays: 2 started · 1 finished · 50% completion/);
  assert.match(text, /Players: 1 browsers seen · 1 came back on another day/);
  assert.equal(text.split('\n').filter((l) => /^  2026-\d\d-\d\d /.test(l)).length, 14);
  assert.match(text, /first-light\s+2\s+1\s+1/);
});

// The plays summary is pure: rows in, readings out. The network lives in
// player-ratings.js; the words live in tools/plays-report.js. This is the arithmetic.

import test from 'node:test';
import assert from 'node:assert/strict';

import { summarizePlays } from '../../studio/plays-summary.js';

const TODAY = '2026-09-08';
const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';
const C3 = '33333333-3333-4333-8333-333333333333';

const row = (date, event, client, over = {}) => ({
  created_at: `${date}T15:00:00.000Z`,
  puzzle_slug: 'first-light',
  event,
  client_id: client,
  ...over
});

test('an empty table reads as zeros, with fourteen empty days', () => {
  const summary = summarizePlays([], { today: TODAY });
  assert.equal(summary.days.length, 14);
  assert.equal(summary.days[0].date, '2026-08-26');
  assert.equal(summary.days[13].date, TODAY);
  assert.deepEqual(summary.totals, {
    starts: 0, finishes: 0, completionRate: null, clients: 0, returningClients: 0
  });
  assert.deepEqual(summary.boards, []);
});

test('starts and finishes are counted per day, in the game\'s own day key', () => {
  const rows = [
    row('2026-09-08', 'start', C1),
    row('2026-09-08', 'finish', C1, { won: true }),
    row('2026-09-08', 'start', C2),
    row('2026-09-07', 'start', C1)
  ];
  const { days } = summarizePlays(rows, { today: TODAY });
  const today = days.find((d) => d.date === TODAY);
  const yesterday = days.find((d) => d.date === '2026-09-07');
  assert.deepEqual(today, { date: TODAY, starts: 2, finishes: 1, completionRate: 0.5 });
  assert.deepEqual(yesterday, { date: '2026-09-07', starts: 1, finishes: 0, completionRate: 0 });
});

test('completion rate is finishes over starts, and null when nothing started', () => {
  const rows = [row(TODAY, 'start', C1), row(TODAY, 'finish', C1), row(TODAY, 'finish', C1)];
  const { totals, days } = summarizePlays(rows, { today: TODAY });
  // Two finishes on one start (a reload onto the end screen) is capped at 1 — it is a
  // rate, not a ratio that can exceed the whole.
  assert.equal(totals.completionRate, 1);
  assert.equal(days.find((d) => d.date === '2026-09-07').completionRate, null);
});

test('rows older than the window still count in the totals and the boards', () => {
  const rows = [row('2026-06-01', 'start', C1), row('2026-06-01', 'finish', C1), row(TODAY, 'start', C2)];
  const summary = summarizePlays(rows, { today: TODAY });
  assert.equal(summary.totals.starts, 2);
  assert.equal(summary.totals.finishes, 1);
  assert.equal(summary.days.reduce((n, d) => n + d.starts, 0), 1);
});

test('returning clients are those seen on two or more distinct days', () => {
  const rows = [
    row('2026-09-06', 'start', C1),
    row('2026-09-08', 'start', C1), // back two days later: returning
    row('2026-09-08', 'start', C2),
    row('2026-09-08', 'finish', C2), // twice in one day: not returning
    row('2026-09-08', 'start', null) // a browser with no id counts as a play, not a client
  ];
  const { totals } = summarizePlays(rows, { today: TODAY });
  assert.equal(totals.starts, 4);
  assert.equal(totals.clients, 2);
  assert.equal(totals.returningClients, 1);
});

test('boards are listed by starts, most played first, with their finishes', () => {
  const rows = [
    row(TODAY, 'start', C1, { puzzle_slug: 'quiet' }),
    row(TODAY, 'start', C1, { puzzle_slug: 'busy' }),
    row(TODAY, 'start', C2, { puzzle_slug: 'busy' }),
    row(TODAY, 'finish', C2, { puzzle_slug: 'busy', won: false })
  ];
  const { boards } = summarizePlays(rows, { today: TODAY });
  assert.deepEqual(boards, [
    { slug: 'busy', starts: 2, finishes: 1, wins: 0 },
    { slug: 'quiet', starts: 1, finishes: 0, wins: 0 }
  ]);
});

test('a day key is taken in the game\'s timezone, not UTC', () => {
  // 03:30Z on the 9th is still the evening of the 8th in America/Denver (D-24's one clock).
  const rows = [{ created_at: '2026-09-09T03:30:00.000Z', puzzle_slug: 'x', event: 'start', client_id: C3 }];
  const { days } = summarizePlays(rows, { today: TODAY });
  assert.equal(days.find((d) => d.date === TODAY).starts, 1);
});

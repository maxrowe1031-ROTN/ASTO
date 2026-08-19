// Moving a month of boards into the publishing queue (2026-08-19, Max's call:
// "take all of the puzzles currently in july and backlog them... the calendar
// will start with August 1").
//
// The planner is pure, so every case here is headless. The load-bearing ones
// are that no board is lost or doubled, that no assigned date collides with a
// board already scheduled, and that a seed replays exactly — a shuffle Max
// dislikes must be re-rollable, and one he likes must be reproducible.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { planForward } from '../../tools/reschedule-forward.js';

const entry = (date, slug = `board-${date}`, title = `Title ${date}`) => ({ slug, id: `asto-${slug}`, title, date });

// 5 July boards + 2 August boards that must not move.
const CATALOGUE = [
  entry('2026-07-03', 'warm-up', 'Warm Up'),
  entry('2026-07-04', 'bedside-manor', 'Bedside Manor'),
  entry('2026-07-05', 'by-the-shore', 'By the Shore'),
  entry('2026-07-06', 'for-the-birds', 'For the Birds'),
  entry('2026-07-07', 'mail-call', 'Mail Call'),
  entry('2026-08-18', 'from-farm-to-market', 'From Farm to Market'),
  entry('2026-08-19', 'ships-museums', 'Ships, Museums, and the Sea'),
];

const plan = (over = {}) =>
  planForward({ entries: CATALOGUE, fromMonth: '2026-07', startDate: '2026-08-20', seed: 7, ...over });

test('every board in the source month is moved exactly once', () => {
  const { assignments, errors } = plan();
  assert.deepEqual(errors, []);
  assert.equal(assignments.length, 5);

  const slugs = assignments.map((a) => a.slug).sort();
  assert.deepEqual(slugs, ['bedside-manor', 'by-the-shore', 'for-the-birds', 'mail-call', 'warm-up']);
});

test('dates are consecutive from the start date, one board per day', () => {
  const { assignments } = plan();
  const dates = assignments.map((a) => a.date);
  assert.deepEqual(dates, ['2026-08-20', '2026-08-21', '2026-08-22', '2026-08-23', '2026-08-24']);
  assert.equal(new Set(dates).size, dates.length, 'a date was used twice');
});

test('boards outside the source month are left alone', () => {
  const { assignments } = plan();
  const moved = new Set(assignments.map((a) => a.slug));
  assert.ok(!moved.has('from-farm-to-market'), "August's boards must not move");
  assert.ok(!moved.has('ships-museums'), "today's board must not move");
});

test('a seed replays exactly, and a different seed reorders', () => {
  const a = plan().assignments.map((x) => x.slug);
  const b = plan().assignments.map((x) => x.slug);
  assert.deepEqual(a, b, 'same seed must reproduce the order');

  const c = plan({ seed: 99 }).assignments.map((x) => x.slug);
  assert.notDeepEqual(a, c, 'a different seed should reshuffle');
});

test('the order is shuffled, not the calendar order it came in', () => {
  const chronological = ['warm-up', 'bedside-manor', 'by-the-shore', 'for-the-birds', 'mail-call'];
  const shuffled = plan().assignments.map((x) => x.slug);
  assert.notDeepEqual(shuffled, chronological);
});

test('a target date already occupied refuses the whole plan', () => {
  // Something is already scheduled on the third day of the run.
  const withClash = [...CATALOGUE, entry('2026-08-22', 'already-there', 'Already There')];
  const { errors, assignments } = planForward({
    entries: withClash,
    fromMonth: '2026-07',
    startDate: '2026-08-20',
    seed: 7,
  });
  assert.equal(assignments.length, 0, 'a refused plan must assign nothing');
  assert.match(errors.join(' '), /2026-08-22/);
  assert.match(errors.join(' '), /already-there/);
});

test('an empty source month is an error, not a silent no-op', () => {
  const { errors } = planForward({ entries: CATALOGUE, fromMonth: '2026-05', startDate: '2026-08-20', seed: 7 });
  assert.match(errors.join(' '), /2026-05/);
});

test('a malformed month or start date is refused before any planning', () => {
  assert.match(
    planForward({ entries: CATALOGUE, fromMonth: 'july', startDate: '2026-08-20', seed: 7 }).errors.join(' '),
    /month/i,
  );
  assert.match(
    planForward({ entries: CATALOGUE, fromMonth: '2026-07', startDate: 'tomorrow', seed: 7 }).errors.join(' '),
    /date/i,
  );
});

test('the spread pass separates boards whose titles share a word', () => {
  // Four "Tools" boards among eight: a raw shuffle can easily adjacent-pair them.
  const clashy = [
    entry('2026-07-01', 'a', 'Tools of the Trade'),
    entry('2026-07-02', 'b', 'Maps, Tools, and Directions'),
    entry('2026-07-03', 'c', 'Trees, Tools, and Time'),
    entry('2026-07-04', 'd', "The Locksmith's Trade"),
    entry('2026-07-05', 'e', 'River Systems'),
    entry('2026-07-06', 'f', 'School Days'),
    entry('2026-07-07', 'g', 'In the Garden'),
    entry('2026-07-08', 'h', 'Money Matters'),
  ];
  const titleOf = new Map(clashy.map((c) => [c.slug, c.title]));
  const { assignments } = planForward({ entries: clashy, fromMonth: '2026-07', startDate: '2026-09-01', seed: 3 });

  const words = (t) => new Set(t.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w.length >= 4));
  let adjacentClashes = 0;
  for (let i = 1; i < assignments.length; i += 1) {
    const prev = words(titleOf.get(assignments[i - 1].slug));
    const here = words(titleOf.get(assignments[i].slug));
    if ([...here].some((w) => prev.has(w))) adjacentClashes += 1;
  }
  assert.equal(adjacentClashes, 0, 'no two consecutive days should share a title word');
});

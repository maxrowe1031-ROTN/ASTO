// The statistics model, tested the way calendar-month was: headlessly, no DOM,
// no clock — todayKey is just an argument, and the manifest and results are
// whatever the test says they are.
//
// The streak cases come first and outnumber the rest, because the streak is the
// only thing on that screen doing real reasoning. Everything below the divider
// is counting, which is easy to write and easy to get quietly wrong once.

import test from 'node:test';
import assert from 'node:assert/strict';

import { summarize } from '../src/stats.js';

const TODAY = '2026-08-18';

const entry = (date, slug = `board-${date}`) => ({ slug, id: `asto-${slug}`, title: `T ${date}`, date });

const win = (mistakes = 0) => ({ status: 'won', mistakes, solvedCount: 4, hintsUsed: 0 });
const loss = (solvedCount = 2) => ({ status: 'lost', mistakes: 4, solvedCount, hintsUsed: 0 });

/** A catalogue of consecutive days, plus the results named by date. */
const catalogue = (dates) => dates.map((date) => entry(date));
const recorded = (pairs) => Object.fromEntries(pairs.map(([date, result]) => [`board-${date}`, result]));

// --- the streaks: the whole risk of this module ---

test('an empty catalogue has no record and no streak, and does not throw', () => {
  const stats = summarize([], {}, TODAY);
  assert.equal(stats.played, 0);
  assert.equal(stats.totalReleased, 0);
  assert.equal(stats.currentStreak, 0);
  assert.equal(stats.maxStreak, 0);
  assert.equal(stats.winPercent, 0);
});

test('every released board won is a streak the length of the catalogue', () => {
  const dates = ['2026-08-16', '2026-08-17', '2026-08-18'];
  const stats = summarize(catalogue(dates), recorded(dates.map((d) => [d, win()])), TODAY);

  assert.equal(stats.totalReleased, 3);
  assert.equal(stats.currentStreak, 3);
  assert.equal(stats.maxStreak, 3);
});

test("today unplayed keeps yesterday's streak — the grace", () => {
  const stats = summarize(
    catalogue(['2026-08-16', '2026-08-17', '2026-08-18']),
    recorded([['2026-08-16', win()], ['2026-08-17', win()]]), // nothing for today
    TODAY
  );

  assert.equal(stats.currentStreak, 2, 'a streak must not read 0 every morning before play');
  assert.equal(stats.maxStreak, 2);
});

test('today LOST breaks the streak — the grace covers unplayed, not failed', () => {
  const stats = summarize(
    catalogue(['2026-08-16', '2026-08-17', '2026-08-18']),
    recorded([['2026-08-16', win()], ['2026-08-17', win()], ['2026-08-18', loss()]]),
    TODAY
  );

  assert.equal(stats.currentStreak, 0);
  assert.equal(stats.maxStreak, 2, 'the run that ended today still happened');
});

test("today won counts today — the grace never costs a player the day they played", () => {
  const dates = ['2026-08-17', '2026-08-18'];
  const stats = summarize(catalogue(dates), recorded(dates.map((d) => [d, win()])), TODAY);
  assert.equal(stats.currentStreak, 2);
});

test('an unwon board older than today breaks the current streak there', () => {
  const stats = summarize(
    catalogue(['2026-08-15', '2026-08-16', '2026-08-17', '2026-08-18']),
    recorded([
      ['2026-08-15', win()],
      ['2026-08-16', loss()], // the break
      ['2026-08-17', win()],
      ['2026-08-18', win()],
    ]),
    TODAY
  );

  assert.equal(stats.currentStreak, 2, 'counting back stops at the loss');
  assert.equal(stats.maxStreak, 2);
});

test('a gap in the schedule is spanned, not a break — no puzzle, no way to lose', () => {
  // No board was ever dated the 17th. A player cannot fail a day that had nothing on it.
  const stats = summarize(
    catalogue(['2026-08-16', '2026-08-18']),
    recorded([['2026-08-16', win()], ['2026-08-18', win()]]),
    TODAY
  );

  assert.equal(stats.currentStreak, 2);
  assert.equal(stats.maxStreak, 2);
});

test('max streak survives a later break — a long early run beats a short current one', () => {
  const stats = summarize(
    catalogue([
      '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14',
      '2026-08-15', '2026-08-16', '2026-08-17', '2026-08-18',
    ]),
    recorded([
      ['2026-08-11', win()], ['2026-08-12', win()], ['2026-08-13', win()], ['2026-08-14', win()],
      ['2026-08-15', loss()],
      ['2026-08-16', win()], ['2026-08-17', win()],
      // the 18th is today and unplayed — graced
    ]),
    TODAY
  );

  assert.equal(stats.maxStreak, 4);
  assert.equal(stats.currentStreak, 2);
});

test('a future-dated board never counts, even with a result written against it', () => {
  const stats = summarize(
    catalogue(['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20']),
    recorded([
      ['2026-08-17', win()], ['2026-08-18', win()],
      ['2026-08-19', win()], ['2026-08-20', win()], // unreachable; must not inflate anything
    ]),
    TODAY
  );

  assert.equal(stats.totalReleased, 2);
  assert.equal(stats.played, 2);
  assert.equal(stats.currentStreak, 2);
  assert.equal(stats.maxStreak, 2);
});

test('the grace is today-only: an unplayed board from yesterday still breaks the streak', () => {
  // The queue ran dry — nothing is dated today, so the last entry is the 17th.
  const stats = summarize(
    catalogue(['2026-08-16', '2026-08-17']),
    recorded([['2026-08-16', win()]]), // the 17th came and went unplayed
    TODAY
  );

  assert.equal(stats.currentStreak, 0);
  assert.equal(stats.maxStreak, 1);
});

// --- the counting ---

test('played counts boards with a finished result; unplayed boards are not played', () => {
  const stats = summarize(
    catalogue(['2026-08-16', '2026-08-17', '2026-08-18']),
    recorded([['2026-08-16', win()], ['2026-08-17', loss()]]),
    TODAY
  );

  assert.equal(stats.played, 2);
  assert.equal(stats.totalReleased, 3);
  assert.equal(stats.won, 1);
  assert.equal(stats.losses, 1);
});

test('a result for a board the manifest does not list is ignored', () => {
  // An unlisted board reached by an old ?puzzle= link, or one cut by the trim.
  const stats = summarize(
    catalogue(['2026-08-18']),
    { 'board-2026-08-18': win(), 'a-board-nobody-lists': win() },
    TODAY
  );

  assert.equal(stats.played, 1);
  assert.equal(stats.won, 1);
});

test('win percent rounds, and is 0 rather than NaN when nothing has been played', () => {
  const dates = ['2026-08-16', '2026-08-17', '2026-08-18'];

  assert.equal(summarize(catalogue(dates), {}, TODAY).winPercent, 0);

  assert.equal(
    summarize(catalogue(dates), recorded(dates.map((d) => [d, win()])), TODAY).winPercent,
    100
  );

  const twoOfThree = summarize(
    catalogue(dates),
    recorded([['2026-08-16', win()], ['2026-08-17', win()], ['2026-08-18', loss()]]),
    TODAY
  );
  assert.equal(twoOfThree.winPercent, 67, '66.66… rounds to 67');
});

test('the five distribution buckets always sum to played', () => {
  const dates = ['2026-08-14', '2026-08-15', '2026-08-16', '2026-08-17', '2026-08-18'];
  const stats = summarize(
    catalogue(dates),
    recorded([
      ['2026-08-14', win(0)], ['2026-08-15', win(1)],
      ['2026-08-16', win(2)], ['2026-08-17', win(3)],
      ['2026-08-18', loss()],
    ]),
    TODAY
  );

  assert.deepEqual(stats.distribution.map((b) => b.label), ['0', '1', '2', '3', 'Lost']);
  assert.deepEqual(stats.distribution.map((b) => b.count), [1, 1, 1, 1, 1]);
  assert.equal(stats.distribution.reduce((sum, b) => sum + b.count, 0), stats.played);
});

test('a mistakes value out of range clamps into a bucket rather than vanishing', () => {
  // Hand-edited storage, or a shape from a version that counted differently.
  const dates = ['2026-08-16', '2026-08-17', '2026-08-18'];
  const stats = summarize(
    catalogue(dates),
    recorded([
      ['2026-08-16', { status: 'won', mistakes: 9 }],
      ['2026-08-17', { status: 'won', mistakes: -2 }],
      ['2026-08-18', { status: 'won' }], // no mistakes field at all
    ]),
    TODAY
  );

  assert.equal(stats.distribution.reduce((sum, b) => sum + b.count, 0), stats.played);
  assert.deepEqual(stats.distribution.map((b) => b.count), [2, 0, 0, 1, 0]);
});

test('a malformed status counts as a loss, never as a win', () => {
  const stats = summarize(
    catalogue(['2026-08-18']),
    { 'board-2026-08-18': { status: 'abandoned', mistakes: 1 } },
    TODAY
  );

  assert.equal(stats.played, 1);
  assert.equal(stats.won, 0);
  assert.equal(stats.losses, 1);
  assert.equal(stats.distribution.at(-1).count, 1);
});

// --- the four outcome icons: pose says how it ended, colour how it was played (D-16) ---

test('outcomes split wins and losses by whether a hint was taken', () => {
  const dates = ['2026-08-13', '2026-08-14', '2026-08-15', '2026-08-16', '2026-08-17', '2026-08-18'];
  const stats = summarize(
    catalogue(dates),
    recorded([
      ['2026-08-13', { status: 'won', mistakes: 1, hintsUsed: 0 }],
      ['2026-08-14', { status: 'won', mistakes: 2, hintsUsed: 0 }],
      ['2026-08-15', { status: 'won', mistakes: 0, hintsUsed: 1 }],
      ['2026-08-16', { status: 'lost', mistakes: 4, hintsUsed: 0 }],
      ['2026-08-17', { status: 'lost', mistakes: 4, hintsUsed: 2 }],
      // the 18th is unplayed — it belongs to no outcome
    ]),
    TODAY
  );

  assert.deepEqual(
    stats.outcomes.map((o) => [o.key, o.count]),
    [['won-clean', 2], ['won-hinted', 1], ['lost-clean', 1], ['lost-hinted', 1]]
  );
});

test('the four outcome counts always sum to played', () => {
  const dates = ['2026-08-15', '2026-08-16', '2026-08-17', '2026-08-18'];
  const stats = summarize(
    catalogue(dates),
    recorded([
      ['2026-08-15', win()],
      ['2026-08-16', { status: 'won', mistakes: 1, hintsUsed: 3 }],
      ['2026-08-17', loss()],
    ]),
    TODAY
  );

  assert.equal(stats.outcomes.reduce((sum, o) => sum + o.count, 0), stats.played);
  assert.equal(stats.played, 3);
});

test('a result with no hintsUsed field counts as a clean board, not a hinted one', () => {
  // Results saved before hints existed (D-16) carry no hintsUsed at all.
  const stats = summarize(
    catalogue(['2026-08-18']),
    { 'board-2026-08-18': { status: 'won', mistakes: 1 } },
    TODAY
  );

  assert.equal(stats.outcomes.find((o) => o.key === 'won-clean').count, 1);
  assert.equal(stats.outcomes.find((o) => o.key === 'won-hinted').count, 0);
});

test('outcomes are all zero when nothing has been played, and still four of them', () => {
  const stats = summarize(catalogue(['2026-08-18']), {}, TODAY);
  assert.equal(stats.outcomes.length, 4);
  assert.deepEqual(stats.outcomes.map((o) => o.count), [0, 0, 0, 0]);
});

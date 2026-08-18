// The release rule — the one question the daily game asks of the manifest:
// which boards exist YET, and which one is today's?
//
// Everything here is pure. The only clock is the `now` the caller injects,
// which is how midnight is tested without waiting for one.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TIME_ZONE,
  dateKeyFor,
  isReleased,
  nextDay,
  releasedPuzzles,
  todaysPuzzle,
} from '../../src/source/release.js';

const entry = (date, slug = `board-${date}`) => ({ slug, id: `asto-${slug}`, title: slug, date });

// --- dateKeyFor: the impure edge's one computation, pinned across DST ---

test('the game flips at midnight in Mountain Time, not UTC', () => {
  // 05:59 UTC is 23:59 the previous day in MDT (-0600)...
  assert.equal(dateKeyFor(new Date('2026-08-18T05:59:00Z')), '2026-08-17');
  // ...and 06:00 UTC is exactly midnight.
  assert.equal(dateKeyFor(new Date('2026-08-18T06:00:00Z')), '2026-08-18');
});

test('winter midnight moves with the clocks — MST is -0700', () => {
  assert.equal(dateKeyFor(new Date('2026-01-15T06:59:00Z')), '2026-01-14');
  assert.equal(dateKeyFor(new Date('2026-01-15T07:00:00Z')), '2026-01-15');
});

test('the zone is pinned once, where the tests can see it', () => {
  assert.equal(TIME_ZONE, 'America/Denver');
});

// --- nextDay: calendar arithmetic for the queue, no timezone re-entry ---

test('nextDay walks month, year and leap boundaries', () => {
  assert.equal(nextDay('2026-08-18'), '2026-08-19');
  assert.equal(nextDay('2026-08-31'), '2026-09-01');
  assert.equal(nextDay('2026-12-31'), '2027-01-01');
  assert.equal(nextDay('2028-02-28'), '2028-02-29'); // leap year
  assert.equal(nextDay('2026-02-28'), '2026-03-01'); // not one
});

// --- isReleased: a plain string comparison, because ISO dates sort as text ---

test('released means dated today or earlier', () => {
  assert.equal(isReleased(entry('2026-08-17'), '2026-08-18'), true);
  assert.equal(isReleased(entry('2026-08-18'), '2026-08-18'), true);
  assert.equal(isReleased(entry('2026-08-19'), '2026-08-18'), false);
});

test('an entry with no date is never released — dateless is unlisted, not implicit', () => {
  assert.equal(isReleased({ slug: 'x', id: 'asto-x', title: 'X' }, '2026-08-18'), false);
});

// --- releasedPuzzles: the gated, date-ordered list the calendar reads ---

test('releasedPuzzles gates the future out and orders by date', () => {
  const manifest = [entry('2026-08-19'), entry('2026-08-16'), entry('2026-08-18'), entry('2026-08-17')];
  assert.deepEqual(
    releasedPuzzles(manifest, '2026-08-18').map((e) => e.date),
    ['2026-08-16', '2026-08-17', '2026-08-18'],
  );
});

test('releasedPuzzles does not mutate the manifest order it was handed', () => {
  const manifest = [entry('2026-08-18'), entry('2026-08-16')];
  releasedPuzzles(manifest, '2026-08-18');
  assert.deepEqual(manifest.map((e) => e.date), ['2026-08-18', '2026-08-16']);
});

// --- todaysPuzzle: the front door's board, or null when the queue ran dry ---

test("todaysPuzzle is the entry dated exactly today", () => {
  const manifest = [entry('2026-08-17'), entry('2026-08-18'), entry('2026-08-19')];
  assert.equal(todaysPuzzle(manifest, '2026-08-18')?.date, '2026-08-18');
});

test('a dry queue is null, not yesterday’s board wearing a new label', () => {
  const manifest = [entry('2026-08-17')];
  assert.equal(todaysPuzzle(manifest, '2026-08-18'), null);
});

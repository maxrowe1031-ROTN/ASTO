// Past Pours' month math, tested the way nextUnfinished was: headlessly,
// no DOM, no clock — todayKey is just an argument.

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMonth, dayLabel, monthLabel, monthOf } from '../src/view/calendar-month.js';

const entry = (date, slug = `board-${date}`) => ({ slug, id: `asto-${slug}`, title: `T ${date}`, date });

const TODAY = '2026-08-18';

test('monthOf and the labels', () => {
  assert.equal(monthOf('2026-08-18'), '2026-08');
  assert.equal(monthLabel('2026-08'), 'August 2026');
  assert.equal(monthLabel('2027-01'), 'January 2027');
  assert.equal(dayLabel('2026-08-05'), 'August 5, 2026');
});

test('August 2026 has 31 squares after 6 leading blanks — the 1st is a Saturday', () => {
  const model = buildMonth('2026-08', [], {}, TODAY);
  assert.equal(model.days.length, 31);
  assert.equal(model.leading, 6);
  assert.equal(model.label, 'August 2026');
});

test('a released board is a board day, carrying its entry and its result', () => {
  const entries = [entry('2026-08-05', 'bedside-manor')];
  const results = { 'bedside-manor': { status: 'won', mistakes: 1, solvedCount: 4, hintsUsed: 0 } };
  const model = buildMonth('2026-08', entries, results, TODAY);

  const day5 = model.days[4];
  assert.equal(day5.kind, 'board');
  assert.equal(day5.entry.slug, 'bedside-manor');
  assert.equal(day5.result.status, 'won');
});

test('an unplayed board day carries a null result, not a missing one', () => {
  const model = buildMonth('2026-08', [entry('2026-08-05')], {}, TODAY);
  assert.equal(model.days[4].kind, 'board');
  assert.equal(model.days[4].result, null);
});

test('a future day is future even when a board is scheduled on it — no leak by construction', () => {
  const entries = [entry('2026-08-25', 'tomorrow-board')];
  const model = buildMonth('2026-08', entries, {}, TODAY);
  const day25 = model.days[24];
  assert.equal(day25.kind, 'future');
  assert.equal('entry' in day25, false, 'a future square carried a title');
});

test('today itself is a board day when a board is dated today', () => {
  const model = buildMonth('2026-08', [entry(TODAY)], {}, TODAY);
  assert.equal(model.days[17].kind, 'board');
});

test('a past day with no board is blank — a gap stays a visible gap', () => {
  const model = buildMonth('2026-08', [entry('2026-08-05')], {}, TODAY);
  assert.equal(model.days[3].kind, 'blank'); // Aug 4: came and went, no board
});

test('navigation is bounded: earliest released month to the current month', () => {
  const entries = [entry('2026-07-03'), entry('2026-08-18')];

  const august = buildMonth('2026-08', entries, {}, TODAY);
  assert.equal(august.prev, '2026-07');
  assert.equal(august.next, null, 'the future is not a place to browse');

  const july = buildMonth('2026-07', entries, {}, TODAY);
  assert.equal(july.prev, null, 'nothing earlier than the first board');
  assert.equal(july.next, '2026-08');
});

test('a future-only schedule does not extend the past — earliest counts released boards', () => {
  const entries = [entry('2026-05-01', 'future-slug-x')].map((e) => ({ ...e, date: '2026-09-01' }));
  const model = buildMonth('2026-08', entries, {}, TODAY);
  assert.equal(model.prev, null);
});

test('month boundaries: December wraps the year both ways', () => {
  const entries = [entry('2026-11-30'), entry('2026-12-31'), entry('2027-01-01')];
  const december = buildMonth('2026-12', entries, {}, '2027-01-02');
  assert.equal(december.prev, '2026-11');
  assert.equal(december.next, '2027-01');
});

test('February in a leap year has 29 squares', () => {
  const model = buildMonth('2028-02', [], {}, '2028-03-01');
  assert.equal(model.days.length, 29);
});

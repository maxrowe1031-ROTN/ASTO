// The schedule report's analysis, tested pure — the CLI is a thin renderer.

import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeSchedule, render } from '../../tools/check-schedule.js';

const entry = (date, slug = `board-${date}`) => ({ slug, id: `asto-${slug}`, title: slug, date });
const TODAY = '2026-08-18';

test('a healthy queue: today covered, runway counted, nothing to report', () => {
  const entries = [entry('2026-08-17'), entry(TODAY), entry('2026-08-19'), entry('2026-08-20')];
  const report = analyzeSchedule(entries, [], TODAY);

  assert.equal(report.today.date, TODAY);
  assert.equal(report.runway, 3); // today, 19th, 20th
  assert.equal(report.queuedAhead, 2);
  assert.deepEqual(report.gaps, []);
});

test('a dry queue is runway zero and no today board', () => {
  const report = analyzeSchedule([entry('2026-08-17')], [], TODAY);
  assert.equal(report.today, null);
  assert.equal(report.runway, 0);
  assert.equal(report.queuedAhead, 0);
});

test('a hole in the queue shows as a gap, and the runway stops at it', () => {
  const entries = [entry(TODAY), entry('2026-08-19'), entry('2026-08-21')];
  const report = analyzeSchedule(entries, [], TODAY);
  assert.equal(report.runway, 2); // today + 19th; the 20th is dark
  assert.deepEqual(report.gaps, ['2026-08-20']);
});

test('dateless boards are carried through to the report', () => {
  const report = analyzeSchedule([entry(TODAY)], ['old-board'], TODAY);
  assert.deepEqual(report.datelessSlugs, ['old-board']);
});

test('the render says the one thing that matters most first', () => {
  const dry = analyzeSchedule([], [], TODAY);
  assert.match(render(dry, TODAY), /NO BOARD/);

  const fine = analyzeSchedule([entry(TODAY)], [], TODAY);
  assert.match(render(fine, TODAY), /on the board/);
});

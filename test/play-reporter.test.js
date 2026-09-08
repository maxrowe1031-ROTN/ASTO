// The play reporter is the counter's only decision-maker — WHEN a start or a finish is
// sent — so it is tested the way the results recorder is: headlessly, against a fake
// seam, with no DOM and no browser.

import test from 'node:test';
import assert from 'node:assert/strict';

import { PlayReporter } from '../src/play-reporter.js';

/** Stands in for Ratings: records every play it is asked to send, in order. */
function fakeSeam() {
  const sent = [];
  return { sent, sendPlay: (row) => sent.push(row) };
}

const puzzleA = { id: 'asto-a', title: 'A' };
const puzzleB = { id: 'asto-b', title: 'B' };

const state = (status, over = {}) => ({
  status,
  puzzle: puzzleA,
  mistakes: 0,
  solvedSetIds: [],
  hintsUsed: 0,
  vocabRevealed: [],
  rules: {},
  ...over
});

const on = (slug) => () => slug;

test('the first playing state sends one start for the board on screen', () => {
  const seam = fakeSeam();
  const reporter = new PlayReporter(seam, on('first-light'));

  reporter.update(state('playing'));
  reporter.update(state('playing', { mistakes: 1 }));
  reporter.update(state('playing', { solvedSetIds: ['a'] }));

  assert.deepEqual(seam.sent, [{ slug: 'first-light', event: 'start' }]);
});

test('a finished game sends one finish with its outcome, however often it is repainted', () => {
  const seam = fakeSeam();
  const reporter = new PlayReporter(seam, on('first-light'));

  reporter.update(state('playing'));
  const won = state('won', { mistakes: 2, solvedSetIds: ['a', 'b', 'c', 'd'], hintsUsed: 1 });
  reporter.update(won);
  reporter.update(won);
  reporter.update(won);

  assert.deepEqual(seam.sent, [
    { slug: 'first-light', event: 'start' },
    { slug: 'first-light', event: 'finish', won: true, mistakes: 2, hintsUsed: 1, learning: false }
  ]);
});

test('a loss is a finish too, with won false', () => {
  const seam = fakeSeam();
  const reporter = new PlayReporter(seam, on('first-light'));

  reporter.update(state('playing'));
  reporter.update(state('lost', { mistakes: 4, solvedSetIds: ['a'] }));

  assert.equal(seam.sent[1].event, 'finish');
  assert.equal(seam.sent[1].won, false);
  assert.equal(seam.sent[1].mistakes, 4);
});

// D-33: marked only when help was actually USED — the mode being on says nothing.
test('learning is true only when the mode was on and a word was defined', () => {
  const seam = fakeSeam();
  const reporter = new PlayReporter(seam, on('first-light'));

  reporter.update(state('playing'));
  reporter.update(state('won', { rules: { learningMode: true }, vocabRevealed: [] }));
  assert.equal(seam.sent[1].learning, false);

  const seam2 = fakeSeam();
  const again = new PlayReporter(seam2, on('first-light'));
  again.update(state('playing'));
  again.update(state('won', { rules: { learningMode: true }, vocabRevealed: ['stent'] }));
  assert.equal(seam2.sent[1].learning, true);
});

test('a restart on the same board is a new play: start again, then its own finish', () => {
  const seam = fakeSeam();
  const reporter = new PlayReporter(seam, on('first-light'));

  reporter.update(state('playing'));
  reporter.update(state('won'));
  reporter.update(state('playing')); // restart(): same puzzle object, status back to playing
  reporter.update(state('lost', { mistakes: 4 }));

  assert.deepEqual(seam.sent.map((row) => row.event), ['start', 'finish', 'start', 'finish']);
});

test('moving to another board mid-game starts a new play without finishing the old one', () => {
  const seam = fakeSeam();
  let slug = 'a';
  const reporter = new PlayReporter(seam, () => slug);

  reporter.update(state('playing'));
  slug = 'b';
  reporter.update(state('playing', { puzzle: puzzleB }));

  assert.deepEqual(seam.sent, [
    { slug: 'a', event: 'start' },
    { slug: 'b', event: 'start' }
  ]);
});

test('the tutorial is silent: a null slug sends neither start nor finish', () => {
  const seam = fakeSeam();
  const reporter = new PlayReporter(seam, on(null));

  reporter.update(state('playing'));
  reporter.update(state('won'));

  assert.deepEqual(seam.sent, []);
});

test('a board loaded straight into a finished state (a reload) sends a finish and no start', () => {
  const seam = fakeSeam();
  const reporter = new PlayReporter(seam, on('first-light'));

  reporter.update(state('won'));

  assert.deepEqual(seam.sent.map((row) => row.event), ['finish']);
});

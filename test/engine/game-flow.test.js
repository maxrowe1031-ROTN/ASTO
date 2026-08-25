// The "view turned off" proof.
//
// These play whole games the way a player does — tap, tap, tap, tap, Confirm — using
// nothing but engine imports. No DOM, no controller, no views exist in this phase. If
// this file passes, the game is playable; everything after it is presentation.

import test from 'node:test';
import assert from 'node:assert/strict';

import { clearSelection, hint, initGame, select, shuffle, submit } from '../../src/engine/engine.js';
import { mulberry32 } from '../../src/engine/rng.js';
import { board, distinctMisses, MISS } from '../fixtures/board.js';

/** Tap four tiles, then Confirm — exactly what the controller will do in Phase 2. */
function play(state, terms) {
  const filled = terms.reduce((s, term) => select(s, term), state);
  assert.deepEqual(filled.selectedTerms, terms, 'all four taps should register');
  return submit(filled, filled.selectedTerms);
}

test('headless full win', () => {
  let state = shuffle(initGame(board), mulberry32(2026));
  const outcomes = [];

  // A different accepted order for each set, to prove all four readings really work.
  for (const terms of [
    ['Seed', 'Tree', 'Spark', 'Fire'], // as stored
    ['Chisel', 'Sculptor', 'Brush', 'Painter'], // both sides swapped
    ['Bird', 'Nest', 'Bear', 'Den'], // both relationships reversed
    ['Pottery', 'Clay', 'Bread', 'Dough'] // swapped and reversed
  ]) {
    const result = play(state, terms);
    outcomes.push(result.outcome);
    state = result.state;
  }

  assert.deepEqual(outcomes.map((o) => o.type), ['solved', 'solved', 'solved', 'solved']);
  assert.deepEqual(state.solvedSetIds, ['set-growth', 'set-tools', 'set-homes', 'set-material']);
  assert.equal(state.status, 'won');
  assert.equal(state.mistakes, 0);
  assert.equal(state.boardTerms.length, 0);
  assert.deepEqual(state.selectedTerms, []);

  // Every solved card can render its canonical analogy from the outcome alone.
  assert.deepEqual(outcomes[3].canonicalOrder, ['Dough', 'Bread', 'Clay', 'Pottery']);
});

test('headless full loss', () => {
  let state = shuffle(initGame(board), mulberry32(11));
  const outcomes = [];

  const attempts = [
    MISS, // plain miss
    ['Seed', 'Spark', 'Tree', 'Fire'], // so close — still costs a mistake
    ['Brush', 'Chisel', 'Painter', 'Sculptor'], // so close again
    ['Nest', 'Bear', 'Den', 'Bird'] // so close on the fourth — game over
  ];
  for (const terms of attempts) {
    // A so-close KEEPS the frame (2026-08-25 revision), so a player moving on
    // to different words clears it first — exactly what this play-through does.
    if (state.selectedTerms.length > 0) state = clearSelection(state);
    const result = play(state, terms);
    outcomes.push(result.outcome);
    state = result.state;
  }

  assert.deepEqual(outcomes.map((o) => o.type), ['miss', 'so-close', 'so-close', 'so-close']);
  assert.equal(state.mistakes, 4);
  assert.equal(state.status, 'lost');
  assert.deepEqual(state.solvedSetIds, []);

  // The loss screen reveals the unsolved sets from the puzzle the state still carries.
  const unsolved = state.puzzle.sets.filter((s) => !state.solvedSetIds.includes(s.id));
  assert.equal(unsolved.length, 4);
  for (const set of unsolved) assert.ok(set.explanation.length > 0);
});

test('headless mixed run — mistakes and solves interleaved', () => {
  let state = initGame(board);

  state = play(state, ['Seed', 'Tree', 'Spark', 'Fire']).state;
  state = play(state, MISS.filter((t) => t !== 'Seed').concat('Brush')).state;
  state = clearSelection(state);
  state = play(state, ['Brush', 'Painter', 'Chisel', 'Sculptor']).state;
  state = play(state, ['Nest', 'Bear', 'Den', 'Bird']).state; // so close — frame kept
  // The kept frame is the point of the 2026-08-25 revision: the same four words
  // go again in a corrected order. clearSelection stands in for the reorder,
  // since play() re-taps from an empty frame.
  state = clearSelection(state);
  state = play(state, ['Nest', 'Bird', 'Den', 'Bear']).state;
  state = play(state, ['Clay', 'Pottery', 'Dough', 'Bread']).state;

  assert.equal(state.status, 'won');
  assert.equal(state.mistakes, 2);
  assert.equal(state.solvedSetIds.length, 4);
});

test('headless run with a mid-game hint — the hinted set is then solved', () => {
  let state = shuffle(initGame(board), mulberry32(2026));

  state = play(state, ['Seed', 'Tree', 'Spark', 'Fire']).state;

  const hinted = hint(state, mulberry32(13));
  assert.equal(hinted.outcome.type, 'hint');
  state = hinted.state;

  const [hintedId] = state.hintedSetIds;
  assert.notEqual(hintedId, 'set-growth', 'a solved set is never hinted');

  // The hint reveals membership, not order — solving still takes an accepted order.
  const hintedSet = board.sets.find((set) => set.id === hintedId);
  state = play(state, [...hintedSet.pairs[0], ...hintedSet.pairs[1]]).state;
  assert.ok(state.solvedSetIds.includes(hintedId));

  // Spending the hint changed nothing about the rest of the game.
  for (const set of board.sets) {
    if (state.solvedSetIds.includes(set.id)) continue;
    state = play(state, [...set.pairs[0], ...set.pairs[1]]).state;
  }
  assert.equal(state.status, 'won');
  assert.equal(state.mistakes, 0);
  assert.equal(state.hintsUsed, 1);
});

test('maxMistakes: Infinity counts mistakes but can never lose — the tutorial rule', () => {
  let state = initGame(board, { maxMistakes: Infinity });

  let charged = 0;
  for (const miss of distinctMisses(10)) {
    state = play(state, miss).state;
    charged += 1;
    assert.equal(state.status, 'playing', `still playing after ${charged} mistakes`);
  }
  assert.equal(state.mistakes, 10);

  // And the board is still winnable after all of it.
  for (const set of board.sets) {
    state = play(state, [...set.pairs[0], ...set.pairs[1]]).state;
  }
  assert.equal(state.status, 'won');
  assert.equal(state.mistakes, 10);
});

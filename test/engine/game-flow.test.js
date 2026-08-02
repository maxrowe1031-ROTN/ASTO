// The "view turned off" proof.
//
// These play whole games the way a player does — tap, tap, tap, tap, Confirm — using
// nothing but engine imports. No DOM, no controller, no views exist in this phase. If
// this file passes, the game is playable; everything after it is presentation.

import test from 'node:test';
import assert from 'node:assert/strict';

import { clearSelection, initGame, select, shuffle, submit } from '../../src/engine/engine.js';
import { mulberry32 } from '../../src/engine/rng.js';
import { board, MISS } from '../fixtures/board.js';

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
  state = play(state, ['Nest', 'Bear', 'Den', 'Bird']).state; // so close
  state = play(state, ['Nest', 'Bird', 'Den', 'Bear']).state;
  state = play(state, ['Clay', 'Pottery', 'Dough', 'Bread']).state;

  assert.equal(state.status, 'won');
  assert.equal(state.mistakes, 2);
  assert.equal(state.solvedSetIds.length, 4);
});

test('maxMistakes: Infinity counts mistakes but can never lose — the tutorial rule', () => {
  let state = initGame(board, { maxMistakes: Infinity });

  for (let i = 0; i < 10; i += 1) {
    state = play(state, MISS).state;
    assert.equal(state.status, 'playing', `still playing after ${i + 1} mistakes`);
  }
  assert.equal(state.mistakes, 10);

  // And the board is still winnable after all of it.
  for (const set of board.sets) {
    state = play(state, [...set.pairs[0], ...set.pairs[1]]).state;
  }
  assert.equal(state.status, 'won');
  assert.equal(state.mistakes, 10);
});

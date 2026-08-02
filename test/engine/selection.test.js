import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_MISTAKES,
  clearSelection,
  deselect,
  initGame,
  reorderSelected,
  select,
  submit
} from '../../src/engine/engine.js';
import { board, MISS } from '../fixtures/board.js';

const selectAll = (state, terms) => terms.reduce((s, term) => select(s, term), state);

test('initGame lays out a fresh, deterministic state', () => {
  const state = initGame(board);
  assert.equal(state.status, 'playing');
  assert.equal(state.mistakes, 0);
  assert.deepEqual(state.selectedTerms, []);
  assert.deepEqual(state.solvedSetIds, []);
  assert.equal(state.boardTerms.length, 16);
  // Derived order, not shuffled — randomness lives at exactly one seam, shuffle().
  assert.deepEqual(state.boardTerms.slice(0, 4), ['Seed', 'Tree', 'Spark', 'Fire']);
  assert.equal(state.rules.maxMistakes, MAX_MISTAKES);
});

test('initGame merges rule overrides over the defaults', () => {
  const state = initGame(board, { maxMistakes: Infinity });
  assert.equal(state.rules.maxMistakes, Infinity);
  assert.equal(state.rules.soCloseCostsMistake, true);
  assert.equal(state.rules.clearSelectionOnFail, true);
});

test('select appends in tap order', () => {
  const state = selectAll(initGame(board), ['Spark', 'Fire', 'Seed']);
  assert.deepEqual(state.selectedTerms, ['Spark', 'Fire', 'Seed']);
});

test('select ignores a fifth tap', () => {
  const four = selectAll(initGame(board), ['Seed', 'Tree', 'Spark', 'Fire']);
  const five = select(four, 'Brush');
  assert.deepEqual(five.selectedTerms, ['Seed', 'Tree', 'Spark', 'Fire']);
});

test('the fourth select fills the frame and does NOT submit', () => {
  // These four are a genuinely correct set, in a genuinely accepted order.
  const state = selectAll(initGame(board), ['Seed', 'Tree', 'Spark', 'Fire']);
  assert.equal(state.status, 'playing');
  assert.equal(state.mistakes, 0);
  assert.deepEqual(state.solvedSetIds, []);
  assert.equal(state.boardTerms.length, 16);
});

test('select ignores a term that is already selected', () => {
  const state = select(selectAll(initGame(board), ['Seed', 'Tree']), 'Seed');
  assert.deepEqual(state.selectedTerms, ['Seed', 'Tree']);
});

test('select ignores a term that is not on the board', () => {
  const state = select(initGame(board), 'Aardvark');
  assert.deepEqual(state.selectedTerms, []);
});

test('deselect removes the term and compresses the order', () => {
  const four = selectAll(initGame(board), ['Seed', 'Tree', 'Spark', 'Fire']);
  assert.deepEqual(deselect(four, 'Tree').selectedTerms, ['Seed', 'Spark', 'Fire']);
});

test('deselect of an unselected term is a no-op', () => {
  const state = selectAll(initGame(board), ['Seed', 'Tree']);
  assert.deepEqual(deselect(state, 'Brush').selectedTerms, ['Seed', 'Tree']);
});

test('reorderSelected moves one term and shifts the rest', () => {
  const state = selectAll(initGame(board), ['Seed', 'Spark', 'Tree', 'Fire']);
  assert.deepEqual(reorderSelected(state, 1, 2).selectedTerms, ['Seed', 'Tree', 'Spark', 'Fire']);
  assert.deepEqual(reorderSelected(state, 3, 0).selectedTerms, ['Fire', 'Seed', 'Spark', 'Tree']);
});

test('reorderSelected ignores out-of-range indices', () => {
  const state = selectAll(initGame(board), ['Seed', 'Spark', 'Tree', 'Fire']);
  for (const [from, to] of [[-1, 2], [0, 9], [4, 0], [0, -1]]) {
    assert.deepEqual(reorderSelected(state, from, to).selectedTerms, state.selectedTerms);
  }
});

test('clearSelection empties the frame and costs nothing', () => {
  const state = clearSelection(selectAll(initGame(board), ['Seed', 'Tree', 'Spark']));
  assert.deepEqual(state.selectedTerms, []);
  assert.equal(state.mistakes, 0);
  assert.equal(state.status, 'playing');
});

test('selection ops are inert once the game is over', () => {
  let state = initGame(board);
  for (let i = 0; i < MAX_MISTAKES; i += 1) state = submit(state, MISS).state;
  assert.equal(state.status, 'lost');

  assert.deepEqual(select(state, 'Seed').selectedTerms, []);
  assert.deepEqual(reorderSelected(state, 0, 1), state);
  assert.deepEqual(clearSelection(state), state);
});

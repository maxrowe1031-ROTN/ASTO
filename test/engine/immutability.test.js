import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearSelection,
  deselect,
  initGame,
  reorderSelected,
  select,
  shuffle,
  submit
} from '../../src/engine/engine.js';
import { mulberry32 } from '../../src/engine/rng.js';
import { board, MISS } from '../fixtures/board.js';

test('engine state is frozen', () => {
  const state = initGame(board);
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.boardTerms));
  assert.ok(Object.isFrozen(state.selectedTerms));
  assert.ok(Object.isFrozen(state.solvedSetIds));
  assert.ok(Object.isFrozen(state.rules));
});

test('no engine call mutates the state it was given', () => {
  let start = initGame(board);
  for (const term of ['Seed', 'Tree', 'Spark', 'Fire']) start = select(start, term);
  const snapshot = structuredClone({ ...start, puzzle: undefined });

  select(start, 'Brush');
  deselect(start, 'Tree');
  reorderSelected(start, 0, 3);
  clearSelection(start);
  shuffle(start, mulberry32(5));
  submit(start, start.selectedTerms);
  submit(start, MISS);

  assert.deepEqual(structuredClone({ ...start, puzzle: undefined }), snapshot);
});

test('no engine call mutates the puzzle it was given', () => {
  const original = structuredClone(board);
  let state = initGame(board);

  state = shuffle(state, mulberry32(1));
  state = select(state, 'Seed');
  state = clearSelection(state);
  state = submit(state, MISS).state;
  state = submit(state, ['Seed', 'Tree', 'Spark', 'Fire']).state;

  assert.deepEqual(board, original);
});

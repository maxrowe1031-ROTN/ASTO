import test from 'node:test';
import assert from 'node:assert/strict';

import { initGame, select, shuffle, submit } from '../../src/engine/engine.js';
import { mulberry32 } from '../../src/engine/rng.js';
import { board } from '../fixtures/board.js';

test('shuffle reorders the board without changing its membership', () => {
  const before = initGame(board);
  const after = shuffle(before, mulberry32(42));
  assert.notDeepEqual(after.boardTerms, before.boardTerms);
  assert.deepEqual([...after.boardTerms].sort(), [...before.boardTerms].sort());
});

test('shuffle leaves the current selection untouched', () => {
  let state = initGame(board);
  for (const term of ['Seed', 'Tree', 'Spark']) state = select(state, term);
  const after = shuffle(state, mulberry32(7));
  assert.deepEqual(after.selectedTerms, ['Seed', 'Tree', 'Spark']);
});

test('shuffle touches unsolved tiles only', () => {
  const solved = submit(initGame(board), ['Seed', 'Tree', 'Spark', 'Fire']).state;
  const after = shuffle(solved, mulberry32(3));
  assert.equal(after.boardTerms.length, 12);
  for (const term of ['Seed', 'Tree', 'Spark', 'Fire']) {
    assert.ok(!after.boardTerms.includes(term));
  }
  assert.deepEqual(after.solvedSetIds, ['set-growth']);
});

test('the same seed shuffles the same way', () => {
  const state = initGame(board);
  assert.deepEqual(shuffle(state, mulberry32(9)).boardTerms, shuffle(state, mulberry32(9)).boardTerms);
});

test('shuffle requires an injected rand', () => {
  assert.throws(() => shuffle(initGame(board)), TypeError);
});

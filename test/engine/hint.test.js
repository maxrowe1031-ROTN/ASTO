import test from 'node:test';
import assert from 'node:assert/strict';

import { initGame, hint, shuffle, submit } from '../../src/engine/engine.js';
import { mulberry32 } from '../../src/engine/rng.js';
import { board, distinctMisses } from '../fixtures/board.js';

const SET_IDS = board.sets.map((set) => set.id);

test('hint marks exactly one unsolved set and spends the hint', () => {
  const { state, outcome } = hint(initGame(board), mulberry32(11));
  assert.equal(outcome.type, 'hint');
  assert.deepEqual(Object.keys(outcome), ['type']);
  assert.equal(state.hintsUsed, 1);
  assert.equal(state.hintedSetIds.length, 1);
  assert.ok(SET_IDS.includes(state.hintedSetIds[0]));
});

test('the same seed hints the same set', () => {
  const start = initGame(board);
  assert.deepEqual(
    hint(start, mulberry32(5)).state.hintedSetIds,
    hint(start, mulberry32(5)).state.hintedSetIds
  );
});

test('hint never picks a solved set', () => {
  const solved = submit(initGame(board), ['Seed', 'Tree', 'Spark', 'Fire']).state;
  for (let seed = 0; seed < 20; seed += 1) {
    const { state } = hint(solved, mulberry32(seed));
    assert.notEqual(state.hintedSetIds[0], 'set-growth');
  }
});

test('hint never re-picks an already-hinted set', () => {
  const start = initGame(board, { hintsAllowed: 4 });
  for (let seed = 0; seed < 20; seed += 1) {
    let state = start;
    for (let i = 0; i < 4; i += 1) {
      state = hint(state, mulberry32(seed * 31 + i)).state;
    }
    assert.deepEqual([...state.hintedSetIds].sort(), [...SET_IDS].sort());
  }
});

test('a second hint no-ops at the default one-per-game limit', () => {
  const first = hint(initGame(board), mulberry32(2)).state;
  const second = hint(first, mulberry32(3));
  assert.equal(second.state, first);
  assert.equal(second.outcome, null);
  assert.equal(second.state.hintsUsed, 1);
});

test('hintsAllowed: 0 disables hints entirely', () => {
  const start = initGame(board, { hintsAllowed: 0 });
  const { state, outcome } = hint(start, mulberry32(1));
  assert.equal(state, start);
  assert.equal(outcome, null);
});

test('hint requires an injected rand', () => {
  assert.throws(() => hint(initGame(board)), TypeError);
});

test('hint no-ops once the game is over', () => {
  let lost = initGame(board);
  for (const miss of distinctMisses(4)) lost = submit(lost, miss).state;
  assert.equal(lost.status, 'lost');
  const after = hint(lost, mulberry32(8));
  assert.equal(after.state, lost);
  assert.equal(after.outcome, null);
});

test('the hinted set survives a shuffle', () => {
  const hinted = hint(initGame(board), mulberry32(4)).state;
  const shuffled = shuffle(hinted, mulberry32(9));
  assert.deepEqual(shuffled.hintedSetIds, hinted.hintedSetIds);
  assert.equal(shuffled.hintsUsed, 1);
});

test('hint returns a frozen state and leaves its input untouched', () => {
  const before = hint(initGame(board), mulberry32(6)).state;
  const snapshot = JSON.parse(JSON.stringify(before));
  const after = hint(initGame(board, { hintsAllowed: 2 }), mulberry32(6)).state;
  assert.ok(Object.isFrozen(after));
  assert.ok(Object.isFrozen(after.hintedSetIds));
  assert.deepEqual(JSON.parse(JSON.stringify(before)), snapshot);
});

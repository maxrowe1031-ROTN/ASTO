import test from 'node:test';
import assert from 'node:assert/strict';

import { initGame, select, submit } from '../../src/engine/engine.js';
import { board, MISS } from '../fixtures/board.js';

const GROWTH = ['Seed', 'Tree', 'Spark', 'Fire'];

test('every one of the four accepted orders solves the set', () => {
  const orders = [
    ['Seed', 'Tree', 'Spark', 'Fire'],
    ['Spark', 'Fire', 'Seed', 'Tree'],
    ['Tree', 'Seed', 'Fire', 'Spark'],
    ['Fire', 'Spark', 'Tree', 'Seed']
  ];
  for (const order of orders) {
    const { state, outcome } = submit(initGame(board), order);
    assert.equal(outcome.type, 'solved', `${order.join(' ')} should solve`);
    assert.equal(outcome.setId, 'set-growth');
    assert.deepEqual(state.solvedSetIds, ['set-growth']);
    assert.equal(state.mistakes, 0);
  }
});

test('a solved outcome always reports the canonical order, not the submitted one', () => {
  const { outcome } = submit(initGame(board), ['Fire', 'Spark', 'Tree', 'Seed']);
  assert.deepEqual(outcome.canonicalOrder, ['Seed', 'Tree', 'Spark', 'Fire']);
});

test('cross-pair A : C :: B : D is "so close", never solved', () => {
  const { state, outcome } = submit(initGame(board), ['Seed', 'Spark', 'Tree', 'Fire']);
  assert.equal(outcome.type, 'so-close');
  assert.deepEqual(state.solvedSetIds, []);
  assert.equal(state.boardTerms.length, 16);
});

test('other rearrangements of the right four words are also "so close"', () => {
  for (const order of [
    ['Tree', 'Fire', 'Seed', 'Spark'],
    ['Seed', 'Tree', 'Fire', 'Spark'],
    ['Fire', 'Tree', 'Spark', 'Seed']
  ]) {
    assert.equal(submit(initGame(board), order).outcome.type, 'so-close', order.join(' '));
  }
});

test('"so close" costs a mistake and clears the selection', () => {
  let state = initGame(board);
  for (const term of ['Seed', 'Spark', 'Tree', 'Fire']) state = select(state, term);
  const result = submit(state, state.selectedTerms);
  assert.equal(result.outcome.type, 'so-close');
  assert.equal(result.state.mistakes, 1);
  assert.deepEqual(result.state.selectedTerms, []);
});

test('the "so close" outcome leaks nothing about which set it was', () => {
  const { outcome } = submit(initGame(board), ['Seed', 'Spark', 'Tree', 'Fire']);
  assert.deepEqual(Object.keys(outcome), ['type']);
  assert.ok(!('setId' in outcome));
  assert.ok(!('canonicalOrder' in outcome));
});

test('four words from four sets is a miss', () => {
  const { state, outcome } = submit(initGame(board), MISS);
  assert.equal(outcome.type, 'miss');
  assert.equal(state.mistakes, 1);
  assert.deepEqual(state.selectedTerms, []);
});

test('three right and one wrong is a miss, not "so close"', () => {
  const { outcome } = submit(initGame(board), ['Seed', 'Tree', 'Spark', 'Painter']);
  assert.equal(outcome.type, 'miss');
});

test('solving removes exactly those four tiles and leaves the rest alone', () => {
  const before = initGame(board);
  const { state } = submit(before, GROWTH);
  assert.equal(state.boardTerms.length, 12);
  for (const term of GROWTH) assert.ok(!state.boardTerms.includes(term));
  assert.deepEqual(state.boardTerms, before.boardTerms.filter((t) => !GROWTH.includes(t)));
});

test('a submission that is not exactly four terms is invalid and costs nothing', () => {
  const start = initGame(board);
  for (const terms of [[], ['Seed'], ['Seed', 'Tree', 'Spark'], [...GROWTH, 'Brush'], null]) {
    const { state, outcome } = submit(start, terms);
    assert.equal(outcome.type, 'invalid');
    assert.equal(state.mistakes, 0);
    assert.deepEqual(state, start);
  }
});

test('a submission with duplicate terms is invalid and costs nothing', () => {
  const start = initGame(board);
  const { state, outcome } = submit(start, ['Seed', 'Seed', 'Tree', 'Spark']);
  assert.equal(outcome.type, 'invalid');
  assert.deepEqual(state, start);
});

test('a submission containing a term not on the board is invalid and costs nothing', () => {
  const start = initGame(board);
  const { state, outcome } = submit(start, ['Seed', 'Tree', 'Spark', 'Aardvark']);
  assert.equal(outcome.type, 'invalid');
  assert.deepEqual(state, start);
});

test('a solved set cannot be submitted twice — its words are off the board', () => {
  const { state } = submit(initGame(board), GROWTH);
  const { outcome } = submit(state, GROWTH);
  assert.equal(outcome.type, 'invalid');
});

test('solving all four sets wins', () => {
  let state = initGame(board);
  for (const set of board.sets) {
    state = submit(state, [...set.pairs[0], ...set.pairs[1]]).state;
  }
  assert.equal(state.status, 'won');
  assert.equal(state.solvedSetIds.length, 4);
  assert.equal(state.boardTerms.length, 0);
});

test('the fourth mistake loses, and submissions afterwards are inert', () => {
  let state = initGame(board);
  for (let i = 0; i < 4; i += 1) {
    const result = submit(state, MISS);
    state = result.state;
  }
  assert.equal(state.status, 'lost');
  assert.equal(state.mistakes, 4);

  const after = submit(state, GROWTH);
  assert.equal(after.outcome.type, 'invalid');
  assert.deepEqual(after.state, state);
});

test('rules.soCloseCostsMistake can be turned off without touching the engine', () => {
  const state = initGame(board, { soCloseCostsMistake: false });
  const result = submit(state, ['Seed', 'Spark', 'Tree', 'Fire']);
  assert.equal(result.outcome.type, 'so-close');
  assert.equal(result.state.mistakes, 0);
});

test('rules.clearSelectionOnFail can be turned off without touching the engine', () => {
  let state = initGame(board, { clearSelectionOnFail: false });
  for (const term of MISS) state = select(state, term);
  const result = submit(state, state.selectedTerms);
  assert.equal(result.outcome.type, 'miss');
  assert.deepEqual(result.state.selectedTerms, MISS);
});

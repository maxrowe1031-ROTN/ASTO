import test from 'node:test';
import assert from 'node:assert/strict';

import { initGame, revealVocab, shuffle, submit } from '../../src/engine/engine.js';
import { mulberry32 } from '../../src/engine/rng.js';
import { board } from '../fixtures/board.js';

// The Vocabulary button (design.md D-18): free, deterministic — the puzzle data
// names the word, so unlike hint() there is no RNG seam at all.
const glossed = () => ({
  ...board,
  glossary: [{ word: 'Chisel', definition: 'a bladed hand tool for shaping wood or stone' }]
});

test('revealVocab reveals the glossed word and spends nothing', () => {
  const { state, outcome } = revealVocab(initGame(glossed()));
  assert.equal(outcome.type, 'vocab');
  assert.deepEqual(Object.keys(outcome), ['type']);
  assert.deepEqual(state.vocabRevealed, ['Chisel']);
  assert.equal(state.mistakes, 0);
});

test('a board with no glossary no-ops', () => {
  const start = initGame(board);
  const { state, outcome } = revealVocab(start);
  assert.equal(state, start);
  assert.equal(outcome, null);
});

test('an empty glossary no-ops like an absent one', () => {
  const start = initGame({ ...board, glossary: [] });
  assert.equal(revealVocab(start).outcome, null);
});

test('a second reveal no-ops — the one entry is already out', () => {
  const first = revealVocab(initGame(glossed())).state;
  const second = revealVocab(first);
  assert.equal(second.state, first);
  assert.equal(second.outcome, null);
});

test('a glossed word whose set is already solved no-ops', () => {
  // Chisel belongs to set-tools; solve it first.
  const solved = submit(initGame(glossed()), ['Brush', 'Painter', 'Chisel', 'Sculptor']).state;
  const { state, outcome } = revealVocab(solved);
  assert.equal(state, solved);
  assert.equal(outcome, null);
});

test('revealVocab no-ops once the game is over', () => {
  let state = initGame(glossed());
  for (const terms of [
    ['Seed', 'Tree', 'Spark', 'Fire'],
    ['Brush', 'Painter', 'Chisel', 'Sculptor'],
    ['Nest', 'Bird', 'Den', 'Bear'],
    ['Dough', 'Bread', 'Clay', 'Pottery']
  ]) {
    state = submit(state, terms).state;
  }
  assert.equal(state.status, 'won');
  assert.equal(revealVocab(state).outcome, null);
});

test('the revealed word survives a shuffle', () => {
  const revealed = revealVocab(initGame(glossed())).state;
  const shuffled = shuffle(revealed, mulberry32(3));
  assert.deepEqual(shuffled.vocabRevealed, ['Chisel']);
});

test('revealVocab returns a frozen state and leaves its input untouched', () => {
  const start = initGame(glossed());
  const snapshot = JSON.parse(JSON.stringify(start));
  const { state } = revealVocab(start);
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.vocabRevealed));
  assert.deepEqual(JSON.parse(JSON.stringify(start)), snapshot);
});

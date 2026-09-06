import test from 'node:test';
import assert from 'node:assert/strict';

import { defineWord, initGame, revealVocab, shuffle, submit, withRules } from '../../src/engine/engine.js';
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

// ---------- Learning Mode (design.md D-33) ----------

const LEARNING = { learningMode: true };
const defined = () => ({
  ...glossed(),
  definitions: [
    { word: 'Seed', definition: 'the small hard part of a plant that a new plant grows from' },
    { word: 'Chisel', definition: 'a metal blade you hit with a mallet to carve wood or stone' }
  ]
});

test('with learning mode off, nothing new happens: no armed state, one reveal', () => {
  const start = initGame(defined());
  assert.equal(start.rules.learningMode, false);
  assert.equal(start.vocabArmed, false);
  const { state, outcome } = revealVocab(start);
  assert.equal(outcome.type, 'vocab');
  assert.deepEqual(state.vocabRevealed, ['Chisel']);
  assert.equal(state.vocabArmed, false);
});

test('with learning mode on, pressing Vocab arms the board instead of revealing', () => {
  const { state, outcome } = revealVocab(initGame(defined(), LEARNING));
  assert.deepEqual(outcome, { type: 'vocab-armed' });
  assert.equal(state.vocabArmed, true);
  assert.deepEqual(state.vocabRevealed, []);
});

test('pressing Vocab again while armed disarms', () => {
  const armed = revealVocab(initGame(defined(), LEARNING)).state;
  const { state, outcome } = revealVocab(armed);
  assert.deepEqual(outcome, { type: 'vocab-disarmed' });
  assert.equal(state.vocabArmed, false);
});

test('a tile tap while armed defines that word and disarms', () => {
  const armed = revealVocab(initGame(defined(), LEARNING)).state;
  const { state, outcome } = defineWord(armed, 'Seed');
  assert.deepEqual(outcome, { type: 'vocab' });
  assert.deepEqual(state.vocabRevealed, ['Seed']);
  assert.equal(state.vocabArmed, false);
  assert.deepEqual(state.selectedTerms, [], 'a define is not a select');
});

test('defineWord no-ops when not armed, off-board, or game over', () => {
  const idle = initGame(defined(), LEARNING);
  assert.equal(defineWord(idle, 'Seed').outcome, null);
  assert.equal(defineWord(idle, 'Seed').state, idle);

  const armed = revealVocab(idle).state;
  assert.equal(defineWord(armed, 'Cordwainer').outcome, null);
  assert.equal(defineWord(armed, 'Cordwainer').state, armed);
});

test('defining a word twice moves it to the end — the latest reveal wins', () => {
  let state = revealVocab(initGame(defined(), LEARNING)).state;
  state = defineWord(state, 'Seed').state;
  state = defineWord(revealVocab(state).state, 'Chisel').state;
  state = defineWord(revealVocab(state).state, 'Seed').state;
  assert.deepEqual(state.vocabRevealed, ['Chisel', 'Seed']);
});

test('a word with no definition can still be "defined" — the view says so, the engine records it', () => {
  const armed = revealVocab(initGame(defined(), LEARNING)).state;
  const { state, outcome } = defineWord(armed, 'Bear');
  assert.deepEqual(outcome, { type: 'vocab' });
  assert.deepEqual(state.vocabRevealed, ['Bear']);
});

test('withRules merges rules on the live state and disarms when learning mode turns off', () => {
  const armed = revealVocab(initGame(defined(), LEARNING)).state;
  const off = withRules(armed, { learningMode: false });
  assert.equal(off.rules.learningMode, false);
  assert.equal(off.rules.maxMistakes, armed.rules.maxMistakes, 'other rules survive');
  assert.equal(off.vocabArmed, false);
  assert.ok(Object.isFrozen(off));
  assert.ok(Object.isFrozen(off.rules));

  const on = withRules(initGame(defined()), { learningMode: true });
  assert.equal(on.rules.learningMode, true);
  assert.deepEqual(revealVocab(on).outcome, { type: 'vocab-armed' });
});

test('learning-mode functions return frozen states and never mutate their input', () => {
  const start = revealVocab(initGame(defined(), LEARNING)).state;
  const snapshot = JSON.parse(JSON.stringify(start));
  const { state } = defineWord(start, 'Seed');
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.vocabRevealed));
  assert.deepEqual(JSON.parse(JSON.stringify(start)), snapshot);
});

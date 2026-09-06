import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeDefinitions, mergeGlossary } from '../../studio/gloss.js';

const board = {
  id: 'b',
  title: 'T',
  sets: [
    { id: 's1', relationshipLabel: 'r', explanation: 'e', pairs: [['Chisel', 'Sculptor'], ['Brush', 'Painter']], difficulty: 1 }
  ]
};

test('entries whose word is on the board ride along', () => {
  const { board: merged, dropped } = mergeGlossary(board, [
    { word: 'Chisel', definition: 'A carving tool.' }
  ]);
  assert.deepEqual(merged.glossary, [{ word: 'Chisel', definition: 'A carving tool.' }]);
  assert.deepEqual(dropped, []);
});

test('matching is case-insensitive, the same rule the validator applies', () => {
  const { board: merged, dropped } = mergeGlossary(board, [
    { word: 'chisel', definition: 'A carving tool.' }
  ]);
  assert.equal(merged.glossary.length, 1);
  assert.deepEqual(dropped, []);
});

test('an entry whose word left the board is dropped, and the drop is reported', () => {
  const { board: merged, dropped } = mergeGlossary(board, [
    { word: 'Chisel', definition: 'Stays.' },
    { word: 'Loom', definition: 'Edited away.' }
  ]);
  assert.deepEqual(merged.glossary, [{ word: 'Chisel', definition: 'Stays.' }]);
  assert.deepEqual(dropped, [{ word: 'Loom', definition: 'Edited away.' }]);
});

test('no glossary, or none surviving, leaves the board without the field entirely', () => {
  assert.equal('glossary' in mergeGlossary(board, undefined).board, false);
  assert.equal('glossary' in mergeGlossary(board, []).board, false);
  const { board: merged, dropped } = mergeGlossary(board, [{ word: 'Loom', definition: 'x' }]);
  assert.equal('glossary' in merged, false);
  assert.equal(dropped.length, 1);
});

test('the input board is never mutated', () => {
  const frozen = structuredClone(board);
  mergeGlossary(board, [{ word: 'Chisel', definition: 'd' }]);
  assert.deepEqual(board, frozen);
});

// Learning Mode definitions (D-33) follow the gloss's drop rule exactly.
test('definitions whose word is on the board ride along; a departed word is dropped and reported', () => {
  const { board: merged, dropped } = mergeDefinitions(board, [
    { word: 'chisel', definition: 'Stays, case aside.' },
    { word: 'Loom', definition: 'Edited away.' }
  ]);
  assert.deepEqual(merged.definitions, [{ word: 'chisel', definition: 'Stays, case aside.' }]);
  assert.deepEqual(dropped, [{ word: 'Loom', definition: 'Edited away.' }]);
  assert.equal('glossary' in merged, false, 'the other field is untouched');
});

test('no definitions, or none surviving, leaves the board without the field', () => {
  assert.equal('definitions' in mergeDefinitions(board, undefined).board, false);
  assert.equal('definitions' in mergeDefinitions(board, [{ word: 'Loom', definition: 'x' }]).board, false);
});

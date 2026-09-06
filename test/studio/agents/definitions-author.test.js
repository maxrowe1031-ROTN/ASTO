// The Definitions Author (design.md D-33) — one plain definition per board
// word, for Learning Mode. The leak rule is RELAXED here by Max's decision:
// a definition may say what a thing does. What the validator still enforces is
// completeness — every word once, nothing extra, nothing empty.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as author from '../../../studio/agents/definitions-author.js';

const BOARD = {
  id: 'asto-test',
  title: 'Sewing Room',
  sets: [
    { id: 'set-a', relationshipLabel: 'a', explanation: 'e', difficulty: 1,
      pairs: [['jar', 'button'], ['spool', 'thread']] },
    { id: 'set-b', relationshipLabel: 'b', explanation: 'e', difficulty: 2,
      pairs: [['thimble', 'needle'], ['buttonhook', 'boot']] },
    { id: 'set-c', relationshipLabel: 'c', explanation: 'e', difficulty: 3,
      pairs: [['loose', 'missing'], ['new', 'outgrown']] },
    { id: 'set-d', relationshipLabel: 'd', explanation: 'e', difficulty: 4,
      pairs: [['snap', 'buttonhole'], ['zipper', 'shank']] },
  ],
};
const WORDS = BOARD.sets.flatMap((set) => set.pairs.flat());
const full = () => ({ definitions: WORDS.map((word) => ({ word, definition: `plainly, a ${word}` })) });
const validate = (output) => author.validateOutput(output, { input: { board: BOARD } });

test('the prompt asks for all sixteen, plainly, and steers off naming the pairing', () => {
  const prompt = author.buildPrompt({ board: BOARD }, {});
  assert.match(prompt, /sixteen|16/);
  assert.match(prompt, /may say what it does|what it is for|does/i);
  assert.match(prompt, /never say which board words pair up/i);
  assert.match(prompt, /buttonhook/);
});

test('sixteen well-formed entries validate', () => {
  const result = validate(full());
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test('a definition may mention another board word — the leak rule is relaxed here', () => {
  const output = full();
  output.definitions[0].definition = 'a small disc sewn on with thread';
  assert.equal(validate(output).ok, true);
});

test('a missing word is refused, and named', () => {
  const output = full();
  output.definitions.pop();
  const result = validate(output);
  assert.equal(result.ok, false);
  assert.match(JSON.stringify(result.errors), /shank/);
});

test('an extra word is refused', () => {
  const output = full();
  output.definitions.push({ word: 'cordwainer', definition: 'a shoemaker' });
  const result = validate(output);
  assert.equal(result.ok, false);
  assert.match(JSON.stringify(result.errors), /cordwainer/);
});

test('a word defined twice is refused', () => {
  const output = full();
  output.definitions[1] = { ...output.definitions[0] };
  assert.equal(validate(output).ok, false);
});

test('matching is case-insensitive, like the game validator', () => {
  const output = full();
  output.definitions[0].word = output.definitions[0].word.toUpperCase();
  assert.equal(validate(output).ok, true);
});

test('an over-long definition is refused by the schema', () => {
  const output = full();
  output.definitions[0].definition = 'x'.repeat(161);
  assert.equal(validate(output).ok, false);
});

test('without input it validates shape only', () => {
  assert.equal(author.validateOutput({ definitions: [] }).ok, true);
});

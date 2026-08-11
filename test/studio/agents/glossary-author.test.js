// The Glossary Author (design.md D-18) — one editorially authored definition
// for the board's hardest word, or none when the board is open.
//
// The leak is the whole risk: a dictionary gloss of a trade noun usually states
// the noun's function, which is usually the set's relationship. So the rules
// live in the prompt AND in a validator (D-7: an instruction is a request) —
// the mechanical check being that a definition may not contain any other board
// word, and may only define a word 07 actually flagged.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as author from '../../../studio/agents/glossary-author.js';

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

const GATED = [
  { word: 'shank', note: 'sewing jargon for the loop on a button back' },
  { word: 'buttonhook', note: 'antique tool few would know' },
];

const input = { board: BOARD, knowledgeGated: GATED };
const validate = (output) => author.validateOutput(output, { input });

test('the prompt carries the leak rules and the gated candidates', () => {
  const prompt = author.buildPrompt(input, {});
  assert.match(prompt, /what the thing IS/i);
  assert.match(prompt, /never|not/i);
  assert.match(prompt, /shank/);
  assert.match(prompt, /buttonhook/);
  assert.match(prompt, /exactly one/i);
});

test('with nothing flagged, the prompt asks the author to pick the hardest word itself', () => {
  const prompt = author.buildPrompt({ board: BOARD, knowledgeGated: [] }, {});
  assert.match(prompt, /pick.*hardest|hardest.*pick/i);
  assert.match(prompt, /every board/i);
});

test('one well-formed entry for a gated word validates', () => {
  const result = validate({
    glossary: [{ word: 'shank', definition: 'a small loop on the back of a fastener' }],
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

// Reversed 2026-08-11 (D-18 addendum): Max's candlelight playtest — "taper"
// stumped him and no agent had flagged it. His direction: EVERY board gets a
// vocab word, flagged or not. An empty glossary is now the refused answer.
test('an empty glossary is refused — every board gets a vocab word', () => {
  const result = validate({ glossary: [] });
  assert.equal(result.ok, false);
  assert.match(JSON.stringify(result.errors), /every board/i);
});

test('more than one entry is refused — one word for now, editorially', () => {
  const two = {
    glossary: [
      { word: 'shank', definition: 'a small loop on the back of a fastener' },
      { word: 'buttonhook', definition: 'a hooked hand tool' },
    ],
  };
  assert.equal(validate(two).ok, false);
});

test('a word 07 never flagged is refused', () => {
  const result = validate({ glossary: [{ word: 'zipper', definition: 'a sliding fastener' }] });
  assert.equal(result.ok, false);
  assert.match(JSON.stringify(result.errors), /flagged|knowledgeGated|gated/i);
});

test('a definition containing another board word is refused — the leak check', () => {
  const leaky = validate({
    glossary: [{ word: 'shank', definition: 'the loop that holds a button clear of the buttonhole' }],
  });
  assert.equal(leaky.ok, false);
  assert.match(JSON.stringify(leaky.errors), /board word/i);
});

test('the leak check matches whole words, not substrings', () => {
  // "snapped" contains board word "snap" only as a substring — allowed.
  const result = validate({
    glossary: [{ word: 'shank', definition: 'a snapped-on loop at the back of a fastener' }],
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

// When 07 flagged nothing, the author picks the board's hardest word itself —
// any board word is a legal pick (the candlelight case: taper, unflagged).
test('when nothing was gated, any board word may be glossed', () => {
  const open = author.validateOutput(
    { glossary: [{ word: 'thimble', definition: 'a small protective cap worn while sewing' }] },
    { input: { board: BOARD, knowledgeGated: [] } },
  );
  assert.equal(open.ok, true, JSON.stringify(open.errors));
});

test('a word not on the board is refused even when nothing was gated', () => {
  const open = author.validateOutput(
    { glossary: [{ word: 'cordwainer', definition: 'a shoemaker' }] },
    { input: { board: BOARD, knowledgeGated: [] } },
  );
  assert.equal(open.ok, false);
});

test('without input it validates shape only', () => {
  assert.equal(author.validateOutput({ glossary: [] }).ok, true);
});

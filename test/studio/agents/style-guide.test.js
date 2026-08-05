// Style Guide semantics — the unity verdict (design.md D-3).
//
// Unity is the half of ASTO's goal that cannot be mechanically gated: the
// theme unifies the words, and only a judgement can say whether sixteen words
// read as one world. So it is scored and SHOWN, never enforced — and these
// tests pin the two disciplines that make the score usable: the verdict must
// name its evidence, and the sixteen words must actually reach the prompt.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as styleGuide from '../../../studio/agents/style-guide.js';

const output = (overrides = {}) => ({
  compliant: true,
  edits: [],
  unity: { verdict: 'strong', reasoning: 'One world.', outliers: [] },
  ...overrides,
});

test('a compliant output with a strong unity verdict validates', () => {
  assert.equal(styleGuide.validateOutput(output()).ok, true);
});

test('unity is required — an output without it is rejected', () => {
  const { unity, ...rest } = output();
  assert.equal(styleGuide.validateOutput(rest).ok, false);
});

test('a weak verdict must name the words that break the world', () => {
  const result = styleGuide.validateOutput(
    output({ unity: { verdict: 'weak', reasoning: 'Scattered.', outliers: [] } }),
  );
  assert.equal(result.ok, false);
  assert.match(result.errors[0].message, /name the words/i);
});

test('a weak verdict with its outliers named validates', () => {
  const result = styleGuide.validateOutput(
    output({
      unity: {
        verdict: 'weak',
        reasoning: 'Two puzzles sharing a title.',
        outliers: [{ word: 'Ghost', note: 'astronomy board, folklore word' }],
      },
    }),
  );
  assert.equal(result.ok, true);
});

test('an invented verdict is rejected by the schema', () => {
  const result = styleGuide.validateOutput(
    output({ unity: { verdict: 'superb', reasoning: 'x', outliers: [] } }),
  );
  assert.equal(result.ok, false);
});

test('the sixteen words reach the prompt — unity cannot be judged from labels alone', () => {
  const prompt = styleGuide.buildPrompt(
    {
      title: 'Night',
      words: ['Firefly', 'Glow', 'Cricket', 'Chirp'],
      items: [{ setId: 's1', relationshipLabel: 'l', explanation: 'e' }],
    },
    {},
  );
  assert.match(prompt, /Firefly/);
  assert.match(prompt, /unity/i);
  assert.match(prompt, /outliers/i);
});

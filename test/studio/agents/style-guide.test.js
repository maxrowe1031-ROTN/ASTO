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
  evocativeness: { verdict: 'strong', reasoning: 'Reaches for what is distinctive.', generic: [] },
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

// --- evocativeness (design.md D-7) ---
//
// The axis unity could not see. On 2026-08-05 this agent rated a Grateful Dead
// board "unity: strong" — "every word sits comfortably inside one coherent
// world" — and Max rejected it as "an absolute snooze". Both were right: a
// board of a subject's most obvious nouns is perfectly unified BY
// CONSTRUCTION, so unity can never catch it. `not-evocative` was the top tag
// of that batch at 15 uses across four boards, and nothing in the pipeline
// asked the question.

test('evocativeness is required — an output without it is rejected', () => {
  const { evocativeness, ...rest } = output();
  assert.equal(styleGuide.validateOutput(rest).ok, false);
});

test('the two verdicts are independent — strong unity with a generic board validates', () => {
  // Precisely the Grateful Dead state. If the schema made this combination
  // awkward it would be pushing the agent toward agreeing with itself.
  const result = styleGuide.validateOutput(
    output({
      unity: { verdict: 'strong', reasoning: 'One coherent world.', outliers: [] },
      evocativeness: {
        verdict: 'generic',
        reasoning: 'The most obvious nouns for the subject, arranged correctly.',
        generic: [{ word: 'guitarist', suggestion: 'Jerry', note: 'The generic role where the subject offers a name.' }],
      },
    }),
  );
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test('a generic verdict must name the words that settled for the obvious', () => {
  const result = styleGuide.validateOutput(
    output({
      evocativeness: { verdict: 'generic', reasoning: 'All very obvious.', generic: [] },
    }),
  );
  assert.equal(result.ok, false);
  assert.match(JSON.stringify(result.errors), /must name the words/);
});

test('a suggestion is optional — naming the flat word is worth something on its own', () => {
  const result = styleGuide.validateOutput(
    output({
      evocativeness: {
        verdict: 'generic',
        reasoning: 'Obvious throughout.',
        generic: [{ word: 'workshop', note: 'Too broad — many workshops are not for woodworking.' }],
      },
    }),
  );
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test('an adequate verdict needs no named words', () => {
  assert.equal(
    styleGuide.validateOutput(
      output({ evocativeness: { verdict: 'adequate', reasoning: 'Near the middle.', generic: [] } }),
    ).ok,
    true,
  );
});

test('"weak" is not an evocativeness verdict — the scale names the failure', () => {
  assert.equal(
    styleGuide.validateOutput(
      output({ evocativeness: { verdict: 'weak', reasoning: 'x', generic: [] } }),
    ).ok,
    false,
  );
});

// Without the theme the agent can only ask whether the board agrees with its
// own title, which is not the question.
test('the theme Max typed reaches the prompt, and is asked about by name', () => {
  const prompt = styleGuide.buildPrompt(
    { theme: 'the Grateful Dead', title: 'Long Strange Trip', words: ['a'], items: [] },
    {},
  );
  assert.match(prompt, /EVOCATIVENESS/);
  assert.match(prompt, /The subject is: the Grateful Dead/);
});

test('with no theme it still asks the question, without inventing a subject', () => {
  const prompt = styleGuide.buildPrompt({ title: 'Untitled', words: ['a'], items: [] }, {});
  assert.match(prompt, /EVOCATIVENESS/);
  assert.ok(!prompt.includes('The subject is:'), 'invented a subject it was not given');
});

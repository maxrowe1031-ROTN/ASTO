// Difficulty Rater semantics — the "predicted" half of §16's Difficulty Loop.
// It must commit to 1–4 or abstain, and never both.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as rater from '../../../studio/agents/difficulty-rater.js';

const graded = (overrides = {}) => ({
  grades: [{ setId: 's1', difficulty: 2, rationale: 'clear once the words couple up' }, ...(overrides.extra ?? [])],
});

test('a committed grade validates', () => {
  assert.equal(rater.validateOutput(graded()).ok, true);
});

test('an abstention validates when it carries no difficulty', () => {
  const output = { grades: [{ setId: 's1', abstained: true, rationale: 'straddles 2 and 3' }] };
  assert.equal(rater.validateOutput(output).ok, true);
});

test('abstaining while also grading is rejected — commit or abstain, not both', () => {
  const output = {
    grades: [{ setId: 's1', abstained: true, difficulty: 3, rationale: 'hedging' }],
  };
  const result = rater.validateOutput(output);
  assert.equal(result.ok, false);
  assert.match(result.errors[0].message, /must not also carry a difficulty/);
});

test('neither grading nor abstaining is rejected', () => {
  const output = { grades: [{ setId: 's1', rationale: 'no opinion offered' }] };
  const result = rater.validateOutput(output);
  assert.equal(result.ok, false);
  assert.match(result.errors[0].message, /required unless/);
});

test('a difficulty outside 1–4 is rejected', () => {
  for (const difficulty of [0, 5, -1]) {
    const output = { grades: [{ setId: 's1', difficulty, rationale: 'x' }] };
    assert.equal(rater.validateOutput(output).ok, false, `accepted ${difficulty}`);
  }
});

test('a fractional difficulty is rejected — tiers are integers', () => {
  const output = { grades: [{ setId: 's1', difficulty: 2.5, rationale: 'x' }] };
  assert.equal(rater.validateOutput(output).ok, false);
});

test('grading the same set twice is rejected', () => {
  const output = {
    grades: [
      { setId: 's1', difficulty: 1, rationale: 'a' },
      { setId: 's1', difficulty: 3, rationale: 'b' },
    ],
  };
  const result = rater.validateOutput(output);
  assert.equal(result.ok, false);
  assert.match(result.errors[0].message, /more than once/);
});

test('every grade needs a rationale — calibration later depends on the why', () => {
  const output = { grades: [{ setId: 's1', difficulty: 2 }] };
  assert.equal(rater.validateOutput(output).ok, false);
});

test('an empty grade list is rejected', () => {
  assert.equal(rater.validateOutput({ grades: [] }).ok, false);
});

test('the prompt defines all four tiers, not just "easy" and "hard"', () => {
  const prompt = rater.buildPrompt({ sets: [] }, {});
  for (const tier of ['1 —', '2 —', '3 —', '4 —']) {
    assert.ok(prompt.includes(tier), `prompt does not define tier ${tier}`);
  }
});

test('the prompt grades sets individually, never whole boards', () => {
  const prompt = rater.buildPrompt({ sets: [] }, {});
  assert.match(prompt, /on its own|not looking at a board/i);
});

test('the prompt permits abstention rather than guessing', () => {
  const prompt = rater.buildPrompt({ sets: [] }, {});
  assert.match(prompt, /abstained/);
  assert.match(prompt, /do not guess/i);
});

test('the prompt keeps hard from meaning arbitrary', () => {
  const prompt = rater.buildPrompt({ sets: [] }, {});
  assert.match(prompt, /never mean arbitrary/i);
});

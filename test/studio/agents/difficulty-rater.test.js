// Difficulty Rater semantics — the "predicted" half of §16's Difficulty Loop.
// It must commit to 1–4 or abstain, and never both.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as rater from '../../../studio/agents/difficulty-rater.js';

const graded = (overrides = {}) => ({
  grades: [
    { setId: 's1', difficulty: 2, difficultySource: 'arrangement', rationale: 'clear once the words couple up' },
    ...(overrides.extra ?? []),
  ],
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

// --- where the difficulty comes from (design.md D-8) ---------------------
//
// Until 2026-08-05 this agent was told to judge "clarity, abstraction,
// FAMILIARITY and misdirection" — so a rare word simply WAS difficulty. Paired
// with 04 promoting whatever it ranks hardest, that made vocabulary the
// pipeline's only reliable route to Black: coronagraph, speleothem,
// Paris-Roubaix. Max's verdict on that batch was "publishable" and "no rush".
//
// Familiarity still moves a grade. What is new is that the grade has to say
// which kind of hard it is, because "hard" turned out to be two things wearing
// one number.

test('a graded set must name where its difficulty comes from', () => {
  const missing = { grades: [{ setId: 's1', difficulty: 4, rationale: 'hard' }] };
  const result = rater.validateOutput(missing);
  assert.equal(result.ok, false);
  assert.match(JSON.stringify(result.errors), /arrangement, vocabulary or both/);
});

test('all three sources are accepted — neither kind is the wrong answer', () => {
  for (const source of ['arrangement', 'vocabulary', 'both']) {
    const output = { grades: [{ setId: 's1', difficulty: 4, difficultySource: source, rationale: 'r' }] };
    assert.equal(rater.validateOutput(output).ok, true, source);
  }
});

test('an invented source is refused', () => {
  const output = { grades: [{ setId: 's1', difficulty: 4, difficultySource: 'vibes', rationale: 'r' }] };
  assert.equal(rater.validateOutput(output).ok, false);
});

// There is no grade to explain the source of.
test('an abstention needs no source', () => {
  const output = { grades: [{ setId: 's1', abstained: true, rationale: 'straddles 2 and 3' }] };
  assert.equal(rater.validateOutput(output).ok, true);
});

test('the two kinds are taught by example in the prompt, and neither is preferred', () => {
  const prompt = rater.buildPrompt({ sets: [{ id: 's1', relationshipLabel: 'x', pairs: [['a', 'b'], ['c', 'd']] }] }, {});
  assert.match(prompt, /difficultySource/);
  assert.match(prompt, /planting : felling :: budding : withering/);
  assert.match(prompt, /speleothem : stalactite/);
  assert.match(prompt, /Neither is better/);
  // The clause that made a rare word into difficulty by itself is gone.
  assert.ok(!/clarity, abstraction, familiarity and misdirection/i.test(prompt));
});

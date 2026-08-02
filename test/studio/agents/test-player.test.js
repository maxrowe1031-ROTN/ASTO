// The Test-Player must be BLIND. Its simulated play is only worth anything as
// a difficulty signal if it never saw the answers — so these tests try to leak
// the solution into it every way the pipeline could, and assert it cannot.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as testPlayer from '../../../studio/agents/test-player.js';
import firstLight from '../../../puzzles/first-light.json' with { type: 'json' };

const words = firstLight.sets.flatMap((set) => set.pairs.flat());

test('the prompt contains the sixteen words', () => {
  const prompt = testPlayer.buildPrompt({ words, maxMistakes: 4 }, {});
  for (const word of words) {
    assert.ok(prompt.includes(word), `missing board word ${word}`);
  }
});

test('the prompt leaks no relationship label, explanation, difficulty or set id', () => {
  const prompt = testPlayer.buildPrompt({ words, maxMistakes: 4 }, {});
  for (const set of firstLight.sets) {
    assert.ok(!prompt.includes(set.relationshipLabel), `leaked label: ${set.relationshipLabel}`);
    assert.ok(!prompt.includes(set.explanation), `leaked explanation for ${set.id}`);
    assert.ok(!prompt.includes(set.id), `leaked set id: ${set.id}`);
  }
});

test('handing the whole board in cannot leak it — extra input keys are ignored', () => {
  // The pipeline should pass only { words }, but a future refactor might pass
  // more by accident. buildPrompt reads a narrow allowlist, so it cannot leak.
  const prompt = testPlayer.buildPrompt(
    { words, maxMistakes: 4, sets: firstLight.sets, board: firstLight, integrity: { accepted: 16 } },
    {},
  );
  for (const set of firstLight.sets) {
    assert.ok(!prompt.includes(set.relationshipLabel), `leaked label: ${set.relationshipLabel}`);
    assert.ok(!prompt.includes(set.explanation), `leaked explanation for ${set.id}`);
  }
  assert.ok(!prompt.includes('"difficulty"'), 'leaked the difficulty field');
  assert.ok(!prompt.includes('integrity'), 'leaked the integrity report');
});

test('the words are not grouped by set in the prompt — even ordering is a hint', () => {
  const prompt = testPlayer.buildPrompt({ words, maxMistakes: 4 }, {});
  // The pipeline shuffles before calling; assert the agent does not re-derive
  // groupings by emitting anything set-shaped around the words.
  assert.ok(!/pairs/i.test(prompt), 'prompt mentions pairs structure');
  assert.ok(!/set-\w+/.test(prompt), 'prompt contains a set id pattern');
});

test('the prompt states the real loss condition and that order counts', () => {
  const prompt = testPlayer.buildPrompt({ words, maxMistakes: 4 }, {});
  assert.match(prompt, /4th mistake|4 ?th mistake/i);
  assert.match(prompt, /order/i);
});

test('the mistake allowance is what the caller passes, not a constant', () => {
  const prompt = testPlayer.buildPrompt({ words, maxMistakes: 3 }, {});
  assert.match(prompt, /3rd mistake/i);
});

// --- output validation ---

const goodTrial = () => ({
  trials: [
    {
      submissions: [
        { words: ['Seed', 'Tree', 'Spark', 'Fire'], relationshipGuess: 'grows into', confidence: 0.8 },
      ],
      mistakes: 1,
      solved: true,
      reasoning: 'Found the growth pair first, then chased a false trail on Nest.',
      estimatedDifficulty: 2,
    },
  ],
});

test('a well-formed play report validates', () => {
  assert.equal(testPlayer.validateOutput(goodTrial()).ok, true);
});

test('a trial cannot be solved and out of mistakes at once', () => {
  const output = goodTrial();
  output.trials[0].mistakes = 4;
  const result = testPlayer.validateOutput(output);
  assert.equal(result.ok, false);
  assert.match(result.errors[0].message, /solved trial cannot/);
});

test('a submission must be four distinct words', () => {
  const output = goodTrial();
  output.trials[0].submissions[0].words = ['Seed', 'Seed', 'Spark', 'Fire'];
  assert.equal(testPlayer.validateOutput(output).ok, false);
});

test('a submission must be exactly four words — not three, not five', () => {
  for (const wordSet of [['A', 'B', 'C'], ['A', 'B', 'C', 'D', 'E']]) {
    const output = goodTrial();
    output.trials[0].submissions[0].words = wordSet;
    assert.equal(testPlayer.validateOutput(output).ok, false, `accepted ${wordSet.length} words`);
  }
});

test('confidence outside 0–1 is rejected', () => {
  for (const confidence of [-0.1, 1.5]) {
    const output = goodTrial();
    output.trials[0].submissions[0].confidence = confidence;
    assert.equal(testPlayer.validateOutput(output).ok, false, `accepted ${confidence}`);
  }
});

test('an estimated difficulty outside 1–4 is rejected', () => {
  const output = goodTrial();
  output.trials[0].estimatedDifficulty = 5;
  assert.equal(testPlayer.validateOutput(output).ok, false);
});

test('multiple trials are allowed — several independent runs inform the grade', () => {
  const output = goodTrial();
  output.trials.push({ ...output.trials[0], solved: false, mistakes: 4 });
  assert.equal(testPlayer.validateOutput(output).ok, true);
  assert.equal(output.trials.length, 2);
});

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

// --- orderGuessed (design.md D-9, 2026-08-06) ------------------------------
//
// The second detector, and the same argument as knowledgeGated one rung in: a
// model does not experience a coin flip, it picks an order and writes a fluent
// rationale for it. So the agent whose whole job is "how does this feel to
// play" scores a set the player loses a mistake on as a clean solve, and has
// to be asked about the order out loud.

test('the prompt asks for orderGuessed, and names the keys its schema requires', () => {
  const prompt = testPlayer.buildPrompt({ words, maxMistakes: 4 }, {});
  assert.match(prompt, /"orderGuessed"/);
  assert.match(prompt, /"words"/);
  assert.match(prompt, /"note"/);
});

test('the prompt teaches the real engine rule — turn both halves or neither', () => {
  const prompt = testPlayer.buildPrompt({ words, maxMistakes: 4 }, {});
  // "order matters" alone does not explain why a consistent flip is free and an
  // inconsistent one costs a life, which is the whole defect being detected.
  assert.match(prompt, /B : A :: D : C is accepted/);
  assert.match(prompt, /B : A :: C : D is a mistake/);
});

test('asking about order does not describe the board — blindness is preserved', () => {
  // The guard that caught this instruction on its first draft: the word "pairs"
  // tells a blind agent how the sixteen words are structured.
  const prompt = testPlayer.buildPrompt({ words, maxMistakes: 4 }, {});
  assert.ok(!/pairs/i.test(prompt), 'prompt mentions pairs structure');
  assert.ok(!/set-\w+/.test(prompt), 'prompt contains a set id pattern');
});

test('an empty orderGuessed is named as a real answer, so silence is a verdict', () => {
  const prompt = testPlayer.buildPrompt({ words, maxMistakes: 4 }, {});
  assert.match(prompt, /empty (array|list) is a real answer/i);
});

test('orderGuessed validates as four words with a note, and rejects a short set', () => {
  const trial = {
    submissions: [{ words: ['a', 'b', 'c', 'd'], confidence: 0.5 }],
    mistakes: 0,
    solved: true,
    reasoning: 'r',
  };
  const good = testPlayer.validateOutput({
    trials: [trial],
    orderGuessed: [{ words: ['Ruth', 'Gehrig', 'Mantle', 'Maris'], note: 'nothing says which leads' }],
  });
  assert.equal(good.ok, true, JSON.stringify(good.errors));

  const short = testPlayer.validateOutput({
    trials: [trial],
    orderGuessed: [{ words: ['Ruth', 'Gehrig'], note: 'n' }],
  });
  assert.equal(short.ok, false);
});

test('omitting orderGuessed entirely still validates — it is not required', () => {
  // An older attempt, or a revision replaying one, must not fail on a field
  // that did not exist when it ran.
  const result = testPlayer.validateOutput({
    trials: [{ submissions: [{ words: ['a', 'b', 'c', 'd'], confidence: 0.5 }], mistakes: 0, solved: true, reasoning: 'r' }],
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

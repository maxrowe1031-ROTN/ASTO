// Board Builder semantics. Its output is a schema-v1.0 board, so the decisive
// test is that a board this agent accepts is also accepted by the GAME's own
// validator — one schema, no drift.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as boardBuilder from '../../../studio/agents/board-builder.js';
import { validatePuzzle } from '../../../src/source/validate-puzzle.js';
import firstLight from '../../../puzzles/first-light.json' with { type: 'json' };

const goodOutput = () => ({
  board: structuredClone(firstLight),
  falseTrails: [{ words: ['Nest', 'Den'], note: 'both read as shelters, pulling toward the material set' }],
});

test('a board the agent accepts also passes the game validator', () => {
  const output = goodOutput();
  assert.equal(boardBuilder.validateOutput(output).ok, true);
  assert.equal(validatePuzzle(output.board).ok, true);
});

test('a refusal validates on its own', () => {
  assert.equal(
    boardBuilder.validateOutput({ insufficientSets: 'only two usable sets at difficulty 3 or 4' }).ok,
    true,
  );
});

test('returning both a board and a refusal is rejected', () => {
  const output = { ...goodOutput(), insufficientSets: 'hedging' };
  const result = boardBuilder.validateOutput(output);
  assert.equal(result.ok, false);
  assert.match(result.errors[0].message, /exactly one/);
});

test('returning neither is rejected', () => {
  const result = boardBuilder.validateOutput({ falseTrails: [] });
  assert.equal(result.ok, false);
  assert.match(result.errors[0].message, /exactly one/);
});

test('a repeated difficulty is rejected — one set per tier', () => {
  const output = goodOutput();
  output.board.sets[1].difficulty = 1;
  const result = boardBuilder.validateOutput(output);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /difficulty 1–4 must appear exactly once/.test(e.message)));
});

test('a word repeated across sets is rejected, ignoring case', () => {
  const output = goodOutput();
  output.board.sets[1].pairs[0][0] = 'SEED'; // already in set 0 as "Seed"
  const result = boardBuilder.validateOutput(output);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /distinct/.test(e.message)));
});

test('duplicate set ids are rejected', () => {
  const output = goodOutput();
  output.board.sets[1].id = output.board.sets[0].id;
  assert.equal(boardBuilder.validateOutput(output).ok, false);
});

test('three sets is rejected — a board is always four', () => {
  const output = goodOutput();
  output.board.sets.pop();
  assert.equal(boardBuilder.validateOutput(output).ok, false);
});

test('a missing explanation is rejected — the loss screen needs it', () => {
  const output = goodOutput();
  delete output.board.sets[2].explanation;
  const result = boardBuilder.validateOutput(output);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path.includes('explanation')));
});

test('a pair with three words is rejected', () => {
  const output = goodOutput();
  output.board.sets[0].pairs[0] = ['Seed', 'Tree', 'Sprout'];
  assert.equal(boardBuilder.validateOutput(output).ok, false);
});

test('a difficulty outside 1–4 is rejected', () => {
  const output = goodOutput();
  output.board.sets[0].difficulty = 0;
  assert.equal(boardBuilder.validateOutput(output).ok, false);
});

test('the prompt forbids the pre-v1.0 fields the game validator rejects', () => {
  const prompt = boardBuilder.buildPrompt({ gradedSets: [] }, {});
  assert.match(prompt, /no "words" array/i);
  assert.match(prompt, /no "tier" field|not? set carries a "tier"/i);
});

test('the prompt says order carries meaning and is never sorted', () => {
  const prompt = boardBuilder.buildPrompt({ gradedSets: [] }, {});
  assert.match(prompt, /never sorted|order carries/i);
});

test('the prompt distinguishes a false trail from a second valid solution', () => {
  const prompt = boardBuilder.buildPrompt({ gradedSets: [] }, {});
  assert.match(prompt, /never be an actual second valid solution/i);
});

// --- promotion (decided with Max, 2026-08-03) -----------------------------
//
// The difficulty rater has never once returned a 4 — ten graded sets across
// two real runs came back 1,2,3,1,2 and 1,2,2,3. Faced with no difficulty-4
// candidate the builder used to refuse, and on a rebuild it invented a set of
// its own that nothing had rated. Max's call: ship the board anyway, and
// label the hardest set you actually have as Black even though it was graded
// lower. Raising the rater's ceiling is a thing to TRAIN through the review
// loop, so the promotion has to be visible rather than silently absorbed.

test('a promoted set is recorded with the grade it actually got', () => {
  const output = {
    board: structuredClone(firstLight),
    falseTrails: [],
    promotions: [{ setId: 'set-material', gradedDifficulty: 3, assignedDifficulty: 4 }],
  };
  assert.equal(boardBuilder.validateOutput(output).ok, true);
});

test('a promotion that claims no change is rejected — it is not a promotion', () => {
  const output = {
    board: structuredClone(firstLight),
    falseTrails: [],
    promotions: [{ setId: 'set-material', gradedDifficulty: 4, assignedDifficulty: 4 }],
  };
  const result = boardBuilder.validateOutput(output);
  assert.equal(result.ok, false);
  assert.match(result.errors[0].message, /differ|higher/i);
});

test('a promotion must name a set the board actually contains', () => {
  const output = {
    board: structuredClone(firstLight),
    falseTrails: [],
    promotions: [{ setId: 'set-not-here', gradedDifficulty: 2, assignedDifficulty: 4 }],
  };
  const result = boardBuilder.validateOutput(output);
  assert.equal(result.ok, false);
  assert.match(result.errors[0].message, /not in the board/i);
});

test('the prompt tells the builder to promote rather than refuse, and never to invent', () => {
  const prompt = boardBuilder.buildPrompt(
    { gradedSets: [{ id: 'set-a', difficulty: 1 }, { id: 'set-b', difficulty: 2 }] },
    {},
  );
  assert.match(prompt, /promote/i, 'promotion is not offered');
  assert.match(prompt, /"promotions"/, 'the promotions key is never named');
  assert.match(prompt, /never invent|do not invent/i, 'inventing a set is not forbidden');
  // The refusal path survives, but only for genuinely too little material.
  assert.match(prompt, /"insufficientSets"/);
});

// --- what this stage is NOT asked to do (2026-08-03) ---------------------
//
// The builder was costing $0.24 and 166s per board — 94% of its billed
// output was thinking, against an 876-token answer. Its prompt gave it four
// jobs, and one was a combinatorial obligation: prove no two sets could
// regroup into another valid analogy. The 04a gate already brute-forces all
// 43,680 ordered tuples immediately afterwards, and design.md risk 1 records
// (verified in code) that with sixteen distinct words that property cannot be
// violated at all. It was deliberating about avoiding the impossible.

test('the builder is not asked to prove the board has no alternate solution', () => {
  const prompt = boardBuilder.buildPrompt({ gradedSets: [{ id: 'set-a', difficulty: 1 }] }, {});
  assert.equal(
    /regrouped into a different valid analogy/i.test(prompt),
    false,
    'the combinatorial proof is still being asked for',
  );
});

test('it is told the checker does that, so it does not try to do it anyway', () => {
  const prompt = boardBuilder.buildPrompt({ gradedSets: [{ id: 'set-a', difficulty: 1 }] }, {});
  assert.match(prompt, /checker|verified automatically|immediately after/i);
});

test('the work only this stage does is still asked for', () => {
  const prompt = boardBuilder.buildPrompt({ gradedSets: [{ id: 'set-a', difficulty: 1 }] }, {});
  assert.match(prompt, /false trail/i, 'false trails were dropped');
  assert.match(prompt, /"explanation"/, 'explanations were dropped');
  assert.match(prompt, /sixteen words must be distinct/i, 'the distinctness rule was dropped');
  assert.match(prompt, /promote/i, 'promotion was dropped');
});

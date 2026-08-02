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

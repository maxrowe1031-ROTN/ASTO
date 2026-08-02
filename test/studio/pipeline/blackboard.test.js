// The blackboard — in-memory artifact exchange during one attempt.
//
// The property that matters most here is reconstructability: a board rebuilt
// from stage outputs alone must be indistinguishable from the original. That
// is what makes resume and revision deterministic rather than approximate.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createBlackboard, summarize } from '../../../studio/blackboard.js';

test('put then get round-trips a stage output', () => {
  const board = createBlackboard();
  board.put('01-pair-author', { pairs: [{ a: 'Seed', b: 'Tree' }] });

  assert.deepEqual(board.get('01-pair-author'), { pairs: [{ a: 'Seed', b: 'Tree' }] });
});

test('get on a stage that has not run returns undefined, not a throw', () => {
  const board = createBlackboard();

  assert.equal(board.get('05-analogy-validator'), undefined);
  assert.equal(board.has('05-analogy-validator'), false);
});

test('put rejects a stage id the registry does not know', () => {
  const board = createBlackboard();

  assert.throws(() => board.put('09-imaginary', {}), /unknown stage id: 09-imaginary/);
});

test('the board isolates what it stores — mutating either side changes nothing', () => {
  const board = createBlackboard();
  const written = { pairs: [{ a: 'Seed', b: 'Tree' }] };
  board.put('01-pair-author', written);

  written.pairs.push({ a: 'mutated', b: 'after the fact' });
  const read = board.get('01-pair-author');
  read.pairs.push({ a: 'mutated', b: 'on the way out' });

  assert.equal(board.get('01-pair-author').pairs.length, 1);
});

test('a re-put replaces the output and counts as a revision — gate retries stay visible', () => {
  const board = createBlackboard();
  board.put('04-board-builder', { board: { id: 'first' } });
  board.put('04-board-builder', { board: { id: 'second' } });

  assert.deepEqual(board.get('04-board-builder'), { board: { id: 'second' } });
  assert.equal(board.snapshot().stages['04-board-builder'].revisions, 1);
});

test('outputs() returns a plain stageId → output map, ready to persist', () => {
  const board = createBlackboard();
  board.put('01-pair-author', { pairs: [] });
  board.put('02-theme-grouper', { sets: [] });

  assert.deepEqual(Object.keys(board.outputs()), ['01-pair-author', '02-theme-grouper']);
  assert.deepEqual(board.outputs()['02-theme-grouper'], { sets: [] });
});

test('a board rebuilt from outputs alone is indistinguishable from the original', () => {
  const original = createBlackboard();
  original.put('01-pair-author', { pairs: [{ a: 'Seed', b: 'Tree', shape: 'transformation' }] });
  original.put('02-theme-grouper', { sets: [{ id: 'set-growth' }], setAside: [] });

  // The round trip a resume actually performs: outputs → JSON on disk → outputs.
  const fromDisk = JSON.parse(JSON.stringify(original.outputs()));
  const rebuilt = createBlackboard(fromDisk);

  assert.deepEqual(rebuilt.snapshot(), original.snapshot());
  assert.deepEqual(rebuilt.outputs(), original.outputs());
});

test('summarize describes an output without knowing which stage produced it', () => {
  // Generic on purpose: the blackboard holds no per-stage branching, so a new
  // stage needs no change here.
  assert.deepEqual(summarize({ pairs: [1, 2, 3], shortfall: 'ran out of good ones' }), {
    pairs: 3,
    shortfall: 'string',
  });
  assert.deepEqual(summarize({ verdicts: [1, 2], boardPasses: true }), {
    verdicts: 2,
    boardPasses: true,
  });
});

test('the snapshot rolls every stage up so one read gives the whole attempt', () => {
  const board = createBlackboard();
  board.put('01-pair-author', { pairs: [1, 2, 3, 4, 5, 6, 7, 8] });
  board.put('02-theme-grouper', { sets: [1, 2, 3, 4], setAside: [1] });

  const snapshot = board.snapshot();

  assert.deepEqual(snapshot.stageOrder, ['01-pair-author', '02-theme-grouper']);
  assert.deepEqual(snapshot.stages['01-pair-author'].resolution, { pairs: 8 });
  assert.deepEqual(snapshot.stages['02-theme-grouper'].resolution, { sets: 4, setAside: 1 });
  // Provenance beats summary — the original output is kept alongside the rollup.
  assert.deepEqual(snapshot.stages['02-theme-grouper'].output, { sets: [1, 2, 3, 4], setAside: [1] });
});

test('the snapshot orders stages by the registry, not by insertion', () => {
  const board = createBlackboard();
  board.put('04-board-builder', { board: {} });
  board.put('01-pair-author', { pairs: [] });

  assert.deepEqual(board.snapshot().stageOrder, ['01-pair-author', '04-board-builder']);
});

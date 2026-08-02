import test from 'node:test';
import assert from 'node:assert/strict';

import { LocalJsonSource } from '../../src/source/local-json-source.js';
import { board } from '../fixtures/board.js';

const okFetch = (payload) => async () =>
  new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });

test('a valid board loads and comes back parsed', async () => {
  const source = new LocalJsonSource({ fetchFn: okFetch(board) });
  const puzzle = await source.loadPuzzle('puzzles/test.json');
  assert.equal(puzzle.id, 'test-board');
  assert.equal(puzzle.sets.length, 4);
});

test('the requested path is what gets fetched', async () => {
  let requested;
  const source = new LocalJsonSource({
    fetchFn: async (url) => {
      requested = url;
      return okFetch(board)();
    }
  });
  await source.loadPuzzle('puzzles/first-light.json');
  assert.equal(requested, 'puzzles/first-light.json');
});

test('an invalid board is rejected at the boundary, carrying the validator errors', async () => {
  const bad = structuredClone(board);
  delete bad.sets[0].explanation;
  bad.sets[2].difficulty = 9;

  const source = new LocalJsonSource({ fetchFn: okFetch(bad) });
  await assert.rejects(
    () => source.loadPuzzle('puzzles/bad.json'),
    (error) => {
      assert.match(error.message, /schema v1\.0/);
      assert.ok(Array.isArray(error.errors) && error.errors.length >= 2);
      assert.ok(error.errors.some((e) => e.path === 'sets[0].explanation'));
      return true;
    }
  );
});

test('an old-schema board is rejected at the boundary', async () => {
  const legacy = { id: 'x', title: 'X', words: ['a'], sets: [] };
  const source = new LocalJsonSource({ fetchFn: okFetch(legacy) });
  await assert.rejects(
    () => source.loadPuzzle('puzzles/legacy.json'),
    (error) => error.errors.some((e) => e.path === 'words')
  );
});

test('an HTTP failure rejects with the status, not a JSON parse error', async () => {
  const source = new LocalJsonSource({
    fetchFn: async () => new Response('not found', { status: 404 })
  });
  await assert.rejects(() => source.loadPuzzle('puzzles/missing.json'), /404/);
});

test('malformed JSON rejects cleanly', async () => {
  const source = new LocalJsonSource({
    fetchFn: async () => new Response('{ nope', { status: 200 })
  });
  await assert.rejects(() => source.loadPuzzle('puzzles/broken.json'));
});

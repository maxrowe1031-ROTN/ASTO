import test from 'node:test';
import assert from 'node:assert/strict';

import { initGame, submit } from '../src/engine/engine.js';
import { deriveWords } from '../src/engine/arrangements.js';
import { buildShareText } from '../src/share.js';
import { board, distinctMisses, MISS, MISS_AFTER_TOOLS } from './fixtures/board.js';

const solve = (state, set) => submit(state, [...set.pairs[0], ...set.pairs[1]]).state;
const bySetId = (id) => board.sets.find((s) => s.id === id);

function winIn(order, misses = 0) {
  let state = initGame(board);
  distinctMisses(misses).forEach((miss) => {
    state = submit(state, miss).state;
  });
  for (const id of order) state = solve(state, bySetId(id));
  return state;
}

test('a clean win reports the title, the score, and one square per set', () => {
  const state = winIn(['set-growth', 'set-tools', 'set-homes', 'set-material']);
  assert.equal(buildShareText(state), 'ASTO — Test Board\n4/4 · no beans\n🟩🟨🟥⬛');
});

test('squares follow SOLVE order, not tier order', () => {
  const state = winIn(['set-material', 'set-homes', 'set-tools', 'set-growth']);
  assert.equal(buildShareText(state).split('\n')[2], '⬛🟥🟨🟩');
});

test('beans used are counted, and pluralised', () => {
  assert.match(buildShareText(winIn(['set-growth', 'set-tools', 'set-homes', 'set-material'], 1)), /4\/4 · 1 bean\n/);
  assert.match(buildShareText(winIn(['set-growth', 'set-tools', 'set-homes', 'set-material'], 2)), /4\/4 · 2 beans\n/);
});

test('a loss reports what was solved before the beans ran out', () => {
  let state = initGame(board);
  state = solve(state, bySetId('set-tools'));
  for (const miss of distinctMisses(4, MISS_AFTER_TOOLS)) state = submit(state, miss).state;
  assert.equal(state.status, 'lost');
  assert.equal(buildShareText(state), 'ASTO — Test Board\n1/4 · 4 beans\n🟨');
});

test('a loss with nothing solved still produces a shareable line', () => {
  let state = initGame(board);
  for (const miss of distinctMisses(4)) state = submit(state, miss).state;
  assert.equal(buildShareText(state), 'ASTO — Test Board\n0/4 · 4 beans');
});

test('the share text NEVER contains a board word', () => {
  const words = deriveWords(board.sets);
  for (const state of [
    winIn(['set-growth', 'set-tools', 'set-homes', 'set-material'], 2),
    (() => {
      let s = initGame(board);
      s = solve(s, bySetId('set-tools'));
      for (const miss of distinctMisses(4, MISS_AFTER_TOOLS)) s = submit(s, miss).state;
      assert.equal(s.status, 'lost');
      return s;
    })()
  ]) {
    const text = buildShareText(state);
    for (const word of words) {
      assert.ok(!text.includes(word), `share text leaked "${word}": ${text}`);
    }
  }
});

test('buildShareText is pure — the state it is handed is unchanged', () => {
  const state = winIn(['set-growth', 'set-tools', 'set-homes', 'set-material']);
  const before = structuredClone({ ...state, puzzle: undefined });
  buildShareText(state);
  assert.deepEqual(structuredClone({ ...state, puzzle: undefined }), before);
});

test('an in-progress game can still be summarised', () => {
  const state = submit(initGame(board), MISS).state;
  assert.equal(buildShareText(state), 'ASTO — Test Board\n0/4 · 1 bean');
});

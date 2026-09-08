import test from 'node:test';
import assert from 'node:assert/strict';

import { defineWord, initGame, revealVocab, submit } from '../src/engine/engine.js';
import { deriveWords } from '../src/engine/arrangements.js';
import { buildShareText, shareUrlFor, SITE_URL } from '../src/share.js';
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

test('a learning-mode win that used a definition carries the book marker', () => {
  const puzzle = { ...board, definitions: [{ word: 'Seed', definition: 'd' }] };
  let state = initGame(puzzle, { learningMode: true });
  state = defineWord(revealVocab(state).state, 'Seed').state;
  for (const id of ['set-growth', 'set-tools', 'set-homes', 'set-material']) state = solve(state, bySetId(id));
  assert.equal(buildShareText(state), 'ASTO — Test Board\n4/4 · no beans · 📖\n🟩🟨🟥⬛');
});

test('learning mode on but unused shares exactly as a normal game', () => {
  let state = initGame(board, { learningMode: true });
  for (const id of ['set-growth', 'set-tools', 'set-homes', 'set-material']) state = solve(state, bySetId(id));
  assert.equal(buildShareText(state), 'ASTO — Test Board\n4/4 · no beans\n🟩🟨🟥⬛');
});

// --- the deep link home (D-34) ---
//
// A shared result should let its reader PLAY the board, from anywhere it was pasted —
// including the itch build, whose own origin is not ours. So the link is always the home
// domain, and it is the slug's deep link so the reader lands on the exact board.

test('with a slug, a fourth line carries the deep link to that board', () => {
  const state = winIn(['set-growth', 'set-tools', 'set-homes', 'set-material']);
  const lines = buildShareText(state, { slug: 'bedside-manor' }).split('\n');
  assert.equal(lines.length, 4);
  assert.equal(lines[3], 'https://www.playasto.com/?puzzle=bedside-manor');
});

test('the first three lines are unchanged by the link', () => {
  const state = winIn(['set-growth', 'set-tools', 'set-homes', 'set-material'], 1);
  const withLink = buildShareText(state, { slug: 'bedside-manor' }).split('\n');
  const without = buildShareText(state).split('\n');
  assert.deepEqual(withLink.slice(0, 3), without);
});

test('no slug means no link — the tutorial has nothing to link to', () => {
  const state = winIn(['set-growth', 'set-tools', 'set-homes', 'set-material']);
  assert.equal(buildShareText(state, { slug: null }).split('\n').length, 3);
  assert.equal(buildShareText(state).split('\n').length, 3);
});

test('a slug is URL-encoded, so an odd character cannot break the link', () => {
  assert.equal(shareUrlFor('apothecary-s-shelf'), 'https://www.playasto.com/?puzzle=apothecary-s-shelf');
  assert.equal(shareUrlFor('a b&c'), 'https://www.playasto.com/?puzzle=a%20b%26c');
});

test('the link points home even though the game may run on another origin', () => {
  assert.equal(SITE_URL, 'https://www.playasto.com/');
  assert.ok(shareUrlFor('x').startsWith(SITE_URL));
});

// The Studio's board markup.
//
// This is the spec's intentional duplication (amendment 2): the game's
// board-view.js owns persistent keyed DOM for FLIP animation and is the wrong
// thing to force into dual service, so the Studio re-emits the same classes as
// a pure string. Being a string is what lets it be tested here, with no DOM.
//
// What matters is that it uses the GAME's classes and the GAME's derivations —
// if it invented its own, the review page would stop being a preview of what
// a player will actually see.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { boardHtml, tilesFor } from '../../../studio/review/ui/board-html.js';
import { deriveWords } from '../../../src/engine/arrangements.js';

const BOARD = {
  id: 'asto-first-light',
  title: 'First Light',
  sets: [
    {
      id: 'set-growth',
      relationshipLabel: 'Small origin becomes larger result',
      explanation: 'A seed grows into a tree the way a spark grows into a fire.',
      pairs: [['Seed', 'Tree'], ['Spark', 'Fire']],
      difficulty: 1,
    },
    {
      id: 'set-tools',
      relationshipLabel: 'Tool used by profession',
      explanation: 'A brush is what a painter works with.',
      pairs: [['Brush', 'Painter'], ['Chisel', 'Sculptor']],
      difficulty: 2,
    },
    {
      id: 'set-homes',
      relationshipLabel: 'Home of animal',
      explanation: 'A nest is where a bird lives.',
      pairs: [['Nest', 'Bird'], ['Den', 'Bear']],
      difficulty: 3,
    },
    {
      id: 'set-material',
      relationshipLabel: 'Material transformed into finished object',
      explanation: 'Dough becomes bread.',
      pairs: [['Dough', 'Bread'], ['Clay', 'Pottery']],
      difficulty: 4,
    },
  ],
};

test('renders all sixteen words as tiles', () => {
  const html = boardHtml(BOARD);
  const tiles = html.match(/class="tile"/g) ?? [];
  assert.equal(tiles.length, 16);
  for (const word of deriveWords(BOARD.sets)) {
    assert.ok(html.includes(`>${word}<`), `missing tile for ${word}`);
  }
});

test('uses the game\'s own classes, so the game\'s CSS styles it', () => {
  const html = boardHtml(BOARD);
  for (const className of ['board', 'tile', 'solved-card', 'tier-badge', 'analogy', 'relationship', 'explanation']) {
    assert.ok(html.includes(`"${className}"`) || html.includes(`class="${className}`), className);
  }
});

test('one card per set, tiered by difficulty through the game\'s derivation', () => {
  const html = boardHtml(BOARD);
  assert.equal((html.match(/class="solved-card"/g) ?? []).length, 4);
  for (const tier of ['green', 'yellow', 'red', 'black']) {
    assert.ok(html.includes(`data-tier="${tier}"`), `no ${tier} card`);
  }
});

test('shows each analogy in canonical order, never sorted', () => {
  const html = boardHtml(BOARD);
  assert.ok(html.includes('Seed : Tree :: Spark : Fire'), 'growth set not in canonical order');
  assert.ok(html.includes('Dough : Bread :: Clay : Pottery'));
});

test('shows the label and the explanation — the reveal Max is judging', () => {
  const html = boardHtml(BOARD);
  assert.ok(html.includes('Home of animal'));
  assert.ok(html.includes('A nest is where a bird lives.'));
});

test('tile order is shuffled, not set order — a player never sees them grouped', () => {
  const tiles = tilesFor(BOARD);
  assert.notDeepEqual(tiles, deriveWords(BOARD.sets), 'tiles were left in set order');
  assert.deepEqual([...tiles].sort(), [...deriveWords(BOARD.sets)].sort(), 'shuffle lost a word');
});

test('the shuffle is deterministic per board — re-reading a run looks the same', () => {
  assert.deepEqual(tilesFor(BOARD), tilesFor(BOARD));
  assert.notDeepEqual(tilesFor(BOARD), tilesFor({ ...BOARD, id: 'asto-other' }));
});

test('escapes text — a board is model output, not trusted markup', () => {
  const nasty = {
    ...BOARD,
    sets: [
      { ...BOARD.sets[0], relationshipLabel: '<script>alert(1)</script>', explanation: 'a & b' },
      ...BOARD.sets.slice(1),
    ],
  };
  const html = boardHtml(nasty);
  assert.equal(html.includes('<script>'), false, 'raw script tag reached the markup');
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('a &amp; b'));
});

test('a set-scoped element carries its setId, so feedback can target it', () => {
  const html = boardHtml(BOARD);
  for (const set of BOARD.sets) {
    assert.ok(html.includes(`data-set-id="${set.id}"`), `card for ${set.id} is not addressable`);
  }
});

test('renders nothing rather than throwing when there is no board', () => {
  assert.equal(boardHtml(null), '');
  assert.deepEqual(tilesFor(null), []);
});

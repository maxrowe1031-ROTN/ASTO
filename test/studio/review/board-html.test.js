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

import { analogyOf, boardHtml, tilesFor } from '../../../studio/review/ui/board-html.js';
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

// --- promotions ----------------------------------------------------------
//
// The builder may label its hardest available set Black even when the rater
// graded it lower (decided with Max, 2026-08-03). Raising the rater's ceiling
// is meant to be TRAINED through this loop, so the promotion has to be on the
// card Max is looking at. A promotion he cannot see is a judgement he cannot
// give feedback on, and the rater's blind spot stays invisible.

test('a promoted set says so on its card, with the grade it actually got', () => {
  const html = boardHtml(BOARD, [
    { setId: 'set-material', gradedDifficulty: 3, assignedDifficulty: 4 },
  ]);
  assert.match(html, /promoted/i, 'the promotion is not shown at all');
  assert.match(html, /graded 3/, 'the grade it actually got is missing');
});

test('only the promoted card is marked', () => {
  const html = boardHtml(BOARD, [
    { setId: 'set-material', gradedDifficulty: 3, assignedDifficulty: 4 },
  ]);
  assert.equal((html.match(/class="promotion"/g) ?? []).length, 1);
});

test('a board with no promotions carries no promotion markup', () => {
  assert.equal(/promotion/i.test(boardHtml(BOARD)), false);
  assert.equal(/promotion/i.test(boardHtml(BOARD, [])), false);
});

test('a promotion naming an unknown set marks nothing rather than throwing', () => {
  const html = boardHtml(BOARD, [{ setId: 'set-nope', gradedDifficulty: 1, assignedDifficulty: 4 }]);
  assert.equal(/class="promotion"/.test(html), false);
});

// --- the analogy line, shared -------------------------------------------
//
// The board card and the feedback block both need to show a set as
// "A : B :: C : D", so the formatting lives in one place rather than being
// written twice and drifting.

test('a set renders as an ordered analogy with the double colon in the middle', () => {
  const set = { pairs: [['Seed', 'Tree'], ['Spark', 'Fire']] };
  assert.equal(analogyOf(set), 'Seed : Tree :: Spark : Fire');
});

test('multi-word terms keep the double colon in the right place', () => {
  // The old inline regex matched on \S+, so a two-word term silently lost the
  // "::" and the set read as four things in a row.
  const set = { pairs: [['Gulf Stream', 'Warm Water'], ['Jet Stream', 'Fast Air']] };
  assert.equal(analogyOf(set), 'Gulf Stream : Warm Water :: Jet Stream : Fast Air');
});

test('a set with no pairs renders as empty rather than throwing', () => {
  assert.equal(analogyOf({}), '');
  assert.equal(analogyOf(null), '');
});

test('the board card still shows the analogy it always did', () => {
  assert.match(boardHtml(BOARD), /Seed : Tree :: Spark : Fire/);
});

// --- the stance line and the board shape (design.md D-3) ------------------
//
// More kinds of output make faults harder for the reviewer to spot, so the
// card teaches each relation kind while showing it: the stance, its paradigm
// pair, and its named failure mode. The board header shows the four stances
// and the style guide's unity verdict — the intended shape of the puzzle,
// visible before it is played. Unity is advisory: it renders, it never gates.

test('a set card teaches its stance with the paradigm and the failure mode', () => {
  const html = boardHtml(BOARD, [], {
    shapesBySet: { 'set-growth': 'conversion' },
  });
  assert.match(html, /class="stance"/);
  assert.match(html, /cause/);
  assert.match(html, /grape : wine/);
  assert.match(html, /class="stance-failure"/);
});

test('a legacy shape id still teaches, through the aliases', () => {
  const html = boardHtml(BOARD, [], { shapesBySet: { 'set-growth': 'transformation' } });
  assert.match(html, /grape : wine/, 'the legacy id did not resolve to its successor');
});

test('an unknown shape renders no stance line rather than a broken one', () => {
  const html = boardHtml(BOARD, [], { shapesBySet: { 'set-growth': 'free text nobody controls' } });
  assert.equal(/class="stance"/.test(html), false);
});

test('the board header shows the stances and the unity verdict with its outliers', () => {
  const html = boardHtml(BOARD, [], {
    shapesBySet: { 'set-growth': 'conversion', 'set-tools': 'agent-instrument' },
    unity: {
      verdict: 'adequate',
      reasoning: 'One world, one word adrift.',
      outliers: [{ word: 'Ghost', note: 'sits outside the register of the other fifteen' }],
    },
  });
  assert.match(html, /class="board-shape"/);
  assert.match(html, /data-verdict="adequate"/);
  assert.match(html, /Ghost/);
  assert.match(html, /register of the other fifteen/);
});

test('a board with no stance data and no unity renders exactly as before', () => {
  assert.equal(/board-shape/.test(boardHtml(BOARD)), false);
});

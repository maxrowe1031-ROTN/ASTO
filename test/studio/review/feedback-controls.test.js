// The feedback form's per-set blocks.
//
// Max reads these while judging a board, so each block has to identify its set
// the way he is actually thinking about it: by the analogy, not only by an id
// and a relationship label. Asked for 2026-08-03.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  QUICK_TAGS,
  collectFeedback,
  feedbackControls,
} from '../../../studio/review/ui/feedback.js';

const BOARD = {
  id: 'asto-first-light',
  title: 'First Light',
  sets: [
    {
      id: 'set-growth',
      relationshipLabel: 'Small origin becomes larger result',
      pairs: [['Seed', 'Tree'], ['Spark', 'Fire']],
      difficulty: 1,
    },
    {
      id: 'set-tools',
      relationshipLabel: 'Tool used by profession',
      pairs: [['Brush', 'Painter'], ['Chisel', 'Sculptor']],
      difficulty: 2,
    },
    {
      id: 'set-homes',
      relationshipLabel: 'Home of animal',
      pairs: [['Nest', 'Bird'], ['Den', 'Bear']],
      difficulty: 3,
    },
    {
      id: 'set-material',
      relationshipLabel: 'Material transformed into finished object',
      pairs: [['Dough', 'Bread'], ['Clay', 'Pottery']],
      difficulty: 4,
    },
  ],
};

test('every set block shows its analogy, not just its id and label', () => {
  const html = feedbackControls(BOARD);
  for (const expected of [
    'Seed : Tree :: Spark : Fire',
    'Brush : Painter :: Chisel : Sculptor',
    'Nest : Bird :: Den : Bear',
    'Dough : Bread :: Clay : Pottery',
  ]) {
    assert.ok(html.includes(expected), `missing analogy: ${expected}`);
  }
});

test('the set id and relationship label are still there', () => {
  const html = feedbackControls(BOARD);
  assert.match(html, /set-growth/);
  assert.match(html, /Small origin becomes larger result/);
});

test('blocks stay in difficulty order, easiest first', () => {
  const html = feedbackControls(BOARD);
  const order = [...html.matchAll(/data-set-id="(set-[a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ['set-growth', 'set-tools', 'set-homes', 'set-material']);
});

test('the board-scoped block is still first and carries no set id', () => {
  const html = feedbackControls(BOARD);
  assert.ok(html.indexOf('The board as a whole') < html.indexOf('set-growth'));
});

test('a board with no sets renders the board block alone, without throwing', () => {
  const html = feedbackControls({ sets: [] });
  assert.match(html, /The board as a whole/);
  assert.equal(/data-set-id="set-/.test(html), false);
});

// --- the tag vocabulary ---

test('the four tags added from the review corpus are offered on a set', () => {
  const html = feedbackControls(BOARD);
  for (const tag of ['not-always-true', 'not-evocative', 'feels-like-asto']) {
    assert.ok(html.includes(`value="${tag}"`), `set blocks are missing ${tag}`);
  }
});

test('no-unifying-theme is a board judgement only — a single set cannot lack a theme', () => {
  const html = feedbackControls(BOARD);
  const boardBlock = html.slice(0, html.indexOf('data-set-id="set-growth"'));
  const setBlocks = html.slice(html.indexOf('data-set-id="set-growth"'));
  assert.ok(boardBlock.includes('value="no-unifying-theme"'), 'the board block should offer it');
  assert.equal(setBlocks.includes('value="no-unifying-theme"'), false, 'set blocks must not');
});

test('feels-like-asto reads as praise, like the other positive tags', () => {
  const html = feedbackControls(BOARD);
  // The chip carries the positive class, so it tints green rather than honey.
  assert.match(html, /chip chip-positive">\s*<input[^>]*value="feels-like-asto"/);
});

// --- the tier picker ---

test('every set block offers all four tiers, none preselected', () => {
  const html = feedbackControls(BOARD);
  for (const tier of ['green', 'yellow', 'red', 'black']) {
    assert.ok(html.includes(`data-tier="${tier}"`), `missing tier chip ${tier}`);
  }
  // An untouched picker must say nothing; a checked default would make every
  // unopened set look like an opinion.
  assert.equal(/data-role="tier"[^>]*checked/.test(html), false);
});

test('a set block records its current difficulty, so a change has an honest "before"', () => {
  const html = feedbackControls(BOARD);
  assert.match(html, /data-set-id="set-growth"\s+data-difficulty="1"/);
  assert.match(html, /data-set-id="set-material"\s+data-difficulty="4"/);
});

// --- collection ---
//
// collectFeedback reads the DOM, and this repo has no DOM and no dependency to
// provide one. So the tests drive a stub that implements exactly the four
// selectors the module uses — and THROWS on any other, so a changed selector
// fails loudly here instead of silently collecting nothing in Max's browser.
function fakeBlock({ setId, difficulty, tags = [], note = '', tier = null }) {
  const one = (selector) => {
    if (selector === '.note') return { value: note };
    if (selector === 'input[data-role=tier]:checked') {
      return tier === null ? null : { value: String(tier) };
    }
    throw new Error(`unexpected querySelector(${selector})`);
  };
  const many = (selector) => {
    if (selector === 'input[type=checkbox]:checked') return tags.map((value) => ({ value }));
    throw new Error(`unexpected querySelectorAll(${selector})`);
  };
  return {
    dataset: { setId, ...(difficulty === undefined ? {} : { difficulty: String(difficulty) }) },
    querySelector: one,
    querySelectorAll: many,
  };
}

const fakeRoot = (blocks) => ({
  querySelectorAll(selector) {
    if (selector === '.fb-block') return blocks;
    throw new Error(`unexpected querySelectorAll(${selector})`);
  },
});

const collect = (blocks, options = {}) =>
  collectFeedback(fakeRoot(blocks), { attemptId: '0001', ...options });

test('a block with nothing on it is not an opinion', () => {
  assert.deepEqual(collect([fakeBlock({ setId: 'set-growth', difficulty: 1 })]), []);
});

test('tags and a note still collect as one verdict event', () => {
  const events = collect([
    fakeBlock({ setId: 'set-growth', difficulty: 1, tags: ['too-easy'], note: 'fine' }),
  ]);
  assert.equal(events.length, 1);
  assert.equal(events[0].action, 'revise-set');
  assert.deepEqual(events[0].scope, { type: 'set', setId: 'set-growth' });
  assert.deepEqual(events[0].tags, ['too-easy']);
  assert.equal(events[0].note, 'fine');
});

test('a different tier emits a change-difficulty event carrying before and after', () => {
  const events = collect([fakeBlock({ setId: 'set-growth', difficulty: 1, tier: 3 })]);
  assert.equal(events.length, 1);
  const [event] = events;
  assert.equal(event.action, 'change-difficulty');
  assert.deepEqual(event.scope, { type: 'set', setId: 'set-growth' });
  assert.deepEqual(event.before, { difficulty: 1 });
  assert.deepEqual(event.after, { difficulty: 3 });
  assert.deepEqual(event.tags, []);
});

test('the tier picker alone is enough — no tag and no note required', () => {
  // This is the whole point: "this plays like a red" was previously only
  // sayable in prose, which nothing can count.
  assert.equal(collect([fakeBlock({ setId: 'set-homes', difficulty: 3, tier: 4 })]).length, 1);
});

test('agreeing with the board records nothing — that is what difficulty-accurate is for', () => {
  assert.deepEqual(collect([fakeBlock({ setId: 'set-growth', difficulty: 1, tier: 1 })]), []);
});

test('a verdict and a tier change on one set are two separate events', () => {
  const events = collect([
    fakeBlock({ setId: 'set-growth', difficulty: 1, tags: ['too-difficult'], note: 'hard', tier: 3 }),
  ]);
  assert.deepEqual(
    events.map((event) => event.action),
    ['revise-set', 'change-difficulty'],
  );
  // Ids must be unique or the corpus would collapse two judgements into one.
  assert.notEqual(events[0].id, events[1].id);
});

test('the board block never emits a tier change — the board has no difficulty', () => {
  const events = collect([fakeBlock({ setId: '', tags: ['no-unifying-theme'] })]);
  assert.equal(events.length, 1);
  assert.equal(events[0].action, 'revise-board');
  assert.deepEqual(events[0].scope, { type: 'board' });
});

test('every tag the UI offers is one the schema will accept', async () => {
  // The two lists are deliberately duplicated (the server revalidates), so
  // this is the test that keeps the duplication honest.
  const { QUICK_TAGS: SCHEMA_TAGS } = await import('../../../studio/schemas.js');
  assert.deepEqual([...QUICK_TAGS].sort(), [...SCHEMA_TAGS].sort());
});

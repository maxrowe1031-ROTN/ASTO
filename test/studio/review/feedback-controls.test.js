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
import { validateFeedbackEvent } from '../../../studio/schemas.js';

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
function fakeBlock({ setId, difficulty, tags = [], note = '', tier = null, verdict = null, fix = '' }) {
  const one = (selector) => {
    if (selector === '.note') return { value: note };
    if (selector === '.fix') return { value: fix };
    if (selector === 'input[data-role=tier]:checked') {
      return tier === null ? null : { value: String(tier) };
    }
    if (selector === 'input[data-role=verdict]:checked') {
      return verdict === null ? null : { value: verdict };
    }
    throw new Error(`unexpected querySelector(${selector})`);
  };
  const many = (selector) => {
    if (selector === 'input[type=checkbox][data-scope]:checked') {
      return tags.map((value) => ({ value }));
    }
    throw new Error(`unexpected querySelectorAll(${selector})`);
  };
  return {
    dataset: { setId, ...(difficulty === undefined ? {} : { difficulty: String(difficulty) }) },
    querySelector: one,
    querySelectorAll: many,
  };
}

const fakeRoot = (blocks, { boardVerdict = null, blockers = [] } = {}) => ({
  querySelectorAll(selector) {
    if (selector === '.fb-block') return blocks;
    if (selector === 'input[data-role=blocker]:checked') {
      return blockers.map((value) => ({ value }));
    }
    throw new Error(`unexpected querySelectorAll(${selector})`);
  },
  querySelector(selector) {
    if (selector === 'input[data-role=board-verdict]:checked') {
      return boardVerdict === null ? null : { value: boardVerdict };
    }
    throw new Error(`unexpected querySelector(${selector})`);
  },
});

const collect = (blocks, options = {}) => {
  const { boardVerdict, blockers, ...rest } = options;
  return collectFeedback(fakeRoot(blocks, { boardVerdict, blockers }), {
    attemptId: '0001',
    ...rest,
  });
};

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

// --- formVersion 2: the verdict semantics (2026-08-05) --------------------
//
// Max's rule, which the form now encodes: a BOARD verdict is about whether the
// whole puzzle is publishable; each SET still gets an honest independent read.
// Version 1 stamped the board button onto every set block, so 21 of 79 tagged
// set-events in the corpus say `reject-set` while carrying only praise —
// including sets he called "a great green".

test('REGRESSION: rejecting a board does not reject the sets on it', () => {
  // The exact shape of the bug: the spy board was not publishable, and three
  // of its four sets were excellent.
  const events = collect(
    [
      fakeBlock({ setId: '', note: 'one set breaks it' }),
      fakeBlock({
        setId: 'set-specialist-tool',
        difficulty: 1,
        tags: ['good-unchanged', 'strong-reveal', 'feels-like-asto'],
        note: 'a great green',
        verdict: 'set-publishable',
      }),
    ],
    { boardVerdict: 'reject-board', defaultAction: 'reject-set' },
  );

  const board = events.find((e) => e.scope.type === 'board');
  const set = events.find((e) => e.scope.setId === 'set-specialist-tool');
  assert.equal(board.action, 'reject-board', 'the board verdict is Max\'s, not the button\'s');
  assert.equal(set.action, 'set-publishable', 'the praised set was rejected by inheritance again');
});

test('a set Max did not rule on records the neutral verdict, never the board\'s', () => {
  const events = collect([fakeBlock({ setId: 'set-a', difficulty: 2, tags: ['too-easy'] })], {
    defaultAction: 'reject-set',
  });
  assert.equal(events[0].action, 'revise-set');
});

test('the board verdict in the form beats the button that was pressed', () => {
  const events = collect([fakeBlock({ setId: '', note: 'ship it' })], {
    boardVerdict: 'approve-board',
    defaultAction: 'reject-set',
  });
  assert.equal(events[0].action, 'approve-board');
});

test('the button still decides when no board verdict was picked', () => {
  const events = collect([fakeBlock({ setId: '', note: 'no radio touched' })], {
    defaultAction: 'approve-set',
  });
  assert.equal(events[0].action, 'approve-board');
});

test('blockers name which sets stop the board being publishable, board-scoped only', () => {
  const events = collect(
    [
      fakeBlock({ setId: '', note: 'good but for one' }),
      fakeBlock({ setId: 'set-bad', difficulty: 4, verdict: 'set-replace' }),
    ],
    { boardVerdict: 'revise-board', blockers: ['set-bad'] },
  );
  const board = events.find((e) => e.scope.type === 'board');
  const set = events.find((e) => e.scope.type === 'set');
  assert.deepEqual(board.blockers, ['set-bad']);
  assert.equal(set.blockers, undefined, 'a set-scoped event must not carry blockers');
});

test('a fix suggestion is its own field, not buried in the note', () => {
  const events = collect([
    fakeBlock({
      setId: 'set-role-marker',
      difficulty: 4,
      verdict: 'set-needs-edit',
      note: 'close but the relationship does not hold',
      fix: 'spy is to alias as gun is to holster — one uses the other to stay hidden',
    }),
  ]);
  assert.equal(events.length, 1);
  assert.match(events[0].fixSuggestion, /holster/);
  assert.match(events[0].note, /does not hold/);
});

test('a verdict alone is an opinion — no tag or note required', () => {
  const events = collect([fakeBlock({ setId: 'set-a', difficulty: 1, verdict: 'set-publishable' })]);
  assert.equal(events.length, 1);
  assert.equal(events[0].action, 'set-publishable');
});

test('every event carries the form version that produced it', () => {
  const events = collect([fakeBlock({ setId: 'set-a', difficulty: 1, tier: 3, note: 'x' })]);
  assert.ok(events.length >= 2);
  for (const e of events) assert.equal(e.formVersion, 2);
});

// --- play telemetry -------------------------------------------------------

test('a playthrough is recorded as one board-scoped event', () => {
  const events = collect([], {
    playthrough: { solvedOrder: ['set-a', 'set-b'], mistakes: 1, soClose: 1, replayed: false },
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].action, 'playthrough');
  assert.deepEqual(events[0].scope, { type: 'board' });
  assert.deepEqual(events[0].playthrough.solvedOrder, ['set-a', 'set-b']);
  assert.equal(events[0].source, 'review-studio-play');
});

test('no playthrough, no event — an unplayed board claims nothing', () => {
  assert.deepEqual(collect([]), []);
});

// --- the whole form still produces schema-valid events --------------------

test('every event the new form emits validates against the schema', () => {
  const events = collect(
    [
      fakeBlock({ setId: '', tags: ['no-unifying-theme'], note: 'board note' }),
      fakeBlock({
        setId: 'set-a',
        difficulty: 1,
        tags: ['good-unchanged'],
        note: 'n',
        fix: 'f',
        tier: 3,
        verdict: 'set-needs-edit',
      }),
    ],
    {
      boardVerdict: 'revise-board',
      blockers: ['set-a'],
      playthrough: { solvedOrder: ['set-a'], mistakes: 0, soClose: 0 },
    },
  );
  assert.ok(events.length >= 4);
  for (const event of events) {
    const { ok, errors } = validateFeedbackEvent(event);
    assert.equal(ok, true, `${event.action}: ${JSON.stringify(errors)}`);
  }
});

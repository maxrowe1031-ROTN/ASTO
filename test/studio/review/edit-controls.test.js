// The hand-editor's form (D-22): what it renders and what it reads back.
//
// editorHtml/collectBoard are the testable half; wireEditor (debounced live
// validation, save/cancel) is browser glue and is browser-verified, the same
// split feedback.js established.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { collectBoard, editorHtml } from '../../../studio/review/ui/edit.js';

const BOARD = {
  id: 'asto-first-light',
  title: 'First Light',
  sets: [
    {
      id: 'set-growth',
      relationshipLabel: 'Small origin becomes larger result',
      explanation: 'A seed grows into a tree.',
      pairs: [['Seed', 'Tree'], ['Spark', 'Fire']],
      difficulty: 1,
    },
    {
      id: 'set-tools',
      relationshipLabel: 'Tool used by profession',
      explanation: 'A brush is used by a painter.',
      pairs: [['Brush', 'Painter'], ['Chisel', 'Sculptor']],
      difficulty: 2,
    },
    {
      id: 'set-homes',
      relationshipLabel: 'Home of animal',
      explanation: 'A nest is home to a bird.',
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

// --- rendering ---

test('the form carries every editable field with its current value', () => {
  const html = editorHtml(BOARD);
  assert.ok(html.includes('value="First Light"'));
  for (const set of BOARD.sets) {
    assert.ok(html.includes(`data-set-id="${set.id}"`), set.id);
    assert.ok(html.includes(`value="${set.relationshipLabel}"`), set.id);
    assert.ok(html.includes(set.explanation), set.id);
    for (const word of set.pairs.flat()) assert.ok(html.includes(`value="${word}"`), word);
  }
});

test('sets render in difficulty order and each shows its analogy for orientation', () => {
  const html = editorHtml(BOARD);
  assert.ok(html.indexOf('set-growth') < html.indexOf('set-tools'));
  assert.ok(html.indexOf('set-homes') < html.indexOf('set-material'));
  assert.ok(html.includes('Seed : Tree :: Spark : Fire'));
});

test('board values are escaped on the way into the form', () => {
  const spiky = structuredClone(BOARD);
  spiky.title = '<script>alert(1)</script>';
  const html = editorHtml(spiky);
  assert.ok(!html.includes('<script>alert(1)'));
});

// --- collection ---
//
// The same stub discipline as collectFeedback's tests: exactly the selectors
// the module uses, throwing on any other, so a renamed selector fails here
// instead of silently collecting nothing in Max's browser.
function fakeSet({ setId, label, explanation, words, difficulty }) {
  return {
    dataset: { setId },
    querySelector(selector) {
      if (selector === 'input[data-edit=relationshipLabel]') return { value: label };
      if (selector === 'textarea[data-edit=explanation]') return { value: explanation };
      if (selector === 'select[data-edit=difficulty]') return { value: String(difficulty) };
      throw new Error(`unexpected querySelector(${selector})`);
    },
    querySelectorAll(selector) {
      if (selector === 'input[data-edit=word]') return words.map((value) => ({ value }));
      throw new Error(`unexpected querySelectorAll(${selector})`);
    },
  };
}

const fakeForm = (title, sets) => ({
  querySelector(selector) {
    if (selector === 'input[data-edit=title]') return { value: title };
    throw new Error(`unexpected querySelector(${selector})`);
  },
  querySelectorAll(selector) {
    if (selector === '.edit-set') return sets;
    throw new Error(`unexpected querySelectorAll(${selector})`);
  },
});

const formOf = (board, patches = {}) =>
  fakeForm(
    patches.title ?? board.title,
    board.sets.map((set) =>
      fakeSet({
        setId: set.id,
        label: set.relationshipLabel,
        explanation: set.explanation,
        words: set.pairs.flat(),
        difficulty: set.difficulty,
        ...(patches.sets?.[set.id] ?? {}),
      }),
    ),
  );

test('an untouched form collects back to the board it was built from', () => {
  assert.deepEqual(collectBoard(formOf(BOARD), BOARD), BOARD);
});

test('edits to title, label, explanation and words come back in schema shape', () => {
  const collected = collectBoard(
    formOf(BOARD, {
      title: 'Second Light',
      sets: {
        'set-tools': { label: 'Wielded by', words: ['Brush', 'Painter', 'Awl', 'Cobbler'] },
        'set-homes': { explanation: 'Rewritten.' },
      },
    }),
    BOARD,
  );
  assert.equal(collected.title, 'Second Light');
  const tools = collected.sets.find((s) => s.id === 'set-tools');
  assert.equal(tools.relationshipLabel, 'Wielded by');
  assert.deepEqual(tools.pairs, [['Brush', 'Painter'], ['Awl', 'Cobbler']]);
  assert.equal(collected.sets.find((s) => s.id === 'set-homes').explanation, 'Rewritten.');
  assert.equal(collected.id, BOARD.id);
});

test('picking an occupied difficulty swaps with its holder — 1-per-tier holds by construction', () => {
  const collected = collectBoard(
    formOf(BOARD, { sets: { 'set-growth': { difficulty: 3 } } }),
    BOARD,
  );
  assert.equal(collected.sets.find((s) => s.id === 'set-growth').difficulty, 3);
  assert.equal(collected.sets.find((s) => s.id === 'set-homes').difficulty, 1);
  assert.deepEqual(
    [...collected.sets.map((s) => s.difficulty)].sort(),
    [1, 2, 3, 4],
  );
});

test('a glossary on the incoming board never survives into the collected edit', () => {
  const withGloss = { ...structuredClone(BOARD), glossary: [{ word: 'Chisel', definition: 'x' }] };
  const collected = collectBoard(formOf(withGloss), withGloss);
  assert.equal('glossary' in collected, false);
});

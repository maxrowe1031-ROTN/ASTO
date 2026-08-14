import test from 'node:test';
import assert from 'node:assert/strict';

import { diffBoards, editedBoardFile, handEditEvents } from '../../studio/edits.js';

const board = (overrides = {}) => ({
  id: 'run-board',
  title: 'School Days',
  sets: [
    {
      id: 'set-a',
      relationshipLabel: 'grows into',
      explanation: 'A seed grows into a tree.',
      pairs: [['Seed', 'Tree'], ['Spark', 'Fire']],
      difficulty: 1
    },
    {
      id: 'set-b',
      relationshipLabel: 'milder form of',
      explanation: 'Warm is milder than hot.',
      pairs: [['Warm', 'Hot'], ['Damp', 'Wet']],
      difficulty: 2
    },
    {
      id: 'set-c',
      relationshipLabel: 'is resolved by',
      explanation: 'A question is resolved by an answer.',
      pairs: [['Question', 'Answer'], ['Problem', 'Solution']],
      difficulty: 3
    },
    {
      id: 'set-d',
      relationshipLabel: 'slowly shapes',
      explanation: 'A river shapes a canyon.',
      pairs: [['River', 'Canyon'], ['Wind', 'Dune']],
      difficulty: 4
    }
  ],
  ...overrides
});

const withSet = (base, setId, patch) => ({
  ...base,
  sets: base.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s))
});

// --- the artifact name ---

test('the edited board lives beside the other post-completion artifacts, keyed by attempt', () => {
  assert.equal(editedBoardFile('0001'), 'edited-board-0001.json');
  assert.equal(editedBoardFile('0012'), 'edited-board-0012.json');
});

// --- diffBoards ---

test('identical boards diff to nothing', () => {
  assert.deepEqual(diffBoards(board(), board()), []);
});

test('a retitle is one board-scoped entry', () => {
  const diff = diffBoards(board(), board({ title: 'Chalk and Chapters' }));
  assert.deepEqual(diff, [
    {
      scope: { type: 'board' },
      before: { title: 'School Days' },
      after: { title: 'Chalk and Chapters' }
    }
  ]);
});

test('a label change is one set-scoped entry carrying only that field', () => {
  const diff = diffBoards(board(), withSet(board(), 'set-c', { relationshipLabel: 'is answered by' }));
  assert.deepEqual(diff, [
    {
      scope: { type: 'set', setId: 'set-c' },
      before: { relationshipLabel: 'is resolved by' },
      after: { relationshipLabel: 'is answered by' }
    }
  ]);
});

test('an explanation change diffs like a label change', () => {
  const diff = diffBoards(board(), withSet(board(), 'set-a', { explanation: 'Rewritten.' }));
  assert.equal(diff.length, 1);
  assert.deepEqual(diff[0].after, { explanation: 'Rewritten.' });
});

test('a word change carries the whole ordered pairs as one field — order is the game', () => {
  const edited = withSet(board(), 'set-b', { pairs: [['Warm', 'Hot'], ['Moist', 'Wet']] });
  const diff = diffBoards(board(), edited);
  assert.deepEqual(diff, [
    {
      scope: { type: 'set', setId: 'set-b' },
      before: { pairs: [['Warm', 'Hot'], ['Damp', 'Wet']] },
      after: { pairs: [['Warm', 'Hot'], ['Moist', 'Wet']] }
    }
  ]);
});

test('a difficulty swap is two set-scoped entries — both sets honestly moved', () => {
  const edited = withSet(withSet(board(), 'set-a', { difficulty: 3 }), 'set-c', { difficulty: 1 });
  const diff = diffBoards(board(), edited);
  assert.equal(diff.length, 2);
  const bySet = Object.fromEntries(diff.map((d) => [d.scope.setId, d]));
  assert.deepEqual(bySet['set-a'], {
    scope: { type: 'set', setId: 'set-a' },
    before: { difficulty: 1 },
    after: { difficulty: 3 }
  });
  assert.deepEqual(bySet['set-c'], {
    scope: { type: 'set', setId: 'set-c' },
    before: { difficulty: 3 },
    after: { difficulty: 1 }
  });
});

test('several fields changed on one set become several entries — one field per record', () => {
  const edited = withSet(board(), 'set-d', {
    relationshipLabel: 'carves',
    explanation: 'Reworded.'
  });
  const diff = diffBoards(board(), edited);
  assert.equal(diff.length, 2);
  assert.ok(diff.every((d) => d.scope.setId === 'set-d'));
  assert.ok(diff.every((d) => Object.keys(d.before).length === 1));
});

test('set ids must match — the fix-in-place editor never adds, removes, or renames sets', () => {
  const missing = board();
  missing.sets = missing.sets.slice(0, 3);
  assert.throws(() => diffBoards(board(), missing), /set/i);

  const renamed = withSet(board(), 'set-a', { id: 'set-z' });
  assert.throws(() => diffBoards(board(), renamed), /set/i);
});

// --- handEditEvents ---

test('each diff entry becomes one valid hand-edit event', () => {
  const diff = diffBoards(board(), withSet(board({ title: 'New Title' }), 'set-b', {
    relationshipLabel: 'softer than'
  }));
  const events = handEditEvents(diff, { attemptId: '0002', ids: (n) => `edit-${n}` });

  assert.equal(events.length, 2);
  for (const event of events) {
    assert.equal(event.schemaVersion, '1.0');
    assert.equal(event.attemptId, '0002');
    assert.equal(event.action, 'hand-edit');
    assert.equal(event.formVersion, 5);
    assert.equal(event.source, 'review-studio-edit');
    assert.deepEqual(event.tags, []);
    assert.equal(typeof event.before, 'object');
    assert.equal(typeof event.after, 'object');
  }
  assert.deepEqual(events.map((e) => e.id), ['edit-1', 'edit-2']);
  assert.deepEqual(events.map((e) => e.scope.type).sort(), ['board', 'set']);
});

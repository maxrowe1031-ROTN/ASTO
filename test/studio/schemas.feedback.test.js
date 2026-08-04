// The feedback event schema — the shape every editorial judgement is stored
// in, and therefore the shape the rubric is eventually compiled from.
//
// Same conventions as the manifest validators: pure, never throws, collects
// every error. A malformed event is worse than a missing one — it would sit
// in the corpus looking like signal.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FEEDBACK_SCHEMA_VERSION,
  FEEDBACK_ACTIONS,
  QUICK_TAGS,
  validateFeedbackEvent,
} from '../../studio/schemas.js';

const good = (overrides = {}) => ({
  schemaVersion: FEEDBACK_SCHEMA_VERSION,
  id: 'fb-0001',
  attemptId: '0001',
  action: 'reject-set',
  scope: { type: 'set', setId: 'set-homes' },
  tags: ['relationship-does-not-click'],
  note: 'Reads as a category, not a relationship.',
  source: 'review-studio',
  ...overrides,
});

const errorPaths = (event) => validateFeedbackEvent(event).errors.map((e) => e.path);

test('a well-formed event validates', () => {
  assert.deepEqual(validateFeedbackEvent(good()), { ok: true, errors: [] });
});

test('the spec\'s ten in-scope actions are all accepted', () => {
  assert.deepEqual(
    [...FEEDBACK_ACTIONS].sort(),
    [
      'approve-board',
      'approve-set',
      'approve-unchanged',
      'change-difficulty',
      'change-explanation',
      'change-label',
      'reject-board',
      'reject-set',
      'revise-board',
      'revise-set',
    ],
  );
  for (const action of FEEDBACK_ACTIONS) {
    assert.equal(validateFeedbackEvent(good({ action })).ok, true, action);
  }
});

test('the spec\'s thirteen quick tags, plus four from the corpus, are all accepted', () => {
  assert.equal(QUICK_TAGS.length, 17);
  assert.equal(validateFeedbackEvent(good({ tags: [...QUICK_TAGS] })).ok, true);
});

test('the spec\'s original thirteen are all still there — the vocabulary only grows', () => {
  // Append-only: a removed tag would orphan every event already carrying it,
  // and the corpus is a record of what Max thought at the time.
  for (const tag of [
    'relationship-does-not-click', 'order-ambiguous', 'too-obscure', 'too-easy',
    'too-difficult', 'cross-set-association', 'repetitive-shape', 'weak-explanation',
    'weak-label', 'valid-but-unfair', 'good-unchanged', 'strong-reveal', 'difficulty-accurate',
  ]) {
    assert.ok(QUICK_TAGS.includes(tag), `the spec's ${tag} went missing`);
  }
});

test('a change-difficulty event from the tier picker validates as written', () => {
  // The exact shape studio/review/ui/feedback.js emits. The action and the
  // before/after fields predate the control by two days; this is the test that
  // says the control and the schema agree.
  const event = good({
    action: 'change-difficulty',
    scope: { type: 'set', setId: 'set-growth' },
    tags: [],
    before: { difficulty: 1 },
    after: { difficulty: 3 },
  });
  delete event.note;
  assert.equal(validateFeedbackEvent(event).ok, true);
});

test('an unknown action is rejected — the vocabulary is closed', () => {
  assert.deepEqual(errorPaths(good({ action: 'vibes-bad' })), ['action']);
});

test('an unknown tag is rejected, and the message names it', () => {
  const { ok, errors } = validateFeedbackEvent(good({ tags: ['too-brown'] }));
  assert.equal(ok, false);
  assert.match(errors[0].message, /too-brown/);
});

test('a board-scoped event needs no setId; a set-scoped one does', () => {
  assert.equal(validateFeedbackEvent(good({ scope: { type: 'board' } })).ok, true);
  assert.deepEqual(errorPaths(good({ scope: { type: 'set' } })), ['scope.setId']);
});

test('a board-scoped event must not smuggle a setId', () => {
  assert.deepEqual(
    errorPaths(good({ scope: { type: 'board', setId: 'set-homes' } })),
    ['scope.setId'],
  );
});

test('an unknown scope type is rejected', () => {
  assert.deepEqual(errorPaths(good({ scope: { type: 'word' } })), ['scope.type']);
});

test('the schema version must match — an old event is not silently accepted', () => {
  assert.deepEqual(errorPaths(good({ schemaVersion: '0.9' })), ['schemaVersion']);
});

test('attemptId must be the zero-padded four-digit form', () => {
  assert.deepEqual(errorPaths(good({ attemptId: '1' })), ['attemptId']);
});

test('tags may be empty — a note on its own is legitimate feedback', () => {
  assert.equal(validateFeedbackEvent(good({ tags: [] })).ok, true);
});

test('a note is optional but must be a string when present, and is length-capped', () => {
  assert.equal(validateFeedbackEvent(good({ note: undefined })).ok, true);
  assert.deepEqual(errorPaths(good({ note: 42 })), ['note']);
  assert.deepEqual(errorPaths(good({ note: 'x'.repeat(4001) })), ['note']);
});

test('before/after are optional objects — the diff a change-* action carries', () => {
  assert.equal(
    validateFeedbackEvent(
      good({ action: 'change-label', before: { relationshipLabel: 'a' }, after: { relationshipLabel: 'b' } }),
    ).ok,
    true,
  );
  assert.deepEqual(errorPaths(good({ before: 'a string' })), ['before']);
});

test('an unknown key is rejected — a typo\'d field would be invisible signal loss', () => {
  assert.deepEqual(errorPaths(good({ tagz: ['too-easy'] })), ['tagz']);
});

test('every problem is collected, not just the first', () => {
  const { ok, errors } = validateFeedbackEvent({
    schemaVersion: 'nope',
    action: 'invented',
    scope: { type: 'set' },
    tags: ['not-a-tag'],
  });
  assert.equal(ok, false);
  assert.ok(errors.length >= 5, `only ${errors.length} problems reported`);
});

test('a non-object is rejected without throwing', () => {
  for (const value of [null, undefined, 'x', 42, []]) {
    assert.equal(validateFeedbackEvent(value).ok, false);
  }
});

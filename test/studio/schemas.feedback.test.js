// The feedback event schema — the shape every editorial judgement is stored
// in, and therefore the shape the rubric is eventually compiled from.
//
// Same conventions as the manifest validators: pure, never throws, collects
// every error. A malformed event is worse than a missing one — it would sit
// in the corpus looking like signal.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ACTIVE_TAGS,
  FEEDBACK_SCHEMA_VERSION,
  FEEDBACK_ACTIONS,
  FEEDBACK_FORM_VERSION,
  QUICK_TAGS,
  RETIRED_TAGS,
  TASTE_VERDICTS,
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

test('the action vocabulary is the spec\'s ten plus the 2026-08-05 instrument plus hand-edit', () => {
  // APPEND ONLY. Five arrived with formVersion 2: three set-scoped verdicts
  // that are chosen per set rather than inherited from the board button, plus
  // the playthrough record and the proposer's verdict. `hand-edit` arrived
  // with formVersion 5 (B2, 2026-08-13): the editor's record of a field Max
  // changed by hand.
  assert.deepEqual(
    [...FEEDBACK_ACTIONS].sort(),
    [
      'approve-board',
      'approve-set',
      'approve-unchanged',
      'change-difficulty',
      'change-explanation',
      'change-label',
      'hand-edit',
      'playthrough',
      'proposal-verdict',
      'reject-board',
      'reject-set',
      'revise-board',
      'revise-set',
      'set-needs-edit',
      'set-publishable',
      'set-replace',
    ],
  );
  for (const action of FEEDBACK_ACTIONS) {
    const event = good({ action });
    // hand-edit is the one action with required fields beyond the common set.
    if (action === 'hand-edit') Object.assign(event, { before: { x: 1 }, after: { x: 2 } });
    assert.equal(validateFeedbackEvent(event).ok, true, action);
  }
});

// --- the hand-edit record (formVersion 5, B2) ---

test('a hand-edit event carries the machine value and the human value, or it is refused', () => {
  // The Brain's rule made schema: an edit recorded without before/after is
  // contamination — analysis could never separate Max's hand from the
  // pipeline's output. Both sides required, both plain objects.
  const edit = (overrides) =>
    good({
      action: 'hand-edit',
      scope: { type: 'set', setId: 'set-homes' },
      tags: [],
      before: { relationshipLabel: 'old' },
      after: { relationshipLabel: 'new' },
      source: 'review-studio-edit',
      ...overrides,
    });
  assert.equal(validateFeedbackEvent(edit({})).ok, true);
  assert.deepEqual(errorPaths(edit({ before: undefined })), ['before']);
  assert.deepEqual(errorPaths(edit({ after: undefined })), ['after']);
  assert.deepEqual(
    errorPaths(edit({ before: undefined, after: undefined })).sort(),
    ['after', 'before'],
  );
});

test('a board-scoped hand-edit validates too — the title is board-level', () => {
  const event = good({
    action: 'hand-edit',
    scope: { type: 'board' },
    tags: [],
    before: { title: 'School Days' },
    after: { title: 'Chalk and Chapters' },
    source: 'review-studio-edit',
  });
  delete event.note;
  assert.equal(validateFeedbackEvent(event).ok, true);
});

test('the spec\'s thirteen quick tags, plus seven from the corpus, are all accepted', () => {
  // 13 from the spec · 4 added 2026-08-04 · `second-valid-reading` added
  // 2026-08-05 · the two taste tags added 2026-08-09 (formVersion 4). The
  // count only ever goes up: retiring a tag takes it out of the FORM, never
  // out of the vocabulary.
  assert.equal(QUICK_TAGS.length, 20);
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

// --- the corpus itself, as the regression test ---------------------------
//
// The feedback corpus is now versioned (2026-08-05), which makes it available
// as a fixture — and it is the only fixture that matters here. A schema change
// that orphaned a historical event would silently discard Max's judgement, so
// every event he has ever written is replayed against the current validator.
test('every feedback event ever recorded still validates', () => {
  const runsDir = fileURLToPath(new URL('../../studio/runs/', import.meta.url));
  if (!existsSync(runsDir)) return; // a fresh clone with no corpus yet

  let checked = 0;
  for (const runId of readdirSync(runsDir)) {
    const file = join(runsDir, runId, 'feedback.jsonl');
    if (!existsSync(file)) continue;
    for (const [i, line] of readFileSync(file, 'utf8').split('\n').entries()) {
      if (!line.trim()) continue;
      const { ok, errors } = validateFeedbackEvent(JSON.parse(line));
      assert.equal(ok, true, `${runId} line ${i + 1}: ${JSON.stringify(errors)}`);
      checked += 1;
    }
  }
  assert.ok(checked >= 100, `only ${checked} events replayed — is the corpus still committed?`);
});

test('version-1 set events are exactly the ones whose action cannot be trusted', () => {
  // Recorded as a test so rubric compilation cannot forget it: under the old
  // form a set inherited the board button, so 21 tagged set-events say
  // `reject-set` while carrying only praise. Their TAGS are honest; their
  // action is not. Anything without a formVersion is version 1.
  const runsDir = fileURLToPath(new URL('../../studio/runs/', import.meta.url));
  if (!existsSync(runsDir)) return;

  const POSITIVE = new Set(['good-unchanged', 'strong-reveal', 'difficulty-accurate', 'feels-like-asto']);
  let contradictory = 0;
  for (const runId of readdirSync(runsDir)) {
    const file = join(runsDir, runId, 'feedback.jsonl');
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const e = JSON.parse(line);
      if (e.formVersion !== undefined) continue; // version 2 records its own verdict
      const tags = new Set(e.tags ?? []);
      const onlyPraise = tags.size > 0 && [...tags].every((t) => POSITIVE.has(t));
      if (e.action === 'reject-set' && onlyPraise) contradictory += 1;
    }
  }
  assert.ok(contradictory > 0, 'the version-1 contradiction should still be visible in the corpus');
});

// --- the retirement of `valid-but-unfair` (2026-08-05) --------------------
//
// Its chip read "technically correct, but the player could not have known",
// and across nine uses Max never once meant that. Four meant "the same four
// words regroup into a second analogy that also works" — which had no chip, so
// it landed on the vaguest one available. The other five were already covered
// by `not-always-true` and `not-evocative`.
//
// So: one precise tag added, one vague chip retired from the form. The tag
// itself is never removed from the vocabulary, because nine events carry it and
// the corpus is the record of what Max thought at the time.

test('the retired tag still validates — nine recorded events depend on it', () => {
  assert.ok(RETIRED_TAGS.has('valid-but-unfair'));
  assert.ok(QUICK_TAGS.includes('valid-but-unfair'), 'a retired tag must stay in the vocabulary');
  assert.equal(validateFeedbackEvent(good({ tags: ['valid-but-unfair'] })).ok, true);
});

test('the new tag is accepted, and is not offered as a retired one', () => {
  assert.ok(QUICK_TAGS.includes('second-valid-reading'));
  assert.ok(ACTIVE_TAGS.includes('second-valid-reading'));
  assert.equal(validateFeedbackEvent(good({ tags: ['second-valid-reading'] })).ok, true);
});

test('ACTIVE_TAGS is the vocabulary minus what has been retired', () => {
  assert.deepEqual(
    ACTIVE_TAGS,
    QUICK_TAGS.filter((tag) => !RETIRED_TAGS.has(tag)),
  );
  assert.ok(!ACTIVE_TAGS.includes('valid-but-unfair'));
  // Retiring is subtraction from the FORM, never from the record.
  assert.equal(ACTIVE_TAGS.length, QUICK_TAGS.length - RETIRED_TAGS.size);
});

// The two meanings that already had homes. Recorded so a future reading of the
// corpus does not "rediscover" the gap and add chips that already exist.
test('the tags that absorbed the other two meanings are still in the vocabulary', () => {
  for (const tag of ['not-always-true', 'not-evocative', 'weak-explanation']) {
    assert.ok(ACTIVE_TAGS.includes(tag), `${tag} is what half of valid-but-unfair became`);
  }
});

test('the form version moved with the instrument', () => {
  // Version 3: rubric compilation can tell the two populations apart — the
  // ABSENCE of `valid-but-unfair` means something different before and after
  // the retirement. Version 4 (2026-08-09): the taste instrument — before it,
  // an absent taste verdict means the question was never asked. Version 5
  // (2026-08-13): the hand editor exists — before it, an unapplied recorded
  // change meant no tool; after, it means Max chose not to edit.
  assert.equal(FEEDBACK_FORM_VERSION, 5);
});

// --- the taste instrument (formVersion 4) ---

test('a board event may carry a taste verdict, and only the three real ones', () => {
  for (const taste of TASTE_VERDICTS) {
    const event = good({ action: 'approve-board', scope: { type: 'board' }, taste });
    assert.deepEqual(validateFeedbackEvent(event).errors, [], taste);
  }
  assert.deepEqual(
    errorPaths(good({ action: 'approve-board', scope: { type: 'board' }, taste: 'amazing' })),
    ['taste'],
    'an invented taste value must be refused — the vocabulary is the contract',
  );
});

test('a set event cannot carry a taste verdict — taste is a property of the whole', () => {
  assert.deepEqual(errorPaths(good({ taste: 'delightful' })), ['taste']);
});

test('an event without a taste verdict stays valid — declining is not an error', () => {
  const event = good({ action: 'approve-board', scope: { type: 'board' } });
  assert.deepEqual(validateFeedbackEvent(event).errors, []);
});

test('the taste tags are active vocabulary, and publishability praise is untouched', () => {
  for (const tag of ['sharp-words', 'surprising-turn']) {
    assert.ok(ACTIVE_TAGS.includes(tag), `${tag} missing from the active vocabulary`);
  }
  // The scorecard four still validate — the two axes coexist.
  for (const tag of ['good-unchanged', 'feels-like-asto']) {
    assert.deepEqual(validateFeedbackEvent(good({ tags: [tag] })).errors, []);
  }
});

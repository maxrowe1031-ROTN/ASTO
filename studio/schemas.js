// Studio schemas — run manifest, attempt record, and run-status transitions.
//
// Validators follow the game's validate-puzzle.js convention: pure, never
// throw, return { ok, errors } and collect every error rather than stopping
// at the first. Pure: imports only the stage registry.

import { isValidStageId } from './stage-registry.js';

export const MANIFEST_SCHEMA_VERSION = '1.0';

export const RUN_STATUSES = Object.freeze([
  'created',
  'running',
  'failed',
  'awaiting-review',
  'revision-requested',
  'revising',
  'approved',
  'rejected',
  'archived',
]);

export const ATTEMPT_STATUSES = Object.freeze(['running', 'complete', 'failed']);

// from → the set of statuses a run may move to. Terminal decisions
// (approved / rejected) only archive; archived goes nowhere.
const TRANSITIONS = Object.freeze({
  created: ['running', 'archived'],
  running: ['failed', 'awaiting-review'],
  failed: ['running', 'archived'],
  'awaiting-review': ['revision-requested', 'approved', 'rejected', 'archived'],
  'revision-requested': ['revising', 'archived'],
  revising: ['failed', 'awaiting-review'],
  approved: ['archived'],
  rejected: ['archived'],
  archived: [],
});

export function canTransition(from, to) {
  return (TRANSITIONS[from] ?? []).includes(to);
}

const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;

export function validateManifest(manifest) {
  const errors = [];
  if (!isPlainObject(manifest)) {
    return { ok: false, errors: ['manifest must be an object'] };
  }
  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    errors.push(
      `schemaVersion must be "${MANIFEST_SCHEMA_VERSION}", got ${JSON.stringify(manifest.schemaVersion)}`,
    );
  }
  if (!isNonEmptyString(manifest.runId)) errors.push('runId must be a non-empty string');
  if (!isNonEmptyString(manifest.createdAt)) errors.push('createdAt must be a non-empty string');
  if (manifest.theme !== null && !isNonEmptyString(manifest.theme)) {
    errors.push('theme must be a non-empty string or null (surprise-me)');
  }
  if (!isPlainObject(manifest.brief)) errors.push('brief must be an object');
  if (!RUN_STATUSES.includes(manifest.status)) {
    errors.push(`status must be one of ${RUN_STATUSES.join(', ')}, got ${JSON.stringify(manifest.status)}`);
  }
  if (manifest.currentAttemptId !== null && !isNonEmptyString(manifest.currentAttemptId)) {
    errors.push('currentAttemptId must be a non-empty string or null');
  }
  if (!Number.isInteger(manifest.attemptCount) || manifest.attemptCount < 0) {
    errors.push('attemptCount must be a non-negative integer');
  }
  if (!Number.isInteger(manifest.revisionCount) || manifest.revisionCount < 0) {
    errors.push('revisionCount must be a non-negative integer');
  }
  return { ok: errors.length === 0, errors };
}

// --- editorial feedback ---
//
// Every judgement Max makes in the Review Studio lands as one of these. The
// vocabulary is deliberately closed: the rubric is eventually compiled from
// this corpus, so a typo'd tag or an invented action is not a harmless
// variation — it is signal that quietly goes missing. Both lists are the
// approved spec's, verbatim.

export const FEEDBACK_SCHEMA_VERSION = '1.0';

// APPEND ONLY, like the tags: the corpus is the record of what Max thought at
// the time, and every historical event must keep validating.
//
// The last four are the 2026-08-05 instrument (formVersion 2). The board
// actions above them already carried the right meaning — Max's rule is that a
// board verdict is about PUBLISHABILITY of the whole — but the set actions did
// not, because the form stamped the board's button onto every set block. 21 of
// 79 tagged set-events say `reject-set` while carrying only praise. The
// set-scoped verdicts below are chosen per set and never inherited:
//
//   set-publishable  — this set is good as it stands
//   set-needs-edit   — close; the fix belongs in `fixSuggestion`
//   set-replace      — this one has to go
//
// `playthrough` records how a board was actually played (observed behaviour
// outranks recalled opinion), and `proposal-verdict` records what Max did with
// a Revision Proposer brief — the evidence its graduation trigger needs.
export const FEEDBACK_ACTIONS = Object.freeze([
  'approve-board',
  'approve-set',
  'approve-unchanged',
  'revise-board',
  'revise-set',
  'reject-board',
  'reject-set',
  'change-difficulty',
  'change-label',
  'change-explanation',
  'set-publishable',
  'set-needs-edit',
  'set-replace',
  'playthrough',
  'proposal-verdict',
]);

// The instrument that produced an event. Stamped for the same reason
// `effortProfile` is stamped on an attempt: the form changed on 2026-08-05, and
// boards judged under two instruments are two populations. Rubric compilation
// must segment on this rather than guess from dates — under version 1 a set's
// `action` was inherited from the board button and cannot be trusted, though
// its tags and note can.
export const FEEDBACK_FORM_VERSION = 2;

// The spec's thirteen, plus four added 2026-08-04 from the review corpus itself.
//
// APPEND ONLY. A removed tag would orphan the events that already carry it —
// the corpus is the record of what Max thought at the time, and a vocabulary
// change must never rewrite that.
//
// The four are not guesses. Each is something Max wrote in prose repeatedly
// because no chip existed for it, across 55 events on 10 boards:
//
//   not-always-true    his most common reason for killing a set (7 notes) —
//                      "a telescope does not necessarily yeild a discovery",
//                      "a buzzer does not always indicate overtime". It was
//                      being logged as relationship-does-not-click, which also
//                      covers labels that merely read badly. Two different
//                      faults with two different fixes deserve two tags.
//   no-unifying-theme  the reason both surprise-me boards were rejected, with
//                      no way to say it except a note.
//   not-evocative      "doesn't have the ASTO vibe", "not very whisimical or
//                      fun", "doesn't feel exciting. or evocative."
//   feels-like-asto    the positive twin, which he also kept writing out:
//                      "This puzzle feels like ASTO", "a great ASTO puzzle".
export const QUICK_TAGS = Object.freeze([
  'relationship-does-not-click',
  'order-ambiguous',
  'too-obscure',
  'too-easy',
  'too-difficult',
  'cross-set-association',
  'repetitive-shape',
  'weak-explanation',
  'weak-label',
  'valid-but-unfair',
  'good-unchanged',
  'strong-reveal',
  'difficulty-accurate',
  'not-always-true',
  'no-unifying-theme',
  'not-evocative',
  'feels-like-asto',
]);

export const FEEDBACK_SCOPES = Object.freeze(['board', 'set']);

const MAX_NOTE_LENGTH = 4000;

const FEEDBACK_KEYS = new Set([
  'schemaVersion',
  'id',
  'attemptId',
  'action',
  'scope',
  'tags',
  'note',
  'before',
  'after',
  'source',
  // Stamped by run-store on append (`{ ...event, at: clock() }`), so it is
  // absent when the server validates an incoming event and present in every
  // stored one. Allowed here so a STORED event can be re-validated — which is
  // what the corpus-replay test does, and what any future rubric compiler
  // reading feedback.jsonl will need.
  'at',
  // 2026-08-05 (formVersion 2)
  'formVersion',
  'blockers',
  'fixSuggestion',
  'playthrough',
  'proposal',
]);

export function validateFeedbackEvent(event) {
  const errors = [];
  const fail = (path, message) => errors.push({ path, message });

  if (!isPlainObject(event)) {
    return { ok: false, errors: [{ path: '', message: 'feedback event must be an object' }] };
  }

  if (event.schemaVersion !== FEEDBACK_SCHEMA_VERSION) {
    fail(
      'schemaVersion',
      `must be "${FEEDBACK_SCHEMA_VERSION}", got ${JSON.stringify(event.schemaVersion)}`,
    );
  }
  if (!isNonEmptyString(event.id)) fail('id', 'must be a non-empty string');
  if (typeof event.attemptId !== 'string' || !ATTEMPT_ID_PATTERN.test(event.attemptId)) {
    fail('attemptId', 'must be a zero-padded four-digit string');
  }
  if (!FEEDBACK_ACTIONS.includes(event.action)) {
    fail('action', `must be one of ${FEEDBACK_ACTIONS.join(', ')}, got ${JSON.stringify(event.action)}`);
  }

  if (!isPlainObject(event.scope)) {
    fail('scope', 'must be an object');
  } else {
    if (!FEEDBACK_SCOPES.includes(event.scope.type)) {
      fail('scope.type', `must be one of ${FEEDBACK_SCOPES.join(', ')}`);
    } else if (event.scope.type === 'set' && !isNonEmptyString(event.scope.setId)) {
      fail('scope.setId', 'a set-scoped event must name its setId');
    } else if (event.scope.type === 'board' && event.scope.setId !== undefined) {
      fail('scope.setId', 'a board-scoped event must not carry a setId');
    }
  }

  if (!Array.isArray(event.tags)) {
    fail('tags', 'must be an array (empty is fine — a note alone is feedback)');
  } else {
    for (const tag of event.tags) {
      if (!QUICK_TAGS.includes(tag)) fail('tags', `unknown tag ${JSON.stringify(tag)}`);
    }
  }

  if (event.note !== undefined) {
    if (typeof event.note !== 'string') fail('note', 'must be a string');
    else if (event.note.length > MAX_NOTE_LENGTH) {
      fail('note', `must be at most ${MAX_NOTE_LENGTH} characters`);
    }
  }

  for (const side of ['before', 'after']) {
    if (event[side] !== undefined && !isPlainObject(event[side])) {
      fail(side, 'must be an object when present');
    }
  }

  if (event.source !== undefined && !isNonEmptyString(event.source)) {
    fail('source', 'must be a non-empty string when present');
  }

  // --- the 2026-08-05 instrument (formVersion 2) ---
  //
  // All optional, so every version-1 event in the corpus still validates.
  if (event.formVersion !== undefined && !Number.isInteger(event.formVersion)) {
    fail('formVersion', 'must be an integer when present');
  }

  // Which set(s) stop the board being publishable. Board-scoped only: naming a
  // blocker is a statement about the whole, and it is what the Revision
  // Proposer keys on.
  if (event.blockers !== undefined) {
    if (!Array.isArray(event.blockers)) fail('blockers', 'must be an array when present');
    else if (event.scope?.type !== 'board') fail('blockers', 'only a board-scoped event names blockers');
    else if (!event.blockers.every(isNonEmptyString)) fail('blockers', 'each blocker must be a set id');
  }

  // Max's own fix, in his words. His highest-value habit — two prose fixes
  // became rule-011 and rule-012 — promoted from a note to a queryable field.
  if (event.fixSuggestion !== undefined) {
    if (typeof event.fixSuggestion !== 'string') fail('fixSuggestion', 'must be a string');
    else if (event.fixSuggestion.length > MAX_NOTE_LENGTH) {
      fail('fixSuggestion', `must be at most ${MAX_NOTE_LENGTH} characters`);
    }
  }

  // How the board was actually played, captured by the Studio's own play page.
  if (event.playthrough !== undefined) {
    if (!isPlainObject(event.playthrough)) fail('playthrough', 'must be an object when present');
    else {
      const { solvedOrder, mistakes, soClose } = event.playthrough;
      if (solvedOrder !== undefined && !Array.isArray(solvedOrder)) {
        fail('playthrough.solvedOrder', 'must be an array of set ids');
      }
      for (const [key, value] of [['mistakes', mistakes], ['soClose', soClose]]) {
        if (value !== undefined && !Number.isInteger(value)) {
          fail(`playthrough.${key}`, 'must be an integer when present');
        }
      }
    }
  }

  // What Max did with a Revision Proposer brief. `edited` carries the edited
  // text, because the edit is precisely what the proposer got wrong.
  if (event.proposal !== undefined) {
    if (!isPlainObject(event.proposal)) fail('proposal', 'must be an object when present');
    else if (!['accepted', 'edited', 'discarded'].includes(event.proposal.verdict)) {
      fail('proposal.verdict', 'must be one of accepted, edited, discarded');
    }
  }

  // A misspelled field would be silently dropped and read later as an absence
  // rather than a mistake, so unknown keys are an error rather than ignored.
  for (const key of Object.keys(event)) {
    if (!FEEDBACK_KEYS.has(key)) fail(key, 'unknown field');
  }

  return { ok: errors.length === 0, errors };
}

// --- the editorial rules corpus ---
//
// Rules are what every agent is told to follow. They arrive two ways: seeded
// from the GDD's editorial standards, or compiled from Max's recorded
// feedback — and the second kind must carry provenance back to the runs that
// justified it, or a rule becomes an assertion nobody can audit.
//
// `status` is the safety catch: only 'approved' rules are ever loaded into a
// prompt, so a proposal can sit in the file waiting for Max without changing
// what the pipeline does.

export const RULES_SCHEMA_VERSION = '1.0';
export const RULE_STATUSES = Object.freeze(['approved', 'proposed', 'retired']);

export function validateRulesFile(value) {
  const errors = [];
  const fail = (path, message) => errors.push({ path, message });

  if (!isPlainObject(value)) {
    return { ok: false, errors: [{ path: '', message: 'rules file must be an object' }] };
  }
  if (value.schemaVersion !== RULES_SCHEMA_VERSION) {
    fail('schemaVersion', `must be "${RULES_SCHEMA_VERSION}"`);
  }
  if (!Array.isArray(value.rules)) {
    return { ok: errors.length === 0, errors: [...errors, { path: 'rules', message: 'must be an array' }] };
  }

  const seen = new Set();
  value.rules.forEach((rule, i) => {
    const at = `rules[${i}]`;
    if (!isPlainObject(rule)) {
      fail(at, 'must be an object');
      return;
    }
    if (!isNonEmptyString(rule.id)) fail(`${at}.id`, 'must be a non-empty string');
    else if (seen.has(rule.id)) fail(`${at}.id`, `duplicate rule id "${rule.id}"`);
    else seen.add(rule.id);

    if (!isNonEmptyString(rule.text)) fail(`${at}.text`, 'must be a non-empty string');
    if (!RULE_STATUSES.includes(rule.status)) {
      fail(`${at}.status`, `must be one of ${RULE_STATUSES.join(', ')}`);
    }
    if (!isNonEmptyString(rule.source)) fail(`${at}.source`, 'must say where the rule came from');
    if (rule.provenance !== undefined && !isPlainObject(rule.provenance)) {
      fail(`${at}.provenance`, 'must be an object when present');
    }
  });

  return { ok: errors.length === 0, errors };
}

const ATTEMPT_ID_PATTERN = /^\d{4}$/;

export function validateAttempt(attempt) {
  const errors = [];
  if (!isPlainObject(attempt)) {
    return { ok: false, errors: ['attempt must be an object'] };
  }
  if (attempt.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    errors.push(
      `schemaVersion must be "${MANIFEST_SCHEMA_VERSION}", got ${JSON.stringify(attempt.schemaVersion)}`,
    );
  }
  if (typeof attempt.attemptId !== 'string' || !ATTEMPT_ID_PATTERN.test(attempt.attemptId)) {
    errors.push('attemptId must be a zero-padded four-digit string');
  }
  if (attempt.parentAttemptId !== null) {
    if (
      typeof attempt.parentAttemptId !== 'string' ||
      !ATTEMPT_ID_PATTERN.test(attempt.parentAttemptId)
    ) {
      errors.push('parentAttemptId must be a zero-padded four-digit string or null');
    }
  }
  if (!isValidStageId(attempt.startingStage)) {
    errors.push(`startingStage is not a stage id: ${JSON.stringify(attempt.startingStage)}`);
  }
  if (!ATTEMPT_STATUSES.includes(attempt.status)) {
    errors.push(
      `status must be one of ${ATTEMPT_STATUSES.join(', ')}, got ${JSON.stringify(attempt.status)}`,
    );
  }
  if (!isPlainObject(attempt.stageStatuses)) errors.push('stageStatuses must be an object');
  if (!Array.isArray(attempt.resumes)) errors.push('resumes must be an array');
  if (!isNonEmptyString(attempt.createdAt)) errors.push('createdAt must be a non-empty string');
  return { ok: errors.length === 0, errors };
}

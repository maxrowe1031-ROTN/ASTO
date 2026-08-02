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
]);

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

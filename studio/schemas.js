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

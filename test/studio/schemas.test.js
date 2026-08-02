// Studio schemas: run manifest, attempt record, and the run-status
// transition map. Validators mirror validate-puzzle.js: pure, never throw,
// return { ok, errors } and collect every error rather than stopping.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MANIFEST_SCHEMA_VERSION,
  RUN_STATUSES,
  validateManifest,
  validateAttempt,
  canTransition,
} from '../../studio/schemas.js';

const goodManifest = () => ({
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  runId: '2026-08-02T14-03-11Z-lantern',
  createdAt: '2026-08-02T14:03:11Z',
  theme: 'lantern',
  brief: {},
  status: 'created',
  currentAttemptId: null,
  attemptCount: 0,
  revisionCount: 0,
});

const goodAttempt = () => ({
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  attemptId: '0001',
  parentAttemptId: null,
  startingStage: '01-pair-author',
  status: 'running',
  stageStatuses: {},
  resumes: [],
  createdAt: '2026-08-02T14:03:11Z',
});

// --- manifest ---

test('a good manifest validates', () => {
  assert.deepEqual(validateManifest(goodManifest()), { ok: true, errors: [] });
});

test('a surprise-me manifest has null theme and still validates', () => {
  const m = goodManifest();
  m.theme = null;
  assert.equal(validateManifest(m).ok, true);
});

test('missing required manifest fields are each reported', () => {
  const m = goodManifest();
  delete m.runId;
  delete m.status;
  const result = validateManifest(m);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('runId')));
  assert.ok(result.errors.some((e) => e.includes('status')));
});

test('an unknown status is rejected', () => {
  const m = goodManifest();
  m.status = 'meandering';
  const result = validateManifest(m);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('meandering')));
});

test('an unknown schemaVersion is rejected — old schema opened by new code fails loudly', () => {
  const m = goodManifest();
  m.schemaVersion = '0.9';
  const result = validateManifest(m);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('schemaVersion')));
});

test('validateManifest never throws, whatever it is handed', () => {
  for (const junk of [null, undefined, 42, 'runs', [], {}]) {
    assert.equal(validateManifest(junk).ok, false);
  }
});

// --- attempt ---

test('a good attempt validates', () => {
  assert.deepEqual(validateAttempt(goodAttempt()), { ok: true, errors: [] });
});

test('an attempt id must be a zero-padded four-digit string', () => {
  for (const bad of ['1', '001', 1, '00001', 'abcd']) {
    const a = goodAttempt();
    a.attemptId = bad;
    assert.equal(validateAttempt(a).ok, false, `accepted ${JSON.stringify(bad)}`);
  }
});

test('an attempt startingStage must be a real stage id', () => {
  const a = goodAttempt();
  a.startingStage = '09-nonsense';
  const result = validateAttempt(a);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('09-nonsense')));
});

test('attempt statuses are running, complete, or failed only', () => {
  for (const good of ['running', 'complete', 'failed']) {
    const a = goodAttempt();
    a.status = good;
    assert.equal(validateAttempt(a).ok, true);
  }
  const a = goodAttempt();
  a.status = 'paused';
  assert.equal(validateAttempt(a).ok, false);
});

test('validateAttempt never throws, whatever it is handed', () => {
  for (const junk of [null, undefined, 42, 'attempt', [], {}]) {
    assert.equal(validateAttempt(junk).ok, false);
  }
});

// --- status transitions ---

test('the spec lists exactly these run statuses', () => {
  assert.deepEqual(
    [...RUN_STATUSES].sort(),
    [
      'approved',
      'archived',
      'awaiting-review',
      'created',
      'failed',
      'rejected',
      'revising',
      'revision-requested',
      'running',
    ].sort(),
  );
});

test('the normal editorial path is transition-legal end to end', () => {
  const path = [
    'created',
    'running',
    'awaiting-review',
    'revision-requested',
    'revising',
    'awaiting-review',
    'approved',
  ];
  for (let i = 0; i < path.length - 1; i += 1) {
    assert.equal(canTransition(path[i], path[i + 1]), true, `${path[i]} → ${path[i + 1]}`);
  }
});

test('a failed run can resume (back to running) and a revising run can fail', () => {
  assert.equal(canTransition('running', 'failed'), true);
  assert.equal(canTransition('failed', 'running'), true);
  assert.equal(canTransition('revising', 'failed'), true);
});

test('terminal decisions do not reopen', () => {
  assert.equal(canTransition('approved', 'running'), false);
  assert.equal(canTransition('approved', 'awaiting-review'), false);
  assert.equal(canTransition('rejected', 'running'), false);
  assert.equal(canTransition('archived', 'running'), false);
});

test('approved and rejected runs may still be archived', () => {
  assert.equal(canTransition('approved', 'archived'), true);
  assert.equal(canTransition('rejected', 'archived'), true);
});

test('a run cannot skip review — running never goes straight to approved', () => {
  assert.equal(canTransition('running', 'approved'), false);
  assert.equal(canTransition('created', 'approved'), false);
});

test('unknown statuses never transition anywhere', () => {
  assert.equal(canTransition('meandering', 'running'), false);
  assert.equal(canTransition('running', 'meandering'), false);
});

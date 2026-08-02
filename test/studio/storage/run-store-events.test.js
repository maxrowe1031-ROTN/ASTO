// Event-log hardening on run-store: feedback is validated before it lands,
// and both event logs are written under the per-run lock.
//
// Both matter because there are now two writers — the pipeline appending its
// own decisions, and the Review Studio appending Max's. Kept in a separate
// file from run-store.test.js so the A1 suite stays exactly as it was.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createRunStore } from '../../../studio/storage/run-store.js';
import { acquireLock, LockHeldError } from '../../../studio/storage/lock.js';
import { FEEDBACK_SCHEMA_VERSION } from '../../../studio/schemas.js';

const withStore = (body) => {
  const rootDir = mkdtempSync(join(tmpdir(), 'asto-store-events-'));
  let tick = 0;
  const store = createRunStore({
    rootDir,
    clock: () => new Date(Date.UTC(2026, 7, 2, 12, 0, (tick += 1))).toISOString(),
  });
  try {
    return body(store, rootDir);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
};

const goodEvent = (overrides = {}) => ({
  schemaVersion: FEEDBACK_SCHEMA_VERSION,
  id: 'fb-1',
  attemptId: '0001',
  action: 'reject-set',
  scope: { type: 'set', setId: 'set-homes' },
  tags: ['relationship-does-not-click'],
  note: 'Category, not a relationship.',
  source: 'review-studio',
  ...overrides,
});

test('a valid feedback event round-trips', () => {
  withStore((store) => {
    const { runId } = store.createRun({ slug: 'lantern' });
    store.appendFeedback(runId, goodEvent());

    const [event] = store.readFeedback(runId);
    assert.equal(event.id, 'fb-1');
    assert.equal(event.action, 'reject-set');
    assert.ok(event.at, 'the store stamps the time');
  });
});

test('an invalid feedback event is refused, and the log stays empty', () => {
  withStore((store) => {
    const { runId } = store.createRun({ slug: 'lantern' });

    assert.throws(
      () => store.appendFeedback(runId, goodEvent({ tags: ['not-a-real-tag'] })),
      /refusing to append invalid feedback/,
    );
    assert.deepEqual(store.readFeedback(runId), []);
  });
});

test('the refusal names every problem, not just the first', () => {
  withStore((store) => {
    const { runId } = store.createRun({ slug: 'lantern' });
    let message = '';
    try {
      store.appendFeedback(runId, { schemaVersion: 'nope', action: 'invented' });
    } catch (error) {
      message = error.message;
    }
    assert.match(message, /schemaVersion/);
    assert.match(message, /action/);
  });
});

test('feedback appends under the run lock — a live holder blocks it', () => {
  withStore((store, rootDir) => {
    const { runId, dir } = store.createRun({ slug: 'lantern' });
    const release = acquireLock(dir); // held by this very process, so: alive
    try {
      assert.throws(() => store.appendFeedback(runId, goodEvent()), LockHeldError);
    } finally {
      release();
    }
    // Released: the same append now succeeds.
    store.appendFeedback(runId, goodEvent());
    assert.equal(store.readFeedback(runId).length, 1);
  });
});

test('decisions append under the run lock too — the pipeline and the Studio share it', () => {
  withStore((store) => {
    const { runId, dir } = store.createRun({ slug: 'lantern' });
    const release = acquireLock(dir);
    try {
      assert.throws(() => store.appendDecision(runId, { type: 'approved' }), LockHeldError);
    } finally {
      release();
    }
    store.appendDecision(runId, { type: 'approved' });
    assert.equal(store.readDecisions(runId).length, 1);
  });
});

test('many appends interleave without tearing a line', () => {
  withStore((store) => {
    const { runId } = store.createRun({ slug: 'lantern' });
    for (let i = 0; i < 40; i += 1) {
      store.appendFeedback(runId, goodEvent({ id: `fb-${i}`, note: 'x'.repeat(200) }));
    }
    const events = store.readFeedback(runId);
    assert.equal(events.length, 40);
    assert.deepEqual(
      events.map((e) => e.id),
      Array.from({ length: 40 }, (_, i) => `fb-${i}`),
    );
  });
});

test('decisions are not put through the feedback validator — they are a different shape', () => {
  withStore((store) => {
    const { runId } = store.createRun({ slug: 'lantern' });
    store.appendDecision(runId, { type: 'attempt-completed', attemptId: '0001', boardId: 'b' });
    assert.equal(store.readDecisions(runId)[0].type, 'attempt-completed');
  });
});

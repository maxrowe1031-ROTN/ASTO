// run-store: the only module that reads/writes run artifacts.
//
// Proves the run-directory contract: monotonic attempt IDs, immutable
// completed attempts, valid status transitions, resume bookkeeping, and
// quarantine of partial stage folders. The clock is injected — same rule
// as the engine's RNG — so run IDs are deterministic under test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createRunStore } from '../../../studio/storage/run-store.js';

const fixedClock = () => '2026-08-02T14:03:11Z';

const makeStore = () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'asto-runs-'));
  return { store: createRunStore({ rootDir, clock: fixedClock }), rootDir };
};

const cleanup = (rootDir) => rmSync(rootDir, { recursive: true, force: true });

// --- creating runs ---

test('createRun writes a valid manifest and returns a clock-derived run id', () => {
  const { store, rootDir } = makeStore();
  try {
    const { runId } = store.createRun({ slug: 'lantern', theme: 'lantern' });
    assert.equal(runId, '2026-08-02T14-03-11Z-lantern');
    const manifest = store.readManifest(runId);
    assert.equal(manifest.status, 'created');
    assert.equal(manifest.theme, 'lantern');
    assert.equal(manifest.attemptCount, 0);
    assert.equal(manifest.currentAttemptId, null);
  } finally {
    cleanup(rootDir);
  }
});

test('a surprise-me run stores theme null', () => {
  const { store, rootDir } = makeStore();
  try {
    const { runId } = store.createRun({ slug: 'surprise' });
    assert.equal(store.readManifest(runId).theme, null);
  } finally {
    cleanup(rootDir);
  }
});

test('a duplicate run id is rejected, not overwritten', () => {
  const { store, rootDir } = makeStore();
  try {
    store.createRun({ slug: 'lantern' });
    assert.throws(() => store.createRun({ slug: 'lantern' }), /already exists/i);
  } finally {
    cleanup(rootDir);
  }
});

test('listRuns returns run ids, newest last, ignoring stray files', () => {
  const { store, rootDir } = makeStore();
  try {
    store.createRun({ slug: 'aa' });
    store.createRun({ slug: 'bb' });
    writeFileSync(join(rootDir, '.gitignore'), '*\n');
    assert.deepEqual(store.listRuns(), [
      '2026-08-02T14-03-11Z-aa',
      '2026-08-02T14-03-11Z-bb',
    ]);
  } finally {
    cleanup(rootDir);
  }
});

// --- reading manifests defensively ---

test('a corrupted manifest is a loud error, not undefined', () => {
  const { store, rootDir } = makeStore();
  try {
    const { runId, dir } = store.createRun({ slug: 'lantern' });
    writeFileSync(join(dir, 'manifest.json'), '{ not json');
    assert.throws(() => store.readManifest(runId), /manifest/i);
  } finally {
    cleanup(rootDir);
  }
});

test('an old schemaVersion is refused by new code with a clear message', () => {
  const { store, rootDir } = makeStore();
  try {
    const { runId, dir } = store.createRun({ slug: 'lantern' });
    const raw = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
    raw.schemaVersion = '0.9';
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(raw));
    assert.throws(() => store.readManifest(runId), /schemaVersion/);
  } finally {
    cleanup(rootDir);
  }
});

// --- status transitions ---

test('updateStatus follows the transition map and rejects illegal jumps', () => {
  const { store, rootDir } = makeStore();
  try {
    const { runId } = store.createRun({ slug: 'lantern' });
    store.updateStatus(runId, 'running');
    store.updateStatus(runId, 'awaiting-review');
    assert.equal(store.readManifest(runId).status, 'awaiting-review');
    assert.throws(() => store.updateStatus(runId, 'running'), /awaiting-review.*running/);
  } finally {
    cleanup(rootDir);
  }
});

test('a run can never jump straight from running to approved', () => {
  const { store, rootDir } = makeStore();
  try {
    const { runId } = store.createRun({ slug: 'lantern' });
    store.updateStatus(runId, 'running');
    assert.throws(() => store.updateStatus(runId, 'approved'));
  } finally {
    cleanup(rootDir);
  }
});

// --- attempts ---

test('createAttempt issues monotonic zero-padded ids and updates the manifest', () => {
  const { store, rootDir } = makeStore();
  try {
    const { runId } = store.createRun({ slug: 'lantern' });
    assert.equal(store.createAttempt(runId), '0001');
    store.completeAttempt(runId, '0001', { status: 'failed', failureReason: 'test' });
    assert.equal(store.createAttempt(runId, { parentAttemptId: '0001', startingStage: '04-board-builder' }), '0002');
    const manifest = store.readManifest(runId);
    assert.equal(manifest.attemptCount, 2);
    assert.equal(manifest.currentAttemptId, '0002');
    const child = store.readAttempt(runId, '0002');
    assert.equal(child.parentAttemptId, '0001');
    assert.equal(child.startingStage, '04-board-builder');
  } finally {
    cleanup(rootDir);
  }
});

test('a second attempt cannot start while the first is still running', () => {
  const { store, rootDir } = makeStore();
  try {
    const { runId } = store.createRun({ slug: 'lantern' });
    store.createAttempt(runId);
    assert.throws(() => store.createAttempt(runId), /running/i);
  } finally {
    cleanup(rootDir);
  }
});

test('a revision attempt must re-enter at a real stage', () => {
  const { store, rootDir } = makeStore();
  try {
    const { runId } = store.createRun({ slug: 'lantern' });
    assert.throws(
      () => store.createAttempt(runId, { startingStage: '09-nonsense' }),
      /unknown stage/i,
    );
  } finally {
    cleanup(rootDir);
  }
});

// --- stage artifacts and immutability ---

test('stage artifacts round-trip through the store', () => {
  const { store, rootDir } = makeStore();
  try {
    const { runId } = store.createRun({ slug: 'lantern' });
    store.createAttempt(runId);
    store.writeStageArtifact(runId, '0001', '01-pair-author', 'output.json', { pairs: [] });
    assert.deepEqual(
      store.readStageArtifact(runId, '0001', '01-pair-author', 'output.json'),
      { pairs: [] },
    );
  } finally {
    cleanup(rootDir);
  }
});

test('artifacts only land in registered stages', () => {
  const { store, rootDir } = makeStore();
  try {
    const { runId } = store.createRun({ slug: 'lantern' });
    store.createAttempt(runId);
    assert.throws(
      () => store.writeStageArtifact(runId, '0001', '09-nonsense', 'output.json', {}),
      /unknown stage/i,
    );
  } finally {
    cleanup(rootDir);
  }
});

test('a completed attempt is immutable — no writes, no double completion', () => {
  const { store, rootDir } = makeStore();
  try {
    const { runId } = store.createRun({ slug: 'lantern' });
    store.createAttempt(runId);
    store.completeAttempt(runId, '0001', { status: 'complete' });
    assert.throws(
      () => store.writeStageArtifact(runId, '0001', '01-pair-author', 'output.json', {}),
      /immutable|complete/i,
    );
    assert.throws(() => store.completeAttempt(runId, '0001', { status: 'failed' }), /complete/i);
  } finally {
    cleanup(rootDir);
  }
});

test('completeAttempt with failed records the failure reason', () => {
  const { store, rootDir } = makeStore();
  try {
    const { runId } = store.createRun({ slug: 'lantern' });
    store.createAttempt(runId);
    store.completeAttempt(runId, '0001', { status: 'failed', failureReason: 'budget-cap' });
    const attempt = store.readAttempt(runId, '0001');
    assert.equal(attempt.status, 'failed');
    assert.equal(attempt.failureReason, 'budget-cap');
  } finally {
    cleanup(rootDir);
  }
});

// --- resume ---

test('findFirstIncompleteStage returns the first stage lacking output + validation', () => {
  const { store, rootDir } = makeStore();
  try {
    const { runId } = store.createRun({ slug: 'lantern' });
    store.createAttempt(runId);
    for (const stage of ['01-pair-author', '02-theme-grouper']) {
      store.writeStageArtifact(runId, '0001', stage, 'output.json', { ok: 1 });
      store.writeStageArtifact(runId, '0001', stage, 'validation.json', { ok: true });
    }
    assert.equal(store.findFirstIncompleteStage(runId, '0001'), '03-difficulty-rater');
  } finally {
    cleanup(rootDir);
  }
});

test('a fresh attempt resumes at its starting stage; a finished one returns null', () => {
  const { store, rootDir } = makeStore();
  try {
    const { runId } = store.createRun({ slug: 'lantern' });
    store.createAttempt(runId);
    assert.equal(store.findFirstIncompleteStage(runId, '0001'), '01-pair-author');
    for (const stage of [
      '01-pair-author', '02-theme-grouper', '03-difficulty-rater', '04-board-builder',
      '04a-integrity', '05-analogy-validator', '06-adversarial-solver', '07-test-player',
      '08-style-guide', '09-glossary-author',
    ]) {
      store.writeStageArtifact(runId, '0001', stage, 'output.json', { ok: 1 });
      store.writeStageArtifact(runId, '0001', stage, 'validation.json', { ok: true });
    }
    assert.equal(store.findFirstIncompleteStage(runId, '0001'), null);
  } finally {
    cleanup(rootDir);
  }
});

test('a revision attempt scans from its starting stage, not from stage 01', () => {
  const { store, rootDir } = makeStore();
  try {
    const { runId } = store.createRun({ slug: 'lantern' });
    store.createAttempt(runId);
    store.completeAttempt(runId, '0001', { status: 'failed', failureReason: 'test' });
    store.createAttempt(runId, { parentAttemptId: '0001', startingStage: '04-board-builder' });
    // Stages 01–03 are reused from the parent and absent here — that is
    // not incompleteness.
    assert.equal(store.findFirstIncompleteStage(runId, '0002'), '04-board-builder');
  } finally {
    cleanup(rootDir);
  }
});

test('a partial stage folder is quarantined, never silently deleted', () => {
  const { store, rootDir } = makeStore();
  try {
    const { runId, dir } = store.createRun({ slug: 'lantern' });
    store.createAttempt(runId);
    // output.json written, validation.json missing — interrupted mid-stage.
    store.writeStageArtifact(runId, '0001', '01-pair-author', 'output.json', { half: true });
    assert.equal(store.findFirstIncompleteStage(runId, '0001'), '01-pair-author');
    const stagesDir = join(dir, 'attempts', '0001', 'stages');
    const entries = readdirSync(stagesDir);
    assert.ok(entries.includes('01-pair-author.partial-1'), `got ${entries}`);
    assert.ok(!entries.includes('01-pair-author'));
    // The quarantined half-work is still readable.
    const kept = JSON.parse(
      readFileSync(join(stagesDir, '01-pair-author.partial-1', 'output.json'), 'utf8'),
    );
    assert.deepEqual(kept, { half: true });
  } finally {
    cleanup(rootDir);
  }
});

test('recordResume appends to the attempt and refuses completed attempts', () => {
  const { store, rootDir } = makeStore();
  try {
    const { runId } = store.createRun({ slug: 'lantern' });
    store.createAttempt(runId);
    store.recordResume(runId, '0001', { reenteredAt: '03-difficulty-rater' });
    const attempt = store.readAttempt(runId, '0001');
    assert.equal(attempt.resumes.length, 1);
    assert.equal(attempt.resumes[0].reenteredAt, '03-difficulty-rater');
    assert.equal(attempt.resumes[0].at, '2026-08-02T14:03:11Z');
    store.completeAttempt(runId, '0001', { status: 'complete' });
    assert.throws(() => store.recordResume(runId, '0001', { reenteredAt: '01-pair-author' }));
  } finally {
    cleanup(rootDir);
  }
});

// --- decisions and feedback ---

test('decisions and feedback append as jsonl and read back in order', () => {
  const { store, rootDir } = makeStore();
  try {
    const { runId } = store.createRun({ slug: 'lantern' });
    store.appendDecision(runId, { action: 'revise', notes: 'set-3 is reversible' });
    store.appendDecision(runId, { action: 'approve' });
    // A schema-valid event: appendFeedback validates on the way in (R1), so
    // this fixture grew the required fields. The assertions below are
    // unchanged — this test is about jsonl round-tripping and clock stamping.
    store.appendFeedback(runId, {
      schemaVersion: '1.0',
      id: 'fb-1',
      attemptId: '0001',
      action: 'revise-set',
      scope: { type: 'set', setId: 'set-3' },
      tags: ['order-ambiguous'],
    });
    assert.deepEqual(store.readDecisions(runId).map((d) => d.action), ['revise', 'approve']);
    assert.deepEqual(store.readFeedback(runId)[0].tags, ['order-ambiguous']);
    // Every appended event is stamped by the injected clock.
    assert.equal(store.readDecisions(runId)[0].at, '2026-08-02T14:03:11Z');
  } finally {
    cleanup(rootDir);
  }
});

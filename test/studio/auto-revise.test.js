// The pre-review fix loop (design.md D-14).
//
// The detection tests are the load-bearing ones: the allowlist is Max's, and
// the regression that matters most is a finding kind creeping ONTO it —
// knowledgeGated, anything from 05 or 08, taste of any kind. The orchestration
// tests run the real runner over the committed fixtures, whose cross-reading
// on set-seasons trips the allowlist by construction.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  autoRevisionFile,
  detectFindings,
  shouldAutoRevise,
} from '../../studio/auto-revise.js';
import { autoProposalFailureFile } from '../../studio/review/proposer.js';
import { createRunner } from '../../studio/review/runner.js';
import { DEFAULT_CONFIG } from '../../studio/pipeline-config.js';
import { briefText } from '../../studio/review/brief-text.js';
import * as proposer from '../../studio/agents/revision-proposer.js';
import { parseArgv, briefFor } from '../../studio/run.js';
import { buildRelationshipIndex } from '../../studio/variety.js';
import {
  makeStore,
  mockTransport,
  seedRun,
  fastTime,
  fixturesWith,
  fixturesDir,
} from './pipeline/helpers.js';

// --- detection ----------------------------------------------------------

// Two sets are enough for the joins; detection never validates the schema.
const BOARD = {
  sets: [
    { id: 'set-a', pairs: [['Seed', 'Tree'], ['Spark', 'Fire']] },
    { id: 'set-b', pairs: [['Nest', 'Bird'], ['Den', 'Bear']] },
  ],
};

test('06 cross-set-association fires at high severity and only at high', () => {
  const reports = {
    '06-adversarial-solver': {
      findings: [
        { kind: 'cross-set-association', severity: 'high', words: ['Seed', 'Nest'], note: 'pull' },
        { kind: 'cross-set-association', severity: 'medium', words: ['Tree', 'Bird'], note: 'meh' },
        { kind: 'cross-set-association', severity: 'low', words: ['Fire', 'Bear'], note: 'faint' },
      ],
    },
  };
  const findings = detectFindings({ board: BOARD, reports });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'cross-set-association');
  assert.deepEqual(findings[0].setIds.sort(), ['set-a', 'set-b']);
});

test('a cross-reading that HOLDS fires, resolved to its set by id', () => {
  const reports = {
    '06-adversarial-solver': {
      crossReadings: [
        { id: 'set-a#1', valid: true, note: 'also reads', leftRelation: 'x', rightRelation: 'y' },
        { id: 'set-a#2', valid: false },
        { id: 'set-b#1', valid: false },
      ],
    },
  };
  const findings = detectFindings({ board: BOARD, reports });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'cross-reading-holds');
  assert.deepEqual(findings[0].setIds, ['set-a']);
  assert.match(findings[0].note, /Both halves read as/);
});

test("04a's symmetric flag fires unless 06 cleared the set", () => {
  const reports = {
    '04a-integrity': {
      orderFairness: { flagged: [{ setId: 'set-a' }, { setId: 'set-b', note: 'reads both ways' }] },
    },
    '06-adversarial-solver': { orderReadings: [{ setId: 'set-a', inferable: true }] },
  };
  const findings = detectFindings({ board: BOARD, reports });
  assert.equal(findings.length, 1, 'the cleared set must stay quiet');
  assert.equal(findings[0].kind, 'order-indistinguishable');
  assert.deepEqual(findings[0].setIds, ['set-b']);
});

test("07's orderGuessed fires only when the words map to exactly one set", () => {
  const reports = {
    '07-test-player': {
      orderGuessed: [
        { words: ['Nest', 'Bird', 'Den', 'Bear'], note: 'coin flip' },
        { words: ['Seed', 'Bird', 'Den', 'Bear'], note: 'spans sets' },
      ],
    },
  };
  const findings = detectFindings({ board: BOARD, reports });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'order-guessed');
  assert.deepEqual(findings[0].setIds, ['set-b']);
});

test('what is OFF the allowlist never fires: knowledgeGated, 05, 08, taste', () => {
  // Everything here is a real defect by some other instrument's lights, and
  // none of it is Max's allowlist. An empty answer IS the assertion.
  const reports = {
    '05-analogy-validator': {
      boardPasses: false,
      verdicts: [{ setId: 'set-a', pass: false, notes: 'invalid analogy' }],
    },
    '07-test-player': {
      knowledgeGated: [{ word: 'Seed', note: 'botany-gated' }],
    },
    '08-style-guide': {
      unity: { verdict: 'weak', outliers: ['Nest'] },
      evocativeness: { verdict: 'weak', flat: ['Den'] },
      contentConcerns: [{ note: 'grim' }],
    },
    '04a-integrity': {
      lexical: { bySet: { 'set-a': 2 } },
      spanFairness: { flagged: [{ setId: 'set-b', readings: ['x : y :: z : w'] }] },
    },
  };
  assert.deepEqual(detectFindings({ board: BOARD, reports }), []);
});

test('empty reports and a missing board detect nothing rather than throwing', () => {
  assert.deepEqual(detectFindings({ board: BOARD, reports: {} }), []);
  assert.deepEqual(detectFindings({}), []);
});

// --- the guard ----------------------------------------------------------

const FINDING = { source: '06-adversarial-solver', kind: 'cross-reading-holds', setIds: ['set-a'] };
const openManifest = { brief: {}, revisionCount: 0 };
const freshAttempt = { parentAttemptId: null };

test('fires only when everything lines up, and names its refusal otherwise', () => {
  const base = {
    manifest: openManifest,
    decisions: [],
    findings: [FINDING],
    attempt: freshAttempt,
    config: DEFAULT_CONFIG,
  };
  assert.deepEqual(shouldAutoRevise(base), { ok: true, reason: null });

  assert.equal(shouldAutoRevise({ ...base, findings: [] }).reason, 'no-findings');
  assert.equal(
    shouldAutoRevise({ ...base, config: { ...DEFAULT_CONFIG, autoRevise: false } }).reason,
    'config-off',
  );
  assert.equal(
    shouldAutoRevise({ ...base, manifest: { ...openManifest, brief: { autoRevise: false } } })
      .reason,
    'run-off',
  );
  assert.equal(
    shouldAutoRevise({ ...base, attempt: { parentAttemptId: '0001' } }).reason,
    'attempt-is-a-revision',
  );
  assert.equal(
    shouldAutoRevise({ ...base, decisions: [{ type: 'auto-revision', attemptId: '0001' }] })
      .reason,
    'already-auto-revised',
  );
  assert.equal(
    shouldAutoRevise({ ...base, manifest: { ...openManifest, revisionCount: 3 } }).reason,
    'revision-cap',
  );
});

test('a quiet board reports no-findings, not whichever switch is also off', () => {
  const verdict = shouldAutoRevise({
    manifest: { brief: { autoRevise: false }, revisionCount: 3 },
    decisions: [],
    findings: [],
    attempt: freshAttempt,
    config: { ...DEFAULT_CONFIG, autoRevise: false },
  });
  assert.equal(verdict.reason, 'no-findings');
});

// --- orchestration, through the Studio door -----------------------------

const runnerOver = (store, transportDir) =>
  createRunner({
    store,
    makeTransport: () => mockTransport(transportDir),
    pipelineOptions: fastTime(),
  });

test('the committed fixtures trip the loop: one auto-revision, audited end to end', async () => {
  const { store, cleanup } = makeStore();
  const runner = runnerOver(store);
  try {
    const runId = seedRun(store);
    runner.start(runId, { mock: true });
    const result = await runner.settled(runId);

    // The revised attempt is what Max reviews.
    assert.equal(result.status, 'complete', result.failure?.message);
    assert.equal(result.attemptId, '0002');
    assert.equal(store.readManifest(runId).status, 'awaiting-review');
    assert.equal(store.readAttempt(runId, '0002').parentAttemptId, '0001');

    const decisions = store.readDecisions(runId);
    const fired = decisions.find((event) => event.type === 'auto-revision');
    assert.ok(fired, 'the auto-revision decision is the ledger entry');
    assert.equal(fired.attemptId, '0001');
    assert.equal(fired.fromStage, '04-board-builder');
    assert.ok(fired.findings.length > 0);

    // The audit artifact, keyed by the CHILD — what the review card renders.
    const audit = store.readRunArtifact(runId, autoRevisionFile('0002'));
    assert.equal(audit.parentAttemptId, '0001');
    assert.ok(audit.findings.some((finding) => finding.setIds.includes('set-seasons')));
    assert.equal(audit.proposal.fromStage, '04-board-builder');
    assert.equal(audit.notes, briefText(audit.proposal, { protectedReason: 'no allowlisted finding touches them' }));
    assert.match(audit.notes, /no allowlisted finding touches them/);
    assert.doesNotMatch(audit.notes, /these were approved/, 'pre-review, nothing was approved');

    // The fixtures replay the same board, so the fix cannot have worked: the
    // outcome must say so (the diagnosis), and must say nothing changed.
    const outcome = decisions.find((event) => event.type === 'auto-revision-outcome');
    assert.ok(outcome);
    assert.equal(outcome.attemptId, '0002');
    assert.deepEqual(outcome.changedSetIds, []);
    assert.ok(outcome.persisted.length > 0, 'the findings persisted and the card must show it');

    // Never a second loop: exactly one auto-revision, exactly two attempts.
    assert.equal(decisions.filter((event) => event.type === 'auto-revision').length, 1);
    assert.equal(store.readManifest(runId).attemptCount, 2);
  } finally {
    cleanup();
  }
});

test('brief.autoRevise false keeps the loop off — the run completes untouched', async () => {
  const { store, cleanup } = makeStore();
  const runner = runnerOver(store);
  try {
    const runId = seedRun(store, { brief: { count: 8, autoRevise: false } });
    runner.start(runId, { mock: true });
    const result = await runner.settled(runId);

    assert.equal(result.status, 'complete');
    assert.equal(result.attemptId, '0001');
    assert.equal(store.readManifest(runId).attemptCount, 1);
    assert.deepEqual(
      store.readDecisions(runId).filter((event) => event.type.startsWith('auto-revision')),
      [],
    );
  } finally {
    cleanup();
  }
});

test('a proposer that cannot produce a brief records the skip and leaves the board reviewable', async () => {
  const { store, cleanup } = makeStore();
  const { dir, cleanup: cleanFixtures } = fixturesWith({
    '09-revision-proposer': { text: 'not json at all' },
  });
  const runner = runnerOver(store, dir);
  try {
    const runId = seedRun(store);
    runner.start(runId, { mock: true });
    const result = await runner.settled(runId);

    assert.equal(result.status, 'complete');
    assert.equal(result.attemptId, '0001', 'no child attempt was opened');
    assert.equal(store.readManifest(runId).status, 'awaiting-review');

    const skip = store
      .readDecisions(runId)
      .find((event) => event.type === 'auto-revision-skipped');
    assert.ok(skip, 'the skip is visible in the run history');
    assert.equal(skip.reason, 'proposer-failed');
    assert.ok(skip.findings.length > 0);

    // The proposer's own failure record lands under the AUTO name, so the
    // review page's proposal endpoint never mistakes it for a brief Max asked
    // for and failed to get.
    assert.ok(store.hasRunArtifact(runId, autoProposalFailureFile('0001')));
  } finally {
    cleanFixtures();
    cleanup();
  }
});

test('a failed auto-revision is named loudly, and the parent still holds its board', async () => {
  const { store, cleanup } = makeStore();
  const goodBuilder = JSON.parse(readFileSync(join(fixturesDir, '04-board-builder.json'), 'utf8'));
  // First call (the parent) builds the real board; every later call — the
  // revision and its validation retries — returns garbage, so the child fails.
  const { dir, cleanup: cleanFixtures } = fixturesWith({
    '04-board-builder': [goodBuilder, { text: 'garbage' }],
  });
  const runner = runnerOver(store, dir);
  try {
    const runId = seedRun(store);
    runner.start(runId, { mock: true });
    const result = await runner.settled(runId);

    assert.equal(result.status, 'failed', 'the revised attempt is what settles');
    assert.equal(store.readManifest(runId).status, 'failed');

    const failed = store
      .readDecisions(runId)
      .find((event) => event.type === 'auto-revision-failed');
    assert.ok(failed);
    assert.equal(failed.attemptId, '0002');
    assert.equal(failed.parentAttemptId, '0001');

    // The board Max would have reviewed is not lost — failed → running is a
    // legal resume, and the parent attempt is complete.
    assert.equal(store.readAttempt(runId, '0001').status, 'complete');
    assert.ok(store.readAttemptArtifact(runId, '0001', 'board.json'));
  } finally {
    cleanFixtures();
    cleanup();
  }
});

test("a manual revision after the auto-revision never re-fires the loop", async () => {
  const { store, cleanup } = makeStore();
  const runner = runnerOver(store);
  try {
    const runId = seedRun(store);
    runner.start(runId, { mock: true });
    await runner.settled(runId);

    runner.revise(runId, { fromStage: '04-board-builder', notes: 'my own notes' });
    const result = await runner.settled(runId);

    assert.equal(result.status, 'complete');
    assert.equal(store.readManifest(runId).attemptCount, 3, 'exactly one manual child');
    assert.equal(
      store.readDecisions(runId).filter((event) => event.type === 'auto-revision').length,
      1,
      'the loop ran once, ever',
    );
  } finally {
    cleanup();
  }
});

// --- the proposer's pre-review variant ----------------------------------

const PROPOSER_BOARD = {
  sets: [
    { id: 'set-a', pairs: [['Seed', 'Tree'], ['Spark', 'Fire']] },
    { id: 'set-b', pairs: [['Nest', 'Bird'], ['Den', 'Bear']] },
  ],
};

test('the pre-review prompt carries the findings and no editor language', () => {
  const prompt = proposer.buildPrompt({
    board: PROPOSER_BOARD,
    findings: {},
    vocabulary: [],
    preReview: { findings: [FINDING] },
  });
  assert.match(prompt, /Allowlisted findings — the reason for this revision/);
  assert.match(prompt, /No human has judged this board yet/);
  assert.doesNotMatch(prompt, /A human editor has just judged/);
  assert.doesNotMatch(prompt, /The editor's judgement/);
});

test('the post-review prompt is untouched by the variant existing', () => {
  const prompt = proposer.buildPrompt({
    board: PROPOSER_BOARD,
    feedback: [{ action: 'revise-board', scope: { type: 'board' }, note: 'weak' }],
    findings: {},
    vocabulary: [],
  });
  assert.match(prompt, /A human editor has just judged/);
  assert.doesNotMatch(prompt, /No human has judged this board yet/);
  assert.doesNotMatch(prompt, /Allowlisted findings/);
});

test('pre-review, every set must be fixed or protected; post-review, silence is allowed', () => {
  const output = {
    summary: 's',
    fromStage: '04-board-builder',
    reasoning: 'r',
    fixes: [{ setId: 'set-a', problem: 'p', source: 'evaluator', candidates: ['swap Seed'] }],
    doNotChange: [],
  };
  const preReview = proposer.validateOutput(output, { board: PROPOSER_BOARD, preReview: true });
  assert.equal(preReview.ok, false);
  assert.match(preReview.errors[0].message, /set-b/);

  assert.equal(proposer.validateOutput(output, { board: PROPOSER_BOARD }).ok, true);
});

// --- brief text ---------------------------------------------------------

test('briefText names the protection reason honestly in each mode', () => {
  const proposal = {
    summary: 'Fix set-a.',
    fixes: [{ setId: 'set-a', problem: 'p', candidates: ['swap Seed for Root'] }],
    doNotChange: ['set-b'],
  };
  assert.match(briefText(proposal), /set-b — these were approved\./);
  assert.match(
    briefText(proposal, { protectedReason: 'no allowlisted finding touches them' }),
    /set-b — no allowlisted finding touches them\./,
  );
});

// --- the CLI door -------------------------------------------------------

test('--no-auto-revise turns the run-level flag off, and the default is on', () => {
  assert.equal(parseArgv(['--mock']).autoRevise, true);
  assert.equal(parseArgv(['--mock', '--no-auto-revise']).autoRevise, false);
});

test('briefFor records the choice on the brief, where a resume reads it', () => {
  const { store, cleanup } = makeStore();
  try {
    const index = buildRelationshipIndex({ store });
    assert.equal(briefFor({ index, theme: 'lanterns', count: 14 }).autoRevise, true);
    assert.equal(
      briefFor({ index, theme: 'lanterns', count: 14, autoRevise: false }).autoRevise,
      false,
    );
  } finally {
    cleanup();
  }
});

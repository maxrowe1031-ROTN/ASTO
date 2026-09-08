// The run summary is the one shape the Desk, the Runs table and the batch panel
// read from. Pure: manifest, attempt, jsonl rows and stage reports in — one row out.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  batchOf,
  costOf,
  latestBoardRead,
  lastPublish,
  machineChips,
  summarizeRun,
} from '../../../studio/review/summaries.js';

const manifest = (over = {}) => ({
  schemaVersion: '1.0',
  runId: '2026-08-19T16-12-58.697Z-vintage-postcards',
  createdAt: '2026-08-19T16:12:58.697Z',
  theme: 'vintage postcards',
  brief: { count: 14, mock: false, autoRevise: true, subjectRegister: 'hobbies-collections', subjectStyle: 'world' },
  status: 'rejected',
  currentAttemptId: '0001',
  attemptCount: 1,
  revisionCount: 0,
  ...over,
});

test('a batched run carries its batch id and label from the brief', () => {
  const m = manifest({ brief: { batchId: '2026-09-08T14-02-11.000Z', batchLabel: 'Batch seven' } });
  assert.deepEqual(batchOf(m), { id: '2026-09-08T14-02-11.000Z', label: 'Batch seven' });
});

test('a batched run without a label is named by its day', () => {
  const m = manifest({ brief: { batchId: '2026-09-08T14-02-11.000Z' } });
  assert.deepEqual(batchOf(m), { id: '2026-09-08T14-02-11.000Z', label: 'Batch · 8 Sep' });
});

test('a pre-batch run groups under its creation day, in the game\'s timezone', () => {
  // 03:30Z on the 20th is still the evening of the 19th in Denver.
  const m = manifest({ createdAt: '2026-08-20T03:30:00.000Z', brief: { count: 14 } });
  assert.deepEqual(batchOf(m), { id: 'date:2026-08-19', label: 'Unbatched · 19 Aug' });
});

test('cost and duration come from the current attempt\'s cumulative run usage', () => {
  const attempt = { usage: { attempt: { costUsd: 0.31, ms: 90000 }, run: { costUsd: 0.74, ms: 232000 } } };
  assert.deepEqual(costOf(attempt), { costUsd: 0.74, durationMs: 232000 });
  assert.deepEqual(costOf(null), { costUsd: null, durationMs: null });
  assert.deepEqual(costOf({}), { costUsd: null, durationMs: null });
});

test('your read is the newest board-scoped event for the current attempt only', () => {
  const events = [
    { attemptId: '0001', action: 'revise-board', scope: { type: 'board' }, taste: 'flat' },
    { attemptId: '0001', action: 'set-replace', scope: { type: 'set', setId: 'x' } },
    { attemptId: '0002', action: 'approve-board', scope: { type: 'board' }, taste: 'delightful' },
    { attemptId: '0002', action: 'save-feedback', scope: { type: 'board' }, taste: 'solid' },
  ];
  assert.deepEqual(latestBoardRead(events, '0002'), { boardVerdict: 'approve-board', taste: 'solid' });
  assert.deepEqual(latestBoardRead(events, '0001'), { boardVerdict: 'revise-board', taste: 'flat' });
  assert.equal(latestBoardRead(events, '0003'), null);
  assert.equal(latestBoardRead([], '0001'), null);
});

test('the last publish decision is the one that counts, with its date when recorded', () => {
  const decisions = [
    { type: 'approve', at: '2026-08-19T18:00:00Z' },
    { type: 'publish', publishedAs: 'the-curing-room.json', publishedId: 'asto-the-curing-room', at: '2026-08-19T18:05:00Z' },
    { type: 'publish', publishedAs: 'the-curing-room.json', publishedId: 'asto-the-curing-room', republished: true, date: '2026-09-19', at: '2026-08-20T10:00:00Z' },
  ];
  assert.deepEqual(lastPublish(decisions), {
    publishedAs: 'the-curing-room.json', publishedId: 'asto-the-curing-room', at: '2026-08-20T10:00:00Z', date: '2026-09-19',
  });
  assert.equal(lastPublish(decisions.slice(0, 1)), null);
  assert.equal(lastPublish(decisions.slice(0, 2)).date, null);
});

test('machine chips summarise the four evaluators, and are null when none ran', () => {
  const reports = {
    '05-analogy-validator': { verdicts: [{ setId: 'a', pass: true }, { setId: 'b', pass: false }, { setId: 'c', pass: true }, { setId: 'd', pass: true }] },
    '06-adversarial-solver': { findings: [], crossReadings: [{ id: 'a#1', valid: false }] },
    '07-test-player': { knowledgeGated: [{ word: 'stent' }] },
    '08-style-guide': { unity: { verdict: 'adequate' } },
  };
  assert.deepEqual(machineChips(reports), {
    validator: { clear: 3, total: 4 },
    solver: 'clear',
    testPlayer: { gated: 1 },
    unity: 'adequate',
  });
  assert.equal(machineChips({}), null);
  assert.equal(machineChips(undefined), null);
});

test('a holding cross-reading or any finding flags the solver chip', () => {
  assert.equal(machineChips({ '06-adversarial-solver': { crossReadings: [{ id: 'a#1', valid: true }] } }).solver, 'flag');
  assert.equal(machineChips({ '06-adversarial-solver': { findings: [{ kind: 'cross-set-association' }] } }).solver, 'flag');
});

test('a partial set of reports fills what it has and leaves the rest null', () => {
  const chips = machineChips({ '05-analogy-validator': { verdicts: [{ pass: true }] } });
  assert.deepEqual(chips, { validator: { clear: 1, total: 1 }, solver: null, testPlayer: null, unity: null });
});

test('summarizeRun assembles the row the list serves', () => {
  const row = summarizeRun({
    manifest: manifest(),
    attempt: { usage: { run: { costUsd: 0.54, ms: 200000 } } },
    feedback: [{ attemptId: '0001', action: 'reject-board', scope: { type: 'board' }, taste: 'flat' }],
    decisions: [{ type: 'reject', at: 'x' }],
    reports: { '05-analogy-validator': { verdicts: [{ pass: true }, { pass: true }, { pass: true }, { pass: true }] } },
    inProcess: null,
    reviewableAttemptId: null,
  });
  assert.deepEqual(row, {
    runId: '2026-08-19T16-12-58.697Z-vintage-postcards',
    status: 'rejected',
    theme: 'vintage postcards',
    createdAt: '2026-08-19T16:12:58.697Z',
    currentAttemptId: '0001',
    attemptCount: 1,
    revisionCount: 0,
    reviewableAttemptId: null,
    costUsd: 0.54,
    durationMs: 200000,
    mock: false,
    autoRevise: true,
    subjectRegister: 'hobbies-collections',
    subjectStyle: 'world',
    batch: { id: 'date:2026-08-19', label: 'Unbatched · 19 Aug' },
    yourRead: { boardVerdict: 'reject-board', taste: 'flat' },
    published: null,
    machine: { validator: { clear: 4, total: 4 }, solver: null, testPlayer: null, unity: null },
    inProcess: null,
  });
});

test('an in-flight run carries its live state and stage statuses; a finished one carries neither', () => {
  const stageStatuses = { '01-pair-author': { status: 'complete', at: 'x' } };
  const live = summarizeRun({
    manifest: manifest({ status: 'running' }),
    attempt: { stageStatuses },
    feedback: [], decisions: [], reports: undefined,
    inProcess: { running: true, startedAt: 'x' },
    reviewableAttemptId: null,
  });
  assert.deepEqual(live.inProcess, { running: true, startedAt: 'x', currentStage: '02-theme-grouper' });
  assert.deepEqual(live.stageStatuses, stageStatuses);
  const done = summarizeRun({ manifest: manifest(), attempt: { stageStatuses }, feedback: [], decisions: [], reports: undefined, inProcess: { running: false }, reviewableAttemptId: null });
  assert.equal(done.inProcess.running, false);
  assert.equal('stageStatuses' in done, false);
});

test('a themed run has no register and says so with null, never a guess', () => {
  const row = summarizeRun({ manifest: manifest({ brief: { count: 14 } }), attempt: null, feedback: [], decisions: [], reports: undefined, inProcess: null, reviewableAttemptId: null });
  assert.equal(row.subjectRegister, null);
  assert.equal(row.subjectStyle, null);
  assert.equal(row.mock, false);
  assert.equal(row.autoRevise, true);
});

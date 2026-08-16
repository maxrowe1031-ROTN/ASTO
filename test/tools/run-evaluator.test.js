// run-evaluator — one evaluator stage, one archived board, one honest answer.
//
// The tool exists so a re-run of today's evaluator against yesterday's board
// is possible without faking pipeline history. The properties that matter:
// it builds stage input through the pipeline's OWN builders (no drift), it
// refuses stages whose input it cannot honestly reconstruct, and it never
// writes into the run directory it reads — the corpus is measurement data,
// and a re-run that left artifacts behind would masquerade as history.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  EVALUATOR_STAGE_IDS,
  parseArgv,
  runEvaluator,
  render,
} from '../../tools/run-evaluator.js';
import { createRunStore } from '../../studio/storage/run-store.js';

// --- fixtures -------------------------------------------------------------

const BOARD = {
  schemaVersion: '1.0',
  id: 'fixture-board',
  title: 'The Lantern Shop',
  explanation: 'fixture',
  sets: [
    {
      id: 'set-light',
      relationshipLabel: 'a source and what it gives',
      explanation: 'Each gives the other.',
      difficulty: 1,
      pairs: [
        ['wick', 'flame'],
        ['coil', 'glow'],
      ],
    },
    {
      id: 'set-parts',
      relationshipLabel: 'a thing and its part',
      explanation: 'One belongs to the other.',
      difficulty: 2,
      pairs: [
        ['lantern', 'handle'],
        ['lamp', 'shade'],
      ],
    },
  ],
};

const GATE_OUTPUT = { accepted: 16, nearMisses: [] };

// A snapshot in the exact shape run-store persists as blackboard.json.
const SNAPSHOT = {
  stageOrder: ['04-board-builder', '04a-integrity'],
  stages: {
    '04-board-builder': { resolution: {}, revisions: 0, output: { board: BOARD } },
    '04a-integrity': { resolution: {}, revisions: 0, output: GATE_OUTPUT },
  },
};

const VALID_STYLE_OUTPUT = {
  edits: [],
  compliant: true,
  unity: { verdict: 'strong', reasoning: 'One shop, one light.', outliers: [] },
  evocativeness: { verdict: 'adequate', reasoning: 'On subject, near the middle.' },
  contentConcerns: [],
};

function fixtureRun({ theme = 'the lantern shop' } = {}) {
  const rootDir = mkdtempSync(join(tmpdir(), 'run-evaluator-'));
  const store = createRunStore({ rootDir });
  const { runId } = store.createRun({ slug: 'fixture', theme });
  const attemptId = store.createAttempt(runId);
  store.writeAttemptArtifact(runId, attemptId, 'blackboard.json', SNAPSHOT);
  return { rootDir, store, runId, attemptId };
}

/** A transport that replays `text` and counts its calls. */
function scriptedTransport(text) {
  const calls = [];
  const transport = async (request) => {
    calls.push(request);
    return {
      text,
      stopReason: 'end_turn',
      model: request.model,
      usage: { inputTokens: 10, outputTokens: 20 },
    };
  };
  return { transport, calls };
}

const listFiles = (dir) =>
  readdirSync(dir, { recursive: true })
    .map(String)
    .sort();

// --- the CLI's contract ----------------------------------------------------

test('parseArgv needs both a run and a stage', () => {
  assert.throws(() => parseArgv(['--stage', '08-style-guide']), /--run/);
  assert.throws(() => parseArgv(['--run', 'some-run']), /--stage/);
});

test('parseArgv refuses a generative stage and names the ones it serves', () => {
  assert.throws(
    () => parseArgv(['--run', 'r', '--stage', '01-pair-author']),
    (error) => {
      assert.match(error.message, /01-pair-author/);
      for (const stageId of EVALUATOR_STAGE_IDS) {
        assert.match(error.message, new RegExp(stageId));
      }
      return true;
    },
  );
});

test('parseArgv accepts an evaluator stage with quiet defaults', () => {
  const options = parseArgv(['--run', 'some-run', '--stage', '08-style-guide']);
  assert.deepEqual(options, {
    runId: 'some-run',
    stageId: '08-style-guide',
    attemptId: null,
    json: false,
    out: null,
  });
});

// --- input comes from the pipeline's own builders ---------------------------

test('08 is asked about the theme and the board words, exactly as the pipeline asks', async () => {
  const { store, runId } = fixtureRun({ theme: 'the lantern shop' });
  const { transport, calls } = scriptedTransport(JSON.stringify(VALID_STYLE_OUTPUT));

  const result = await runEvaluator({ store, runId, stageId: '08-style-guide', transport });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  const { prompt } = calls[0];
  // The theme Max typed reaches the evocativeness question…
  assert.match(prompt, /the lantern shop/);
  // …and the sixteen (here four) words reach the unity question.
  for (const word of ['wick', 'flame', 'lantern', 'shade']) {
    assert.match(prompt, new RegExp(`"${word}"`));
  }
  assert.equal(calls[0].stageId, '08-style-guide');
});

test('06 is handed the integrity gate output the pipeline would hand it', async () => {
  const { store, runId } = fixtureRun();
  const solverOutput = { findings: [], readings: [] };
  const { transport, calls } = scriptedTransport(JSON.stringify(solverOutput));

  // 06's own validator may reject this minimal fixture output — the input is
  // what this test is about, not the verdict.
  await runEvaluator({ store, runId, stageId: '06-adversarial-solver', transport });

  assert.equal(calls.length, 1);
  assert.match(calls[0].prompt, /nearMisses/);
});

// --- refusals and errors ----------------------------------------------------

test('runEvaluator refuses a generative stage even when the CLI was bypassed', async () => {
  const { store, runId } = fixtureRun();
  const { transport } = scriptedTransport('{}');

  await assert.rejects(
    runEvaluator({ store, runId, stageId: '02-theme-grouper', transport }),
    /02-theme-grouper.*evaluator/s,
  );
});

test('a missing run is a clear error, not a stack trace from deep inside', async () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'run-evaluator-'));
  const store = createRunStore({ rootDir });
  const { transport } = scriptedTransport('{}');

  await assert.rejects(
    runEvaluator({ store, runId: 'no-such-run', stageId: '08-style-guide', transport }),
    /no-such-run/,
  );
});

// --- one shot, honestly reported ---------------------------------------------

test('invalid output is reported, not retried', async () => {
  const { store, runId } = fixtureRun();
  // compliant disagrees with the edit list — 08's own validator must catch it.
  const invalid = { ...VALID_STYLE_OUTPUT, compliant: false };
  const { transport, calls } = scriptedTransport(JSON.stringify(invalid));

  const result = await runEvaluator({ store, runId, stageId: '08-style-guide', transport });

  assert.equal(result.ok, false);
  assert.equal(calls.length, 1, 'one shot — a re-run demo must not quietly iterate');
  assert.ok(result.validation.errors.length > 0);
  assert.equal(result.output.compliant, false, 'the rejected output still comes back for inspection');
});

// --- the run directory is measurement data ------------------------------------

test('a re-run writes NOTHING into the run directory', async () => {
  const { rootDir, store, runId } = fixtureRun();
  const before = listFiles(rootDir);
  const { transport } = scriptedTransport(JSON.stringify(VALID_STYLE_OUTPUT));

  await runEvaluator({ store, runId, stageId: '08-style-guide', transport });

  assert.deepEqual(listFiles(rootDir), before);
});

// --- defaults and rendering -----------------------------------------------------

test('the attempt defaults to the manifest current attempt', async () => {
  const { store, runId, attemptId } = fixtureRun();
  const { transport } = scriptedTransport(JSON.stringify(VALID_STYLE_OUTPUT));

  const result = await runEvaluator({ store, runId, stageId: '08-style-guide', transport });

  assert.equal(result.attemptId, attemptId);
});

test('render names the run, the stage, the model, and carries the full output', () => {
  const text = render({
    ok: true,
    runId: 'some-run',
    attemptId: '0001',
    stageId: '08-style-guide',
    output: VALID_STYLE_OUTPUT,
    validation: { ok: true },
    record: { model: 'mock-model', effort: 'medium', inputTokens: 10, outputTokens: 20, durationMs: 5 },
  });

  for (const piece of ['some-run', '0001', '08-style-guide', 'mock-model', '"unity"']) {
    assert.ok(text.includes(piece), `render() must include ${piece}`);
  }
});

test('render says plainly when the output failed validation', () => {
  const text = render({
    ok: false,
    runId: 'some-run',
    attemptId: '0001',
    stageId: '08-style-guide',
    output: {},
    validation: { ok: false, errors: [{ path: 'compliant', message: 'must be true' }] },
    record: { model: 'mock-model', effort: null, inputTokens: 1, outputTokens: 1, durationMs: 5 },
  });

  assert.match(text, /failed validation/i);
  assert.match(text, /compliant/);
});

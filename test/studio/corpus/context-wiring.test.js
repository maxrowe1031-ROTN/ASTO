// Rules and the variety brief only matter if they reach the model. These
// tests read the prompts a run actually sent, rather than trusting that the
// wiring is connected.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { runPipeline } from '../../../studio/pipeline.js';
import { createReviewServer } from '../../../studio/review/server.js';
import { loadRules } from '../../../studio/corpus/rules.js';
import { STAGES } from '../../../studio/stage-registry.js';
import { makeStore, mockTransport, seedRun, fastTime } from '../pipeline/helpers.js';

const AGENT_STAGES = STAGES.filter((stage) => stage.kind === 'agent').map((stage) => stage.id);

const promptFor = (rootDir, runId, attemptId, stageId) =>
  readFileSync(join(rootDir, runId, 'attempts', attemptId, 'stages', stageId, 'prompt.txt'), 'utf8');

test('every agent is told the editorial rules', async () => {
  const { store, rootDir, cleanup } = makeStore();
  try {
    const runId = seedRun(store);
    const rules = loadRules();
    const result = await runPipeline({
      runId,
      store,
      transport: mockTransport(),
      context: { rules: rules.map((rule) => rule.text) },
      ...fastTime(),
    });
    assert.equal(result.status, 'complete', result.failure?.message);

    for (const stageId of AGENT_STAGES) {
      const prompt = promptFor(rootDir, runId, result.attemptId, stageId);
      assert.match(prompt, /Editorial rules you must follow/, stageId);
      assert.ok(prompt.includes(rules[0].text), `${stageId} did not get the first rule`);
    }
  } finally {
    cleanup();
  }
});

test('with no rules the prompts carry no rules block — nothing is invented', async () => {
  const { store, rootDir, cleanup } = makeStore();
  try {
    const runId = seedRun(store);
    const result = await runPipeline({ runId, store, transport: mockTransport(), ...fastTime() });
    assert.equal(
      /Editorial rules you must follow/.test(
        promptFor(rootDir, runId, result.attemptId, '01-pair-author'),
      ),
      false,
    );
  } finally {
    cleanup();
  }
});

test('a surprise-me run started from the Studio asks the author for underused shapes', async () => {
  const { store, rootDir, cleanup } = makeStore();
  const { url, runner, close } = await createReviewServer({
    store,
    port: 0,
    makeTransport: () => mockTransport(),
  });
  try {
    const created = await fetch(`${url}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mock: true }),
    });
    const { runId } = await created.json();
    await runner.settled(runId);

    const manifest = store.readManifest(runId);
    // Since 2026-08-04 a surprise-me run carries BOTH: a subject, because Max
    // rejected both themeless boards for having none, and the shape brief it
    // always had. The two steer different things and neither replaced the other.
    assert.equal(typeof manifest.theme, 'string');
    assert.ok(manifest.theme.length > 0, 'surprise-me picked no subject');
    assert.ok(manifest.brief.relationshipShapes.length > 0, 'no shapes were requested');

    const prompt = promptFor(rootDir, runId, '0001', '01-pair-author');
    assert.match(prompt, /underused in the library so far/);
    assert.ok(prompt.includes(manifest.brief.relationshipShapes[0]));
    assert.ok(prompt.includes(manifest.theme), 'the picked subject never reached the author');
  } finally {
    await close();
    cleanup();
  }
});

test('a themed run keeps the theme as its steer, with no shape brief', async () => {
  const { store, rootDir, cleanup } = makeStore();
  const { url, runner, close } = await createReviewServer({
    store,
    port: 0,
    makeTransport: () => mockTransport(),
  });
  try {
    const created = await fetch(`${url}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ theme: 'Lantern light', mock: true }),
    });
    const { runId } = await created.json();
    await runner.settled(runId);

    assert.equal(store.readManifest(runId).brief.relationshipShapes, undefined);
    assert.match(promptFor(rootDir, runId, '0001', '01-pair-author'), /Lantern light/);
  } finally {
    await close();
    cleanup();
  }
});

test('the server hands the same rules to a run as the CLI does', async () => {
  const { store, rootDir, cleanup } = makeStore();
  const { url, runner, close } = await createReviewServer({
    store,
    port: 0,
    makeTransport: () => mockTransport(),
  });
  try {
    const created = await fetch(`${url}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mock: true }),
    });
    const { runId } = await created.json();
    await runner.settled(runId);

    const prompt = promptFor(rootDir, runId, '0001', '04-board-builder');
    assert.match(prompt, /Editorial rules you must follow/);
    assert.ok(prompt.includes(loadRules()[0].text));
  } finally {
    await close();
    cleanup();
  }
});

test('retired rule-007\'s wording reaches no prompt — the retirement is real on the wire', async () => {
  // Before 2026-08-04 every agent prompt carried "directional and
  // transformative". Retiring the rule only matters if the wording actually
  // left the prompts a run sends, so this reads what was written to disk
  // rather than trusting the loadRules filter.
  const { store, rootDir, cleanup } = makeStore();
  try {
    const runId = seedRun(store);
    const rules = loadRules();
    const result = await runPipeline({
      runId,
      store,
      transport: mockTransport(),
      context: { rules: rules.map((rule) => rule.text) },
      ...fastTime(),
    });
    assert.equal(result.status, 'complete', result.failure?.message);

    for (const stageId of AGENT_STAGES) {
      const prompt = promptFor(rootDir, runId, result.attemptId, stageId);
      assert.equal(
        /transformative/i.test(prompt),
        false,
        `${stageId} still tells the model pairs must be transformative`,
      );
    }
  } finally {
    cleanup();
  }
});

test('the stance quotas reach the pair author\'s prompt', async () => {
  const { store, rootDir, cleanup } = makeStore();
  try {
    const runId = seedRun(store, {
      brief: { count: 8, stanceQuotas: ['inclusion', 'possession', 'event', 'time'] },
    });
    const result = await runPipeline({ runId, store, transport: mockTransport(), ...fastTime() });
    assert.equal(result.status, 'complete', result.failure?.message);
    const prompt = promptFor(rootDir, runId, result.attemptId, '01-pair-author');
    assert.match(prompt, /inclusion, possession, event, time/);
    assert.match(prompt, /at least two pairs in each/i);
  } finally {
    cleanup();
  }
});

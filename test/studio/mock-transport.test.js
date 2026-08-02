// The mock transport: fixture replay, no network. This is what makes the
// whole orchestrator testable offline — one of the two things the retired
// Python crew paid for in debugging, so it exists from the start.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createMockTransport } from '../../studio/mock-transport.js';
import { createLlm } from '../../studio/llm.js';

const withFixtures = (files) => {
  const dir = mkdtempSync(join(tmpdir(), 'asto-fixtures-'));
  for (const [name, contents] of Object.entries(files)) {
    const path = join(dir, name);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, typeof contents === 'string' ? contents : JSON.stringify(contents, null, 2));
  }
  return dir;
};

test('replays the fixture named for the stage', async () => {
  const dir = withFixtures({ '01-pair-author.json': { text: '{"pairs":[]}' } });
  try {
    const transport = createMockTransport({ fixturesDir: dir });
    const reply = await transport({ stageId: '01-pair-author', prompt: 'anything' });
    assert.equal(reply.text, '{"pairs":[]}');
    assert.equal(reply.stopReason, 'end_turn');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a fixture may be plain text rather than a wrapper object', async () => {
  const dir = withFixtures({ '01-pair-author.txt': '{"pairs":[1]}' });
  try {
    const transport = createMockTransport({ fixturesDir: dir });
    const reply = await transport({ stageId: '01-pair-author', prompt: 'x' });
    assert.equal(reply.text, '{"pairs":[1]}');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('reports plausible token usage so budget accounting is exercised offline', async () => {
  const dir = withFixtures({ '01-pair-author.json': { text: 'hello world' } });
  try {
    const transport = createMockTransport({ fixturesDir: dir });
    const reply = await transport({ stageId: '01-pair-author', prompt: 'a fairly long prompt here' });
    assert.ok(reply.usage.inputTokens > 0);
    assert.ok(reply.usage.outputTokens > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('token counts are deterministic for the same input — mock runs are reproducible', async () => {
  const dir = withFixtures({ '01-pair-author.json': { text: 'hello world' } });
  try {
    const transport = createMockTransport({ fixturesDir: dir });
    const a = await transport({ stageId: '01-pair-author', prompt: 'same' });
    const b = await transport({ stageId: '01-pair-author', prompt: 'same' });
    assert.deepEqual(a.usage, b.usage);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a missing fixture is a clear error naming the stage and the directory', async () => {
  const dir = withFixtures({ '01-pair-author.json': { text: 'x' } });
  try {
    const transport = createMockTransport({ fixturesDir: dir });
    await assert.rejects(
      () => transport({ stageId: '07-test-player', prompt: 'x' }),
      (error) => {
        assert.match(error.message, /07-test-player/);
        assert.match(error.message, /fixture/i);
        return true;
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a fixture can script a sequence — first a failure, then a success', async () => {
  const dir = withFixtures({
    '04-board-builder.json': [
      { status: 529, error: 'overloaded' },
      { text: '{"board":"ok"}' },
    ],
  });
  try {
    const transport = createMockTransport({ fixturesDir: dir });
    const llm = createLlm({ transport, sleep: async () => {} });
    const result = await llm.send(
      { stageId: '04-board-builder', model: 'm', prompt: 'build', maxTokens: 100 },
      { maxAttempts: 3 },
    );
    assert.equal(result.text, '{"board":"ok"}');
    assert.equal(result.record.attempts, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a scripted sequence that runs out repeats its final reply', async () => {
  const dir = withFixtures({ '01-pair-author.json': [{ text: 'only' }] });
  try {
    const transport = createMockTransport({ fixturesDir: dir });
    assert.equal((await transport({ stageId: '01-pair-author', prompt: 'a' })).text, 'only');
    assert.equal((await transport({ stageId: '01-pair-author', prompt: 'b' })).text, 'only');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a fixture can force a truncated reply, exercising the retry path offline', async () => {
  const dir = withFixtures({
    '01-pair-author.json': [{ text: '{"partial"', stopReason: 'max_tokens' }, { text: '{"ok":1}' }],
  });
  try {
    const transport = createMockTransport({ fixturesDir: dir });
    const llm = createLlm({ transport, sleep: async () => {} });
    const result = await llm.send(
      { stageId: '01-pair-author', model: 'm', prompt: 'p', maxTokens: 10 },
      { maxAttempts: 3 },
    );
    assert.equal(result.text, '{"ok":1}');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the mock records the prompts it was given, so prompts can be asserted on', async () => {
  const dir = withFixtures({ '01-pair-author.json': { text: 'x' } });
  try {
    const transport = createMockTransport({ fixturesDir: dir });
    await transport({ stageId: '01-pair-author', prompt: 'the actual prompt' });
    assert.equal(transport.calls.length, 1);
    assert.equal(transport.calls[0].prompt, 'the actual prompt');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the mock never reads an API key and never reaches the network', async () => {
  const dir = withFixtures({ '01-pair-author.json': { text: 'x' } });
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error('the mock transport must not call fetch');
  };
  try {
    const transport = createMockTransport({ fixturesDir: dir });
    const reply = await transport({ stageId: '01-pair-author', prompt: 'x', apiKey: 'sk-nope' });
    assert.equal(reply.text, 'x');
  } finally {
    globalThis.fetch = realFetch;
    rmSync(dir, { recursive: true, force: true });
  }
});

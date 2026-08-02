// llm.js — the request/retry loop over an injected transport.
//
// Every test here runs with a fake transport: the retry policy, the request
// record, and the accounting are all provable with zero network. Mock mode is
// a transport swap, so there is no `if (mock)` anywhere for a test to miss.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createLlm } from '../../studio/llm.js';
import { RETRYABLE_TRANSPORT, TERMINAL_CONTENT, StudioFailure } from '../../studio/failures.js';

const reply = (text, extra = {}) => ({
  text,
  stopReason: 'end_turn',
  usage: { inputTokens: 10, outputTokens: 5 },
  model: 'test-model',
  ...extra,
});

/** A transport that returns queued replies (or throws queued errors) in order. */
const scriptedTransport = (script) => {
  const calls = [];
  const remaining = [...script];
  const transport = async (request) => {
    calls.push(request);
    const next = remaining.shift();
    if (next === undefined) throw new Error('transport called more times than scripted');
    if (next instanceof Error || next?.status) throw next;
    return next;
  };
  transport.calls = calls;
  return transport;
};

const request = { model: 'test-model', system: 'be helpful', prompt: 'say hi', maxTokens: 100 };

test('a successful call returns the reply text and a complete request record', async () => {
  const transport = scriptedTransport([reply('{"ok":true}')]);
  const llm = createLlm({ transport, clock: () => '2026-08-02T14:03:11Z' });

  const result = await llm.send(request);

  assert.equal(result.text, '{"ok":true}');
  assert.equal(result.record.attempts, 1);
  assert.equal(result.record.model, 'test-model');
  assert.equal(result.record.inputTokens, 10);
  assert.equal(result.record.outputTokens, 5);
  assert.equal(result.record.startedAt, '2026-08-02T14:03:11Z');
  assert.ok('durationMs' in result.record);
});

test('the record keeps the full prompt and response — the demo depends on it', async () => {
  const transport = scriptedTransport([reply('the answer')]);
  const llm = createLlm({ transport });
  const { record } = await llm.send(request);
  assert.equal(record.prompt, 'say hi');
  assert.equal(record.system, 'be helpful');
  assert.equal(record.response, 'the answer');
});

test('a retryable transport failure is retried and can then succeed', async () => {
  const transport = scriptedTransport([
    Object.assign(new Error('overloaded'), { status: 529 }),
    reply('recovered'),
  ]);
  const llm = createLlm({ transport, sleep: async () => {} });

  const result = await llm.send(request, { maxAttempts: 3 });

  assert.equal(result.text, 'recovered');
  assert.equal(result.record.attempts, 2);
  assert.equal(transport.calls.length, 2);
});

test('a terminal failure is not retried', async () => {
  const transport = scriptedTransport([Object.assign(new Error('bad request'), { status: 400 })]);
  const llm = createLlm({ transport, sleep: async () => {} });

  await assert.rejects(() => llm.send(request, { maxAttempts: 5 }), StudioFailure);
  assert.equal(transport.calls.length, 1, 'a terminal failure must not retry');
});

test('retries stop at maxAttempts and the failure names the cap', async () => {
  const transport = scriptedTransport([
    Object.assign(new Error('rate limited'), { status: 429 }),
    Object.assign(new Error('rate limited'), { status: 429 }),
    Object.assign(new Error('rate limited'), { status: 429 }),
  ]);
  const llm = createLlm({ transport, sleep: async () => {} });

  await assert.rejects(
    () => llm.send(request, { maxAttempts: 3 }),
    (error) => {
      assert.equal(error.category, RETRYABLE_TRANSPORT);
      assert.match(error.message, /3 attempt/);
      return true;
    },
  );
  assert.equal(transport.calls.length, 3);
});

test('every attempt is recorded, including the failed ones', async () => {
  const transport = scriptedTransport([
    Object.assign(new Error('overloaded'), { status: 529 }),
    reply('finally'),
  ]);
  const llm = createLlm({ transport, sleep: async () => {} });

  const { record } = await llm.send(request, { maxAttempts: 3 });

  assert.equal(record.requests.length, 2);
  assert.equal(record.requests[0].outcome, 'failed');
  assert.match(record.requests[0].error, /529|overloaded/);
  assert.equal(record.requests[1].outcome, 'ok');
});

test('backoff is honored and grows between attempts', async () => {
  const waits = [];
  const transport = scriptedTransport([
    Object.assign(new Error('a'), { status: 500 }),
    Object.assign(new Error('b'), { status: 500 }),
    reply('ok'),
  ]);
  const llm = createLlm({ transport, sleep: async (ms) => void waits.push(ms) });

  await llm.send(request, { maxAttempts: 3, baseDelayMs: 10 });

  assert.equal(waits.length, 2);
  assert.ok(waits[1] > waits[0], `expected growth, got ${waits}`);
});

test('a retry-after hint overrides the computed backoff', async () => {
  const waits = [];
  const transport = scriptedTransport([
    Object.assign(new Error('slow down'), { status: 429, retryAfterSeconds: 2 }),
    reply('ok'),
  ]);
  const llm = createLlm({ transport, sleep: async (ms) => void waits.push(ms) });

  await llm.send(request, { maxAttempts: 2, baseDelayMs: 10 });

  assert.equal(waits[0], 2000);
});

test('a truncated reply is retried — stopReason max_tokens is not a real answer', async () => {
  const transport = scriptedTransport([
    reply('{"partial":', { stopReason: 'max_tokens' }),
    reply('{"whole":true}'),
  ]);
  const llm = createLlm({ transport, sleep: async () => {} });

  const result = await llm.send(request, { maxAttempts: 3 });

  assert.equal(result.text, '{"whole":true}');
  assert.equal(transport.calls.length, 2);
});

test('a refusal is terminal and never retried', async () => {
  const transport = scriptedTransport([reply('I cannot help with that', { stopReason: 'refusal' })]);
  const llm = createLlm({ transport, sleep: async () => {} });

  await assert.rejects(
    () => llm.send(request, { maxAttempts: 3 }),
    (error) => error.category === TERMINAL_CONTENT,
  );
  assert.equal(transport.calls.length, 1);
});

test('retry feedback is passed to the transport so the next try can correct itself', async () => {
  const transport = scriptedTransport([
    Object.assign(new Error('overloaded'), { status: 529 }),
    reply('ok'),
  ]);
  const llm = createLlm({ transport, sleep: async () => {} });

  await llm.send(request, { maxAttempts: 2, feedback: 'your last reply was not JSON' });

  assert.match(transport.calls[0].prompt, /say hi/);
  assert.match(transport.calls[1].prompt, /not JSON/);
});

test('the transport receives the request unchanged when there is no feedback', async () => {
  const transport = scriptedTransport([reply('ok')]);
  const llm = createLlm({ transport });
  await llm.send(request);
  assert.equal(transport.calls[0].prompt, 'say hi');
  assert.equal(transport.calls[0].maxTokens, 100);
});

test('an API key is never copied into the request record', async () => {
  const transport = scriptedTransport([reply('ok')]);
  const llm = createLlm({ transport });
  const { record } = await llm.send({ ...request, apiKey: 'sk-ant-secret' });
  assert.ok(!JSON.stringify(record).includes('sk-ant-secret'));
});

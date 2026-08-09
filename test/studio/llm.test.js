// llm.js — the request/retry loop over an injected transport.
//
// Every test here runs with a fake transport: the retry policy, the request
// record, and the accounting are all provable with zero network. Mock mode is
// a transport swap, so there is no `if (mock)` anywhere for a test to miss.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createAnthropicTransport, createLlm } from '../../studio/llm.js';
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

// The 2026-08-09 scar, pinned end to end: a 400 whose body says "credit
// balance is too low" must surface that sentence in BOTH places a reader
// looks — the thrown StudioFailure's message (→ failure.json) and the
// per-attempt request record (→ request.failed.json).
test("a refused request's body reaches the failure message and the request record", async () => {
  const refusal = Object.assign(
    new Error('{"type":"error","error":{"message":"Your credit balance is too low to access the Anthropic API."}}'),
    { status: 400 },
  );
  const transport = scriptedTransport([refusal]);
  const llm = createLlm({ transport });

  await assert.rejects(
    () => llm.send(request),
    (error) => {
      assert.ok(error instanceof StudioFailure);
      assert.equal(error.category, TERMINAL_CONTENT);
      assert.match(error.message, /HTTP 400: .*credit balance is too low/);
      assert.equal(error.requests.length, 1);
      assert.match(error.requests[0].error, /credit balance is too low/);
      return true;
    },
  );
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

test('truncation raises the ceiling before retrying — the same request would truncate again', async () => {
  const transport = scriptedTransport([
    reply('{"partial":', { stopReason: 'max_tokens' }),
    reply('{"whole":true}'),
  ]);
  const llm = createLlm({ transport, sleep: async () => {} });

  const result = await llm.send(request, { maxAttempts: 3 });

  assert.equal(result.text, '{"whole":true}');
  assert.equal(transport.calls[0].maxTokens, 100);
  assert.ok(
    transport.calls[1].maxTokens > 100,
    `retry must raise the ceiling, got ${transport.calls[1].maxTokens}`,
  );
  assert.equal(result.record.maxTokens, transport.calls[1].maxTokens);
});

test('a second truncation is terminal and names both ceilings — no third identical attempt', async () => {
  const transport = scriptedTransport([
    reply('{"a":', { stopReason: 'max_tokens' }),
    reply('{"b":', { stopReason: 'max_tokens' }),
    reply('never reached'),
  ]);
  const llm = createLlm({ transport, sleep: async () => {} });

  await assert.rejects(
    () => llm.send(request, { maxAttempts: 3 }),
    (error) => {
      assert.equal(error.category, TERMINAL_CONTENT, 'escalation is exhausted, not retryable');
      assert.match(error.message, /100/);
      assert.match(error.message, /150/);
      return true;
    },
  );
  assert.equal(transport.calls.length, 2, 'the third attempt would truncate identically');
});

test('escalation does not compound — it raises the ceiling once, from the original', async () => {
  const transport = scriptedTransport([
    reply('{"a":', { stopReason: 'max_tokens' }),
    reply('{"b":true}'),
  ]);
  const llm = createLlm({ transport, sleep: async () => {} });

  await llm.send(request, { maxAttempts: 3 });

  assert.equal(transport.calls[1].maxTokens, 150);
});

test('a reply with no text is a loud failure, not a JSON parse error downstream', async () => {
  // The prototype crew's failure (lessons-learned.md 1.1): thinking consumed
  // the whole budget and the reply carried no text block. Joined to '' it
  // surfaces as "not valid JSON", which points at the wrong thing entirely.
  const transport = scriptedTransport([
    reply('', { stopReason: 'end_turn', blockTypes: ['thinking'] }),
  ]);
  const llm = createLlm({ transport, sleep: async () => {} });

  await assert.rejects(
    () => llm.send(request, { maxAttempts: 2 }),
    (error) => {
      assert.equal(error.category, TERMINAL_CONTENT);
      assert.match(error.message, /no text/i);
      assert.match(error.message, /end_turn/, 'the stop reason is the diagnosis');
      assert.match(error.message, /thinking/, 'name the block types that did come back');
      return true;
    },
  );
});

test('an exhausted context window is terminal, not a silent success', async () => {
  const transport = scriptedTransport([
    reply('{"cut":', { stopReason: 'model_context_window_exceeded' }),
  ]);
  const llm = createLlm({ transport, sleep: async () => {} });

  await assert.rejects(
    () => llm.send(request, { maxAttempts: 3 }),
    (error) => {
      assert.equal(error.category, TERMINAL_CONTENT);
      assert.match(error.message, /context window/i);
      return true;
    },
  );
  assert.equal(transport.calls.length, 1);
});

test('the record states the ceiling and effort actually used', async () => {
  const transport = scriptedTransport([reply('ok')]);
  const llm = createLlm({ transport });

  const { record } = await llm.send({ ...request, effort: 'high' });

  assert.equal(record.maxTokens, 100);
  assert.equal(record.effort, 'high');
});

test('a failure carries the ceiling and effort too — a dead stage must still be diagnosable', async () => {
  const transport = scriptedTransport([
    Object.assign(new Error('overloaded'), { status: 529 }),
    Object.assign(new Error('overloaded'), { status: 529 }),
  ]);
  const llm = createLlm({ transport, sleep: async () => {} });

  await assert.rejects(
    () => llm.send({ ...request, effort: 'xhigh' }, { maxAttempts: 2 }),
    (error) => {
      assert.equal(error.maxTokens, 100);
      assert.equal(error.effort, 'xhigh');
      return true;
    },
  );
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

// --- the real transport's request shape ---------------------------------
//
// Still zero network: fetch is injected. These assert the wire shape, which
// is the layer a fixture can never check — a fixture is written to match our
// schema, so it proves nothing about what we actually send Anthropic.

const capturingFetch = (body = { content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' }) => {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return { ok: true, json: async () => body, headers: new Headers() };
  };
  impl.calls = calls;
  return impl;
};

test('effort is sent as output_config when a stage has one', async () => {
  const fetchImpl = capturingFetch();
  const transport = createAnthropicTransport({ apiKey: 'sk-test', fetchImpl });

  await transport({ model: 'claude-sonnet-5', prompt: 'hi', maxTokens: 16000, effort: 'high' });

  assert.deepEqual(fetchImpl.calls[0].body.output_config, { effort: 'high' });
});

test('output_config is omitted entirely when a stage has no effort — Haiku rejects it', async () => {
  const fetchImpl = capturingFetch();
  const transport = createAnthropicTransport({ apiKey: 'sk-test', fetchImpl });

  await transport({ model: 'claude-haiku-4-5-20251001', prompt: 'hi', maxTokens: 16000 });

  assert.ok(
    !('output_config' in fetchImpl.calls[0].body),
    'an absent effort must send no output_config at all, not an empty one',
  );
});

test('no sampling parameters are ever sent — Sonnet 5 rejects them with a 400', async () => {
  const fetchImpl = capturingFetch();
  const transport = createAnthropicTransport({ apiKey: 'sk-test', fetchImpl });

  await transport({ model: 'claude-sonnet-5', prompt: 'hi', maxTokens: 16000, temperature: 0.7 });

  const { body } = fetchImpl.calls[0];
  for (const key of ['temperature', 'top_p', 'top_k']) {
    assert.ok(!(key in body), `${key} must never reach the API`);
  }
});

test('the request carries an abort signal — a hung call must not hang the run', async () => {
  const fetchImpl = capturingFetch();
  const transport = createAnthropicTransport({ apiKey: 'sk-test', fetchImpl, timeoutMs: 1000 });

  await transport({ model: 'claude-sonnet-5', prompt: 'hi', maxTokens: 16000 });

  assert.ok(fetchImpl.calls[0].init.signal, 'no signal means an unbounded wait');
});

test('the transport reports the block types it saw, so an empty reply can be explained', async () => {
  const fetchImpl = capturingFetch({
    content: [{ type: 'thinking', thinking: '' }],
    stop_reason: 'end_turn',
  });
  const transport = createAnthropicTransport({ apiKey: 'sk-test', fetchImpl });

  const result = await transport({ model: 'claude-sonnet-5', prompt: 'hi', maxTokens: 100 });

  assert.equal(result.text, '');
  assert.deepEqual(result.blockTypes, ['thinking']);
});

test('a missing key names the variable and never a value', () => {
  assert.throws(
    () => createAnthropicTransport({ apiKey: '' }),
    (error) => {
      assert.match(error.message, /ANTHROPIC_API_KEY/);
      return true;
    },
  );
});

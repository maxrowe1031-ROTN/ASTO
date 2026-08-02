// Failure classification — the spec's three categories, as one pure decision
// function. Kept out of llm.js so the retry policy is testable with zero
// network: llm.js does the I/O, this decides what a failure means.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  RETRYABLE_TRANSPORT,
  RETRYABLE_OUTPUT,
  TERMINAL_CONTENT,
  classifyTransportError,
  classifyOutputFailure,
  isRetryable,
  StudioFailure,
} from '../../studio/failures.js';

// --- transport failures ---

test('timeouts, aborts and network drops are retryable transport failures', () => {
  for (const error of [
    Object.assign(new Error('timed out'), { name: 'TimeoutError' }),
    Object.assign(new Error('aborted'), { name: 'AbortError' }),
    Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }),
    Object.assign(new Error('dns'), { code: 'ENOTFOUND' }),
  ]) {
    assert.equal(classifyTransportError(error).category, RETRYABLE_TRANSPORT, error.message);
  }
});

test('429 and 5xx are retryable; 400 and 422 are terminal', () => {
  assert.equal(classifyTransportError({ status: 429 }).category, RETRYABLE_TRANSPORT);
  assert.equal(classifyTransportError({ status: 500 }).category, RETRYABLE_TRANSPORT);
  assert.equal(classifyTransportError({ status: 529 }).category, RETRYABLE_TRANSPORT);
  assert.equal(classifyTransportError({ status: 400 }).category, TERMINAL_CONTENT);
  assert.equal(classifyTransportError({ status: 422 }).category, TERMINAL_CONTENT);
});

test('401 and 403 are terminal — a bad key never fixes itself by retrying', () => {
  assert.equal(classifyTransportError({ status: 401 }).category, TERMINAL_CONTENT);
  assert.equal(classifyTransportError({ status: 403 }).category, TERMINAL_CONTENT);
});

test('a retry-after hint is carried through for the caller to honor', () => {
  const failure = classifyTransportError({ status: 429, retryAfterSeconds: 12 });
  assert.equal(failure.retryAfterSeconds, 12);
});

// --- output failures ---

test('malformed JSON and schema violations are retryable output failures', () => {
  assert.equal(classifyOutputFailure({ reason: 'unparseable' }).category, RETRYABLE_OUTPUT);
  assert.equal(
    classifyOutputFailure({ reason: 'schema', errors: [{ path: 'pairs', message: 'required' }] })
      .category,
    RETRYABLE_OUTPUT,
  );
});

test('a truncated response is retryable — it is a transport-shaped problem', () => {
  assert.equal(classifyOutputFailure({ reason: 'truncated' }).category, RETRYABLE_TRANSPORT);
});

test('a refusal is terminal — asking again the same way will not help', () => {
  assert.equal(classifyOutputFailure({ reason: 'refusal' }).category, TERMINAL_CONTENT);
});

test('semantic failure is terminal content — valid output that cannot be accepted', () => {
  assert.equal(classifyOutputFailure({ reason: 'semantic' }).category, TERMINAL_CONTENT);
});

test('schema errors become feedback the retry can actually act on', () => {
  const failure = classifyOutputFailure({
    reason: 'schema',
    errors: [
      { path: 'sets[0].difficulty', message: 'required' },
      { path: 'sets[1].pairs', message: 'expected array, received string' },
    ],
  });
  assert.match(failure.feedback, /sets\[0\]\.difficulty/);
  assert.match(failure.feedback, /sets\[1\]\.pairs/);
});

test('feedback stays bounded — a hundred errors do not become the next prompt', () => {
  const errors = Array.from({ length: 100 }, (_, i) => ({ path: `f${i}`, message: 'required' }));
  const failure = classifyOutputFailure({ reason: 'schema', errors });
  assert.ok(failure.feedback.length < 1000, `feedback was ${failure.feedback.length} chars`);
  assert.match(failure.feedback, /more/i);
});

// --- the retry decision ---

test('isRetryable is true for both retryable categories and false for terminal', () => {
  assert.equal(isRetryable({ category: RETRYABLE_TRANSPORT }), true);
  assert.equal(isRetryable({ category: RETRYABLE_OUTPUT }), true);
  assert.equal(isRetryable({ category: TERMINAL_CONTENT }), false);
});

test('budget and revision caps are terminal regardless of what caused them', () => {
  assert.equal(isRetryable(classifyOutputFailure({ reason: 'budget-cap' })), false);
  assert.equal(isRetryable(classifyOutputFailure({ reason: 'revision-limit' })), false);
});

// --- the error type ---

test('StudioFailure carries its category and is a real Error', () => {
  const failure = new StudioFailure(TERMINAL_CONTENT, 'nothing more to try');
  assert.ok(failure instanceof Error);
  assert.equal(failure.category, TERMINAL_CONTENT);
  assert.equal(failure.name, 'StudioFailure');
});

test('an unrecognized failure is treated as terminal, not retried forever', () => {
  assert.equal(classifyOutputFailure({ reason: 'who-knows' }).category, TERMINAL_CONTENT);
  assert.equal(classifyTransportError(new Error('mystery')).category, TERMINAL_CONTENT);
});

// llm.js — the ONLY module that touches the network.
//
// createLlm({ transport }) wraps a transport in the retry loop and produces
// the request record that lands in a run directory. The transport is injected,
// so --mock is a swap (see mock-transport.js), never an `if (mock)` branch.
//
// createAnthropicTransport() is the real transport: the single place `fetch`
// is called in the entire Studio.

import {
  StudioFailure,
  classifyOutputFailure,
  classifyTransportError,
  isRetryable,
} from './failures.js';

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 500;

export function createLlm({
  transport,
  clock = () => new Date().toISOString(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => Date.now(),
}) {
  async function send(request, options = {}) {
    const {
      maxAttempts = DEFAULT_MAX_ATTEMPTS,
      baseDelayMs = DEFAULT_BASE_DELAY_MS,
      feedback,
    } = options;

    const startedAt = clock();
    const startedMs = now();
    const requests = [];
    let inputTokens = 0;
    let outputTokens = 0;
    // Feedback from a caller's earlier validation failure is appended to the
    // prompt so a retry can actually correct itself rather than repeating.
    let pendingFeedback = feedback;
    let lastFailure;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const outbound = buildOutbound(request, pendingFeedback);
      const attemptStartedMs = now();

      let reply;
      try {
        reply = await transport(outbound);
      } catch (error) {
        lastFailure = classifyTransportError(error);
        requests.push({
          attempt,
          outcome: 'failed',
          error: `${lastFailure.message}`,
          category: lastFailure.category,
          durationMs: now() - attemptStartedMs,
        });
        if (!isRetryable(lastFailure) || attempt === maxAttempts) break;
        await sleep(delayFor(attempt, baseDelayMs, lastFailure));
        continue;
      }

      inputTokens += reply.usage?.inputTokens ?? 0;
      outputTokens += reply.usage?.outputTokens ?? 0;

      const stopFailure = classifyStopReason(reply.stopReason);
      if (stopFailure) {
        lastFailure = stopFailure;
        requests.push({
          attempt,
          outcome: 'failed',
          error: stopFailure.message,
          category: stopFailure.category,
          durationMs: now() - attemptStartedMs,
        });
        if (!isRetryable(stopFailure) || attempt === maxAttempts) break;
        pendingFeedback = stopFailure.feedback;
        await sleep(delayFor(attempt, baseDelayMs, stopFailure));
        continue;
      }

      requests.push({
        attempt,
        outcome: 'ok',
        inputTokens: reply.usage?.inputTokens ?? 0,
        outputTokens: reply.usage?.outputTokens ?? 0,
        durationMs: now() - attemptStartedMs,
      });

      return {
        text: reply.text,
        record: {
          startedAt,
          durationMs: now() - startedMs,
          model: reply.model ?? request.model,
          system: request.system,
          prompt: outbound.prompt,
          response: reply.text,
          attempts: attempt,
          inputTokens,
          outputTokens,
          requests,
        },
      };
    }

    throw new StudioFailure(
      lastFailure.category,
      `${lastFailure.message} after ${requests.length} attempt(s)`,
      { requests, inputTokens, outputTokens },
    );
  }

  return { send };
}

function buildOutbound(request, feedback) {
  // apiKey is consumed by the transport and deliberately not part of the
  // request record — secrets never reach a run directory.
  const { apiKey, ...rest } = request;
  const outbound = { ...rest, ...(apiKey === undefined ? {} : { apiKey }) };
  if (feedback) outbound.prompt = `${request.prompt}\n\n${feedback}`;
  return outbound;
}

function classifyStopReason(stopReason) {
  if (stopReason === 'max_tokens') return classifyOutputFailure({ reason: 'truncated' });
  if (stopReason === 'refusal') return classifyOutputFailure({ reason: 'refusal' });
  return null;
}

function delayFor(attempt, baseDelayMs, failure) {
  if (typeof failure.retryAfterSeconds === 'number') return failure.retryAfterSeconds * 1000;
  return baseDelayMs * 2 ** (attempt - 1);
}

// --- the real transport: the one place fetch is called ---

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export function createAnthropicTransport({ apiKey = process.env.ANTHROPIC_API_KEY } = {}) {
  if (!apiKey) {
    throw new StudioFailure(
      'terminal-content',
      'ANTHROPIC_API_KEY is not set — export it, or run with --mock.',
    );
  }

  return async function anthropicTransport({ model, system, prompt, maxTokens, temperature }) {
    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        ...(system ? { system } : {}),
        ...(temperature === undefined ? {} : { temperature }),
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const retryAfter = Number(response.headers.get('retry-after'));
      throw Object.assign(new Error(await response.text().catch(() => response.statusText)), {
        status: response.status,
        ...(Number.isFinite(retryAfter) ? { retryAfterSeconds: retryAfter } : {}),
      });
    }

    const body = await response.json();
    return {
      text: (body.content ?? [])
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join(''),
      stopReason: body.stop_reason,
      model: body.model,
      usage: {
        inputTokens: body.usage?.input_tokens ?? 0,
        outputTokens: body.usage?.output_tokens ?? 0,
      },
    };
  };
}

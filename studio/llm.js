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
    // Raised once, and only by a truncation. Tracked here rather than mutating
    // `request` so the caller's config stays the caller's.
    let maxTokens = request.maxTokens;
    let escalated = false;
    let lastFailure;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const outbound = buildOutbound(request, pendingFeedback, maxTokens);
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

      const stopFailure = classifyStopReason(reply.stopReason, reply);
      if (stopFailure) {
        lastFailure = stopFailure;
        requests.push({
          attempt,
          outcome: 'failed',
          error: stopFailure.message,
          category: stopFailure.category,
          durationMs: now() - attemptStartedMs,
        });

        // Truncation is the only failure here whose retry has to change the
        // request to stand a chance. Raise the ceiling once; a second
        // truncation means the stage wants more than we will spend blind.
        if (stopFailure.escalateMaxTokens) {
          if (escalated) {
            lastFailure = classifyOutputFailure({
              reason: 'truncated-again',
              ceilings: [request.maxTokens, maxTokens],
            });
            break;
          }
          escalated = true;
          maxTokens = Math.round(request.maxTokens * stopFailure.escalateMaxTokens);
        }

        if (!isRetryable(stopFailure) || attempt === maxAttempts) break;
        // `?? pendingFeedback`: a truncation carries no feedback of its own,
        // and must not erase the caller's validation feedback on the way past.
        pendingFeedback = stopFailure.feedback ?? pendingFeedback;
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
          // The ceiling and effort actually used, not the ones configured.
          // Establishing which of those a run had required arithmetic once;
          // once was enough.
          maxTokens,
          effort: request.effort ?? null,
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
      {
        requests,
        inputTokens,
        outputTokens,
        model: request.model,
        maxTokens,
        effort: request.effort ?? null,
      },
    );
  }

  return { send };
}

function buildOutbound(request, feedback, maxTokens) {
  // apiKey is consumed by the transport and deliberately not part of the
  // request record — secrets never reach a run directory.
  const { apiKey, ...rest } = request;
  const outbound = { ...rest, maxTokens, ...(apiKey === undefined ? {} : { apiKey }) };
  if (feedback) outbound.prompt = `${request.prompt}\n\n${feedback}`;
  return outbound;
}

function classifyStopReason(stopReason, reply = {}) {
  if (stopReason === 'max_tokens') return classifyOutputFailure({ reason: 'truncated' });
  if (stopReason === 'refusal') return classifyOutputFailure({ reason: 'refusal' });
  if (stopReason === 'model_context_window_exceeded') {
    return classifyOutputFailure({ reason: 'context-exceeded' });
  }
  // A reply that stopped cleanly but carries no text is not a success. Left
  // alone it becomes an empty string, and the JSON parser downstream blames
  // the prompt for what is almost always a model-side cause.
  if (typeof reply.text === 'string' && reply.text.trim() === '') {
    return classifyOutputFailure({
      reason: 'empty',
      stopReason,
      blockTypes: reply.blockTypes ?? [],
    });
  }
  return null;
}

function delayFor(attempt, baseDelayMs, failure) {
  if (typeof failure.retryAfterSeconds === 'number') return failure.retryAfterSeconds * 1000;
  return baseDelayMs * 2 ** (attempt - 1);
}

// --- the real transport: the one place fetch is called ---

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// A stage running at high effort thinks for a while before it says anything,
// so this is generous. It exists so a wedged connection becomes a bounded,
// retryable failure instead of a run that never returns.
const DEFAULT_TIMEOUT_MS = 300_000;

export function createAnthropicTransport({
  apiKey = process.env.ANTHROPIC_API_KEY,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (!apiKey) {
    throw new StudioFailure(
      'terminal-content',
      'ANTHROPIC_API_KEY is not set — export it, or run with --mock.',
    );
  }

  return async function anthropicTransport({ model, system, prompt, maxTokens, effort }) {
    const response = await fetchImpl(ANTHROPIC_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        ...(system ? { system } : {}),
        // Effort only. Sampling parameters (temperature, top_p, top_k) are
        // rejected outright by this model family, and `thinking` is left
        // unset on purpose: adaptive is the default and effort is how its
        // depth is set. Sending nothing is what keeps both true.
        ...(effort ? { output_config: { effort } } : {}),
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
    const blocks = body.content ?? [];
    return {
      text: blocks
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join(''),
      // What came back, in order. When nothing did, this is the difference
      // between "the model returned only thinking" and a blank shrug.
      blockTypes: blocks.map((block) => block.type),
      stopReason: body.stop_reason,
      model: body.model,
      usage: {
        inputTokens: body.usage?.input_tokens ?? 0,
        outputTokens: body.usage?.output_tokens ?? 0,
      },
    };
  };
}

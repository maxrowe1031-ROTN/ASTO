// Failure classification — the spec's three categories as one pure decision.
//
// Split out of llm.js deliberately: llm.js owns the I/O, this owns the
// meaning. Keeping them apart means the entire retry policy is unit-testable
// with zero network, which is the same reason agents are pure.
//
// The default for anything unrecognized is TERMINAL. An unknown failure that
// retries is an unbounded loop; an unknown failure that stops is one visible
// run status.

export const RETRYABLE_TRANSPORT = 'retryable-transport';
export const RETRYABLE_OUTPUT = 'retryable-output';
export const TERMINAL_CONTENT = 'terminal-content';

export class StudioFailure extends Error {
  constructor(category, message, details = {}) {
    super(message);
    this.name = 'StudioFailure';
    this.category = category;
    Object.assign(this, details);
  }
}

const RETRYABLE_ERROR_NAMES = new Set(['TimeoutError', 'AbortError']);
const RETRYABLE_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EPIPE',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

export function classifyTransportError(error) {
  const status = error?.status;
  if (typeof status === 'number') {
    // 429 = rate limited, 5xx = overloaded or transient. Everything else in
    // 4xx is our request being wrong — retrying sends the same wrong request.
    const category = status === 429 || status >= 500 ? RETRYABLE_TRANSPORT : TERMINAL_CONTENT;
    return {
      category,
      message: `HTTP ${status}`,
      ...(error.retryAfterSeconds !== undefined
        ? { retryAfterSeconds: error.retryAfterSeconds }
        : {}),
    };
  }

  if (RETRYABLE_ERROR_NAMES.has(error?.name) || RETRYABLE_ERROR_CODES.has(error?.code)) {
    return { category: RETRYABLE_TRANSPORT, message: error.message ?? String(error) };
  }

  return { category: TERMINAL_CONTENT, message: error?.message ?? String(error) };
}

const MAX_FEEDBACK_ERRORS = 8;

export function classifyOutputFailure({ reason, errors = [] } = {}) {
  switch (reason) {
    case 'unparseable':
      return {
        category: RETRYABLE_OUTPUT,
        message: 'response was not valid JSON',
        feedback: 'Your previous reply was not valid JSON. Reply with JSON only — no prose, no code fences.',
      };

    case 'schema':
      return {
        category: RETRYABLE_OUTPUT,
        message: `output failed schema validation (${errors.length} problem(s))`,
        feedback: buildSchemaFeedback(errors),
      };

    // Truncation arrives as parseable-looking output but is a transport-shaped
    // problem — the request was cut short, not answered wrongly.
    case 'truncated':
      return {
        category: RETRYABLE_TRANSPORT,
        message: 'response was truncated before it finished',
      };

    case 'refusal':
      return { category: TERMINAL_CONTENT, message: 'the agent declined the task' };

    case 'semantic':
      return {
        category: TERMINAL_CONTENT,
        message: 'output was well-formed but cannot satisfy the stage',
      };

    case 'budget-cap':
      return { category: TERMINAL_CONTENT, message: 'budget cap reached' };

    case 'revision-limit':
      return { category: TERMINAL_CONTENT, message: 'revision limit reached' };

    default:
      return { category: TERMINAL_CONTENT, message: `unrecognized failure: ${reason}` };
  }
}

function buildSchemaFeedback(errors) {
  const shown = errors.slice(0, MAX_FEEDBACK_ERRORS);
  const lines = shown.map((e) => `- ${e.path || '(root)'}: ${e.message}`);
  const remainder = errors.length - shown.length;
  if (remainder > 0) lines.push(`- …and ${remainder} more problem(s).`);
  return `Your previous reply did not match the required shape:\n${lines.join('\n')}\nReply with corrected JSON only.`;
}

export function isRetryable(failure) {
  return failure?.category === RETRYABLE_TRANSPORT || failure?.category === RETRYABLE_OUTPUT;
}

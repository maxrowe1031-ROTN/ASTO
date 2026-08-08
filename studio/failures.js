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

export function classifyOutputFailure({ reason, errors = [], ceilings = [], stopReason, blockTypes = [] } = {}) {
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
    // problem — the request was cut short, not answered wrongly. It is also
    // the one retryable failure where resending the same request cannot
    // possibly work: the ceiling is what stopped it. So the retry carries an
    // instruction to raise that ceiling, once.
    // The retry ALSO steps the effort down one notch, and that half is not
    // optional decoration. Raising the ceiling alone was measured five times
    // on 2026-08-08 — painting, shadows, bald eagle, sculpture, a rose — and
    // failed every time at ~$0.62 a run, because what overran the ceiling was
    // THINKING, not the answer: at high effort a narrow theme reasons until
    // the budget is gone and never gets to speak. More room to think in is not
    // a rescue for a stage that is thinking too much. See design.md D-12.
    case 'truncated':
      return {
        category: RETRYABLE_TRANSPORT,
        message: 'response was truncated before it finished',
        escalateMaxTokens: 1.5,
        stepDownEffort: true,
      };

    // Raised once and truncated again: the stage wants more room than we are
    // willing to buy blind, and a third identical attempt would only cost
    // money. Terminal, naming both ceilings so the next decision is informed.
    case 'truncated-again':
      return {
        category: TERMINAL_CONTENT,
        message: `response was truncated at max_tokens ${ceilings[0]}, and again after raising it to ${ceilings[1]}`,
      };

    // A reply with no text at all. Joined to '' it would surface downstream as
    // "not valid JSON", which points at the prompt when the cause is usually
    // the model: thinking consumed the whole budget, or the id is wrong.
    case 'empty':
      return {
        category: TERMINAL_CONTENT,
        message:
          `the model returned no text (stop_reason ${stopReason ?? 'unknown'}; ` +
          `blocks: ${blockTypes.length > 0 ? blockTypes.join(', ') : 'none'}). ` +
          'Likely an unknown model id, or thinking consumed the whole max_tokens budget.',
      };

    case 'context-exceeded':
      return {
        category: TERMINAL_CONTENT,
        message: 'the request exceeded the model context window',
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

// Coarsest last. One rung down is a real change in how long a stage reasons
// before it answers, which is the whole point — see the 'truncated' case above.
const EFFORT_LADDER = ['xhigh', 'high', 'medium', 'low'];

/**
 * One rung down the effort ladder, or null when there is nowhere to go.
 *
 * Lives here rather than in llm.js because "what a truncation is worth trying
 * next" is a decision about a failure, and this module owns those. llm.js owns
 * the I/O that carries the decision out.
 *
 * An absent effort stays absent: some models reject the parameter outright, and
 * a stage with none configured has nothing to step down from. An unrecognised
 * value is left alone too — guessing at a ladder we do not know is worse than
 * retrying with the ceiling raise alone.
 */
export function stepDownEffort(effort) {
  const rung = EFFORT_LADDER.indexOf(effort);
  if (rung === -1 || rung === EFFORT_LADDER.length - 1) return null;
  return EFFORT_LADDER[rung + 1];
}

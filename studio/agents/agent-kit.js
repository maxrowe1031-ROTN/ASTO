// Shared helpers for the eight agent modules. PURE — no I/O, no transport.
//
// Every agent is one job with one output shape, so the repeated parts live
// here: extracting JSON from a model reply, rendering the learning package
// into a prompt preamble, and running an output through its schema plus any
// semantic checks the agent adds.

import { classifyOutputFailure } from '../failures.js';
import { checkSchema } from '../schema-check.js';

/**
 * Models wrap JSON in fences and apologies. Try the whole string, then a
 * fenced block, then the outermost balanced braces before giving up.
 */
export function parseJson(text) {
  if (typeof text !== 'string') {
    return { ok: false, failure: classifyOutputFailure({ reason: 'unparseable' }) };
  }

  for (const candidate of jsonCandidates(text)) {
    try {
      const value = JSON.parse(candidate);
      if (value !== null && typeof value === 'object') return { ok: true, value };
    } catch {
      // try the next candidate
    }
  }
  return { ok: false, failure: classifyOutputFailure({ reason: 'unparseable' }) };
}

function* jsonCandidates(text) {
  const trimmed = text.trim();
  yield trimmed;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) yield fenced[1].trim();

  for (const [open, close] of [
    ['{', '}'],
    ['[', ']'],
  ]) {
    const start = trimmed.indexOf(open);
    const end = trimmed.lastIndexOf(close);
    if (start !== -1 && end > start) yield trimmed.slice(start, end + 1);
  }
}

/**
 * Renders the retrieved learning package. Bounded by the retriever, not here —
 * this only formats what it is given, and yields nothing when given nothing.
 */
export function renderContext(context = {}) {
  const { rules = [], acceptedExamples = [], rejectedExamples = [], patterns = [], calibration } =
    context ?? {};
  const blocks = [];

  if (rules.length > 0) {
    blocks.push(`Editorial rules you must follow:\n${rules.map((r) => `- ${r}`).join('\n')}`);
  }
  if (acceptedExamples.length > 0) {
    blocks.push(`Examples that were accepted:\n${acceptedExamples.map(renderExample).join('\n')}`);
  }
  if (rejectedExamples.length > 0) {
    blocks.push(
      `Examples that were rejected — do not repeat these mistakes:\n${rejectedExamples
        .map(renderExample)
        .join('\n')}`,
    );
  }
  if (patterns.length > 0) {
    blocks.push(`Recurring problems in recent work:\n${patterns.map((p) => `- ${p}`).join('\n')}`);
  }
  if (calibration) {
    blocks.push(`Calibration note: ${calibration}`);
  }

  return blocks.join('\n\n');
}

const renderExample = (example) =>
  typeof example === 'string'
    ? `- ${example}`
    : `- ${example.text}${example.reason ? `\n    why: ${example.reason}` : ''}`;

/**
 * The revision instruction the generative stages lead with, when the attempt
 * they are running is a revision of an earlier one.
 *
 * This exists because for the whole life of the pipeline it did not. Max's
 * notes were written to `revision.json` and read by nothing, so a revision
 * re-entering at `01-pair-author` was a blind re-roll of the theme: fresh
 * pool, fresh grouping, fresh board. He said it twice on 2026-08-08, on bbq
 * and on nintendo — *"i only asked for one small change... and this is an
 * entirely new puzzle set"* — and the nintendo re-roll reproduced the exact
 * flaw the revision was meant to fix, because nothing ever told it there was
 * a flaw. See design.md D-11.
 *
 * One block, shared by all three generative agents: the wording is the fix,
 * and three copies of it would drift.
 *
 * Returns '' when there is nothing to say, so callers can drop it like any
 * other empty prompt part.
 */
export function renderRevision(revision) {
  if (!revision) return '';
  const { notes = '', parentBoard = null } = revision;
  if (!notes.trim() && !parentBoard) return '';

  return [
    'THIS IS A REVISION, NOT A NEW BOARD.',
    'An editor reviewed the board below and asked for specific changes. Your job is to make those changes and nothing else.',
    parentBoard ? asJsonBlock('The board being revised', parentBoard) : '',
    notes.trim() ? `The editor's instructions, verbatim:\n${notes.trim()}` : '',
    [
      'Rules for this revision:',
      '- Any set the instructions approve, praise, or list under "Do not change" must SURVIVE UNCHANGED. Reproduce it exactly as it appears above — same words, same order, same relationship.',
      '- Change only what the instructions actually ask you to change. Everything else is finished work that was paid for and accepted.',
      '- Do not re-theme, re-title or re-author the board. A revision that returns a different board has failed, however good the different board is.',
    ].join('\n'),
  ]
    .filter((part) => part.trim().length > 0)
    .join('\n\n');
}

/** Assembles a prompt from its parts, dropping the empty ones. */
export function composePrompt({ role, task, context, data, outputRules }) {
  return [role, renderContext(context), task, data, outputRules]
    .filter((part) => typeof part === 'string' && part.trim().length > 0)
    .join('\n\n');
}

/** Pretty-prints agent input for the prompt body. */
export function asJsonBlock(label, value) {
  return `${label}:\n${JSON.stringify(value, null, 2)}`;
}

export const JSON_ONLY =
  'Reply with a single JSON object and nothing else — no prose, no explanation, no code fences.';

/**
 * Standard validateOutput: structural schema first, then the agent's own
 * semantic checks. Never throws; collects every problem.
 */
export function validateAgainst(output, schema, semanticChecks = []) {
  const structural = checkSchema(output, schema);
  if (!structural.ok) return structural;

  const errors = [];
  for (const check of semanticChecks) {
    try {
      errors.push(...(check(output) ?? []));
    } catch (error) {
      errors.push({ path: '', message: `semantic check failed: ${error.message}` });
    }
  }
  return { ok: errors.length === 0, errors };
}

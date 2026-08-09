// Revision Proposer — turns a rejection into a brief the pipeline can act on.
//
// NOT a pipeline stage. It runs at REVIEW time, once, when Max marks a board
// "not publishable" or "publishable after a fix" — so it is the only agent that
// gets to read his judgement, which is also why it is the only one whose first
// input is a human's opinion rather than another agent's output.
//
// It exists because of what the 2026-08-05 boards showed: stages 05 and 06 had
// already found both defects Max found — 06 named the Louvre/Museum collision
// almost in his words, and flagged `spy`/`operative` as near-synonyms — and
// nothing routed that anywhere. Max was re-deriving, by hand, findings the
// pipeline had already written down.
//
// Two guardrails, both learned the hard way:
//
//   It PROPOSES, never authors. Same rule as the Board Builder's (design.md
//   D-1): content nobody judged carries no judgement. Its output is a brief for
//   `requestRevision`, which re-enters the real pipeline at a real stage.
//
//   Max's verdict outranks the evaluators'. On the paris board 05 failed and 06
//   flagged `[high] unfair` the set he liked BEST ("the first puzzle i solved so
//   i was very excited"). An agent keyed to machine findings alone would have
//   "fixed" the thing he loved, so his reads are authority and theirs are
//   evidence — and anything he praised is named as untouchable.

import { JSON_ONLY, asJsonBlock, composePrompt, parseJson, validateAgainst } from './agent-kit.js';
import { STAGE_IDS_FOR_REVISION } from '../stage-registry.js';

export const id = 'revision-proposer';
export const stageId = '09-revision-proposer';

const SCHEMA = {
  type: 'object',
  required: ['summary', 'fromStage', 'fixes', 'doNotChange'],
  properties: {
    // One or two sentences Max reads before deciding whether to spend on a
    // revision. It is the whole UI for this agent.
    summary: { type: 'string', minLength: 1 },
    // Where the revision must re-enter. A word swap is a builder problem; a
    // pool with nothing groupable is a pair-author problem.
    fromStage: { type: 'string', enum: [...STAGE_IDS_FOR_REVISION] },
    reasoning: { type: 'string' },
    fixes: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['setId', 'problem', 'source', 'candidates'],
        properties: {
          setId: { type: 'string', minLength: 1 },
          problem: { type: 'string', minLength: 1 },
          // Whose judgement this is. Max's reads are authority; the
          // evaluators' are evidence. Saying which is which keeps the
          // distinction visible when the brief is read back later.
          source: { type: 'string', enum: ['max', 'evaluator', 'both'] },
          candidates: {
            type: 'array',
            minItems: 1,
            maxItems: 3,
            items: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    // The sets Max praised. Naming them is not politeness: it is the
    // instruction that stops a revision trading a good set for a fixed one.
    doNotChange: { type: 'array', items: { type: 'string', minLength: 1 } },
  },
};

export function getOutputSchema() {
  return SCHEMA;
}

export function buildPrompt(input = {}, context) {
  const { board = null, feedback = [], findings = {}, vocabulary = [] } = input;

  // The pre-review variant (design.md D-14): the loop that runs BEFORE Max sees
  // the board, triggered by allowlisted structural findings. This is the stated
  // exception to the authority ordering above, for the one case where his
  // judgement does not exist yet — pre-review, there is no feedback to outrank.
  if (input.preReview) return buildPreReviewPrompt(input, context);

  const maxSaid = feedback.filter((event) => event.source !== 'review-studio-play');
  const played = feedback.find((event) => event.action === 'playthrough');

  return composePrompt({
    role:
      'You are the Revision Proposer for ASTO. A human editor has just judged a candidate board and found it ' +
      'not publishable as it stands. Your job is to turn that judgement into the smallest concrete revision ' +
      'that would make it publishable — and to propose it, never to write the board yourself.',
    context,
    task: [
      'Read the editor\'s judgement first. It is the authority here.',
      'The automated evaluators (analogy validator, adversarial solver, test player, style guide) are EVIDENCE, not authority. Where they disagree with the editor, the editor is right. They have flagged sets he liked before.',
      'For each set that is actually blocking publication, state the problem in one line, say whose judgement it rests on, and give one to three concrete candidate fixes.',
      'A candidate fix is specific: name the word or pair to change and what to change it to, or name the constraint the replacement must satisfy. "Improve the relationship" is not a fix.',
      'If the editor supplied his own fix, treat it as the leading candidate and say so — he is the editor.',
      'List every set he praised in "doNotChange". A revision that repairs one set and spoils another is a worse board.',
      'Choose "fromStage": the earliest stage that can actually deliver the fix, and no earlier. Swapping one word is a board-builder problem; a pool with nothing groupable is a pair-author problem. Re-entering too early throws away work that was fine.',
      'Be brief. The editor reads this to decide whether to spend a few minutes and a few cents on a revision.',
    ].join('\n'),
    data: [
      asJsonBlock('The board as judged', board),
      asJsonBlock('The editor\'s judgement', maxSaid),
      played ? asJsonBlock('How he actually played it', played.playthrough) : '',
      asJsonBlock('What the automated evaluators found', findings),
      vocabulary.length > 0 ? asJsonBlock('Relationship vocabulary in play', vocabulary) : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    outputRules: [
      'Return { "summary", "fromStage", "reasoning", "fixes": [ { "setId", "problem", "source", "candidates" } ], "doNotChange": [ setId ] }.',
      '"source" is "max" when the editor found it, "evaluator" when only the machine did, "both" when they agree.',
      '"candidates" holds one to three concrete fixes, most promising first.',
      JSON_ONLY,
    ].join(' '),
  });
}

/**
 * The pre-review prompt (design.md D-14). No editor judgement exists yet: the
 * allowlisted structural findings — the only machine findings Max trusts to
 * trigger a revision — are the reason for the brief, and the whole reason.
 *
 * Two rules distinguish it from the post-review prompt above:
 *
 *   Fix ONLY what the allowlisted findings name. The full evaluator reports
 *   ride along as evidence, but a defect only they mention is Max's to judge —
 *   widening the surgery beyond the allowlist would be exactly the trust the
 *   graduation has not earned.
 *
 *   Every set with no allowlisted finding goes in "doNotChange". Post-review,
 *   the protected list is the sets Max praised; pre-review nobody has praised
 *   anything, so protection defaults to everything the findings leave alone.
 */
function buildPreReviewPrompt(input, context) {
  const { board = null, findings = {}, vocabulary = [], preReview } = input;

  return composePrompt({
    role:
      'You are the Revision Proposer for ASTO, running BEFORE any human review. A candidate board has ' +
      'completed the pipeline, and specific automated structural checks — the only checks trusted to ' +
      'trigger this — found defects worth fixing before the editor spends time on the board. Your job is ' +
      'to turn those findings into the smallest concrete revision — and to propose it, never to write ' +
      'the board yourself.',
    context,
    task: [
      'No human has judged this board yet. The "allowlisted findings" below are your entire mandate.',
      'Fix ONLY what the allowlisted findings name. The full evaluator reports are attached as supporting evidence, but a defect only they mention is the editor\'s to judge, not yours — leave it alone.',
      'For each set an allowlisted finding touches, state the problem in one line and give one to three concrete candidate fixes.',
      'A candidate fix is specific: name the word or pair to change and what to change it to, or name the constraint the replacement must satisfy. "Improve the relationship" is not a fix.',
      'Every set with no allowlisted finding goes in "doNotChange". A revision that repairs one set and spoils another is a worse board.',
      'Choose "fromStage": the earliest stage that can actually deliver the fix, and no earlier. Swapping one word is a board-builder problem; a pool with nothing groupable is a pair-author problem. Re-entering too early throws away work that was fine.',
      'Be brief. This brief is audited by the editor after the fact, on the review card.',
    ].join('\n'),
    data: [
      asJsonBlock('The board as built', board),
      asJsonBlock('Allowlisted findings — the reason for this revision', preReview.findings),
      asJsonBlock('The full evaluator reports (evidence only)', findings),
      vocabulary.length > 0 ? asJsonBlock('Relationship vocabulary in play', vocabulary) : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    outputRules: [
      'Return { "summary", "fromStage", "reasoning", "fixes": [ { "setId", "problem", "source", "candidates" } ], "doNotChange": [ setId ] }.',
      '"source" is always "evaluator" here — no editor judgement exists yet.',
      '"candidates" holds one to three concrete fixes, most promising first.',
      JSON_ONLY,
    ].join(' '),
  });
}

export function parse(text) {
  return parseJson(text);
}

// A fix for a set that is not on the board is a brief nobody can execute, and
// a "do not change" naming a set that does not exist is noise in the record.
const setsExistOnTheBoard = (output, board) => {
  const ids = new Set((board?.sets ?? []).map((set) => set.id));
  if (ids.size === 0) return [];
  const errors = [];
  output.fixes.forEach((fix, i) => {
    if (!ids.has(fix.setId)) {
      errors.push({ path: `fixes[${i}].setId`, message: `"${fix.setId}" is not a set on this board` });
    }
  });
  for (const setId of output.doNotChange ?? []) {
    if (!ids.has(setId)) {
      errors.push({ path: 'doNotChange', message: `"${setId}" is not a set on this board` });
    }
  }
  return errors;
};

// The same set cannot be both the thing to fix and the thing to leave alone.
const noSetIsBothFixedAndProtected = (output) => {
  const fixing = new Set(output.fixes.map((fix) => fix.setId));
  const clashes = (output.doNotChange ?? []).filter((setId) => fixing.has(setId));
  return clashes.length === 0
    ? []
    : [
        {
          path: 'doNotChange',
          message: `${clashes.join(', ')} appears in both "fixes" and "doNotChange" — decide which`,
        },
      ];
};

// Pre-review only (design.md D-14): every board set must be either fixed or
// protected. Post-review this is not required — Max may have said nothing about
// a set — but pre-review "unmentioned" would mean "free to churn", which is
// precisely what the bound forbids.
const everySetIsFixedOrProtected = (output, board) => {
  const mentioned = new Set([...output.fixes.map((fix) => fix.setId), ...(output.doNotChange ?? [])]);
  const missing = (board?.sets ?? []).map((set) => set.id).filter((id) => !mentioned.has(id));
  return missing.length === 0
    ? []
    : [
        {
          path: 'doNotChange',
          message: `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} neither fixed nor protected — pre-review, every set with no allowlisted finding goes in "doNotChange"`,
        },
      ];
};

export function validateOutput(output, { board = null, preReview = false } = {}) {
  return validateAgainst(output, SCHEMA, [
    (value) => setsExistOnTheBoard(value, board),
    noSetIsBothFixedAndProtected,
    ...(preReview ? [(value) => everySetIsFixedOrProtected(value, board)] : []),
  ]);
}

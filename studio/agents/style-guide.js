// Style Guide (GDD §12.1 #8) — checks labels and explanations against ASTO's
// voice: cozy, smart, playful, adult. Never snarky, never academic.
//
// One copy pass only. It SUGGESTS edits and never rewrites meaning — the GDD
// is explicit that taste stays human, so this agent proposes and the editor
// disposes.
//
// Since 2026-08-04 (design.md D-3) it also carries the UNITY verdict: do the
// sixteen words read as one world, or does a set feel imported from another
// puzzle? Unity is the half of ASTO's goal that cannot be mechanically gated
// (variety is enforced in code at 02 and 04a), so it is scored and SHOWN on
// the review card, never used to reject a board — Max stays the authority.

import { JSON_ONLY, asJsonBlock, composePrompt, parseJson, validateAgainst } from './agent-kit.js';

export const id = 'style-guide';
export const stageId = '08-style-guide';

const SCHEMA = {
  type: 'object',
  required: ['edits', 'compliant', 'unity'],
  properties: {
    compliant: { type: 'boolean' },
    edits: {
      type: 'array',
      items: {
        type: 'object',
        required: ['setId', 'field', 'suggestion', 'reason'],
        properties: {
          setId: { type: 'string', minLength: 1 },
          field: { type: 'string', enum: ['relationshipLabel', 'explanation', 'title'] },
          suggestion: { type: 'string', minLength: 1 },
          reason: { type: 'string', minLength: 1 },
        },
      },
    },
    unity: {
      type: 'object',
      required: ['verdict', 'reasoning'],
      properties: {
        verdict: { type: 'string', enum: ['strong', 'adequate', 'weak'] },
        reasoning: { type: 'string', minLength: 1 },
        outliers: {
          type: 'array',
          items: {
            type: 'object',
            required: ['word', 'note'],
            properties: {
              word: { type: 'string', minLength: 1 },
              note: { type: 'string', minLength: 1 },
            },
          },
        },
      },
    },
  },
};

export function getOutputSchema() {
  return SCHEMA;
}

export function buildPrompt(input = {}, context) {
  const { items = [], title = null, words = [] } = input;

  return composePrompt({
    role:
      "You are the Style Guide for ASTO. ASTO's voice is warm, calm, lightly whimsical and adult — " +
      'the shorthand is "Animal Crossing for sophisticated adults". ' +
      'The goal of a board: the theme unifies the words, the relationships diversify the questions.',
    context,
    task: [
      'Read every relationship label and explanation and check it against the voice:',
      '  - Short and friendly. No academic phrasing, no jargon.',
      '  - No snark, no scolding, no congratulating the player on being clever.',
      '  - An explanation states why the analogy holds, in one sentence, so it feels fair in hindsight.',
      '  - Do not over-explain. If the set speaks for itself, say it is compliant.',
      'Suggest edits only where the copy actually falls short. Never change what a label or explanation MEANS — if the meaning is wrong, that is the editor\'s call, not a copy fix. Say so in the reason instead.',
      'Then judge UNITY: read the sixteen words as a player will, before knowing any answer.',
      '  - "strong": one world — every word could sit in the same picture, and no set feels imported from a different puzzle.',
      '  - "adequate": the world holds, but a word or a set sits slightly outside its register.',
      '  - "weak": the words read as lists from different puzzles that happen to share a title.',
      'Name every word that sits outside the world in "outliers", each with a one-line note. Unity is shown to the editor, never enforced — be honest, not lenient.',
      'This is one pass. Do not iterate.',
    ].join('\n'),
    data: asJsonBlock('The board', title ? { title, words, items } : { words, items }),
    outputRules: [
      'Return { "edits": [ { "setId", "field", "suggestion", "reason" } ], "compliant": true or false, "unity": { "verdict", "reasoning", "outliers": [ { "word", "note" } ] } }.',
      '"field" is one of relationshipLabel, explanation, title — the one your "suggestion" would replace.',
      '"unity.verdict" is one of strong, adequate, weak.',
      'If everything is in voice, return "compliant": true and an empty "edits".',
      JSON_ONLY,
    ].join(' '),
  });
}

export function parse(text) {
  return parseJson(text);
}

const compliantAgreesWithEdits = (output) => {
  const clean = output.edits.length === 0;
  return output.compliant === clean
    ? []
    : [{ path: 'compliant', message: `must be ${clean} to match an edit list of ${output.edits.length}` }];
};

// A weak or adequate verdict with no named outliers is a judgement the editor
// cannot act on — the whole point of scoring unity is that Max sees WHERE the
// world breaks, not just that it does.
const verdictNamesItsEvidence = (output) => {
  const outliers = output.unity?.outliers ?? [];
  if (output.unity?.verdict === 'weak' && outliers.length === 0) {
    return [
      {
        path: 'unity.outliers',
        message: 'a weak verdict must name the words that break the world',
      },
    ];
  }
  return [];
};

export function validateOutput(output) {
  return validateAgainst(output, SCHEMA, [compliantAgreesWithEdits, verdictNamesItsEvidence]);
}

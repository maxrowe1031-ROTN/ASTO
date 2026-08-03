// Style Guide (GDD §12.1 #8) — checks labels and explanations against ASTO's
// voice: cozy, smart, playful, adult. Never snarky, never academic.
//
// One copy pass only. It SUGGESTS edits and never rewrites meaning — the GDD
// is explicit that taste stays human, so this agent proposes and the editor
// disposes.

import { JSON_ONLY, asJsonBlock, composePrompt, parseJson, validateAgainst } from './agent-kit.js';

export const id = 'style-guide';
export const stageId = '08-style-guide';

const SCHEMA = {
  type: 'object',
  required: ['edits', 'compliant'],
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
  },
};

export function getOutputSchema() {
  return SCHEMA;
}

export function buildPrompt(input = {}, context) {
  const { items = [], title = null } = input;

  return composePrompt({
    role:
      "You are the Style Guide for ASTO. ASTO's voice is warm, calm, lightly whimsical and adult — " +
      'the shorthand is "Animal Crossing for sophisticated adults".',
    context,
    task: [
      'Read every relationship label and explanation and check it against the voice:',
      '  - Short and friendly. No academic phrasing, no jargon.',
      '  - No snark, no scolding, no congratulating the player on being clever.',
      '  - An explanation states why the analogy holds, in one sentence, so it feels fair in hindsight.',
      '  - Do not over-explain. If the set speaks for itself, say it is compliant.',
      'Suggest edits only where the copy actually falls short. Never change what a label or explanation MEANS — if the meaning is wrong, that is the editor\'s call, not a copy fix. Say so in the reason instead.',
      'This is one pass. Do not iterate.',
    ].join('\n'),
    data: asJsonBlock('Labels and explanations', title ? { title, items } : { items }),
    outputRules: [
      'Return { "edits": [ { "setId", "field", "suggestion", "reason" } ], "compliant": true or false }.',
      '"field" is one of relationshipLabel, explanation, title — the one your "suggestion" would replace.',
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

export function validateOutput(output) {
  return validateAgainst(output, SCHEMA, [compliantAgreesWithEdits]);
}

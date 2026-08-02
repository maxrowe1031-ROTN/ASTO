// Analogy Validator (GDD §12.1 #5) — checks whether each analogy is logically
// sound and whether both pairs really share the stated relationship.
//
// Fails closed: any unsound analogy fails the board. Narrow, cheap, and
// deliberately not the ambiguity hunter — that is the Adversarial Solver.

import { JSON_ONLY, asJsonBlock, composePrompt, parseJson, validateAgainst } from './agent-kit.js';

export const id = 'analogy-validator';
export const stageId = '05-analogy-validator';

const SCHEMA = {
  type: 'object',
  required: ['verdicts', 'boardPasses'],
  properties: {
    boardPasses: { type: 'boolean' },
    verdicts: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['setId', 'pass', 'notes'],
        properties: {
          setId: { type: 'string', minLength: 1 },
          pass: { type: 'boolean' },
          notes: { type: 'string', minLength: 1 },
        },
      },
    },
  },
};

export function getOutputSchema() {
  return SCHEMA;
}

export function buildPrompt(input = {}, context) {
  const { board = {} } = input;

  return composePrompt({
    role:
      'You are the Analogy Validator for ASTO. You check one thing: whether each set is a sound analogy.',
    context,
    task: [
      'For every set, answer: do both pairs genuinely express the stated relationship, in the same direction?',
      'A set fails if the relationship holds for one pair but only loosely for the other.',
      'A set fails if the stated label is not actually what connects the words.',
      'A set fails if the relationship reads equally well reversed — order is the game.',
      'You are not hunting for alternate groupings across sets; another agent does that. Stay inside each set.',
      'Fail closed: if any set fails, "boardPasses" is false.',
    ].join('\n'),
    data: asJsonBlock('Board', board),
    outputRules: `Give every set a verdict with notes, even when it passes. ${JSON_ONLY}`,
  });
}

export function parse(text) {
  return parseJson(text);
}

// "Fails closed" is a rule, not a suggestion — the flag must match the verdicts.
const boardPassesAgreesWithVerdicts = (output) => {
  const allPass = output.verdicts.every((verdict) => verdict.pass === true);
  return output.boardPasses === allPass
    ? []
    : [
        {
          path: 'boardPasses',
          message: `must be ${allPass} to match the individual verdicts — the validator fails closed`,
        },
      ];
};

export function validateOutput(output) {
  return validateAgainst(output, SCHEMA, [boardPassesAgreesWithVerdicts]);
}

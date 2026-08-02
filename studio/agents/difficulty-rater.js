// Difficulty Rater (GDD §12.1 #3) — grades each candidate set 1 (easiest) to
// 4 (hardest): its intended tier. Sets are graded individually, never whole
// boards.
//
// This is the "predicted" half of §16's Difficulty Loop; the Test-Player
// supplies the simulated half. It may abstain on a tier-straddling set rather
// than guess, which the schema allows via difficulty: null + abstained.

import { JSON_ONLY, asJsonBlock, composePrompt, parseJson, validateAgainst } from './agent-kit.js';

export const id = 'difficulty-rater';
export const stageId = '03-difficulty-rater';

const SCHEMA = {
  type: 'object',
  required: ['grades'],
  properties: {
    grades: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['setId', 'rationale'],
        properties: {
          setId: { type: 'string', minLength: 1 },
          difficulty: { type: 'integer', minimum: 1, maximum: 4 },
          abstained: { type: 'boolean' },
          rationale: { type: 'string', minLength: 1 },
        },
      },
    },
  },
};

export function getOutputSchema() {
  return SCHEMA;
}

export function buildPrompt(input = {}, context) {
  const { sets = [] } = input;

  return composePrompt({
    role:
      'You are the Difficulty Rater for ASTO. You grade one analogy set at a time on the tier it belongs in.',
    context,
    task: [
      'Grade every set from 1 to 4:',
      '  1 — immediate. The relationship is obvious once the four words are seen together.',
      '  2 — clear, but the words need a moment to couple up.',
      '  3 — the relationship is real but abstract, or the words carry a misleading surface reading.',
      '  4 — hard: abstract, easily mistaken for another grouping, or dependent on noticing direction.',
      'Judge clarity, abstraction, familiarity and misdirection. Grade each set on its own; you are not looking at a board.',
      'Hard must never mean arbitrary. A grade-4 set still has to feel fair once revealed.',
      'If a set genuinely straddles two tiers, set "abstained": true, leave "difficulty" out, and say so in the rationale. Do not guess.',
      'Every set gets a one-line rationale.',
    ].join('\n'),
    data: asJsonBlock('Candidate sets', sets),
    outputRules: `Return one entry per set, keyed by its "setId". ${JSON_ONLY}`,
  });
}

export function parse(text) {
  return parseJson(text);
}

// A grade must either commit to 1–4 or abstain — never both, never neither.
const gradedOrAbstained = (output) =>
  output.grades
    .map((grade, i) => {
      const hasDifficulty = typeof grade.difficulty === 'number';
      if (grade.abstained === true) {
        return hasDifficulty
          ? { path: `grades[${i}]`, message: 'abstained grades must not also carry a difficulty' }
          : null;
      }
      return hasDifficulty
        ? null
        : { path: `grades[${i}].difficulty`, message: 'required unless "abstained" is true' };
    })
    .filter(Boolean);

const oneGradePerSet = (output) => {
  const seen = new Set();
  return output.grades
    .map((grade, i) => {
      if (seen.has(grade.setId)) {
        return { path: `grades[${i}].setId`, message: `set "${grade.setId}" graded more than once` };
      }
      seen.add(grade.setId);
      return null;
    })
    .filter(Boolean);
};

export function validateOutput(output) {
  return validateAgainst(output, SCHEMA, [gradedOrAbstained, oneGradePerSet]);
}

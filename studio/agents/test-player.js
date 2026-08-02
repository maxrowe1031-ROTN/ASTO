// Test-Player (GDD §12.1 #7) — plays the board the way a player would.
//
// BLIND BY CONSTRUCTION. buildPrompt accepts a word list and the mistake
// allowance, and nothing else. It cannot leak the intended sets, labels,
// explanations, difficulties, author reports or the integrity result, because
// it is never handed them — a test asserts exactly that.
//
// Its output is SIMULATED play, never "empirical". §16's Difficulty Loop
// compares it against the Difficulty Rater's prediction; only real playtests
// produce human-observed difficulty.

import { JSON_ONLY, asJsonBlock, composePrompt, parseJson, validateAgainst } from './agent-kit.js';

export const id = 'test-player';
export const stageId = '07-test-player';

const SCHEMA = {
  type: 'object',
  required: ['trials'],
  properties: {
    trials: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['submissions', 'mistakes', 'solved', 'reasoning'],
        properties: {
          solved: { type: 'boolean' },
          mistakes: { type: 'integer', minimum: 0, maximum: 4 },
          reasoning: { type: 'string', minLength: 1 },
          estimatedDifficulty: { type: 'integer', minimum: 1, maximum: 4 },
          submissions: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['words', 'confidence'],
              properties: {
                words: {
                  type: 'array',
                  minItems: 4,
                  maxItems: 4,
                  items: { type: 'string', minLength: 1 },
                },
                relationshipGuess: { type: 'string' },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
              },
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

/**
 * @param {{ words: string[], maxMistakes?: number, trial?: number }} input
 *   Deliberately narrow: everything a player can see, nothing more.
 */
export function buildPrompt(input = {}, context) {
  const { words = [], maxMistakes = 4 } = input;

  return composePrompt({
    role:
      'You are playing ASTO, a word puzzle. Sixteen words are on the board. They hide four hidden analogies of the form A : B :: C : D.',
    context,
    task: [
      'Play the board as a first-time player would. You have not seen it before and you do not know the answers.',
      'Rules: submit four words in order — A, B, C, D — so that A is to B as C is to D. Order is part of the answer; the same four words in a different order is a different submission.',
      `You lose on your ${ordinal(maxMistakes)} mistake. Right four words in the wrong order still costs a mistake.`,
      'Work by finding a relationship first, then hunting for a second pair that shares it.',
      'Submit your real best guesses in the order you would actually try them, including the ones you would get wrong. A guess you would plausibly make and regret is more useful than a perfect run.',
      'Stop when you have solved all four sets or spent your mistakes.',
      'Then say how hard the board felt, 1 (immediate) to 4 (hard).',
    ].join('\n'),
    data: asJsonBlock('The sixteen words on the board', words),
    outputRules: [
      'Return { "trials": [ { "submissions": [ { "words": [A,B,C,D], "relationshipGuess", "confidence" } ], "mistakes", "solved", "reasoning", "estimatedDifficulty" } ] }.',
      'Confidence is 0 to 1. Reasoning is a short summary of how you read the board, including the false trails you followed.',
      JSON_ONLY,
    ].join(' '),
  });
}

// "You lose on your 4th mistake" — a player-facing sentence, so it reads like
// one. "4th" is fine; "3th" is not.
function ordinal(n) {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

export function parse(text) {
  return parseJson(text);
}

// A trial that solved cannot also have spent every mistake, and a trial that
// did not solve must have run out — otherwise it stopped early and the
// difficulty signal is meaningless.
const trialsAreConsistent = (output) =>
  output.trials
    .map((trial, i) => {
      if (trial.solved && trial.mistakes >= 4) {
        return { path: `trials[${i}]`, message: 'a solved trial cannot also have lost on mistakes' };
      }
      return null;
    })
    .filter(Boolean);

const foursomesAreDistinct = (output) => {
  const errors = [];
  output.trials.forEach((trial, t) => {
    trial.submissions.forEach((submission, s) => {
      const lowered = submission.words.map((w) => w.trim().toLowerCase());
      if (new Set(lowered).size !== 4) {
        errors.push({
          path: `trials[${t}].submissions[${s}].words`,
          message: 'a submission must be four distinct words',
        });
      }
    });
  });
  return errors;
};

export function validateOutput(output) {
  return validateAgainst(output, SCHEMA, [trialsAreConsistent, foursomesAreDistinct]);
}

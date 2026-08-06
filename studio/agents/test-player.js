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
    // Words this player could only place by knowing the subject (D-8, added
    // 2026-08-05). Words, never sets — 07 is blind by construction and must
    // stay that way, so the review page maps word → set the same way it already
    // does for the adversarial solver's findings.
    //
    // The reason this field exists: 07 is a model, so it knows what
    // `speleothem` and `Paris-Roubaix` are and plays a knowledge-gated set as
    // though it were open. The one agent whose whole job is "how does this
    // feel to play" was structurally unable to notice the defect Max found by
    // playing. Asking it to name what it leaned on is the cheapest way to make
    // that visible without pretending the model can forget things.
    knowledgeGated: {
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
      // "A first-time player" left the reference class open, and the model's
      // default reading of it is someone who knows everything the model knows.
      // Naming the audience is what makes the next instruction answerable.
      'Play the board as a first-time player would: curious and sharp, but with no special interest in whatever this board is about. You have not seen it before, you do not know the answers, and you have not studied the subject.',
      'Rules: submit four words in order — A, B, C, D — so that A is to B as C is to D. Order is part of the answer; the same four words in a different order is a different submission.',
      `You lose on your ${ordinal(maxMistakes)} mistake. Right four words in the wrong order still costs a mistake.`,
      'Work by finding a relationship first, then hunting for a second pair that shares it.',
      'Submit your real best guesses in the order you would actually try them, including the ones you would get wrong. A guess you would plausibly make and regret is more useful than a perfect run.',
      'Stop when you have solved all four sets or spent your mistakes.',
      'Then say how hard the board felt, 1 (immediate) to 4 (hard).',
      '',
      // The detector. See the schema comment above for why an agent that knows
      // everything has to be asked this out loud rather than trusted to feel it.
      'Finally, be honest about what you knew that a general player might not. List in "knowledgeGated" every word you could only place because you happen to know the subject — a technical term, a proper name, a piece of trivia — with one line on what someone would need to know.',
      'Judge this by what the word demands, not by whether you found it easy: you know a great deal, and the question is whether a curious person with no interest in this topic could have got there. A word that is merely uncommon but guessable from the other three is not knowledge-gated; a word that is simply the answer if you know it, and opaque if you do not, is.',
      'An empty list is a real answer. Say it when the board is genuinely open.',
    ].join('\n'),
    data: asJsonBlock('The sixteen words on the board', words),
    outputRules: [
      'Return { "trials": [ { "submissions": [ { "words": [A,B,C,D], "relationshipGuess", "confidence" } ], "mistakes", "solved", "reasoning", "estimatedDifficulty" } ] }.',
      'Confidence is 0 to 1. Reasoning is a short summary of how you read the board, including the false trails you followed.',
      'Also return "knowledgeGated": [ { "word", "note" } ] — the words you could only place by knowing the subject. Return an empty array when the board is open to a general player; that is the answer we hope for.',
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

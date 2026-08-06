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
    // Words whose ORDER this player guessed (design.md D-9, added 2026-08-06).
    // Words, never sets — same blindness rule and same reporting shape as
    // `knowledgeGated` above, so the review page maps word → set the one way it
    // already does.
    //
    // The reason this field exists is the reason knowledgeGated's does, one
    // rung further in: a model does not experience a coin flip. Handed four
    // words with no orientation to read, it picks one and writes a fluent
    // rationale for it — so the agent whose whole job is "how does this feel to
    // play" scores a set the player loses a mistake on as a clean solve. Asking
    // it to mark the guess is the cheapest way to see what it cannot feel.
    orderGuessed: {
      type: 'array',
      items: {
        type: 'object',
        required: ['words', 'note'],
        properties: {
          words: {
            type: 'array',
            minItems: 4,
            maxItems: 4,
            items: { type: 'string', minLength: 1 },
          },
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
      '',
      // The second detector, same argument one rung further in. See the schema
      // comment: a model does not experience a coin flip, it rationalizes one.
      // Deliberately phrased in the A : B :: C : D language the rules above
      // already use. Saying "pairs" would describe the board's structure to an
      // agent that is blind to it by construction — a test enforces the silence.
      'Separately, be honest about ORDER. Writing B : A :: D : C is accepted, because both halves turned together. Writing B : A :: C : D is a mistake — you found the right four words and lost a life for reversing one half and not the other.',
      'List in "orderGuessed" every four words where you were confident about WHICH four belong together but had to guess which way round to write them. Say in one line what you had no way to settle.',
      'The test is whether the words themselves told you. "dawn : dusk :: birth : death" does — time runs one way. "Ruth : Gehrig :: Mantle : Maris" does not — nothing says which name leads, so either order reads the same and you picked one.',
      'Do not count a set where you simply thought for a moment and then knew. This is for the ones where you would have been guessing, and a different player guessing differently would have been marked wrong.',
      'An empty list is a real answer, and the one we hope for.',
    ].join('\n'),
    data: asJsonBlock('The sixteen words on the board', words),
    outputRules: [
      'Return { "trials": [ { "submissions": [ { "words": [A,B,C,D], "relationshipGuess", "confidence" } ], "mistakes", "solved", "reasoning", "estimatedDifficulty" } ] }.',
      'Confidence is 0 to 1. Reasoning is a short summary of how you read the board, including the false trails you followed.',
      'Also return "knowledgeGated": [ { "word", "note" } ] — the words you could only place by knowing the subject. Return an empty array when the board is open to a general player; that is the answer we hope for.',
      'And return "orderGuessed": [ { "words": [A,B,C,D], "note" } ] — the four-word sets whose ORDER you guessed rather than read. Empty array when every order was readable.',
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

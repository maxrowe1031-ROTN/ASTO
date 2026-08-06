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
          // WHERE the difficulty comes from, added 2026-08-05 (design.md D-8).
          // Not required, so the thirty-odd graded runs already on disk still
          // validate — but asked for on every new grade, because everything
          // downstream keys on it: 04 composes with it, the variety index
          // steers on it, and the review card shows Max how his Black is hard.
          difficultySource: { type: 'string', enum: ['arrangement', 'vocabulary', 'both'] },
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
      'Judge clarity, abstraction and misdirection. Grade each set on its own; you are not looking at a board.',
      '',
      // The 2026-08-05 finding (design.md D-8). This line used to read "judge
      // clarity, abstraction, FAMILIARITY and misdirection" — so to this agent
      // a rare word simply WAS difficulty. Combined with 04 promoting whatever
      // it ranks hardest, that made vocabulary the pipeline's only reliable
      // route to Black: coronagraph, speleothem, Paris-Roubaix. Max's verdict
      // on the resulting batch was "publishable" and "no rush".
      //
      // Familiarity still moves a grade — an unknown word is genuinely harder
      // to place. What changed is that the rater must now say so out loud,
      // because "hard" turns out to be two different things wearing one number.
      'A set can be hard in two quite different ways, and you must say WHICH in "difficultySource":',
      '  - "arrangement" — ordinary words whose placement is the puzzle. "planting : felling :: budding : withering" is four words a child knows, and it is a grade 4: the work is seeing that both pairs run start-to-end across different spans.',
      '  - "vocabulary" — a plain relationship carried by a word not everyone knows. "speleothem : stalactite" is a category and a kind within it, which is grade-1 reasoning; what makes it hard is the word.',
      '  - "both" — genuinely each.',
      'Neither is better. A board wants both kinds, and this field is how the rest of the pipeline can tell them apart — so grade honestly and label honestly rather than reaching for the answer you think is wanted.',
      'One consequence worth stating: a set whose relationship is immediate is NOT a grade 4 just because one of its words is unusual. Grade the reasoning, then name the source.',
      // The D-3 observation, handed to the rater rather than left to Max's
      // memory: an arrowless set changes what the player DOES ("hunting around
      // the board for the name of something till I found Venus"), so the kind
      // of relationship is difficulty-relevant, not decoration.
      'Each set carries a "stance" — the kind of question it asks (a cause unfolds, a possession is checked, a membership is hunted for). The stance changes what the player actually does, so weigh it: the relationship, the words and the stance together set the difficulty.',
      'Hard must never mean arbitrary. A grade-4 set still has to feel fair once revealed.',
      'If a set genuinely straddles two tiers, set "abstained": true, leave "difficulty" out, and say so in the rationale. Do not guess.',
      'Every set gets a one-line rationale.',
    ].join('\n'),
    data: asJsonBlock('Candidate sets', sets),
    // Names the wrapper and says ARRAY explicitly. The earlier wording — "one
    // entry per set, keyed by its setId" — read as an instruction to return a
    // map ({ "set-a": {...} }), which is exactly what the model produced, three
    // times, against a schema that wanted { "grades": [...] }. It obeyed the
    // prompt; the prompt was wrong.
    outputRules: [
      'Return { "grades": [ { "setId", "difficulty", "difficultySource", "rationale" } ] }.',
      '"grades" is an ARRAY with one entry per set — not an object keyed by set id.',
      '"difficultySource" is one of arrangement, vocabulary, both — required on every set you grade, and omitted only where you abstained.',
      JSON_ONLY,
    ].join(' '),
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

// A grade without its source is the state this stage was in until 2026-08-05:
// a number that means "hard" without saying which kind of hard, which is how
// vocabulary difficulty became the pipeline's only reliable route to Black.
//
// Not enforced on an abstention — there is no grade to explain the source of.
const gradedSetsNameTheirSource = (output) =>
  output.grades
    .map((grade, i) =>
      grade.abstained !== true && typeof grade.difficulty === 'number' && !grade.difficultySource
        ? {
            path: `grades[${i}].difficultySource`,
            message: 'required on a graded set — say whether the difficulty is arrangement, vocabulary or both',
          }
        : null,
    )
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
  return validateAgainst(output, SCHEMA, [
    gradedOrAbstained,
    oneGradePerSet,
    gradedSetsNameTheirSource,
  ]);
}

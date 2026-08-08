// Board Builder (GDD §12.1 #4) — assembles a 16-word board from exactly one
// set of each grade, engineering deliberate false trails without accidental
// valid solutions.
//
// Its output is a schema-v1.0 puzzle, so the game's own validatePuzzle() is
// the authority on it downstream. This module checks only what it can see
// structurally; the mechanical sweep at stage 04a is what proves uniqueness.
//
// Returns "insufficientSets" rather than shipping a compromised board.

import { JSON_ONLY, asJsonBlock, composePrompt, parseJson, renderRevision, validateAgainst } from './agent-kit.js';

export const id = 'board-builder';
export const stageId = '04-board-builder';

const SET_SCHEMA = {
  type: 'object',
  required: ['id', 'relationshipLabel', 'explanation', 'pairs', 'difficulty'],
  properties: {
    id: { type: 'string', minLength: 1 },
    relationshipLabel: { type: 'string', minLength: 1 },
    explanation: { type: 'string', minLength: 1 },
    difficulty: { type: 'integer', minimum: 1, maximum: 4 },
    pairs: {
      type: 'array',
      minItems: 2,
      maxItems: 2,
      items: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'string', minLength: 1 } },
    },
    baitTags: { type: 'array', items: { type: 'string', minLength: 1 } },
  },
};

const SCHEMA = {
  type: 'object',
  properties: {
    board: {
      type: 'object',
      required: ['id', 'title', 'sets'],
      properties: {
        id: { type: 'string', minLength: 1 },
        title: { type: 'string', minLength: 1 },
        sets: { type: 'array', minItems: 4, maxItems: 4, items: SET_SCHEMA },
      },
    },
    falseTrails: {
      type: 'array',
      items: {
        type: 'object',
        required: ['words', 'note'],
        properties: {
          words: { type: 'array', items: { type: 'string', minLength: 1 } },
          note: { type: 'string', minLength: 1 },
        },
      },
    },
    // A set labelled harder than the rater graded it. Recorded rather than
    // absorbed: the rater has never returned a 4, and the whole point of the
    // review loop is to teach it to. A promotion the Studio cannot show Max
    // is a weakness that quietly disappears.
    promotions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['setId', 'gradedDifficulty', 'assignedDifficulty'],
        properties: {
          setId: { type: 'string', minLength: 1 },
          gradedDifficulty: { type: 'integer', minimum: 1, maximum: 4 },
          assignedDifficulty: { type: 'integer', minimum: 1, maximum: 4 },
        },
      },
    },
    // Why THIS set got the Black slot, added 2026-08-05 (design.md D-8).
    //
    // The choice was always being made and never recorded, so when every Black
    // in a batch turned out to be vocabulary-hard there was no way to tell a
    // deliberate call from a pool that offered nothing else. Optional, so the
    // runs already on disk still validate.
    blackSetReasoning: { type: 'string', minLength: 1 },
    insufficientSets: { type: 'string', minLength: 1 },
  },
};

export function getOutputSchema() {
  return SCHEMA;
}

export function buildPrompt(input = {}, context) {
  const { gradedSets = [], revision = null, varyHardestStance = null } = input;
  const revising = renderRevision(revision);

  return composePrompt({
    role:
      'You are the Board Builder for ASTO. A board is sixteen words hiding four analogy sets, ' +
      'one at each difficulty 1, 2, 3 and 4.',
    context,
    task: [
      ...(revising ? [`${revising}\n`] : []),
      'Choose exactly four sets from the graded candidates and assemble a board with one set at each difficulty 1, 2, 3 and 4.',
      // The rater grades each set on its own merits and often never reaches 4.
      // Rank-and-assign rather than requiring an exact match, so a usable pool
      // is not thrown away over a label. Decided with Max, 2026-08-03.
      'The grades are the rater\'s opinion, not a constraint you must match exactly. Rank your four chosen sets from easiest to hardest and assign difficulties 1, 2, 3 and 4 in that order.',
      'This means the hardest set you have becomes difficulty 4 — the Black set — even if the rater graded it lower. Do this rather than refusing; a board with a promoted Black set is wanted.',
      '',
      // design.md D-8. Ranking by grade alone is what produced the 2026-08-05
      // batch Max called publishable and unexciting: the rater counted an
      // unfamiliar word as difficulty, so the vocabulary-hard set topped every
      // ranking and every Black became coronagraph, speleothem, Paris-Roubaix.
      //
      // Deliberately guidance and not a rule. Max's instruction was explicit —
      // "they can both be black, depending on the puzzle. I don't want to fall
      // into a repetitive hole where only one type of puzzle is one
      // difficulty." A rule reserving Black for one kind would just be the
      // opposite monoculture. Variety here is steered across boards, by the
      // brief, not legislated inside one.
      'Each graded set carries a "difficultySource": "arrangement" (ordinary words whose placement is the puzzle), "vocabulary" (a plain relationship carried by a word not everyone knows), or "both".',
      'Use it when you rank. Two sets can share a grade and be hard in completely different ways, and a board reads best when its four sets do not all get their difficulty from the same place — four vocabulary-hard sets is a quiz, four arrangement-hard sets is a board with no colour in it.',
      'Either kind may be the Black. If your pool gives you a real choice for the hardest slot, take the one that makes the board as a whole more varied rather than the one with the rarest words — but do not force it: a genuinely harder vocabulary set is the right Black when that is what the pool holds.',
      // design.md D-13. The author is steered too, but the author only decides
      // what is AVAILABLE — this stage decides what sits at 4, so a steer that
      // stopped at 01 could still be undone here. Guidance, not a rule, for the
      // same reason as everything else in this block: Max's instruction is that
      // no kind of set gets reserved to or banished from a tier.
      ...(varyHardestStance
        ? [
            `Recent boards have kept putting a ${varyHardestStance.toUpperCase()} set at difficulty 4. If this pool gives you any real choice for the hardest slot, prefer a set that asks a different kind of question — and say in "blackSetReasoning" that you did. A ${varyHardestStance} set lower on the board is perfectly good; only the top slot is the rut. If the ${varyHardestStance} set is genuinely the hardest thing here, still use it and say so rather than promoting something weaker.`,
          ]
        : []),
      'Say which you chose and why in "blackSetReasoning": one line naming the difficultySource of the set you put at 4 and what it was competing with.',
      'Record every set you labelled harder than it was graded in "promotions". A promotion the reviewer cannot see is a judgement nobody can check.',
      'Never invent a set that is not among the graded candidates. Choose and relabel; do not author.',
      'All sixteen words must be distinct. No word may appear in two sets.',
      // The gate has required four distinct labels since 2026-08-03, but the
      // builder was never told. On 2026-08-04 it was handed five candidates
      // with four distinct labels — a valid board was available — and picked
      // the duplicated pair three times running, dying at the gate. The
      // grouper now refuses to produce duplicates at all; this line means that
      // if one ever reaches here, the builder knows to choose around it.
      'Your four sets must carry four different relationships. If two candidates share a relationship label, at most one of them can be on the board — a checker enforces this immediately after you.',
      // The board composition rule from the two blind playtests (design.md
      // D-3): four sets in one stance is one trick repeated four times, and
      // Max rejected both boards built that way. The checker enforces it, so
      // like the label rule above, the builder is told rather than left to
      // discover it at the gate.
      'Your four sets must also carry four different STANCES — each candidate names its stance, the kind of question it asks. No stance may appear twice on the board; the same checker enforces this. The goal: one world, four different kinds of question about it. If a set inverts the board\'s grain (an absence among havings), it is a strong candidate for the hardest slot.',
      'Engineer deliberate false trails: words that look like they belong to another set on first read, and pull the player off the true grouping. Record each one you intended.',
      // Was: "prove no two sets could be regrouped into another valid
      // analogy". That is a combinatorial obligation over sixteen words, and
      // it was where this stage's cost went — 94% of its billed output was
      // thinking. A deterministic checker sweeps all 43,680 ordered tuples
      // milliseconds later, and with sixteen distinct words the property
      // cannot be violated anyway (design.md risk 1). Telling the model the
      // check exists is what stops it doing the work a second time.
      'A false trail should mislead on first read and never be an actual second valid solution — aim for near-misses, not genuine ambiguity.',
      'Do not try to prove the board has none, though. A checker sweeps every possible ordering immediately after you and will reject the board if one exists, so spend your attention on choosing sets that read cleanly rather than on verifying them.',
      'Write an "explanation" for every set: one sentence a player reads after solving, phrased so the answer feels fair in hindsight.',
      'Return only "insufficientSets" with a reason when there are genuinely fewer than four usable sets to choose from — not merely because the grades do not span 1 to 4.',
    ].join('\n'),
    data: asJsonBlock('Graded candidate sets', gradedSets),
    outputRules: [
      'Return { "board": { "id", "title", "sets": [ { "id", "relationshipLabel", "explanation", "pairs", "difficulty", "baitTags" } ] }, "falseTrails": [ { "words", "note" } ], "promotions": [ { "setId", "gradedDifficulty", "assignedDifficulty" } ] }.',
      'Leave "promotions" empty when every set kept the difficulty it was graded.',
      'Also return "blackSetReasoning": one line naming the difficultySource of the set you placed at difficulty 4, and what it was competing with for that slot.',
      'Each set\'s "pairs" is [[A, B], [C, D]] — order carries the meaning and is never sorted.',
      'The board carries no "words" array; the sixteen words are derived from the pairs.',
      'No set carries a "tier" field; the tier derives from "difficulty".',
      JSON_ONLY,
    ].join(' '),
  });
}

export function parse(text) {
  return parseJson(text);
}

// Either a board or a documented refusal — never neither, never both.
const boardOrRefusal = (output) => {
  const hasBoard = output.board !== undefined;
  const hasRefusal = typeof output.insufficientSets === 'string';
  if (hasBoard === hasRefusal) {
    return [
      {
        path: '',
        message: 'return exactly one of "board" or "insufficientSets"',
      },
    ];
  }
  return [];
};

const oneSetPerDifficulty = (output) => {
  if (!output.board) return [];
  const difficulties = output.board.sets.map((set) => set.difficulty);
  return new Set(difficulties).size === 4
    ? []
    : [{ path: 'board.sets', message: 'each difficulty 1–4 must appear exactly once' }];
};

const sixteenDistinctWords = (output) => {
  if (!output.board) return [];
  const words = output.board.sets.flatMap((set) => set.pairs.flat());
  if (words.length !== 16) {
    return [{ path: 'board.sets', message: `a board needs sixteen words; found ${words.length}` }];
  }
  const lowered = words.map((w) => w.trim().toLowerCase());
  const repeated = [...new Set(lowered.filter((w, i) => lowered.indexOf(w) !== i))];
  return repeated.length === 0
    ? []
    : [{ path: 'board.sets', message: `board words must be distinct; repeated: ${repeated.join(', ')}` }];
};

const uniqueSetIds = (output) => {
  if (!output.board) return [];
  const ids = output.board.sets.map((set) => set.id);
  return new Set(ids).size === ids.length
    ? []
    : [{ path: 'board.sets', message: 'set ids must be unique within a board' }];
};

// A promotion is a claim about the board, so it has to be checkable against
// it. Both halves matter: a promotion naming an absent set is a bookkeeping
// error, and one claiming no change is a promotion that did not happen —
// either way the record the reviewer reads would be wrong.
const promotionsMatchTheBoard = (output) => {
  const promotions = output.promotions ?? [];
  if (promotions.length === 0) return [];
  const setIds = new Set((output.board?.sets ?? []).map((set) => set.id));

  return promotions
    .map((promotion, i) => {
      if (!setIds.has(promotion.setId)) {
        return {
          path: `promotions[${i}].setId`,
          message: `"${promotion.setId}" is not in the board it claims to promote`,
        };
      }
      if (promotion.assignedDifficulty <= promotion.gradedDifficulty) {
        return {
          path: `promotions[${i}]`,
          message: 'a promotion must assign a higher difficulty than the one graded',
        };
      }
      return null;
    })
    .filter(Boolean);
};

export function validateOutput(output) {
  return validateAgainst(output, SCHEMA, [
    boardOrRefusal,
    oneSetPerDifficulty,
    sixteenDistinctWords,
    uniqueSetIds,
    promotionsMatchTheBoard,
  ]);
}

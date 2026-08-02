// Board Builder (GDD §12.1 #4) — assembles a 16-word board from exactly one
// set of each grade, engineering deliberate false trails without accidental
// valid solutions.
//
// Its output is a schema-v1.0 puzzle, so the game's own validatePuzzle() is
// the authority on it downstream. This module checks only what it can see
// structurally; the mechanical sweep at stage 04a is what proves uniqueness.
//
// Returns "insufficientSets" rather than shipping a compromised board.

import { JSON_ONLY, asJsonBlock, composePrompt, parseJson, validateAgainst } from './agent-kit.js';

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
    insufficientSets: { type: 'string', minLength: 1 },
  },
};

export function getOutputSchema() {
  return SCHEMA;
}

export function buildPrompt(input = {}, context) {
  const { gradedSets = [] } = input;

  return composePrompt({
    role:
      'You are the Board Builder for ASTO. A board is sixteen words hiding four analogy sets, ' +
      'one at each difficulty 1, 2, 3 and 4.',
    context,
    task: [
      'Choose exactly four sets from the graded candidates — one of each difficulty — and assemble a board.',
      'All sixteen words must be distinct. No word may appear in two sets.',
      'Engineer deliberate false trails: words that look like they belong to another set on first read, and pull the player off the true grouping. Record each one you intended.',
      'A false trail must never be an actual second valid solution. If two sets could legitimately be regrouped into a different valid analogy, the board is broken — pick different sets.',
      'Write an "explanation" for every set: one sentence a player reads after solving, phrased so the answer feels fair in hindsight.',
      'If the candidates do not contain one usable set at each difficulty, do not compromise. Return only "insufficientSets" with a reason.',
    ].join('\n'),
    data: asJsonBlock('Graded candidate sets', gradedSets),
    outputRules: [
      'Return { "board": { "id", "title", "sets": [ { "id", "relationshipLabel", "explanation", "pairs", "difficulty", "baitTags" } ] }, "falseTrails": [...] }.',
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

export function validateOutput(output) {
  return validateAgainst(output, SCHEMA, [
    boardOrRefusal,
    oneSetPerDifficulty,
    sixteenDistinctWords,
    uniqueSetIds,
  ]);
}

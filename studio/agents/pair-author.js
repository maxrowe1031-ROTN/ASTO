// Pair Author (GDD §12.1 #1) — authors candidate analogy pairs with precise
// relationship labels from the editor's brief. One job: author strong pairs.
//
// Stops at the requested count and flags a shortfall rather than padding with
// weak pairs — the GDD's "done" condition, made a semantic check.
//
// Since 2026-08-04 (design.md D-3) every pair declares a shape from the
// controlled vocabulary, and the brief carries stance quotas: a board wants
// four different kinds of question, and this is the stage that CREATES, so the
// requirement lands here first — a floor downstream can only reject what this
// stage failed to author.

import { JSON_ONLY, composePrompt, parseJson, validateAgainst } from './agent-kit.js';
import { SHAPE_IDS, renderVocabulary, stanceOf } from '../corpus/vocabulary.js';

export const id = 'pair-author';
export const stageId = '01-pair-author';

const SCHEMA = {
  type: 'object',
  required: ['pairs'],
  properties: {
    pairs: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['a', 'b', 'relationshipLabel', 'shape'],
        properties: {
          a: { type: 'string', minLength: 1 },
          b: { type: 'string', minLength: 1 },
          relationshipLabel: { type: 'string', minLength: 1 },
          shape: { type: 'string', enum: [...SHAPE_IDS] },
        },
      },
    },
    shortfall: { type: 'string' },
  },
};

export function getOutputSchema() {
  return SCHEMA;
}

export function buildPrompt(input = {}, context) {
  const { brief = {}, theme = null } = input;
  const { relationshipShapes = [], count = 8, avoidShapes = [], stanceQuotas = [] } = brief;

  return composePrompt({
    role:
      'You are the Pair Author for ASTO, a word puzzle built on analogies of the form A : B :: C : D. ' +
      'You author candidate pairs — two words in a specific order — each carrying one precise relationship label. ' +
      'The goal of a finished board: the theme unifies the words, the relationships diversify the questions. ' +
      'Sixteen words that feel like one world; four sets that feel like four different kinds of question about it.',
    context,
    task: [
      `Author ${count} candidate pairs.`,
      theme ? `Theme to work within: ${theme}.` : 'No theme is imposed; choose freely.',
      stanceQuotas.length > 0
        ? `Spread the pairs across these stances — different kinds of question — with at least two pairs in each: ${stanceQuotas.join(', ')}. ` +
          'A pair that fits its stance but breaks the theme\'s world is a bad pair; stay inside the theme and vary the stance, not the register.'
        : '',
      relationshipShapes.length > 0
        ? `Favour these relationship shapes, which are underused in the library so far: ${relationshipShapes.join(', ')}.`
        : '',
      avoidShapes.length > 0
        ? `Avoid these shapes — recent boards have leaned on them: ${avoidShapes.join(', ')}.`
        : '',
      'The order of a pair must matter: A : B should not read the same as B : A. A pair whose direction is reversible is a weak pair.',
      'Prefer familiar words. The challenge is the relationship, never the vocabulary.',
      `If you cannot reach ${count} pairs at this quality, return fewer and explain in "shortfall". Never pad with weak pairs.`,
    ]
      .filter(Boolean)
      .join('\n'),
    data: renderVocabulary(),
    outputRules: [
      'Return { "pairs": [ ... ] }, optionally with "shortfall".',
      'Each pair is { "a", "b", "relationshipLabel", "shape" }, where "relationshipLabel" states the relation precisely',
      '(for example "small origin becomes larger result") and "shape" is an id from the vocabulary above (for example "conversion").',
      JSON_ONLY,
    ].join(' '),
  });
}

export function parse(text) {
  return parseJson(text);
}

const noReversedDuplicates = (output) => {
  const seen = new Map();
  const errors = [];
  output.pairs.forEach((pair, i) => {
    const key = [pair.a, pair.b].map((w) => w.toLowerCase()).sort().join('|');
    if (seen.has(key)) {
      errors.push({
        path: `pairs[${i}]`,
        message: `duplicates pairs[${seen.get(key)}] (same two words, either order)`,
      });
    } else {
      seen.set(key, i);
    }
  });
  return errors;
};

const noSelfPairs = (output) =>
  output.pairs
    .map((pair, i) =>
      pair.a.trim().toLowerCase() === pair.b.trim().toLowerCase()
        ? { path: `pairs[${i}]`, message: 'a and b are the same word' }
        : null,
    )
    .filter(Boolean);

// A board is four sets of four DIFFERENT stances (design.md D-3), and this is
// the only stage that creates — a pool spanning three stances leaves the
// grouper mathematically unable to compose a board, discovered two stages and
// real money later. Checked here, the retry has the vocabulary in front of it.
//
// Four distinct stances among the pairs, not per the quotas specifically: an
// author who reached for `dimension` or `reference` unprompted has still
// diversified the pool, and the quota list is not in scope here anyway
// (validateOutput never sees the brief — deliberately, so a fixture and a live
// reply are judged identically).
const MIN_STANCES = 4;

const spansEnoughStances = (output) => {
  const stances = new Set(output.pairs.map((pair) => stanceOf(pair.shape)).filter(Boolean));
  return stances.size >= MIN_STANCES
    ? []
    : [
        {
          path: 'pairs',
          message:
            `the pairs span only ${stances.size} stance(s) (${[...stances].sort().join(', ') || 'none'}); ` +
            `a board needs four different kinds of question, so author pairs in at least ${MIN_STANCES} stances`,
        },
      ];
};

export function validateOutput(output) {
  return validateAgainst(output, SCHEMA, [noReversedDuplicates, noSelfPairs, spansEnoughStances]);
}

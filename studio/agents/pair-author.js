// Pair Author (GDD §12.1 #1) — authors candidate analogy pairs with precise
// relationship labels from the editor's brief. One job: author strong pairs.
//
// Stops at the requested count and flags a shortfall rather than padding with
// weak pairs — the GDD's "done" condition, made a semantic check.

import { JSON_ONLY, composePrompt, parseJson, validateAgainst } from './agent-kit.js';

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
          shape: { type: 'string', minLength: 1 },
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
  const { relationshipShapes = [], count = 8, avoidShapes = [] } = brief;

  return composePrompt({
    role:
      'You are the Pair Author for ASTO, a word puzzle built on analogies of the form A : B :: C : D. ' +
      'You author candidate pairs — two words in a specific order — each carrying one precise relationship label.',
    context,
    task: [
      `Author ${count} candidate pairs.`,
      theme ? `Theme to work within: ${theme}.` : 'No theme is imposed; choose freely.',
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
    outputRules: [
      'Each pair is { "a", "b", "relationshipLabel", "shape" }, where "relationshipLabel" states the relation precisely',
      '(for example "small origin becomes larger result") and "shape" is its general family (for example "transformation").',
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

export function validateOutput(output) {
  return validateAgainst(output, SCHEMA, [noReversedDuplicates, noSelfPairs]);
}

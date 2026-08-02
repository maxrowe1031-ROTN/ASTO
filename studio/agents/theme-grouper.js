// Theme Grouper (GDD §12.1 #2) — clusters the candidate pool into coherent
// candidate sets. An ASTO set is exactly two pairs that share one relationship,
// so this agent's whole job is finding those couplings.
//
// It sets pairs aside explicitly rather than inventing a theme to force a
// grouping — the GDD's stop condition.

import { JSON_ONLY, asJsonBlock, composePrompt, parseJson, validateAgainst } from './agent-kit.js';

export const id = 'theme-grouper';
export const stageId = '02-theme-grouper';

const SCHEMA = {
  type: 'object',
  required: ['sets'],
  properties: {
    sets: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'relationshipLabel', 'shape', 'pairs'],
        properties: {
          id: { type: 'string', minLength: 1 },
          relationshipLabel: { type: 'string', minLength: 1 },
          shape: { type: 'string', minLength: 1 },
          pairs: {
            type: 'array',
            minItems: 2,
            maxItems: 2,
            items: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'string', minLength: 1 } },
          },
        },
      },
    },
    setAside: {
      type: 'array',
      items: {
        type: 'object',
        required: ['pair', 'reason'],
        properties: {
          pair: { type: 'array', items: { type: 'string' } },
          reason: { type: 'string', minLength: 1 },
        },
      },
    },
  },
};

export function getOutputSchema() {
  return SCHEMA;
}

export function buildPrompt(input = {}, context) {
  const { pairs = [] } = input;

  return composePrompt({
    role:
      'You are the Theme Grouper for ASTO. A puzzle set is exactly two pairs that share one relationship, ' +
      'read as A : B :: C : D. Your job is to find which candidate pairs belong together.',
    context,
    task: [
      'Cluster the candidate pairs into sets of exactly two pairs each.',
      'Both pairs in a set must share the same relationship in the same direction. If the second pair reverses the relation, they do not belong together.',
      'Give each set one relationship label that is true of both pairs, and a general shape family.',
      'Aim to surface at least four sets so the Board Builder has a choice.',
      'Any pair that does not belong in a coherent set goes in "setAside" with a reason. Never invent a theme to force a grouping.',
    ].join('\n'),
    data: asJsonBlock('Candidate pairs', pairs),
    outputRules: `Set ids must be unique, lowercase, hyphenated (for example "set-growth"). ${JSON_ONLY}`,
  });
}

export function parse(text) {
  return parseJson(text);
}

const uniqueSetIds = (output) => {
  const seen = new Set();
  return output.sets
    .map((set, i) => {
      if (seen.has(set.id)) return { path: `sets[${i}].id`, message: `duplicate set id "${set.id}"` };
      seen.add(set.id);
      return null;
    })
    .filter(Boolean);
};

const fourDistinctWordsPerSet = (output) =>
  output.sets
    .map((set, i) => {
      const words = set.pairs.flat().map((w) => w.trim().toLowerCase());
      return new Set(words).size === 4
        ? null
        : { path: `sets[${i}].pairs`, message: 'a set must use four distinct words' };
    })
    .filter(Boolean);

export function validateOutput(output) {
  return validateAgainst(output, SCHEMA, [uniqueSetIds, fourDistinctWordsPerSet]);
}

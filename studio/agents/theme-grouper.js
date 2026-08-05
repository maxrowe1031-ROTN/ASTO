// Theme Grouper (GDD §12.1 #2) — clusters the candidate pool into coherent
// candidate sets. An ASTO set is exactly two pairs that share one relationship,
// so this agent's whole job is finding those couplings.
//
// It sets pairs aside explicitly rather than inventing a theme to force a
// grouping — the GDD's stop condition.

import { JSON_ONLY, asJsonBlock, composePrompt, parseJson, validateAgainst } from './agent-kit.js';
import { SHAPE_IDS, renderVocabulary, stanceOf } from '../corpus/vocabulary.js';

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
          shape: { type: 'string', enum: [...SHAPE_IDS] },
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
      'read as A : B :: C : D. Your job is to find which candidate pairs belong together. ' +
      'The goal of a finished board: the theme unifies the words, the relationships diversify the questions — ' +
      'four sets that feel like four different kinds of question about one world.',
    context,
    task: [
      'Cluster the candidate pairs into sets of exactly two pairs each.',
      'Both pairs in a set must share the same relationship in the same direction. If the second pair reverses the relation, they do not belong together.',
      'Give each set one relationship label that is true of both pairs, and its shape id from the vocabulary below.',
      'Every set you return must carry a DIFFERENT relationship. Two sets with the same label are the same relationship found twice — they leave the Board Builder with fewer real choices than it needs.',
      'Your sets must span at least four different STANCES — the vocabulary names each shape\'s stance. Four sets in one stance are four flavours of the same question, and a checker will refuse the pool.',
      'You must surface at least four sets — a board is exactly four, and the Board Builder cannot invent one you did not find. Five or six is better, so it has a choice.',
      'Any pair that does not belong in a coherent set goes in "setAside" with a reason. Never invent a theme to force a grouping.',
    ].join('\n'),
    data: [renderVocabulary(), asJsonBlock('Candidate pairs', pairs)].join('\n\n'),
    outputRules: [
      'Return { "sets": [ { "id", "relationshipLabel", "shape", "pairs" } ] }, optionally with "setAside".',
      // The candidate pairs arrive as {a, b} objects and must go back out as
      // two-item arrays. Saying so is not pedantry: a real run returned
      // objects for every pair, because the shape it was shown was the shape
      // it copied.
      'Each set\'s "pairs" is exactly two pairs, and every pair is a two-item array of strings: "pairs": [["Seed", "Tree"], ["Spark", "Fire"]].',
      'The candidate pairs above are given to you as objects with "a" and "b" keys. Do not copy that shape into your reply — convert each one to a two-item array.',
      'Each "setAside" entry is { "pair": ["Seed", "Tree"], "reason": "..." }, with the same two-item array.',
      'Set ids must be unique, lowercase, hyphenated (for example "set-growth").',
      JSON_ONLY,
    ].join(' '),
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

// The Board Builder needs four sets and cannot invent a fifth candidate, so a
// short pool is fatal — but only downstream, where the only available retry is
// a re-roll against the same pairs. Caught here instead, a retry is worth
// making: the model still has its own setAside list to reconsider.
const MIN_SETS = 4;

const enoughSetsToBuildABoard = (output) =>
  output.sets.length >= MIN_SETS
    ? []
    : [
        {
          path: 'sets',
          message: `only ${output.sets.length} set(s); a board needs ${MIN_SETS}. Re-read the pairs you set aside — if two of them share a relationship, they are a set.`,
        },
      ];

// Two candidate sets carrying the same relationship label are the same
// relationship found twice, not two choices. They eat a slot in the pool the
// Board Builder needs, and the 04a gate requires four DISTINCT labels across
// the finished board — so a duplicate here can only be discovered three stages
// later, where the retry is a re-roll against an unchanged pool.
//
// That is exactly what happened on 2026-08-04: an astronomy run returned five
// sets, two of them labelled "a bounded region of space contains a population
// of smaller bodies" word for word. Four distinct labels existed, so a valid
// board was available — the builder picked both duplicates three times running
// and the run died at the gate having spent $0.28.
//
// Compared byte-for-byte after normalising case and whitespace. Two labels
// that merely MEAN the same thing are a judgement call, and this is not the
// place to make it — the gate's own check is textual too, so anything stricter
// here would reject boards the gate would have passed.
const distinctRelationshipLabels = (output) => {
  const seen = new Map();
  return output.sets
    .map((set, i) => {
      const key = String(set.relationshipLabel).trim().toLowerCase().replace(/\s+/g, ' ');
      const first = seen.get(key);
      if (first === undefined) {
        seen.set(key, i);
        return null;
      }
      return {
        path: `sets[${i}].relationshipLabel`,
        message:
          `sets[${first}] already uses this relationship word for word: "${set.relationshipLabel}". ` +
          'Every candidate set must offer a different relationship. Either find a distinct ' +
          'relationship these two pairs share, or set one of them aside.',
      };
    })
    .filter(Boolean);
};

// The stance floor (design.md D-3). The 04a gate requires four distinct
// stances on the finished board; a pool that cannot supply them is fatal
// there, where the only retry is a re-roll against the same pairs — the exact
// shape of the cars-run failure (a constraint enforced at one stage and not
// the next one downstream). Caught here, the retry has the setAside list and
// the vocabulary to work with.
const MIN_STANCES = 4;

const enoughStancesToBuildABoard = (output) => {
  const stances = new Set(output.sets.map((set) => stanceOf(set.shape)).filter(Boolean));
  return stances.size >= MIN_STANCES
    ? []
    : [
        {
          path: 'sets',
          message:
            `the sets span only ${stances.size} stance(s) (${[...stances].sort().join(', ') || 'none'}); ` +
            `a board needs four different kinds of question, so the pool must span at least ${MIN_STANCES} stances. ` +
            'Re-read the pairs you set aside — a pair in an unused stance may be half of the set you are missing.',
        },
      ];
};

export function validateOutput(output) {
  return validateAgainst(output, SCHEMA, [
    uniqueSetIds,
    fourDistinctWordsPerSet,
    enoughSetsToBuildABoard,
    distinctRelationshipLabels,
    enoughStancesToBuildABoard,
  ]);
}

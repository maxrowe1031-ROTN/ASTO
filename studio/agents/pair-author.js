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

import { JSON_ONLY, composePrompt, parseJson, renderRevision, validateAgainst } from './agent-kit.js';
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
  const { brief = {}, theme = null, revision = null } = input;
  const { relationshipShapes = [], count = 8, avoidShapes = [], stanceQuotas = [], varyHardestFrom = null } = brief;
  // Leads the task, because a revision changes what the whole rest of the
  // instruction means: "author N pairs" reads as "author a fresh pool" unless
  // the model has already been told it is repairing an existing board.
  const revising = renderRevision(revision);

  return composePrompt({
    role:
      'You are the Pair Author for ASTO, a word puzzle built on analogies of the form A : B :: C : D. ' +
      'You author candidate pairs — two words in a specific order — each carrying one precise relationship label. ' +
      'The goal of a finished board: the theme unifies the words, the relationships diversify the questions. ' +
      'Sixteen words that feel like one world; four sets that feel like four different kinds of question about it. ' +
      'Unity is the floor, not the goal — a board can be perfectly unified and completely lifeless. ' +
      'The board should make someone who cares about the subject feel recognised.',
    context,
    task: [
      ...(revising ? [`${revising}\n`] : []),
      `Author ${count} candidate pairs.`,
      // The theme instruction used to read "Theme to work within: X", which
      // asks only that words stay inside a boundary — and the safest place
      // inside a boundary is the middle. That is what produced the 2026-08-05
      // batch: childhood as toy, game, caregiver, child, infant, kid. Every
      // one of them is on theme, and Max's verdict was "the MOST BASIC terms
      // relating to childhood, slapped on the page". See design.md D-7.
      theme
        ? [
            `Theme: ${theme}. Do not merely stay inside it — evoke it.`,
            'Reach for the most specific word that your reader will still recognise: the word someone who actually loves this subject would reach for. "Stealie", not "Steal Your Face logo". "Woodshop", not "workshop". "Cygnet", not "baby swan".',
            'A too-general word is not the safe choice. It fails three ways at once:',
            "  - it is boring — a board of a subject's most obvious nouns tells the player nothing they did not already know;",
            '  - it stops being TRUE — every toolbox holds a wrench, but not every crew holds a mason, and not every workshop is for woodworking. Generality is where "necessarily" quietly becomes "sometimes";',
            '  - it reads as vague rather than simple — a word that points at nothing concrete gives the player nothing to grip.',
            'The opposite failure is real but rarer: a word nobody outside the subject could know is not specific, it is obscure. The test is recognition, not fame.',
          ].join('\n')
        : 'No theme is imposed; choose freely.',
      // Author in matched twos, not just spread across stances. A SET is two
      // pairs sharing ONE relationship, and a stance is a category of
      // relationships, not a relationship — so a pool can satisfy a stance
      // quota completely and still be ungroupable. That is what killed the
      // `paris` run: four stances, but eleven shapes used exactly once, so
      // nothing could pair up and the grouper searched until it truncated.
      'Author your pairs in MATCHED TWOS. Every relationship you use must be carried by at least two pairs, because a puzzle set is exactly two pairs sharing one relationship — a lone pair no other pair matches cannot become a set, however good it is.',
      stanceQuotas.length > 0
        ? `You need at least four such matched groups, and they must span these four stances — different kinds of question: ${stanceQuotas.join(', ')}. ` +
          'So: pick a relationship, author two pairs that share it, and repeat until you have at least one matched group in each stance. ' +
          'A pair that fits its stance but breaks the theme\'s world is a bad pair; stay inside the theme and vary the stance, not the register.'
        : 'You need at least four matched groups, spanning at least four different stances.',
      relationshipShapes.length > 0
        ? `Favour these relationship shapes, which are underused in the library so far: ${relationshipShapes.join(', ')}.`
        : '',
      avoidShapes.length > 0
        ? `Avoid these shapes — recent boards have leaned on them: ${avoidShapes.join(', ')}.`
        : '',
      // Set only when the last three boards all reached their hardest set the
      // same way (design.md D-8). A nudge, not a quota: Max's rule is that
      // either kind may top a board and that no kind gets reserved to a tier —
      // so this fires on a RUT and is silent otherwise.
      varyHardestFrom === 'vocabulary'
        ? 'The last few boards all got their hardest set from an unusual WORD. Make sure this pool can reach its top tier through arrangement instead — ordinary words that have to be seen a particular way.'
        : varyHardestFrom === 'arrangement'
          ? 'The last few boards all got their hardest set from ARRANGEMENT. This pool may reach its top tier through a word that belongs to the subject instead, if the theme offers one worth knowing.'
          : '',
      'The order of a pair must matter: A : B should not read the same as B : A. A pair whose direction is reversible is a weak pair.',
      // design.md D-12, from Max's own reading of the boards. A pair that
      // shares visible text couples itself on sight — the player matches the
      // words the way you match two socks, and the relationship the set is
      // built on is never read. One such pair is a foothold; two make the set
      // free, and the analogy might as well not be there.
      'Watch for pairs that match themselves on sight: two words sharing visible text ("fade in : fade out", "load-in : load-out", "wrap : unwrap") get coupled by looking rather than by understanding. At most ONE such pair per matched group, never both — a group of two self-matching pairs solves itself. And the group you make hard through ARRANGEMENT must not contain one at all.',
      '',
      // design.md D-8. The sentence removed from the theme block above said a
      // hard set "may ask for the word an enthusiast knows" — one route up, and
      // the pipeline took it every time. The 2026-08-05 batch reached Black
      // through coronagraph, speleothem and Paris-Roubaix, and Max's verdict
      // was "publishable" and "no rush", twice handing the delight to a
      // hypothetical expert: "someone with cycling knowledge would probably be
      // stoked".
      //
      // Both routes are wanted. What was missing is the first one.
      'TWO KINDS OF HARD. A set can be difficult in two quite different ways, and you have both available:',
      '  - ARRANGEMENT — ordinary words whose placement is the puzzle. "planting : felling :: budding : withering" is four words a child knows, and it is one of the hardest sets ever written for this game: the work is seeing that both pairs run start-to-end across different spans. Opposites facing each other, a shift of scale, a reversal, a pair that runs the other way.',
      '  - VOCABULARY — a plain relationship carried by a word that belongs to the subject. "constellation : Cassiopeia" is a category and one of its members; the pleasure is the word. This is where a theme gets its colour, and it is not a lesser kind of set.',
      'Neither is better and a good board wants both. But arrangement difficulty is the one that gets lost, so: at least one of your matched groups must be hard through its ARRANGEMENT ALONE — every word in it ordinary, the difficulty entirely in how the four sit together. Do not mark it, and do not assume it will be the hardest set on the board; that is decided downstream. Just make sure the board could reach its top tier without reaching for a rarer word.',
      // This line used to read "Prefer familiar words", full stop — which a
      // model reasonably hears as "prefer common words", and common is exactly
      // the generic middle the instruction above is trying to leave. Familiar
      // is about RECOGNITION, not frequency, and the two come apart precisely
      // where the interesting words live.
      'The challenge must be the relationship, never the vocabulary — so a word has to be recognisable. Recognisable is not the same as commonplace: prefer the vivid, specific word your reader will still know over the flat, general one they would never have to think about.',
      `If you cannot reach ${count} pairs at this quality, return fewer and explain in "shortfall". Never pad with weak pairs.`,
    ]
      .filter(Boolean)
      .join('\n'),
    data: renderVocabulary(),
    outputRules: [
      'Return { "pairs": [ ... ] }, optionally with "shortfall".',
      'Each pair is { "a", "b", "relationshipLabel", "shape" }, where "relationshipLabel" states the relation precisely',
      '(for example "small origin becomes larger result") and "shape" is an id from the vocabulary above (for example "conversion").',
      'Pairs meant to form a set together carry the SAME "shape" — that is how the grouper finds them.',
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

// A board is four sets, each two pairs sharing ONE relationship, spanning four
// different stances (design.md D-3). This is the only stage that creates, so
// the pool has to be groupable before it leaves — and "groupable" is a
// stronger property than "spans four stances", which is what this check used
// to test.
//
// The distinction cost a real run. On 2026-08-05 the `paris` pool spanned all
// four quota'd stances and passed the old check, but used ELEVEN shapes
// exactly once each: no two pairs shared a relationship, so no set could form
// without the grouper searching for pairs to force together. It thought past
// 24,000 tokens and truncated. Measured across three runs, the correlation is
// monotonic and explosive — groupable shapes 7 / 3 / 1 gave grouping times of
// 18s / 129s / truncation.
//
// So the requirement is counted on MATCHED shapes: at least four relationships
// carried by two or more pairs, and those four must span four stances. Anything
// less is a pool that cannot become a board, caught here where a retry costs
// one cheap stage instead of dying two stages downstream.
const MIN_SETS = 4;
const MIN_STANCES = 4;

const poolCanBecomeABoard = (output) => {
  const byShape = new Map();
  for (const pair of output.pairs) {
    byShape.set(pair.shape, (byShape.get(pair.shape) ?? 0) + 1);
  }

  const matched = [...byShape.entries()].filter(([, count]) => count >= 2).map(([shape]) => shape);
  const orphans = [...byShape.entries()].filter(([, count]) => count < 2).map(([shape]) => shape);
  const stances = new Set(matched.map((shape) => stanceOf(shape)).filter(Boolean));

  if (matched.length >= MIN_SETS && stances.size >= MIN_STANCES) return [];

  // The feedback names both numbers and the orphans, because a retry told only
  // "not groupable" is a re-roll. An orphaned relationship is one partner pair
  // away from being a set, which is the cheapest thing the model can fix.
  return [
    {
      path: 'pairs',
      message:
        `only ${matched.length} relationship(s) are carried by two or more pairs, spanning ${stances.size} stance(s) — ` +
        `a board needs ${MIN_SETS} sets across ${MIN_STANCES} stances, and a set is two pairs sharing ONE relationship. ` +
        (orphans.length > 0
          ? `These shapes have just one pair and cannot become a set: ${orphans.join(', ')}. ` +
            'Give each one a partner pair sharing the same relationship, or replace it with a pair that partners something you already have.'
          : 'Author more pairs so each relationship you use is carried by two of them.'),
    },
  ];
};

export function validateOutput(output) {
  return validateAgainst(output, SCHEMA, [noReversedDuplicates, noSelfPairs, poolCanBecomeABoard]);
}

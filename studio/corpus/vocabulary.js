// vocabulary.js — loads the controlled relationship vocabulary.
//
// Small on purpose, like rules.js beside it: the interesting part is the
// discipline, not the loading. Every shape an agent may declare lives in
// relationship-index.json with its taxonomy provenance, its family (the
// library-coverage axis), its stance (the board-composition axis), a paradigm
// pair, and a named failure mode for the review card. This module is the one
// place that file is read, so the pipeline, the agents and the variety brief
// all agree on what a shape is.
//
// A JSON import rather than node:fs, deliberately: the review page teaches
// each set's stance on its card, so this module must resolve identically
// under node (agents, tests) and in the browser (board-html.js), the same
// dual life the engine modules already lead.

import vocabulary from './relationship-index.json' with { type: 'json' };

/** Every declarable shape, frozen: { id, taxonomy, family, familyName, stance, elements, paradigm, description, failureMode }. */
export const SHAPES = Object.freeze(vocabulary.shapes.map((shape) => Object.freeze(shape)));

/** The seven stances: { id, description }. */
export const STANCES = Object.freeze(vocabulary.stances.map((stance) => Object.freeze(stance)));

/**
 * The stances reachable from four or more families. The composition rule
 * requires four distinct stances drawn from these five — `reference` reaches
 * exactly one family and `dimension` three, so requiring either would make
 * specific families mandatory for every board.
 */
export const PORTABLE_STANCES = Object.freeze([...vocabulary.portableStances]);

/**
 * Shapes whose difficulty can be bought with a rarer word.
 *
 * All three are `inclusion`, which is why they are so common: `inclusion` has
 * been in the stance quota on every run ever, and naming something is the
 * obvious way to satisfy it — 8 of the 9 boards before 2026-08-05 carried
 * exactly one. The relationship in each is immediate (a category and a member
 * of it), so the only lever left for making one HARDER is picking a name fewer
 * people know: `speleothem : stalactite`, `Monument : Paris-Roubaix`.
 *
 * This is the fallback classifier for boards graded before 03 started
 * reporting `difficultySource` (design.md D-8). It is not a blocklist — Max was
 * explicit that either kind of set may be the Black, and `constellation :
 * Cassiopeia` earned all four of his praise tags at green.
 */
export const NAMEABLE_SHAPES = Object.freeze(['taxonomic', 'class-individual', 'synonymity']);

const nameable = new Set(NAMEABLE_SHAPES);

/** Could this shape's difficulty come from the word rather than the relation? */
export const isNameable = (value) => nameable.has(resolveShape(value)?.id);

/**
 * Shapes whose A→B relation IS their B→A relation, so a player cannot read the
 * intended orientation off the words (design.md D-9).
 *
 * Why this is a fairness question rather than a difficulty one. The engine
 * accepts four orders — [A,B,C,D] [C,D,A,B] [B,A,D,C] [D,C,B,A] — so flipping
 * BOTH pairs is fine and flipping ONE is a mistake. For `dawn : dusk :: birth :
 * death` that costs nothing: the arrow of time tells you which end leads, and
 * you mirror it without thinking. For `Ruth : Gehrig :: Mantle : Maris` there
 * is no arrow, so the player must guess the author's orientation and then match
 * it in the other pair. Guess wrong and it is "So close!" — a mistake charged
 * for knowing the answer.
 *
 * That set cost Max all four mistakes on the Yankees board (2026-08-06): every
 * one of them was so-close, and he never once grouped the wrong four words.
 *
 * NOT a blocklist, and deliberately not fed to the authoring stages. A
 * symmetric shape whose words carry a convention — `north : south :: east :
 * west` — is perfectly fair, and the pipeline cannot tell those apart by shape
 * alone. This list says "look here"; 06 says whether the words rescue it.
 */
export const SYMMETRIC_SHAPES = Object.freeze(
  vocabulary.shapes.filter((shape) => shape.symmetric === true).map((shape) => shape.id),
);

const symmetric = new Set(SYMMETRIC_SHAPES);

/** Could a player read this shape's intended orientation off the words? */
export const isSymmetric = (value) => symmetric.has(resolveShape(value)?.id);

/** The one-line reason a shape is symmetric, for the review card; null if it isn't. */
export const symmetricNote = (value) =>
  isSymmetric(value) ? (resolveShape(value)?.symmetricNote ?? null) : null;

const byId = new Map(SHAPES.map((shape) => [shape.id, shape]));
const aliases = new Map(Object.entries(vocabulary.legacyAliases ?? {}));

export const SHAPE_IDS = Object.freeze(SHAPES.map((shape) => shape.id));

/** The shape entry for an id, or null. Does not follow aliases. */
export const shapeById = (id) => byId.get(id) ?? null;

/**
 * Resolves a declared shape string to a current vocabulary entry, following
 * the legacy aliases so boards authored under the retired 13-shape list stay
 * countable. Returns null for free text and for retired ids with no successor
 * — the caller decides what unknown means (variety.js counts it; a validator
 * rejects it).
 */
export function resolveShape(value) {
  if (typeof value !== 'string') return null;
  const id = value.trim().toLowerCase();
  if (byId.has(id)) return byId.get(id);
  const aliased = aliases.get(id);
  return aliased ? (byId.get(aliased) ?? null) : null;
}

/** The stance id a declared shape carries, following aliases; null if unknown. */
export const stanceOf = (value) => resolveShape(value)?.stance ?? null;

/** The family number a declared shape carries, following aliases; null if unknown. */
export const familyOf = (value) => resolveShape(value)?.family ?? null;

/**
 * The vocabulary rendered for a prompt: one line per shape, with its stance
 * and paradigm pair. A shape name without its example is the loose ask that
 * produced a monoculture — the paradigm is the teaching, not decoration.
 */
export function renderVocabulary(shapes = SHAPES) {
  return [
    'The controlled shape vocabulary. Every pair\'s "shape" must be one of these ids:',
    ...shapes.map(
      (shape) =>
        `- ${shape.id} (stance: ${shape.stance}) — ${shape.description}; like ${shape.paradigm}`,
    ),
  ].join('\n');
}

/** Hand labels for boards that shipped before agents declared shapes. */
export const SHIPPED_LABELS = Object.freeze(vocabulary.shippedLabels ?? {});

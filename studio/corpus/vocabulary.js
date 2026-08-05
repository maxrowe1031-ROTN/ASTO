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

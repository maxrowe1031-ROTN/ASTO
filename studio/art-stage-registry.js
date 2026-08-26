// Art stage registry (design.md D-31) — the single source of the art
// pipeline's stage IDs and order, exactly as stage-registry.js is for boards.
// Everything downstream — art run directories, resume, re-entry — derives from
// this list. Pure: imports nothing, touches nothing.
//
// This is a SIBLING registry, not an extension of STAGES. The board pipeline's
// list stays untouched because the two pipelines share a law but not a
// lifecycle: a board run and an art run start, fail, and resume independently.
//
// Also the home of the pipeline's shared vocabulary. ART_STATES and BAND live
// here rather than in an agent so the store, the 02a gate, and the render
// transport agree on names and numbers without any of them importing an agent
// — an agent import from a storage module would point the wrong way through
// the boundary law.

const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
};

export const ART_STAGES = deepFreeze([
  { id: '01-scene-prompter', kind: 'agent', agent: 'scene-prompter' },
  // Not an agent: a transport (manual first, API later — D-31 decision 2).
  { id: '02-render', kind: 'render' },
  // Deterministic code, like the board pipeline's 04a-integrity gate:
  // dimensions, aspect, palette distance, quiet side.
  { id: '02a-scene-check', kind: 'gate' },
  // The module lands in build-order step 4, after the transport can carry
  // images; the registry records the pipeline's full shape from day one so
  // nothing downstream has to be renumbered when it arrives.
  { id: '03-scene-critic', kind: 'agent', agent: 'scene-critic' },
]);

// D-31: Mochi is generated INTO each scene, so the three states are three
// stills per register — not sprite frames over a shared background.
export const ART_STATES = deepFreeze(['idle', 'miss', 'solved']);

// The decided footprint (D-30, Max's pick by eye): 375×60 display pixels,
// a 6.25:1 letterbox. Ratio is width/height; exact pixel density (@1x/@2x/@3x)
// is deliberately not pinned here.
export const BAND = deepFreeze({ width: 375, height: 60, ratio: 6.25 });

const INDEX_BY_ID = new Map(ART_STAGES.map((stage, i) => [stage.id, i]));

const indexOf = (stageId) => {
  const index = INDEX_BY_ID.get(stageId);
  if (index === undefined) throw new Error(`unknown art stage id: ${stageId}`);
  return index;
};

export function isValidArtStageId(stageId) {
  return INDEX_BY_ID.has(stageId);
}

export function artStageById(stageId) {
  return ART_STAGES[indexOf(stageId)];
}

export function artStageAfter(stageId) {
  const next = indexOf(stageId) + 1;
  return next < ART_STAGES.length ? ART_STAGES[next] : null;
}

export function artStagesFrom(stageId) {
  return ART_STAGES.slice(indexOf(stageId));
}

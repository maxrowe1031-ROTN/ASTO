// Stage registry — the single source of pipeline stage IDs and order.
//
// Nine agents (GDD §12.1's eight in §12.3 order, plus D-18's glossary author)
// and the deterministic integrity gate at 04a. Everything downstream — run
// directories, revision re-entry, resume — derives from this list. Pure:
// imports nothing, touches nothing.

const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
};

export const STAGES = deepFreeze([
  { id: '01-pair-author', kind: 'agent', agent: 'pair-author' },
  { id: '02-theme-grouper', kind: 'agent', agent: 'theme-grouper' },
  { id: '03-difficulty-rater', kind: 'agent', agent: 'difficulty-rater' },
  { id: '04-board-builder', kind: 'agent', agent: 'board-builder' },
  { id: '04a-integrity', kind: 'gate' },
  { id: '05-analogy-validator', kind: 'agent', agent: 'analogy-validator' },
  { id: '06-adversarial-solver', kind: 'agent', agent: 'adversarial-solver' },
  { id: '07-test-player', kind: 'agent', agent: 'test-player' },
  { id: '08-style-guide', kind: 'agent', agent: 'style-guide' },
  { id: '09-glossary-author', kind: 'agent', agent: 'glossary-author' },
]);

// The stages a revision may re-enter at: the ones that AUTHOR the board.
// Re-entering at 05 or later would re-evaluate the same board and change
// nothing, and the gate is deterministic code with nothing to redo.
//
// Lived hard-coded in the review UI's <select> until 2026-08-05, when the
// Revision Proposer needed the same list to choose a re-entry point — which is
// what this registry exists to prevent two copies of.
export const STAGE_IDS_FOR_REVISION = deepFreeze(
  STAGES.filter((stage) => stage.kind === 'agent' && stage.id < '05').map((stage) => stage.id),
);

const INDEX_BY_ID = new Map(STAGES.map((stage, i) => [stage.id, i]));

const indexOf = (stageId) => {
  const index = INDEX_BY_ID.get(stageId);
  if (index === undefined) throw new Error(`unknown stage id: ${stageId}`);
  return index;
};

export function isValidStageId(stageId) {
  return INDEX_BY_ID.has(stageId);
}

export function stageById(stageId) {
  return STAGES[indexOf(stageId)];
}

export function stageAfter(stageId) {
  const next = indexOf(stageId) + 1;
  return next < STAGES.length ? STAGES[next] : null;
}

export function stagesFrom(stageId) {
  return STAGES.slice(indexOf(stageId));
}

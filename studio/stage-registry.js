// Stage registry — the single source of pipeline stage IDs and order.
//
// Eight agents (GDD §12.1, in §12.3 order) plus the deterministic integrity
// gate at 04a. Everything downstream — run directories, revision re-entry,
// resume — derives from this list. Pure: imports nothing, touches nothing.

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
]);

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

// blackboard — in-memory artifact exchange during one attempt.
//
// Stage N reads what stages 1..N-1 produced. Nothing else: the blackboard
// holds no rules, calls nothing, and never writes to disk (run-store.js
// persists it as blackboard.json).
//
// Two properties earn it a module of its own:
//
//   Reconstructable. A board rebuilt from stage outputs alone is identical to
//   the original, so a resumed or revised attempt sees exactly what the
//   original saw. Everything derived — the rollup included — is derived from
//   the outputs, never accumulated as it goes.
//
//   Rolled up. One read of snapshot() gives the whole attempt's state instead
//   of a folder you have to go searching through. The rollup is a summary
//   alongside the original output, never a replacement for it.
//
// Pure: imports only the stage registry, for the stage ordering.

import { STAGES, isValidStageId } from './stage-registry.js';

const ORDER = STAGES.map((stage) => stage.id);

/**
 * A one-line description of any agent output, derived without knowing which
 * stage produced it: arrays become their length, booleans stay, everything
 * else becomes its type. Generic on purpose — a new stage needs no change
 * here, and there is no per-stage branching to drift out of date.
 */
export function summarize(output) {
  if (output === null || typeof output !== 'object') return {};
  const resolution = {};
  for (const [key, value] of Object.entries(output)) {
    if (Array.isArray(value)) resolution[key] = value.length;
    else if (typeof value === 'boolean') resolution[key] = value;
    else resolution[key] = value === null ? 'null' : typeof value;
  }
  return resolution;
}

/**
 * @param outputs stageId → output, as read back from completed stage folders.
 *   Passing them in IS the reconstruction path; there is no separate restore.
 */
export function createBlackboard(outputs = {}) {
  const stored = new Map();
  const revisions = new Map();

  for (const [stageId, output] of Object.entries(outputs)) put(stageId, output);

  function put(stageId, output) {
    if (!isValidStageId(stageId)) throw new Error(`unknown stage id: ${stageId}`);
    // A replace is legitimate — the 04a gate sends the board builder back
    // round. Counting it keeps that visible rather than silent.
    if (stored.has(stageId)) revisions.set(stageId, (revisions.get(stageId) ?? 0) + 1);
    stored.set(stageId, structuredClone(output));
  }

  const inRegistryOrder = () => ORDER.filter((stageId) => stored.has(stageId));

  return {
    put,

    get(stageId) {
      return stored.has(stageId) ? structuredClone(stored.get(stageId)) : undefined;
    },

    has(stageId) {
      return stored.has(stageId);
    },

    outputs() {
      return Object.fromEntries(
        inRegistryOrder().map((stageId) => [stageId, structuredClone(stored.get(stageId))]),
      );
    },

    snapshot() {
      const stageOrder = inRegistryOrder();
      return {
        stageOrder,
        stages: Object.fromEntries(
          stageOrder.map((stageId) => [
            stageId,
            {
              resolution: summarize(stored.get(stageId)),
              revisions: revisions.get(stageId) ?? 0,
              output: structuredClone(stored.get(stageId)),
            },
          ]),
        ),
      };
    },
  };
}

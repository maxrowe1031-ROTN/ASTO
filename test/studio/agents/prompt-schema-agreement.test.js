// Every agent's prompt must name the top-level keys its own schema requires.
//
// This is the test that would have caught the 03-difficulty-rater failure, and
// the one the fixtures structurally could not. A fixture is hand-written to
// match the schema, so a round-trip test proves the schema ACCEPTS the fixture
// — never that the PROMPT PRODUCES it. The two can disagree completely and
// every offline test still passes; you only find out by paying for a real API
// call, which is exactly what happened (2026-08-02, ~$0.23).
//
// The rater's prompt said "Return one entry per set, keyed by its setId" while
// its schema required { grades: [...] }. The model obeyed the prompt, three
// times, and the retry feedback lost to the instruction sitting in front of it.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { STAGES } from '../../../studio/stage-registry.js';
import { loadAgent } from '../../../studio/agents/index.js';

const AGENT_STAGES = STAGES.filter((stage) => stage.kind === 'agent');

// Enough input for each agent to build a full prompt.
const INPUT = {
  'pair-author': { brief: { relationshipShapes: ['transformation'], count: 8 }, theme: null },
  'theme-grouper': { pairs: [{ a: 'Seed', b: 'Tree', relationshipLabel: 'grows into', shape: 'transformation' }] },
  'difficulty-rater': { sets: [{ id: 'set-growth', relationshipLabel: 'x', pairs: [['Seed', 'Tree'], ['Spark', 'Fire']] }] },
  'board-builder': { gradedSets: [{ id: 'set-growth', difficulty: 1 }] },
  'analogy-validator': { board: { id: 'b', title: 'B', sets: [] } },
  'adversarial-solver': { board: { id: 'b', title: 'B', sets: [] }, integrity: { acceptedCount: 16 } },
  'test-player': { words: Array.from({ length: 16 }, (_, i) => `W${i}`), maxMistakes: 4 },
  'style-guide': { items: [], title: 'B' },
};

// The board builder is the one agent with no top-level `required`: its
// contract is "exactly one of board or insufficientSets", which a JSON-schema
// required array cannot express, so the semantic check boardOrRefusal enforces
// it instead. Its keys are asserted explicitly below rather than skipped.
const ALTERNATIVES = { 'board-builder': ['board', 'insufficientSets'] };

for (const stage of AGENT_STAGES) {
  test(`${stage.agent}: the prompt names every top-level key its schema requires`, () => {
    const agent = loadAgent(stage.agent);
    const required = agent.getOutputSchema().required ?? ALTERNATIVES[stage.agent] ?? [];
    assert.ok(
      required.length > 0,
      `${stage.agent} declares no top-level keys — add it to ALTERNATIVES with its real contract`,
    );

    const prompt = agent.buildPrompt(INPUT[stage.agent], {});
    for (const key of required) {
      assert.ok(
        prompt.includes(`"${key}"`),
        `${stage.agent} requires "${key}" but never names it in the prompt — the model has to guess`,
      );
    }
  });
}

test('the difficulty rater asks for a grades ARRAY, not a map keyed by setId', () => {
  // The exact regression: "keyed by its setId" produced
  // { "set-a": {...}, "set-b": {...} } instead of { "grades": [...] }.
  const prompt = loadAgent('difficulty-rater').buildPrompt(INPUT['difficulty-rater'], {});
  assert.ok(prompt.includes('"grades"'), 'the wrapper key is not named');
  assert.equal(
    /keyed by (its )?"?setId"?/i.test(prompt),
    false,
    'the prompt still tells the model to key the object by setId',
  );
});

test('every agent still demands raw JSON', () => {
  for (const stage of AGENT_STAGES) {
    const prompt = loadAgent(stage.agent).buildPrompt(INPUT[stage.agent], {});
    assert.match(prompt, /single JSON object/i, stage.agent);
  }
});

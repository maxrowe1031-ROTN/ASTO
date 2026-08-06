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
  // A real set and a real order-fairness flag, because an agent whose prompt is
  // built from an empty board names none of its checklist keys and the checks
  // below would pass on a prompt no run ever sends.
  'adversarial-solver': {
    board: {
      id: 'b',
      title: 'B',
      sets: [{ id: 'set-growth', relationshipLabel: 'x', explanation: 'e', difficulty: 1,
        pairs: [['Seed', 'Tree'], ['Spark', 'Fire']] }],
    },
    integrity: {
      acceptedCount: 16,
      orderFairness: {
        enforced: false,
        count: 1,
        flagged: [{ setId: 'set-growth', shape: 'coordinates', kind: 'order-indistinguishable', note: 'n' }],
      },
    },
  },
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

// Third instance of one family, and the generalization that covers all of
// them. Naming the TOP-LEVEL keys is not enough: the analogy validator's
// schema requires `pass` on every verdict, its prompt named only "verdicts"
// and "boardPasses", and the model wrote `passes` three rounds running
// (2026-08-03, a real run). Every required key at every depth has to be named
// somewhere in the prompt, or the model is guessing — and it guesses the
// shape of whatever is nearby.
const requiredKeysAnywhere = (schema, seen = new Set()) => {
  if (!schema || typeof schema !== 'object') return seen;
  for (const key of schema.required ?? []) seen.add(key);
  for (const value of Object.values(schema.properties ?? {})) requiredKeysAnywhere(value, seen);
  if (schema.items) requiredKeysAnywhere(schema.items, seen);
  return seen;
};

for (const stage of AGENT_STAGES) {
  test(`${stage.agent}: every required key, at every depth, is named in the prompt`, () => {
    const agent = loadAgent(stage.agent);
    const prompt = agent.buildPrompt(INPUT[stage.agent], {});
    const missing = [...requiredKeysAnywhere(agent.getOutputSchema())].filter(
      (key) => !prompt.includes(`"${key}"`),
    );
    assert.deepEqual(
      missing,
      [],
      `${stage.agent} requires ${missing.join(', ')} but never names ${missing.length === 1 ? 'it' : 'them'} — ` +
        'the model has to guess, and it guesses from the shapes around it',
    );
  });
}

// The same failure one level down, found by the next real run (2026-08-03).
// Naming the top-level keys is not enough when a nested shape is at stake:
// the theme grouper is *handed* pairs as {a, b} objects and its schema
// requires them back as ["A", "B"] arrays. Its prompt named "pairs" and said
// nothing about the shape, so the model copied the shape it was shown and
// every pair came back as an object.
//
// Any agent whose schema wants an array-of-arrays-of-strings has this trap
// available to it, so the check is general rather than about one agent.
const arrayOfArrayProps = (schema, path = []) => {
  const found = [];
  if (!schema || typeof schema !== 'object') return found;
  if (schema.type === 'array' && schema.items?.type === 'array' && schema.items.items?.type === 'string') {
    found.push(path.join('.'));
  }
  for (const [key, value] of Object.entries(schema.properties ?? {})) {
    found.push(...arrayOfArrayProps(value, [...path, key]));
  }
  if (schema.items) found.push(...arrayOfArrayProps(schema.items, [...path, '[]']));
  return found;
};

for (const stage of AGENT_STAGES) {
  test(`${stage.agent}: a nested array-of-arrays shape is shown, not just named`, () => {
    const agent = loadAgent(stage.agent);
    const nested = arrayOfArrayProps(agent.getOutputSchema());
    if (nested.length === 0) return;

    const prompt = agent.buildPrompt(INPUT[stage.agent], {});
    assert.match(
      prompt,
      /\[\s*\[/,
      `${stage.agent} requires ${nested.join(', ')} as arrays of arrays but never shows that shape — ` +
        'naming the key leaves the model to copy whatever shape its input happened to use',
    );
  });
}

test('the theme grouper warns against copying its input shape', () => {
  const prompt = loadAgent('theme-grouper').buildPrompt(INPUT['theme-grouper'], {});
  assert.match(prompt, /\[\["Seed", "Tree"\]|\[\[/, 'the array shape is not shown');
  assert.match(prompt, /"a" and "b"|do not copy/i, 'the input-shape trap is not called out');
});

test('every agent still demands raw JSON', () => {
  for (const stage of AGENT_STAGES) {
    const prompt = loadAgent(stage.agent).buildPrompt(INPUT[stage.agent], {});
    assert.match(prompt, /single JSON object/i, stage.agent);
  }
});

// The contract every agent module satisfies, checked against all eight at
// once. Individual agents get their own files for semantics; this file is
// the boundary law: pure modules, four exports, JSON in and out.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { STAGES } from '../../../studio/stage-registry.js';
import { AGENTS, loadAgent } from '../../../studio/agents/index.js';

const AGENT_IDS = STAGES.filter((s) => s.kind === 'agent').map((s) => s.agent);

const someContext = () => ({
  rules: ['A relationship should feel immediately defensible after reveal.'],
  acceptedExamples: [{ text: 'Sapling : Tree :: Puppy : Dog', reason: 'clean directional shape' }],
  rejectedExamples: [{ text: 'Puppy : Dog :: Kitten : Cat', reason: 'too obvious; no insight' }],
  calibration: null,
});

const someInput = {
  'pair-author': { brief: { relationshipShapes: ['transformation'], count: 8 }, theme: 'lantern' },
  'theme-grouper': { pairs: [{ a: 'Seed', b: 'Tree', relationshipLabel: 'grows into' }] },
  'difficulty-rater': {
    sets: [{ id: 's1', relationshipLabel: 'grows into', pairs: [['Seed', 'Tree'], ['Spark', 'Fire']] }],
  },
  'board-builder': {
    gradedSets: [
      { id: 's1', relationshipLabel: 'grows into', pairs: [['Seed', 'Tree'], ['Spark', 'Fire']], difficulty: 1 },
    ],
  },
  'analogy-validator': { board: { id: 'b', title: 'B', sets: [] } },
  'adversarial-solver': { board: { id: 'b', title: 'B', sets: [] }, integrity: { accepted: 16 } },
  'test-player': { words: Array.from({ length: 16 }, (_, i) => `W${i}`), maxMistakes: 4 },
  'style-guide': { items: [{ setId: 's1', relationshipLabel: 'grows into', explanation: 'x' }] },
  'glossary-author': {
    board: { id: 'b', title: 'B', sets: [] },
    knowledgeGated: [{ word: 'W1', note: 'craft vocabulary' }],
  },
};

test('every agent stage in the registry has a module', () => {
  assert.equal(AGENT_IDS.length, 9);
  for (const id of AGENT_IDS) {
    assert.ok(AGENTS[id], `no module registered for agent "${id}"`);
  }
});

// The Revision Proposer is not a pipeline stage — it runs at review time when
// Max rejects a board — so the stage-driven loop below skips it. It is an
// agent by every other measure, and the purity half of the contract is the
// half that matters most for it: it is the only agent whose input includes a
// human's judgement, and it must still touch nothing.
test('the revision proposer is registered and pure, though it is not a stage', () => {
  const agent = loadAgent('revision-proposer');
  for (const fn of ['buildPrompt', 'getOutputSchema', 'parse', 'validateOutput']) {
    assert.equal(typeof agent[fn], 'function', `revision-proposer.${fn} is not a function`);
  }
  assert.equal(agent.id, 'revision-proposer');
  assert.equal(
    STAGES.some((s) => s.agent === 'revision-proposer'),
    false,
    'the proposer must not become a pipeline stage without a decision to make it one',
  );

  const source = readFileSync(
    new URL('../../../studio/agents/revision-proposer.js', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(source, /\bfetch\s*\(/, 'agents must not call fetch');
  assert.doesNotMatch(source, /node:fs|node:http|node:net/, 'agents must not do I/O');
  assert.doesNotMatch(source, /from '\.\.\/llm\.js'/, 'agents must not import the transport');
});

for (const id of AGENT_IDS) {
  test(`${id}: exports the four contract functions plus its stage id`, () => {
    const agent = loadAgent(id);
    for (const fn of ['buildPrompt', 'getOutputSchema', 'parse', 'validateOutput']) {
      assert.equal(typeof agent[fn], 'function', `${id}.${fn} is not a function`);
    }
    assert.equal(agent.id, id);
    assert.ok(STAGES.some((s) => s.id === agent.stageId && s.agent === id));
  });

  test(`${id}: is pure — no fetch, no fs, no network imports`, () => {
    const source = readFileSync(new URL(`../../../studio/agents/${id}.js`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\bfetch\s*\(/, 'agents must not call fetch');
    assert.doesNotMatch(source, /node:fs|node:http|node:net/, 'agents must not do I/O');
    assert.doesNotMatch(source, /from '\.\.\/llm\.js'/, 'agents must not import the transport');
  });

  test(`${id}: buildPrompt returns a non-empty string asking for JSON`, () => {
    const prompt = loadAgent(id).buildPrompt(someInput[id], someContext());
    assert.equal(typeof prompt, 'string');
    assert.ok(prompt.length > 50, `prompt was ${prompt.length} chars`);
    assert.match(prompt, /JSON/);
  });

  test(`${id}: buildPrompt is pure — it does not mutate its input or context`, () => {
    const input = structuredClone(someInput[id]);
    const context = someContext();
    const before = JSON.stringify({ input, context });
    loadAgent(id).buildPrompt(input, context);
    assert.equal(JSON.stringify({ input, context }), before);
  });

  test(`${id}: buildPrompt works with no learning context at all`, () => {
    assert.doesNotThrow(() => loadAgent(id).buildPrompt(someInput[id], {}));
    assert.doesNotThrow(() => loadAgent(id).buildPrompt(someInput[id], undefined));
  });

  test(`${id}: approved rules from the learning context reach the prompt`, () => {
    const context = someContext();
    const prompt = loadAgent(id).buildPrompt(someInput[id], context);
    assert.ok(
      prompt.includes(context.rules[0]),
      `${id} dropped its approved rules — learning would never reach the agent`,
    );
  });

  test(`${id}: getOutputSchema describes a constrained object`, () => {
    const agent = loadAgent(id);
    const schema = agent.getOutputSchema();
    assert.equal(schema.type, 'object');
    assert.ok(Object.keys(schema.properties ?? {}).length > 0, 'schema declares no properties');
    // Board Builder returns a board OR a documented refusal, so neither field
    // can be `required` at the schema level — its either/or rule is a semantic
    // check. What must hold for every agent is that an empty object is refused.
    assert.equal(agent.validateOutput({}).ok, false, 'an empty object must not validate');
  });

  test(`${id}: parse reads plain JSON`, () => {
    const result = loadAgent(id).parse('{"any":"thing"}');
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, { any: 'thing' });
  });

  test(`${id}: parse survives a fenced code block — models wrap JSON constantly`, () => {
    const result = loadAgent(id).parse('```json\n{"any":"thing"}\n```');
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, { any: 'thing' });
  });

  test(`${id}: parse survives prose either side of the JSON`, () => {
    const result = loadAgent(id).parse('Here you go:\n{"any":"thing"}\nHope that helps!');
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, { any: 'thing' });
  });

  test(`${id}: parse reports unparseable output as a retryable failure`, () => {
    const result = loadAgent(id).parse('I would rather write you a poem.');
    assert.equal(result.ok, false);
    assert.equal(result.failure.category, 'retryable-output');
    assert.ok(result.failure.feedback.length > 0);
  });

  test(`${id}: validateOutput rejects junk and never throws`, () => {
    const agent = loadAgent(id);
    for (const junk of [null, undefined, 42, 'text', [], {}]) {
      let result;
      assert.doesNotThrow(() => {
        result = agent.validateOutput(junk);
      }, `${id}.validateOutput threw on ${JSON.stringify(junk)}`);
      assert.equal(result.ok, false);
    }
  });
}

// The A2 seam, end to end and offline: for every agent, build a prompt →
// send it through llm.js over the mock transport → parse → validate.
//
// These fixtures are committed (studio/fixtures/responses/), so this is also
// the proof that the shipped fixture set is usable by A3's pipeline run.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { STAGES } from '../../../studio/stage-registry.js';
import { loadAgent } from '../../../studio/agents/index.js';
import { createLlm } from '../../../studio/llm.js';
import { createMockTransport } from '../../../studio/mock-transport.js';
import { validatePuzzle } from '../../../src/source/validate-puzzle.js';

const fixturesDir = fileURLToPath(new URL('../../../studio/fixtures/responses/', import.meta.url));

const AGENT_STAGES = STAGES.filter((s) => s.kind === 'agent');

const inputFor = {
  'pair-author': { brief: { relationshipShapes: ['transformation'], count: 8 } },
  'theme-grouper': { pairs: [{ a: 'Seed', b: 'Tree', relationshipLabel: 'grows into' }] },
  'difficulty-rater': { sets: [{ id: 'set-growth', pairs: [['Seed', 'Tree'], ['Spark', 'Fire']] }] },
  'board-builder': { gradedSets: [] },
  'analogy-validator': { board: { id: 'b', title: 'B', sets: [] } },
  'adversarial-solver': { board: { id: 'b', title: 'B', sets: [] }, integrity: { accepted: 16 } },
  'test-player': { words: Array.from({ length: 16 }, (_, i) => `W${i}`), maxMistakes: 4 },
  'style-guide': { items: [] },
};

for (const stage of AGENT_STAGES) {
  test(`${stage.agent}: prompt → mock transport → parse → validate, with no network`, async () => {
    const agent = loadAgent(stage.agent);
    const transport = createMockTransport({ fixturesDir });
    const llm = createLlm({ transport });

    const prompt = agent.buildPrompt(inputFor[stage.agent], {});
    const { text, record } = await llm.send({
      stageId: stage.id,
      model: 'mock-model',
      prompt,
      maxTokens: 4096,
    });

    const parsed = agent.parse(text);
    assert.equal(parsed.ok, true, `fixture for ${stage.id} did not parse`);

    const validation = agent.validateOutput(parsed.value);
    assert.equal(
      validation.ok,
      true,
      `fixture for ${stage.id} failed validation: ${JSON.stringify(validation.errors)}`,
    );

    assert.ok(record.inputTokens > 0 && record.outputTokens > 0, 'usage was not accounted');
  });
}

test('the board-builder fixture is a board the GAME accepts — one schema, no drift', async () => {
  const agent = loadAgent('board-builder');
  const llm = createLlm({ transport: createMockTransport({ fixturesDir }) });
  const { text } = await llm.send({
    stageId: '04-board-builder',
    model: 'mock-model',
    prompt: 'x',
    maxTokens: 100,
  });
  const { value } = agent.parse(text);
  const result = validatePuzzle(value.board);
  assert.equal(result.ok, true, `game validator rejected the fixture board: ${JSON.stringify(result.errors)}`);
});

test('a full mock pass over all eight agents touches the network zero times', async () => {
  const realFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = () => {
    fetchCalls += 1;
    throw new Error('network was used during a mock run');
  };
  try {
    const llm = createLlm({ transport: createMockTransport({ fixturesDir }) });
    for (const stage of AGENT_STAGES) {
      const agent = loadAgent(stage.agent);
      const { text } = await llm.send({
        stageId: stage.id,
        model: 'mock-model',
        prompt: agent.buildPrompt(inputFor[stage.agent], {}),
        maxTokens: 4096,
      });
      assert.equal(agent.parse(text).ok, true);
    }
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(fetchCalls, 0);
});

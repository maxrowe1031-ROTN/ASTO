// art-pipeline — the orchestrator between the scene-prompter and the store,
// with a human in the middle (design.md D-31, manual transport first).
//
// The llm here is a stub returning scripted scene JSON — the orchestrator's
// job is plumbing, not prompting, and these tests hold the plumbing: staged
// prompts land in pending through the store, delivered renders get cropped to
// the band and published, refusals are reported without stranding the batch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { collectScenes, promptScenes } from '../../studio/art-pipeline.js';
import { createManualRenderTransport } from '../../studio/render-transport.js';
import { createArtStore } from '../../studio/storage/art-store.js';
import { encodePng } from '../../studio/png.js';

const tempDir = () => mkdtempSync(join(tmpdir(), 'asto-artrun-'));

const sceneFor = (state) => ({
  register: 'kitchens-food',
  state,
  prompt:
    'A wide horizontal band scene of a village bakery at dawn. Mochi, a small white cat with a ' +
    'red scarf, sits on the counter beside a coffee mug. Empty pale sky above, dark counter ' +
    'line running the full width. Clean 2D mascot illustration, flat colour, soft linework.',
  composition: 'content confined to the middle band; empty sky above, plain ground below',
  clearSide: 'right',
  mochiPose: 'sitting',
});

/** An llm stub that answers the scene-prompter with a valid scene. */
const scriptedLlm = () => {
  const calls = [];
  return {
    calls,
    async send(request, options = {}) {
      calls.push({ request, options });
      const state = /THE STATE: (\w+)/.exec(request.prompt)[1];
      return {
        text: JSON.stringify({ scene: sceneFor(state) }),
        record: { model: request.model, requests: [], inputTokens: 1, outputTokens: 1, durationMs: 1 },
      };
    },
  };
};

/** A real RGBA render at 3:2, as the manual drop would deliver. */
const render = (width = 250, height = 166) => {
  const pixels = new Uint8Array(width * height * 4).fill(200);
  return encodePng({ width, height, pixels });
};

const setup = (root) => {
  const store = createArtStore({ rootDir: root, clock: () => '2026-08-26T12:00:00.000Z' });
  const transport = createManualRenderTransport({ store });
  return { store, transport };
};

test('promptScenes stages all three states through the manual transport', async () => {
  const root = tempDir();
  try {
    const { store, transport } = setup(root);
    const llm = scriptedLlm();
    const { register, results } = await promptScenes({
      registerId: 'kitchens-food',
      llm,
      transport,
    });

    assert.equal(register, 'kitchens-food');
    assert.deepEqual(results.map((r) => [r.state, r.status]), [
      ['idle', 'staged'],
      ['miss', 'staged'],
      ['solved', 'staged'],
    ]);
    assert.equal(llm.calls.length, 3);
    for (const r of results) {
      assert.ok(existsSync(r.promptPath), `prompt file missing for ${r.state}`);
      assert.match(readFileSync(r.promptPath, 'utf8'), /bakery at dawn/);
    }
    assert.deepEqual(
      store.listPending().map((p) => [p.state, p.hasImage]),
      [['idle', false], ['miss', false], ['solved', false]],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an invalid reply is retried once with feedback, then reported as failed', async () => {
  const root = tempDir();
  try {
    const { transport } = setup(root);
    const llm = {
      calls: [],
      async send(request, options = {}) {
        this.calls.push(options);
        // Always drops the scarf — validation must fail both rounds.
        const scene = { ...sceneFor('idle'), prompt: 'A wide horizontal band scene of a village bakery at dawn. Mochi sits quietly on the counter, watching the ovens warm up, empty pale sky above, dark counter line running the full width of the frame.' };
        return { text: JSON.stringify({ scene }), record: { model: 'm', requests: [], inputTokens: 1, outputTokens: 1, durationMs: 1 } };
      },
    };
    const { results } = await promptScenes({
      registerId: 'kitchens-food',
      states: ['idle'],
      llm,
      transport,
    });

    assert.equal(results[0].status, 'failed');
    assert.match(results[0].errors.join(' '), /scarf/i);
    assert.equal(llm.calls.length, 2);
    // Round two carried round one's rejection as feedback.
    assert.match(llm.calls[1].feedback, /rejected/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an unknown register is refused before any llm call', async () => {
  await assert.rejects(
    promptScenes({ registerId: 'volcanoes', llm: scriptedLlm(), transport: null }),
    /unknown register/,
  );
});

test('collectScenes crops a delivered 3:2 render to the band and publishes it', async () => {
  const root = tempDir();
  try {
    const { store, transport } = setup(root);
    await promptScenes({ registerId: 'kitchens-food', states: ['idle'], llm: scriptedLlm(), transport });

    // Max delivers: a 500×333 render dropped beside the prompt.
    writeFileSync(join(root, 'pending', 'kitchens-food-idle.png'), render(500, 333));

    const results = await collectScenes({ store, transport });
    assert.deepEqual(results.map((r) => [r.register, r.state, r.status]), [
      ['kitchens-food', 'idle', 'published'],
    ]);
    assert.equal(results[0].width, 500);
    assert.equal(results[0].height, 80); // 500 / 6.25

    // Published with the staged scene's meta, and pending is cleared.
    const meta = store.readMeta('kitchens-food');
    assert.equal(meta.states.idle.transport, 'manual');
    assert.equal(meta.states.idle.clearSide, 'right');
    assert.equal(meta.states.idle.sourceSize, '500×333');
    assert.deepEqual(store.listPending(), []);
    assert.ok(store.read('kitchens-food', 'idle').length > 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a handoff with no render yet is reported as waiting and left alone', async () => {
  const root = tempDir();
  try {
    const { store, transport } = setup(root);
    await promptScenes({ registerId: 'kitchens-food', states: ['miss'], llm: scriptedLlm(), transport });

    const results = await collectScenes({ store, transport });
    assert.deepEqual(results, [{ register: 'kitchens-food', state: 'miss', status: 'waiting' }]);
    assert.equal(store.listPending().length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a too-small render is refused but stays pending for a replacement drop', async () => {
  const root = tempDir();
  try {
    const { store, transport } = setup(root);
    await promptScenes({ registerId: 'kitchens-food', states: ['idle'], llm: scriptedLlm(), transport });
    // 200px wide crops to a band far narrower than the 375px slot.
    writeFileSync(join(root, 'pending', 'kitchens-food-idle.png'), render(200, 133));

    const results = await collectScenes({ store, transport });
    assert.equal(results[0].status, 'refused');
    assert.equal(results[0].reason, 'bad-aspect');
    // The handoff survives so a better render can replace the bad one.
    assert.equal(store.listPending().length, 1);
    assert.equal(store.listPending()[0].hasImage, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('one bad render does not strand the good one behind it', async () => {
  const root = tempDir();
  try {
    const { store, transport } = setup(root);
    await promptScenes({ registerId: 'kitchens-food', states: ['idle', 'solved'], llm: scriptedLlm(), transport });
    writeFileSync(join(root, 'pending', 'kitchens-food-idle.png'), new TextEncoder().encode('not a png'));
    writeFileSync(join(root, 'pending', 'kitchens-food-solved.png'), render(500, 333));

    const results = await collectScenes({ store, transport });
    const byState = Object.fromEntries(results.map((r) => [r.state, r.status]));
    assert.equal(byState.idle, 'refused');
    assert.equal(byState.solved, 'published');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

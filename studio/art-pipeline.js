// art-pipeline — the art run's orchestrator (design.md D-31).
//
// Deliberately thinner than pipeline.js: an art run is two halves with a human
// in the middle. `promptScenes` runs the scene-prompter and stages its output
// through the render transport; `collectScenes` picks up delivered renders,
// crops them to the band, and publishes through the art-store. Between the
// two, with the manual transport, Max renders — however long that takes.
//
// The seams it composes, never crosses:
//   scene-prompter — pure agent; this module never builds a prompt itself.
//   llm            — the text network seam, exactly as pipeline.js uses it.
//   transport      — the render seam (manual today, API later), injected.
//   art-store      — the only writer of art/; every byte lands through it.
//   png            — pure pixels; the crop that makes a 3:2 render band-shaped.

import { loadAgent } from './agents/index.js';
import { ART_STATES, BAND } from './art-stage-registry.js';
import { REGISTERS } from './corpus/registers.js';
import { ArtRefused } from './storage/art-store.js';
import { cropBand, decodePng, encodePng } from './png.js';

// Same reasoning tier and ceiling as the board pipeline's default — the
// prompter is a short creative writing task, not a checker.
export const SCENE_PROMPTER_MODEL = 'claude-sonnet-5';
export const SCENE_PROMPTER_MAX_TOKENS = 16_000;

// One validation retry, mirroring the board pipeline's loop in miniature: the
// second round carries the first round's errors as feedback.
const VALIDATION_ROUNDS = 2;

export function findRegister(registerId) {
  const register = REGISTERS.find((r) => r.id === registerId);
  if (!register) {
    const known = REGISTERS.map((r) => r.id).join(', ');
    throw new Error(`unknown register "${registerId}" — known: ${known}`);
  }
  return register;
}

/**
 * Runs the scene-prompter for one register and stages each state's scene with
 * the render transport. Returns one entry per state:
 *   { state, status: 'staged'|'failed', promptPath?, scene?, errors? }
 */
export async function promptScenes({
  registerId,
  states = ART_STATES,
  llm,
  transport,
  context = {},
  model = SCENE_PROMPTER_MODEL,
  maxTokens = SCENE_PROMPTER_MAX_TOKENS,
}) {
  const register = findRegister(registerId);
  const agent = loadAgent('scene-prompter');
  const results = [];

  for (const state of states) {
    const input = { register, state };
    const request = {
      stageId: agent.stageId,
      model,
      prompt: agent.buildPrompt(input, context),
      maxTokens,
    };

    let entry = null;
    let feedback;
    for (let round = 1; round <= VALIDATION_ROUNDS; round += 1) {
      const { text, record } = await llm.send(request, { feedback });
      const parsed = agent.parse(text);
      const validation = parsed.ok ? agent.validateOutput(parsed.value, { input }) : parsed.failure;

      if (parsed.ok && validation.ok) {
        const scene = parsed.value.scene;
        const staged = await transport.request({
          register: register.id,
          state,
          scene,
          model: record.model,
        });
        // Spread first: the transport's own status ('pending' for manual,
        // 'rendered' for the API) must not overwrite the orchestrator's.
        entry = { ...staged, state, status: 'staged', transportStatus: staged.status, scene };
        break;
      }

      const errors = parsed.ok
        ? validation.errors.map((e) => (typeof e === 'string' ? e : `${e.path}: ${e.message}`))
        : [validation.message];
      feedback =
        `Your previous reply was rejected:\n${errors.map((e) => `- ${e}`).join('\n')}\n` +
        'Correct these problems and reply again with the same JSON shape.';
      entry = { state, status: 'failed', errors };
    }
    results.push(entry);
  }

  return { register: register.id, results };
}

/**
 * Collects every delivered render: decode, crop to the band, publish, clear.
 * A refusal is reported, never thrown — one bad render must not strand the
 * batch behind it. Returns one entry per staged handoff.
 */
export async function collectScenes({ store, transport, focusY = 0.5, replace = true }) {
  const results = [];

  for (const pending of store.listPending()) {
    const { register, state } = pending;
    if (!pending.hasImage) {
      results.push({ register, state, status: 'waiting' });
      continue;
    }

    try {
      const delivered = await transport.collect(register, state);
      const image = decodePng(delivered);
      const band = cropBand(image, { ratio: BAND.ratio, focusY });
      if (band.width < BAND.width) {
        throw new ArtRefused(
          'bad-aspect',
          `the delivered render crops to ${band.width}px — narrower than the ${BAND.width}px slot`,
        );
      }

      const staged = store.readPendingScene(register, state);
      const published = store.publish({
        register,
        state,
        bytes: new Uint8Array(encodePng(band)),
        meta: {
          transport: transport.kind,
          model: staged?.model ?? null,
          prompt: staged?.scene?.prompt ?? null,
          composition: staged?.scene?.composition ?? null,
          clearSide: staged?.scene?.clearSide ?? null,
          mochiPose: staged?.scene?.mochiPose ?? null,
          sourceSize: `${image.width}×${image.height}`,
        },
        replace,
      });
      store.clearPending(register, state);
      results.push({ register, state, status: 'published', path: published.path, width: published.width, height: published.height });
    } catch (error) {
      if (error instanceof ArtRefused || /PNG/i.test(error.message)) {
        results.push({ register, state, status: 'refused', reason: error.reason ?? 'bad-image', message: error.message });
        continue; // the pending files stay, so the render can be replaced and re-collected
      }
      throw error;
    }
  }

  return results;
}

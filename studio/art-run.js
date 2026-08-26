// art-run.js — the art pipeline's CLI adapter (design.md D-31). An adapter,
// not a second orchestrator, on run.js's model: argv → options → the exported
// art-pipeline functions → a printed report. No pipeline logic lives here.
//
//   node studio/art-run.js prompt kitchens-food            # stage all three states
//   node studio/art-run.js prompt kitchens-food --state idle
//   node studio/art-run.js status                          # what is staged, what has arrived
//   node studio/art-run.js collect                         # crop + publish every delivered render
//   node studio/art-run.js collect --focus-y 0.3           # keep more of the top when cropping
//
// The loop this drives (manual transport, D-31 decision 2):
//   1. `prompt` writes art/pending/<register>-<state>.txt — paste it into an
//      image tool, download the render.
//   2. Drop the PNG beside the prompt as art/pending/<register>-<state>.png.
//   3. `collect` decodes, crops the centered 6.25:1 band, publishes through
//      the art-store, and clears the handoff. `status` shows the queue.
//
// --mock swaps the LLM transport for an offline echo that returns a
// syntactically valid scene for whatever was asked — plumbing rehearsal, not
// a real prompt. Without it the Anthropic transport is used, which needs
// ANTHROPIC_API_KEY; a missing key is reported by name, never by value.

import { parseArgs } from 'node:util';

import { collectScenes, promptScenes } from './art-pipeline.js';
import { createManualRenderTransport } from './render-transport.js';
import { createArtStore } from './storage/art-store.js';
import { createAnthropicTransport, createLlm } from './llm.js';
import { ART_STATES } from './art-stage-registry.js';
import { loadEnv } from './env.js';

const OPTIONS = {
  state: { type: 'string' },
  mock: { type: 'boolean', default: false },
  'focus-y': { type: 'string' },
  replace: { type: 'boolean', default: true },
};

/** Pure: argv → options. The only part of this file worth testing. */
export function parseArgv(argv) {
  const [command, ...rest] = argv;
  if (!['prompt', 'collect', 'status'].includes(command)) {
    throw new Error(`usage: art-run.js <prompt|collect|status> — got "${command ?? ''}"`);
  }

  const { values, positionals: positional } = parseArgs({
    args: rest,
    options: OPTIONS,
    strict: true,
    allowPositionals: true,
  });

  if (command === 'prompt' && positional.length !== 1) {
    throw new Error('prompt needs exactly one <register> — see studio/corpus/registers.js for ids');
  }
  if (command !== 'prompt' && positional.length > 0) {
    throw new Error(`${command} takes no positional arguments`);
  }

  const states = values.state ? [values.state] : [...ART_STATES];
  if (values.state && !ART_STATES.includes(values.state)) {
    throw new Error(`--state must be one of ${ART_STATES.join(', ')}`);
  }

  const focusY = values['focus-y'] === undefined ? 0.5 : Number(values['focus-y']);
  if (!(focusY >= 0 && focusY <= 1)) {
    throw new Error('--focus-y must be between 0 (keep the top) and 1 (keep the bottom)');
  }

  return {
    command,
    registerId: positional[0] ?? null,
    states,
    mock: values.mock,
    focusY,
    replace: values.replace,
  };
}

// An offline stand-in for the model: echoes a valid scene for whatever
// register and state the prompt asked about. Rehearses every seam except the
// one it replaces — which is the point of --mock at both CLIs.
function createEchoSceneTransport() {
  return async function echoTransport(request) {
    const state = /THE STATE: (\w+)/.exec(request.prompt)?.[1] ?? 'idle';
    const register = /"id": "([a-z0-9-]+)"/.exec(request.prompt)?.[1] ?? 'unknown';
    const scene = {
      register,
      state,
      prompt:
        `[MOCK — not a real prompt] A wide horizontal band scene for ${register}. Mochi, a small ` +
        'white cat with a red scarf, sits at the centre of the band with empty sky above and a ' +
        'plain ground line below, clean 2D mascot illustration, flat colour, soft linework.',
      composition: 'content confined to the middle band so the letterbox crop loses nothing',
      clearSide: 'right',
      mochiPose: 'sitting',
    };
    return {
      text: JSON.stringify({ scene }),
      stopReason: 'end_turn',
      model: 'mock-model',
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  };
}

async function main() {
  const options = parseArgv(process.argv.slice(2));
  const store = createArtStore({});
  const transport = createManualRenderTransport({ store });

  if (options.command === 'status') {
    const pending = store.listPending();
    const published = store.list();
    if (pending.length === 0 && published.length === 0) {
      console.log('nothing staged, nothing published — start with: art-run.js prompt <register>');
      return;
    }
    for (const p of pending) {
      console.log(`pending   ${p.register}/${p.state}  ${p.hasImage ? 'render DELIVERED — run collect' : 'awaiting render'}`);
    }
    for (const entry of published) {
      console.log(`published ${entry.register}  [${entry.states.join(', ')}]`);
    }
    return;
  }

  if (options.command === 'prompt') {
    loadEnv();
    if (!options.mock && !process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set — export it, add it to .env, or use --mock');
    }
    const llm = createLlm({
      transport: options.mock ? createEchoSceneTransport() : createAnthropicTransport(),
    });
    const { register, results } = await promptScenes({
      registerId: options.registerId,
      states: options.states,
      llm,
      transport,
    });
    for (const r of results) {
      if (r.status === 'staged') {
        console.log(`staged  ${register}/${r.state}  →  ${r.promptPath}`);
      } else {
        console.log(`FAILED  ${register}/${r.state}\n  ${r.errors.join('\n  ')}`);
      }
    }
    console.log('\npaste each .txt into your image tool, drop the PNG beside it, then: art-run.js collect');
    return;
  }

  // collect
  const results = await collectScenes({
    store,
    transport,
    focusY: options.focusY,
    replace: options.replace,
  });
  if (results.length === 0) {
    console.log('nothing pending — stage prompts first with: art-run.js prompt <register>');
    return;
  }
  for (const r of results) {
    if (r.status === 'published') {
      console.log(`published ${r.register}/${r.state}  ${r.width}×${r.height}  →  ${r.path}`);
    } else if (r.status === 'waiting') {
      console.log(`waiting   ${r.register}/${r.state}  (no render dropped yet)`);
    } else {
      console.log(`REFUSED   ${r.register}/${r.state}  ${r.reason}: ${r.message}`);
    }
  }
}

const invokedDirectly = import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

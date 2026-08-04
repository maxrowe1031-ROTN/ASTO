// run.js — the CLI adapter. An adapter, not a second orchestrator: it turns
// argv into options, calls the exported runPipeline, and prints where the run
// landed. It holds no pipeline logic and shells out to nothing.
//
// Until the Review Studio exists (Part B), this is how Max exercises the Core
// without reading code — which is what HR-2 in docs/design.md promises.
//
//   node studio/run.js --mock --theme "Lantern light"
//   node studio/run.js --run <runId>                    # resume where it stopped
//   node studio/run.js --run <runId> --revise-from 04-board-builder --notes "..."
//
// --mock replays the committed fixtures and touches no network. Without it the
// real Anthropic transport is used, which needs ANTHROPIC_API_KEY in the
// environment; a missing key is reported by name, never by value.

import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

import { runPipeline, requestRevision } from './pipeline.js';
import { createRunStore } from './storage/run-store.js';
import { createAnthropicTransport } from './llm.js';
import { createMockTransport } from './mock-transport.js';
import { isValidStageId } from './stage-registry.js';
import { buildRelationshipIndex, buildVarietyBrief } from './variety.js';
import { loadRules } from './corpus/rules.js';
import { loadEnv } from './env.js';
import { MIN_PAIR_COUNT, DEFAULT_PAIR_COUNT, MAX_PAIR_COUNT } from './pipeline-config.js';
import { pickSubject } from './corpus/subjects.js';

const RUNS_DIR = fileURLToPath(new URL('./runs/', import.meta.url));
const FIXTURES_DIR = fileURLToPath(new URL('./fixtures/responses/', import.meta.url));

const OPTIONS = {
  theme: { type: 'string' },
  slug: { type: 'string' },
  run: { type: 'string' },
  'revise-from': { type: 'string' },
  notes: { type: 'string' },
  mock: { type: 'boolean', default: false },
  fresh: { type: 'boolean', default: false },
  count: { type: 'string' },
};

/** Pure: argv → options. The only part of this file worth testing. */
export function parseArgv(argv) {
  const { values } = parseArgs({ args: argv, options: OPTIONS, strict: true });

  const theme = values.theme ?? null;
  const reviseFrom = values['revise-from'] ?? null;

  if (reviseFrom && !values.run) {
    throw new Error('--revise-from needs --run <runId>: a revision revises an existing run.');
  }
  if (reviseFrom && !isValidStageId(reviseFrom)) {
    throw new Error(`--revise-from: unknown stage id "${reviseFrom}"`);
  }

  // The same floor the Review Studio enforces, from the same constants. This
  // defaulted to 8 for a day after the Studio was fixed — a count that cannot
  // build a board, still reachable from the CLI. Rejecting here costs nothing;
  // finding out at stage 04 cost $0.16.
  const count = Number(values.count ?? DEFAULT_PAIR_COUNT);
  if (!Number.isInteger(count) || count < MIN_PAIR_COUNT || count > MAX_PAIR_COUNT) {
    throw new Error(
      `--count must be an integer between ${MIN_PAIR_COUNT} and ${MAX_PAIR_COUNT}: ` +
        `a board needs four sets of two pairs and the grouper always sets some aside.`,
    );
  }

  return {
    theme,
    slug: values.slug ?? slugify(theme) ?? 'surprise-me',
    runId: values.run ?? null,
    reviseFrom,
    notes: values.notes ?? '',
    mock: values.mock,
    fresh: values.fresh,
    brief: { count },
  };
}

const slugify = (text) => {
  if (!text) return null;
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : null;
};

async function main(argv) {
  const options = parseArgv(argv);
  loadEnv();
  const store = createRunStore({ rootDir: RUNS_DIR });
  const transport = options.mock
    ? createMockTransport({ fixturesDir: FIXTURES_DIR })
    : createAnthropicTransport();

  let runId = options.runId;
  if (runId === null) {
    // Same brief the Review Studio builds, so a run started here and a run
    // started from the web surface are the same kind of run.
    const brief =
      options.theme === null
        ? buildVarietyBrief({ index: buildRelationshipIndex({ store }), count: options.brief.count })
        : options.brief;
    // A surprise-me run picks a subject too — the Studio does the same, and a
    // run started here must be the same kind of run as one started there.
    const theme = options.theme ?? pickSubject();
    ({ runId } = store.createRun({ slug: options.slug, theme, brief }));
    console.log(`run ${runId}`);
    if (options.theme === null) console.log(`surprise-me subject: ${theme}`);
    if (brief.relationshipShapes?.length) {
      console.log(`surprise-me: reaching for ${brief.relationshipShapes.join(', ')}`);
    }
  }
  if (options.reviseFrom) {
    const attemptId = requestRevision(store, runId, {
      fromStage: options.reviseFrom,
      notes: options.notes,
    });
    console.log(`revision attempt ${attemptId} from ${options.reviseFrom}`);
  }

  const rules = loadRules();
  const result = await runPipeline({
    runId,
    store,
    transport,
    fresh: options.fresh,
    context: { rules: rules.map((rule) => rule.text) },
  });

  console.log(`attempt ${result.attemptId}: ${result.status}`);
  if (result.resumedAt) console.log(`resumed at ${result.resumedAt}`);
  if (result.status === 'complete') console.log(`board "${result.board.title}" (${result.board.id})`);
  else console.log(`failure [${result.failure.category}] ${result.failure.message}`);

  const { requests, tokens, costUsd } = result.usage.attempt;
  console.log(`spend: ${requests} request(s), ${tokens} tokens, ~$${costUsd.toFixed(4)}`);
  console.log(`artifacts: studio/runs/${runId}/attempts/${result.attemptId}/`);

  return result.status === 'complete' ? 0 : 1;
}

// Only runs as a script, so importing parseArgv in a test costs nothing.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error.message);
      process.exit(1);
    },
  );
}

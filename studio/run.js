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
import { autoReviseIfNeeded, recordAutoRevisionOutcome } from './auto-revise.js';
import { createRunStore } from './storage/run-store.js';
import { createAnthropicTransport } from './llm.js';
import { createMockTransport } from './mock-transport.js';
import { isValidStageId } from './stage-registry.js';
import { buildRelationshipIndex, buildThemedBrief, buildVarietyBrief } from './variety.js';
import { loadRules } from './corpus/rules.js';
import { loadEnv } from './env.js';
import { MIN_PAIR_COUNT, DEFAULT_PAIR_COUNT, MAX_PAIR_COUNT } from './pipeline-config.js';
import { pickFreshSubject } from './subject.js';
import { slugify } from './slug.js';

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
  // Off-switch for the pre-review fix loop (design.md D-14). Spelled as a
  // negative because the loop is on by default at both doors.
  'no-auto-revise': { type: 'boolean', default: false },
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
    // null for a surprise-me run with no explicit --slug: the slug follows the
    // subject, and the subject is not drawn until launch. parseArgv stays pure
    // — the same argv must not mean a different run each time it is parsed.
    slug: values.slug ?? slugify(theme),
    runId: values.run ?? null,
    reviseFrom,
    notes: values.notes ?? '',
    mock: values.mock,
    fresh: values.fresh,
    autoRevise: !values['no-auto-revise'],
    brief: { count },
  };
}

/**
 * Pure: which brief a CLI-started run carries. The same brief the Review Studio
 * builds, so a run started here and a run started from the web surface are the
 * same kind of run.
 *
 * Exported because this used to be assembled inline, and inline it assembled a
 * THINNER brief than the Studio's in two separate ways — no cross-board steers
 * on a themed run, and no `mock` flag on any run. Neither was visible from
 * anywhere. The decision is testable now; the two brief shapes themselves live
 * in `variety.js`.
 */
export function briefFor({ index, theme, count, mock = false, autoRevise = true, pick = null }) {
  return {
    ...(theme === null ? buildVarietyBrief({ index, count }) : buildThemedBrief({ index, count })),
    // Recorded on the run, not just handed to this launch. It is what separates
    // a fixture replay from real editorial signal — `variety.js` reads it to
    // keep a replayed board from telling every future brief that First Light's
    // shapes are heavily used, and `studio/runs/.gitignore` names it as the
    // field that makes that distinction readable at all. The Studio has
    // recorded it since the flag existed; this door never did, so a `--mock`
    // run from the CLI counted into the library as though someone had authored
    // it. Found by running one during this session's own verification.
    mock,
    // Recorded for the same reason: whether the pre-review fix loop (D-14) may
    // touch this run is the run's own setting, and a resume must obey the
    // choice made at creation rather than whatever the flag says that day.
    autoRevise,
    // Where a surprise-me subject came from and which style the scout was
    // asked for (design.md D-15) — absent on themed runs, exactly as in the
    // Studio's brief.
    ...(pick ? { subjectSource: pick.source, subjectStyle: pick.style } : {}),
  };
}

async function main(argv) {
  const options = parseArgv(argv);
  loadEnv();
  const store = createRunStore({ rootDir: RUNS_DIR });
  const transport = options.mock
    ? createMockTransport({ fixturesDir: FIXTURES_DIR })
    : createAnthropicTransport();

  let runId = options.runId;
  if (runId === null) {
    const index = buildRelationshipIndex({ store });
    // A surprise-me run picks a subject too — the Studio does the same, and a
    // run started here must be the same kind of run as one started there.
    // Since D-15 the pick is FRESH: the scout invents a subject no non-mock
    // run has used, falling back to the unused pool, then LRU — never a loop.
    const pick =
      options.theme === null
        ? await pickFreshSubject({ store, transport })
        : null;
    const brief = briefFor({
      index,
      theme: options.theme,
      count: options.brief.count,
      mock: options.mock,
      autoRevise: options.autoRevise,
      pick,
    });
    const theme = options.theme ?? pick.subject;
    const slug = options.slug ?? slugify(theme) ?? 'surprise-me';
    ({ runId } = store.createRun({ slug, theme, brief }));
    console.log(`run ${runId}`);
    if (pick) console.log(`surprise-me subject: ${theme} (${pick.source}${pick.style ? `, ${pick.style}` : ''})`);
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
  const context = { rules: rules.map((rule) => rule.text) };
  let result = await runPipeline({
    runId,
    store,
    transport,
    fresh: options.fresh,
    context,
  });

  // The pre-review fix loop (design.md D-14) — the same call the Review
  // Studio's runner makes, because a rule at one door is the repo's recurring
  // scar. autoReviseIfNeeded owns every reason not to fire and returns null
  // for all of them, so a CLI run with nothing to fix prints nothing new.
  if (result.status === 'complete') {
    const auto = await autoReviseIfNeeded({
      store,
      runId,
      attemptId: result.attemptId,
      transport,
      context,
    });
    if (auto) {
      console.log(
        `auto-revision (D-14): allowlisted findings on ${[
          ...new Set(auto.findings.flatMap((finding) => finding.setIds)),
        ].join(', ')} — revising as attempt ${auto.attemptId}`,
      );
      const revised = await runPipeline({ runId, store, transport, context });
      recordAutoRevisionOutcome({ store, runId, auto, result: revised });
      if (revised.status !== 'complete') {
        console.log(
          `auto-revision failed — the board at attempt ${auto.parentAttemptId} is still complete and reviewable`,
        );
      }
      result = revised;
    }
  }

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

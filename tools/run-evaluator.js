#!/usr/bin/env node
// run-evaluator — re-run ONE evaluator stage against ONE archived board.
//
//   node tools/run-evaluator.js --run <runId> --stage 08-style-guide
//                               [--attempt 0001] [--json] [--out <file>]
//
// Built for the question "what would TODAY'S evaluator say about that board?"
// — the before/after an evaluator's own edit history invites (unity landed at
// D-3, evocativeness at D-7; the boards they were added FOR predate them).
//
// Three rules, mirrored in the tests:
//
//   Evaluator stages only (05–08). Their input is derivable from a finished
//   attempt's blackboard; a generative stage re-run here would be a new
//   authoring run wearing an old run's clothes.
//
//   Input through the pipeline's own STAGE_INPUTS builders — one copy of
//   "what does this stage get asked", zero drift.
//
//   Strictly read-only on the run directory. A re-run is commentary, not
//   history: it writes to stdout and --out, never into studio/runs/.
//
// Needs ANTHROPIC_API_KEY (or .env) for the real call; tests inject a
// transport and touch no network. Zero dependencies, node:util parseArgs.

import { parseArgs } from 'node:util';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { STAGE_INPUTS } from '../studio/pipeline.js';
import { STAGES, stageById } from '../studio/stage-registry.js';
import { loadAgent } from '../studio/agents/index.js';
import { createBlackboard } from '../studio/blackboard.js';
import { createLlm, createAnthropicTransport } from '../studio/llm.js';
import { createRunStore } from '../studio/storage/run-store.js';
import {
  DEFAULT_CONFIG,
  effortFor,
  modelFor,
  maxTokensFor,
} from '../studio/pipeline-config.js';
import { loadRules } from '../studio/corpus/rules.js';
import { loadEnv } from '../studio/env.js';

const RUNS_DIR = fileURLToPath(new URL('../studio/runs/', import.meta.url));

// The stages whose input is a finished board: everything agentic between the
// integrity gate and the glossary author. Derived from the registry rather
// than written out, so a renamed stage cannot leave a stale copy here.
export const EVALUATOR_STAGE_IDS = Object.freeze(
  STAGES.filter((stage) => stage.kind === 'agent' && stage.id > '04a' && stage.id < '09')
    .map((stage) => stage.id),
);

const OPTIONS = {
  run: { type: 'string' },
  stage: { type: 'string' },
  attempt: { type: 'string' },
  json: { type: 'boolean', default: false },
  out: { type: 'string' },
};

function assertEvaluatorStage(stageId) {
  if (!EVALUATOR_STAGE_IDS.includes(stageId)) {
    throw new Error(
      `"${stageId}" is not an evaluator stage. This tool re-runs evaluators against a ` +
        `finished board; a generative stage needs upstream state a re-run cannot honestly ` +
        `reconstruct. Stages served: ${EVALUATOR_STAGE_IDS.join(', ')}.`,
    );
  }
}

/** Pure: argv → options. Refusals happen here, before anything is read. */
export function parseArgv(argv) {
  const { values } = parseArgs({ args: argv, options: OPTIONS, strict: true });
  if (!values.run) throw new Error('--run <runId> is required: which archived run holds the board.');
  if (!values.stage) {
    throw new Error(`--stage is required: one of ${EVALUATOR_STAGE_IDS.join(', ')}.`);
  }
  assertEvaluatorStage(values.stage);
  return {
    runId: values.run,
    stageId: values.stage,
    attemptId: values.attempt ?? null,
    json: values.json,
    out: values.out ?? null,
  };
}

/**
 * Re-run one evaluator. Reads the attempt's blackboard.json snapshot, rebuilds
 * the blackboard, builds the stage input through the pipeline's own builders,
 * sends ONE request, and validates with the agent's own validator.
 *
 * Returns { ok, runId, attemptId, stageId, output, validation, record } —
 * a validation failure is a reported result, never a retry: a demo that
 * quietly iterated until the answer looked right would not be evidence.
 */
export async function runEvaluator({
  store,
  runId,
  stageId,
  attemptId = null,
  transport,
  config = DEFAULT_CONFIG,
  context = null,
}) {
  assertEvaluatorStage(stageId);

  const manifest = store.readManifest(runId);
  const resolvedAttemptId = attemptId ?? manifest.currentAttemptId;
  if (!resolvedAttemptId) {
    throw new Error(`run ${runId} has no current attempt — pass --attempt explicitly.`);
  }

  const snapshot = store.readAttemptArtifact(runId, resolvedAttemptId, 'blackboard.json');
  const outputs = Object.fromEntries(
    Object.entries(snapshot.stages ?? {}).map(([id, stage]) => [id, stage.output]),
  );
  const blackboard = createBlackboard(outputs);

  const stage = stageById(stageId);
  const agent = loadAgent(stage.agent);
  const input = STAGE_INPUTS[stageId](blackboard, { manifest, config, revision: null });
  const effort = effortFor(stageId, config);
  const request = {
    stageId,
    model: modelFor(stageId, config),
    prompt: agent.buildPrompt(input, context),
    maxTokens: maxTokensFor(stageId, config),
    ...(effort ? { effort } : {}),
  };

  const llm = createLlm({ transport });
  const { text, record } = await llm.send(request);

  const parsed = agent.parse(text);
  const validation = parsed.ok
    ? agent.validateOutput(parsed.value, { input })
    : { ok: false, errors: [{ path: '', message: parsed.failure.message }] };

  return {
    ok: parsed.ok && validation.ok,
    runId,
    attemptId: resolvedAttemptId,
    stageId,
    output: parsed.ok ? parsed.value : null,
    validation,
    record: {
      model: record.model,
      effort: record.effort,
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
      durationMs: record.durationMs,
    },
  };
}

/** The human-readable rendering — a header of provenance, then the output. */
export function render(result) {
  const { runId, attemptId, stageId, output, validation, record } = result;
  const lines = [
    `${stageId} re-run against ${runId} (attempt ${attemptId})`,
    `model ${record.model} · effort ${record.effort ?? 'default'} · ` +
      `${record.inputTokens} in / ${record.outputTokens} out · ${record.durationMs}ms`,
    '',
  ];
  if (!result.ok) {
    lines.push('THE OUTPUT FAILED VALIDATION — reported as-is, not retried:');
    for (const error of validation.errors ?? []) {
      lines.push(`  ✗ ${error.path || '(output)'}: ${error.message}`);
    }
    lines.push('');
  }
  lines.push(JSON.stringify(output, null, 2));
  return lines.join('\n');
}

async function main() {
  const options = parseArgv(process.argv.slice(2));
  loadEnv();

  const store = createRunStore({ rootDir: RUNS_DIR });
  const rules = loadRules();
  const result = await runEvaluator({
    store,
    runId: options.runId,
    stageId: options.stageId,
    attemptId: options.attemptId,
    transport: createAnthropicTransport(),
    context: { rules: rules.map((rule) => rule.text) },
  });

  const text = options.json ? JSON.stringify(result, null, 2) : render(result);
  if (options.out) writeFileSync(options.out, `${text}\n`);
  console.log(text);
  process.exitCode = result.ok ? 0 : 1;
}

const invokedDirectly = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

// runner.js — the server's only door to the pipeline.
//
// A real run takes minutes, which is longer than anyone wants to hold an HTTP
// request open. So the API answers 202 and the run continues here, in-process,
// with the UI following `manifest.status` — which is already a state machine,
// so nothing new has to be invented to describe progress.
//
// What this module owns that the pipeline does not:
//
//   In-flight tracking, so a second start on the same run is refused before
//   the store has to. (The store's one-running-attempt guard is still the
//   authority; this just fails faster and with a better message.)
//
//   Crash capture. The pipeline records a StudioFailure as an outcome and
//   lets everything else escape — correct for a library, useless for a
//   background task whose caller has already gone home. An escaped error is
//   caught and parked on the run's state so the UI can show it.
//
// Transport construction happens up front, before any run directory is
// touched: a missing ANTHROPIC_API_KEY should be an error on the button
// press, not an orphan run that failed for reasons nobody can see.

import { runPipeline, requestRevision } from '../pipeline.js';
import { autoReviseIfNeeded, reconcileAutoRevisionOutcome } from '../auto-revise.js';
import { createAnthropicTransport } from '../llm.js';
import { createMockTransport } from '../mock-transport.js';
import { DEFAULT_CONFIG } from '../pipeline-config.js';
import { fileURLToPath } from 'node:url';

const FIXTURES_DIR = fileURLToPath(new URL('../fixtures/responses/', import.meta.url));

export const defaultTransport = ({ mock = false } = {}) =>
  mock ? createMockTransport({ fixturesDir: FIXTURES_DIR }) : createAnthropicTransport();

/**
 * @param wrapStore     optional store decorator (tests use it to inject faults)
 * @param loadContext   () => ({ rules, ... }) — the learning package handed to
 *                      every agent. Empty until the corpus fills it.
 * @param pipelineOptions extra options forwarded to runPipeline (clock/sleep/now)
 */
export function createRunner({
  store,
  makeTransport = defaultTransport,
  config = DEFAULT_CONFIG,
  loadContext = () => ({}),
  wrapStore = (s) => s,
  pipelineOptions = {},
}) {
  const state = new Map(); // runId → { running, startedAt, status?, error? }
  const inFlight = new Map(); // runId → Promise

  // A run remembers whether it was generated from fixtures, so a revision
  // cannot silently switch to the real API — and so a mock-derived board is
  // never mistaken for real editorial signal in the feedback corpus.
  const isMock = (runId, override) => {
    if (override !== undefined) return override;
    try {
      return store.readManifest(runId).brief?.mock === true;
    } catch {
      return false;
    }
  };

  function launch(runId, { mock, fresh = false, transport: prebuilt } = {}) {
    if (state.get(runId)?.running) {
      throw new Error(`run ${runId} is already running — one driver at a time`);
    }
    // Before anything is recorded: a bad key fails here, not halfway in.
    // `revise` builds it earlier still and hands it over, so a run never
    // constructs two.
    const transport = prebuilt ?? makeTransport({ mock: isMock(runId, mock) });

    state.set(runId, { running: true, startedAt: new Date().toISOString() });

    const wrapped = wrapStore(store);
    const run = (overrides = {}) =>
      runPipeline({
        runId,
        store: wrapped,
        transport,
        config,
        context: loadContext(),
        fresh,
        ...pipelineOptions,
        ...overrides,
      });

    const promise = (async () => {
      const clockOpt = pipelineOptions.clock ? { clock: pipelineOptions.clock } : {};
      let result = await run();

      // If THIS result is an auto-revision attempt whose outcome was never
      // recorded — a resume after a failure, a crash between the revision and
      // its record — settle the ledger now. Idempotent, and quiet for every
      // ordinary attempt.
      reconcileAutoRevisionOutcome({ store: wrapped, runId, result, ...clockOpt });

      // The pre-review fix loop (design.md D-14), inside this runner's
      // in-flight guard on purpose: while the proposer deliberates and the
      // revision runs, `running` stays true, so the UI keeps showing work in
      // progress and a concurrent manual revision is refused the same way a
      // second start is. autoReviseIfNeeded owns every reason not to fire —
      // the switches, the allowlist, the once-per-board bound — and returns
      // null for all of them.
      if (result.status === 'complete') {
        const auto = await autoReviseIfNeeded({
          runId,
          store: wrapped,
          transport,
          context: loadContext(),
          config,
          ...clockOpt,
          attemptId: result.attemptId,
        });
        if (auto) {
          // Never fresh: the revision child already exists, and `fresh` here
          // would abandon it for a blank re-roll of the whole run.
          const revised = await run({ fresh: false });
          reconcileAutoRevisionOutcome({ store: wrapped, runId, result: revised, ...clockOpt });
          // The revised attempt is what Max reviews — including when it
          // failed, because the failure page names the parent attempt that
          // still holds a complete board.
          result = revised;
        }
      }

      state.set(runId, { running: false, status: result.status });
      return result;
    })()
      .catch((error) => {
        // Not a recorded failure — a bug, or the filesystem going away.
        // Park it where the UI can see it rather than losing it to an
        // unhandled rejection.
        state.set(runId, { running: false, status: 'crashed', error: error.message });
        return { runId, status: 'crashed', error: error.message };
      })
      .finally(() => {
        inFlight.delete(runId);
      });

    inFlight.set(runId, promise);
    return promise;
  }

  return {
    /** Fire and forget. Throws only for problems visible before the run began. */
    start(runId, options) {
      launch(runId, options);
    },

    /** Opens the child attempt, then runs it. Returns the new attempt id. */
    revise(runId, { fromStage, notes, scope, mock } = {}) {
      if (state.get(runId)?.running) {
        throw new Error(`run ${runId} is already running — one driver at a time`);
      }
      // The transport is built BEFORE the child attempt exists. Getting this
      // order wrong leaves the run wedged in `revision-requested` around an
      // attempt that can never run — recoverable only by hand.
      const transport = makeTransport({ mock: isMock(runId, mock) });

      const attemptId = requestRevision(store, runId, { fromStage, notes, scope, config });
      launch(runId, { transport });
      return attemptId;
    },

    stateOf(runId) {
      return state.get(runId) ?? null;
    },

    /**
     * The settings THIS runner is holding — deliberately the closed-over
     * `config`, never a fresh read of pipeline-config.js.
     *
     * A server started before a config change keeps the old map: the import
     * happened once, at module load. Re-reading the file here would always
     * agree with the repo and would report a stale server as current, which is
     * the one thing this must not do. Cost of learning that the slow way:
     * ~$0.23 and a run whose recorded settings were not the settings it ran at.
     */
    configOf() {
      return {
        effortProfile: config.effortProfile ?? null,
        pricingVersion: config.pricingVersion ?? null,
      };
    },

    /** The in-flight promise, for tests and for draining on shutdown. */
    settled(runId) {
      return inFlight.get(runId) ?? Promise.resolve(state.get(runId) ?? null);
    },

    /** Waits for every in-flight run — used when the server shuts down. */
    drain() {
      return Promise.allSettled([...inFlight.values()]);
    },
  };
}

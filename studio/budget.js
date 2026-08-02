// budget — request, token, cost and duration enforcement.
//
// The cap lives here, at the orchestration layer, and nowhere else. Agents are
// pure and have no idea what they cost; llm.js knows how to retry but not when
// to stop. pipeline.js is the only caller.
//
// Three scopes, charged by the same call: the current stage, this attempt, and
// the whole run across all its attempts. Two rules from the spec are load
// bearing — failed calls count, because the spend happened either way, and a
// resumed attempt continues the run's accounting rather than restarting it
// (seeded through priorUsage).
//
// Exhaustion is TERMINAL_CONTENT via the existing StudioFailure: a run that
// cannot be paid for is a recorded outcome, not a new error taxonomy.

import { StudioFailure, TERMINAL_CONTENT } from './failures.js';

const METRICS = ['requests', 'tokens', 'costUsd', 'ms'];

const emptyUsage = (seed = {}) => ({
  requests: seed.requests ?? 0,
  tokens: seed.tokens ?? 0,
  costUsd: seed.costUsd ?? 0,
  ms: seed.ms ?? 0,
});

/**
 * @param limits   { perStage, perAttempt, perRun }, each an optional subset of
 *                 { requests, tokens, costUsd, ms }. An absent limit is not a
 *                 limit — never a cap of zero.
 * @param rates    model → { inputPerMTok, outputPerMTok }. Configuration, so
 *                 prices are revisable without touching enforcement.
 * @param priorUsage what this run already spent in earlier attempts.
 * @param priorAttemptUsage what THIS attempt already spent before it was
 *        interrupted. Seeding it is what makes a resumed attempt continue
 *        against its own caps instead of getting a fresh allowance.
 */
export function createBudget({ limits = {}, rates = {}, priorUsage, priorAttemptUsage } = {}) {
  const scopes = {
    stage: emptyUsage(),
    attempt: emptyUsage(priorAttemptUsage),
    run: emptyUsage(priorUsage),
  };
  const capFor = { stage: limits.perStage, attempt: limits.perAttempt, run: limits.perRun };
  const unpricedModels = new Set();
  let currentStage = null;

  function priceOf(model, inputTokens, outputTokens) {
    const rate = rates[model] ?? rates.default;
    if (!rate) {
      // Zero, but never silently: an unpriced model is visible in usage() and
      // in the attempt record rather than quietly under-counting the run.
      if (model !== undefined) unpricedModels.add(model);
      return 0;
    }
    return (
      (inputTokens / 1_000_000) * rate.inputPerMTok + (outputTokens / 1_000_000) * rate.outputPerMTok
    );
  }

  // Two thresholds, deliberately different. `charge` enforces "never exceed"
  // (spent > cap) — the ceiling. `check` enforces "there is something left"
  // (spent >= cap) before a stage begins, because starting work with nothing
  // left to spend on it only buys a guaranteed failure one call later.
  function enforce(exhaustedWhen) {
    for (const [scope, spent] of Object.entries(scopes)) {
      const caps = capFor[scope];
      if (!caps) continue;
      for (const metric of METRICS) {
        const cap = caps[metric];
        if (cap === undefined) continue;
        if (exhaustedWhen(spent[metric], cap)) {
          throw new StudioFailure(
            TERMINAL_CONTENT,
            `budget exhausted: ${scope} ${metric} ${round(spent[metric])} against cap ${cap}` +
              (currentStage ? ` (at ${currentStage})` : ''),
            { scope, metric, spent: spent[metric], cap, stageId: currentStage },
          );
        }
      }
    }
  }

  const check = () => enforce((spent, cap) => spent >= cap);

  return {
    beginStage(stageId) {
      currentStage = stageId;
      scopes.stage = emptyUsage();
    },

    /**
     * Charges one llm.send() worth of work. Called for successes and failures
     * alike — the request record from either path carries the same numbers.
     * Throws the moment a cap is breached, so no caller can forget to look.
     */
    charge({ model, requests = 0, inputTokens = 0, outputTokens = 0, ms = 0 } = {}) {
      const delta = {
        requests,
        tokens: inputTokens + outputTokens,
        costUsd: priceOf(model, inputTokens, outputTokens),
        ms,
      };
      for (const spent of Object.values(scopes)) {
        for (const metric of METRICS) spent[metric] += delta[metric];
      }
      enforce((spent, cap) => spent > cap);
    },

    check,

    usage() {
      return {
        stage: { ...scopes.stage, costUsd: round(scopes.stage.costUsd) },
        attempt: { ...scopes.attempt, costUsd: round(scopes.attempt.costUsd) },
        run: { ...scopes.run, costUsd: round(scopes.run.costUsd) },
        unpricedModels: [...unpricedModels],
      };
    },
  };
}

// Cost is money in a stored record; float dust in a run directory is noise.
const round = (value) => Math.round(value * 1e6) / 1e6;

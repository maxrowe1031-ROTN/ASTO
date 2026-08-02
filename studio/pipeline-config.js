// pipeline-config — models, retry limits, budget caps and prices.
//
// Pure data, deliberately: the numbers that decide what a run costs and how
// hard it tries should be reviewable without reading the orchestrator. There
// is no logic here beyond two lookups.
//
// Model tiering is the approved spec's, not a fresh decision — see
// docs/superpowers/specs/2026-08-02-asto-studio-design.md, "Budget and
// execution limits": Sonnet for the reasoning agents, Haiku for the narrow
// checkers. A5 (evaluation) is where those get revisited with measured data.

const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
};

const REASONING = 'claude-sonnet-5';
const CHECKER = 'claude-haiku-4-5-20251001';

export const DEFAULT_CONFIG = deepFreeze({
  // Bumped whenever a rate below changes, so a stored cost stays interpretable
  // long after the price it was computed from has moved.
  pricingVersion: '2026-08-02',

  // USD per million tokens. Sonnet is listed at its standard rate rather than
  // the introductory one — a cap computed from the cheaper price would stop
  // enforcing the moment the intro period ends.
  rates: {
    [REASONING]: { inputPerMTok: 3, outputPerMTok: 15 },
    [CHECKER]: { inputPerMTok: 1, outputPerMTok: 5 },
    'mock-model': { inputPerMTok: 0, outputPerMTok: 0 },
  },

  models: {
    default: REASONING,
    byStage: {
      '03-difficulty-rater': CHECKER,
      '05-analogy-validator': CHECKER,
      '08-style-guide': CHECKER,
    },
  },

  // max_tokens caps thinking AND response text together, and Sonnet 5 runs
  // adaptive thinking by default (we send no `thinking` parameter). The
  // Development Brain records this exact failure from the prototype crew —
  // "Sonnet-5 returned empty (thinking-by-default consumed the token budget)"
  // — so the budget has headroom rather than sitting at a value the thinking
  // alone could swallow. This is a ceiling, not a spend: only tokens actually
  // produced are billed, and budget.js caps the real spend.
  maxTokens: { default: 16_000 },

  // Two bounds, because there are two failure classes and they are retried by
  // different owners. `transport` bounds llm.js's own loop (timeouts, 429s,
  // truncation) — it can retry those without help. `validation` bounds the
  // pipeline's loop, which is the only place that can send the model concise
  // feedback about why its last output was rejected. Both are small and
  // explicit; neither nests inside the other.
  retries: { transport: 3, validation: 2 },

  // The 04a gate sends a rejected board back to the Board Builder this many
  // times before giving up. Bounded: no unbounded self-repair loops.
  maxIntegrityRetries: 2,

  // Spec default: max 3 AI revision attempts per run.
  maxRevisions: 3,

  // An absent metric is not a cap. Cost caps only bite once every model in
  // play is priced — token and request caps are exact regardless.
  limits: {
    perStage: { requests: 12, tokens: 200_000, ms: 300_000 },
    perAttempt: { requests: 60, tokens: 1_000_000, costUsd: 5, ms: 1_800_000 },
    perRun: { requests: 240, tokens: 4_000_000, costUsd: 20, ms: 7_200_000 },
  },
});

export function modelFor(stageId, config = DEFAULT_CONFIG) {
  // The integrity gate is deterministic code — it has no model, and saying so
  // explicitly keeps a missing entry from silently resolving to the default.
  if (stageId === '04a-integrity') return null;
  return config.models.byStage[stageId] ?? config.models.default;
}

export function maxTokensFor(stageId, config = DEFAULT_CONFIG) {
  return config.maxTokens[stageId] ?? config.maxTokens.default;
}

export function retriesFor(stageId, config = DEFAULT_CONFIG) {
  return config.retries[stageId] ?? config.retries;
}

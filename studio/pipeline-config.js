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

// A board is four sets of two pairs, so eight pairs is the arithmetic minimum
// with nothing to spare — and the Theme Grouper always sets some pairs aside,
// because forcing an incoherent pair into a set is worse than dropping it. A
// brief with no slack is therefore a run that can only succeed if nothing is
// discarded, which is not how grouping goes: on 2026-08-03 a count of 8 lost
// two pairs, yielded three sets, and cost $0.16 before anyone found out.
//
// The floor buys room for two discarded pairs; the default buys room for three
// and is the count that produced this pipeline's first complete board.
//
// These live here rather than beside one driver because the constraint belongs
// to the pipeline, not to whatever started it. They were first written into
// the Review Studio's API alone, and `run.js` went on defaulting to 8 — the
// same failure, still reachable, just by the other door.
export const MIN_PAIR_COUNT = 12;
export const DEFAULT_PAIR_COUNT = 14;
export const MAX_PAIR_COUNT = 16;

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
  //
  // 16k is also about the practical limit for a non-streaming request before
  // HTTP timeouts start to bite, which is what this transport makes.
  maxTokens: { default: 16_000 },

  // How hard each stage thinks. Effort is the lever adaptive thinking left us:
  // the old one, a fixed `budget_tokens`, is now rejected outright. Disabling
  // thinking is the cheaper option and is what the prototype crew did, but its
  // agents only emitted JSON — ours rate difficulty and hunt for alternate
  // solutions, and that is reasoning we are paying for on purpose.
  //
  // There is no `default` key here, deliberately. Effort is an error on Haiku
  // 4.5, so the checker stages must send no output_config at all, and a
  // default would quietly put one on every request. An absent entry means
  // absent, not "fall back to something".
  //
  // Re-aimed 2026-08-03 from measurement rather than analogy. These started
  // at 04 = xhigh on the strength of the handbook's crew post-mortem
  // (section 3: assembly, not generation, is the constraint-satisfaction
  // problem). That was true of THEIR builder, which assembled from a raw
  // pool. Ours picks four sets from a pre-graded pool of five, no longer
  // authors a set (D-1), and no longer verifies uniqueness — a checker does
  // that exhaustively straight afterwards. What was left did not need the
  // pipeline's deepest setting: 04 alone was $0.244 and 166s of a $0.52,
  // 347s run, with 94% of its billed output going to thinking behind an
  // 876-token answer.
  //
  // 06 stays high on purpose. It is the one stage whose entire job is
  // catching what everything else missed, and it is the last thing between a
  // flawed board and Max's time.
  //
  // 01 was held back from that pass on purpose, so the 02/04 measurement had
  // an unchanged stage to read against. With that measurement in, 01 is the
  // remaining problem: ~44% of a run, and the pipeline's most volatile line —
  // 2,681 / 2,825 / 12,008 output tokens across three runs at IDENTICAL
  // settings. A stage swinging 4.5× run to run is not spending that budget on
  // anything reproducible, which is the same shape 04 had before it dropped.
  // Lowered 2026-08-03. Note what this means for the measurement afterwards:
  // at that variance a single run cannot prove the change worked, so the
  // evidence to look for is the size of the drop and the thinking share, not
  // the total.
  effort: {
    '01-pair-author': 'medium',
    '02-theme-grouper': 'medium',
    '04-board-builder': 'medium',
    '06-adversarial-solver': 'high',
    '07-test-player': 'medium',
  },

  // Bumped whenever the effort map above changes, for the same reason
  // pricingVersion exists: a recorded cost or duration is only interpretable
  // beside the settings that produced it. Stamped onto every attempt, so the
  // review corpus can answer "did the cheaper profile make worse boards?"
  // from judgements Max is making anyway.
  // The string must change with the map, not just when it feels significant:
  // boards built under two different maps are two populations, and reusing one
  // label would merge them inside the very corpus meant to tell them apart.
  effortProfile: '2026-08-03-lean-2',

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

// Null means "send no output_config", which is a different thing from a low
// effort — on a model that rejects the parameter, the two are success and 400.
export function effortFor(stageId, config = DEFAULT_CONFIG) {
  return config.effort?.[stageId] ?? null;
}

export function retriesFor(stageId, config = DEFAULT_CONFIG) {
  return config.retries[stageId] ?? config.retries;
}

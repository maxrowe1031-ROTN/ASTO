// glossary-backfill.js — retrofitting D-18's Vocabulary button onto boards
// published before stage 09 existed.
//
// Only 2 of 48 published boards carry a glossary, because the glossary author
// only runs inside pipeline runs. This module gives every older board the same
// treatment through the same seams: 07's knowledgeGated flags are read from the
// run that published the board (joined via decisions.jsonl, exactly as the
// review page joins them), the gloss comes from the same glossary-author agent
// with its own leak validators binding, and the write goes through
// puzzle-store.publish — still the only door into puzzles/.
//
// The split Max chose: a board whose run FLAGGED a word is auto-applied (the
// flag is evidence of where the wall is, and the validator forces the gloss to
// define a flagged word); a board with no flags — or no run at all — waits in
// a review file for his edit, because there the author picked the word itself.
//
// Boundary law: no fetch (the model is reached through llm.js), and the only
// fs in this module is through the two injected stores.

import { loadAgent } from './agents/index.js';
import { createLlm } from './llm.js';
import { DEFAULT_CONFIG, effortFor, maxTokensFor, modelFor } from './pipeline-config.js';

const GLOSSARY_STAGE = '09-glossary-author';

/**
 * Every published board, joined to the run that published it and to 07's
 * knowledgeGated flags from that run's current attempt.
 *
 * The join reads publish events from each run's decisions.jsonl — the same
 * record D-6 writes and the review page reads. A slug published twice belongs
 * to the run that published it last. Missing or unreadable artifacts degrade,
 * never throw: a board with no run (hand-authored, pre-D-6) joins with
 * `runId: null` and empty flags, which downstream treats as "the author picks
 * the word itself".
 */
export function joinPublishedBoards({ puzzles, runs }) {
  // slug → { runId, attemptId } from the last publish event that names it.
  const publishedBy = new Map();
  for (const runId of runs.listRuns()) {
    let decisions;
    try {
      decisions = runs.readDecisions(runId);
    } catch {
      continue;
    }
    for (const event of decisions) {
      if (event.type !== 'publish' || typeof event.publishedAs !== 'string') continue;
      const slug = event.publishedAs.replace(/\.json$/, '');
      publishedBy.set(slug, { runId, attemptId: event.attemptId ?? null });
    }
  }

  const entries = [];
  for (const { slug } of puzzles.list()) {
    let board;
    try {
      board = puzzles.read(slug);
    } catch {
      continue;
    }
    const skip = Array.isArray(board.glossary) && board.glossary.length > 0;
    const source = publishedBy.get(slug) ?? null;

    let knowledgeGated = [];
    if (source) {
      try {
        const attemptId =
          source.attemptId ?? runs.readManifest(source.runId).currentAttemptId;
        const output = runs.readStageArtifact(
          source.runId,
          attemptId,
          '07-test-player',
          'output.json',
        );
        if (Array.isArray(output?.knowledgeGated)) knowledgeGated = output.knowledgeGated;
      } catch {
        // No 07 artifact on that attempt — the entry degrades to the
        // author's-own-pick path rather than failing the whole join.
      }
    }

    entries.push({ slug, board, runId: source?.runId ?? null, knowledgeGated, skip });
  }
  return entries;
}

/**
 * The review split. `auto` has evidence (07 flagged a word, and the agent's
 * validator will force the gloss onto a flagged word); `review` is the
 * author's own pick and waits for Max; `skipped` already carries a glossary.
 */
export function partition(entries) {
  const auto = [];
  const review = [];
  const skipped = [];
  for (const entry of entries) {
    if (entry.skip) skipped.push(entry);
    else if (entry.knowledgeGated.length > 0) auto.push(entry);
    else review.push(entry);
  }
  return { auto, review, skipped };
}

/**
 * One gloss for one board — the proposer-style bounded loop over the same
 * glossary-author agent the pipeline runs, with `validateOutput` given the
 * input so the flagged-word and leak checks bind.
 *
 * Never throws. Returns `{ ok: true, gloss }` or `{ ok: false, failure }`
 * where the failure carries each round's validation errors and the model's
 * last raw reply — an absent gloss and a failed one must not look alike
 * (design.md, the D-5 amendment).
 */
export async function authorGloss({ entry, transport, config = DEFAULT_CONFIG, context = {} }) {
  const agent = loadAgent('glossary-author');
  const input = { board: entry.board, knowledgeGated: entry.knowledgeGated };

  const llm = createLlm({ transport });
  const effort = effortFor(GLOSSARY_STAGE, config);
  const request = {
    stageId: GLOSSARY_STAGE,
    model: modelFor(GLOSSARY_STAGE, config),
    prompt: agent.buildPrompt(input, context),
    maxTokens: maxTokensFor(GLOSSARY_STAGE, config),
    // Spread rather than set: an absent effort must reach the transport as an
    // absent key, since some models reject the parameter outright.
    ...(effort ? { effort } : {}),
  };

  const rounds = [];
  let lastReply = null;

  try {
    let feedbackForRetry;
    for (let round = 1; round <= 2; round += 1) {
      const { text } = await llm.send(request, { maxAttempts: 2, feedback: feedbackForRetry });
      lastReply = text;
      const parsed = agent.parse(text);
      const validation = parsed.ok
        ? agent.validateOutput(parsed.value, { input })
        : parsed.failure;

      if (parsed.ok && validation.ok) {
        return { ok: true, gloss: parsed.value.glossary[0] };
      }

      const errors = parsed.ok
        ? validation.errors
        : [{ path: '(parse)', message: validation.message }];
      rounds.push({ round, errors });

      feedbackForRetry = `Your previous reply was rejected: ${errors
        .map((e) => `${e.path}: ${e.message}`)
        .join('; ')}. Reply with corrected JSON only.`;
    }

    return {
      ok: false,
      failure: {
        slug: entry.slug,
        category: 'invalid-output',
        message: 'the model answered twice and neither reply was a valid gloss',
        rounds,
        reply: lastReply,
      },
    };
  } catch (error) {
    return {
      ok: false,
      failure: {
        slug: entry.slug,
        category: error.category ?? 'transport',
        message: error.message,
        rounds,
        reply: lastReply,
      },
    };
  }
}

/**
 * An edited entry re-validated before it is applied — Max's edit could
 * introduce a leak just as the model's draft could. Same validators, with
 * empty flags so the check is "a board word, leaking nothing" rather than
 * "one of the flagged words" (his edit may deliberately choose a different
 * word; the flags were guidance, his judgement is the authority).
 */
export function validateEditedGloss({ board, gloss }) {
  const agent = loadAgent('glossary-author');
  return agent.validateOutput(
    { glossary: [gloss] },
    { input: { board, knowledgeGated: [] } },
  );
}

/**
 * Writes one gloss onto one published board, through the only door: the board
 * is re-read from disk, gains exactly `glossary: [gloss]`, and goes back
 * through `publish` — which re-runs the game's own schema validation and the
 * integrity sweep, and regenerates the manifest. Nothing else about the board
 * changes.
 */
export function applyGloss({ puzzles, slug, gloss }) {
  const board = puzzles.read(slug);
  const withGloss = {
    ...board,
    glossary: [{ word: gloss.word, definition: gloss.definition }],
  };
  return puzzles.publish({ board: withGloss, slug, replace: true });
}

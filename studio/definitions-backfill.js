// definitions-backfill.js — giving every published board its sixteen Learning
// Mode definitions (design.md D-33), through the seams that already exist: the
// same definitions-author agent the pipeline runs at stage 10, and
// puzzle-store.publish as the only door into puzzles/.
//
// No review file, by Max's call (2026-09-05): every result auto-applies. The
// leak rule is relaxed for these definitions, so a bad one is a flat sentence,
// not a broken board — and the validator still holds the line on completeness.
//
// Boundary law: no fetch (the model is reached through llm.js), and the only
// fs in this module is through the injected puzzle store.

import { loadAgent } from './agents/index.js';
import { createLlm } from './llm.js';
import { DEFAULT_CONFIG, effortFor, maxTokensFor, modelFor } from './pipeline-config.js';
import { deriveWords } from '../src/engine/arrangements.js';

const STAGE = '10-definitions-author';

/** Every published board short of sixteen definitions, with how many it lacks. */
export function listBoardsNeedingDefinitions({ puzzles }) {
  const entries = [];
  for (const { slug } of puzzles.list()) {
    let board;
    try {
      board = puzzles.read(slug);
    } catch {
      continue;
    }
    const words = new Set(deriveWords(board.sets).map((word) => word.toLowerCase()));
    const have = new Set(
      (board.definitions ?? [])
        .map((entry) => entry.word.toLowerCase())
        .filter((word) => words.has(word)),
    );
    const missing = words.size - have.size;
    if (missing > 0) entries.push({ slug, board, missing });
  }
  return entries;
}

/**
 * Sixteen definitions for one board — the bounded two-round loop the glossary
 * backfill uses, with the agent's own validator binding. Never throws.
 * Returns `{ ok: true, definitions }` or `{ ok: false, failure }` where the
 * failure carries each round's validation errors and the model's last raw
 * reply — an absent result and a failed one must not look alike (D-5).
 */
export async function authorDefinitions({ entry, transport, config = DEFAULT_CONFIG, context = {} }) {
  const agent = loadAgent('definitions-author');
  const input = { board: entry.board };

  const llm = createLlm({ transport });
  const effort = effortFor(STAGE, config);
  const request = {
    stageId: STAGE,
    model: modelFor(STAGE, config),
    prompt: agent.buildPrompt(input, context),
    maxTokens: maxTokensFor(STAGE, config),
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
      const validation = parsed.ok ? agent.validateOutput(parsed.value, { input }) : parsed.failure;

      if (parsed.ok && validation.ok) return { ok: true, definitions: parsed.value.definitions };

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
        message: 'the model answered twice and neither reply was a valid set of definitions',
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
 * Writes the definitions onto one published board through the only door. The
 * board is re-read, gains exactly `definitions`, and goes back through
 * `publish` — schema validation and the integrity sweep run again. Nothing
 * else about the board changes.
 */
export function applyDefinitions({ puzzles, slug, definitions }) {
  const board = puzzles.read(slug);
  const withDefinitions = {
    ...board,
    definitions: definitions.map(({ word, definition }) => ({ word, definition })),
  };
  return puzzles.publish({ board: withDefinitions, slug, replace: true });
}

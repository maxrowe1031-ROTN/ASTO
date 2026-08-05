// proposer.js — runs the Revision Proposer when Max rejects a board.
//
// Sits beside runner.js and for the same reason: api.js routes and validates,
// and does not know how to talk to a model. This module owns assembling the
// proposer's input from run artifacts, calling it through `llm.js` (which keeps
// the only fetch), and writing the result through `run-store` (which keeps the
// only writes). The agent itself stays pure.
//
// It runs once, at review time, and only on a rejection or a
// publishable-after-fix — never on an approval, and never speculatively. A
// proposal for a board Max liked is spend with nothing to buy.

import { loadAgent } from '../agents/index.js';
import { createLlm } from '../llm.js';
import { DEFAULT_CONFIG, effortFor, maxTokensFor, modelFor } from '../pipeline-config.js';
import { resolveShape } from '../corpus/vocabulary.js';

export const PROPOSER_STAGE = '09-revision-proposer';

// The evaluator outputs the proposer reads as evidence. The gate is left out:
// it is deterministic and a board that reached review already passed it.
const EVALUATOR_STAGES = [
  '05-analogy-validator',
  '06-adversarial-solver',
  '07-test-player',
  '08-style-guide',
];

/** The verdicts that mean "this board is not publishable as it stands". */
export const REJECTING_ACTIONS = new Set(['reject-board', 'revise-board']);

/** True when a batch of feedback contains a board verdict worth proposing on. */
export const wantsProposal = (events = []) =>
  events.some((event) => event.scope?.type === 'board' && REJECTING_ACTIONS.has(event.action));

/**
 * Builds the proposer's input from what is on disk plus the feedback just
 * saved. Pure apart from the store reads, and exported so a test can check the
 * assembly without a model.
 */
export function buildInput(store, runId, attemptId, feedback) {
  const board = store.readAttemptArtifact(runId, attemptId, 'board.json');

  const findings = {};
  for (const stageId of EVALUATOR_STAGES) {
    try {
      findings[stageId] = store.readStageArtifact(runId, attemptId, stageId, 'output.json');
    } catch {
      // A revision re-entering late may not have re-run every evaluator. Its
      // absence is not a failure; the proposer simply has less evidence.
    }
  }

  // Only the shapes actually on this board, so the proposer knows what kind of
  // question each set is asking — and what that kind fails at.
  let vocabulary = [];
  try {
    const grouped = store.readStageArtifact(runId, attemptId, '02-theme-grouper', 'output.json');
    vocabulary = (grouped.sets ?? [])
      .map((set) => {
        const shape = resolveShape(set.shape);
        return shape ? { setId: set.id, stance: shape.stance, ...shape } : null;
      })
      .filter(Boolean);
  } catch {
    // Same as above: evidence, not a requirement.
  }

  return { board, feedback, findings, vocabulary };
}

/**
 * Runs the proposer and stores its brief. Returns the proposal, or null when
 * the model could not produce a valid one — a failed proposal is never fatal,
 * because Max can always write revision notes himself.
 *
 * @param transport injected, exactly as the pipeline does it, so tests replay
 *                  a fixture and mock runs never reach the API.
 */
export async function proposeRevision({
  store,
  runId,
  attemptId,
  feedback,
  transport,
  context = {},
  config = DEFAULT_CONFIG,
  clock,
}) {
  const agent = loadAgent('revision-proposer');
  const input = buildInput(store, runId, attemptId, feedback);

  const llm = createLlm({ transport, ...(clock ? { clock } : {}) });
  const effort = effortFor(PROPOSER_STAGE, config);
  const request = {
    stageId: PROPOSER_STAGE,
    model: modelFor(PROPOSER_STAGE, config),
    prompt: agent.buildPrompt(input, context),
    maxTokens: maxTokensFor(PROPOSER_STAGE, config),
    // Spread rather than set: an absent effort must reach the transport as an
    // absent key, since some models reject the parameter outright.
    ...(effort ? { effort } : {}),
  };

  // One validation retry, not the pipeline's loop: a brief is advisory, and if
  // the model cannot produce a usable one twice, Max writes revision notes
  // himself exactly as he does today. Nothing here is allowed to be fatal.
  try {
    let feedbackForRetry;
    for (let round = 1; round <= 2; round += 1) {
      const { text } = await llm.send(request, { maxAttempts: 2, feedback: feedbackForRetry });
      const parsed = agent.parse(text);
      const validation = parsed.ok
        ? agent.validateOutput(parsed.value, { board: input.board })
        : parsed.failure;

      if (parsed.ok && validation.ok) {
        store.writeStageText(runId, attemptId, PROPOSER_STAGE, 'prompt.txt', request.prompt);
        store.writeStageText(runId, attemptId, PROPOSER_STAGE, 'response.txt', text);
        store.writeStageArtifact(runId, attemptId, PROPOSER_STAGE, 'output.json', parsed.value);
        store.writeAttemptArtifact(runId, attemptId, 'revision-proposal.json', parsed.value);
        return parsed.value;
      }
      feedbackForRetry = `Your previous reply was rejected: ${
        parsed.ok
          ? validation.errors.map((e) => `${e.path}: ${e.message}`).join('; ')
          : validation.message
      }. Reply with corrected JSON only.`;
    }
    return null;
  } catch (error) {
    // Recorded, never thrown: the review page must still save Max's feedback,
    // which is the irreplaceable half of this transaction.
    store.writeStageArtifact(runId, attemptId, PROPOSER_STAGE, 'failure.json', {
      message: error.message,
      category: error.category ?? 'unknown',
    });
    return null;
  }
}

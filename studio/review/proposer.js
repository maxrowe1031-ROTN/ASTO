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

// One brief per attempt, at run level: an attempt is immutable once complete,
// and the proposal is written after review, so it belongs beside feedback.jsonl
// rather than inside the attempt whose work it comments on.
export const proposalFile = (attemptId) => `revision-proposal-${attemptId}.json`;

// Its counterpart, and the reason it exists: a brief that never arrives has to
// say so. On 2026-08-06 the Harry Potter run carried a `revise-board` verdict
// and no proposal, and re-running the proposer by hand produced a good brief on
// the first try — so what went wrong the first time was unknowable by
// construction. Absence looked exactly like "not attempted".
export const proposalFailureFile = (attemptId) => `revision-proposal-${attemptId}-failure.json`;

// The evaluator outputs the proposer reads as evidence. The gate is left out:
// it is deterministic and a board that reached review already passed it.
const EVALUATOR_STAGES = [
  '05-analogy-validator',
  '06-adversarial-solver',
  '07-test-player',
  '08-style-guide',
];

/**
 * The one verdict worth proposing on: "publishable after a fix".
 *
 * Not a hard rejection, deliberately. `rejected` is a TERMINAL run status —
 * it leads only to `archived` — so a board Max has rejected outright has no
 * revision to request, and a brief proposing one would be spend with nothing
 * to buy. "Publishable after a fix" is precisely the state where a revision is
 * both possible and wanted, and it is the state his own rule describes: the
 * whole is not publishable yet, the individual analogies are mostly fine.
 */
export const REJECTING_ACTIONS = new Set(['revise-board']);

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
 * Records why a brief never arrived, so an absent proposal is never silent.
 *
 * Both empty exits below write the same shape through `run-store` — the only
 * writer of run artifacts — and neither is allowed to raise: the review page
 * must still save Max's feedback, which is the irreplaceable half of this
 * transaction. A recorder that could throw would trade the valuable half of
 * the work for the advisory half.
 */
function recordFailure(store, runId, attemptId, fields) {
  try {
    store.writeRunArtifact(runId, proposalFailureFile(attemptId), { attemptId, ...fields });
  } catch {
    // Nothing left to do: the trace itself is what could not be written. The
    // caller still returns null, and the page still works.
  }
}

/**
 * Runs the proposer and stores its brief. Returns the proposal, or null when
 * the model could not produce a valid one — a failed proposal is never fatal,
 * because Max can always write revision notes himself.
 *
 * Null is never bare, though: every path out of here that returns null leaves a
 * failure artifact behind it.
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

  const at = clock ?? (() => new Date().toISOString());
  // What each round got wrong, and the last thing the model actually said.
  // Kept rather than folded away into the retry string, because "it could not
  // produce a valid brief" is not a diagnosis — the reply is.
  const rounds = [];
  let lastReply = null;

  // One validation retry, not the pipeline's loop: a brief is advisory, and if
  // the model cannot produce a usable one twice, Max writes revision notes
  // himself exactly as he does today. Nothing here is allowed to be fatal.
  try {
    let feedbackForRetry;
    for (let round = 1; round <= 2; round += 1) {
      const { text } = await llm.send(request, { maxAttempts: 2, feedback: feedbackForRetry });
      lastReply = text;
      const parsed = agent.parse(text);
      const validation = parsed.ok
        ? agent.validateOutput(parsed.value, { board: input.board })
        : parsed.failure;

      if (parsed.ok && validation.ok) {
        // A RUN artifact, and the store taught this the hard way twice: it
        // refuses an unregistered stage id (the proposer is deliberately not a
        // pipeline stage) and refuses any write into a completed attempt
        // ("completed work is never rewritten"). Both are right — an attempt
        // directory records what the PIPELINE did, and a brief written during
        // review is not that. So it lives at run level beside feedback.jsonl,
        // with the prompt along for the audit every stage keeps.
        store.writeRunArtifact(runId, proposalFile(attemptId), {
          ...parsed.value,
          attemptId,
          prompt: request.prompt,
          model: request.model,
        });
        return parsed.value;
      }

      const errors = parsed.ok
        ? validation.errors
        : [{ path: '(parse)', message: validation.message }];
      rounds.push({ round, errors });

      feedbackForRetry = `Your previous reply was rejected: ${errors
        .map((e) => `${e.path}: ${e.message}`)
        .join('; ')}. Reply with corrected JSON only.`;
    }

    // The path that used to be a bare `return null`. The model answered twice
    // and neither answer was usable — a real, reportable outcome, and the one
    // that left no trace at all until now.
    recordFailure(store, runId, attemptId, {
      category: 'invalid-output',
      message: 'the model answered twice and neither reply was a valid brief',
      at: at(),
      rounds,
      prompt: request.prompt,
      model: request.model,
      reply: lastReply,
    });
    return null;
  } catch (error) {
    // Recorded, never thrown: the review page must still save Max's feedback,
    // which is the irreplaceable half of this transaction.
    recordFailure(store, runId, attemptId, {
      category: error.category ?? 'unknown',
      message: error.message,
      at: at(),
      // Same fields as the path above, so one reader understands both records.
      // A throw can happen on round 2, and what round 1 got wrong is evidence.
      rounds,
      prompt: request.prompt,
      model: request.model,
      reply: lastReply,
    });
    return null;
  }
}

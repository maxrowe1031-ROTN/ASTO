// The Revision Proposer's orchestration — the half that is not the agent.
//
// `revision-proposer.test.js` covers the pure agent: what a valid brief is.
// This covers what happens around it — what reaches the model, what lands in
// the run directory, and above all what is left behind when no brief arrives.
//
// That last one is why this file exists. On 2026-08-06 the Harry Potter run
// carried a `revise-board` verdict and no proposal, and re-running the proposer
// by hand produced a good brief on the first try. What went wrong the first
// time is unknowable, because the path where the model simply cannot produce a
// valid brief in two rounds ended in a bare `return null` — no artifact, no
// event, nothing. An absent brief and a failed one looked identical.
//
// Every test here runs on an injected transport. Zero network, zero credit.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildInput,
  proposalFailureFile,
  proposalFile,
  proposeRevision,
} from '../../../studio/review/proposer.js';
import { makeStore } from '../pipeline/helpers.js';

const BOARD = {
  id: 'asto-lantern',
  title: 'Lantern',
  sets: [
    { id: 'set-a', relationshipLabel: 'A', explanation: 'e', difficulty: 1, pairs: [['Seed', 'Tree'], ['Spark', 'Fire']] },
    { id: 'set-b', relationshipLabel: 'B', explanation: 'e', difficulty: 2, pairs: [['Brush', 'Painter'], ['Chisel', 'Sculptor']] },
    { id: 'set-c', relationshipLabel: 'C', explanation: 'e', difficulty: 3, pairs: [['Nest', 'Bird'], ['Den', 'Bear']] },
    { id: 'set-d', relationshipLabel: 'D', explanation: 'e', difficulty: 4, pairs: [['Dough', 'Bread'], ['Clay', 'Pottery']] },
  ],
};

const FEEDBACK = [
  {
    action: 'revise-board',
    scope: { type: 'board' },
    tags: ['relationship-does-not-click'],
    note: 'three sets are good, the fourth breaks it',
  },
];

const VALID_BRIEF = {
  summary: 'One set blocks the board.',
  fromStage: '04-board-builder',
  fixes: [
    {
      setId: 'set-d',
      problem: 'the pairs are not at the same grain',
      source: 'max',
      candidates: ['Dough : Bread :: Grape : Wine'],
    },
  ],
  doNotChange: ['set-a'],
};

/** A run parked with a board to propose against — what review time looks like. */
function seedRun(store) {
  const { runId } = store.createRun({ slug: 'lantern', theme: 'Lantern light', brief: { count: 8 } });
  const attemptId = store.createAttempt(runId);
  store.updateStatus(runId, 'running');
  store.writeAttemptArtifact(runId, attemptId, 'board.json', BOARD);
  return { runId, attemptId };
}

/**
 * A transport that replies with each entry in turn, and records what it was
 * sent. An entry that is an Error is thrown rather than returned.
 */
function scriptedTransport(replies) {
  const sent = [];
  const queue = [...replies];
  const transport = async (outbound) => {
    sent.push(outbound);
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next instanceof Error) throw next;
    return { text: typeof next === 'string' ? next : JSON.stringify(next), stopReason: 'end_turn' };
  };
  transport.sent = sent;
  return transport;
}

const propose = (store, runId, attemptId, transport) =>
  proposeRevision({ store, runId, attemptId, feedback: FEEDBACK, transport, context: {} });

// --- the happy path, so the failure paths mean something ---

test('a valid brief is returned and stored beside feedback.jsonl', async () => {
  const { store, cleanup } = makeStore();
  try {
    const { runId, attemptId } = seedRun(store);

    const proposal = await propose(store, runId, attemptId, scriptedTransport([VALID_BRIEF]));

    assert.equal(proposal.summary, 'One set blocks the board.');
    const stored = store.readRunArtifact(runId, proposalFile(attemptId));
    assert.equal(stored.fromStage, '04-board-builder');
    // The prompt travels with the brief, as every stage's audit does.
    assert.ok(stored.prompt.length > 0);
    assert.equal(stored.attemptId, attemptId);
    // Nothing failed, so nothing claims it did.
    assert.equal(store.hasRunArtifact(runId, proposalFailureFile(attemptId)), false);
  } finally {
    cleanup();
  }
});

test('one bad reply is retried, and the correction is what gets stored', async () => {
  const { store, cleanup } = makeStore();
  try {
    const { runId, attemptId } = seedRun(store);
    const transport = scriptedTransport(['not json at all', VALID_BRIEF]);

    const proposal = await propose(store, runId, attemptId, transport);

    assert.equal(proposal.summary, 'One set blocks the board.');
    assert.equal(transport.sent.length, 2);
    // The retry is told what was wrong rather than just re-rolling.
    assert.match(transport.sent[1].prompt, /previous reply was rejected/);
  } finally {
    cleanup();
  }
});

// --- the gap this file was written for ---

test('two unusable replies leave a failure artifact, not silence', async () => {
  const { store, cleanup } = makeStore();
  try {
    const { runId, attemptId } = seedRun(store);
    // Valid JSON, invalid brief: a fix naming a set that is not on the board.
    const wrongSet = { ...VALID_BRIEF, fixes: [{ ...VALID_BRIEF.fixes[0], setId: 'set-nope' }] };

    const proposal = await propose(store, runId, attemptId, scriptedTransport([wrongSet]));

    assert.equal(proposal, null, 'a failed proposal is still not fatal');

    const failure = store.readRunArtifact(runId, proposalFailureFile(attemptId));
    assert.equal(failure.attemptId, attemptId);
    assert.equal(failure.category, 'invalid-output');
    // Both rounds are recorded, each with what it actually got wrong.
    assert.equal(failure.rounds.length, 2);
    assert.match(failure.rounds[0].errors[0].message, /not a set on this board/);
    // And the model's own words survive — the thing whose absence made the
    // 2026-08-06 case unknowable.
    assert.match(failure.reply, /set-nope/);
    assert.ok(failure.prompt.length > 0);
    assert.ok(failure.model.length > 0);
  } finally {
    cleanup();
  }
});

test('an unparseable reply is recorded as a parse failure, not a schema one', async () => {
  const { store, cleanup } = makeStore();
  try {
    const { runId, attemptId } = seedRun(store);

    assert.equal(await propose(store, runId, attemptId, scriptedTransport(['I cannot help with that'])), null);

    const failure = store.readRunArtifact(runId, proposalFailureFile(attemptId));
    assert.equal(failure.rounds[0].errors[0].path, '(parse)');
    assert.equal(failure.reply, 'I cannot help with that');
  } finally {
    cleanup();
  }
});

test('a transport failure is recorded and never thrown', async () => {
  const { store, cleanup } = makeStore();
  try {
    const { runId, attemptId } = seedRun(store);
    const refused = Object.assign(new Error('bad request'), { status: 400 });

    // Not rejecting is the assertion: the review page must still save Max's
    // feedback, which is the irreplaceable half of this transaction.
    assert.equal(await propose(store, runId, attemptId, scriptedTransport([refused])), null);

    const failure = store.readRunArtifact(runId, proposalFailureFile(attemptId));
    assert.equal(failure.attemptId, attemptId);
    assert.match(failure.message, /HTTP 400/);
    assert.notEqual(failure.category, undefined);
  } finally {
    cleanup();
  }
});

test('a throw on the second round keeps what the first round got wrong', async () => {
  const { store, cleanup } = makeStore();
  try {
    const { runId, attemptId } = seedRun(store);
    const transport = scriptedTransport([
      'not json at all',
      Object.assign(new Error('bad request'), { status: 400 }),
    ]);

    assert.equal(await propose(store, runId, attemptId, transport), null);

    const failure = store.readRunArtifact(runId, proposalFailureFile(attemptId));
    assert.equal(failure.rounds.length, 1, 'round 1 is evidence even though round 2 threw');
    assert.equal(failure.reply, 'not json at all');
  } finally {
    cleanup();
  }
});

test('a store that cannot write the failure still does not escalate', async () => {
  const { store, cleanup } = makeStore();
  try {
    const { runId, attemptId } = seedRun(store);
    const brokenStore = {
      ...store,
      readAttemptArtifact: (...args) => store.readAttemptArtifact(...args),
      readStageArtifact: (...args) => store.readStageArtifact(...args),
      writeRunArtifact: () => {
        throw new Error('disk is on fire');
      },
    };

    // The trace is what could not be written. That is a worse outcome than a
    // recorded failure and a better one than a crashed review page.
    assert.equal(
      await propose(brokenStore, runId, attemptId, scriptedTransport(['not json at all'])),
      null,
    );
  } finally {
    cleanup();
  }
});

// --- input assembly ---

test('missing evaluator output is less evidence, not a failure', () => {
  const { store, cleanup } = makeStore();
  try {
    const { runId, attemptId } = seedRun(store);

    // No stage artifacts at all — a revision re-entering late may not have
    // re-run every evaluator.
    const input = buildInput(store, runId, attemptId, FEEDBACK);

    assert.equal(input.board.id, 'asto-lantern');
    assert.deepEqual(input.findings, {});
    assert.deepEqual(input.vocabulary, []);
    assert.equal(input.feedback, FEEDBACK);
  } finally {
    cleanup();
  }
});

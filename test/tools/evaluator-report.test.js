// The evaluator report's joins, and the four version boundaries it exists to
// respect.
//
// These are the tests that matter, because the failure mode of this tool is
// not a crash — it is a plausible number. A report that silently pools
// version-1 events into the agreement rate still prints, still looks
// authoritative, and is wrong in the direction that flatters the pipeline.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  boardVerdict,
  chainOutcome,
  chainTally,
  formVersionOf,
  notesReached,
  proposalTally,
  REVISION_MARKER,
  REVISION_STAGES,
  scorePlayer,
  scoreSolver,
  scoreStyle,
  scoreValidator,
  wasPublished,
  setVerdicts,
  tagTally,
} from '../../tools/evaluator-report.js';

const setEvent = (setId, overrides = {}) => ({
  scope: { type: 'set', setId },
  action: 'set-publishable',
  tags: [],
  ...overrides,
});

const board = {
  sets: [
    { id: 'set-a', pairs: [['epic', 'Iliad'], ['tragedy', 'Hamlet']] },
    { id: 'set-b', pairs: [['bookbinder', 'awl'], ['calligrapher', 'quill']] },
  ],
};

// --- boundary 1: the version-1 instrument -------------------------------

test('an event with no formVersion is version 1', () => {
  assert.equal(formVersionOf({}), 1);
  assert.equal(formVersionOf({ formVersion: 3 }), 3);
});

test("a version-1 set action is NOT read as a verdict — it was the board's button", () => {
  // The exact shape schemas.js warns about: 21 of 79 said reject-set while
  // carrying only praise. Read through its action this is a rejection; read
  // correctly, Max liked it.
  const verdicts = setVerdicts([setEvent('set-a', { action: 'reject-set', tags: ['good-unchanged'] })]);

  const judged = verdicts.get('set-a');
  assert.equal(judged.verdict, 'good', 'the tags say he liked it');
  assert.equal(judged.trusted, false, 'and the caller must know this came from tags');
  assert.equal(judged.source, 'tags');
});

test('a version-2 set action IS read as a verdict, because it is chosen per set', () => {
  const verdicts = setVerdicts([
    setEvent('set-a', { formVersion: 2, action: 'set-replace', tags: ['good-unchanged'] }),
  ]);

  const judged = verdicts.get('set-a');
  assert.equal(judged.verdict, 'bad', 'the action outranks the tags once the action is trustworthy');
  assert.equal(judged.trusted, true);
});

test('a version-1 event with mixed tags yields no verdict rather than a guess', () => {
  const verdicts = setVerdicts([
    setEvent('set-a', { action: 'approve-set', tags: ['good-unchanged', 'too-obscure'] }),
  ]);

  assert.equal(verdicts.get('set-a').verdict, null);
});

test('the last judgement on a set wins — he revisits boards', () => {
  const verdicts = setVerdicts([
    setEvent('set-a', { formVersion: 3, action: 'set-publishable' }),
    setEvent('set-a', { formVersion: 3, action: 'set-replace' }),
  ]);

  assert.equal(verdicts.get('set-a').verdict, 'bad');
});

test('an adjustment is not a verdict', () => {
  const verdicts = setVerdicts([setEvent('set-a', { formVersion: 3, action: 'change-difficulty' })]);

  assert.equal(verdicts.get('set-a').verdict, null, 'changing a difficulty says nothing about quality');
});

// --- boundary 2: the retired tag ----------------------------------------

test('a retired tag is counted where it is and never re-sorted', () => {
  const { active, retired } = tagTally([
    setEvent('set-a', { tags: ['valid-but-unfair'] }),
    setEvent('set-b', { tags: ['not-evocative'] }),
  ]);

  assert.equal(retired['valid-but-unfair'], 1);
  assert.equal(active['not-evocative'], 1);
  assert.equal(active['valid-but-unfair'], undefined, 'it must not land in a tag that replaced it');
});

test('a bare retired tag yields no version-1 verdict, because its meaning is only in the prose', () => {
  const verdicts = setVerdicts([setEvent('set-a', { action: 'reject-set', tags: ['valid-but-unfair'] })]);

  assert.equal(verdicts.get('set-a').verdict, null);
});

// --- boundary 3: fields that arrived late --------------------------------

test('a 07 output predating knowledgeGated is not reportable, and not a zero', () => {
  const old = scorePlayer({ trials: [{ solved: true }] }, board, new Map());
  const current = scorePlayer({ trials: [], knowledgeGated: [] }, board, new Map());

  assert.equal(old.reportable, false, 'it could not report, so it must not be in the denominator');
  assert.equal(current.reportable, true, 'an empty array IS a report: nothing fired');
  assert.equal(current.fired, false);
});

test('a gated word is joined to its set, and to what Max said about that set', () => {
  const verdicts = setVerdicts([setEvent('set-b', { formVersion: 3, action: 'set-replace' })]);
  const result = scorePlayer(
    { trials: [], knowledgeGated: [{ word: 'awl', note: 'a bookbinding tool' }] },
    board,
    verdicts,
  );

  assert.equal(result.fired, true);
  assert.equal(result.gatedOnRejectedSet, 1);
});

// --- the joins -----------------------------------------------------------

test('05 vs Max fills the four cells, and separates the two ways of being wrong', () => {
  const verdicts = setVerdicts([
    setEvent('set-a', { formVersion: 3, action: 'set-publishable' }),
    setEvent('set-b', { formVersion: 3, action: 'set-replace' }),
  ]);

  const flaggedWhatHeLiked = scoreValidator(
    { verdicts: [{ setId: 'set-a', pass: false }] },
    verdicts,
  );
  assert.equal(flaggedWhatHeLiked.flaggedLiked, 1, 'the paris failure mode');

  const missedWhatHeRejected = scoreValidator(
    { verdicts: [{ setId: 'set-b', pass: true }] },
    verdicts,
  );
  assert.equal(missedWhatHeRejected.passedRejected, 1);
});

test('a 05 verdict on a set Max never judged is uncounted, not counted as agreement', () => {
  const cells = scoreValidator({ verdicts: [{ setId: 'set-a', pass: true }] }, new Map());

  assert.equal(cells.unjudged, 1);
  assert.equal(cells.agreePass, 0, 'silence is not agreement');
});

test('a 06 finding lands on a set when any of its words belongs to one', () => {
  const verdicts = setVerdicts([setEvent('set-b', { formVersion: 3, action: 'set-replace' })]);
  const counts = scoreSolver(
    { findings: [{ kind: 'cross-set-association', severity: 'high', words: ['awl', 'Iliad'] }] },
    board,
    verdicts,
  );

  assert.equal(counts.findings, 1);
  assert.equal(counts.onRejectedSet, 1);
  assert.equal(counts.bySeverity.high, 1);
});

test('a 06 finding naming no board word is unjoinable, not a miss', () => {
  const counts = scoreSolver({ findings: [{ words: ['nothing', 'here'] }] }, board, new Map());

  assert.equal(counts.unjoinable, 1);
  assert.equal(counts.onRejectedSet, 0);
});

test('the word join is case- and whitespace-insensitive, because boards are title-cased', () => {
  const verdicts = setVerdicts([setEvent('set-a', { formVersion: 3, action: 'set-replace' })]);
  const counts = scoreSolver({ findings: [{ words: ['  ILIAD '] }] }, board, verdicts);

  assert.equal(counts.onRejectedSet, 1);
});

test('a board verdict ignores proposal and playthrough events', () => {
  const verdict = boardVerdict([
    { scope: { type: 'board' }, action: 'approve-board' },
    { scope: { type: 'board' }, action: 'playthrough' },
    { scope: { type: 'board' }, action: 'proposal-verdict', proposal: { verdict: 'accepted' } },
  ]);

  assert.equal(verdict, 'good', 'recording how it was played is not a change of mind');
});

test('08 is compared only when both sides rendered a verdict', () => {
  assert.equal(scoreStyle(null, 'good'), null);
  assert.equal(scoreStyle({ compliant: true }, null), null);

  const disagreed = scoreStyle({ compliant: true, unity: { verdict: 'strong' } }, 'bad');
  assert.equal(disagreed.agree, false);
  assert.equal(disagreed.machineHappy, true);
});

// --- D-5 evidence --------------------------------------------------------

test('proposal verdicts are tallied by what Max did, and an edit is its own outcome', () => {
  const tally = proposalTally([
    { action: 'proposal-verdict', proposal: { verdict: 'accepted' } },
    { action: 'proposal-verdict', proposal: { verdict: 'edited' } },
    { action: 'proposal-verdict', proposal: { verdict: 'discarded' } },
    { action: 'approve-board' },
  ]);

  assert.deepEqual(tally, { verdicts: 3, accepted: 1, edited: 1, discarded: 1, other: 0 });
});

test('a proposal verdict with no recognised value is counted, never dropped', () => {
  const tally = proposalTally([{ action: 'proposal-verdict', proposal: {} }]);

  assert.equal(tally.verdicts, 1);
  assert.equal(tally.other, 1, 'the trigger counts briefs, so an unreadable one still counts');
});

// --- boundary 5: revisions that never received their notes (D-11) ---------

/** A store stub exposing only what notesReached() calls. */
const storeWithPrompts = (promptByStage) => ({
  readStageArtifact(_runId, _attemptId, stageId, filename) {
    if (filename !== 'request.json' || !(stageId in promptByStage)) {
      throw new Error('no such artifact');
    }
    return { prompt: promptByStage[stageId] };
  },
});

test('the marker in any generative stage proves the notes arrived', () => {
  const store = storeWithPrompts({
    '01-pair-author': `${REVISION_MARKER}\nthe editor said...`,
    '02-theme-grouper': 'plain prompt',
  });

  assert.equal(notesReached(store, 'run', '0002'), true);
});

test('generative prompts with no marker prove they did not — the pre-D-11 blind re-roll', () => {
  const store = storeWithPrompts({
    '01-pair-author': 'author some pairs about bbq',
    '04-board-builder': 'build a board',
  });

  assert.equal(notesReached(store, 'run', '0002'), false);
});

test('03 lacking the marker does not mark a run pre-D-11', () => {
  // D-11 leads only the three GENERATIVE stages. The difficulty rater grades
  // what it is handed. Requiring it to carry the block would report every
  // correctly-briefed run after the fix as if the notes had gone missing.
  assert.ok(!REVISION_STAGES.includes('03-difficulty-rater'));

  const store = storeWithPrompts({
    '01-pair-author': `${REVISION_MARKER}\n...`,
    '03-difficulty-rater': 'grade these sets',
  });

  assert.equal(notesReached(store, 'run', '0002'), true);
});

test('an attempt whose generative stages sent nothing is unknown, not a failure', () => {
  assert.equal(notesReached(storeWithPrompts({}), 'run', '0002'), null);
});

test('a revision that never received its notes is excluded, not counted as a failure', () => {
  const confounded = chainOutcome({
    verdict: 'accepted',
    revised: true,
    notesReached: false,
    status: 'rejected',
  });

  assert.equal(confounded.outcome, 'rejected');
  assert.equal(confounded.usable, false, 'its rejection says nothing about the brief');
  assert.equal(confounded.published, false);
});

test('a revision that did receive its notes is usable evidence either way', () => {
  const won = chainOutcome({
    verdict: 'accepted', revised: true, notesReached: true, status: 'approved', published: true,
  });
  const lost = chainOutcome({ verdict: 'accepted', revised: true, notesReached: true, status: 'rejected' });

  assert.equal(won.usable, true);
  assert.equal(won.published, true);
  assert.equal(lost.usable, true);
  assert.equal(lost.published, false);
});

// D-6: publication is RECORDED, not transitioned — the run stays `approved`
// whether or not the board ever reached puzzles/. Measured on the live corpus:
// 33 approved runs, 19 published, 14 approved and deliberately held back (the
// three older boards pending a re-read, the hand-made experiments, the harbor
// fixture). Reading `status === 'approved'` as "published" is therefore wrong
// 14 times out of 33, and it is what this field did until it was measured.
test('approved is not published — the status cannot answer that question', () => {
  const shipped = chainOutcome({
    verdict: 'accepted', revised: true, notesReached: true, status: 'approved', published: true,
  });
  const heldBack = chainOutcome({
    verdict: 'accepted', revised: true, notesReached: true, status: 'approved', published: false,
  });

  assert.equal(shipped.outcome, 'approved');
  assert.equal(heldBack.outcome, 'approved', 'both are approved — that much the status does say');
  assert.equal(shipped.published, true);
  assert.equal(heldBack.published, false, 'an approved board Max never shipped is not published');
});

test('publication is read from the decision log, never inferred', () => {
  const withPublish = {
    readDecisions: () => [{ type: 'approve' }, { type: 'publish', publishedAs: 'mail-call.json' }],
  };
  const approvedOnly = { readDecisions: () => [{ type: 'approve' }] };
  const unreadable = { readDecisions: () => { throw new Error('no decisions.jsonl'); } };

  assert.equal(wasPublished(withPublish, 'r'), true);
  assert.equal(wasPublished(approvedOnly, 'r'), false);
  // Absence of the record is not evidence of publication.
  assert.equal(wasPublished(unreadable, 'r'), false);
});

test('a brief with no revision behind it is neither usable nor a failure', () => {
  const chain = chainOutcome({ verdict: 'discarded', revised: false, status: 'awaiting-review' });

  assert.equal(chain.outcome, 'no-revision');
  assert.equal(chain.usable, false);
  assert.equal(chain.notesReached, null);
});

test('an open revision is not counted as published, and not as rejected either', () => {
  const chain = chainOutcome({
    verdict: 'accepted',
    revised: true,
    notesReached: true,
    status: 'awaiting-review',
  });

  assert.equal(chain.outcome, 'open');
  assert.equal(chain.usable, true, 'it counts toward the sample...');
  assert.equal(chain.published, false, '...but it has not succeeded yet');
});

test('the tally separates confounded runs from the usable denominator', () => {
  // The live corpus, in miniature: three blind re-rolls and two real ones.
  const tally = chainTally([
    chainOutcome({ verdict: 'accepted', revised: true, notesReached: false, status: 'rejected' }),
    chainOutcome({ verdict: 'accepted', revised: true, notesReached: false, status: 'rejected' }),
    chainOutcome({ verdict: 'accepted', revised: true, notesReached: false, status: 'rejected' }),
    chainOutcome({ verdict: 'accepted', revised: true, notesReached: true, status: 'awaiting-review' }),
    chainOutcome({ verdict: 'accepted', revised: true, notesReached: true, status: 'rejected' }),
  ]);

  assert.equal(tally.briefs, 5);
  assert.equal(tally.confounded, 3);
  assert.equal(tally.usable, 2, 'five accepted briefs, two of which are evidence');
  assert.equal(tally.published, 0);
  assert.equal(tally.open, 1);
  assert.equal(tally.rejected, 1);
});

// The rollup re-derived `published` from `outcome === 'approved'`, so the same
// conflation lived in two places and fixing the record alone would have left
// the printed number wrong.
test('the tally counts approved and published apart', () => {
  const tally = chainTally([
    chainOutcome({ revised: true, notesReached: true, status: 'approved', published: true }),
    chainOutcome({ revised: true, notesReached: true, status: 'approved', published: false }),
    chainOutcome({ revised: true, notesReached: true, status: 'rejected' }),
  ]);

  assert.equal(tally.usable, 3);
  assert.equal(tally.approved, 2, 'both approved runs count as approved');
  assert.equal(tally.published, 1, 'only the one that reached puzzles/ counts as published');
  assert.equal(tally.rejected, 1);
  assert.equal(tally.open, 0);
});

test('the terminal status outranks the last board action when they disagree', () => {
  // cowboys: `approve-board`, with a note saying he was not going to publish
  // it. What happened is the status.
  const chain = chainOutcome({
    verdict: 'accepted',
    revised: true,
    notesReached: true,
    status: 'rejected',
    lastBoardAction: 'good',
  });

  assert.equal(chain.outcome, 'rejected');
  assert.equal(chain.published, false);
  assert.equal(chain.lastBoardAction, 'good', 'the disagreement is recorded, not hidden');
});

// --- boundary 3, applied to 08 as well as 07 ---
//
// `unity` arrived partway through (design.md D-3 amendment) and 21 of 77
// stage-08 outputs predate it. scoreStyle defaulted a missing verdict to
// 'strong' — to HAPPY — which is exactly the smoothing this file refuses for
// 07's knowledgeGated. It changed no number in today's corpus only because
// every one of those 21 is already `compliant: false`.

test('an 08 output predating `unity` is judged on compliance alone, not defaulted to happy', () => {
  const old = scoreStyle({ compliant: true }, 'good');

  assert.equal(old.unityReportable, false, 'the absence must be visible to the reader');
  assert.equal(old.unity, null);
  // Judged on what it DID report. The point is that the missing field is not
  // silently supplied as 'strong'.
  assert.equal(old.machineHappy, true);
  assert.equal(old.agree, true);
});

test('a reported weak unity still makes 08 unhappy, and a strong one does not rescue non-compliance', () => {
  const weak = scoreStyle({ compliant: true, unity: { verdict: 'weak' } }, 'good');
  assert.equal(weak.unityReportable, true);
  assert.equal(weak.machineHappy, false, 'a weak unity is a real complaint');
  assert.equal(weak.agree, false);

  const nonCompliant = scoreStyle({ compliant: false, unity: { verdict: 'strong' } }, 'good');
  assert.equal(nonCompliant.machineHappy, false);
});

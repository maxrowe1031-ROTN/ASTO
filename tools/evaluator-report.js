#!/usr/bin/env node
// Evaluator report: how often the Studio's evaluators agreed with Max.
//
//   node tools/evaluator-report.js            # the readable report
//   node tools/evaluator-report.js --json     # the same numbers, machine-readable
//
// The Studio's four agentic evaluators (05 validator, 06 adversarial solver,
// 07 test player, 08 style guide) each render a verdict on a board that Max
// then judges himself in the Review Studio. Both halves have been recorded
// since 2026-08-02 and neither has ever been joined to the other. This is that
// join: for every set and every board, what the machine said next to what the
// human said.
//
// It reads and writes nothing. Run directories are the record of what happened.
//
// ---------------------------------------------------------------------------
// FOUR VERSION BOUNDARIES, and why this file is mostly about them
//
// The corpus spans four instrument changes. Pooling across any of them
// produces a number that looks authoritative and is wrong, which is worse than
// having no number — so each is segmented rather than smoothed:
//
//   1. formVersion absent (= version 1). schemas.js is explicit: "under
//      version 1 a set's `action` was inherited from the board button and
//      cannot be trusted, though its tags and note can." 21 of 79 tagged
//      set-events say `reject-set` while carrying only praise. So v1 set
//      actions are NEVER read as verdicts. Their tags are, and their events
//      are counted in a separate population.
//
//   2. `valid-but-unfair` (retired 2026-08-05). Across nine uses Max meant
//      three different things and only the prose says which. Counted under the
//      retired tag and never re-sorted into the tags that replaced it.
//
//   3. `knowledgeGated` / `orderGuessed` were added to 07 partway through.
//      An output without the field is NOT a run where nothing fired — it is a
//      run that could not report. Those are excluded from the rate and counted
//      as out-of-scope, because dividing by them would silently deflate it.
//
//   4. Mock runs replay a fixture board. run-store records `brief.mock` so
//      that "a mock-derived board is never mistaken for real editorial
//      signal" (variety.js already honours this); this is the second place
//      that has to.
//
//   5. Revisions before D-11 (2026-08-07) never received the editor's notes.
//      `requestRevision` wrote them and nothing read them back, so a revision
//      re-entering at 01 was a blind re-roll of the theme. Those revisions
//      were rejected, and the rejections say nothing about the Revision
//      Proposer that briefed them — the brief was written to a channel with
//      no receiver. Detected from the ARTIFACT rather than from a date: the
//      re-entry prompt either carries renderRevision()'s marker or it does
//      not. See `notesReached`.
//
// Everything below the adapter is pure, so each boundary is testable against a
// handful of fabricated events instead of the live corpus.

import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { createRunStore } from '../studio/storage/run-store.js';
import { RETIRED_TAGS } from '../studio/schemas.js';

const RUNS_DIR = fileURLToPath(new URL('../studio/runs/', import.meta.url));

const VALIDATOR = '05-analogy-validator';
const SOLVER = '06-adversarial-solver';
const PLAYER = '07-test-player';
const STYLE = '08-style-guide';

/**
 * Set-scoped verdicts, version 2 onward. These are chosen per set and are the
 * only set actions this report trusts.
 */
const SET_GOOD = new Set(['set-publishable', 'approve-set', 'approve-unchanged']);
const SET_BAD = new Set(['set-replace', 'reject-set']);
const SET_EDIT = new Set(['set-needs-edit', 'revise-set']);

const BOARD_GOOD = new Set(['approve-board']);
const BOARD_BAD = new Set(['reject-board']);
const BOARD_EDIT = new Set(['revise-board']);

/**
 * Tag polarity — THIS TOOL'S INTERPRETATION, not the schema's.
 *
 * schemas.js deliberately does not classify tags; it records what Max reached
 * for. But version-1 events have no trustworthy action, so their tags are the
 * only verdict available, and reading them requires taking a position. Stated
 * here in the open so a disagreement is with a visible list rather than with
 * a number.
 *
 * `valid-but-unfair` appears in neither list. That is boundary 2: it meant
 * three different things and the tool does not get to pick one.
 */
const POSITIVE_TAGS = new Set([
  'good-unchanged',
  'strong-reveal',
  'difficulty-accurate',
  'feels-like-asto',
]);

const NEGATIVE_TAGS = new Set([
  'relationship-does-not-click',
  'order-ambiguous',
  'too-obscure',
  'too-easy',
  'too-difficult',
  'cross-set-association',
  'repetitive-shape',
  'weak-explanation',
  'weak-label',
  'not-always-true',
  'no-unifying-theme',
  'not-evocative',
  'second-valid-reading',
]);

/** Boundary 1: the field arrived with version 2, so its absence IS version 1. */
export const formVersionOf = (event) => event.formVersion ?? 1;

/**
 * Max's verdict per set, from one run's feedback.
 *
 * The LAST event for a set wins: he revisits boards, and a later judgement
 * supersedes an earlier one rather than averaging with it.
 *
 * Returns Map(setId → { verdict, trusted, source, tags }). `verdict` is
 * 'good' | 'bad' | 'edit' | null; `trusted` is false for a version-1 event
 * read through its tags, so the caller can report the two populations apart.
 */
export function setVerdicts(events) {
  const bySet = new Map();

  for (const event of events) {
    if (event.scope?.type !== 'set' || !event.scope.setId) continue;
    const version = formVersionOf(event);
    const tags = event.tags ?? [];

    // Boundary 1. A v1 set action is the board's button, stamped on every set.
    const verdict =
      version >= 2 ? verdictFromAction(event.action) : verdictFromTags(tags);

    bySet.set(event.scope.setId, {
      setId: event.scope.setId,
      verdict,
      trusted: version >= 2,
      source: version >= 2 ? `action:${event.action}` : 'tags',
      formVersion: version,
      tags,
      note: event.note ?? '',
    });
  }

  return bySet;
}

function verdictFromAction(action) {
  if (SET_GOOD.has(action)) return 'good';
  if (SET_BAD.has(action)) return 'bad';
  if (SET_EDIT.has(action)) return 'edit';
  return null; // change-difficulty, change-label, change-explanation: adjustments, not verdicts
}

function verdictFromTags(tags) {
  const positive = tags.filter((tag) => POSITIVE_TAGS.has(tag)).length;
  const negative = tags.filter((tag) => NEGATIVE_TAGS.has(tag)).length;
  if (positive > 0 && negative === 0) return 'good';
  if (negative > 0 && positive === 0) return 'bad';
  // Mixed, or nothing classifiable (including a bare `valid-but-unfair`).
  return null;
}

/** Max's verdict on the board as a whole — the last board-scoped event. */
export function boardVerdict(events) {
  let verdict = null;
  for (const event of events) {
    if (event.scope?.type !== 'board') continue;
    if (event.action === 'proposal-verdict' || event.action === 'playthrough') continue;
    if (BOARD_GOOD.has(event.action)) verdict = 'good';
    else if (BOARD_BAD.has(event.action)) verdict = 'bad';
    else if (BOARD_EDIT.has(event.action)) verdict = 'edit';
  }
  return verdict;
}

/**
 * 05 says pass/fail per set; Max says good/bad per set. Four cells.
 *
 * `edit` counts as bad — "close, but the fix belongs in fixSuggestion" is a
 * set 05 should have flagged.
 */
export function scoreValidator(output, verdicts) {
  const cells = { agreePass: 0, agreeFail: 0, flaggedLiked: 0, passedRejected: 0, unjudged: 0 };

  for (const verdict of output?.verdicts ?? []) {
    const human = verdicts.get(verdict.setId);
    if (!human || human.verdict === null) {
      cells.unjudged += 1;
      continue;
    }
    const humanLiked = human.verdict === 'good';
    if (verdict.pass && humanLiked) cells.agreePass += 1;
    else if (!verdict.pass && !humanLiked) cells.agreeFail += 1;
    else if (!verdict.pass && humanLiked) cells.flaggedLiked += 1;
    else cells.passedRejected += 1;
  }

  return cells;
}

/**
 * 06 reports findings against WORDS, not sets. Joining them back to a set is
 * word membership — the same map the review page builds.
 *
 * A finding "lands" when at least one of its words belongs to a set Max
 * rejected. That is a weaker claim than "06 found the reason he rejected it",
 * and the report says so rather than dressing it up.
 */
export function scoreSolver(output, board, verdicts) {
  const setOfWord = wordToSet(board);
  const counts = { findings: 0, onRejectedSet: 0, onLikedSet: 0, unjoinable: 0, bySeverity: {} };

  for (const finding of output?.findings ?? []) {
    counts.findings += 1;
    const severity = finding.severity ?? 'unspecified';
    counts.bySeverity[severity] = (counts.bySeverity[severity] ?? 0) + 1;

    const touched = new Set(
      (finding.words ?? []).map((word) => setOfWord.get(normalize(word))).filter(Boolean),
    );
    if (touched.size === 0) {
      counts.unjoinable += 1;
      continue;
    }
    const verdictsTouched = [...touched].map((setId) => verdicts.get(setId)?.verdict);
    if (verdictsTouched.some((verdict) => verdict === 'bad' || verdict === 'edit')) {
      counts.onRejectedSet += 1;
    } else if (verdictsTouched.some((verdict) => verdict === 'good')) {
      counts.onLikedSet += 1;
    }
  }

  return counts;
}

/**
 * 07's self-reported blind spots, plus how it actually played.
 *
 * Boundary 3: an output with no `knowledgeGated` key predates the field. It is
 * `reportable: false` — not a zero — so the rate divides by runs that could
 * report rather than by all of them.
 */
export function scorePlayer(output, board, verdicts) {
  const reportable = output != null && 'knowledgeGated' in output;
  const gated = output?.knowledgeGated ?? [];
  const setOfWord = wordToSet(board);

  const onRejected = gated.filter((entry) => {
    const setId = setOfWord.get(normalize(entry.word));
    const verdict = setId && verdicts.get(setId)?.verdict;
    return verdict === 'bad' || verdict === 'edit';
  }).length;

  const trials = output?.trials ?? [];
  const solved = trials.filter((trial) => trial.solved === true).length;

  return {
    reportable,
    fired: reportable && gated.length > 0,
    gatedWords: gated.length,
    gatedOnRejectedSet: onRejected,
    trials: trials.length,
    solvedTrials: solved,
  };
}

/**
 * 08 renders a board-level judgement; compare it to Max's board-level one.
 *
 * Boundary 3 again, and it was originally broken here. `unity` arrived partway
 * through (D-3 amendment) and 21 of 77 stage-08 outputs predate it — but the
 * first version defaulted a missing verdict to `'strong'`, i.e. to HAPPY, which
 * is the exact smoothing this file refuses to do for 07's `knowledgeGated`
 * ("an output without the field is NOT a run where nothing fired"). It changed
 * no number in today's corpus, because all 21 are already `compliant: false`
 * and that alone makes `machineHappy` false — a latent optimism, not a live
 * one. It is removed rather than left to bite when an old output is re-read or
 * a compliant one turns up without the field.
 *
 * A run that cannot report unity is judged on `compliant` alone, and says so
 * through `unityReportable` so a reader can segment on it.
 */
export function scoreStyle(output, boardVerdict) {
  if (!output || boardVerdict === null) return null;
  const unityReportable = output.unity?.verdict != null;
  const machineHappy =
    output.compliant === true && (!unityReportable || output.unity.verdict !== 'weak');
  const humanHappy = boardVerdict === 'good';
  return {
    machineHappy,
    humanHappy,
    agree: machineHappy === humanHappy,
    edits: (output.edits ?? []).length,
    unityReportable,
    unity: output.unity?.verdict ?? null,
    evocativeness: output.evocativeness?.verdict ?? null,
  };
}

/** Boundary 2: retired tags are counted where they are, never re-sorted. */
export function tagTally(events) {
  const active = {};
  const retired = {};
  for (const event of events) {
    for (const tag of event.tags ?? []) {
      const bucket = RETIRED_TAGS.has(tag) ? retired : active;
      bucket[tag] = (bucket[tag] ?? 0) + 1;
    }
  }
  return { active, retired };
}

/**
 * The D-5 graduation evidence: briefs offered, and what Max did with them.
 * `edited` is the interesting one — D-5 says the edit is precisely what the
 * proposer got wrong.
 */
export function proposalTally(events) {
  const tally = { verdicts: 0, accepted: 0, edited: 0, discarded: 0, other: 0 };
  for (const event of events) {
    if (event.action !== 'proposal-verdict') continue;
    tally.verdicts += 1;
    const verdict = event.proposal?.verdict;
    if (verdict === 'accepted') tally.accepted += 1;
    else if (verdict === 'edited') tally.edited += 1;
    else if (verdict === 'discarded') tally.discarded += 1;
    else tally.other += 1;
  }
  return tally;
}

/**
 * The marker `renderRevision()` leads a revision prompt with. Its presence in
 * a re-entry stage's prompt is proof the editor's notes arrived; its absence
 * is proof they did not. This is the same evidence D-11 was diagnosed from.
 */
export const REVISION_MARKER = 'THIS IS A REVISION, NOT A NEW BOARD';

/**
 * The stages renderRevision() leads. 03 is deliberately NOT here: D-11 puts
 * the block on the three GENERATIVE stages only, and the difficulty rater
 * grades what it is given. Requiring 03 to carry it would report every
 * correctly-briefed run after D-11 as if the notes had gone missing.
 */
export const REVISION_STAGES = Object.freeze(['01-pair-author', '02-theme-grouper', '04-board-builder']);

/**
 * One brief's whole life: what Max said about it, whether a revision followed,
 * whether that revision could even see his notes, and how it ended.
 *
 * Pure. `notesReached` is resolved by the adapter, because only it can read
 * prompts — everything else here is arithmetic over records.
 *
 * `usable` is the load-bearing field. A revision that never received its notes
 * is not evidence about the proposer in either direction, so it is excluded
 * from the outcome metric rather than counted as a failure. Counting those
 * three runs as failures is exactly the mistake this whole section exists to
 * stop the next reader from making.
 */
export function chainOutcome({ verdict, revised, notesReached, status, lastBoardAction, published = false }) {
  const usable = revised && notesReached === true;

  let outcome = 'no-revision';
  if (revised) {
    if (status === 'approved') outcome = 'approved';
    else if (status === 'rejected') outcome = 'rejected';
    else outcome = 'open';
  }

  return {
    verdict: verdict ?? null,
    revised,
    notesReached: revised ? notesReached : null,
    usable,
    outcome,
    // Recorded because the two can disagree: cowboys carries `approve-board`
    // and a note saying he was not going to publish it, and the run's terminal
    // status is what actually happened.
    lastBoardAction: lastBoardAction ?? null,
    // Approval is NOT publication, and this field read `status === 'approved'`
    // until it was measured: 33 approved runs, 19 published, **14 approved and
    // never published** — the three older boards held back pending a re-read,
    // the hand-made design experiments, the harbor fixture. D-6 made publishing
    // a `publish` decision in decisions.jsonl precisely because the run stays
    // `approved` either way, so the status cannot answer this question and the
    // decision has to be read. Passed in by the adapter: only it can read the
    // decision log, and everything here stays arithmetic.
    published: usable && published === true,
  };
}

/**
 * Roll the chains up into the number D-5's amended trigger reads.
 *
 * `approved` and `published` are separate counters on purpose. This function
 * used to increment `published` on `outcome === 'approved'`, which is the same
 * conflation `chainOutcome` carried and had to be fixed in both places — the
 * field was right in the record and re-derived wrongly in the rollup, so
 * fixing one alone would have left the printed number unchanged.
 */
export function chainTally(chains) {
  const tally = {
    briefs: chains.length,
    revised: 0,
    confounded: 0,
    usable: 0,
    approved: 0,
    published: 0,
    open: 0,
    rejected: 0,
  };
  for (const chain of chains) {
    if (chain.revised) tally.revised += 1;
    if (chain.revised && chain.notesReached === false) tally.confounded += 1;
    if (chain.usable) {
      tally.usable += 1;
      if (chain.outcome === 'rejected') tally.rejected += 1;
      else if (chain.outcome === 'open') tally.open += 1;
      else if (chain.outcome === 'approved') {
        tally.approved += 1;
        if (chain.published) tally.published += 1;
      }
    }
  }
  return tally;
}

const normalize = (word) => String(word ?? '').trim().toLowerCase();

function wordToSet(board) {
  const map = new Map();
  for (const set of board?.sets ?? []) {
    for (const word of (set.pairs ?? []).flat()) map.set(normalize(word), set.id);
  }
  return map;
}

// --- the adapter: the only part that touches disk -------------------------

/**
 * One record per attempt that has both a board and a human judgement. An
 * attempt with no feedback is not evidence of agreement; it is listed as
 * uncovered so the denominator stays honest.
 */
/**
 * Did the editor's notes reach the stages that author the revision?
 *
 * Reads the prompt the stage ACTUALLY SENT, out of `request.json` — the same
 * artifact D-11's own diagnosis turned on, and the reason every prompt is kept
 * on disk. `true` if any generative stage's prompt carries the marker,
 * `false` if none does, `null` if no generative stage on this attempt left a
 * request at all (nothing was sent, so there is nothing to conclude).
 */
export function notesReached(store, runId, attemptId) {
  let sawAnyPrompt = false;

  for (const stageId of REVISION_STAGES) {
    const request = read(store, runId, attemptId, stageId, 'request.json');
    const prompt = request?.prompt;
    if (typeof prompt !== 'string') continue;
    sawAnyPrompt = true;
    if (prompt.includes(REVISION_MARKER)) return true;
  }

  return sawAnyPrompt ? false : null;
}

/**
 * Did this run's board actually reach `puzzles/`?
 *
 * Read from the decision log, never inferred from status. A run stays
 * `approved` after publishing (D-6: "publication is recorded, not
 * transitioned"), and it also stays `approved` when Max approves a board and
 * declines to ship it — 14 of the corpus's 33 approved runs were never
 * published. Failure to read a run's decisions is `false`: absence of the
 * record is not evidence of publication.
 */
export function wasPublished(store, runId) {
  let decisions = [];
  try {
    decisions = store.readDecisions(runId);
  } catch {
    return false;
  }
  return decisions.some((decision) => decision.type === 'publish');
}

/** Every brief in the corpus, followed through to what became of it. */
export function collectChains(store) {
  const chains = [];

  for (const runId of store.listRuns()) {
    let manifest;
    try {
      manifest = store.readManifest(runId);
    } catch {
      continue;
    }
    if (manifest.brief?.mock === true) continue;

    let events = [];
    try {
      events = store.readFeedback(runId);
    } catch {
      continue;
    }

    const proposals = events.filter((event) => event.action === 'proposal-verdict');
    if (proposals.length === 0) continue;

    const attempts = safeAttempts(store, runId);
    // The revision is the attempt AFTER the one the brief was given on. With
    // revisionCount >= 1 that is the last attempt.
    const revised = (manifest.revisionCount ?? 0) > 0 && attempts.length > 1;
    const revisionAttempt = revised ? attempts.at(-1) : null;

    const scoped = revisionAttempt
      ? events.filter((event) => !event.attemptId || event.attemptId === revisionAttempt)
      : [];

    chains.push({
      runId,
      slug: manifest.slug ?? runId,
      status: manifest.status,
      ...chainOutcome({
        verdict: proposals.at(-1)?.proposal?.verdict,
        revised,
        notesReached: revised ? notesReached(store, runId, revisionAttempt) : null,
        status: manifest.status,
        lastBoardAction: boardVerdict(scoped),
        published: wasPublished(store, runId),
      }),
    });
  }

  return chains;
}

export function collect(store) {
  const records = [];
  const skipped = { mock: 0, noBoard: 0, noFeedback: 0, unjudgedAttempt: 0 };

  for (const runId of store.listRuns()) {
    let manifest;
    try {
      manifest = store.readManifest(runId);
    } catch {
      continue;
    }
    if (manifest.brief?.mock === true) {
      skipped.mock += 1;
      continue; // boundary 4
    }

    let events = [];
    try {
      events = store.readFeedback(runId);
    } catch {
      events = [];
    }
    if (events.length === 0) {
      skipped.noFeedback += 1;
      continue;
    }

    for (const attemptId of safeAttempts(store, runId)) {
      const board = read(store, runId, attemptId, null, 'board.json');
      if (!board) {
        skipped.noBoard += 1;
        continue;
      }

      // Feedback is recorded against the attempt it was given on. A run with
      // three attempts usually has judgement on ONE of them, so the other two
      // are not agreement data — they are unjudged work. Counting them would
      // add their evaluator verdicts to the denominator with no human verdict
      // to compare against, quietly deflating every agreement rate.
      const scoped = events.filter((event) => !event.attemptId || event.attemptId === attemptId);
      if (scoped.length === 0) {
        skipped.unjudgedAttempt += 1;
        continue;
      }

      const verdicts = setVerdicts(scoped);
      const boardSaid = boardVerdict(scoped);

      records.push({
        runId,
        attemptId,
        slug: manifest.slug ?? runId,
        board,
        events: scoped,
        verdicts,
        boardVerdict: boardSaid,
        validator: scoreValidator(read(store, runId, attemptId, VALIDATOR, 'output.json'), verdicts),
        solver: scoreSolver(read(store, runId, attemptId, SOLVER, 'output.json'), board, verdicts),
        player: scorePlayer(read(store, runId, attemptId, PLAYER, 'output.json'), board, verdicts),
        style: scoreStyle(read(store, runId, attemptId, STYLE, 'output.json'), boardSaid),
      });
    }
  }

  return { records, skipped };
}

function safeAttempts(store, runId) {
  try {
    return store.listAttempts(runId);
  } catch {
    return [];
  }
}

function read(store, runId, attemptId, stageId, filename) {
  try {
    return stageId === null
      ? store.readAttemptArtifact(runId, attemptId, filename)
      : store.readStageArtifact(runId, attemptId, stageId, filename);
  } catch {
    return null;
  }
}

// --- summary --------------------------------------------------------------

export function summarize({ records, skipped }) {
  const validator = { agreePass: 0, agreeFail: 0, flaggedLiked: 0, passedRejected: 0, unjudged: 0 };
  const solver = { findings: 0, onRejectedSet: 0, onLikedSet: 0, unjoinable: 0, bySeverity: {} };
  const player = { reportable: 0, fired: 0, gatedWords: 0, gatedOnRejectedSet: 0, trials: 0, solvedTrials: 0 };
  const style = { compared: 0, agree: 0, machineHappyHumanNot: 0, humanHappyMachineNot: 0 };
  const populations = { trustedSets: 0, version1Sets: 0, unclassifiedSets: 0 };
  const allEvents = [];

  for (const record of records) {
    allEvents.push(...record.events);
    for (const key of Object.keys(validator)) validator[key] += record.validator[key];

    solver.findings += record.solver.findings;
    solver.onRejectedSet += record.solver.onRejectedSet;
    solver.onLikedSet += record.solver.onLikedSet;
    solver.unjoinable += record.solver.unjoinable;
    for (const [severity, count] of Object.entries(record.solver.bySeverity)) {
      solver.bySeverity[severity] = (solver.bySeverity[severity] ?? 0) + count;
    }

    if (record.player.reportable) {
      player.reportable += 1;
      if (record.player.fired) player.fired += 1;
    }
    player.gatedWords += record.player.gatedWords;
    player.gatedOnRejectedSet += record.player.gatedOnRejectedSet;
    player.trials += record.player.trials;
    player.solvedTrials += record.player.solvedTrials;

    if (record.style) {
      style.compared += 1;
      if (record.style.agree) style.agree += 1;
      else if (record.style.machineHappy) style.machineHappyHumanNot += 1;
      else style.humanHappyMachineNot += 1;
    }

    for (const verdict of record.verdicts.values()) {
      if (verdict.verdict === null) populations.unclassifiedSets += 1;
      else if (verdict.trusted) populations.trustedSets += 1;
      else populations.version1Sets += 1;
    }
  }

  return {
    attempts: records.length,
    runs: new Set(records.map((record) => record.runId)).size,
    skipped,
    populations,
    validator,
    solver,
    player,
    style,
    tags: tagTally(allEvents),
    proposals: proposalTally(allEvents),
  };
}

// --- CLI ------------------------------------------------------------------

const pct = (part, whole) => (whole === 0 ? 'n/a' : `${Math.round((part / whole) * 100)}%`);

function print(summary) {
  const { validator: v, solver: s, player: p, style: st } = summary;

  console.log(`\nASTO Studio — evaluator report`);
  console.log(`${summary.attempts} judged attempt(s) across ${summary.runs} run(s).`);
  console.log(
    `skipped: ${summary.skipped.mock} mock run(s) · ${summary.skipped.noFeedback} unjudged run(s) ` +
      `· ${summary.skipped.unjudgedAttempt} unjudged attempt(s) · ${summary.skipped.noBoard} with no board`,
  );

  console.log(`\n-- set populations (never pooled) --`);
  console.log(`  ${summary.populations.trustedSets} set verdicts from formVersion 2+ (trusted)`);
  console.log(`  ${summary.populations.version1Sets} from version 1, read through TAGS only`);
  console.log(`  ${summary.populations.unclassifiedSets} carrying no classifiable verdict`);

  const vTotal = v.agreePass + v.agreeFail + v.flaggedLiked + v.passedRejected;
  console.log(`\n-- 05 analogy validator: pass/fail vs Max, per set --`);
  console.log(`  agreed        ${v.agreePass + v.agreeFail} of ${vTotal}  (${pct(v.agreePass + v.agreeFail, vTotal)})`);
  console.log(`    both liked        ${v.agreePass}`);
  console.log(`    both rejected     ${v.agreeFail}`);
  console.log(`  05 flagged, Max liked it     ${v.flaggedLiked}   <- the paris failure mode`);
  console.log(`  05 passed, Max rejected it   ${v.passedRejected}   <- what it misses`);
  console.log(`  no comparable verdict        ${v.unjudged}`);

  console.log(`\n-- 06 adversarial solver: findings vs rejected sets --`);
  console.log(`  ${s.findings} finding(s); ${s.onRejectedSet} touched a set Max rejected (${pct(s.onRejectedSet, s.findings)})`);
  console.log(`  ${s.onLikedSet} touched only sets he kept · ${s.unjoinable} could not be joined to a set`);
  console.log(`  by severity: ${Object.entries(s.bySeverity).map(([k, n]) => `${k} ${n}`).join(' · ') || '(none)'}`);
  console.log(`  NB: "touched" is word overlap, not proof it found his reason.`);

  console.log(`\n-- 07 test player: self-reported blind spots --`);
  console.log(`  ${p.reportable} attempt(s) could report knowledgeGated; it fired on ${p.fired} (${pct(p.fired, p.reportable)})`);
  console.log(`  ${p.gatedWords} gated word(s), ${p.gatedOnRejectedSet} on a set Max then rejected`);
  console.log(`  solved ${p.solvedTrials} of ${p.trials} trial(s)`);

  console.log(`\n-- 08 style guide: board verdict vs Max's --`);
  console.log(`  agreed ${st.agree} of ${st.compared} (${pct(st.agree, st.compared)})`);
  console.log(`  08 happy / Max not: ${st.machineHappyHumanNot} · Max happy / 08 not: ${st.humanHappyMachineNot}`);

  const retired = Object.entries(summary.tags.retired);
  console.log(`\n-- tags --`);
  const top = Object.entries(summary.tags.active).sort((a, b) => b[1] - a[1]).slice(0, 8);
  for (const [tag, count] of top) console.log(`  ${String(count).padStart(4)}  ${tag}`);
  console.log(
    retired.length > 0
      ? `  retired (counted, never re-sorted): ${retired.map(([t, n]) => `${t} ${n}`).join(', ')}`
      : `  retired: none in corpus`,
  );

  const pr = summary.proposals;
  console.log(`\n-- D-5 revision proposer: graduation evidence --`);
  console.log(`  ${pr.verdicts} verdict(s) recorded: ${pr.accepted} accepted · ${pr.edited} edited · ${pr.discarded} discarded`);

  const chains = summary.chains ?? [];
  const tally = summary.chainTally;
  if (tally) {
    console.log(`\n  brief -> revision -> outcome:`);
    for (const chain of chains) {
      const reached =
        chain.notesReached === true ? 'notes arrived' :
        chain.notesReached === false ? 'NOTES NEVER ARRIVED (pre-D-11)' :
        'no revision';
      console.log(
        `    ${chain.slug.replace(/^\d{4}-\d\d-\d\dT[\d.-]+Z-/, '').padEnd(18)} ` +
          `${String(chain.verdict).padEnd(9)} ${reached.padEnd(31)} -> ${chain.outcome}`,
      );
    }
    console.log(
      `\n  ${tally.confounded} of ${tally.revised} revision(s) never received the notes, and are` +
        ` excluded:\n  a blind re-roll's rejection is not evidence about the brief that asked for it.`,
    );
    // Approved and published are reported apart because they are apart: 14 of
    // the corpus's 33 approved runs never reached `puzzles/`.
    const heldBack = tally.approved - tally.published;
    console.log(
      `  USABLE evidence: ${tally.published} published of ${tally.usable}` +
        ` (${tally.approved} approved${heldBack > 0 ? `, ${heldBack} of them not published` : ''},` +
        ` ${tally.rejected} rejected, ${tally.open} still open).`,
    );
  }
  console.log('');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ args: process.argv.slice(2), options: { json: { type: 'boolean', default: false } }, strict: true });
  const store = createRunStore({ rootDir: RUNS_DIR });
  const chains = collectChains(store);
  const summary = { ...summarize(collect(store)), chains, chainTally: chainTally(chains) };
  if (values.json) console.log(JSON.stringify(summary, null, 2));
  else print(summary);
}

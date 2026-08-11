// api.js — the Review Studio's route handlers.
//
// Pure in the ways that matter: no node:http, no fs, no fetch. It takes a
// method, a path and an already-parsed body, and returns a status and a body.
// That makes every rule below testable as a function call rather than through
// a socket, and it keeps the transport concerns in server.js where they belong.
//
// Three habits run through it:
//
//   IDs are validated by pattern before they reach the store. A runId that
//   does not match the shape createRun produces can never be joined onto a
//   path, so traversal is impossible by construction rather than by filtering.
//
//   The store's own guards are the authority. Illegal status transitions,
//   one-attempt-at-a-time, revision limits — none of those are re-implemented
//   here. They are caught and mapped to 409, so there is exactly one place
//   where each rule lives.
//
//   Validation failures write nothing. A batch of feedback is validated in
//   full before the first event is appended.

import { isValidStageId } from '../stage-registry.js';
import { validateFeedbackEvent } from '../schemas.js';
import { StudioFailure } from '../failures.js';
import { buildRelationshipIndex, buildThemedBrief, buildVarietyBrief } from '../variety.js';
// The pair-count bounds are the pipeline's arithmetic, not this API's policy —
// see pipeline-config.js for why the floor is where it is.
import { MIN_PAIR_COUNT, DEFAULT_PAIR_COUNT, MAX_PAIR_COUNT } from '../pipeline-config.js';
import { pickFreshSubject } from '../subject.js';
import { proposalFailureFile, proposalFile, proposeRevision, wantsProposal } from './proposer.js';
import { autoRevisionFile } from '../auto-revise.js';
import { defaultTransport } from './runner.js';
import { createPuzzleStore, PublishRefused } from '../storage/puzzle-store.js';
import { slugify } from '../slug.js';

// The shape createRun builds: an ISO timestamp with ':' replaced by '-',
// then the slug.
const RUN_ID = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z-[a-z0-9][a-z0-9-]*$/;
const ATTEMPT_ID = /^\d{4}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

const MAX_NOTE = 2000;
const MAX_EVENTS = 64;

const ok = (body) => ({ status: 200, body });
const accepted = (body) => ({ status: 202, body });
const bad = (error, errors) => ({ status: 400, body: { error, ...(errors ? { errors } : {}) } });
const notFound = (error) => ({ status: 404, body: { error } });
const conflict = (error) => ({ status: 409, body: { error } });

const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Maps a throw from the store or the pipeline onto a status.
 *
 * Everything the store refuses on purpose — an illegal transition, a second
 * running attempt, a revision past its limit — is a conflict with the run's
 * current state, not a server fault. Anything unrecognized is a real 500 and
 * is reported as a message only: no stacks, no paths.
 */
function fromThrow(error) {
  const message = error?.message ?? String(error);
  const isConflict =
    error instanceof StudioFailure ||
    /illegal run status transition|still running|already (complete|failed|running)|revision limit/i.test(
      message,
    );
  return isConflict ? conflict(message) : { status: 500, body: { error: message } };
}

export function createApi({
  store,
  runner,
  clock = () => new Date().toISOString(),
  buildBrief = ({ count }) => buildVarietyBrief({ index: buildRelationshipIndex({ store }), count }),
  buildThemed = ({ count }) => buildThemedBrief({ index: buildRelationshipIndex({ store }), count }),
  // The fresh-subject chain (design.md D-15): scout → unused pool → LRU. The
  // seam accepts a plain string return too — tests inject `() => 'clocks and
  // time'` and a string is treated as an injected pick with no source or
  // style, exactly as a typed theme would be.
  chooseSubject = null,
  // The Revision Proposer's transport and learning package. Injected the same
  // way the runner's are, so a test replays a fixture and a mock run never
  // reaches the API.
  makeTransport = defaultTransport,
  loadContext = () => ({}),
  // The only writer into `puzzles/`. Injected for the same reason the run
  // store is: a test publishes into a throwaway directory, never into the
  // game's real content.
  puzzles = createPuzzleStore(),
  // Is this server running the code that is on disk?
  //
  // A node process holds the modules it started with, so a fix merged after
  // boot simply does not exist for a running Studio. On 2026-08-07 that cost a
  // real conclusion: the revision fix merged at 20:48, a server booted at 19:16
  // ran a revision at 20:00, it churned exactly as before, and Max reasonably
  // read that as the fix not working. Injected rather than computed here
  // because api.js does not touch the filesystem — server.js does.
  codeState = null,
}) {
  // runId → the in-flight proposal, so a second rejection cannot start two.
  const proposalsInFlight = new Map();

  const runExists = (runId) => store.listRuns().includes(runId);

  const currentBoard = (runId) => {
    const { currentAttemptId } = store.readManifest(runId);
    if (!currentAttemptId) return null;
    try {
      return store.readAttemptArtifact(runId, currentAttemptId, 'board.json');
    } catch {
      return null; // no board yet — a run still working, or one that failed
    }
  };

  const setIdsOf = (board) => new Set((board?.sets ?? []).map((set) => set.id));

  // --- reads ---

  function listRuns() {
    const runs = store
      .listRuns()
      .map((runId) => {
        try {
          const m = store.readManifest(runId);
          return {
            runId: m.runId,
            status: m.status,
            theme: m.theme,
            createdAt: m.createdAt,
            currentAttemptId: m.currentAttemptId,
            attemptCount: m.attemptCount,
            revisionCount: m.revisionCount,
          };
        } catch {
          return null; // a corrupt manifest must not blank the whole list
        }
      })
      .filter(Boolean)
      .sort((a, b) => (a.runId < b.runId ? 1 : -1)); // newest first
    return ok({ runs });
  }

  // What the running server would actually use, asked of the runner rather
  // than read from disk — see runner.configOf. The values are settings, not
  // secrets: two version strings, nothing about the key or the environment.
  function readConfig() {
    // Spread rather than nulled when no provider is injected: a test that does
    // not care about staleness should see the response it always saw.
    return ok({ ...runner.configOf(), ...(codeState ? codeState() : {}) });
  }

  function readRun(runId) {
    const manifest = store.readManifest(runId);
    const attempts = store.listAttempts(runId).map((attemptId) => {
      const a = store.readAttempt(runId, attemptId);
      return {
        attemptId: a.attemptId,
        status: a.status,
        startingStage: a.startingStage,
        parentAttemptId: a.parentAttemptId,
        stageStatuses: a.stageStatuses,
        resumes: a.resumes,
        usage: a.usage ?? null,
        failureReason: a.failureReason ?? null,
      };
    });
    return ok({
      manifest,
      attempts,
      decisions: store.readDecisions(runId),
      feedback: store.readFeedback(runId),
      inProcess: runner.stateOf(runId),
    });
  }

  // The stages whose output the review page shows. The gate is read from its
  // human-facing integrity.json rather than its output.json duplicate.
  const REPORT_STAGES = [
    // Read for its declared shapes — the review card teaches each set's
    // stance (paradigm + failure mode) joined from these by set id.
    ['02-theme-grouper', 'output.json'],
    ['03-difficulty-rater', 'output.json'],
    // Read for its "promotions" — which sets were labelled harder than they
    // were graded. The board itself comes from board.json.
    ['04-board-builder', 'output.json'],
    ['04a-integrity', 'integrity.json'],
    ['05-analogy-validator', 'output.json'],
    ['06-adversarial-solver', 'output.json'],
    ['07-test-player', 'output.json'],
    ['08-style-guide', 'output.json'],
    // The proposed gloss (D-18) — shown beside its set so a leak is catchable.
    ['09-glossary-author', 'output.json'],
  ];

  function readAttempt(runId, attemptId) {
    if (!store.listAttempts(runId).includes(attemptId)) {
      return notFound(`no attempt ${attemptId} in run ${runId}`);
    }
    const optional = (filename) => {
      try {
        return store.readAttemptArtifact(runId, attemptId, filename);
      } catch {
        return undefined;
      }
    };
    const reports = {};
    for (const [stageId, filename] of REPORT_STAGES) {
      if (store.hasStageArtifact(runId, attemptId, stageId, filename)) {
        reports[stageId] = store.readStageArtifact(runId, attemptId, stageId, filename);
      }
    }
    // The pre-review fix loop's audit record (design.md D-14), keyed by the
    // attempt it CREATED: the attempt Max lands on is the revised one, and the
    // card's panel answers "why does this attempt exist". A run artifact, not
    // an attempt artifact — completed work is never rewritten.
    const autoRevision = (() => {
      try {
        return store.readRunArtifact(runId, autoRevisionFile(attemptId));
      } catch {
        return undefined;
      }
    })();

    return ok({
      attempt: store.readAttempt(runId, attemptId),
      board: optional('board.json'),
      failure: optional('failure.json'),
      revision: optional('revision.json'),
      parentAttempt: optional('parent-attempt.json'),
      blackboard: optional('blackboard.json'),
      reports,
      ...(autoRevision === undefined ? {} : { autoRevision }),
    });
  }

  // --- writes ---

  async function createRun(body) {
    if (!isPlainObject(body)) return bad('body must be an object');
    const allowed = new Set(['theme', 'slug', 'count', 'mock', 'autoRevise']);
    for (const key of Object.keys(body)) {
      if (!allowed.has(key)) return bad(`unknown field: ${key}`);
    }

    const { theme = null, count = DEFAULT_PAIR_COUNT, mock = false, autoRevise = true } = body;
    if (theme !== null && typeof theme !== 'string') return bad('theme must be a string or null');
    if (typeof mock !== 'boolean') return bad('mock must be a boolean');
    if (typeof autoRevise !== 'boolean') return bad('autoRevise must be a boolean');
    if (!Number.isInteger(count) || count < MIN_PAIR_COUNT || count > MAX_PAIR_COUNT) {
      return bad(`count must be an integer between ${MIN_PAIR_COUNT} and ${MAX_PAIR_COUNT}`);
    }

    // An explicit slug is judged BEFORE any subject work: a body this route
    // will refuse anyway must not spend a model call finding that out.
    if (body.slug !== undefined && !SLUG.test(body.slug)) {
      return bad('slug must be lowercase letters, digits and hyphens');
    }

    // Surprise-me also picks a SUBJECT, which shape variety never was. Both
    // surprise-me boards Max has judged were rejected for having no unifying
    // theme, while every themed board was approved — so the run gets a subject
    // AND its shape brief. Since D-15 the subject is FRESH — the scout invents
    // one that no non-mock run has used, with the pool as loop-free fallback —
    // which costs the surprise-me POST a couple of seconds of model latency,
    // paid on the button press for a run that takes minutes.
    let pick = null;
    if (theme === null) {
      // A transport that cannot even be BUILT (no API key) is the same case as
      // one that fails mid-call: the chain falls back to the pool, because a
      // missing key must stop a pipeline run, never the creation of one.
      let transport = null;
      try {
        transport = makeTransport({ mock });
      } catch {
        transport = null;
      }
      const drawn = chooseSubject
        ? await chooseSubject()
        : await pickFreshSubject({ store, transport, context: loadContext() });
      // A plain string is an injected pick (the test seam); it carries no
      // source or style, exactly like a theme Max typed.
      pick = typeof drawn === 'string' ? { subject: drawn, source: 'injected', style: null } : drawn;
    }
    const runTheme = theme ?? pick.subject;

    // The slug follows the SUBJECT, not the door the run came in through.
    // It was 'surprise-me' for a few hours on 2026-08-04 and Max caught it:
    // the run id is the folder on disk and the thing you scan in the run list,
    // and "surprise-me" tells you nothing once a subject has been drawn. What
    // still marks a run as surprise-me is the shape brief on its manifest,
    // which a themed run never carries.
    const slug = body.slug ?? slugify(runTheme) ?? 'surprise-me';
    if (!SLUG.test(slug)) return bad('slug must be lowercase letters, digits and hyphens');

    // Surprise-me runs get a positive variety brief: which underused shapes to
    // reach for, which recent ones to leave alone (locked decision 6). Themed
    // runs keep the theme as the steer — but EVERY brief carries stance quotas
    // (design.md D-3) and every cross-board steer, because a rut is about the
    // library rather than about subject matter. What still marks a run as
    // surprise-me is `relationshipShapes` on its manifest, which a themed run
    // never carries.
    //
    // Both shapes come from `variety.js` rather than being assembled here.
    // This file used to re-list what a themed brief carries, and D-13's
    // `varyHardestStance` was added to the variety brief without that list
    // learning about it — so the steer built to answer Max's complaint reached
    // surprise-me runs only, while every board he complained about was themed.
    //
    // `mock` is recorded on the run, not just passed to this launch: a
    // revision must not silently switch to the real API, and a fixture-derived
    // board must stay identifiable so it never counts as editorial signal.
    const brief = {
      ...(theme === null ? buildBrief({ count }) : buildThemed({ count })),
      mock,
      // Whether the pre-review fix loop (design.md D-14) may touch this run.
      // Recorded at creation for the same reason `mock` is: a resume must obey
      // the choice made when the run was started, not the form's state today.
      autoRevise,
      // Where the subject came from and which style was asked of the scout
      // (design.md D-15) — the audit trail for whether generation carries the
      // load, and the segmentation key for the world-vs-lens comparison.
      ...(pick ? { subjectSource: pick.source, subjectStyle: pick.style } : {}),
    };
    const { runId } = store.createRun({ slug, theme: runTheme, brief });
    // Fire and forget: a real run takes minutes, so the answer is 202 and the
    // UI follows manifest.status, which is already the state machine.
    runner.start(runId, { mock });
    return accepted({ runId });
  }

  function resumeRun(runId, body) {
    if (!isPlainObject(body) || body.action !== 'resume') {
      return bad('body must be { action: "resume", fresh?: boolean }');
    }
    if (body.fresh !== undefined && typeof body.fresh !== 'boolean') {
      return bad('fresh must be a boolean');
    }
    runner.start(runId, { ...(body.fresh === undefined ? {} : { fresh: body.fresh }) });
    return accepted({ runId });
  }

  function requestRevision(runId, body) {
    if (!isPlainObject(body)) return bad('body must be an object');
    const { fromStage, notes = '', scope = null } = body;

    if (!isValidStageId(fromStage)) return bad(`fromStage is not a stage id: ${fromStage}`);
    if (typeof notes !== 'string' || notes.length > MAX_NOTE) {
      return bad(`notes must be a string of at most ${MAX_NOTE} characters`);
    }
    if (scope !== null) {
      if (!isPlainObject(scope) || !['board', 'set'].includes(scope.type)) {
        return bad('scope must be { type: "board" } or { type: "set", setId }');
      }
      if (scope.type === 'set' && !setIdsOf(currentBoard(runId)).has(scope.setId)) {
        return bad(`no set ${scope.setId} on the current board`);
      }
    }

    const attemptId = runner.revise(runId, { fromStage, notes, scope });
    return accepted({ attemptId });
  }

  /** Validates a whole batch before writing any of it. */
  function checkFeedback(runId, events) {
    if (!Array.isArray(events)) return bad('events must be an array');
    if (events.length === 0) return bad('events must not be empty');
    if (events.length > MAX_EVENTS) return bad(`at most ${MAX_EVENTS} events per request`);

    const { currentAttemptId } = store.readManifest(runId);
    const setIds = setIdsOf(currentBoard(runId));
    const errors = [];

    for (const [index, event] of events.entries()) {
      const result = validateFeedbackEvent(event);
      if (!result.ok) {
        errors.push(...result.errors.map((e) => ({ ...e, path: `events[${index}].${e.path}` })));
        continue;
      }
      if (event.scope.type === 'set' && !setIds.has(event.scope.setId)) {
        errors.push({
          path: `events[${index}].scope.setId`,
          message: `no set ${event.scope.setId} on the current board`,
        });
      }
      // A tab left open across a revision would otherwise attach Max's
      // judgement of one board to a different one.
      if (event.attemptId !== currentAttemptId) {
        return conflict(
          `feedback targets attempt ${event.attemptId}, but ${currentAttemptId} is current — reload`,
        );
      }
    }
    return errors.length > 0 ? bad('invalid feedback', errors) : null;
  }

  function appendFeedback(runId, body) {
    if (!isPlainObject(body)) return bad('body must be an object');
    const problem = checkFeedback(runId, body.events);
    if (problem) return problem;
    for (const event of body.events) store.appendFeedback(runId, event);

    // "Publishable after a fix" is saved, not decided: it leaves the run in
    // `awaiting-review`, which is the only status a revision can be requested
    // from. The proposal is built here so the brief is waiting by the time Max
    // has finished writing his notes.
    if (wantsProposal(body.events)) {
      const { currentAttemptId } = store.readManifest(runId);
      startProposal(runId, currentAttemptId, body.events);
    }
    return ok({ count: body.events.length });
  }

  function decide(runId, action, body) {
    if (!isPlainObject(body)) return bad('body must be an object');

    const events = body.feedback ?? [];
    if (events.length > 0) {
      const problem = checkFeedback(runId, events);
      if (problem) return problem;
    }

    const { currentAttemptId } = store.readManifest(runId);
    // The transition map decides whether this is legal — including refusing a
    // second approval, since `approved` only leads to `archived`.
    store.updateStatus(runId, action === 'approve' ? 'approved' : 'rejected');
    store.appendDecision(runId, { type: action, attemptId: currentAttemptId, at: clock() });
    for (const event of events) store.appendFeedback(runId, event);

    // No proposal here: approve and reject are both terminal decisions, and a
    // rejected run leads only to `archived`. A brief proposing a revision that
    // cannot be requested is spend with nothing to buy — see proposer.js.
    return ok({ status: store.readManifest(runId).status });
  }

  /**
   * Publishes an approved board into `puzzles/` — the game's own content.
   *
   * Publication is RECORDED, not transitioned. The run stays `approved`;
   * `approved → archived` remains the only move out of it, so this adds no
   * state to the machine and no field to the manifest. The record lives in
   * `decisions.jsonl` beside the approval it followed, and it is also what
   * tells a second publish of the same run that it is a republish rather than
   * a collision with somebody else's board.
   *
   * Everything about the board itself — schema, integrity, slug shape,
   * occupancy — is the puzzle store's to refuse. This maps those refusals onto
   * statuses and re-implements none of them.
   */
  // Last-resort fallback: `2026-08-05T07-12-44.975Z-batman` → `batman`, for a
  // board whose title slugs to nothing at all.
  const slugOfRun = (runId) => runId.slice(runId.indexOf('Z-') + 2);

  /**
   * The set-level changes Max recorded on the attempt about to be published,
   * and which publishing will not apply.
   *
   * Publishing ships `board.json` exactly as the pipeline generated it —
   * hand-editing is B2, still deferred (HR-2). That is a fine limitation and a
   * terrible silence: on 2026-08-08 Behind the Scenes was published carrying a
   * recorded difficulty change from 3 to 1 that simply evaporated, the fourth
   * time that had happened (Ascent, bbq twice, cinema) and the first time
   * anyone noticed. Nothing distinguished "I changed my mind" from "I forgot
   * I flagged that".
   *
   * Only the CURRENT attempt counts. A request answered by a revision is not
   * outstanding — the revision is the answer.
   */
  const UNAPPLIED_ACTIONS = new Set([
    'change-difficulty',
    'set-needs-edit',
    'set-replace',
    'revise-set',
  ]);

  function unappliedEdits(runId, attemptId) {
    return store
      .readFeedback(runId)
      .filter((event) => event.attemptId === attemptId && UNAPPLIED_ACTIONS.has(event.action))
      .map((event) => ({
        action: event.action,
        setId: event.scope?.setId ?? null,
        ...(event.after?.difficulty !== undefined
          ? { from: event.before?.difficulty ?? null, to: event.after.difficulty }
          : {}),
        ...(event.note ? { note: event.note } : {}),
      }));
  }

  function publishRun(runId, body) {
    if (!isPlainObject(body)) return bad('body must be an object');
    for (const key of Object.keys(body)) {
      if (key !== 'slug' && key !== 'acknowledgeUnapplied') return bad(`unknown field: ${key}`);
    }

    const manifest = store.readManifest(runId);
    if (manifest.status !== 'approved') {
      return conflict(
        `only an approved run can be published — run ${runId} is ${manifest.status}`,
      );
    }

    let board = currentBoard(runId);
    if (!board) return conflict(`run ${runId} has no board to publish`);

    // The gloss rides the published puzzle (D-18): board.json is 04's artifact
    // and predates stage 09, so the merge happens here, at the one door game
    // content leaves through. Absent or empty → the puzzle ships without a
    // glossary and the game shows no Vocabulary button, exactly as pre-D-18.
    try {
      const gloss = store.readStageArtifact(
        runId,
        manifest.currentAttemptId,
        '09-glossary-author',
        'output.json',
      );
      if (Array.isArray(gloss?.glossary) && gloss.glossary.length > 0) {
        board = { ...board, glossary: gloss.glossary };
      }
    } catch {
      // No glossary stage on this attempt (pre-D-18 runs) — publish as before.
    }

    // Refused once, then allowed on the retry that carries the acknowledgement.
    // Deliberately not a hard block: the board is often right to publish as-is
    // and Max is the editor. What it refuses is publishing WITHOUT KNOWING.
    if (!body.acknowledgeUnapplied) {
      const unapplied = unappliedEdits(runId, manifest.currentAttemptId);
      if (unapplied.length > 0) {
        return {
          status: 409,
          body: {
            error:
              `publishing ships the board exactly as generated, and ${unapplied.length} recorded ` +
              `change${unapplied.length === 1 ? '' : 's'} would not be applied`,
            reason: 'unapplied-edits',
            unapplied,
          },
        };
      }
    }

    // Default: the board's own title. A run slug is a lifecycle name —
    // `beach-retry` records that the first beach run truncated — and baking
    // that into a puzzle id would make the game's content remember the
    // Studio's accidents. `asto-first-light` is the precedent to join.
    const slug = body.slug ?? slugify(board.title) ?? slugOfRun(runId);

    // A republish is this run reclaiming its own file. Another run claiming an
    // occupied slug is a collision, and the store refuses it.
    const replace = store
      .readDecisions(runId)
      .some((event) => event.type === 'publish' && event.publishedAs === `${slug}.json`);

    let published;
    try {
      published = puzzles.publish({ board, slug, replace });
    } catch (error) {
      if (!(error instanceof PublishRefused)) throw error;
      // A malformed slug is a bad request; everything else is a conflict with
      // the state of the board or of the puzzles directory.
      const refusal = {
        error: error.message,
        reason: error.reason,
        ...(error.errors ? { errors: error.errors } : {}),
      };
      return error.reason === 'bad-slug'
        ? { status: 400, body: refusal }
        : { status: 409, body: refusal };
    }

    store.appendDecision(runId, {
      type: 'publish',
      attemptId: manifest.currentAttemptId,
      boardId: published.originalId,
      publishedAs: published.filename,
      publishedId: published.id,
      republished: replace,
      at: clock(),
    });

    return ok({ published });
  }

  // Fire and forget, like `runner.start`: a proposal takes seconds, and the
  // page polls for it. Errors are swallowed here because proposer.js already
  // records them as artifacts — an unhandled rejection would take the server
  // down over an advisory nicety.
  function startProposal(runId, attemptId, events) {
    proposalsInFlight.set(
      runId,
      proposeRevision({
        store,
        runId,
        attemptId,
        feedback: events,
        transport: makeTransport({ mock: isMockRun(runId) }),
        context: loadContext(),
      })
        .catch(() => null)
        .finally(() => proposalsInFlight.delete(runId)),
    );
  }

  const isMockRun = (runId) => {
    try {
      return store.readManifest(runId).brief?.mock === true;
    } catch {
      return false;
    }
  };

  /**
   * The revision brief for the current attempt, if one exists yet.
   *
   * FOUR distinguishable answers, because "not ready", "never coming" and
   * "never asked for" ask different things of the page:
   *
   *   the proposal          — it is here
   *   `working: true`       — the model is out; poll again
   *   `failure`             — it ran and could not produce one
   *   neither, both absent  — nothing was ever attempted
   *
   * The fourth used to be indistinguishable from the third, which is the whole
   * point of this endpoint growing a field. `failure` is omitted rather than
   * nulled when there is nothing: absent artifacts are absent, not errors.
   *
   * A proposal outranks a failure record. They can coexist — a proposer re-run
   * for the same attempt succeeds without erasing the earlier attempt's trace —
   * and the brief is the answer whenever there is one.
   */
  function readProposal(runId) {
    if (!runExists(runId)) return notFound(`no run ${runId}`);
    const { currentAttemptId } = store.readManifest(runId);
    if (!currentAttemptId) return ok({ proposal: null, working: false });
    try {
      return ok({
        proposal: store.readRunArtifact(runId, proposalFile(currentAttemptId)),
        working: false,
      });
    } catch {
      if (proposalsInFlight.has(runId)) return ok({ proposal: null, working: true });

      const failureFile = proposalFailureFile(currentAttemptId);
      if (!store.hasRunArtifact(runId, failureFile)) {
        return ok({ proposal: null, working: false });
      }
      let failure;
      try {
        failure = store.readRunArtifact(runId, failureFile);
      } catch {
        // The record exists but will not parse. Still an answer worth giving:
        // something was attempted. Falling silent here would reproduce the
        // exact ambiguity this field was added to remove.
        failure = {
          attemptId: currentAttemptId,
          category: 'unreadable',
          message: 'a failure was recorded but could not be read',
        };
      }
      return ok({ proposal: null, working: false, failure });
    }
  }

  // --- dispatch ---

  const ROUTES = [
    ['GET', /^\/api\/config$/, () => readConfig()],
    ['GET', /^\/api\/runs$/, () => listRuns()],
    ['POST', /^\/api\/runs$/, (_m, { body }) => createRun(body)],
    ['GET', /^\/api\/runs\/([^/]+)$/, (m) => readRun(m[1])],
    ['POST', /^\/api\/runs\/([^/]+)$/, (m, { body }) => resumeRun(m[1], body)],
    ['GET', /^\/api\/runs\/([^/]+)\/attempts\/([^/]+)$/, (m) => readAttempt(m[1], m[2])],
    ['POST', /^\/api\/runs\/([^/]+)\/revisions$/, (m, { body }) => requestRevision(m[1], body)],
    ['POST', /^\/api\/runs\/([^/]+)\/feedback$/, (m, { body }) => appendFeedback(m[1], body)],
    ['GET', /^\/api\/runs\/([^/]+)\/proposal$/, (m) => readProposal(m[1])],
    ['POST', /^\/api\/runs\/([^/]+)\/approve$/, (m, { body }) => decide(m[1], 'approve', body)],
    ['POST', /^\/api\/runs\/([^/]+)\/reject$/, (m, { body }) => decide(m[1], 'reject', body)],
    ['POST', /^\/api\/runs\/([^/]+)\/publish$/, (m, { body }) => publishRun(m[1], body)],
  ];

  async function handle({ method, path, body = null }) {
    let pathMatched = false;

    for (const [routeMethod, pattern, run] of ROUTES) {
      const match = pattern.exec(path);
      if (!match) continue;
      pathMatched = true;
      if (routeMethod !== method) continue;

      // Ids are checked before the handler so no handler can be reached with
      // one the store would have to interpret.
      const runId = match[1];
      if (runId !== undefined) {
        if (!RUN_ID.test(decodeURIComponent(runId))) return bad('malformed run id');
        if (!runExists(decodeURIComponent(runId))) return notFound(`no run ${decodeURIComponent(runId)}`);
      }
      const attemptId = match[2];
      if (attemptId !== undefined && !ATTEMPT_ID.test(attemptId)) {
        return bad('malformed attempt id');
      }

      try {
        // Awaited INSIDE the try: createRun is async since D-15 (the subject
        // scout), and a rejection returned un-awaited would escape fromThrow.
        return await run(
          [match[0], ...(runId === undefined ? [] : [decodeURIComponent(runId)]), ...(attemptId === undefined ? [] : [attemptId])],
          { body },
        );
      } catch (error) {
        return fromThrow(error);
      }
    }

    return pathMatched
      ? { status: 405, body: { error: `method ${method} not allowed` } }
      : notFound(`no route for ${path}`);
  }

  return { handle };
}

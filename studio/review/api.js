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
import { buildRelationshipIndex, buildVarietyBrief } from '../variety.js';
// The pair-count bounds are the pipeline's arithmetic, not this API's policy —
// see pipeline-config.js for why the floor is where it is.
import { MIN_PAIR_COUNT, DEFAULT_PAIR_COUNT, MAX_PAIR_COUNT } from '../pipeline-config.js';

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
}) {
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
    return ok(runner.configOf());
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
    ['03-difficulty-rater', 'output.json'],
    // Read for its "promotions" — which sets were labelled harder than they
    // were graded. The board itself comes from board.json.
    ['04-board-builder', 'output.json'],
    ['04a-integrity', 'integrity.json'],
    ['05-analogy-validator', 'output.json'],
    ['06-adversarial-solver', 'output.json'],
    ['07-test-player', 'output.json'],
    ['08-style-guide', 'output.json'],
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
    return ok({
      attempt: store.readAttempt(runId, attemptId),
      board: optional('board.json'),
      failure: optional('failure.json'),
      revision: optional('revision.json'),
      parentAttempt: optional('parent-attempt.json'),
      blackboard: optional('blackboard.json'),
      reports,
    });
  }

  // --- writes ---

  function createRun(body) {
    if (!isPlainObject(body)) return bad('body must be an object');
    const allowed = new Set(['theme', 'slug', 'count', 'mock']);
    for (const key of Object.keys(body)) {
      if (!allowed.has(key)) return bad(`unknown field: ${key}`);
    }

    const { theme = null, count = DEFAULT_PAIR_COUNT, mock = false } = body;
    if (theme !== null && typeof theme !== 'string') return bad('theme must be a string or null');
    if (typeof mock !== 'boolean') return bad('mock must be a boolean');
    if (!Number.isInteger(count) || count < MIN_PAIR_COUNT || count > MAX_PAIR_COUNT) {
      return bad(`count must be an integer between ${MIN_PAIR_COUNT} and ${MAX_PAIR_COUNT}`);
    }

    const slug = body.slug ?? slugify(theme) ?? 'surprise-me';
    if (!SLUG.test(slug)) return bad('slug must be lowercase letters, digits and hyphens');

    // Surprise-me runs get a positive variety brief: which underused shapes to
    // reach for, which recent ones to leave alone (locked decision 6). Themed
    // runs keep the theme as the steer.
    // `mock` is recorded on the run, not just passed to this launch: a
    // revision must not silently switch to the real API, and a fixture-derived
    // board must stay identifiable so it never counts as editorial signal.
    const brief = { ...(theme === null ? buildBrief({ count }) : { count }), mock };
    const { runId } = store.createRun({ slug, theme, brief });
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

    return ok({ status: store.readManifest(runId).status });
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
    ['POST', /^\/api\/runs\/([^/]+)\/approve$/, (m, { body }) => decide(m[1], 'approve', body)],
    ['POST', /^\/api\/runs\/([^/]+)\/reject$/, (m, { body }) => decide(m[1], 'reject', body)],
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
        return run(
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

export const slugify = (text) => {
  if (typeof text !== 'string') return null;
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : null;
};

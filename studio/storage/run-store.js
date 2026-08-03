// run-store — the ONLY module that reads or writes run artifacts.
//
// Pipeline, CLI, and Review Studio server all go through this seam so the
// run-directory contract has exactly one interpretation. Enforces here,
// not in callers: monotonic attempt IDs, immutability of completed
// attempts, the status-transition map, quarantine of partial stage
// folders, and per-run locking on every mutation.
//
// The clock is injected (same rule as the engine's RNG) so tests are
// deterministic; the default is the real time.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  appendFileSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';

import { writeJsonAtomic, writeTextAtomic } from './atomic-write.js';
import { withLock } from './lock.js';
import { isValidStageId, stagesFrom } from '../stage-registry.js';
import {
  MANIFEST_SCHEMA_VERSION,
  canTransition,
  validateAttempt,
  validateFeedbackEvent,
  validateManifest,
} from '../schemas.js';

export function createRunStore({ rootDir, clock = () => new Date().toISOString() }) {
  const runDir = (runId) => join(rootDir, runId);
  const attemptDir = (runId, attemptId) => join(runDir(runId), 'attempts', attemptId);
  const attemptPath = (runId, attemptId) => join(attemptDir(runId, attemptId), 'attempt.json');
  const manifestPath = (runId) => join(runDir(runId), 'manifest.json');

  const readJson = (path, what) => {
    let text;
    try {
      text = readFileSync(path, 'utf8');
    } catch (error) {
      throw new Error(`cannot read ${what}: ${error.message}`);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`corrupted ${what} (not valid JSON): ${path}`);
    }
  };

  const readManifest = (runId) => {
    const manifest = readJson(manifestPath(runId), `manifest for run ${runId}`);
    const result = validateManifest(manifest);
    if (!result.ok) {
      throw new Error(`invalid manifest for run ${runId}: ${result.errors.join('; ')}`);
    }
    return manifest;
  };

  const writeManifest = (runId, manifest) => {
    const result = validateManifest(manifest);
    if (!result.ok) {
      throw new Error(`refusing to write invalid manifest for run ${runId}: ${result.errors.join('; ')}`);
    }
    writeJsonAtomic(manifestPath(runId), manifest);
  };

  const readAttempt = (runId, attemptId) => {
    const attempt = readJson(attemptPath(runId, attemptId), `attempt ${attemptId} of run ${runId}`);
    const result = validateAttempt(attempt);
    if (!result.ok) {
      throw new Error(`invalid attempt ${attemptId} of run ${runId}: ${result.errors.join('; ')}`);
    }
    return attempt;
  };

  const writeAttempt = (runId, attempt) => {
    writeJsonAtomic(attemptPath(runId, attempt.attemptId), attempt);
  };

  const assertMutable = (attempt) => {
    if (attempt.status !== 'running') {
      throw new Error(
        `attempt ${attempt.attemptId} is ${attempt.status} and immutable — completed work is never rewritten`,
      );
    }
  };

  // Under the run lock: the pipeline writes decisions while the Review Studio
  // writes decisions and feedback, so these logs have two writers.
  const appendEvent = (runId, file, event) => {
    const stamped = { ...event, at: clock() };
    return withLock(runDir(runId), () => {
      appendFileSync(join(runDir(runId), file), `${JSON.stringify(stamped)}\n`);
      return stamped;
    });
  };

  const readJsonl = (runId, file) => {
    const path = join(runDir(runId), file);
    if (!existsSync(path)) return [];
    return readFileSync(path, 'utf8')
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line));
  };

  return {
    createRun({ slug, theme = null, brief = {} }) {
      const stamp = clock().replace(/:/g, '-');
      const runId = `${stamp}-${slug}`;
      const dir = runDir(runId);
      if (existsSync(dir)) throw new Error(`run already exists: ${runId}`);
      mkdirSync(join(dir, 'attempts'), { recursive: true });
      writeManifest(runId, {
        schemaVersion: MANIFEST_SCHEMA_VERSION,
        runId,
        createdAt: clock(),
        theme,
        brief,
        status: 'created',
        currentAttemptId: null,
        attemptCount: 0,
        revisionCount: 0,
      });
      return { runId, dir };
    },

    listRuns() {
      if (!existsSync(rootDir)) return [];
      return readdirSync(rootDir)
        .filter((name) => statSync(join(rootDir, name)).isDirectory())
        .filter((name) => existsSync(manifestPath(name)))
        .sort();
    },

    readManifest,

    updateStatus(runId, to) {
      return withLock(runDir(runId), () => {
        const manifest = readManifest(runId);
        if (!canTransition(manifest.status, to)) {
          throw new Error(`illegal run status transition: ${manifest.status} → ${to}`);
        }
        writeManifest(runId, { ...manifest, status: to });
      });
    },

    createAttempt(runId, { parentAttemptId = null, startingStage = '01-pair-author' } = {}) {
      if (!isValidStageId(startingStage)) {
        throw new Error(`unknown stage id: ${startingStage}`);
      }
      return withLock(runDir(runId), () => {
        const manifest = readManifest(runId);
        if (manifest.currentAttemptId !== null) {
          const current = readAttempt(runId, manifest.currentAttemptId);
          if (current.status === 'running') {
            throw new Error(
              `attempt ${current.attemptId} is still running — one attempt at a time per run`,
            );
          }
        }
        const attemptId = String(manifest.attemptCount + 1).padStart(4, '0');
        mkdirSync(join(attemptDir(runId, attemptId), 'stages'), { recursive: true });
        writeAttempt(runId, {
          schemaVersion: MANIFEST_SCHEMA_VERSION,
          attemptId,
          parentAttemptId,
          startingStage,
          status: 'running',
          stageStatuses: {},
          resumes: [],
          createdAt: clock(),
        });
        writeManifest(runId, {
          ...manifest,
          currentAttemptId: attemptId,
          attemptCount: manifest.attemptCount + 1,
          revisionCount: manifest.revisionCount + (parentAttemptId === null ? 0 : 1),
        });
        return attemptId;
      });
    },

    readAttempt,

    completeAttempt(runId, attemptId, { status, failureReason } = {}) {
      if (status !== 'complete' && status !== 'failed') {
        throw new Error(`completeAttempt status must be complete or failed, got ${status}`);
      }
      return withLock(runDir(runId), () => {
        const attempt = readAttempt(runId, attemptId);
        if (attempt.status !== 'running') {
          throw new Error(`attempt ${attemptId} is already ${attempt.status}`);
        }
        const finished = { ...attempt, status, finishedAt: clock() };
        if (status === 'failed') finished.failureReason = failureReason ?? 'unspecified';
        writeAttempt(runId, finished);
      });
    },

    writeStageArtifact(runId, attemptId, stageId, filename, value) {
      if (!isValidStageId(stageId)) throw new Error(`unknown stage id: ${stageId}`);
      return withLock(runDir(runId), () => {
        assertMutable(readAttempt(runId, attemptId));
        const stageDir = join(attemptDir(runId, attemptId), 'stages', stageId);
        mkdirSync(stageDir, { recursive: true });
        writeJsonAtomic(join(stageDir, filename), value);
      });
    },

    // Prompts and responses are text, not JSON documents — stored as-is so a
    // reviewer reads the prompt the model actually saw.
    writeStageText(runId, attemptId, stageId, filename, text) {
      if (!isValidStageId(stageId)) throw new Error(`unknown stage id: ${stageId}`);
      return withLock(runDir(runId), () => {
        assertMutable(readAttempt(runId, attemptId));
        const stageDir = join(attemptDir(runId, attemptId), 'stages', stageId);
        mkdirSync(stageDir, { recursive: true });
        writeTextAtomic(join(stageDir, filename), text);
      });
    },

    readStageArtifact(runId, attemptId, stageId, filename) {
      return readJson(
        join(attemptDir(runId, attemptId), 'stages', stageId, filename),
        `${stageId}/${filename} of attempt ${attemptId}`,
      );
    },

    hasStageArtifact(runId, attemptId, stageId, filename) {
      return existsSync(join(attemptDir(runId, attemptId), 'stages', stageId, filename));
    },

    // Attempt-level documents: board.json, blackboard.json, failure.json,
    // revision.json, parent-attempt.json. Same immutability rule as stages.
    writeAttemptArtifact(runId, attemptId, filename, value) {
      return withLock(runDir(runId), () => {
        assertMutable(readAttempt(runId, attemptId));
        writeJsonAtomic(join(attemptDir(runId, attemptId), filename), value);
      });
    },

    readAttemptArtifact(runId, attemptId, filename) {
      return readJson(
        join(attemptDir(runId, attemptId), filename),
        `${filename} of attempt ${attemptId}`,
      );
    },

    listAttempts(runId) {
      const dir = join(runDir(runId), 'attempts');
      if (!existsSync(dir)) return [];
      return readdirSync(dir)
        .filter((name) => existsSync(attemptPath(runId, name)))
        .sort();
    },

    recordStageStatus(runId, attemptId, stageId, status) {
      if (!isValidStageId(stageId)) throw new Error(`unknown stage id: ${stageId}`);
      return withLock(runDir(runId), () => {
        const attempt = readAttempt(runId, attemptId);
        assertMutable(attempt);
        writeAttempt(runId, {
          ...attempt,
          stageStatuses: { ...attempt.stageStatuses, [stageId]: { ...status, at: clock() } },
        });
      });
    },

    // Cumulative spend for this attempt, plus the price list it was costed
    // with — a stored cost is uninterpretable without one.
    // pricingVersion and effortProfile travel with the usage they explain: a
    // cost is only interpretable beside the rates that priced it and the
    // effort levels that produced it.
    recordUsage(runId, attemptId, { usage, pricingVersion, effortProfile }) {
      return withLock(runDir(runId), () => {
        const attempt = readAttempt(runId, attemptId);
        assertMutable(attempt);
        writeAttempt(runId, { ...attempt, usage, pricingVersion, effortProfile });
      });
    },

    // Resume support: the first stage (scanning from the attempt's starting
    // stage) without a complete, parseable output.json + validation.json
    // pair. A folder with partial contents was interrupted mid-write — it
    // is quarantined to <stage>.partial-<n>, never silently deleted, and
    // its stage reruns fresh. Returns null when every stage is complete.
    findFirstIncompleteStage(runId, attemptId) {
      const attempt = readAttempt(runId, attemptId);
      const stagesDir = join(attemptDir(runId, attemptId), 'stages');
      for (const stage of stagesFrom(attempt.startingStage)) {
        const stageDir = join(stagesDir, stage.id);
        if (!existsSync(stageDir)) return stage.id;
        if (isStageComplete(stageDir)) continue;
        withLock(runDir(runId), () => {
          let n = 1;
          while (existsSync(join(stagesDir, `${stage.id}.partial-${n}`))) n += 1;
          renameSync(stageDir, join(stagesDir, `${stage.id}.partial-${n}`));
        });
        return stage.id;
      }
      return null;
    },

    recordResume(runId, attemptId, { reenteredAt }) {
      if (!isValidStageId(reenteredAt)) throw new Error(`unknown stage id: ${reenteredAt}`);
      return withLock(runDir(runId), () => {
        const attempt = readAttempt(runId, attemptId);
        assertMutable(attempt);
        writeAttempt(runId, {
          ...attempt,
          resumes: [...attempt.resumes, { reenteredAt, at: clock() }],
        });
      });
    },

    appendDecision(runId, event) {
      return appendEvent(runId, 'decisions.jsonl', event);
    },
    readDecisions(runId) {
      return readJsonl(runId, 'decisions.jsonl');
    },
    // Validated on the way in, like the manifest. Feedback is the corpus the
    // editorial rubric gets compiled from — a malformed event would sit in it
    // looking like signal.
    appendFeedback(runId, event) {
      const result = validateFeedbackEvent(event);
      if (!result.ok) {
        throw new Error(
          `refusing to append invalid feedback to run ${runId}: ${result.errors
            .map((error) => `${error.path ? `${error.path}: ` : ''}${error.message}`)
            .join('; ')}`,
        );
      }
      return appendEvent(runId, 'feedback.jsonl', event);
    },
    readFeedback(runId) {
      return readJsonl(runId, 'feedback.jsonl');
    },
  };
}

const isStageComplete = (stageDir) => {
  for (const required of ['output.json', 'validation.json']) {
    try {
      JSON.parse(readFileSync(join(stageDir, required), 'utf8'));
    } catch {
      return false;
    }
  }
  return true;
};

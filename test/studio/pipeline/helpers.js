// Shared scaffolding for the pipeline suites. Test-only.

import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRunStore } from '../../../studio/storage/run-store.js';
import { createMockTransport } from '../../../studio/mock-transport.js';

export const fixturesDir = fileURLToPath(
  new URL('../../../studio/fixtures/responses/', import.meta.url),
);

/** A clock that never repeats, so run ids and timestamps stay distinct. */
export function tickingClock(start = Date.UTC(2026, 7, 2, 12, 0, 0)) {
  let ms = start;
  return () => {
    ms += 1000;
    return new Date(ms).toISOString();
  };
}

/**
 * A run store over a throwaway directory, plus the cleanup for it. The
 * pipeline is given a real store on a real filesystem on purpose — the
 * artifact contract is most of what A3 is for.
 */
export function makeStore() {
  const rootDir = mkdtempSync(join(tmpdir(), 'asto-studio-run-'));
  const store = createRunStore({ rootDir, clock: tickingClock() });
  return { store, rootDir, cleanup: () => rmSync(rootDir, { recursive: true, force: true }) };
}

/** The committed fixtures, replayed. Zero network. */
export function mockTransport(overrides) {
  return createMockTransport({ fixturesDir: overrides ?? fixturesDir });
}

/** Creates a run ready for the pipeline to pick up. */
export function seedRun(store, { slug = 'lantern', theme = null, brief = { count: 8 } } = {}) {
  return store.createRun({ slug, theme, brief }).runId;
}

/**
 * A copy of the committed fixtures with some stages overridden — the way to
 * script a failure without touching the real fixture set.
 *
 * Each override is whatever mock-transport accepts: one reply object, an
 * error object ({status}), or an array consumed in order across retries.
 */
export function fixturesWith(overrides) {
  const dir = mkdtempSync(join(tmpdir(), 'asto-studio-fixtures-'));
  cpSync(fixturesDir, dir, { recursive: true });
  for (const [stageId, entry] of Object.entries(overrides)) {
    writeFileSync(join(dir, `${stageId}.json`), JSON.stringify(entry, null, 2));
  }
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** The board the committed board-builder fixture returns, as a plain object. */
export function fixtureBoard() {
  const fixture = JSON.parse(readFileSync(join(fixturesDir, '04-board-builder.json'), 'utf8'));
  return JSON.parse(fixture.text).board;
}

/** Wraps a board-builder output back into the reply shape the transport returns. */
export function boardReply(board, extra = {}) {
  return { text: JSON.stringify({ board, falseTrails: [], ...extra }) };
}

/**
 * A content hash of every file under a directory, path included. Two runs of
 * this over the same tree are equal only if nothing at all changed — which is
 * how "the parent attempt stays byte-identical" gets proved rather than
 * asserted.
 */
export function hashTree(dir) {
  const hash = createHash('sha256');
  const walk = (current, prefix) => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    )) {
      const full = join(current, entry.name);
      const label = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(full, label);
      else hash.update(label).update(readFileSync(full));
    }
  };
  walk(dir, '');
  return hash.digest('hex');
}

/**
 * A store that dies on one specific write — the faithful way to produce an
 * interrupted attempt, since it leaves exactly the half-written stage folder a
 * real kill would. The thrown error is not a StudioFailure, so the pipeline
 * lets it escape and the attempt stays `running`.
 */
export function storeThatDiesWriting(store, { stageId, filename }) {
  return {
    ...store,
    writeStageArtifact(runId, attemptId, stage, name, value) {
      if (stage === stageId && name === filename) throw new Error('simulated kill mid-write');
      return store.writeStageArtifact(runId, attemptId, stage, name, value);
    },
  };
}

/** Test time: no real sleeping, and a monotonic millisecond source. */
export function fastTime() {
  let ms = 0;
  return {
    sleep: async () => {},
    now: () => {
      ms += 10;
      return ms;
    },
  };
}

// puzzle-store — the ONLY module that writes into `puzzles/`.
//
// `run-store.js` owns run artifacts; this owns published game content. They
// are deliberately separate seams because they answer to different laws: a run
// directory is the Studio's own record, while `puzzles/` is what the SHIPPED
// GAME loads and what `test/content/board-integrity.test.js` re-gates on every
// `npm test`. A bad file here is a broken puzzle in a player's hands.
//
// So the gate lives here, not in callers:
//
//   The board is checked with the GAME's own `validatePuzzle` and `checkBoard`
//   before a byte is written. One schema, no drift — the same two functions
//   `tools/check-board.js` runs. Publishing cannot introduce a board the game
//   would refuse to load or a board whose acceptance surface is wrong.
//
//   A refusal writes NOTHING. Everything is checked before the filesystem is
//   touched, the same rule the API applies to a batch of feedback.
//
//   The slug is matched against a pattern before it is joined onto a path, so
//   traversal is impossible by construction rather than by filtering — the
//   habit `api.js` already uses for run ids. The id is DERIVED from the slug,
//   which is what makes the one occupancy check sufficient: two boards cannot
//   collide on id without colliding on filename first.
//
// What it deliberately does not do: record provenance in the file. Schema v1.0
// is locked, and a published board must be indistinguishable from a
// hand-authored one. Which run a board came from is recorded in that run's
// `decisions.jsonl`, where the rest of its history already lives.
//
// Since Phase 5 it owns a SECOND artifact: `puzzles/index.json`, the manifest
// the game's select screen reads. It lives here because this is the only
// module allowed to write into `puzzles/` — and because a manifest that can
// drift from the files beside it is worse than no manifest at all.

import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeJsonAtomic } from './atomic-write.js';
import { SLUG } from '../slug.js';
import { validatePuzzle } from '../../src/source/validate-puzzle.js';
import { checkBoard } from '../../src/engine/board-integrity.js';
import { dateKeyFor, nextDay } from '../../src/source/release.js';

const PUZZLES_DIR = fileURLToPath(new URL('../../puzzles/', import.meta.url));

// The convention every shipped board follows, `asto-first-light` included.
const idFor = (slug) => `asto-${slug}`;

// `index.json` is the manifest's reserved name — `tools/check-board.js` skips
// it, and so does every board listing here.
const MANIFEST_FILENAME = 'index.json';
const RESERVED = new Set([MANIFEST_FILENAME]);

// The manifest's own version, independent of puzzle schema v1.0 — it describes
// the LIST, not a board. Version 2 (D-24): every entry carries `date`, the day
// the board is released; the array is date order, and a dateless board is OFF
// the list — which is exactly how a board is unpublished without breaking the
// `?puzzle=` links already pointing at its file.
const MANIFEST_VERSION = 2;

// On disk but never in the list: the tutorial is reached through "How to play"
// on the title screen, and offering it as a puzzle would hand a returning
// player a board they cannot lose.
// Boards that ship but do not appear in the select list. `tutorial` is the retired
// Warm Up board's old slug, kept as a guard against any stale file; `first-light` IS
// the tutorial since the D-20 addendum — met in "How to play", not offered again as a
// listed puzzle (its deep link still works).
const UNLISTED = new Set(['tutorial', 'first-light']);

/**
 * A publish refused on purpose, with a machine-readable reason so callers can
 * map it to a status without matching on message text.
 *
 * reason: 'bad-slug' | 'invalid' | 'integrity' | 'occupied'
 */
export class PublishRefused extends Error {
  constructor(reason, message, details = {}) {
    super(message);
    this.name = 'PublishRefused';
    this.reason = reason;
    Object.assign(this, details);
  }
}

/**
 * `today` is injectable for the same reason the engine's RNG is — the queue
 * math has to be testable without waiting for midnight. The default asks the
 * real clock in the game's one timezone (D-24).
 */
export function createPuzzleStore({ rootDir = PUZZLES_DIR, today = () => dateKeyFor(new Date()) } = {}) {
  const pathFor = (slug) => join(rootDir, `${slug}.json`);
  const manifestPath = join(rootDir, MANIFEST_FILENAME);

  const readBoard = (slug) => JSON.parse(readFileSync(pathFor(slug), 'utf8'));

  /**
   * The day the next publish releases: the day after the last scheduled board,
   * or today when the queue has run dry — a stale queue does not backfill,
   * because yesterday's missing puzzle is not something a new board can be.
   */
  const nextFreeDate = () => {
    const dates = store
      .list()
      .filter((entry) => !UNLISTED.has(entry.slug) && typeof entry.date === 'string')
      .map((entry) => entry.date);
    const latest = dates.length > 0 ? dates.reduce((a, b) => (a > b ? a : b)) : null;
    return latest !== null && latest >= today() ? nextDay(latest) : today();
  };

  const store = {
    /**
     * Publishes an approved board as game content.
     *
     * The board is copied with its `id` rewritten to the convention; nothing
     * else about it is touched, because it already IS schema v1.0 — that is
     * the whole reason no translation layer exists between the pipeline and
     * the game.
     *
     * Throws PublishRefused, having written nothing, if the slug is malformed,
     * the board fails the schema or the integrity sweep, or the destination is
     * occupied and `replace` was not asked for.
     *
     * Returns { slug, filename, path, id, originalId, title }.
     */
    publish({ board, slug, replace = false }) {
      if (typeof slug !== 'string' || !SLUG.test(slug)) {
        throw new PublishRefused(
          'bad-slug',
          `"${slug}" is not a usable slug — lowercase letters, digits and hyphens, starting with a letter or digit`,
        );
      }

      // The date is decided here, at publish, because this is the only door into
      // `puzzles/` — the queue cannot drift from the files if nothing else can
      // write them. A board that arrives with a date keeps it (schedule-launch,
      // hand-authored schedules); a replace keeps the date the board already
      // had on disk (editing is not rescheduling); a new board takes the next
      // free day.
      const existingDate = () => {
        try {
          const current = readBoard(slug);
          return typeof current.date === 'string' ? current.date : null;
        } catch {
          return null;
        }
      };
      const date = board?.date ?? existingDate() ?? nextFreeDate();
      const published = { ...board, id: idFor(slug), date };

      const schema = validatePuzzle(published);
      if (!schema.ok) {
        throw new PublishRefused(
          'invalid',
          `the board is not a valid schema v1.0 puzzle (${schema.errors.length} problem(s))`,
          { errors: schema.errors },
        );
      }

      // The expensive check: every one of the 43,680 ordered 4-tuples pushed
      // through the real `engine.submit()`. A board that passed the schema
      // above cannot fail this on its own merits — four sets of sixteen
      // distinct words accept exactly sixteen orders, arithmetically. What it
      // catches is the ENGINE widening acceptance underneath the content, and
      // it catches it before publication rather than at the next `npm test`.
      const report = checkBoard(published);
      if (!report.ok) {
        throw new PublishRefused('integrity', integrityMessage(report), {
          duplicateWords: report.duplicateWords,
          collisions: report.collisions,
        });
      }

      const destination = pathFor(slug);
      if (existsSync(destination) && !replace) {
        throw new PublishRefused(
          'occupied',
          `puzzles/${slug}.json already exists — republish to replace it`,
        );
      }

      mkdirSync(rootDir, { recursive: true });
      writeJsonAtomic(destination, published);

      // The board and the list that advertises it land together. Anything that
      // could refuse has already refused above, so by here the manifest cannot
      // be regenerated for a board that was not actually written.
      const manifest = store.writeManifest();

      return {
        slug,
        filename: `${slug}.json`,
        path: destination,
        id: published.id,
        date: published.date,
        originalId: board?.id ?? null,
        title: published.title,
        integrity: {
          tuplesChecked: report.tuplesChecked,
          acceptedCount: report.acceptedCount,
          expectedAccepted: report.expectedAccepted,
          soCloseCount: report.soCloseCount,
        },
        listedAt: manifest.puzzles.findIndex((entry) => entry.slug === slug),
        listedCount: manifest.puzzles.length,
      };
    },

    has: (slug) => SLUG.test(slug ?? '') && existsSync(pathFor(slug)),

    read: (slug) => readBoard(slug),

    /** Every published board, by slug. Unreadable files are skipped, not thrown. */
    list() {
      if (!existsSync(rootDir)) return [];
      const entries = [];
      for (const filename of readdirSync(rootDir).sort()) {
        if (!filename.endsWith('.json') || RESERVED.has(filename)) continue;
        const slug = filename.slice(0, -'.json'.length);
        try {
          const board = readBoard(slug);
          entries.push({ slug, filename, id: board.id, title: board.title, date: board.date });
        } catch {
          continue;
        }
      }
      return entries;
    },

    /**
     * The committed manifest, parsed — or null when there isn't one yet or it
     * is unreadable. Never throws: a broken manifest is something to REBUILD,
     * and `writeManifest` below is what rebuilds it.
     */
    readManifest() {
      try {
        return JSON.parse(readFileSync(manifestPath, 'utf8'));
      } catch {
        return null;
      }
    },

    /**
     * Rebuild `puzzles/index.json` from the boards actually on disk, and
     * return it.
     *
     * DATE ORDER IS THE ORDER (D-24, superseding D-10's hand-preserved play
     * order): the calendar reads chronology, and chronology is not an editable
     * arrangement. A board with no `date` is deliberately absent — that is how
     * a board is unpublished without deleting its file — and the entries are
     * always re-read from the boards, so a retitled or rescheduled board
     * cannot leave a stale line in the list.
     */
    writeManifest() {
      const puzzles = store
        .list()
        .filter((entry) => !UNLISTED.has(entry.slug) && typeof entry.date === 'string')
        .map((entry) => ({ slug: entry.slug, id: entry.id, title: entry.title, date: entry.date }))
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

      const manifest = { schemaVersion: MANIFEST_VERSION, puzzles };

      mkdirSync(rootDir, { recursive: true });
      writeJsonAtomic(manifestPath, manifest);
      return manifest;
    },
  };

  return store;
}

function integrityMessage(report) {
  const parts = [];
  if (report.duplicateWords.length > 0) {
    parts.push(`repeated word(s): ${report.duplicateWords.join(', ')}`);
  }
  for (const { order, setIds } of report.collisions) {
    parts.push(`${order.join(' ')} claimed by ${setIds.join(' + ') || 'no set'}`);
  }
  if (report.acceptedCount !== report.expectedAccepted && parts.length === 0) {
    parts.push(`${report.acceptedCount} of ${report.expectedAccepted} orders accepted`);
  }
  return `the board failed the integrity sweep — ${parts.join('; ')}`;
}

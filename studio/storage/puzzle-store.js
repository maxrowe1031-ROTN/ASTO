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

import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeJsonAtomic } from './atomic-write.js';
import { SLUG } from '../slug.js';
import { validatePuzzle } from '../../src/source/validate-puzzle.js';
import { checkBoard } from '../../src/engine/board-integrity.js';

const PUZZLES_DIR = fileURLToPath(new URL('../../puzzles/', import.meta.url));

// The convention every shipped board follows, `asto-first-light` included.
const idFor = (slug) => `asto-${slug}`;

// `index.json` is the Phase 5 manifest's reserved name — `tools/check-board.js`
// already skips it, and so does this.
const RESERVED = new Set(['index.json']);

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

export function createPuzzleStore({ rootDir = PUZZLES_DIR } = {}) {
  const pathFor = (slug) => join(rootDir, `${slug}.json`);

  const readBoard = (slug) => JSON.parse(readFileSync(pathFor(slug), 'utf8'));

  return {
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

      const published = { ...board, id: idFor(slug) };

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

      return {
        slug,
        filename: `${slug}.json`,
        path: destination,
        id: published.id,
        originalId: board?.id ?? null,
        title: published.title,
        integrity: {
          tuplesChecked: report.tuplesChecked,
          acceptedCount: report.acceptedCount,
          expectedAccepted: report.expectedAccepted,
          soCloseCount: report.soCloseCount,
        },
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
          entries.push({ slug, filename, id: board.id, title: board.title });
        } catch {
          continue;
        }
      }
      return entries;
    },
  };
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

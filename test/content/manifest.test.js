// The committed manifest, re-gated against the boards actually on disk.
//
// This is the sibling of board-integrity.test.js and it exists for the same
// reason: content ships as data, so `npm test` has to be what keeps the data
// honest. What it makes impossible from here on is a board being published into
// puzzles/ and never reaching the select screen — the failure mode that would
// look like nothing at all going wrong.
//
// Fix a failure with `npm run manifest`, not by hand-writing the file.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { validateManifest } from '../../src/source/validate-manifest.js';

const PUZZLES = join(import.meta.dirname, '..', '..', 'puzzles');
const MANIFEST = join(PUZZLES, 'index.json');

// Reached through "How to play", never the puzzle list.
// Mirrors puzzle-store.js: the retired tutorial slug, and First Light — which IS the
// tutorial since the D-20 addendum and is met in "How to play", never in the list.
const UNLISTED = new Set(['tutorial', 'first-light']);

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));

const boards = readdirSync(PUZZLES)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map((f) => {
    const slug = f.slice(0, -'.json'.length);
    return { slug, date: JSON.parse(readFileSync(join(PUZZLES, f), 'utf8')).date };
  })
  .filter((board) => !UNLISTED.has(board.slug));

// D-24: the manifest lists exactly the DATED boards. A dateless board is
// deliberately unpublished (the trim mechanism) — its file stays so old
// ?puzzle= links keep working, but it is off the calendar. check-schedule
// is what makes dateless boards visible, so going dateless can only be a
// decision, never a quiet accident.
const boardSlugs = boards.filter((b) => typeof b.date === 'string').map((b) => b.slug);

test('the committed manifest is valid', () => {
  const result = validateManifest(manifest);
  assert.deepEqual(result.errors, [], 'run `npm run manifest` to rebuild it');
});

test('every dated board on disk is listed — a scheduled board cannot go unplayable', () => {
  const listed = new Set(manifest.puzzles.map((entry) => entry.slug));
  const missing = boardSlugs.filter((slug) => !listed.has(slug));
  assert.deepEqual(missing, [], `not in puzzles/index.json — run \`npm run manifest\``);
});

test('every listed board exists — the list cannot advertise a 404', () => {
  const onDisk = new Set(boardSlugs);
  const phantom = manifest.puzzles.map((e) => e.slug).filter((slug) => !onDisk.has(slug));
  assert.deepEqual(phantom, [], `listed but no such file — run \`npm run manifest\``);
});

test('the tutorial is deliberately absent from the list', () => {
  assert.ok(manifest.puzzles.every((entry) => !UNLISTED.has(entry.slug)));
});

test('each entry carries the id, title and date of the board it points at', () => {
  for (const entry of manifest.puzzles) {
    const board = JSON.parse(readFileSync(join(PUZZLES, `${entry.slug}.json`), 'utf8'));
    assert.equal(entry.id, board.id, `${entry.slug}: manifest id disagrees with the board`);
    assert.equal(entry.title, board.title, `${entry.slug}: manifest title disagrees with the board`);
    assert.equal(entry.date, board.date, `${entry.slug}: manifest date disagrees with the board`);
  }
});

test('the list is date order — the calendar reads chronology (D-24)', () => {
  const dates = manifest.puzzles.map((entry) => entry.date);
  assert.deepEqual(dates, [...dates].sort(), 'run \`npm run manifest\` to rebuild it');
});

// Phase 5's content bar, pinned where it will keep being checked.
test('there are at least ten playable boards, tutorial included', () => {
  assert.ok(
    manifest.puzzles.length + UNLISTED.size >= 10,
    `${manifest.puzzles.length} listed + ${UNLISTED.size} unlisted`
  );
});

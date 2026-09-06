// Every published board carries sixteen Learning Mode definitions (D-33) —
// the content gate that keeps a tile from ever answering "no definition".
// Skipped, loudly, until the backfill has run: the assertion is that once any
// board has definitions, every board does.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { deriveWords } from '../../src/engine/arrangements.js';

const dir = fileURLToPath(new URL('../../puzzles/', import.meta.url));
const boards = readdirSync(dir)
  .filter((name) => name.endsWith('.json') && name !== 'index.json')
  .map((name) => ({ name, puzzle: JSON.parse(readFileSync(`${dir}${name}`, 'utf8')) }));

const anyDefined = boards.some(({ puzzle }) => Array.isArray(puzzle.definitions));

test('once the catalog has definitions, every board defines all sixteen words', { skip: !anyDefined && 'backfill not yet run' }, () => {
  for (const { name, puzzle } of boards) {
    const words = new Set(deriveWords(puzzle.sets).map((w) => w.toLowerCase()));
    const defined = new Set((puzzle.definitions ?? []).map((e) => e.word.toLowerCase()));
    assert.equal(defined.size, 16, `${name}: ${defined.size} definitions`);
    for (const word of words) assert.ok(defined.has(word), `${name}: "${word}" has no definition`);
  }
});

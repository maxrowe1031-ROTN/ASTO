#!/usr/bin/env node
// Board checker: schema v1.0 validation, then a full integrity sweep.
//
//   node tools/check-board.js                        # every board in puzzles/
//   node tools/check-board.js puzzles/first-light.json
//
// Exits non-zero if any board fails, so it can gate a commit.

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { checkBoard } from '../src/engine/board-integrity.js';
import { difficultyToTier } from '../src/engine/tiers.js';
import { validatePuzzle } from '../src/source/validate-puzzle.js';

const ROOT = resolve(import.meta.dirname, '..');
const PUZZLES = join(ROOT, 'puzzles');

const files = process.argv.slice(2).length > 0 ? process.argv.slice(2) : defaultBoards();

if (files.length === 0) {
  console.error('No boards found. Pass a path, or add a board to puzzles/.');
  process.exit(1);
}

let failed = 0;
for (const file of files) {
  if (!checkFile(file)) failed += 1;
}

console.log(
  failed === 0
    ? `\n${files.length} board${files.length === 1 ? '' : 's'} checked, all clean.`
    : `\n${failed} of ${files.length} board${files.length === 1 ? '' : 's'} failed.`
);
process.exit(failed === 0 ? 0 : 1);

function defaultBoards() {
  try {
    return readdirSync(PUZZLES)
      .filter((f) => f.endsWith('.json') && f !== 'index.json')
      .map((f) => join(PUZZLES, f));
  } catch {
    return [];
  }
}

function checkFile(file) {
  const inRepo = relative(ROOT, resolve(file));
  const label = inRepo && !inRepo.startsWith('..') ? inRepo : resolve(file);
  console.log(`\n${label}`);

  let puzzle;
  try {
    puzzle = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    console.log(`  ✗ could not read: ${error.message}`);
    return false;
  }

  const validation = validatePuzzle(puzzle);
  if (!validation.ok) {
    console.log(`  ✗ schema v1.0 — ${validation.errors.length} problem(s):`);
    for (const { path, message } of validation.errors) {
      console.log(`      ${path || '(root)'} — ${message}`);
    }
    return false;
  }
  console.log(`  ✓ schema v1.0 — "${puzzle.title}"`);

  for (const set of [...puzzle.sets].sort((a, b) => a.difficulty - b.difficulty)) {
    const [[a, b], [c, d]] = set.pairs;
    const tier = difficultyToTier(set.difficulty);
    console.log(`      ${tier.padEnd(6)} ${a} : ${b} :: ${c} : ${d}  — ${set.relationshipLabel}`);
  }

  const report = checkBoard(puzzle);
  console.log(
    `  ${report.ok ? '✓' : '✗'} integrity — ${report.acceptedCount}/${report.expectedAccepted} accepted ` +
      `of ${report.tuplesChecked.toLocaleString('en-US')} ordered tuples, ` +
      `${report.soCloseCount} near-miss ordering(s)`
  );

  if (report.duplicateWords.length > 0) {
    console.log(`      repeated word(s): ${report.duplicateWords.join(', ')}`);
  }
  for (const { order, setIds } of report.collisions) {
    console.log(`      collision: ${order.join(' ')} claimed by ${setIds.join(' + ') || 'no set'}`);
  }
  if (report.acceptedCount !== report.expectedAccepted && report.collisions.length === 0) {
    console.log('      acceptance surface is not four orders per set — check the engine, not the board.');
  }

  return report.ok;
}

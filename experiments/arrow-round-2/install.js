// install.js — round 2 of the blind board experiments.
//
// Identical shape to round 1's installer (../four-family-board/install.js) and
// for the same reasons: run-store's public API is the only legal writer, and
// `brief.mock: true` keeps hand-made boards out of the variety index and
// unable to spend API credit.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { createRunStore } from '../../studio/storage/run-store.js';
import { validatePuzzle } from '../../src/source/validate-puzzle.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const RUNS_DIR = fileURLToPath(new URL('../../studio/runs/', import.meta.url));

const store = createRunStore({ rootDir: RUNS_DIR });

for (const [file, slug] of [
  ['board-a.json', 'night-experiment-a'],
  ['board-b.json', 'night-experiment-b'],
]) {
  const board = JSON.parse(readFileSync(join(HERE, file), 'utf8'));

  const result = validatePuzzle(board);
  if (!result.ok) {
    console.error(`${file} is not schema-valid:`);
    for (const error of result.errors) console.error(`  ${error}`);
    process.exit(1);
  }

  const { runId } = store.createRun({
    slug,
    theme: 'the night (hand-made experiment, round 2)',
    brief: { count: 14, mock: true },
  });
  const attemptId = store.createAttempt(runId);
  store.updateStatus(runId, 'running');
  store.writeAttemptArtifact(runId, attemptId, 'board.json', board);
  store.completeAttempt(runId, attemptId, { status: 'complete' });
  store.updateStatus(runId, 'awaiting-review');

  console.log(`${file} → ${runId} (${board.title})`);
}

console.log('\nPlay both in the Review Studio, THEN read KEY.md.');

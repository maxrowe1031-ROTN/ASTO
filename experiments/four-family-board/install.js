// install.js — put the two experiment boards where Max can play them.
//
// Everything goes through createRunStore's public API, because run-store is the
// only module allowed to touch run artifacts — an experiment does not get to
// break the boundary law just because it is disposable.
//
// Both runs are installed with `brief.mock: true`. That flag means two things
// everywhere else in the Studio, and both are wanted here: the variety index
// ignores the run (a hand-made board is not editorial signal about the
// pipeline), and nothing can accidentally spend API credit resuming it.
//
// Idempotent-ish: re-running installs fresh copies under new timestamps.
// Delete stale ones by removing their studio/runs/<runId> directories.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { createRunStore } from '../../studio/storage/run-store.js';
import { validatePuzzle } from '../../src/source/validate-puzzle.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const RUNS_DIR = fileURLToPath(new URL('../../studio/runs/', import.meta.url));

const store = createRunStore({ rootDir: RUNS_DIR });

for (const [file, slug] of [
  ['board-a.json', 'kitchen-experiment-a'],
  ['board-b.json', 'kitchen-experiment-b'],
]) {
  const board = JSON.parse(readFileSync(join(HERE, file), 'utf8'));

  // The same validation gate a pipeline board passes before it is stored.
  const result = validatePuzzle(board);
  if (!result.ok) {
    console.error(`${file} is not schema-valid:`);
    for (const error of result.errors) console.error(`  ${error}`);
    process.exit(1);
  }

  const { runId } = store.createRun({
    slug,
    theme: 'the kitchen (hand-made experiment)',
    brief: { count: 14, mock: true },
  });
  const attemptId = store.createAttempt(runId);
  store.updateStatus(runId, 'running');
  store.writeAttemptArtifact(runId, attemptId, 'board.json', board);
  store.completeAttempt(runId, attemptId, { status: 'complete' });
  store.updateStatus(runId, 'awaiting-review');

  console.log(`${file} → ${runId} (${board.title})`);
}

console.log('\nOpen the Review Studio, play both, THEN read KEY.md.');

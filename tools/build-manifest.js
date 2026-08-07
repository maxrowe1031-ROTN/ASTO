#!/usr/bin/env node
// Rebuild `puzzles/index.json` — the manifest the game's select screen reads.
//
//   npm run manifest
//
// The Studio regenerates the manifest on every publish, so this exists for the
// boards that never went through a publish: hand-authored ones, and files
// removed by hand. Running it when nothing has changed is a no-op you can see
// — it reports "unchanged" and `git status` stays clean.
//
// The generation itself lives in `studio/storage/puzzle-store.js`, which is the
// only module allowed to write into `puzzles/`. This is a CLI over that, not a
// second implementation.

import { createPuzzleStore } from '../studio/storage/puzzle-store.js';

const store = createPuzzleStore();

const before = JSON.stringify(store.readManifest());
const manifest = store.writeManifest();
const changed = before !== JSON.stringify(manifest);

for (const [index, entry] of manifest.puzzles.entries()) {
  console.log(`  ${String(index + 1).padStart(2)}. ${entry.slug.padEnd(40)} ${entry.title}`);
}

console.log(
  `\npuzzles/index.json — ${manifest.puzzles.length} board${
    manifest.puzzles.length === 1 ? '' : 's'
  }, ${changed ? 'rewritten' : 'unchanged'}.`,
);

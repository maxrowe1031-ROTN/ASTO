#!/usr/bin/env node
// backfill-definitions.js — the CLI adapter for D-33's Learning Mode
// definitions. argv in, studio/definitions-backfill.js does the work, results
// printed. No logic, no shelling out.
//
//   node tools/backfill-definitions.js [--dry-run]
//
// Authors sixteen definitions for every published board short of them (needs
// ANTHROPIC_API_KEY) and applies each result immediately — no review file, by
// Max's call. --dry-run lists the boards and spends nothing. Sequential on
// purpose: a wall (rate limit, credit) stops the walk with a readable tail.
// Re-runnable: a board that failed is simply still short next time.

import { parseArgs } from 'node:util';

import {
  applyDefinitions,
  authorDefinitions,
  listBoardsNeedingDefinitions,
} from '../studio/definitions-backfill.js';
import { createPuzzleStore } from '../studio/storage/puzzle-store.js';
import { createAnthropicTransport } from '../studio/llm.js';
import { loadEnv } from '../studio/env.js';

async function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: { 'dry-run': { type: 'boolean', default: false } },
    strict: true,
  });
  loadEnv();
  const puzzles = createPuzzleStore();
  const entries = listBoardsNeedingDefinitions({ puzzles });
  console.log(`${entries.length} board(s) short of sixteen definitions`);
  if (values['dry-run']) {
    for (const entry of entries) console.log(`  ${entry.slug} (${entry.missing} missing)`);
    return 0;
  }

  const transport = createAnthropicTransport();
  let applied = 0;
  const failures = [];
  for (const entry of entries) {
    const result = await authorDefinitions({ entry, transport });
    if (!result.ok) {
      failures.push(result.failure);
      console.log(`  ✖ ${entry.slug} — [${result.failure.category}] ${result.failure.message}`);
      continue;
    }
    applyDefinitions({ puzzles, slug: entry.slug, definitions: result.definitions });
    applied += 1;
    console.log(`  ✔ ${entry.slug} — 16 definitions applied`);
  }
  console.log(`applied: ${applied} · failed: ${failures.length}`);
  return failures.length > 0 ? 1 : 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error) => {
    console.error(error.message);
    process.exit(1);
  },
);

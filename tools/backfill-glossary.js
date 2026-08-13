#!/usr/bin/env node
// backfill-glossary.js — the CLI adapter for retrofitting D-18's Vocabulary
// button onto boards published before stage 09 existed. An adapter, not a
// second orchestrator: argv in, studio/glossary-backfill.js does the work,
// results printed. It holds no logic and shells out to nothing.
//
//   node tools/backfill-glossary.js --generate [--dry-run]
//   node tools/backfill-glossary.js --apply
//
// --generate authors one gloss per unglossed board (needs ANTHROPIC_API_KEY).
//   Boards whose run flagged knowledge-gated words are applied immediately —
//   the flag is evidence, and the validator pins the gloss to a flagged word.
//   The rest (the author's own pick, plus run-less boards) land in the review
//   file below for Max to edit. --dry-run prints the split and spends nothing.
//
// --apply re-reads the review file after Max's edits, re-validates every entry
//   (an edit can introduce a leak as easily as a draft can), and writes each
//   through puzzle-store. Entries he deleted are simply not applied. Offline.

import { parseArgs } from 'node:util';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  applyGloss,
  authorGloss,
  joinPublishedBoards,
  partition,
  validateEditedGloss,
} from '../studio/glossary-backfill.js';
import { createPuzzleStore } from '../studio/storage/puzzle-store.js';
import { createRunStore } from '../studio/storage/run-store.js';
import { createAnthropicTransport } from '../studio/llm.js';
import { loadEnv } from '../studio/env.js';

const RUNS_DIR = fileURLToPath(new URL('../studio/runs/', import.meta.url));
const REVIEW_FILE = fileURLToPath(new URL('../studio/glossary-backfill-review.json', import.meta.url));

async function generate({ dryRun }) {
  loadEnv();
  const puzzles = createPuzzleStore();
  const runs = createRunStore({ rootDir: RUNS_DIR });

  const entries = joinPublishedBoards({ puzzles, runs });
  const { auto, review, skipped } = partition(entries);

  console.log(
    `${entries.length} published board(s): ${skipped.length} already glossed, ` +
      `${auto.length} auto (07 flagged a word), ${review.length} for review (author's own pick)`,
  );
  if (dryRun) {
    for (const entry of auto) console.log(`  auto:   ${entry.slug} (${entry.knowledgeGated.map((k) => k.word).join(', ')})`);
    for (const entry of review) console.log(`  review: ${entry.slug}${entry.runId ? '' : ' (no run)'}`);
    return 0;
  }

  const transport = createAnthropicTransport();
  const applied = [];
  const queued = [];
  const failures = [];

  // Sequential on purpose: ~46 low-effort calls, and a wall (rate limit,
  // credit) should stop the walk with a readable tail, not 40 parallel errors.
  for (const entry of [...auto, ...review]) {
    const isAuto = entry.knowledgeGated.length > 0;
    const result = await authorGloss({ entry, transport });
    if (!result.ok) {
      failures.push(result.failure);
      console.log(`  ✖ ${entry.slug} — [${result.failure.category}] ${result.failure.message}`);
      continue;
    }
    if (isAuto) {
      applyGloss({ puzzles, slug: entry.slug, gloss: result.gloss });
      applied.push(entry.slug);
      console.log(`  ✔ ${entry.slug} — "${result.gloss.word}" applied`);
    } else {
      queued.push({
        slug: entry.slug,
        word: result.gloss.word,
        definition: result.gloss.definition,
        note: 'author\'s own pick — edit or delete, then run --apply',
      });
      console.log(`  … ${entry.slug} — "${result.gloss.word}" queued for review`);
    }
  }

  if (queued.length > 0 || failures.length > 0) {
    writeFileSync(
      REVIEW_FILE,
      `${JSON.stringify({ entries: queued, failures }, null, 2)}\n`,
    );
    console.log(`\nreview file: studio/glossary-backfill-review.json (${queued.length} entr${queued.length === 1 ? 'y' : 'ies'}, ${failures.length} failure(s))`);
  }
  console.log(`applied: ${applied.length} · queued: ${queued.length} · failed: ${failures.length}`);
  return failures.length > 0 ? 1 : 0;
}

function apply() {
  if (!existsSync(REVIEW_FILE)) {
    console.error('no review file — run --generate first');
    return 1;
  }
  const puzzles = createPuzzleStore();
  const { entries = [] } = JSON.parse(readFileSync(REVIEW_FILE, 'utf8'));

  let applied = 0;
  let refused = 0;
  for (const entry of entries) {
    const board = puzzles.read(entry.slug);
    const validation = validateEditedGloss({
      board,
      gloss: { word: entry.word, definition: entry.definition },
    });
    if (!validation.ok) {
      refused += 1;
      console.log(`  ✖ ${entry.slug} — ${validation.errors.map((e) => e.message).join('; ')}`);
      continue;
    }
    applyGloss({
      puzzles,
      slug: entry.slug,
      gloss: { word: entry.word, definition: entry.definition },
    });
    applied += 1;
    console.log(`  ✔ ${entry.slug} — "${entry.word}" applied`);
  }

  console.log(`applied: ${applied} · refused: ${refused}`);
  if (refused === 0 && applied === entries.length) {
    unlinkSync(REVIEW_FILE);
    console.log('review file consumed and removed');
  } else {
    console.log('review file kept — fix the refused entries and run --apply again');
  }
  return refused > 0 ? 1 : 0;
}

async function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      generate: { type: 'boolean', default: false },
      apply: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
    },
    strict: true,
  });

  if (values.generate === values.apply) {
    console.error('exactly one of --generate or --apply');
    return 1;
  }
  return values.generate ? generate({ dryRun: values['dry-run'] }) : apply();
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error) => {
    console.error(error.message);
    process.exit(1);
  },
);

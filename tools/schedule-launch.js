#!/usr/bin/env node
// The hard-launch tool (D-24) — run ONCE, on Max's word, never before.
//
//   node tools/schedule-launch.js --launch=2026-09-01 --keep=keep.txt          # plan only
//   node tools/schedule-launch.js --launch=2026-09-01 --keep=keep.txt --commit # write it
//
// `keep.txt`: the boards that survive the trim, one slug per line, in the
// order they should read on the calendar — oldest first, and the LAST line
// becomes launch day's puzzle. Everything listed on the manifest but absent
// from the file is unpublished: its date is removed, its file stays, its old
// ?puzzle= links keep working.
//
// The default is a printed plan and NO writes — a launch is exactly the kind
// of hard-to-reverse action that deserves a dry run you read first. Every
// write goes through puzzle-store.reschedule, the only door into puzzles/.

import { readFileSync } from 'node:fs';

/** '2026-09-01', -3 → '2026-08-29'. UTC math on calendar keys, as everywhere. */
export function shiftDay(dateKey, by) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + by)).toISOString().slice(0, 10);
}

/**
 * Pure plan: which board lands on which day, and which boards go dateless.
 *
 * @param {string[]} keepSlugs  ordered, oldest first; last = launch day
 * @param {string} launchDate  YYYY-MM-DD
 * @param {{slug: string}[]} listed  current manifest entries
 * @param {(slug: string) => boolean} exists  is there a board file for this slug?
 */
export function planLaunch(keepSlugs, launchDate, listed, exists) {
  const errors = [];
  const seen = new Set();
  for (const slug of keepSlugs) {
    if (seen.has(slug)) errors.push(`"${slug}" appears in the keep list twice`);
    seen.add(slug);
    if (!exists(slug)) errors.push(`"${slug}" has no board file to keep`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(launchDate)) {
    errors.push(`"${launchDate}" is not a YYYY-MM-DD launch date`);
  }
  if (errors.length > 0) return { errors, assignments: [], cuts: [] };

  const assignments = keepSlugs.map((slug, i) => ({
    slug,
    date: shiftDay(launchDate, i - (keepSlugs.length - 1)),
  }));
  const cuts = listed.map((entry) => entry.slug).filter((slug) => !seen.has(slug));
  return { errors, assignments, cuts };
}

const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, value] = arg.replace(/^--/, '').split('=');
      return [key, value ?? true];
    }),
  );
  if (!args.launch || !args.keep) {
    console.error('Usage: node tools/schedule-launch.js --launch=YYYY-MM-DD --keep=<file> [--commit]');
    process.exit(1);
  }

  const { createPuzzleStore } = await import('../studio/storage/puzzle-store.js');
  const store = createPuzzleStore();
  const keepSlugs = readFileSync(args.keep, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
  const listed = store.readManifest()?.puzzles ?? [];

  const plan = planLaunch(keepSlugs, args.launch, listed, (slug) => store.has(slug));
  if (plan.errors.length > 0) {
    for (const error of plan.errors) console.error(`✗ ${error}`);
    process.exit(1);
  }

  console.log(`Launch ${args.launch} — ${plan.assignments.length} kept, ${plan.cuts.length} cut:\n`);
  for (const { slug, date } of plan.assignments) console.log(`  ${date}  ${slug}`);
  for (const slug of plan.cuts) console.log(`  (unpublished)  ${slug}`);

  if (!args.commit) {
    console.log('\nA plan, not an action — re-run with --commit to write it.');
    process.exit(0);
  }

  // Cuts first, so a kept board can move onto a day a cut board is vacating.
  for (const slug of plan.cuts) store.reschedule(slug, null);
  // Two passes for the keeps: rescheduling in place can collide with a date a
  // later keep still holds, so step one clears, step two lands.
  for (const { slug } of plan.assignments) store.reschedule(slug, null);
  for (const { slug, date } of plan.assignments) store.reschedule(slug, date);
  console.log('\nWritten. Rebuilt manifest is date order; run npm test before pushing.');
}

// sample-subjects — 100 subjects, no puzzles. An adapter plus one pure loop.
//
// Built with the register rotation (design.md D-15 second amendment) because
// the rotation's whole claim is about VARIETY, and variety is judged by eye,
// not by a unit test. Generating a board to see its subject costs ~$0.80 and
// fifteen minutes; this costs a fraction of a cent and a second, so Max can
// read a hundred of them and say whether the range is actually right before a
// single board is built on the new axis.
//
// It WRITES NOTHING. No run directory, no manifest — sampled subjects are not
// runs and must never enter the avoid-list, or reading the samples would poison
// the history they were drawn against. The trade-off is deliberate and has one
// consequence worth knowing: samples are invisible to future real runs, so a
// subject you liked here can still come up later, and one you hated can too.
//
// Samples DO avoid each other within a single sampling — the loop threads its
// own picks back through the same history the rotation and the freshness guard
// read, which is what makes a run of 100 a fair test of "would these hundred
// boards feel varied?" rather than a hundred independent first picks.

import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

import { pickFreshSubject } from './subject.js';
import { REGISTERS } from './corpus/registers.js';
import { echoesRecent, familiesMatch, familyOf, FAMILY_WINDOW, RECENT_WINDOW } from './subject.js';
import { createRunStore } from './storage/run-store.js';
import { createAnthropicTransport } from './llm.js';
import { createMockTransport } from './mock-transport.js';
import { loadEnv } from './env.js';
import { slugify } from './slug.js';

const RUNS_DIR = fileURLToPath(new URL('./runs/', import.meta.url));
const FIXTURES_DIR = fileURLToPath(new URL('./fixtures/responses/', import.meta.url));

// Two per register: an argless run demonstrates the rotation without spending
// meaningfully. The hundred is always an explicit ask.
const DEFAULT_COUNT = REGISTERS.length * 2;
const MAX_COUNT = 500;

/**
 * The loop. PURE of I/O: history in, picks out, every effect injected.
 *
 * `history` is the real run history in usedThemes() shape. Each pick is
 * appended to a WORKING copy in the same shape a real run would have recorded,
 * so the rotation counts what it just assigned and the freshness guard sees
 * what it just picked — without any of it touching disk.
 */
export async function sampleSubjects({
  history = [],
  count = DEFAULT_COUNT,
  transport,
  random = Math.random,
  onPick = () => {},
} = {}) {
  const working = [...history];
  const picks = [];

  for (let i = 0; i < count; i += 1) {
    // A store shim: pickFreshSubject reads history through listRuns/readManifest,
    // and the working list is exactly that history plus this sampling's picks.
    const store = {
      listRuns: () => working.map((_, index) => `sample-${index}`),
      readManifest: (runId) => {
        const entry = working[Number(runId.slice('sample-'.length))];
        return { theme: entry.theme, brief: entry.brief };
      },
    };

    const pick = await pickFreshSubject({ store, transport, random });
    picks.push(pick);
    onPick(pick, i);

    working.push({
      theme: pick.subject,
      brief: {
        relationshipShapes: ['sample'], // the surprise-me marker every axis counts on
        ...(pick.style ? { subjectStyle: pick.style } : {}),
        ...(pick.register ? { subjectRegister: pick.register } : {}),
        ...(pick.family ? { subjectFamily: pick.family } : {}),
      },
    });
  }

  return picks;
}

/** What the sampling looked like, as numbers — the part that answers "is this varied?". */
export function summarize(picks) {
  const byRegister = new Map(REGISTERS.map(({ id }) => [id, 0]));
  let theOpeners = 0;
  let capitalised = 0;
  let world = 0;
  let lens = 0;
  const slugs = new Set();
  let duplicates = 0;
  let nameRegisters = 0;
  let echoes = 0;
  let familyRepeats = 0;
  const seenFamilies = [];
  const seenSubjects = [];
  const nameFriendly = new Set(REGISTERS.filter((r) => r.allowProperNouns).map((r) => r.id));

  for (const { subject, style, register, family } of picks) {
    if (nameFriendly.has(register)) nameRegisters += 1;
    // Recomputed rather than trusted, exactly as `echoes` is: counting repeats
    // in the FINISHED list is what proves the guard actually held.
    const canonical = familyOf(subject, family);
    // familiesMatch, NOT includes(): comparing exactly is what let this metric
    // report "0 repeats" over a list containing "brass bands" and "brass band"
    // (v3, 2026-08-18). The instrument shared the guard's blind spot and so
    // confirmed it.
    if (seenFamilies.slice(-FAMILY_WINDOW).some((seen) => familiesMatch(seen, canonical))) {
      familyRepeats += 1;
    }
    seenFamilies.push(canonical);
    // Re-checked here rather than trusted: the guard runs inside the scout, so
    // counting echoes in the finished sampling is what proves it actually held.
    if (echoesRecent(subject, seenSubjects.slice(-RECENT_WINDOW))) echoes += 1;
    seenSubjects.push(subject);
    if (byRegister.has(register)) byRegister.set(register, byRegister.get(register) + 1);
    if (/^the\b/i.test(subject)) theOpeners += 1;
    // Capitalisation ONLY — and named that way after it reported "0 proper
    // nouns" over a sampling containing machu picchu, hogwarts, narnia and
    // marrakech. The scout writes names lowercase, following 123 lowercase
    // examples on the avoid-list, so capitals measure house habit rather than
    // whether names appear. A metric that reads 0 against a list full of names
    // is worse than no metric.
    if (/(?!^)\b[A-Z]/.test(subject.replace(/^the\s+/i, ''))) capitalised += 1;
    if (style === 'world') world += 1;
    if (style === 'lens') lens += 1;

    const slug = slugify(subject);
    if (slug && slugs.has(slug)) duplicates += 1;
    if (slug) slugs.add(slug);
  }

  return {
    total: picks.length,
    byRegister: Object.fromEntries(byRegister),
    fallbacks: picks.filter((p) => p.source !== 'scout').length,
    theOpeners,
    capitalised,
    world,
    lens,
    duplicates,
    nameRegisters,
    echoes,
    familyRepeats,
  };
}

export function parseArgv(argv) {
  const { values } = parseArgs({
    args: argv,
    options: { count: { type: 'string' }, mock: { type: 'boolean', default: false } },
    strict: true,
  });
  const count = Number(values.count ?? DEFAULT_COUNT);
  if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
    throw new Error(`--count must be an integer between 1 and ${MAX_COUNT}`);
  }
  return { count, mock: values.mock };
}

async function main(argv) {
  const { count, mock } = parseArgv(argv);
  if (!mock) loadEnv();

  const transport = mock
    ? createMockTransport({ fixturesDir: FIXTURES_DIR })
    : createAnthropicTransport();

  const store = createRunStore({ rootDir: RUNS_DIR });
  const history = [];
  for (const runId of store.listRuns()) {
    try {
      const manifest = store.readManifest(runId);
      if (manifest.brief?.mock === true) continue;
      if (typeof manifest.theme !== 'string' || !manifest.theme) continue;
      history.push({ theme: manifest.theme, brief: manifest.brief ?? {} });
    } catch {
      // One unreadable run must not stop a sampling, exactly as in usedThemes.
    }
  }

  console.log(`sampling ${count} subject(s) against ${history.length} used theme(s)${mock ? ' [mock]' : ''}`);
  console.log('nothing is written to studio/runs — these are not runs\n');

  const width = String(count).length;
  const picks = await sampleSubjects({
    history,
    count,
    transport,
    onPick: (pick, i) => {
      const tag = pick.source === 'scout' ? pick.register : `${pick.source} (no register)`;
      const family = familyOf(pick.subject, pick.family);
      const shown = family && family !== pick.subject ? `  [${family}]` : '';
      console.log(
        `${String(i + 1).padStart(width)}  ${String(tag).padEnd(22)} ${String(pick.style ?? '—').padEnd(6)} ${pick.subject}${shown}`,
      );
    },
  });

  const s = summarize(picks);
  console.log('\n--- spread ---');
  for (const [id, n] of Object.entries(s.byRegister)) console.log(`  ${id.padEnd(16)} ${n}`);
  console.log(`  ${'(fallbacks)'.padEnd(16)} ${s.fallbacks}`);
  console.log('\n--- shape ---');
  const pct = (n) => `${Math.round((100 * n) / (s.total || 1))}%`;
  console.log(`  opens "the ___"   ${s.theOpeners}/${s.total} (${pct(s.theOpeners)})   — 74% in the 31 picks before the rotation`);
  console.log(`  name registers    ${s.nameRegisters}/${s.total} (${pct(s.nameRegisters)})   — the registers where proper nouns live`);
  console.log(`  capitalised       ${s.capitalised}/${s.total}   — house habit, not a variety signal (see summarize)`);
  console.log(`  echoes a recent   ${s.echoes}/${s.total}${s.echoes ? '  <-- the echo guard let one through' : ''}`);
  console.log(`  family repeats    ${s.familyRepeats}/${s.total}${s.familyRepeats ? '  <-- two boards from one family' : '  (Max\'s rule: zero)'}`);
  console.log(`  world / lens      ${s.world} / ${s.lens}`);
  console.log(`  duplicates        ${s.duplicates}${s.duplicates ? '  <-- the freshness guard let one through' : ''}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

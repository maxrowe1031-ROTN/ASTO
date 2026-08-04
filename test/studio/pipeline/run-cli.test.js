// The CLI adapter's one piece of logic: turning argv into options. Everything
// else in run.js is I/O around runPipeline, which is tested directly.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseArgv } from '../../../studio/run.js';
import { MIN_PAIR_COUNT, DEFAULT_PAIR_COUNT } from '../../../studio/pipeline-config.js';

test('a bare invocation is a surprise-me run against the real transport', () => {
  const options = parseArgv([]);
  assert.equal(options.theme, null);
  assert.equal(options.mock, false);
  assert.equal(options.fresh, false);
  assert.equal(options.runId, null);
});

// The CLI is the pipeline's other door. When the Review Studio's floor went in
// on 2026-08-03 this one kept defaulting to 8 pairs — the exact count that
// yielded three sets, failed at the board builder, and cost $0.16 to discover.
// A floor enforced at one entrance is not enforced.
test('a bare invocation asks for enough pairs to build a board', () => {
  assert.equal(parseArgv([]).brief.count, DEFAULT_PAIR_COUNT);
  assert.ok(DEFAULT_PAIR_COUNT >= MIN_PAIR_COUNT);
});

test('--count below the floor is refused before a single request is made', () => {
  assert.throws(() => parseArgv(['--count', '8']), /--count must be an integer between/);
  assert.throws(() => parseArgv(['--count', String(MIN_PAIR_COUNT - 1)]), /--count/);
});

test('--count above the ceiling, or not a number at all, is refused too', () => {
  assert.throws(() => parseArgv(['--count', '17']), /--count/);
  assert.throws(() => parseArgv(['--count', 'lots']), /--count/);
  assert.throws(() => parseArgv(['--count', '13.5']), /--count/);
});

test('--count inside the range carries through untouched', () => {
  assert.equal(parseArgv(['--count', '12']).brief.count, 12);
  assert.equal(parseArgv(['--count', '16']).brief.count, 16);
});

test('a bare invocation leaves the theme null for the launcher to fill', () => {
  // parseArgv stays pure — the SUBJECT is picked at launch, not at parse, so
  // the same argv does not mean a different run every time it is parsed. The
  // Studio and the CLI both pick at createRun; that is where they agree.
  assert.equal(parseArgv([]).theme, null);
});

test('--theme carries through, and seeds the slug', () => {
  const options = parseArgv(['--theme', 'Lantern light']);
  assert.equal(options.theme, 'Lantern light');
  assert.equal(options.slug, 'lantern-light');
});

test('--slug overrides the derived one', () => {
  assert.equal(parseArgv(['--theme', 'Lantern light', '--slug', 'lanterns']).slug, 'lanterns');
});

test('a slug is filesystem-safe even from an awkward theme', () => {
  const { slug } = parseArgv(['--theme', '  Rivers / Canyons: “slow force”!  ']);
  assert.match(slug, /^[a-z0-9-]+$/);
  assert.ok(slug.length > 0);
});

test('--mock selects the fixture transport, which is the only offline path', () => {
  assert.equal(parseArgv(['--mock']).mock, true);
});

test('--run resumes an existing run instead of creating one', () => {
  const options = parseArgv(['--run', '2026-08-02T12-00-00.000Z-lantern']);
  assert.equal(options.runId, '2026-08-02T12-00-00.000Z-lantern');
});

test('--fresh forces a new attempt', () => {
  assert.equal(parseArgv(['--run', 'r', '--fresh']).fresh, true);
});

test('--revise-from opens a revision, with its notes', () => {
  const options = parseArgv([
    '--run', 'r',
    '--revise-from', '04-board-builder',
    '--notes', 'Red set is weak',
  ]);
  assert.equal(options.reviseFrom, '04-board-builder');
  assert.equal(options.notes, 'Red set is weak');
});

test('a revision without a run to revise is refused up front', () => {
  assert.throws(() => parseArgv(['--revise-from', '04-board-builder']), /--run/);
});

test('an unknown flag is refused rather than ignored', () => {
  assert.throws(() => parseArgv(['--yolo']));
});

// The CLI adapter's one piece of logic: turning argv into options. Everything
// else in run.js is I/O around runPipeline, which is tested directly.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseArgv } from '../../../studio/run.js';

test('a bare invocation is a surprise-me run against the real transport', () => {
  const options = parseArgv([]);
  assert.equal(options.theme, null);
  assert.equal(options.mock, false);
  assert.equal(options.fresh, false);
  assert.equal(options.runId, null);
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

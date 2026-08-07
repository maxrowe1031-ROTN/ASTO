import test from 'node:test';
import assert from 'node:assert/strict';

import { validateManifest } from '../../src/source/validate-manifest.js';

const entry = (over = {}) => ({
  slug: 'first-light',
  id: 'asto-first-light',
  title: 'First Light',
  ...over
});

const manifest = (over = {}) => ({ schemaVersion: 1, puzzles: [entry()], ...over });

/** Every rule must reject DISTINCTLY — an author fixing the file needs the path. */
const paths = (value) => validateManifest(value).errors.map((e) => e.path);

test('the real committed manifest shape passes', () => {
  const result = validateManifest(manifest());
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});

test('an empty list is valid — a repo with no published boards is not a broken repo', () => {
  assert.equal(validateManifest(manifest({ puzzles: [] })).ok, true);
});

test('a non-object is rejected before anything else is read', () => {
  for (const value of [null, [], 'index.json', 42]) {
    assert.deepEqual(paths(value), [''], `${JSON.stringify(value)} should fail at the root`);
  }
});

test('the schema version must be the one this validator knows', () => {
  assert.deepEqual(paths(manifest({ schemaVersion: 2 })), ['schemaVersion']);
  assert.deepEqual(paths(manifest({ schemaVersion: '1' })), ['schemaVersion']);
  assert.deepEqual(paths({ puzzles: [] }), ['schemaVersion']);
});

test('puzzles must be an array, and nothing after it is guessed at', () => {
  assert.deepEqual(paths({ schemaVersion: 1 }), ['puzzles']);
  assert.deepEqual(paths(manifest({ puzzles: {} })), ['puzzles']);
});

test('each entry must be an object', () => {
  assert.deepEqual(paths(manifest({ puzzles: ['first-light'] })), ['puzzles[0]']);
});

test('slug, id and title are each required, and each names itself', () => {
  assert.deepEqual(paths(manifest({ puzzles: [entry({ slug: undefined })] })), ['puzzles[0].slug']);
  assert.deepEqual(paths(manifest({ puzzles: [entry({ id: '' })] })), ['puzzles[0].id']);
  assert.deepEqual(paths(manifest({ puzzles: [entry({ title: '   ' })] })), ['puzzles[0].title']);
});

// The reason the slug is pattern-matched rather than merely required: it is joined
// onto a path and put in a `?puzzle=` value downstream.
test('a slug that could escape puzzles/ is rejected', () => {
  for (const slug of ['../secrets', 'a/b', 'First-Light', '-leading', 'has space', 'x'.repeat(65)]) {
    assert.deepEqual(paths(manifest({ puzzles: [entry({ slug })] })), ['puzzles[0].slug'], slug);
  }
});

test('a duplicate slug is rejected — a board appears in the list once', () => {
  const dupe = manifest({ puzzles: [entry(), entry({ id: 'asto-other' })] });
  assert.deepEqual(paths(dupe), ['puzzles[1].slug']);
});

test('a duplicate id is rejected too, because results are saved per board', () => {
  const dupe = manifest({ puzzles: [entry(), entry({ slug: 'by-the-shore' })] });
  assert.deepEqual(paths(dupe), ['puzzles[1].id']);
});

test('every problem is collected, not just the first — the whole list, like validatePuzzle', () => {
  const messy = manifest({
    schemaVersion: 9,
    puzzles: [entry({ slug: 'BAD' }), entry({ id: undefined, title: undefined })]
  });
  assert.deepEqual(paths(messy), [
    'schemaVersion',
    'puzzles[0].slug',
    'puzzles[1].id',
    'puzzles[1].title'
  ]);
});

test('it validates the LIST, never the boards — a manifest cannot know a board is good', () => {
  // No `sets`, no `pairs`, nothing puzzle-shaped: still a perfectly valid manifest.
  assert.equal(validateManifest(manifest()).ok, true);
});

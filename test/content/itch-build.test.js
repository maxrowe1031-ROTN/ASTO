// The packaged build must be complete, self-contained, and safe to hand out.
//
// itch.io serves an upload from a nested path on its own origin, inside an
// iframe. Two failure modes follow from that and neither is visible to the
// person who made the zip: a file the game reaches for that was never packaged
// (fine locally, 404 for a stranger), and a secret that WAS packaged.
//
// These are assertions over the verifier and the allowlist as data — no zip is
// written and no file is copied. The one case that reads the real tree is the
// last, because "the payload still covers what the game actually loads" is a
// claim about this repository, not about the tool.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ITCH_PAYLOAD, EXCLUDED, verifyBuild } from '../../tools/build-itch.js';

const ROOT = join(import.meta.dirname, '..', '..');

/** A minimal build that passes, so each test below can break exactly one thing. */
const good = () => ({
  paths: [
    'index.html',
    'about.html',
    'styles/tokens.css',
    'src/app.js',
    'puzzles/index.json',
    'puzzles/first-light.json',
  ],
  manifest: { schemaVersion: 2, puzzles: [{ slug: 'first-light' }] },
  html: {
    'index.html': '<link rel="stylesheet" href="styles/tokens.css">'
      + '<script type="module" src="src/app.js"></script>',
    'about.html': '<a href="index.html">Play</a>'
      + '<a href="https://www.playasto.com/docs/presentation/">deck</a>',
  },
});

test('a complete build passes', () => {
  assert.deepEqual(verifyBuild(good()), { ok: true, errors: [] });
});

test('index.html must sit at the root of the zip', () => {
  // itch's one hard rule. Nested, the build loads nothing at all.
  const tree = good();
  tree.paths = tree.paths.map((p) => (p === 'index.html' ? 'asto/index.html' : p));
  const report = verifyBuild(tree);
  assert.equal(report.ok, false);
  assert.match(report.errors.join('\n'), /index\.html must sit at the root/);
});

test('a manifest slug with no board behind it fails the build', () => {
  // The calendar renders from the manifest, so this ships a card that breaks
  // when tapped: invisible to everything except playing that exact day.
  const tree = good();
  tree.manifest.puzzles.push({ slug: 'a-board-that-was-never-copied' });
  const report = verifyBuild(tree);
  assert.equal(report.ok, false);
  assert.match(report.errors.join('\n'), /a-board-that-was-never-copied/);
});

test('a root-absolute path fails the build', () => {
  // Resolves against itch's origin rather than the build directory.
  const tree = good();
  tree.html['index.html'] += '<script src="/src/late.js"></script>';
  const report = verifyBuild(tree);
  assert.equal(report.ok, false);
  assert.match(report.errors.join('\n'), /root-absolute/);
});

test('a local link to a file that was not packaged fails the build', () => {
  // The live case this guards: about.html linking docs/ relatively while docs/
  // stays out of the payload. A dead link only a click would ever find.
  const tree = good();
  tree.html['about.html'] += '<a href="docs/presentation/">the process deck</a>';
  const report = verifyBuild(tree);
  assert.equal(report.ok, false);
  assert.match(report.errors.join('\n'), /docs\/presentation\/", which is not in the build/);
});

test('an offsite or inline link is not mistaken for a missing file', () => {
  const tree = good();
  tree.html['about.html'] +=
    '<a href="https://www.playasto.com/docs/asto-gdd.html">GDD</a>'
    + '<a href="#main">skip</a>'
    + '<link rel="icon" href="data:image/svg+xml,%3Csvg%3E%3C/svg%3E">';
  assert.equal(verifyBuild(tree).ok, true);
});

test('a query string or fragment does not make a real file look missing', () => {
  const tree = good();
  tree.html['index.html'] += '<link rel="stylesheet" href="styles/tokens.css?v=2">';
  assert.equal(verifyBuild(tree).ok, true);
});

test('anything on the exclusion list fails the build wherever it appears', () => {
  for (const excluded of ['.env', 'studio', 'test', 'docs', 'CNAME', 'node_modules']) {
    const tree = good();
    tree.paths.push(excluded.includes('.') ? excluded : `${excluded}/something.js`);
    const report = verifyBuild(tree);
    assert.equal(report.ok, false, `${excluded} must never be packaged`);
    assert.match(report.errors.join('\n'), /must never be packaged/);
  }
});

test('the payload is an allowlist, and the two lists do not overlap', () => {
  // The allowlist is what actually keeps a secret out; EXCLUDED is a second,
  // redundant assertion over the result. They must never disagree.
  for (const entry of ITCH_PAYLOAD) {
    assert.ok(!EXCLUDED.includes(entry), `${entry} is both shipped and forbidden`);
  }
  assert.ok(EXCLUDED.includes('.env'), 'the list that matters most must name .env');
});

test('the payload covers every directory the game loads from at runtime', () => {
  // Read from the real tree: app.js is where the game's only same-origin fetch
  // paths are declared, so if a future one points somewhere the payload does not
  // cover, this is the test that says so.
  const app = readFileSync(join(ROOT, 'src', 'app.js'), 'utf8');
  for (const [, path] of app.matchAll(/['"`](puzzles\/[^'"`$]*)/g)) {
    const top = path.split('/')[0];
    assert.ok(ITCH_PAYLOAD.includes(top), `app.js loads from ${top}/, which is not packaged`);
  }

  for (const required of ['index.html', 'about.html', 'src', 'styles', 'puzzles']) {
    assert.ok(ITCH_PAYLOAD.includes(required), `${required} must be packaged`);
  }
});

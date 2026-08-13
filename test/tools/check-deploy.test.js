// The deploy check — closing the gap the backlog recorded on 2026-08-05, when
// GitHub Pages failed five builds in a row and silently served the previous
// version for most of a day.
//
// The design leans on the one fact that makes this checkable at all: legacy
// Pages serves the repository VERBATIM — no build step, because the game has
// none. So "the deploy is current" is byte equality between a handful of
// representative live files and the same files locally. No build-status API,
// no auth, no heuristics.
//
// Everything here runs on injected readers — zero network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compareDeploy, DEPLOY_CHECK_FILES } from '../../tools/check-deploy.js';

/** Local files as a map, remote files as a map — both injected. */
const readers = (local, remote) => ({
  readLocal: async (path) => {
    if (!(path in local)) throw new Error(`ENOENT: ${path}`);
    return local[path];
  },
  fetchRemote: async (path) => {
    if (!(path in remote)) return { ok: false, status: 404, body: null };
    return { ok: true, status: 200, body: remote[path] };
  },
});

test('identical files everywhere is a current deploy', async () => {
  const files = { 'index.html': '<html>v2</html>', 'puzzles/index.json': '{"v":2}' };
  const report = await compareDeploy({
    files: Object.keys(files),
    ...readers(files, files),
  });

  assert.equal(report.ok, true);
  assert.deepEqual(
    report.results.map((r) => r.status),
    ['match', 'match'],
  );
});

test('a live file that differs from local marks the deploy stale', async () => {
  const report = await compareDeploy({
    files: ['index.html'],
    ...readers({ 'index.html': '<html>v2</html>' }, { 'index.html': '<html>v1</html>' }),
  });

  assert.equal(report.ok, false);
  assert.equal(report.results[0].status, 'stale');
});

test('a file the live site cannot serve is reported missing, with the HTTP status', async () => {
  const report = await compareDeploy({
    files: ['puzzles/index.json'],
    ...readers({ 'puzzles/index.json': '{}' }, {}),
  });

  assert.equal(report.ok, false);
  assert.equal(report.results[0].status, 'missing');
  assert.equal(report.results[0].httpStatus, 404);
});

test('a fetch that throws is an error result, not a crash — and fails the check', async () => {
  const report = await compareDeploy({
    files: ['index.html'],
    readLocal: async () => '<html></html>',
    fetchRemote: async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    },
  });

  assert.equal(report.ok, false);
  assert.equal(report.results[0].status, 'error');
  assert.match(report.results[0].message, /ENOTFOUND/);
});

test('one stale file among matches still fails the whole check and names the file', async () => {
  const local = { 'index.html': 'same', 'src/app.js': 'new' };
  const remote = { 'index.html': 'same', 'src/app.js': 'old' };
  const report = await compareDeploy({
    files: Object.keys(local),
    ...readers(local, remote),
  });

  assert.equal(report.ok, false);
  const stale = report.results.filter((r) => r.status === 'stale');
  assert.deepEqual(stale.map((r) => r.path), ['src/app.js']);
});

test('the default file set covers the page, the manifest, code and styles', () => {
  assert.ok(DEPLOY_CHECK_FILES.includes('index.html'));
  assert.ok(DEPLOY_CHECK_FILES.includes('puzzles/index.json'));
  assert.ok(DEPLOY_CHECK_FILES.some((f) => f.startsWith('src/')));
  assert.ok(DEPLOY_CHECK_FILES.some((f) => f.startsWith('styles/')));
});

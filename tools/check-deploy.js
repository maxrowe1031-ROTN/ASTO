#!/usr/bin/env node
// check-deploy.js — is the live GitHub Pages site actually serving this tree?
//
//   node tools/check-deploy.js            # compare live site against local files
//   npm run check-deploy
//
// Closes the gap recorded in the backlog on 2026-08-05: Pages can fail its
// build while the previous version keeps serving, so a broken deploy is
// invisible from the outside — five builds failed in a row that day and the
// site sat stale for most of it.
//
// The check leans on the one fact that makes it simple: legacy Pages serves
// the repository VERBATIM — the game has no build step — so "deployed" means
// byte equality between a handful of representative live files and the same
// files here. No build-status API, no auth token, no heuristics. Run it after
// a push (give Pages a minute); a stale result a few minutes after pushing
// means the build failed and the previous version is still serving.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DEFAULT_BASE = 'https://www.playasto.com';

// One file per layer that changes for different reasons: the page shell, the
// content manifest, game code, design tokens — and the AI disclosure, whose
// failure mode on a bad deploy is a silent 404. A deploy that serves all of
// these current is serving the commit they came from.
export const DEPLOY_CHECK_FILES = Object.freeze([
  'index.html',
  'about.html',
  'puzzles/index.json',
  'src/app.js',
  'styles/tokens.css',
]);

/**
 * Pure orchestration over injected readers: for each path, byte-compare the
 * local file with the live one. Never throws — a fetch failure is a result
 * (`error`), because "the check could not run" is itself a finding.
 *
 * Returns { ok, results: [{ path, status: match|stale|missing|error, ... }] }.
 */
export async function compareDeploy({ files = DEPLOY_CHECK_FILES, readLocal, fetchRemote }) {
  const results = [];
  for (const path of files) {
    try {
      const local = await readLocal(path);
      const remote = await fetchRemote(path);
      if (!remote.ok) {
        results.push({ path, status: 'missing', httpStatus: remote.status });
        continue;
      }
      results.push({ path, status: remote.body === local ? 'match' : 'stale' });
    } catch (error) {
      results.push({ path, status: 'error', message: error.message });
    }
  }
  return { ok: results.every((r) => r.status === 'match'), results };
}

async function main() {
  const base = process.env.ASTO_DEPLOY_URL ?? DEFAULT_BASE;

  const report = await compareDeploy({
    readLocal: (path) => readFile(new URL(path, `file://${ROOT}`), 'utf8'),
    fetchRemote: async (path) => {
      // Cache-busting query: Pages sits behind a CDN, and a stale cached copy
      // would report the exact failure this tool exists to catch.
      const response = await fetch(`${base}/${path}?check=${Date.now()}`);
      return {
        ok: response.ok,
        status: response.status,
        body: response.ok ? await response.text() : null,
      };
    },
  });

  for (const result of report.results) {
    const mark = result.status === 'match' ? '✓' : '✗';
    const detail =
      result.status === 'missing'
        ? ` (HTTP ${result.httpStatus})`
        : result.status === 'error'
          ? ` (${result.message})`
          : '';
    console.log(`  ${mark} ${result.path} — ${result.status}${detail}`);
  }

  if (report.ok) {
    console.log(`\nthe live site matches this tree (${base})`);
  } else {
    console.log(
      `\nLIVE SITE DOES NOT MATCH THIS TREE (${base})\n` +
        'If you pushed less than ~2 minutes ago, Pages may still be building — wait and re-run.\n' +
        'If this persists, the Pages build likely failed while the old version keeps serving:\n' +
        '  gh api repos/{owner}/{repo}/pages/builds/latest',
    );
  }
  return report.ok ? 0 : 1;
}

// Only runs as a script, so importing compareDeploy in a test costs nothing.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(error.message);
      process.exit(1);
    },
  );
}

#!/usr/bin/env node
// build-itch.js — package the game as a zip for itch.io.
//
//   node tools/build-itch.js              # → dist/asto-itch-<date>.zip
//   npm run itch
//
// ASTO has no build step: GitHub Pages serves this repository verbatim, which
// is the fact check-deploy.js leans on. itch.io is different. It takes a zip,
// serves it from a nested path on an origin of its own
// (html-classic.itch.zone/html/<build-id>/), and runs it inside an iframe. So a
// distributable has to exist, and "zip the folder" is the wrong answer: the repo
// root also holds .env, the Studio, the tests, and the Pages-only CNAME.
//
// This tool copies an ALLOWLIST — never a denylist. A denylist fails open, and
// the thing it would eventually fail open on is a secret. Anything not named in
// ITCH_PAYLOAD stays home by construction, and EXCLUDED is a second, redundant
// assertion over the result rather than the mechanism that keeps it out.
//
// The verification is the reason this is a program and not a shell one-liner.
// Nothing here can prove the game is FUN, but it can prove the zip is complete
// and self-contained, which is the failure mode that would otherwise be found by
// a stranger looking at a broken page.

import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

/**
 * Everything the game needs at runtime, and nothing else.
 *
 * Verified against the source: the only same-origin fetches in the whole game
 * are `puzzles/*.json`, through the path constants in app.js. about.html is here
 * because the title screen and the end screen both link to it, and it carries
 * the AI disclosure — a build that dropped it would 404 the one page the project
 * is obliged to show.
 *
 * docs/ is deliberately absent. The About page's deck and GDD links are absolute
 * (playasto.com), so the 4.4 MB of documents stay one canonical copy on the web
 * instead of freezing into every upload.
 */
export const ITCH_PAYLOAD = Object.freeze([
  'index.html',
  'about.html',
  'styles',
  'src',
  'puzzles',
]);

/**
 * Things whose presence in a build is a bug, listed by the top-level name they
 * would arrive under. `.env` is the one that matters; the rest are here so a
 * careless widening of ITCH_PAYLOAD is caught by a test rather than by a user.
 */
export const EXCLUDED = Object.freeze([
  '.env',
  '.env.example',
  '.git',
  'CNAME',
  '.nojekyll',
  'CLAUDE.md',
  'package.json',
  'template.json',
  'node_modules',
  'docs',
  'tools',
  'studio',
  'test',
  'experiments',
]);

/** A path anchored at the site root — the one thing that cannot survive the move. */
const ROOT_ABSOLUTE = /(?:href|src)="\/(?!\/)/g;

/** Every href/src in a document, whatever it points at. */
const LINK = /(?:href|src)="([^"]+)"/g;

/** Points somewhere other than a file in this build: another origin, or the page itself. */
const OFFSITE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

/**
 * Is this tree a complete, self-contained, nested-path-safe build?
 *
 * PURE: takes the built tree as data and returns findings. Every check here
 * answers a way the game could break specifically because it moved off
 * playasto.com's root and into someone else's subdirectory.
 *
 * @param {object}   tree
 * @param {string[]} tree.paths     every file in the build, posix-relative to its root
 * @param {object}   tree.manifest  the parsed puzzles/index.json
 * @param {object}   tree.html      { path: source } for every HTML entry point
 * @returns {{ok: boolean, errors: string[]}}
 */
export function verifyBuild({ paths, manifest, html }) {
  const errors = [];
  const present = new Set(paths);

  // itch unzips the archive and serves index.html from its root. A build whose
  // entry point sits one directory down loads nothing at all.
  if (!present.has('index.html')) {
    errors.push('index.html must sit at the root of the build, and does not');
  }

  for (const required of ['about.html', 'styles/tokens.css', 'src/app.js', 'puzzles/index.json']) {
    if (!present.has(required)) errors.push(`missing from the build: ${required}`);
  }

  // The manifest is what the calendar renders from, so a slug it names without a
  // file behind it is a card that fails when tapped — invisible until played.
  for (const entry of manifest?.puzzles ?? []) {
    const path = `puzzles/${entry.slug}.json`;
    if (!present.has(path)) {
      errors.push(`the manifest names "${entry.slug}" but ${path} is not in the build`);
    }
  }

  // A root-absolute path resolves against itch's origin, not the build, so it
  // reaches for a file that was never uploaded. Nothing in the game uses one
  // today; this keeps it that way.
  for (const [path, source] of Object.entries(html ?? {})) {
    for (const [match] of source.matchAll(ROOT_ABSOLUTE)) {
      errors.push(
        `${path} has a root-absolute path (${match.trim()}…) — it will 404 at a nested path`,
      );
    }

    // Every local link must land on a file that actually shipped. This is the
    // check that catches the docs/ decision being half-reverted: the About page
    // linking `docs/presentation/` relatively while docs/ stays out of the
    // payload is a dead link that only a click would find.
    for (const [, href] of source.matchAll(LINK)) {
      if (OFFSITE.test(href)) continue;
      const target = href.split(/[?#]/)[0];
      if (target === '') continue;
      const candidates = target.endsWith('/')
        ? [`${target}index.html`]
        : [target, `${target}/index.html`];
      if (!candidates.some((candidate) => present.has(candidate))) {
        errors.push(`${path} links "${href}", which is not in the build`);
      }
    }
  }

  for (const path of paths) {
    const top = path.split('/')[0];
    if (EXCLUDED.includes(top)) errors.push(`must never be packaged: ${path}`);
  }

  return { ok: errors.length === 0, errors };
}

/** Every file under `dir`, posix-relative to it, depth first and deterministic. */
function walk(dir, base = dir) {
  const found = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) found.push(...walk(full, base));
    else found.push(relative(base, full).split(sep).join(posix.sep));
  }
  return found;
}

function humanSize(bytes) {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function main() {
  const stage = join(ROOT, 'dist', 'itch');
  const stamp = new Date().toISOString().slice(0, 10);
  const zipPath = join(ROOT, 'dist', `asto-itch-${stamp}.zip`);

  rmSync(stage, { recursive: true, force: true });
  rmSync(zipPath, { force: true });
  mkdirSync(stage, { recursive: true });

  for (const entry of ITCH_PAYLOAD) {
    cpSync(join(ROOT, entry), join(stage, entry), { recursive: true });
  }

  const paths = walk(stage);
  const report = verifyBuild({
    paths,
    manifest: JSON.parse(readFileSync(join(stage, 'puzzles', 'index.json'), 'utf8')),
    html: {
      'index.html': readFileSync(join(stage, 'index.html'), 'utf8'),
      'about.html': readFileSync(join(stage, 'about.html'), 'utf8'),
    },
  });

  if (!report.ok) {
    // Nothing is zipped and the staging tree is left in place to be inspected.
    console.error('This build is not fit to upload:\n');
    for (const error of report.errors) console.error(`  ✗ ${error}`);
    console.error(`\nThe staged tree is at dist/itch/ if you want to look.`);
    return 1;
  }

  try {
    // -r recurse, -X drop the Finder metadata that would otherwise ride along,
    // -q quiet. Run FROM the staging directory so every stored path is relative
    // to it and index.html lands at the zip root, which is itch's one hard rule.
    execFileSync('zip', ['-r', '-X', '-q', zipPath, '.'], { cwd: stage });
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(
        'the `zip` command was not found — this tool shells out to it rather than ' +
          'taking on a dependency. On macOS it ships with the system; on Debian or ' +
          'Ubuntu it is `apt install zip`.',
      );
    }
    throw error;
  }

  const raw = paths.reduce((sum, path) => sum + statSync(join(stage, path)).size, 0);

  console.log(`Packaged ${paths.length} files (${humanSize(raw)}) for itch.io.`);
  console.log(`  → ${relative(ROOT, zipPath)}  (${humanSize(statSync(zipPath).size)} zipped)\n`);
  console.log('Uploading it:');
  console.log('  1. itch.io project → Uploads → upload this zip');
  console.log('  2. tick "This file will be played in the browser"');
  console.log('  3. viewport 480 x 800, and tick "Mobile friendly" — ASTO is mobile first');
  console.log('  4. tick "Fullscreen button"\n');
  console.log('Before uploading, play the staged build the way itch serves it:');
  console.log('  npm run serve   →   http://localhost:8080/dist/itch/');
  console.log('  (a nested path, which is what proves nothing depended on being at the root)');
  return 0;
}

// Only runs as a script, so importing verifyBuild in a test costs nothing.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exit(main());
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

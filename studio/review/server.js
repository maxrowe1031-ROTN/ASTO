// server.js — the wire. Binding, static files, body limits, dispatch.
//
// Deliberately thin: every rule about what a request MEANS lives in api.js.
// This file owns only the things that exist because HTTP exists.
//
// Two security properties are structural rather than checked:
//
//   It binds 127.0.0.1 explicitly. tools/serve.js calls listen(PORT) with no
//   host, which binds every interface — fine for a static game on a laptop,
//   wrong for a surface that starts runs and spends money. Do not copy that
//   line here.
//
//   Static serving is an ALLOWLIST, not a rooted tree. The UI directory is
//   served whole; beyond it only the game's stylesheets and the three pure
//   engine modules the board renderer imports are reachable. Nothing else in
//   the repo is addressable, so `studio/runs/`, `.env`, and the rest are not
//   protected by a traversal check — they are simply not mounted.

import { createServer } from 'node:http';
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { join, normalize, resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createApi } from './api.js';
import { createRunner, defaultTransport } from './runner.js';
import { createRunStore } from '../storage/run-store.js';
import { loadEnv } from '../env.js';
import { loadRules } from '../corpus/rules.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = resolve(HERE, '../..');

const UI_DIR = join(HERE, 'ui');
const MAX_BODY_BYTES = 256 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

// URL prefix → directory on disk. Everything outside this list is unreachable.
//
// The prefixes mirror the repo layout on purpose: it lets the UI modules use
// ordinary relative imports ('../../../src/engine/arrangements.js') that
// resolve identically under node and in the browser, so board-html.js can be
// unit-tested without an import map or a build step.
// Widened 2026-08-04 so a candidate board can be PLAYED in the review page.
// The Studio composes the game's own views and controller rather than
// re-implementing play — which is both the boundary law and the proof of it:
// if the game's modules can be driven from another page with nothing but a
// validated puzzle, the seams really are clean.
//
// The engine allowlist is gone because it was protecting nothing: every module
// under src/engine is pure by the boundary law, and enumerating three of them
// only meant the list went stale the moment the Studio needed a fourth. What
// stays narrow is the controller, where exactly one module is a legitimate
// entry point, and app.js, which owns the game's own routing and storage and
// is deliberately not reachable.
const MOUNTS = [
  ['/studio/review/ui/', UI_DIR],
  // The vocabulary, so the review card can teach each set's stance beside its
  // paradigm pair. Corpus files are editorial data — nothing secret lives here.
  ['/studio/corpus/', join(REPO, 'studio', 'corpus')],
  ['/styles/', join(REPO, 'styles')],
  ['/src/engine/', join(REPO, 'src', 'engine')],
  ['/src/view/', join(REPO, 'src', 'view')],
  ['/src/controller/', join(REPO, 'src', 'controller'), new Set(['game-controller.js'])],
  // Last, and allowlisted file by file: the prefixes above are more specific
  // and match first, and `studio/` holds llm.js and env.js, which must stay
  // unreachable. The registry is here because the review page's revision
  // <select> and the Revision Proposer must offer the same re-entry stages, and
  // that list belongs in the registry rather than in two copies. `slug.js` is
  // here for the same reason: the destination the publish panel SHOWS and the
  // destination the server publishes to must be one derivation, and a puzzle
  // id is the last thing that should be computed twice. `review/brief-text.js`
  // likewise (D-14): the brief Max previews in the textarea and the brief the
  // auto-revise loop sends must be one rendering.
  [
    '/studio/',
    join(REPO, 'studio'),
    new Set(['stage-registry.js', 'slug.js', 'review/brief-text.js']),
  ],
];

const send = (res, status, body, type = 'text/plain; charset=utf-8') => {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
};

const sendJson = (res, status, value) =>
  send(res, status, JSON.stringify(value), 'application/json; charset=utf-8');

/** Resolves a URL path to a file, or null if it is not in the allowlist. */
function resolveStatic(pathname) {
  const decoded = safeDecode(pathname);
  if (decoded === null) return null;

  for (const [prefix, dir, allowedFiles] of MOUNTS) {
    if (!decoded.startsWith(prefix)) continue;
    const name = decoded.slice(prefix.length);
    if (allowedFiles && !allowedFiles.has(name)) return null;
    return within(dir, name);
  }

  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  return within(UI_DIR, relative);
}

// normalize() collapses ../ so the startsWith check below sees the real target.
function within(dir, relative) {
  const target = normalize(join(dir, relative));
  if (target !== dir && !target.startsWith(dir + sep)) return null;
  return existsSync(target) && statSync(target).isFile() ? target : null;
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null; // a malformed escape is not a path we will guess at
  }
}

const tooLarge = () => Object.assign(new Error('request body too large'), { status: 413 });

function readBody(req) {
  // Declared length is checked first, so an oversized body is refused before a
  // byte of it is buffered.
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return Promise.reject(tooLarge());
  }

  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let bytes = 0;
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        // Stop accumulating, but keep the socket alive long enough to answer:
        // destroying it here would show the client a connection reset instead
        // of the 413 that explains what happened.
        req.pause();
        rejectBody(tooLarge());
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    req.on('error', rejectBody);
  });
}

/**
 * Whether this process is still running the code that is on disk.
 *
 * A node process holds the modules it imported at boot, so a fix merged while
 * the Studio is up simply does not exist for it. That is not theoretical: on
 * 2026-08-07 the revision fix merged at 20:48, a server booted at 19:16 ran a
 * revision at 20:00, the revision churned exactly as it had before, and the
 * only reasonable reading was that the fix had failed. It had not — it was not
 * running. A whole conclusion was wrong for want of one line on a page.
 *
 * Newest mtime of the source the server actually runs, against boot time.
 * Recomputed per call, so a restart-worthy edit shows up on the next reload
 * rather than at the next boot — which would be far too late to help.
 *
 * Cheap enough to do on demand: a few hundred stat calls behind one endpoint a
 * page polls. `studio/runs` is skipped because it changes constantly and is
 * data, not code — watching it would make every run look like a stale server.
 */
function makeCodeState({ startedAtMs = Date.now(), roots = ['studio', 'src'] } = {}) {
  const startedAt = new Date(startedAtMs).toISOString();

  const newestMtime = (dir) => {
    let newest = 0;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return 0; // unreadable is not stale — say nothing rather than cry wolf
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'runs' || entry.name === 'node_modules' || entry.name.startsWith('.')) {
          continue;
        }
        newest = Math.max(newest, newestMtime(full));
      } else if (entry.name.endsWith('.js')) {
        try {
          newest = Math.max(newest, statSync(full).mtimeMs);
        } catch {
          // Vanished between readdir and stat. Not our problem to report.
        }
      }
    }
    return newest;
  };

  return () => {
    const newest = Math.max(...roots.map((root) => newestMtime(join(REPO, root))));
    return {
      startedAt,
      staleCode: newest > startedAtMs,
      ...(newest > 0 ? { codeChangedAt: new Date(newest).toISOString() } : {}),
    };
  };
}

export async function createReviewServer({
  store,
  rootDir,
  port = 4321,
  host = '127.0.0.1',
  makeTransport = defaultTransport,
  loadContext,
} = {}) {
  const runStore = store ?? createRunStore({ rootDir: rootDir ?? join(REPO, 'studio', 'runs') });
  const runner = createRunner({
    store: runStore,
    makeTransport,
    loadContext: loadContext ?? (() => ({ rules: loadRules().map((rule) => rule.text) })),
  });
  const api = createApi({ store: runStore, runner, codeState: makeCodeState() });

  const server = createServer(async (req, res) => {
    const pathname = (req.url ?? '/').split('?')[0];

    try {
      if (pathname.startsWith('/api/')) {
        let body = null;
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          const raw = await readBody(req);
          if (raw.trim().length > 0) {
            try {
              body = JSON.parse(raw);
            } catch {
              return sendJson(res, 400, { error: 'body must be valid JSON' });
            }
          } else {
            body = {}; // an empty body is an empty object, not a parse failure
          }
        }
        const result = await api.handle({ method: req.method, path: pathname, body });
        return sendJson(res, result.status, result.body);
      }

      const file = resolveStatic(pathname);
      if (file === null) return send(res, 404, 'not found');

      res.writeHead(200, {
        'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
        'Content-Length': statSync(file).size,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      });
      return createReadStream(file).pipe(res);
    } catch (error) {
      if (error.status === 413) return sendJson(res, 413, { error: error.message });
      return sendJson(res, 500, { error: error.message });
    }
  });

  await new Promise((done) => server.listen(port, host, done));

  const { port: boundPort } = server.address();
  return {
    server,
    runner,
    store: runStore,
    url: `http://${host}:${boundPort}`,
    async close() {
      await runner.drain();
      // Keep-alive sockets would otherwise hold close() open until they time
      // out — a single-user local tool has no reason to wait for them.
      server.closeAllConnections();
      await new Promise((done) => server.close(done));
    },
  };
}

// Started as a script: load .env (quietly), then listen.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  loadEnv();
  const port = Number(process.argv[2] ?? process.env.PORT ?? 4321);
  createReviewServer({ port }).then(({ url }) => {
    console.log(`Review Studio on ${url}`);
    console.log('Loopback only. Ctrl-C to stop.');
  });
}

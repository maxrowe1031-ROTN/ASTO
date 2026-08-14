// The server: the wire, and the things that only exist on the wire —
// binding, static mounts, body limits, traversal.
//
// Runs against a real socket on an ephemeral port. The route rules themselves
// are covered in api.test.js; this file is about everything around them.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReviewServer } from '../../../studio/review/server.js';
import { makeStore, mockTransport } from '../pipeline/helpers.js';

async function withServer(body) {
  const { store, cleanup } = makeStore();
  const { server, url, close } = await createReviewServer({
    store,
    port: 0,
    makeTransport: () => mockTransport(),
  });
  try {
    return await body({ url, server, store });
  } finally {
    await close();
    cleanup();
  }
}

test('binds loopback only — the Studio is never on the LAN', async () => {
  await withServer(({ server }) => {
    assert.equal(server.address().address, '127.0.0.1');
  });
});

test('serves the UI shell at the root', async () => {
  await withServer(async ({ url }) => {
    const response = await fetch(`${url}/`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    const html = await response.text();
    assert.match(html, /<title>/i);
    // It must link the game's stylesheets — that is what makes it look like ASTO.
    assert.match(html, /styles\/tokens\.css/);
    assert.match(html, /styles\/components\.css/);
  });
});

test('serves the game stylesheets, so the Studio inherits the real design system', async () => {
  await withServer(async ({ url }) => {
    for (const file of ['tokens.css', 'base.css', 'components.css']) {
      const response = await fetch(`${url}/styles/${file}`);
      assert.equal(response.status, 200, file);
      assert.match(response.headers.get('content-type'), /text\/css/);
    }
    // A real token, proving it is the game's file and not a copy.
    assert.match(await (await fetch(`${url}/styles/tokens.css`)).text(), /--cream/);
  });
});

test('serves the pure engine modules the board renderer needs', async () => {
  await withServer(async ({ url }) => {
    for (const file of ['arrangements.js', 'tiers.js', 'rng.js']) {
      const response = await fetch(`${url}/src/engine/${file}`);
      assert.equal(response.status, 200, file);
      assert.match(response.headers.get('content-type'), /javascript/);
    }
  });
});

// Widened 2026-08-04 so a candidate board can be played in the review page.
// The Studio drives the game's OWN views and controller rather than
// re-implementing play, so those modules have to be reachable.
test('serves the game modules the review page plays a board with', async () => {
  await withServer(async ({ url }) => {
    for (const path of [
      '/src/engine/engine.js', // the whole engine is pure; the allowlist was noise
      '/src/view/board-view.js',
      '/src/view/frame-view.js',
      '/src/view/motion.js',
      '/src/controller/game-controller.js',
    ]) {
      const response = await fetch(`${url}${path}`);
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get('content-type'), /javascript/);
    }
  });
});

test('does not serve the rest of the repo — the mount list is an allowlist', async () => {
  await withServer(async ({ url }) => {
    for (const path of [
      // The app shell owns the game's routing, storage and first-run logic.
      // The Studio composes its own; this must stay unreachable.
      '/src/app.js',
      // Only game-controller.js is a legitimate entry point under controller/.
      '/src/controller/tutorial-script.js',
      '/src/storage.js',
      '/src/share.js',
      '/package.json',
      '/studio/runs/',
      '/.env',
      '/docs/log.md',
    ]) {
      const response = await fetch(`${url}${path}`);
      assert.ok(response.status === 404 || response.status === 403, `${path} → ${response.status}`);
    }
  });
});

test('refuses traversal, however it is spelled', async () => {
  await withServer(async ({ url }) => {
    for (const path of [
      '/../package.json',
      '/styles/../../package.json',
      '/styles/%2e%2e/%2e%2e/package.json',
      '/src/engine/../../app.js',
    ]) {
      const response = await fetch(`${url}${path}`);
      assert.ok(response.status >= 400, `${path} → ${response.status}`);
      const text = await response.text();
      assert.equal(text.includes('"name": "asto"'), false, `${path} leaked package.json`);
    }
  });
});

test('static responses are not cached — an edited module reloads', async () => {
  await withServer(async ({ url }) => {
    const response = await fetch(`${url}/styles/tokens.css`);
    assert.match(response.headers.get('cache-control'), /no-cache/);
  });
});

test('the API answers over the wire', async () => {
  await withServer(async ({ url }) => {
    const response = await fetch(`${url}/api/runs`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /application\/json/);
    assert.deepEqual(await response.json(), { runs: [] });
  });
});

test('a POST body that is not JSON is 400, not a crash', async () => {
  await withServer(async ({ url }) => {
    const response = await fetch(`${url}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'this is not json{',
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /JSON/i);
  });
});

test('an oversized body is refused at 413 before it is parsed', async () => {
  await withServer(async ({ url }) => {
    const response = await fetch(`${url}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ theme: 'x'.repeat(300_000) }),
    });
    assert.equal(response.status, 413);
  });
});

test('an empty POST body is treated as an empty object, not a parse error', async () => {
  await withServer(async ({ url, store }) => {
    const { runId } = store.createRun({ slug: 'lantern' });
    const response = await fetch(`${url}/api/runs/${runId}/approve`, { method: 'POST' });
    // created → approved is not a legal transition, so this is a 409 —
    // which proves the body parsed and the route ran.
    assert.equal(response.status, 409);
  });
});

test('a full round trip: create a run over HTTP and watch it finish', async () => {
  await withServer(async ({ url, store }) => {
    const created = await fetch(`${url}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ theme: 'Lantern light', mock: true }),
    });
    assert.equal(created.status, 202);
    const { runId } = await created.json();

    // Poll the way the UI does.
    let status = 'created';
    for (let i = 0; i < 100 && status !== 'awaiting-review' && status !== 'failed'; i += 1) {
      const detail = await (await fetch(`${url}/api/runs/${runId}`)).json();
      status = detail.manifest.status;
      if (status !== 'awaiting-review' && status !== 'failed') {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    assert.equal(status, 'awaiting-review');
    assert.equal(store.readAttemptArtifact(runId, '0001', 'board.json').title, 'First Light');
  });
});

// B2 (D-22): the editor validates live with the game's OWN validator, and the
// gloss the page previews must be the gloss publish ships — one derivation.
test('serves the validator and gloss modules the editor needs, and nothing else from source/', async () => {
  await withServer(async ({ url }) => {
    for (const path of ['/src/source/validate-puzzle.js', '/studio/gloss.js']) {
      const response = await fetch(`${url}${path}`);
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get('content-type'), /javascript/);
    }
    for (const path of ['/src/source/local-json-source.js', '/studio/edits.js', '/studio/llm.js']) {
      const response = await fetch(`${url}${path}`);
      assert.ok(response.status === 404 || response.status === 403, `${path} → ${response.status}`);
    }
  });
});

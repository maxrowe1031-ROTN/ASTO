// art-store — the only module that writes into `art/` (design.md D-31).
//
// Same law as puzzle-store, which it mirrors: the gate lives in the store,
// every check runs BEFORE a byte is written so a refusal writes nothing, and
// a register name is matched against an allowlist plus the slug pattern
// before it is joined onto a path — traversal impossible by construction.
//
// The image check here is deliberately shallow: PNG signature + IHDR
// dimensions. Deep decoding (does it parse, is the palette right) is the 02a
// gate's job in the pipeline; the store checks exactly what it needs to file
// bytes safely and honestly records that boundary.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ArtRefused, createArtStore } from '../../../studio/storage/art-store.js';

const tempDir = () => mkdtempSync(join(tmpdir(), 'asto-art-'));

const REGISTERS = ['kitchens-food', 'landscapes'];

const makeStore = (rootDir) =>
  createArtStore({
    rootDir,
    registerIds: REGISTERS,
    clock: () => '2026-08-26T12:00:00.000Z',
  });

/**
 * Bytes carrying exactly what the store validates: the 8-byte PNG signature
 * and an IHDR chunk with width and height. Not a decodable image — the
 * store's boundary is the point under test.
 */
const pngBytes = (width, height) => {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); // signature
  bytes.set([0, 0, 0, 13], 8); // IHDR length
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
};

const goodPublish = (overrides = {}) => ({
  register: 'kitchens-food',
  state: 'idle',
  bytes: pngBytes(750, 120), // 6.25:1 at @2x
  meta: { prompt: 'a bakery at dawn', transport: 'manual' },
  ...overrides,
});

// --- publishing -------------------------------------------------------------

test('a publish writes the png, the meta, and the manifest together', () => {
  const root = tempDir();
  try {
    const store = makeStore(root);
    const result = store.publish(goodPublish());

    assert.equal(result.register, 'kitchens-food');
    assert.equal(result.state, 'idle');
    assert.equal(result.width, 750);
    assert.equal(result.height, 120);
    assert.equal(result.publishedAt, '2026-08-26T12:00:00.000Z');

    assert.ok(existsSync(join(root, 'kitchens-food', 'idle.png')));
    const meta = JSON.parse(readFileSync(join(root, 'kitchens-food', 'meta.json'), 'utf8'));
    assert.equal(meta.states.idle.prompt, 'a bakery at dawn');
    assert.equal(meta.states.idle.width, 750);

    const manifest = JSON.parse(readFileSync(join(root, 'index.json'), 'utf8'));
    assert.deepEqual(manifest.registers['kitchens-food'].states, ['idle']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('meta merges across states rather than replacing the file', () => {
  const root = tempDir();
  try {
    const store = makeStore(root);
    store.publish(goodPublish({ state: 'idle' }));
    store.publish(goodPublish({ state: 'solved', meta: { prompt: 'celebration' } }));

    const meta = JSON.parse(readFileSync(join(root, 'kitchens-food', 'meta.json'), 'utf8'));
    assert.equal(meta.states.idle.prompt, 'a bakery at dawn');
    assert.equal(meta.states.solved.prompt, 'celebration');

    const manifest = JSON.parse(readFileSync(join(root, 'index.json'), 'utf8'));
    assert.deepEqual(manifest.registers['kitchens-food'].states, ['idle', 'solved']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('read() returns the exact bytes that were published', () => {
  const root = tempDir();
  try {
    const store = makeStore(root);
    const bytes = pngBytes(1125, 180);
    store.publish(goodPublish({ bytes }));
    assert.deepEqual(new Uint8Array(store.read('kitchens-food', 'idle')), bytes);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- the gate: every refusal writes nothing --------------------------------

const assertRefusal = (root, fn, reason) => {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof ArtRefused, `expected ArtRefused, got ${error.constructor.name}: ${error.message}`);
    assert.equal(error.reason, reason);
    return true;
  });
  assert.deepEqual(readdirSync(root), [], 'a refusal must write nothing');
};

test('an unknown register is refused', () => {
  const root = tempDir();
  try {
    const store = makeStore(root);
    assertRefusal(root, () => store.publish(goodPublish({ register: 'volcanoes' })), 'bad-register');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a traversal attempt is refused before any path is built', () => {
  const root = tempDir();
  try {
    const store = makeStore(root);
    assertRefusal(root, () => store.publish(goodPublish({ register: '../escape' })), 'bad-register');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an unknown state is refused', () => {
  const root = tempDir();
  try {
    const store = makeStore(root);
    assertRefusal(root, () => store.publish(goodPublish({ state: 'smug' })), 'bad-state');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('bytes without a PNG signature are refused', () => {
  const root = tempDir();
  try {
    const store = makeStore(root);
    const notPng = new TextEncoder().encode('<svg>this is not a png</svg>');
    assertRefusal(root, () => store.publish(goodPublish({ bytes: notPng })), 'bad-image');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('empty or missing bytes are refused', () => {
  const root = tempDir();
  try {
    const store = makeStore(root);
    assertRefusal(root, () => store.publish(goodPublish({ bytes: new Uint8Array(0) })), 'bad-image');
    assertRefusal(root, () => store.publish(goodPublish({ bytes: undefined })), 'bad-image');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the wrong aspect is refused — the band is 6.25:1', () => {
  const root = tempDir();
  try {
    const store = makeStore(root);
    // 3:2 — a raw render that skipped the crop.
    assertRefusal(root, () => store.publish(goodPublish({ bytes: pngBytes(1536, 1024) })), 'bad-aspect');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a band below display width is refused', () => {
  const root = tempDir();
  try {
    const store = makeStore(root);
    // Perfect ratio, but 250px wide cannot fill a 375px slot.
    assertRefusal(root, () => store.publish(goodPublish({ bytes: pngBytes(250, 40) })), 'bad-aspect');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an occupied destination is refused without replace, and replace overwrites', () => {
  const root = tempDir();
  try {
    const store = makeStore(root);
    store.publish(goodPublish());
    assert.throws(() => store.publish(goodPublish()), (error) => error.reason === 'occupied');

    const next = pngBytes(1125, 180);
    const result = store.publish(goodPublish({ bytes: next, replace: true }));
    assert.equal(result.width, 1125);
    assert.deepEqual(new Uint8Array(store.read('kitchens-food', 'idle')), next);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- the manifest -----------------------------------------------------------

test('the manifest lists only registers with at least one published state', () => {
  const root = tempDir();
  try {
    const store = makeStore(root);
    store.publish(goodPublish());
    store.publish(goodPublish({ register: 'landscapes', state: 'miss' }));

    const manifest = JSON.parse(readFileSync(join(root, 'index.json'), 'utf8'));
    assert.deepEqual(Object.keys(manifest.registers).sort(), ['kitchens-food', 'landscapes']);
    assert.equal(manifest.version, 1);

    const listed = store.list();
    assert.equal(listed.length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- the pending handoff (the manual transport's seam) ----------------------

test('pending prompt → dropped png → clear, all inside art/pending', () => {
  const root = tempDir();
  try {
    const store = makeStore(root);
    const promptPath = store.writePendingPrompt({
      register: 'kitchens-food',
      state: 'idle',
      prompt: 'a bakery at dawn, band composition',
    });
    assert.ok(promptPath.endsWith(join('pending', 'kitchens-food-idle.txt')));
    assert.match(readFileSync(promptPath, 'utf8'), /bakery at dawn/);

    // Nothing dropped yet.
    assert.equal(store.findPendingImage('kitchens-food', 'idle'), null);

    // Max drops a PNG beside the prompt.
    const dropped = join(root, 'pending', 'kitchens-food-idle.png');
    const bytes = pngBytes(750, 120);
    require_write(dropped, bytes);
    assert.equal(store.findPendingImage('kitchens-food', 'idle'), dropped);

    store.clearPending('kitchens-food', 'idle');
    assert.equal(existsSync(promptPath), false);
    assert.equal(existsSync(dropped), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('pending helpers refuse an unknown register too — same gate, same seam', () => {
  const root = tempDir();
  try {
    const store = makeStore(root);
    assert.throws(
      () => store.writePendingPrompt({ register: '../escape', state: 'idle', prompt: 'x' }),
      (error) => error.reason === 'bad-register',
    );
    assert.deepEqual(readdirSync(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Small helper: tests write the "dropped" file directly, as Max would.
import { writeFileSync, mkdirSync } from 'node:fs';
function require_write(path, bytes) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, bytes);
}

// art-store — the ONLY module that writes into `art/` (design.md D-31).
//
// The third write seam, beside `run-store.js` (run artifacts) and
// `puzzle-store.js` (published boards). It answers to puzzle-store's law,
// because `art/` is shipped game content the same way `puzzles/` is:
//
//   The gate lives HERE, not in callers. Register against the allowlist and
//   the slug pattern before it is joined onto a path — traversal impossible
//   by construction. State against ART_STATES. Bytes against the PNG
//   signature and IHDR, aspect against the band. A refusal writes NOTHING.
//
//   The image check is deliberately shallow: signature + dimensions, the
//   minimum needed to file bytes safely. Deep decoding — does it parse, is
//   the palette honest, is one side quiet — is the 02a scene-check gate's
//   job in the pipeline. A store that half-repeats a gate invites the two
//   to disagree.
//
//   `index.json` is rebuilt from disk on every publish, like the puzzle
//   manifest, because a manifest that can drift from the files beside it is
//   worse than no manifest at all. The game will read this file and resolve
//   register → stills; a board whose register has no art falls back to the
//   default scene, so art is additive and never blocks a board.
//
// It also owns `art/pending/` — the manual render transport's handoff (D-31
// decision 2: the transport starts manual). The transport does not get its
// own path-building powers; it asks this store, because ONE module builds
// paths under `art/` or the traversal guarantee means nothing.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeBytesAtomic, writeJsonAtomic, writeTextAtomic } from './atomic-write.js';
import { SLUG } from '../slug.js';
import { ART_STATES, BAND } from '../art-stage-registry.js';
import { REGISTERS } from '../corpus/registers.js';

const ART_DIR = fileURLToPath(new URL('../../art/', import.meta.url));

const MANIFEST_FILENAME = 'index.json';
const MANIFEST_VERSION = 1;
const PENDING_DIRNAME = 'pending';
const RESERVED = new Set([MANIFEST_FILENAME, PENDING_DIRNAME]);

// Aspect tolerance: a crop is integer pixels, so 2% absorbs rounding without
// admitting a differently-shaped image.
const ASPECT_TOLERANCE = 0.02;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * A publish refused on purpose, with a machine-readable reason — the same
 * shape as puzzle-store's PublishRefused, separate class because the two
 * seams refuse for different vocabularies.
 *
 * reason: 'bad-register' | 'bad-state' | 'bad-image' | 'bad-aspect' | 'occupied'
 */
export class ArtRefused extends Error {
  constructor(reason, message, details = {}) {
    super(message);
    this.name = 'ArtRefused';
    this.reason = reason;
    Object.assign(this, details);
  }
}

/**
 * Signature + IHDR only. Returns { width, height } or null. The IHDR chunk is
 * mandatory-first per the PNG spec, so width and height sit at fixed offsets:
 * bytes 16–19 and 20–23, big-endian.
 */
function parsePngSize(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 24) return null;
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return null;
  }
  if (bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) {
    return null; // no IHDR where IHDR must be
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (width === 0 || height === 0) return null;
  return { width, height };
}

export function createArtStore({
  rootDir = ART_DIR,
  registerIds = REGISTERS.map((r) => r.id),
  clock = () => new Date().toISOString(),
} = {}) {
  const knownRegisters = new Set(registerIds);

  // Both checks, always: membership catches typos and unknown registers,
  // the pattern makes the string safe to join even if the allowlist is ever
  // injected from somewhere careless.
  const assertRegister = (register) => {
    if (typeof register !== 'string' || !SLUG.test(register) || !knownRegisters.has(register)) {
      throw new ArtRefused(
        'bad-register',
        `"${register}" is not a known register — art is keyed to studio/corpus/registers.js ids`,
      );
    }
  };

  const assertState = (state) => {
    if (!ART_STATES.includes(state)) {
      throw new ArtRefused(
        'bad-state',
        `"${state}" is not an art state — expected one of ${ART_STATES.join(', ')}`,
      );
    }
  };

  const registerDir = (register) => join(rootDir, register);
  const pngPath = (register, state) => join(registerDir(register), `${state}.png`);
  const metaPath = (register) => join(registerDir(register), 'meta.json');
  const manifestPath = () => join(rootDir, MANIFEST_FILENAME);
  const pendingDir = () => join(rootDir, PENDING_DIRNAME);
  const pendingBase = (register, state) => join(pendingDir(), `${register}-${state}`);

  const readMetaFile = (register) => {
    const path = metaPath(register);
    if (!existsSync(path)) return { register, states: {} };
    return JSON.parse(readFileSync(path, 'utf8'));
  };

  const store = {
    /**
     * Files one rendered still as game art. All checks run before any write;
     * a refusal throws ArtRefused having touched nothing.
     */
    publish({ register, state, bytes, meta = {}, replace = false }) {
      assertRegister(register);
      assertState(state);

      const size = parsePngSize(bytes);
      if (!size) {
        throw new ArtRefused('bad-image', 'bytes are not a PNG (signature or IHDR missing)');
      }

      const ratio = size.width / size.height;
      if (Math.abs(ratio - BAND.ratio) / BAND.ratio > ASPECT_TOLERANCE) {
        throw new ArtRefused(
          'bad-aspect',
          `${size.width}×${size.height} is ${ratio.toFixed(2)}:1 — the band is ${BAND.ratio}:1. ` +
            'A raw render must be cropped before it is published.',
        );
      }
      if (size.width < BAND.width) {
        throw new ArtRefused(
          'bad-aspect',
          `${size.width}px is narrower than the ${BAND.width}px display slot`,
        );
      }

      const destination = pngPath(register, state);
      if (existsSync(destination) && !replace) {
        throw new ArtRefused(
          'occupied',
          `art/${register}/${state}.png already exists — republish with replace to overwrite`,
        );
      }

      // Every refusal is behind us; now the writes land together.
      const publishedAt = clock();
      mkdirSync(registerDir(register), { recursive: true });
      writeBytesAtomic(destination, bytes);

      const record = readMetaFile(register);
      record.register = register;
      record.states = {
        ...record.states,
        [state]: { ...meta, width: size.width, height: size.height, publishedAt },
      };
      writeJsonAtomic(metaPath(register), record);
      store.writeManifest();

      return { register, state, path: destination, width: size.width, height: size.height, publishedAt };
    },

    read(register, state) {
      assertRegister(register);
      assertState(state);
      return readFileSync(pngPath(register, state));
    },

    readMeta(register) {
      assertRegister(register);
      return readMetaFile(register);
    },

    /** What is actually on disk, register by register — the manifest's source. */
    list() {
      if (!existsSync(rootDir)) return [];
      return readdirSync(rootDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !RESERVED.has(entry.name))
        .map((entry) => {
          const states = ART_STATES.filter((state) => existsSync(pngPath(entry.name, state)));
          return { register: entry.name, states };
        })
        .filter((entry) => entry.states.length > 0)
        .sort((a, b) => a.register.localeCompare(b.register));
    },

    /** Rebuilt from disk, never edited in place — the puzzle manifest's rule. */
    writeManifest() {
      const registers = {};
      for (const entry of store.list()) {
        registers[entry.register] = { states: entry.states };
      }
      const manifest = { version: MANIFEST_VERSION, generatedAt: clock(), registers };
      writeJsonAtomic(manifestPath(), manifest);
      return manifest;
    },

    // --- the manual transport's handoff ------------------------------------

    /** Writes the prompt a human will render, and returns where it landed. */
    writePendingPrompt({ register, state, prompt }) {
      assertRegister(register);
      assertState(state);
      if (typeof prompt !== 'string' || prompt.trim().length === 0) {
        throw new ArtRefused('bad-image', 'a pending prompt must be non-empty text');
      }
      mkdirSync(pendingDir(), { recursive: true });
      const path = `${pendingBase(register, state)}.txt`;
      writeTextAtomic(path, `${prompt.trim()}\n`);
      return path;
    },

    /** The dropped render, if the human has delivered one yet. */
    findPendingImage(register, state) {
      assertRegister(register);
      assertState(state);
      const path = `${pendingBase(register, state)}.png`;
      return existsSync(path) ? path : null;
    },

    /** Removes both halves of one handoff once the render is published. */
    clearPending(register, state) {
      assertRegister(register);
      assertState(state);
      for (const extension of ['txt', 'png']) {
        rmSync(`${pendingBase(register, state)}.${extension}`, { force: true });
      }
    },
  };

  return store;
}

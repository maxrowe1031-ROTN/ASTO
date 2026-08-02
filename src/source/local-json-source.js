// The PuzzleSource seam, local-JSON flavour.
//
// Fetches a board file and validates it before anything downstream can trust it — the
// game never sees an invalid puzzle. `ApiSource` later implements the same
// `loadPuzzle(path)` interface and swaps in with no engine or view changes.
//
// `fetchFn` is injectable so node:test covers this module without a network or browser;
// production wiring passes nothing and gets the real fetch.

import { validatePuzzle } from './validate-puzzle.js';

export class LocalJsonSource {
  constructor({ fetchFn } = {}) {
    this.fetchFn = fetchFn ?? ((...args) => globalThis.fetch(...args));
  }

  async loadPuzzle(path) {
    const response = await this.fetchFn(path);
    if (!response.ok) {
      throw new Error(`Could not load ${path}: HTTP ${response.status}`);
    }

    let puzzle;
    try {
      puzzle = await response.json();
    } catch {
      throw new Error(`Could not load ${path}: the file is not valid JSON.`);
    }

    const validation = validatePuzzle(puzzle);
    if (!validation.ok) {
      const error = new Error(
        `${path} failed schema v1.0 validation:\n` +
          validation.errors.map((e) => `  ${e.path || '(root)'} — ${e.message}`).join('\n')
      );
      error.errors = validation.errors;
      throw error;
    }

    return puzzle;
  }
}

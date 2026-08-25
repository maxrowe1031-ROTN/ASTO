// The confetti's data half, tested headlessly. Importing the module in node is
// itself an assertion (it must load with no DOM), and drop() must no-op there —
// the same import-safety bar sound.js and motion.js are held to.

import test from 'node:test';
import assert from 'node:assert/strict';

import { drop, makePieces } from '../src/view/confetti.js';
import { mulberry32 } from '../src/engine/rng.js';

test('the module is import-safe and drop() no-ops with no DOM', () => {
  assert.equal(drop(), undefined);
});

test('pieces are deterministic under an injected rng', () => {
  const a = makePieces(50, mulberry32(7));
  const b = makePieces(50, mulberry32(7));
  assert.deepEqual(a, b);
  assert.equal(a.length, 50);
});

test('every piece is drawable: bounded spawn, palette index, positive motion', () => {
  const pieces = makePieces(200, mulberry32(2026));
  for (const piece of pieces) {
    assert.ok(piece.x >= 0 && piece.x <= 1, 'spawns inside the width');
    assert.ok(Number.isInteger(piece.color) && piece.color >= 0 && piece.color < 5);
    assert.ok(piece.size >= 6 && piece.size <= 11);
    assert.ok(piece.fall > 0, 'falls downward');
    assert.ok(piece.delay >= 0 && piece.delay < 0.7 + 1e-9, 'staggered, not a sheet');
  }
});

test('the drop is a shower: delays and speeds actually vary', () => {
  const pieces = makePieces(100, mulberry32(1));
  assert.ok(new Set(pieces.map((p) => p.delay)).size > 50, 'varied delays');
  assert.ok(new Set(pieces.map((p) => p.fall)).size > 50, 'varied speeds');
  assert.ok(new Set(pieces.map((p) => p.color)).size === 5, 'all five colors appear');
});

// The solve transit's pure half, tested headlessly. Importing the module in node is
// itself an assertion (no DOM at import time), launch() must no-op with no DOM, and
// land() with nothing pending must resolve instantly — that pair of guarantees is what
// keeps the miss path, reduced motion, and every repaint at today's exact behavior.

import test from 'node:test';
import assert from 'node:assert/strict';

import { FLIGHT, SolveFlight, landingTransforms } from '../src/view/solve-flight.js';

const rect = (left, top, width, height) => ({ left, top, width, height });

test('the module is import-safe and inert with no DOM', async () => {
  const flight = new SolveFlight();
  assert.equal(flight.pending, false);
  await flight.launch([]); // no DOM: must return without arming anything
  assert.equal(flight.pending, false);
  await flight.land({}); // nothing pending: resolves without touching the argument
  flight.discard(); // idempotent on an empty flight
  assert.equal(flight.pending, false);
});

test('landingTransforms fans the four clones left-to-right across the card', () => {
  const origins = [rect(0, 100, 80, 56), rect(90, 100, 80, 56), rect(0, 160, 80, 56), rect(90, 160, 80, 56)];
  const target = rect(16, 400, 343, 90);
  const moves = landingTransforms(origins, target);

  assert.equal(moves.length, 4);
  // Destination centers, recovered from origin center + delta: strictly left-to-right
  // in canonical order, and every one inside the card.
  const centers = moves.map((m, i) => ({
    x: origins[i].left + origins[i].width / 2 + m.dx,
    y: origins[i].top + origins[i].height / 2 + m.dy
  }));
  for (let i = 1; i < centers.length; i += 1) {
    assert.ok(centers[i].x > centers[i - 1].x, 'canonical reading order across the card');
  }
  for (const { x, y } of centers) {
    assert.ok(x >= target.left && x <= target.left + target.width, 'lands inside the card');
    assert.ok(y >= target.top && y <= target.top + target.height, 'lands inside the card');
  }
});

test('landingTransforms is deterministic and scales into the card, never up', () => {
  const origins = [rect(10, 10, 80, 56)];
  const target = rect(0, 300, 300, 80);
  assert.deepEqual(landingTransforms(origins, target), landingTransforms(origins, target));
  for (const move of landingTransforms(origins, target)) {
    assert.ok(move.scale > 0 && move.scale <= 1);
  }
});

test('the flight constants stay inside the brief', () => {
  assert.ok(Object.isFrozen(FLIGHT));
  assert.ok(FLIGHT.pulseScale > 1 && FLIGHT.pulseScale <= 1.1, 'a pulse, not a jump');
  assert.ok(FLIGHT.landScale > 0 && FLIGHT.landScale < 1, 'tiles shrink into the card');
  assert.ok(FLIGHT.fadeTail > 0.5 && FLIGHT.fadeTail < 1, 'clones stay visible most of the trip');
  assert.ok(FLIGHT.failsafeMs >= 700, 'the failsafe never cuts a legitimate beat short');
});

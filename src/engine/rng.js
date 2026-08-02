// Randomness. PURE — imports nothing, and never reaches for Math.random itself.
//
// Every shuffle takes an injected rand(), so tests can seed it and the engine stays
// deterministic. Production wiring passes Math.random from the controller; that is the
// one and only place the impurity is allowed to live.

/** Shuffle into a new array. `rand` must be a function returning [0, 1). */
export function fisherYates(items, rand) {
  if (typeof rand !== 'function') {
    throw new TypeError('fisherYates requires an injected rand() function');
  }
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A small seeded PRNG, so a shuffle can be replayed exactly in a test. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

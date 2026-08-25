// Confetti, for the one screen that earned it. Presentation only — knows
// nothing about analogies, sets, or rules; fired once by the end view when a
// WON game first renders.
//
// This is a sanctioned deviation from the GDD's original no-list (D-29,
// 2026-08-25). Max's words: "i wrote the gdd, we can change it or deviate from
// it however we want... the confetti could be a nice touch." The deviation is
// deliberately narrow: confetti exists HERE, on the win screen, and nowhere
// else — the board itself keeps the no-list's calm.
//
// It falls in ASTO's own colors — the four tier mains plus honey, read from
// tokens.css at runtime the way motion.js reads --motion-slow — so even the
// celebration is in the game's palette rather than a party store's.
//
// Same laws as motion and sound: prefers-reduced-motion no-ops the whole thing,
// nothing is awaited by anyone (fire and forget), the canvas ignores pointer
// events, and it removes itself when the last piece leaves the screen.

import { prefersReducedMotion } from './motion.js';

/** Tier mains + honey. Fallbacks match tokens.css; the live read wins. */
const FALLBACK_COLORS = Object.freeze(['#8FAC84', '#D9A741', '#C2603E', '#4A453E', '#D9A741']);
const COLOR_TOKENS = Object.freeze([
  '--tier-green-main',
  '--tier-yellow-main',
  '--tier-red-main',
  '--tier-black-main',
  '--honey'
]);

const PIECE_COUNT = 140;
const FALL_SECONDS = 2.6; // slowest piece, first drop to off-screen

/**
 * The pieces, as data — PURE, node-tested. `random` is injectable the way the
 * engine's RNG is; the default caller passes Math.random (this is a view).
 *
 * Each piece: spawn x (0–1 of width), a color index, a size in px, fall speed
 * (px/s), sway amplitude and phase, spin rate, and a stagger delay so the drop
 * reads as a shower rather than a sheet.
 */
export function makePieces(count, random) {
  const pieces = [];
  for (let i = 0; i < count; i += 1) {
    pieces.push({
      x: random(),
      color: Math.floor(random() * COLOR_TOKENS.length),
      size: 6 + random() * 5,
      fall: 210 + random() * 160,
      sway: 18 + random() * 30,
      phase: random() * Math.PI * 2,
      spin: (random() - 0.5) * 9,
      delay: random() * 0.7
    });
  }
  return pieces;
}

/** The palette, read live from the stylesheet with the fallbacks behind it. */
function colors() {
  const style = globalThis.getComputedStyle?.(document.documentElement);
  return COLOR_TOKENS.map((token, i) => {
    const value = style?.getPropertyValue(token).trim();
    return value || FALLBACK_COLORS[i];
  });
}

/**
 * Drop confetti over the current screen. Fire and forget: returns nothing,
 * cleans up after itself, and no-ops wherever it cannot or should not run.
 */
export function drop() {
  if (prefersReducedMotion()) return;
  if (typeof document === 'undefined' || !document.createElement) return;

  const canvas = document.createElement('canvas');
  const context = canvas.getContext?.('2d');
  if (!context) return;

  const dpr = globalThis.devicePixelRatio || 1;
  const width = globalThis.innerWidth;
  const height = globalThis.innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  // Fixed and inert: the celebration must never block a button underneath it.
  canvas.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:50;';
  context.scale(dpr, dpr);
  document.body.appendChild(canvas);

  const palette = colors();
  const pieces = makePieces(PIECE_COUNT, Math.random);
  const started = performance.now();

  const frame = (now) => {
    const t = (now - started) / 1000;
    context.clearRect(0, 0, width, height);

    let falling = 0;
    for (const piece of pieces) {
      const alive = t - piece.delay;
      if (alive < 0) {
        falling += 1;
        continue;
      }
      const y = alive * piece.fall - piece.size;
      if (y > height + piece.size) continue;
      falling += 1;

      const x = piece.x * width + Math.sin(alive * 2.1 + piece.phase) * piece.sway;
      context.save();
      context.translate(x, y);
      context.rotate(piece.phase + alive * piece.spin);
      context.fillStyle = palette[piece.color];
      // A rectangle whose apparent width breathes as it "tumbles".
      context.fillRect(
        -piece.size / 2,
        (-piece.size * 0.6) / 2,
        piece.size * Math.abs(Math.sin(alive * 3 + piece.phase)),
        piece.size * 0.6
      );
      context.restore();
    }

    if (falling > 0 && t < FALL_SECONDS + 1.2) requestAnimationFrame(frame);
    else canvas.remove();
  };

  requestAnimationFrame(frame);
}

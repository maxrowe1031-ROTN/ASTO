// Motion helpers. Presentation only — these know nothing about analogies, sets, or rules.
//
// Appendix E: ease-out everywhere, ±4px shake ×3, tiles press 1px. No confetti, no
// particles, no timers. Speed comes from --motion-slow in tokens.css — the one dial.
//
// Every helper here no-ops under prefers-reduced-motion, so reduced motion is handled
// once rather than remembered at each call site. Each returns a promise that resolves
// when the motion is done (immediately when motion is off), so callers can sequence
// beats without setTimeout guesswork.

const EASE = 'cubic-bezier(0, 0, 0.2, 1)';
const SHAKE_PX = 4;

// Used only if the token can't be read (no DOM, stylesheet missing). Tuning happens in
// tokens.css, never here.
const FALLBACK_MS = 281;

let cachedDuration = null;

/**
 * The motion duration, read from `--motion-slow` in tokens.css.
 *
 * Reading the token keeps ONE dial: JS animations and CSS transitions used to hold the
 * same number in two files, which drifts the moment someone tunes only one of them.
 * Cached after first read — retuning is a code change, not a runtime event.
 */
function duration() {
  if (cachedDuration !== null) return cachedDuration;

  const raw = globalThis.getComputedStyle?.(document.documentElement)
    .getPropertyValue('--motion-slow')
    .trim();
  const value = Number.parseFloat(raw);

  cachedDuration = Number.isFinite(value) && value > 0
    ? (raw.endsWith('ms') ? value : value * 1000) // tolerate `0.28s` as well as `281ms`
    : FALLBACK_MS;
  return cachedDuration;
}

/** Gap between staggered entrances (end-screen cards), proportional to the dial. */
export function staggerStep() {
  return Math.round(duration() * 0.33);
}

export function prefersReducedMotion() {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * Wait for an animation, but never longer than it should take.
 *
 * Motion must NEVER be able to hold the game hostage. `Animation.finished` can stall
 * indefinitely — a backgrounded tab pauses the timeline, and some engines simply never
 * settle it — and since view rendering is sequenced on these promises, a stalled
 * animation would freeze the board. Racing a timer guarantees the game keeps moving; the
 * worst case is that a beat is skipped, which no player will notice.
 */
function settled(animations, expectedMs) {
  const list = [animations].flat().filter(Boolean);
  if (list.length === 0) return Promise.resolve();

  return Promise.race([
    Promise.allSettled(list.map((a) => a.finished)),
    new Promise((resolve) => setTimeout(resolve, expectedMs + 80))
  ]).then(() => {
    // If the timer won, some animations are still pending — and a pending animation keeps
    // applying its first keyframe, which for a fade-in means the element stays invisible.
    // Cancelling drops the effect so the element falls back to its stylesheet state.
    for (const animation of list) {
      if (animation.playState !== 'finished') animation.cancel();
    }
  });
}

/** A scale pulse — used for the canonical-order beat on a solve. */
export function pulse(elements) {
  if (prefersReducedMotion()) return Promise.resolve();
  return settled(
    [elements].flat().map((el) =>
      el.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }],
        { duration: duration(), easing: EASE }
      )
    ),
    duration()
  );
}

/**
 * FLIP: measure, let the caller mutate the DOM, then animate each element from where it
 * was to where it landed. Transforms only — never layout properties — so the browser can
 * run it on the compositor and the grid never reflows mid-animation.
 *
 * This is why board tiles are persistent keyed nodes: FLIP needs the same element before
 * and after.
 */
export async function flip(elements, mutate) {
  if (prefersReducedMotion()) {
    mutate();
    return;
  }

  const before = new Map();
  for (const el of elements) before.set(el, el.getBoundingClientRect());

  mutate();

  const animations = [];
  for (const el of elements) {
    const first = before.get(el);
    const last = el.getBoundingClientRect();
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;

    animations.push(
      el.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
        { duration: duration(), easing: EASE }
      )
    );
  }

  await settled(animations, duration());
}

/** ±4px, three times — the wrong-answer beat. */
export async function shake(elements) {
  if (prefersReducedMotion()) return;

  await settled(
    [elements].flat().map((el) =>
      el.animate(
        [
          { transform: 'translateX(0)' },
          { transform: `translateX(-${SHAKE_PX}px)` },
          { transform: `translateX(${SHAKE_PX}px)` },
          { transform: `translateX(-${SHAKE_PX}px)` },
          { transform: `translateX(${SHAKE_PX}px)` },
          { transform: `translateX(-${SHAKE_PX}px)` },
          { transform: 'translateX(0)' }
        ],
        { duration: duration() * 1.6, easing: 'ease-in-out' }
      )
    ),
    duration() * 1.6
  );
}

/**
 * A soft settle for something arriving on screen (solved cards, end-screen rows).
 *
 * Visibility is restored in a `finally`, never left to the animation. An earlier version
 * used `fill: 'backwards'` to hold the element hidden through its stagger delay — which
 * means a card stays INVISIBLE if the animation never runs. Paused timelines are ordinary
 * (a backgrounded tab), so that traded a whole screen of content for a fade.
 */
export async function settleIn(element, delay = 0) {
  if (prefersReducedMotion()) return;

  element.style.opacity = '0';
  try {
    await settled(
      element.animate(
        [
          { opacity: 0, transform: 'translateY(6px)' },
          { opacity: 1, transform: 'translateY(0)' }
        ],
        { duration: duration(), easing: EASE, delay }
      ),
      duration() + delay
    );
  } finally {
    element.style.opacity = '';
  }
}

/** Fade something out of existence before the layout closes around it. */
export async function fadeOut(elements) {
  if (prefersReducedMotion()) return;

  await settled(
    [elements].flat().map((el) =>
      el.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: duration() * 0.7,
        easing: EASE,
        fill: 'forwards'
      })
    ),
    duration() * 0.7
  );
}

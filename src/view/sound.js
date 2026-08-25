// Sound. Presentation only — this module knows nothing about analogies, sets, or
// rules. It is motion.js's sibling: one module owns the page's AudioContext the
// way motion owns the animation idiom and llm.js owns the Studio's only fetch.
//
// Three moments, chosen and auditioned by Max (2026-08-25, the audition page in
// experiments/): a paper tap on SELECT that climbs a four-rung ladder as the
// frame fills, his tuned ceramic cup on SOLVE, and a low woodblock pair on a
// MISTAKE. All synthesized live — zero asset files, zero dependencies (HR-1).
//
// The laws this module lives under:
//
//   - Sound can never cost a player the game. Every path no-ops when audio is
//     unavailable, refused by the platform, or muted; update() returns nothing,
//     so the render chain never waits on an audio node (motion.js learned the
//     hostage lesson with settled(); sound simply never hands over a promise).
//   - It READS state and decides nothing. There is no select outcome in the
//     engine, so select/deselect are derived from the selection delta between
//     renders — the same trick BoardView uses for the shake (wereSelected).
//   - The tutorial sounds like the game. Motion set that precedent: feedback is
//     not suppressed while teaching, and the first board a player hears is where
//     the settings door earns its discoverability.
//   - Mute and volume persist through Storage (asto.muted / asto.volume), never
//     raw localStorage — storage.js owns that seam.
//
// Known trade-off, accepted at build time: tile taps are click events and
// renders are queue-serialized, so a tap landing during an in-flight solve
// animation sounds late. Reconsider if it bothers Max in play.

// ---------------------------------------------------------------------------
// The parameter table — the one tuning dial, like --motion-slow.
//
// The cup carries Max's DIALS (body 0.30, damping 0.86), not numbers derived
// from them: the derivation lives in cupRecipe() below, ported verbatim from
// the audition page, so the settled dial positions stay the deliverable and a
// transcription slip is impossible.
// ---------------------------------------------------------------------------

export const SOUND = Object.freeze({
  /** Master gain at volume 100. Storage's DEFAULT_VOLUME (25) is the shipped level. */
  master: 1 / 100,

  /** Paper: a bandpassed noise tap. Unpitched, so the ladder moves its brightness. */
  select: Object.freeze({ freq: 2400, q: 1.4, dur: 0.05, gain: 0.3 }),

  /** The frame ladder: semitones per slot, scaled by amount. Max chose both. */
  ladder: Object.freeze({ steps: Object.freeze([0, 2, 4, 7]), amount: 0.55 }),

  /** The cup, as Max tuned it: "Body 30, Damping 86". */
  solve: Object.freeze({ body: 0.3, damping: 0.86 }),

  /**
   * Woodblock: two low strikes, a gentle "not that" — never a buzzer. Each
   * strike carries its own partials, exactly as audited: darker than the full
   * marimba set (one faint overtone, no ninth mode).
   */
  mistake: Object.freeze({
    strikes: Object.freeze([
      Object.freeze({
        freq: 233.08, dur: 0.26, gain: 0.3, delay: 0,
        partials: Object.freeze([Object.freeze([1, 1, 1]), Object.freeze([3.9, 0.1, 1])])
      }),
      Object.freeze({
        freq: 196.0, dur: 0.38, gain: 0.26, delay: 0.11,
        partials: Object.freeze([Object.freeze([1, 1, 1]), Object.freeze([3.9, 0.08, 1])])
      })
    ])
  })
});

// The outcomes that shake also thud — including already-tried, which is free of
// charge but shakes, and audio that contradicted the shake would read as a bug.
const MISTAKES = new Set(['miss', 'so-close', 'already-tried']);

// ---------------------------------------------------------------------------
// Pure — node-tested in test/sound.test.js.
// ---------------------------------------------------------------------------

/**
 * The cup's synthesis recipe at the table's dials, derived exactly as the
 * audition page derived it. Returns { root, partials, lowpass, tick, strikes }.
 */
export function cupRecipe({ body, damping } = SOUND.solve) {
  const d = damping;
  return {
    root: 1108 * (0.55 + body * 0.6),
    partials: [
      [1, 1, 1],
      [2.76 - d * 0.66, 0.42 - d * 0.24, 1 - d * 0.6],
      [5.4 - d * 1.8, 0.16 - d * 0.11, 1 - d * 0.75]
    ],
    lowpass: 9000 - d * 7000,
    tick: { freq: 4200 - d * 2400, q: 0.8, dur: 0.012, gain: 0.12 - d * 0.06 },
    strikes: [
      { ratio: 1, gain: 0.2, delay: 0, dur: 0.2 },
      { ratio: 1.335, gain: 0.19, delay: 0.1, dur: 0.24 },
      { ratio: 1.588, gain: 0.17, delay: 0.21, dur: 0.85 - d * 0.35 }
    ]
  };
}

/**
 * The pitch multiplier for the select that fills slot `count` (1-based: the
 * first tile of a frame is count 1, rung 0). Rises as the frame fills, resets
 * by construction when it empties — the rung is derived from the state, so
 * there is no ladder state to desynchronize.
 */
export function rungShift(count) {
  const { steps, amount } = SOUND.ladder;
  const slot = Math.min(Math.max(count, 1), steps.length) - 1;
  return Math.pow(2, (steps[slot] * amount) / 12);
}

/**
 * What just happened to the selection, judged purely from before/after.
 *
 * Any non-null outcome returns null: solves and failures clear or keep the
 * selection as a CONSEQUENCE, and the outcome channel owns those sounds. The
 * same-membership check (order ignored) makes drag-reorder, shuffle, and a
 * plain repaint silent without knowing which of them happened.
 */
export function classifyTransition(prevTerms, nextTerms, outcome) {
  if (outcome) return null;
  const prev = prevTerms ?? [];
  const next = nextTerms ?? [];

  if (next.length === prev.length) {
    const same = new Set(prev);
    return next.every((term) => same.has(term)) ? null : 'reset';
  }
  if (next.length === prev.length + 1) return 'select';
  if (next.length === prev.length - 1) return 'deselect';
  return 'reset';
}

/**
 * The whole moment→sound decision: given the previous snapshot and the current
 * render, what plays? Returns { kind: 'select'|'solve'|'mistake'|null, rung,
 * snapshot } — the caller stores the snapshot for next time. A board change
 * resyncs silently: crossing into a new puzzle is navigation, not play.
 */
export function cue(snapshot, state, outcome) {
  const next = {
    puzzleId: state.puzzle.id,
    terms: [...state.selectedTerms]
  };

  if (snapshot === null || snapshot.puzzleId !== next.puzzleId) {
    return { kind: null, rung: 1, snapshot: next };
  }
  if (outcome?.type === 'solved') return { kind: 'solve', rung: 1, snapshot: next };
  if (MISTAKES.has(outcome?.type)) return { kind: 'mistake', rung: 1, snapshot: next };

  const transition = classifyTransition(snapshot.terms, next.terms, outcome ?? null);
  if (transition === 'select') {
    return { kind: 'select', rung: rungShift(next.terms.length), snapshot: next };
  }
  // deselect and reset are silent (the audition's rule), and everything else —
  // hint, vocab, invalid, a bare repaint — plays nothing.
  return { kind: null, rung: 1, snapshot: next };
}

// ---------------------------------------------------------------------------
// Impure — the AudioContext and the players. Import-safe with no DOM or
// AudioContext present: every entry point checks before touching anything.
// ---------------------------------------------------------------------------

let storage = null;
let context = null;
let masterGain = null;
let muted = false;
let volume = 25;
let snapshot = null;
let unlockInstalled = false;

/**
 * Adopt the storage seam and reset all module state. app.js calls this once at
 * boot; tests call it again to start clean. Also installs a one-time
 * capture-phase pointerdown unlock: renders ride a microtask queue and can land
 * outside the gesture's transient-activation window, so the listener is what
 * reliably creates the context inside a real gesture.
 */
export function init(store) {
  storage = store ?? null;
  muted = storage?.isMuted() ?? false;
  volume = storage?.volume() ?? 25;
  snapshot = null;
  context = null;
  masterGain = null;

  if (!unlockInstalled && typeof globalThis.addEventListener === 'function') {
    unlockInstalled = true;
    globalThis.addEventListener('pointerdown', () => ensureContext(), { capture: true });
  }
}

/** Lazily create (or resume) the context. Null when the platform has no audio. */
function ensureContext() {
  const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!Ctor) return null;
  if (!context) {
    try {
      context = new Ctor();
      masterGain = context.createGain();
      masterGain.gain.value = volume * SOUND.master;
      masterGain.connect(context.destination);
    } catch {
      // A platform that throws on construction is a platform without sound.
      context = null;
      masterGain = null;
      return null;
    }
  }
  if (context.state === 'suspended') context.resume?.().catch?.(() => {});
  return context;
}

/**
 * The views-array hook — a read-only participant, first in the array. Returns
 * undefined ALWAYS: the render chain must never wait on audio.
 */
export function update(state, outcome) {
  const decision = cue(snapshot, state, outcome ?? null);
  snapshot = decision.snapshot;
  if (decision.kind === null || muted) return;

  const ac = ensureContext();
  if (!ac || ac.state !== 'running') return;

  try {
    const at = ac.currentTime + 0.005;
    if (decision.kind === 'select') playSelect(at, decision.rung);
    else if (decision.kind === 'solve') playSolve(at);
    else playMistake(at);
  } catch {
    // A synthesis failure is a skipped beat, never a broken game.
  }
}

export function isMuted() {
  return muted;
}

export function toggleMuted() {
  muted = !muted;
  storage?.setMuted(muted);
  return muted;
}

/** The settings slider, 0–100. Applied live so dragging is audible via preview(). */
export function setVolume(next) {
  volume = Math.min(100, Math.max(0, Math.round(Number(next) || 0)));
  storage?.setVolume(volume);
  if (masterGain) masterGain.gain.value = volume * SOUND.master;
}

export function getVolume() {
  return volume;
}

/** One select tap at rung 1 — what the settings slider plays so a level is audible. */
export function preview() {
  if (muted) return;
  const ac = ensureContext();
  if (!ac || ac.state !== 'running') return;
  try {
    playSelect(ac.currentTime + 0.005, 1);
  } catch {
    // Same rule as update(): a skipped preview breaks nothing.
  }
}

// --- synthesis, ported from the audition page ---

/** A struck body: additive partials, fast attack, exponential decay. */
function struck(at, { freq, partials, dur, gain, lowpass }) {
  let sink = masterGain;
  if (lowpass) {
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(lowpass, at);
    filter.Q.value = 0.7;
    filter.connect(masterGain);
    sink = filter;
  }
  for (const [ratio, amp, decayScale] of partials) {
    const osc = context.createOscillator();
    const env = context.createGain();
    const life = dur * decayScale;
    osc.frequency.setValueAtTime(freq * ratio, at);
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(Math.max(gain * amp, 0.0002), at + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, at + life);
    osc.connect(env).connect(sink);
    osc.start(at);
    osc.stop(at + life + 0.03);
  }
}

/** Filtered noise: the sound of a surface rather than a pitch. */
function noise(at, { freq, q, dur, gain }) {
  const length = Math.max(1, Math.ceil(context.sampleRate * dur));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;

  const source = context.createBufferSource();
  source.buffer = buffer;
  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(freq, at);
  filter.Q.value = q;
  const env = context.createGain();
  env.gain.setValueAtTime(gain, at);
  env.gain.exponentialRampToValueAtTime(0.0001, at + dur);

  source.connect(filter).connect(env).connect(masterGain);
  source.start(at);
  source.stop(at + dur);
}

function playSelect(at, rung) {
  const { freq, q, dur, gain } = SOUND.select;
  noise(at, { freq: freq * rung, q, dur, gain });
}

function playSolve(at) {
  const { root, partials, lowpass, tick, strikes } = cupRecipe();
  noise(at, tick);
  for (const strike of strikes) {
    struck(at + strike.delay, {
      freq: root * strike.ratio,
      partials,
      dur: strike.dur,
      gain: strike.gain,
      lowpass
    });
  }
}

function playMistake(at) {
  for (const strike of SOUND.mistake.strikes) {
    struck(at + strike.delay, {
      freq: strike.freq,
      partials: strike.partials,
      dur: strike.dur,
      gain: strike.gain
    });
  }
}

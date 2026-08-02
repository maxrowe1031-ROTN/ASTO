# CLAUDE.md

Operating instructions for Claude working in the **ASTO** game repo.

## What this is

ASTO is a cozy, mobile-first browser word puzzle — *"Connections, but with analogies."*
A 4×4 board of 16 word tiles hides four analogy sets (`A : B :: C : D`). This repo holds
**the game** and, under `studio/`, the **AI Puzzle Studio** — the internal authoring
pipeline that generates candidate boards for human editorial review. The Studio lives
here because it imports the game's validators directly (one schema, no drift); its
design is `docs/superpowers/specs/2026-08-02-asto-studio-design.md`. Course notes and
the retired Python crew stay in `../maigd-course-handbook`.

## Read these first

1. **`docs/design.md`** — the approved build plan: locked decisions, architecture, the
   5 phases and their gates. **This is the authority.**
2. **`docs/log.md`** — dev log, newest first. The latest `Next:` line is the live task.
3. **`docs/asto-gdd.html`** — the GDD (v0.13). The game spec, including its no-list.

## Locked decisions — do not change without asking

- **Canonical puzzle schema v1.0** — camelCase; `pairs` is the single source of truth
  (the 16 words are *derived*, there is no `words[]`); `explanation` + per-set `id`
  required; **no `tier` field** (derived from `difficulty` 1–4 → Green/Yellow/Red/Black);
  `date`/`baitTags` optional. Exactly 4 sets, one per difficulty.
- **Zero dependencies.** Vanilla HTML/CSS/JS ES modules, no build step, no framework.
  Tests use node's built-in `node:test`. Adding a dependency is a decision, not a detail.
- **Phased delivery.** Finish a phase's gate before starting the next.

## Architecture — the boundary law

Headless **PuzzleEngine** → read-only **views** → one thin **GameController** →
**PuzzleSource** seam.

- `src/engine/**` and `src/source/validate-puzzle.js` are **pure**: no DOM, no `fetch`,
  no globals, no `Math.random` without an injected RNG. They import nothing outside
  themselves.
- **Views never call engine mutators** and never decide rules — they render state and
  emit intents.
- **Only `game-controller.js` calls engine functions.** It owns no game state.
- The test that keeps this honest: **the game must run correctly with the view turned
  off** (headless playthroughs in `test/engine/game-flow.test.js`).

## Game rules that are easy to get wrong

- **Never sort a submission.** Order is the game — compare ordered, always.
- The four accepted orders derive from pairs at runtime: `[A,B,C,D] [C,D,A,B] [B,A,D,C]
  [D,C,B,A]`. Cross-pair (`A:C::B:D`) is **not** accepted.
- The **4th tap fills the frame without submitting**; Confirm submits.
- **"So close!"** (right four words, wrong order) **costs a mistake** and clears the
  selection — a deliberate playtest bet, tunable via `rules`, not a bug.
- **Repeating an identical failed submission is free** — same four words, same order →
  `already-tried` outcome, no mistake, selection clears (2026-08-01 playtest rule). The
  same words in a *different* order is a new claim and charges normally.
- Lose on the **4th** mistake. The loss screen reveals unsolved answers *with
  explanations*.
- Tiers are **revealed on solve**, never shown on the board.

## Working style

- **Verify before claiming.** Run `npm test`; check UI changes in the browser preview.
  Never report a phase gate as passed on unverified code.
- **The GDD's no-list is spec:** no confetti, no particles, no timers; mistake pips are
  coffee beans and **never red**; motion is 120–180ms ease-out.
- Prefer taps working everywhere — drag-to-reorder is *additive*; the game must be fully
  completable without it (iOS drag is fragile).
- Keep files focused. If a module grows past its one job, split it.
- Surface non-obvious decisions instead of quietly making them.

## Commands

- `/warmup` — start of session: orient, check phase + test status, propose work.
- `/wrapup` — end of session: verify, log to `docs/log.md`, commit, push, hand off.

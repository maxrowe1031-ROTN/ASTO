# Hint Button — one free hint reveals a set in its tier color

## Context

Max's idea (2026-08-11), refined in brainstorming: a Hint button that reveals
one random unsolved analogy set by **tinting its four tiles in the set's tier
color** (Green/Yellow/Red/Black), persistently, until the set is solved. Set
membership and tier are revealed; pair order is not — the assembly challenge
(`A : B :: C : D`) remains, which is ASTO's differentiator. The GDD reserves
"Hint system" as a Could-have (§14) and asks in §8.3 *"Should the game
eventually include a non-penalty hint system?"* — this answers that question
with a playtest bet, like "So close!" was.

**Decisions made with Max:**
- **Economy: free, one per game.** Non-penalty; beans untouched. Tunable.
- **Selection: pure random** among unsolved sets via the injected RNG.
  Accepted risk: can land on a set the player already knew.
  **Reconsider-when:** playtests show hints feeling wasted on easy sets —
  selection is one engine function, swap to a weighted draw then.
- **Reveal: persistent tier-color tint** (supersedes the earlier "memory-only
  flash" idea — Max preferred no memorization burden; also removes any
  reduced-motion information problem, since the tint is static).
- **Two sanctioned exceptions to locked/spec rules, Max-approved 2026-08-11,
  to be recorded in `docs/design.md`:**
  1. *"Tiers are revealed on solve, never shown on the board"* (GDD, CLAUDE.md
     §7) — the hinted set's tier shows early. Reasoning: a hint is the game
     deliberately helping, not free board neutrality; "these are the tricky
     ones" is part of the help. Rule intact for all other tiles and hintless
     games.
  2. Engine outcomes never leak set information (engine.js:105-110) — the
     hint's reveal lives in *state* (`hintedSetIds`), which views render.
- **Deferred, on the record:** whether a hinted win is marked on the results
  card. No stakes until sharing/streaks exist.

## Design

### Engine (`src/engine/engine.js`)
- `DEFAULT_RULES`: add `hintsAllowed: 1` (0 disables; `TUTORIAL_RULES` in
  `src/controller/tutorial-script.js` sets 0 — the tutorial scripts its own
  nudges per GDD §5.2).
- State: add `hintsUsed: 0` and `hintedSetIds: []` (array, so the
  `hintsAllowed` dial scales past 1 without a state change) in `initGame` /
  `freezeState`.
- New mutator `hint(state, rand) → { state, outcome }` mirroring `shuffle`'s
  contract: **throws `TypeError` if `rand` is not a function** (the enforced
  RNG seam); no-ops (`outcome: null`) when `status !== 'playing'` or
  `hintsUsed >= rules.hintsAllowed`. Picks uniformly from unsolved sets —
  same derivation `submit` uses:
  `state.puzzle.sets.filter((set) => !state.solvedSetIds.includes(set.id))`.
  New state: `hintsUsed + 1`, `hintedSetIds + [set.id]`.
- Outcome: `{ type: 'hint' }` — type only. The reveal itself is state, so the
  outcome-payload invariant stays almost untouched; the outcome just cues
  views to animate.

### Controller (`src/controller/game-controller.js`)
- New intent `hintPressed()`, modeled on `shufflePressed()` (the existing
  intent that consumes `this.rand`): call `hint(this.state, this.rand)`,
  replace state, `this.render(outcome)`. No game state in the controller.

### Views
- **`src/view/board-view.js`** — on every `update`, tiles whose term belongs
  to a set in `state.hintedSetIds` (and not yet solved) get a `hinted` class
  plus a tier class derived via `src/engine/tiers.js` (difficulty → tier).
  Because tint is derived from state each render, it survives shuffle,
  selection, and re-renders for free. On `outcome.type === 'hint'`, run a
  short entrance animation (see motion) — the tint itself must not depend on
  it. Keep a `wereHinted` one-frame memory (the existing `wereSelected`
  pattern at board-view.js) so the entrance runs once.
- **`styles/components.css`** — `.tile.hinted.tier-*` rules that **reuse the
  existing solved-card reveal styling verbatim**: same tier color tokens,
  same text-contrast pairings (Black → light text, Green/Yellow → dark). No
  new colors, no new tokens — the hint tint IS the reveal coloring, applied
  to tiles early (Max, 2026-08-11). Selected-state must remain visible on
  top of a tint (ink fill wins; verify visually).
- **`src/view/motion.js`** — small entrance for the tint (e.g. a `pulse` as
  the color arrives), existing motion language (EASE, `--motion-fast/slow`
  tokens, `settled()` race). Under `prefersReducedMotion()` it no-ops like
  every other helper — fine now, because the tint is static information.
- **`src/view/controls-view.js`** — add a Hint **outline pill** (ink fill
  stays reserved for Confirm, GDD §E.6) with an `onHint` callback wired in
  `src/app.js`. `update(state)` disables it when spent or `status !==
  'playing'`; render it only when `rules.hintsAllowed > 0` so the tutorial
  shows no dead button.
- **`src/view/status-view.js`** — `FEEDBACK` entry for `hint`, short and
  warm, e.g. "These four make one analogy — the order is yours to find."

### Review Studio (`studio/review/ui/play.js`)
- The Studio's play surface already constructs the **real** `GameController`
  and real views with default rules (play.js:22-28, 170), so `hintsAllowed: 1`
  and the tier-tint render arrive automatically. Wire the `onHint` callback
  into its `ControlsView` exactly as in `src/app.js` — that's the whole
  change. Max then playtests candidate boards with the same hint the shipped
  game has (one more proof the boundary law holds: one controller, one view
  set, two hosts).

### Tests (`test/engine/`, headless — the game must run with the view off)
- New `test/engine/hint.test.js`, seeded with `mulberry32` like
  `shuffle.test.js`: deterministic set choice under a seed; only unsolved
  sets are candidates; `hintsUsed` and `hintedSetIds` update; second hint
  no-ops at `hintsAllowed: 1`; `hintsAllowed: 0` no-ops; non-function `rand`
  throws; no-op when won/lost; outcome is type-only; hinted state survives
  `shuffle`; immutability (frozen state, input untouched).
- `submit.test.js`'s no-leak test stands unchanged.
- Extend `test/engine/game-flow.test.js`: a playthrough that hints mid-game,
  then solves the hinted set.
- Fixture: `test/fixtures/board.js` already has 4 sets with distinct
  difficulties — sufficient.

### Docs
- `docs/design.md`: dated entry — the hint bet (economy, random selection,
  tier-tint reveal), both sanctioned exceptions with reasoning and
  reconsider-when triggers, the deferred results-card question.
- Design doc: `docs/superpowers/specs/2026-08-11-hint-button-design.md`.
- `docs/log.md` entry via `/wrapup` when the gate passes. Note GDD v0.13
  drift (tiers-on-board rule now has one exception) — flag for Max's next
  GDD revision rather than editing his doc.

## What this deliberately does NOT touch
- **Puzzle schema v1.0** — locked; hints need nothing from it.
- No hint counter UI beyond the disabled pill, no per-set choice, no cost
  mechanics, no results-card marking (future `rules`/UI tuning if the
  playtest asks).

## Verification (the gate)
1. **Automated:** `npm test` — new hint suite + full suite green.
2. **Claude-verifiable:** in the preview browser (`?puzzle=first-light`):
   Hint pill present as outline pill; tap → four tiles of one set tint in
   their tier color with a small entrance; tint persists through shuffle and
   selection; pill disables after use; solving the hinted set settles
   normally into its card; no hint after game end; tutorial shows no Hint
   pill; beans untouched; contrast legible on all four tiers (check Black
   especially); reduced-motion still shows the tint. Then the same checks in
   the **Review Studio** play surface (`npm run studio:review`, play a
   candidate board): Hint pill present, tint renders, one per board.
3. **Max acceptance:** the playtest is the gate — does the tier reveal feel
   like drama or like a spoiler, does one-free feel fair, does the copy land.
   Tunables ready: `hintsAllowed`, tint styling.

Work branch: `work/hint-button`, merged to `main` by `/wrapup` only when the
gate passes.

---

## Addendum (2026-08-11, same day): the results cup marks a hinted board

The deferred results-card question was resolved the same day (design.md D-16
addendum): the select list's result cup gained a colour axis. **White cup with a
faint-ink outline = played clean (the new default, including all pre-hint
results); brown cup = a hint was used**, in both the steaming and spilled poses.
Pose owns won/lost; colour owns how. `hintsUsed` rides the stored result via
ResultsRecorder (additive, legacy-safe); the aria sentence gains "A hint was
used." Decided over inline palette mockups; Max swapped the poles from the first
sketch deliberately.

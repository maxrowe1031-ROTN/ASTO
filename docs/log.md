# ASTO — Dev Log

Append-only build history. Newest first. Written by `/wrapup`, read by `/warmup`.

## 2026-08-01 — Phase 3 complete: win/loss screens, share, and the motion pass

- **Built (new):** `src/view/end-view.js` (win + loss screens) · `src/view/motion.js`
  (flip, shake, settleIn, fadeOut, pulse, prefersReducedMotion) · `src/share.js`
  (pure `buildShareText` + `share()` with navigator.share → clipboard → selection
  fallback) · `test/share.test.js`. **Changed:** `index.html` (#screen-end),
  `styles/*` (end screens, REVEALED badge, paper grain, `.screen[hidden]`),
  board/frame/solved-sets views (motion), `game-controller.js` (async serialized
  render + `restart()`), `app.js` (ScreenRouter, share wiring). **No engine changes.**
- **Decisions made with Max:** Share = Connections-style tier-square grid, spoiler-free ·
  **no "Next puzzle" button** (depends on Phase 5 manifest/routing) — win screen offers
  **Play again** instead · **explanations shown on the win screen too**, not just the
  loss screen. That last one closes a GDD §17.3 open question ("how much explanation
  should solved sets reveal?") — propose upstream.
- **Verified:** `npm test` → **103 pass, 0 fail, exit 0** (8 new share tests, red-first);
  `check-board.js` exit 0. Manual gate in preview browser at 375×812 walked the **GDD §16
  checklist item by item** — all passed. Canonical beat confirmed by submitting
  `Fire|Spark|Tree|Seed` and watching the frame reorder to `Seed|Tree|Spark|Fire` before
  clearing. Loss screen shows all four sets, unsolved ones badged REVEALED, every card
  with its explanation. Share text verified spoiler-free (`ASTO — First Light / 4/4 ·
  no beans / ⬛🟩🟥🟨`, squares in solve order; unit-tested against all 16 board words).
  Play again fully resets. Reduced motion: full game playable, helpers return in 0ms.
  Desktop 1280px: no overflow. Zero console errors, all requests 200.
- **No-list audit:** grain on `button.tile` and `.solved-card` only (page background
  `none`); used bean = `rgb(92,70,51)` roast brown, never red; no `setInterval`, no rAF
  loops, no confetti, no particles. The only `setTimeout` is motion's liveness guard.
- **Three real bugs found at the gate, fixed and re-verified:**
  1. **`.screen[hidden]` did nothing** — `.screen { display: flex }` outranks the UA
     stylesheet's `[hidden] { display: none }`, so screens rendered stacked. **Latent
     since Phase 2** (the error screen had the same flaw, never exercised).
  2. **`Animation.finished` can never resolve** (it doesn't in the preview browser at
     all) — and view rendering had been chained onto it, so a stalled animation froze
     the whole game. Every helper now races a bounded timer AND cancels unfinished
     animations. **Motion can no longer hold the game hostage.**
  3. **`fill: 'backwards'` left staggered cards permanently invisible** if their
     animation never ran (backgrounded tab → empty win screen). Visibility is now
     restored in a `finally`, and pending animations are cancelled so they cannot pin an
     element at its first keyframe.
- **Playtest tuning (Max, on device):** motion slowed **20%**, then a further **30%** —
  `--motion-slow` 180 → 216 → **281ms**, `--motion-fast` 120 → **187ms**. On the second
  pass the two duplicated timing constants were **collapsed into one dial**: `motion.js`
  now reads `--motion-slow` from `tokens.css` at runtime and derives the card stagger
  from it, so JS animations and CSS transitions cannot drift. Verified by setting the
  token to 500ms and confirming a JS animation reported exactly 500.
- **Architecture note:** `render()` is now async and **serialized** — a queued pass reads
  `this.state` when it runs, so it always paints the latest truth. The solve sequence
  (frame beat → board close → card settle) falls out of **view order** in `app.js`, not
  timing code. Consequence: taps during a solve animation queue rather than drop. Max
  playtested and reported it feels fine; revisit if it ever reads as laggy.
- **Honest limitation:** the preview browser never advances its animation timeline, so
  **Claude verified motion logic but never watched it play.** All visual timing judgement
  came from Max on a real iPhone.
- **Phase status: Phase 3 gate MET** — §16 checklist passed, solve animation glitch-free,
  no-list held, playtested and approved by Max on device.
- **Docs drift to propose upstream (GDD is Max-owned):** motion is now 187–281ms vs
  Appendix E's stated 120–180ms (~56% longer) · §8 feedback table still lacks the
  `already-tried` row · §17.3's "how much explanation" question is now answered
  (both end screens) · Appendix A schema still pre-v1.0.
- **Next:**
  1. **Phase 4 — first-run tutorial:** `puzzles/tutorial.json` (ordinary schema-v1.0
     board, difficulty-1 set = Seed:Tree::Spark:Fire, same validator + integrity bar),
     `tutorial-script.js` (3 coach-marks: relationship-not-category · order matters ·
     what `::` means, advance conditions keyed to controller events),
     `tutorial-overlay.js`, pips hidden via a view flag, `storage.js` `tutorialSeen`
     + skip affordance. The engine's `maxMistakes: Infinity` no-lose rule is **already
     built and tested** since Phase 1 — no engine work needed.
  2. Phase 4 gate: fresh profile lands in tutorial, cannot lose, coach-marks fire
     correctly, completion routes to First Light, returning visitor skips.
  3. Still open: First Light `explanation` editorial pass (Red set weakest) · the §8.3
     watch-item on free so-close repeats · the handbook/GDD drift proposals above.

## 2026-08-01 — Live on GitHub Pages + first playtest rule: "already tried" is free

- **Shipped the game publicly (Max's call):** repo flipped to public, GitHub Pages
  enabled from `main` root. **Live at https://maxrowe1031-rotn.github.io/ASTO/** —
  every push to `main` auto-redeploys (~1 min). All fetches were already relative
  paths, so the `/ASTO/` subpath needed zero changes. Also reachable on LAN via
  `npm run serve` + `http://<mac-ip>:8080`.
- **First real-device playtest finding (iPhone, Max):** resubmitting the exact same
  wrong four-in-order cost a second bean for the same mistake. Felt unfair; Max
  specified the fix.
- **New engine rule — `already-tried`:** state gained `failedAttempts` (every charged
  miss/so-close records its exact ordered submission; `invalid` no-ops never recorded).
  Resubmitting one → outcome `already-tried`: **no mistake**, selection clears per
  `clearSelectionOnFail`, outcome carries only `type` (no hints, like so-close). Same
  four words in a *different* order = new claim, charges normally. Status copy:
  "Already tried that one." Shake animation for it arrives with Phase 3's motion pass.
- **Deliberate scope note:** so-close repeats are also free — same fairness principle,
  but it slightly softens the §8.3 so-close economy. Flagged to Max; two-line change
  if playtesting disagrees.
- **Verified:** 7 new red-first tests (repeat miss/so-close free · repeat clears
  selection · different order charges · history survives intervening solves · invalids
  unrecorded · no-hint payload) → **95 tests, 95 pass, exit 0**; check-board still
  clean (integrity sweep probes a fresh history per tuple — acceptance surface
  unchanged). Browser end-to-end: bean → free → free → different-order bean. **Max
  re-tested on the phone and confirmed.** 3 existing tests updated off the old
  repeats-charge assumption (they looped one identical miss to rack up mistakes).
- **Docs drift:** GDD §8 feedback table now lacks the `already-tried` row — propose
  upstream (GDD is Max-owned), alongside the standing Appendix A schema drift.
  CLAUDE.md's "rules easy to get wrong" updated in-repo. `docs/design.md` outcome list
  (`solved/so-close/miss`) now reads as pre-revision; deviation recorded here rather
  than editing the approved plan.
- Housekeeping: `.gitignore` added (`.DS_Store` — one snuck into a commit, removed).
- **Phase status: Phase 2 still the last gated phase, gate met.** This session was a
  playtest-driven rules revision + deployment, not a phase.
- **Next:**
  1. **Phase 3 — win/loss screens + motion polish** (unchanged from last entry):
     `end-view.js` (win: tier cards, Share, Next puzzle; loss: reveal with
     explanations), motion pass per Appendix E — FLIP solve→canonical→card, ±4px
     shake ×3 (now also for `already-tried`), `prefers-reduced-motion`, paper grain.
  2. Playtest watch-items for the §8.3 data: does free-repeat-of-so-close give too
     much away? Still open: First Light explanations editorial pass; handbook/GDD
     drift proposal.

## 2026-08-01 — Phase 2 complete: core play screen, playable in the browser

- **Built (all new):** `index.html` (play screen, fonts link, error screen) ·
  `styles/tokens.css` (Appendix E as CSS vars — palette, tier triples, type, motion) +
  `base.css` + `components.css` · `src/source/local-json-source.js` (fetch + validate at
  the boundary, injectable `fetchFn`) · six views in `src/view/` — header (bean pips),
  status strip, frame (honey-glow next slot, pointer-event drag), board (4×4, persistent
  keyed nodes), controls (Confirm-gated), solved cards ·
  `src/controller/game-controller.js` (the only engine caller) · `src/app.js` bootstrap ·
  `test/source/local-json-source.test.js` · `.claude/launch.json`. **No engine changes.**
- **Decisions made with Max:** Google Fonts `<link>` for Bree Serif/Nunito with full
  fallback stacks (network nicety, not a dependency; self-host later) · minimal status
  strip for won/lost in Phase 2 — real end screens are Phase 3's `end-view.js`.
- **Verified:**
  - `npm test` → **88 tests, 88 pass, exit 0** (82 engine/source + 6 new source tests,
    written red-first). `check-board.js` still exit 0.
  - **Manual gate, preview browser, mobile viewport 375×812 — every item passed:**
    full win (each set solved via a *different* accepted order; cards always display
    canonical) · full loss (4 roast-brown beans, board inert after) · so-close costs a
    bean + clears + leaks no set/tier · Clear free · Shuffle unsolved-only with selection
    kept · deselect compresses (board tap AND frame-slot tap) · 4th tap never submits ·
    Confirm gated at exactly 4 · drag-to-reorder commits (drag-fixed a cross-pair frame
    into canonical and solved with it) · taps alone complete the game · zero console
    errors, all requests 200 · desktop width sane.
  - Visual spec held: tiers hidden until solve, beans never red, ink fill on Confirm
    only, honey glow on next slot, flat cream page.
  - **Max playtested and approved** ("working great").
- **Two real view bugs found by the manual gate, fixed, re-verified:**
  1. **Drag-to-reorder never committed** — the dragged slot follows the pointer via
     `transform`, and `getBoundingClientRect()` includes transforms, so the drop
     hit-test always found the dragged slot itself and read the drop as "onto yourself."
     Fix: skip the dragged slot when hit-testing (`frame-view.js`).
  2. **`setPointerCapture` could kill slot taps** — if capture throws (released/synthetic
     pointer), pointerdown died before recording the tap. Now try/caught: capture is an
     optimization, not a dependency.
  Exactly the bug class engine tests can't see — the reason the gate is manual.
- **Deviations from `docs/design.md`:** none of substance. Added `status-view.js` beyond
  the listed views (the Phase 2 minimal end-state strip, agreed with Max);
  `select-view.js`/`end-view.js`/`tutorial-overlay.js` are later phases as planned.
- **Phase status: Phase 2 gate MET** — playable win and loss in mobile emulation with
  all rule behaviors correct, playtested by Max.
- **Still open:** the four First Light `explanation` strings await Max's editorial pass
  (Red set weakest) · handbook drift (GDD Appendix A / tech spec pre-v1.0) still to
  propose upstream.
- **Next:**
  1. **Phase 3 — win/loss screens + motion polish:** `end-view.js` (win: tier cards in
     order, Share, Next puzzle; loss: unsolved sets revealed in canonical order **with
     explanations**, REVEALED badges), motion pass per Appendix E (120–180ms ease-out,
     FLIP solve→canonical→card sequence, ±4px shake ×3, `prefers-reduced-motion`),
     paper grain (inline SVG feTurbulence data-URI, tiles/cards only).
  2. Phase 3 gate: GDD §16 acceptance for core loop + end states, solve animation
     glitch-free, no-list held. Real-iPhone check recommended at this gate (design.md
     risk 4: 100dvh, safe-area, touch-action are in place but untested on device).

## 2026-08-01 — Phase 1 complete: headless engine, validator, integrity, First Light

- **Built (all new):** `package.json` (zero deps, `type: module`) · `src/engine/`
  — `arrangements.js`, `rng.js`, `tiers.js`, `engine.js`, `board-integrity.js` ·
  `src/source/validate-puzzle.js` · `tools/check-board.js`, `tools/serve.js` ·
  `puzzles/first-light.json` · 10 `node:test` suites under `test/`. README rewritten
  (run instructions, boundary law, schema v1.0 example).
- **Built test-first** — each module's suite written and run red before its
  implementation existed.
- **Verified:**
  - `npm test` → **82 tests, 82 pass, 0 fail, exit 0.**
  - `node tools/check-board.js` → First Light clean: schema v1.0 valid,
    **16/16 accepted of 43,680 ordered tuples**, 80 near-miss orderings, exit 0.
  - **Negative check:** the GDD's own Appendix A board (old schema) fed to
    `check-board.js` → **10 distinct errors, exit 1**, each naming schema v1.0. The
    validator has actually failed on purpose, not just passed.
  - **Boundary law audited:** `src/engine/**` imports only its own siblings;
    `validate-puzzle.js` imports nothing. `grep` for `Math.random` / `document.` /
    `window.` / `fetch(` / `localStorage` across `src/` returns comments only.
  - No browser check — Phase 1 ships no UI by design.
- **Engine decisions made this session:**
  - `initGame` is **deterministic** (derived board order); the controller calls
    `shuffle(state, rand)` with an injected RNG, so randomness sits at exactly one seam.
  - `rules` gained two GDD §8.3 playtest seams alongside `maxMistakes`:
    **`soCloseCostsMistake`** and **`clearSelectionOnFail`**, both defaulting to shipped
    behaviour. Revisiting either is now config, not an engine edit. Both are tested.
  - `submit` returns `invalid` with a `reason` string (`not-playing` / `wrong-length` /
    `duplicate-terms` / `off-board`) — a true no-op charging no mistake.
  - The **`so-close` outcome carries only `{ type }`** — no `setId`, no order — so the
    view physically cannot leak which set or tier the player nearly had. Asserted by test.
  - State is frozen on every return; the **puzzle is referenced, never frozen** (freezing
    is a mutation of the caller's object). Both covered by `immutability.test.js`.
- **`board-integrity.js` — honest scope.** With four disjoint sets and no explicit
  `acceptedOrders`, a 43,680-tuple sweep is *structurally guaranteed* to find 16; it
  cannot discover an alternate solution the schema makes impossible. So it samples
  through the **real `engine.submit()`** rather than reimplementing the rules: if anyone
  ever sorts a submission or otherwise widens acceptance, the count balloons past 16 and
  every board in `puzzles/` fails on the next `npm test`. That is regression protection,
  **not** protection against a human-plausible wrong reading — only playtest eyes catch
  that (design.md risk 1). It also reports the **near-miss count** (80 for a clean
  board), a real authoring signal for the size of the "So close!" surface.
- **Deviations from `docs/design.md`** (none touch a locked decision):
  1. `test` script is `node --test "test/**/*.test.js"`, not bare `node --test` — node's
     default patterns would otherwise run `test/fixtures/board.js` as a test file. This
     needs **Node 22+**; `engines` and the README say so.
  2. `tools/serve.js` (~40 lines of `node:http`) instead of `npx http-server`, which
     would have quietly broken the zero-dependency promise. Unused until Phase 2.
  3. The validator also rejects a per-set **`notes`** field (present in the GDD's old
     sample) — schema v1.0 already has `explanation` for author commentary, and two
     fields for one job invites drift. Easy to drop if unwanted.
  4. Added `test/fixtures/board.js` — engine suites run against a fixture, not against
     shipped content, so a content edit can never break an engine test.
- **Phase status: Phase 1 gate MET** — `npm test` green including a headless full win
  and full loss played through engine imports alone (`test/engine/game-flow.test.js`),
  plus the `maxMistakes: Infinity` tutorial rule proven un-losable before any tutorial
  code exists. `check-board.js` passes First Light. No `index.html` — that was the point.
- **Needs Max's editorial pass:** the four `explanation` strings in
  `puzzles/first-light.json` are Claude-drafted in the voice of the design.md example.
  The Red set ("A nest is where a bird lives, the way a den is where a bear lives")
  restates its label rather than adding to it — weakest of the four.
- **Next:**
  1. **Playtest is the gate** — but Phase 1 has no UI, so the honest check is reading
     `test/engine/game-flow.test.js` and confirming the modelled loop is the game you
     want before it gets a face.
  2. Edit the four First Light `explanation` lines to taste.
  3. **Phase 2 — core play screen:** `index.html`, `styles/tokens.css` + `base.css` (GDD
     Appendix E palette, Bree Serif / Nunito with fallback stacks),
     `local-json-source.js`, the views (header + bean pips, 4×4 board, frame with
     honey-glow next slot, Confirm-gated controls, solved cards), `game-controller.js`,
     and drag-to-reorder via Pointer Events + `setPointerCapture` (never HTML5 DnD; taps
     alone must fully suffice). Views own persistent keyed DOM nodes per term — decided
     now because Phase 3's FLIP animations die under rebuild-from-state rendering.
  4. Still open from last session: the handbook touchpoint — GDD Appendix A and
     `asto-tech-spec.md` still describe the pre-v1.0 schema. This session's validator now
     rejects exactly that shape, which makes the mismatch louder. Propose, don't rewrite.

## 2026-08-01 — Repo seeded: approved build plan + GDD

- **Planned in the Development Brain** (`maigd-course-handbook`), executed here. No game
  code yet — this is the handoff commit.
- **Added:** `docs/design.md` (the approved 5-phase build plan) · `docs/asto-gdd.html`
  (GDD v0.13, standalone — rebuilt from source before copying) · `/warmup` + `/wrapup`
  commands in `.claude/commands/`.
- **Locked decisions** (need explicit OK to change): canonical **puzzle schema v1.0**
  (camelCase, pairs as single source of truth, no `words[]`, no `tier` — derived from
  `difficulty` 1–4) · **vanilla HTML/CSS/JS ES modules, zero dependencies, no build
  step**, tests via `node:test` · **phased to full MVP**, 5 gated phases.
- **Architecture:** headless PuzzleEngine → read-only views → thin GameController →
  PuzzleSource seam. Selection order lives in the engine (order decides so-close vs
  solved). Tutorial no-lose via a `maxMistakes: Infinity` rule — no engine fork.
- **Phase status: Phase 1 not started.**
- **Known drift to resolve upstream:** the handbook's GDD **Appendix A** and
  `asto-tech-spec.md` still describe the older schema (snake_case / `words[]` / `tier`).
  Schema v1.0 in `docs/design.md` supersedes them for this repo.
- **Next:**
  1. **Execute Phase 1** — headless engine + schema validator + `node:test` suite +
     `tools/check-board.js` + `puzzles/first-light.json`. Gate: all tests green including
     a headless full win and full loss played through engine imports alone; check-board
     passes First Light. No `index.html` yet — that's the point.
  2. Phase 2 (core play screen) only after the Phase 1 gate is met.

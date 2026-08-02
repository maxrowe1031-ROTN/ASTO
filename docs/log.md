# ASTO — Dev Log

Append-only build history. Newest first. Written by `/wrapup`, read by `/warmup`.

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

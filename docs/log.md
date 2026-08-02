# ASTO — Dev Log

Append-only build history. Newest first. Written by `/wrapup`, read by `/warmup`.

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

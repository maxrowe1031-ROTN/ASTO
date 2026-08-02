---
description: Session-start warmup — re-orients to the build plan, reads the dev log, checks phase/test status, and proposes what to do next.
---

You are starting a session in the **ASTO game repo**. Re-orient, show where the build
stands, and propose next steps. Keep it **tight and scannable** — headers + short
bullets.

## 1. Read the orientation docs
1. `docs/design.md` — the approved build plan: locked decisions (schema v1.0, zero-dep
   vanilla ESM, headless engine-first), the 5 phases and their gates. This is the
   authority; do not re-litigate locked decisions.
2. `docs/log.md` — the dev log (newest first). The latest entry's **"Next:"** line is
   what got carried forward.

## 2. Take stock of the actual state
```bash
git status -sb && git log --oneline -5
```
- If `package.json` exists, run `npm test` and report pass/fail counts.
- If `puzzles/` exists, list boards and run `node tools/check-board.js` on any that are
  new since the last log entry.

## 3. Refresher — restate the ground rules (a few lines)
- **Architecture:** headless PuzzleEngine (pure, no DOM) → read-only views → one thin
  GameController → PuzzleSource seam. *The game must run correctly with the view off.*
- **Boundary law:** engine + validate-puzzle import nothing outside themselves; views
  never call engine mutators; only the controller does.
- **Phases are gated:** finish the current phase's gate (tests green + manual checklist)
  before starting the next. Never skip ahead mid-phase.
- **The GDD is spec** — including its no-list (no confetti/particles/timers, beans never
  red). Local copy: `docs/asto-gdd.html`.

## 4. Status recap
Report: current phase + what's done vs. remaining in it, test suite status, and any
gate items outstanding. Flag drift between the code and `docs/design.md` if you see it.

## 5. Propose the session's work
From the log's "Next:" line + the current phase's remaining tasks, propose 2–4 concrete
tasks and confirm with the user before starting. If a phase gate was just passed,
remind the user a playtest is the gate — offer the preview browser.

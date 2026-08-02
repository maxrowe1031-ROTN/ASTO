---
description: Session-start warmup — re-orients to the build plan, reads the dev log, checks branch/phase/test status, surfaces open decisions and backlog, and proposes the session's work and its gate.
---

You are starting a session in the **ASTO game repo**. Re-orient, show where the build
stands, and propose next steps. Keep it **tight and scannable** — headers + short
bullets.

## 1. Read the orientation docs
1. `docs/design.md` — the approved build plan: locked decisions (schema v1.0, zero-dep
   vanilla ESM, headless engine-first), the 5 phases and their gates, and the **House-rule
   exceptions** section. This is the authority; do not re-litigate locked decisions.
2. `docs/log.md` — the dev log (newest first). The latest entry's **"Next:"** line is
   what got carried forward. If the last entry was a `/pause`, its resume point is the
   default starting place.

## 2. Take stock of the actual state
```bash
git status -sb && git branch --show-current && git log --oneline -5
```
- Note which branch you're on: `main`, or a `work/` branch with WIP on it. Uncommitted
  implementation work belongs on a work branch, not `main`.
- If `package.json` exists, run `npm test` and report pass/fail counts.
- If `puzzles/` exists, list boards and run `node tools/check-board.js` on any that are
  new since the last log entry.

## 3. Refresher — restate the ground rules (a few lines)
- **Architecture:** headless PuzzleEngine (pure, no DOM) → read-only views → one thin
  GameController → PuzzleSource seam. *The game must run correctly with the view off.*
- **Boundary law:** engine + validate-puzzle import nothing outside themselves; views
  never call engine mutators; only the controller does. In the Studio, `run-store.js` is
  the only writer of run artifacts and `llm.js` owns the only `fetch`.
- **Content is schema'd data, not code branches** — schema v1.0 is the contract the
  game, validators, and Studio all share.
- **Phases are gated:** finish the current phase's gate before starting the next. Never
  skip ahead mid-phase.
- **The GDD is spec** — including its no-list (no confetti/particles/timers, beans never
  red). Local copy: `docs/asto-gdd.html`.

## 4. Open decisions and backlog
- List open tickets in `docs/decisions/` that affect the current phase.
- Surface `docs/backlog.md` items **without building any** — they enter work only when
  Max pulls them into the plan.

## 5. Brain check (when it applies)
If this session starts a new phase, or a significant design decision is on the table,
consult the `brain-lookup` agent before proposing the work. Skip it for ordinary
mid-phase implementation sessions. If the Brain is unavailable, say so — never pretend
the consultation happened.

## 6. Status recap
Report: current phase + what's done vs. remaining in it, test suite status, branch
state, and any gate items outstanding. Flag drift between the code and `docs/design.md`
if you see it.

## 7. Propose the session's work
From the log's "Next:" line + the current phase's remaining tasks, propose 2–4 concrete
tasks, name the **gate that would make this session complete** and its kind (automated /
Claude-verifiable / Max acceptance), and confirm with Max before starting. If a phase
gate was just passed, remind him a playtest is the gate — offer the preview browser.

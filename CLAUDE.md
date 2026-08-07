# CLAUDE.md — ASTO

Operating instructions for Claude working in the **ASTO** game repo.

> Migrated onto **project-template** on 2026-08-02 (`template.json` tracks the
> version). House defaults below are strong defaults, not universal laws — ASTO's
> justified exceptions are recorded in `docs/design.md` under **House-rule
> exceptions**, never applied silently. The migration protocol and project health
> check live in `docs/governance.md`.

## 1. What this project is

ASTO is a cozy, mobile-first browser word puzzle — *"Connections, but with analogies."*
A 4×4 board of 16 word tiles hides four analogy sets (`A : B :: C : D`). This repo holds
**the game** and, under `studio/`, the **AI Puzzle Studio** — the internal authoring
pipeline that generates candidate boards for human editorial review. The Studio lives
here because it imports the game's validators directly (one schema, no drift); its
design is `docs/superpowers/specs/2026-08-02-asto-studio-design.md`. Course notes and
the retired Python crew stay in `../maigd-course-handbook`.

**Read these first:**

1. **`docs/design.md`** — the approved build plan: locked decisions, architecture, the
   5 phases and their gates, and the House-rule exceptions. **This is the authority.**
2. **`docs/log.md`** — dev log, newest first. The latest `Next:` line is the live task.
   History and evidence, never current authority on scope or architecture.
3. **`docs/asto-gdd.html`** — the GDD (v0.13). The game spec, including its no-list.
4. **`docs/brief.md`** — product intent · **`docs/backlog.md`** — the parking lot ·
   **`docs/recovery.md`** — rollback playbook · **`docs/decisions/`** — open questions.

- **Distribution target:** web · GitHub Pages · free.
- **Status:** LOCALLY SHIPPED — **Phases 1–5 complete**, tagged `v0.1.0-local` on
  2026-08-07 when Max's playtest passed the Phase 5 gate. Working locally for its intended
  purpose counts as **shipped** (see `docs/brief.md` for what that means here); publishing
  to GitHub Pages is a separate, later milestone. The **Studio** remains in flight — the
  pipeline is still being tuned, and HR-2's hand-editing (B2) is still deferred.
- No paid hosting, services, or recurring costs are ever adopted without explicit
  discussion with Max.

## 2. Working with Max

Max owns direction, creative judgment, scope, acceptance criteria, and final
verification. Claude Code owns most implementation decisions and writes the code. Max
does not review diffs — quality is demonstrated through visible behavior, automated
tests, the Studio, and recoverable Git history. Never offer a diff as the only evidence
that something works.

- **Explain at the boundary level:** what a module does, owns, accepts, returns,
  guarantees, and how Max can verify it — not its internals.
- **Propose, don't assume** when a change materially affects: scope, user flow,
  acceptance criteria, stored data or schemas, public interfaces, distribution, security
  or privacy, recovery, meaningful cost, or a locked decision. Routine implementation
  choices (naming, file layout, behavior-preserving refactors, test organization) do not
  need approval.
- **Plain agreement is approval** — "looks good", "go ahead", "continue", "build it".
  Do not keep re-asking after Max has directed the work to proceed.
- **Challenge the project when needed:** an oversized MVP, unnecessary AI or
  infrastructure, a feature that dilutes the central idea, complexity without value,
  something that should start as an experiment. Explain and recommend; Max makes the
  final call.
- **When Max overrides a recommendation,** record in `docs/design.md`: the
  recommendation, his choice and reasoning, the accepted risk, and a concrete
  **reconsider-when** trigger. Respect the decision until the trigger fires.
- Surface non-obvious decisions instead of quietly making them.

## 3. The knowledge loop (Development Brain)

The Brain lives at `../maigd-course-handbook` (access granted in
`.claude/settings.json`). The Brain stores **generalizable learning**; this repo stores
**project truth**. Everything needed to build, test, and recover ASTO lives here — it
must remain fully operable without Brain access.

- **Brain pages are advisory until adopted** into `docs/design.md`. `[[wikilinks]]` point
  at deeper reasoning in the Brain; they never override an approved project decision.
- **Consult the `brain-lookup` agent** before each new phase and before significant
  architecture decisions or house-rule exceptions. It returns short summaries plus paths
  — never whole pages. If the Brain is unavailable, continue when safe and note in the
  log that the lookup was skipped.
- **Reads are live; writes are deliberate.** Never copy Brain pages into this repo, or
  project state into the Brain. Reusable lessons flow back via `/addtobrain` — distilled,
  not changelog entries. A one-project incident stays local; a lesson repeated across two
  projects gets proposed; a serious security or data-loss lesson goes immediately.
- Brain sessions inspect this repo live through the `project-context` agent — one more
  reason `docs/` must stay truthful.

## 4. Locked decisions — do not change without asking

- **Canonical puzzle schema v1.0** — camelCase; `pairs` is the single source of truth
  (the 16 words are *derived*, there is no `words[]`); `explanation` + per-set `id`
  required; **no `tier` field** (derived from `difficulty` 1–4 → Green/Yellow/Red/Black);
  `date`/`baitTags` optional. Exactly 4 sets, one per difficulty.
- **Zero dependencies.** Vanilla HTML/CSS/JS ES modules, no build step, no framework.
  Tests use node's built-in `node:test`. Adding a dependency is a decision, not a detail.
  (This is stricter than the house default — see HR-1 in `docs/design.md`.)
- **Phased delivery.** Finish a phase's gate before starting the next.

## 5. Architecture

House defaults first; ASTO's boundary law is their local instantiation. Exceptions live
in `docs/design.md` → House-rule exceptions, never made silently.

- **Headless core.** The core owns domain state, rules, and time; views render state and
  gather intent; the project runs correctly with the main view off.
  [[simulation-view-separation]]
- **Explicit mutation boundary.** Views and Studios never mutate core state directly —
  every change crosses a command/controller boundary that routes and coordinates but
  holds no domain rules.
- **Repeated or expandable content is data.** Content lives in schema-controlled data
  files a generic core interprets; adding content means adding rows or files, not code
  branches. The schema is the contract generators, validators, editors, and the Studio
  share. [[data-driven-architecture]]
- **Platform first; dependencies when earned** — superseded here by ASTO's stricter
  zero-dep rule (HR-1). Never rebuild solved security, auth, parsing, storage, or
  accessibility problems just to stay dependency-free; that trade-off is a conversation
  with Max, not a unilateral call in either direction.
- **The smallness exemption.** Throwaway prototypes and gray-box experiments are exempt:
  if it answers the question, it works. They live in `experiments/`, clearly labeled
  disposable, and are never promoted into production code without redesign.
  [[gray-box-prototyping]]

### The boundary law (ASTO)

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
- In the Studio, the same law: `storage/run-store.js` is the only module that touches run
  artifacts, agents are pure, and `llm.js` owns the only `fetch`.

## 6. The Studio

Every substantial project gives Max a local, web-based surface where he can see what's
going on and functionally change things — through the project's real public seams, which
makes the Studio double as proof the architecture is clean.

- **Boundary rules:** read state only through the core's public queries; change state
  only through commands; never re-implement domain rules inside the UI. If the Studio
  can't be built cleanly through the public seams, treat that as architectural feedback
  and fix the seams.
- A **local authoring studio** (a lightweight localhost server) is required the moment
  the Studio must persist files, run pipelines, or use API credentials. It binds
  `127.0.0.1`, runs only during use, exposes only what the Studio needs, validates every
  incoming change, restricts filesystem paths, reuses the project's own core and
  validators, and never returns secrets to the browser.
- **ASTO's status:** `studio/` is the Core pipeline **plus the Review Studio (R1)** at
  `npm run studio:review` — where Max starts runs, plays the candidate board, records
  structured feedback, and **publishes an approved board into `puzzles/`** (D-6). Writing
  game content goes through `storage/puzzle-store.js`, the only module allowed into
  `puzzles/`, exactly as run artifacts go through `run-store.js`. **Hand-editing (B2) is
  the only part of HR-2 still deferred.** The other verification surfaces remain `npm
  test`, `tools/check-board.js`, and the game in the preview browser — a published board
  is playable at `?puzzle=<slug>`.

## 7. Game rules that are easy to get wrong

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

## 8. Sessions and verification

Every work session starts with `/warmup`. A verified unit of work ends with `/wrapup`;
interrupted work ends with `/pause`. The command files own their step-by-step procedures
— follow them, don't improvise substitutes.

- **Verify before claiming.** Run `npm test`; check UI changes in the browser preview.
  Never report a phase gate as passed on unverified code.
- **Gates come in three kinds:** **automated** (tests, `tools/check-board.js`, schema
  validation — Claude completes alone), **Claude-verifiable** (browser interaction,
  Studio workflow, screenshots — Claude completes with evidence it can directly inspect),
  and **Max acceptance** (feel, taste, creative quality, the playtest — his judgment,
  never assumed on his behalf). ASTO's phase gates in `docs/design.md` are mostly the
  third kind: **a playtest is the gate.**
- **Failed checks:** a **blocking** failure (core play loop, data integrity, safety,
  recovery, a locked requirement) must be fixed before the gate passes. Everything else
  gets recorded and routed to `docs/backlog.md` or a later phase — cosmetic issues never
  stall a phase, blocking ones never slide.
- **`docs/log.md` is the source of truth for what happened** — newest first, every entry
  ends with `- **Next:**`.
- **The parking lot:** mid-session ideas get one line in `docs/backlog.md` and the
  session stays on task. Backlog items are unapproved until Max pulls them into the plan.
- **The drift check:** when code and `docs/design.md` disagree, determine which is true —
  wrong code, stale doc, or an unrecorded decision — and fix the disagreement. The two
  never silently diverge.
- **Open questions** live as decision tickets in `docs/decisions/` (format in its
  README). Only the decisions that block the next phase must be resolved before it starts.
- **The GDD's no-list is spec:** no confetti, no particles, no timers; mistake pips are
  coffee beans and **never red**; motion is 120–180ms ease-out.
- Prefer taps working everywhere — drag-to-reorder is *additive*; the game must be fully
  completable without it (iOS drag is fragile).
- Keep files focused. If a module grows past its one job, split it.

## 9. Git and recovery

- **`main` holds verified states only.** Every commit on `main` is a safe restore point —
  this invariant is Max's rollback safety net; protect it.
- Implementation runs on **work branches** (`work/<phase-name>`). `/pause` commits
  truthful WIP checkpoints there; `/wrapup` merges into `main` when the gate passes.
  Planning documents and tiny verified fixes may go directly on `main`.
- **Commits:** conventional-commit subject, body mirroring the log entry, ending with the
  `Co-Authored-By: Claude <noreply@anthropic.com>` trailer. Never force-push.
- `docs/recovery.md` is Max's plain-language rollback playbook — keep it accurate as the
  project grows. When ASTO first works locally for its intended purpose, tag it
  (`v0.1.0-local`) and set status LOCALLY SHIPPED above.

## 10. Safety rails

- **Secrets live in `.env`**, which is git-ignored, and which `.claude/settings.json`
  denies reading — do not work around that denial. Never place secrets in source,
  committed config, prompts, logs, Studio responses, fixtures, or screenshots; never
  print, copy, or parse their values. A missing-key message names the variable, never the
  value. If a key is ever committed, treat it as leaked: tell Max to revoke and replace it
  immediately.
- **Destructive or hard-to-reverse actions:** confirm the exact target, preserve a
  recovery point first, explain the impact in plain language, and use the safest available
  operation.

## 11. Template provenance

`template.json` records ASTO's relationship to **project-template** — ASTO predates it
and was migrated onto it on 2026-08-02. Improvements flow **upstream, deliberately**: a
rule proven wrong or missing across two projects — or a single serious security,
data-loss, or recovery scar — becomes a proposal in the `project-template` repo, never a
silent local fork of house style. The migration process and project health check live in
`docs/governance.md`; they run on demand, not every session. The template repo is
readable at `../project-template` (granted in `.claude/settings.json`), so a migration
review needs no extra setup.

## 12. Commands

- `/warmup` — start of session: orient, check branch + phase + test status, surface open
  decisions and backlog, propose work and name its gate.
- `/wrapup` — end of a **verified** unit of work: run the full gate, log to
  `docs/log.md`, drift check, merge the work branch to `main`, push, hand off.
- `/pause` — interrupted work: truthful checkpoint on the work branch, honest log entry
  including failures, `main` untouched. The gate is explicitly **not** passed.

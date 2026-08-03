# Backlog — ASTO

> The parking lot. One line per idea. Nothing here is approved — items enter
> work only when Max pulls them into `design.md`'s plan. Mid-session ideas
> land here so the session stays on task.

- `current-attempt.json` at the run root is in the Studio spec's run-directory contract
  but has never been built (A1 or A3); `manifest.currentAttemptId` serves the purpose.
  Decide whether to build it or amend the spec.
- ~~Studio A3 surfaced that the `04a` gate can only reject on schema, not on board quality.~~
  **Resolved 2026-08-03:** the gate now enforces ≥4 distinct relationship labels — see
  design.md risk 1. Whether *further* quality checks belong there is still open.
- ~~The Studio's per-stage `effort` levels are a first guess.~~ **Partly done 2026-08-03:**
  02 and 04 re-aimed from measurement; every attempt now records its `effortProfile` so the
  review corpus can judge quality against it. Remaining levers, unapplied: `01-pair-author`
  (now 44% of a run, and 4.5× variance across three runs at identical settings),
  `07-test-player`, and 05–08 concurrency.
- Stages 05–08 are four independent evaluators of a finished board (verified: none reads
  another's output) run sequentially. Making them concurrent is free wall-clock — ~20s of
  ~250s — but puts concurrent writers through `run-store`'s lock. Deferred so it does not
  confound the effort measurement.
- ~~The difficulty rater has never returned a 4.~~ **Addressed 2026-08-03 (design.md D-1):**
  the builder now promotes its hardest set to Black and the Studio shows it. The underlying
  question — should the Pair Author be asked for a hard set in the first place? — is still
  open, and D-1's reconsider-when trigger is where it gets revisited.
- The Review Studio shows only "running" for the whole of a multi-minute stage. Per-stage
  progress would make a slow `xhigh` call distinguishable from a wedged one.
- A long-running Review Studio server holds the pipeline config it started with, so a code
  fix does not reach a running server. Cost ~$0.23 once. Consider surfacing the loaded
  `pricingVersion`/config in the UI, or having the server exit on a config file change.
- `budget.js` cost caps only bite once every model in play is priced. Rates are estimates
  until A5 measures real spend; unpriced models are surfaced in `usage.unpricedModels`.
- Studio run artifacts accumulate under the git-ignored `studio/runs/`; no pruning yet.
- R1 has no un-approve: `approved → archived` only. Fine for the rubric loop (a new run
  is cheap), but revisit if Max changes his mind about a board mid-loop.
- R1 binds `127.0.0.1`, so the Studio is not reachable from the iPhone Max playtests on.
  Deliberate — it starts runs and spends credit. Revisit only with auth, never a flag flip.
- The Review Studio adds two endpoints beyond the spec's list (`POST /api/runs/:id`
  resume, `POST /api/runs/:id/feedback`); fold them into the spec or drop them at B2.
- `run.js` and the Studio can drive the same run concurrently; the lock protects the
  files but the UX is confusing. Documented as "one driver at a time" — consider enforcing.

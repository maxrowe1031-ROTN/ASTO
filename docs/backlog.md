# Backlog — ASTO

> The parking lot. One line per idea. Nothing here is approved — items enter
> work only when Max pulls them into `design.md`'s plan. Mid-session ideas
> land here so the session stays on task.

- `current-attempt.json` at the run root is in the Studio spec's run-directory contract
  but has never been built (A1 or A3); `manifest.currentAttemptId` serves the purpose.
  Decide whether to build it or amend the spec.
- Studio A3 surfaced that the `04a` gate can only reject on schema, not on board quality
  (see design.md risk 1). Consider whether A5 should add a mechanical check that *can*
  fail a schema-valid board, or whether that stays entirely with stage 06 and Max.
- `budget.js` cost caps only bite once every model in play is priced. Rates are estimates
  until A5 measures real spend; unpriced models are surfaced in `usage.unpricedModels`.
- Studio run artifacts accumulate under the git-ignored `studio/runs/`; no pruning yet.

# Backlog — ASTO

> The parking lot. One line per idea. Nothing here is approved — items enter
> work only when Max pulls them into `design.md`'s plan. Mid-session ideas
> land here so the session stays on task.

- `current-attempt.json` at the run root is in the Studio spec's run-directory contract
  but has never been built (A1 or A3); `manifest.currentAttemptId` serves the purpose.
  Decide whether to build it or amend the spec.
- **The relationship monoculture, and the map for fixing it** (2026-08-04 brainstorm, Max +
  Claude). ~80% of all pairs ever authored are causal/"becomes"; the established
  Bejar/Chaffin/Embretson taxonomy (10 families, 79 relation types, built at ETS for GRE
  analogies) is preserved with paradigms in `docs/research/semeval-2012-taxonomy.md`. Open
  threads, none approved: reword rule-007 ("directional and transformative" literally forbids
  3 of First Light's 4 sets) · make the `shape` field a controlled vocabulary (48 free-text
  strings for a 13-shape list; 40% of pairs uncountable by the variety brief) · candidate
  design rule "theme unifies the words, classifications diversify the questions" — being
  playtested via `experiments/four-family-board/` before any pipeline change · the larger
  relationship-first generation reorder stays parked until that playtest answers.
- Two of the seventeen quick tags have still never been reached for: `valid-but-unfair` and
  `order-ambiguous`. `repetitive-shape` was the third until 2026-08-04, when Max used it on
  the basketball board — so silence is weak evidence of a wrong tag. Leave both; revisit at
  the ~30-board rubric compilation.
- ~~Studio A3 surfaced that the `04a` gate can only reject on schema, not on board quality.~~
  **Resolved 2026-08-03:** the gate now enforces ≥4 distinct relationship labels — see
  design.md risk 1. Whether *further* quality checks belong there is still open.
- ~~The Studio's per-stage `effort` levels are a first guess.~~ **Done 2026-08-04:** 01, 02
  and 04 all re-aimed from measurement (profile `2026-08-03-lean-2`); a run is now ~$0.21–0.27
  against a $0.542 baseline. Remaining levers, unapplied and low-value: `07-test-player`
  (already medium, $0.02–0.05 a run) and 05–08 concurrency.
- **The difficulty rater can abstain the pool below four, and nothing checks it.** Surfaced by
  Max's `cars` run, 2026-08-04: the grouper returned enough sets, the rater abstained on two
  for "relationship-grain inconsistencies", and the builder refused with three. Stage 02 has a
  four-set floor; stage 03 does not, so the shortfall is only discovered at the 04a gate where
  a retry can only re-roll. Same family as the two failures fixed on 2026-08-03/04 — a
  constraint enforced at one stage and not the next one downstream.
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
- ~~A long-running Review Studio server holds the pipeline config it started with, so a code
  fix does not reach a running server.~~ **Partly done 2026-08-04:** `GET /api/config` reports
  the config the *runner holds* and the run list shows it, so a stale server is visible at a
  glance. Still manual — the server does not exit on a config change, and a restart is still
  the fix. Revisit only if the visible line proves insufficient.
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

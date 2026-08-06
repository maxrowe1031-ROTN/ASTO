# Backlog — ASTO

> The parking lot. One line per idea. Nothing here is approved — items enter
> work only when Max pulls them into `design.md`'s plan. Mid-session ideas
> land here so the session stays on task.

- ~~**`valid-but-unfair` is three tags wearing one name.**~~ **Split 2026-08-05 with Max — see
  design.md D-7.** `second-valid-reading` added for the meaning that had no chip; the other two
  went back to `not-always-true` and `not-evocative`, which already covered them. The old tag is
  retired from the form and valid forever. What remains: **the nine historical events carrying
  it cannot be re-sorted automatically** — their meaning is only in the prose, so a rubric
  compiled across the version boundary has to read those by hand or exclude them.
- **The difficulty-source fallback classifier is weak (design.md D-8).** For boards graded
  before 03 reported `difficultySource`, the variety index guesses from the shape — and
  replayed against Max's verdicts it caught all four boards he loved but only 2 of the 5 he
  found flat. `coronagraph : glare` is `prevention` and `perihelion : orbit` is `sequence`;
  a shape id cannot see that the words are rare. Harmless while 03's own judgement is
  primary, but any analysis over historical boards must not trust it.
- **If a fresh batch still tops out the same way every time, the lever is the stance quota.**
  `inclusion` has been quota'd on every run ever and is where all three nameable shapes live
  (`taxonomic`, `class-individual`, `synonymity`), which is why 8 of the 9 boards before
  2026-08-05 carried exactly one naming set. Loosening that quota is the bigger, more
  invasive move held in reserve behind D-8's steer.
- **07's `knowledgeGated` has never fired on a real board.** It returned `[]` on the mock,
  honestly — First Light's words are all ordinary. Its first real test is the next batch,
  and its precision is unmeasured until then.
- **The cross-reading check's semantic question needs a third attempt (design.md D-7).** The
  enumerator and plumbing are sound; the model's answer is not. Round 2 flagged any tidy 2×2
  grid as an analogy (13 spurious across six boards); round 3's anti-grid wording over-corrected
  into near-silence (0 of 3 caught). Worth trying: ask it to name each half's relation as a
  separate output field rather than folding both into one boolean, so the reasoning is visible
  and scoreable rather than hidden behind a yes/no.
- **The cross-reading check's gate-promotion trigger (design.md D-7).** It reports and does not
  block. If it agrees with Max's `valid-but-unfair` / `order-ambiguous` calls across roughly the
  next six boards, promote it to a blocking check at `04a`. If it disagrees, the question it
  asks needs sharpening before it is trusted with a veto.
- **Stage 05 flags almost exactly two sets per board.** Across 36 attempts the distribution is
  0/1/2/3 fails at 5/10/19/2 — 2 is the mode at 53%, and it was 2 on every board of the
  2026-08-05 batch. `boardPasses` is therefore false on 31 of 36 attempts (86%) and agrees with
  Max on 54% of sets. Its prose is often excellent and its verdict carries almost no
  information; worth asking whether the stage should return severities rather than a boolean.
- **The evocativeness verdict has no answer key yet.** It is shown, never enforced, and nothing
  measures whether it agrees with Max's `not-evocative` tag. At ~6 judged boards, compare — it
  is the same graduation question the cross-reading check has.
- **Un-publishing has no route.** Removing a published board is `git revert` plus deleting the
  file — deliberate (reversibility for generated artifacts is version control, not
  application-level undo), but if boards start being pulled often, the Studio should say so
  rather than leaving Max to the filesystem.
- **The three older approved boards** (`music`, `weather`, `history`) predate the taxonomy work
  and the v1 feedback form. They are approved but deliberately unpublished, pending a re-read.
  Publishing them is what takes `puzzles/` from six boards to nine against Phase 5's 10+.
- **`puzzles/index.json` is a reserved name** — `check-board.js` skips it and `puzzle-store`
  refuses to list it, both anticipating Phase 5's manifest. Nothing writes it yet.
- `current-attempt.json` at the run root is in the Studio spec's run-directory contract
  but has never been built (A1 or A3); `manifest.currentAttemptId` serves the purpose.
  Decide whether to build it or amend the spec.
- ~~**The relationship monoculture, and the map for fixing it.**~~ **Built 2026-08-04 — see
  design.md D-3 and its amendment.** rule-007 eliminated (retired, not deleted) · the
  controlled vocabulary landed (36 types, family + stance + paradigm + failure mode) · stance
  composition enforced at brief, author, grouper and gate · unity scored by 08 and shown,
  never gating. What remains is D-3 item 4: **real runs, judged by Max in the review loop** —
  the machine's arrowless sets have never been seen.
- Still parked: **relationship-first generation** (the 01+02 set-first merge), now behind a
  **named trigger** (design.md D-3 amendment §6): if the grouper's stance floor fires on most
  runs after the vocabulary lands, the merge is the pre-agreed fix — it also deletes the stage
  where three of the pipeline's recent failures lived. Revisit when the trigger fires or at
  the slim-down lap, whichever first.
- **The kitchen-board limit** (pinned as a KNOWN LIMIT test in stance-composition.test.js):
  stance is a per-shape proxy for the felt arrow and word choice can defeat it — round 1's
  kitchen board declares four stances yet played as one. If Max repeatedly rejects
  stance-diverse boards as "all the same", the proxy needs word-level teeth.
- **Stage 02's headroom, and the transport that really binds it.** At medium with the
  vocabulary in its prompt, 02 returned 13,645 tokens — 85% of the 16k `maxTokens` ceiling
  (2026-08-05 beach retry; n=1, and the stage has documented 4.5× variance). The cheap lever if
  it truncates again is cutting its work: 02 is shown all 36 vocabulary entries although its
  candidate pairs already carry declared shapes. A bigger ceiling is *not* the lever —
  `llm.js` is non-streaming with a 300s timeout, and at ~13.6k tokens per 129s a 24k ceiling
  lands on that timeout. If a stage ever legitimately needs more thinking than 300s buys, the
  answer is streaming.
- **Runs created to test the machinery are slugged `verify-…` and gitignored whole.** On
  2026-08-05 four UI-verification runs were swept into the corpus by `git add -A`, carrying
  feedback Claude had typed to drive the form; they were removed the same session. `brief.mock`
  cannot be the filter — the design experiments and the harbor fixture are mock runs carrying
  Max's real judgement — so the separator is intent, expressed in the slug.
- **Rubric compilation must read version-1 set events by their TAGS, not their action.** Under
  the pre-2026-08-05 form a set inherited the board button, so 21 of 79 tagged set-events say
  `reject-set` while carrying only praise. Events from `formVersion` 2 onward carry their own
  per-set verdict and can be read directly. Guarded by a test in `schemas.feedback.test.js`.
- **The Revision Proposer's graduation trigger:** at ~10 briefs with `proposal-verdict` events
  recorded (accepted / edited+diff / discarded), evaluate agreement. If Max accepts briefs
  substantially unedited, propose the bounded auto-revise loop — his stated aspiration, gated
  on evidence rather than on enthusiasm (design.md D-5).
- **The shakedown slim-down lap** (~10 judged boards under `2026-08-04-taxonomy-shakedown`):
  re-run the lean-2 measurement pass — per-stage cost + thinking share against review verdicts
  — then re-aim effort, revisit 03/08's Sonnet upgrade, and revert the raised budget ceilings
  (stage 15min/600k · attempt $20 · run $60) together with the effort map.
- The hand-made experiment boards are mock runs, so they are correctly excluded from the
  variety index — but their feedback **is** in the corpus. When `rubric.md` is compiled,
  separate judgements about *hand-made design experiments* from judgements about *pipeline
  output*; conflating them would credit the pipeline with boards it did not build.
  **Now also relevant to publication (2026-08-05):** four runs carry a `publish` decision, so
  "approved" and "shipped" are no longer the same set — the rubric should be able to tell
  which judgements are about boards that actually reached players.
  **A third category as of 2026-08-05:** `2026-08-05T01-30-19.030Z-harbor` is approved with 8
  feedback events, but it is the **fixture replay** — a hand-written mock board Claude authored
  to verify the review surface, not pipeline output and not a design experiment. Max knew
  (*"this was just the original puzzle that got edited to match the new pipeline"*) and his
  three difficulty demotions there are signal about the *fixture's* authoring. Tag it out of
  the rubric corpus, or archive the run.
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
- The game's `index.html` declares no favicon, so every page load 404s `/favicon.ico`.
  The process deck now carries an inline data-URI icon; the game could use the same
  one-liner (no new asset, no request).
- Nothing verifies that a push actually deployed. Pages can fail its build while the
  previous version keeps serving, so a broken deploy is invisible from the outside
  (2026-08-05: five failed builds, most of a day stale). `.nojekyll` fixed the cause;
  the *detection* gap remains. A post-push build-status check would close it.

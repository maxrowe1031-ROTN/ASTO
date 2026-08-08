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
- ~~**D-8 probably makes D-1's promotion universal — watch it.**~~ **Wrong, and closed
  2026-08-06 by the first batch built under D-8.** The prediction was that the reframed rater,
  no longer counting rare words as difficulty, would stop returning 4s and every board would
  ship on a promotion. The opposite happened: **four rated 4s across the batch** (Knights ×3,
  Harry Potter ×1), and **two of seven boards shipped a genuinely rated-4 Black** rather than
  a promoted 3. Grading the reasoning did not lower the ceiling; it moved it onto sets that
  earn it. D-1's underlying question — should the Pair Author be asked for a hard set in the
  first place? — is still open, but not urgent, and its reconsider-when trigger is unchanged.
- **Misdirection has nowhere to be reported (design.md D-9).** `difficultySource` is
  `arrangement | vocabulary | both`, but 03's own grade-4 definition names three routes to
  hard — *"abstract, easily mistaken for another grouping, or dependent on noticing
  direction"*. Only the first has a label. `dock` on the sea board is the live example: Max
  knew both senses, the trap was which one applied, he called it *"a great misdirect"*, and
  the set was graded `vocabulary`. Ordering got its own treatment in D-9; misdirection did
  not, because it is a strength rather than a defect and nothing is being lost by the silence
  yet. Revisit if boards start being praised for a quality the corpus cannot count.
- **"Easily mistaken for another grouping" is unratable by construction.** Same D-9 finding,
  third route: 03 is explicitly told *"Grade each set on its own; you are not looking at a
  board"*, so board-level bait cannot reach a difficulty grade at all. The schema has
  `baitTags` and nothing computes them. Cross-set pull is currently only 06's
  `cross-set-association`, which is a hunt rather than a measure.
- **01 can hand 02 a pool whose obvious groupings are illegal (2026-08-06, the Obama run).**
  01 authored `President`, `Obama` and `Cabinet secretary` as the left term of two pairs each;
  02 grouped each with its twin, and three of seven candidate sets used the same word twice.
  Three rounds, terminal. Round 2 fixed the duplicates and then failed the stance floor, so it
  oscillated between two constraints it could not satisfy from that pool. rule-009 gained the
  shared-subject example (the rule already forbade it; only the chain shape was illustrated),
  which is the small half of the fix. The **unfixed** half is upstream and deliberately left
  alone at n=1: 01 is under no obligation to author pairs that can legally be grouped, and
  single-subject themes — one person, one place — structurally invite the shared left term.
  A hard ban at 01 would be wrong: `President : Air Force One` is fine once it has a partner
  from elsewhere. Revisit if a second person-themed run fails the same way.
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
- ~~**07's `knowledgeGated` has never fired on a real board.**~~ **Measured 2026-08-06, and it
  works.** It fired on **5 of 7** boards, and Max's own notes independently confirm two hits:
  on Knights it flagged `boss` and he wrote *"the machine caught exactly what i got hung up
  on. I didn't know what a boss was in this setting"*; on Yankees it flagged
  Ruth/Gehrig/Mantle/Maris and he wrote *"was able to get all except the most trivia heavy
  one"* — that set exactly. It stayed **correctly silent** on the two all-ordinary-word boards
  (`the sea`, `sleep and dreams`). And it flagged `phlebotomist`/`stent` on `medicine`, which
  he called his best puzzle yet — so a flag **names a wall without condemning a board**, which
  is the distinction that keeps it useful. What is still unmeasured is the false-negative
  rate: nothing yet says what it missed.
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
  No longer load-bearing for the count: the 2026-08-06 batch published four boards and took
  `puzzles/` to **10**, so Phase 5's content bar is met without them. Publishing them is now a
  quality question rather than a quantity one.
- ~~**`puzzles/index.json` is a reserved name.**~~ **Built 2026-08-07 — see design.md D-10.**
  `puzzle-store.writeManifest()` owns it, `npm run manifest` is the CLI, and
  `test/content/manifest.test.js` re-gates it against the files on disk every `npm test`.
- **A rename defeats the manifest's order-preserving rule (2026-08-07).** Regeneration keeps
  a slug's position, but a retitle-plus-reslug reads as delete-then-add, so the board lands
  last — `bedside-manor` dropped from position 2 to 9 and was restored by hand. Harmless and
  visible, and renames should be rare now that ids are settled. If they turn out not to be,
  the fix is for `publish()` to accept a `renamedFrom` slug and inherit its slot.
- **The select screen's `h1` is the wordmark, not the screen's name.** Consistent with the
  title screen, but it means the puzzle list's top-level heading is "ASTO" rather than
  "Puzzles". Revisit only if a screen-reader pass says it reads badly.
- **Losing the visible mistake count was a deliberate trade (design.md D-10).** If it turns
  out to matter once Max has lived with the list, the fix is bean pips beside the cup —
  `header-view.js` already draws the pip and it is the game's own mistake vocabulary.
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
- **The pair author can still truncate itself out of a run (2026-08-08, the `painting` run).**
  01 hit the 16k ceiling, `llm.js` raised it once to 24k as designed, and it truncated again —
  terminal, run failed, **$0.62 spent for nothing**. Same family as the stage-02 headroom entry
  below and the same conclusion: a bigger ceiling is not the lever, because a non-streaming
  300s timeout lands before a much larger reply finishes. The cheap lever is cutting 01's work
  (it is shown all 36 vocabulary entries); the real one is streaming. n=1 so far — revisit if a
  second theme dies the same way.
- **Nothing governs tile capitalization.** `Ascent` shipped with Title Case tiles (`Piton`,
  `Carabiner`) where every earlier board is lowercase; Max noticed and asked why. The answer is
  that nothing decides it — not the schema, not `validate-puzzle`, not 08, which said nothing
  about case on that run. It is the model's habit, varying run to run. Cheap fix if consistency
  is wanted: a case rule in 01's editorial rules plus an 08 check. Not a defect until Max says
  the boards look inconsistent side by side in the select screen.
- **`Ascent` was published with an unactioned `revise-set` on its Green.** Max recorded
  `revise-set` + `change-difficulty` on `set-object-component`, then approved and published the
  board unchanged. Almost certainly deliberate (the note was minor), but nothing in the Studio
  distinguishes "I changed my mind" from "I forgot I flagged that" — a published board carrying
  an open set-level request is invisible. Revisit only if it happens again.
- ~~**A proposal that fails validation twice leaves no trace at all.**~~ **Closed 2026-08-07.**
  Both empty exits from `proposeRevision` now write `revision-proposal-<attemptId>-failure.json`
  through `run-store` — category, message, what each round got wrong, the prompt, and **the
  model's last raw reply**, which is the field whose absence made the Harry Potter case
  unknowable. `GET /api/runs/:id/proposal` grew a `failure` field so the endpoint gives four
  distinguishable answers instead of three (a proposal outranks a stale failure record; a
  proposer never asked reports no `failure` key at all), and the review page says *"The
  proposer ran and could not produce a usable brief"* rather than showing nothing. `Request
  revision` stays clickable in that state by design — a brief that is never coming must not
  deadlock the button that exists for exactly that case. First direct test coverage of
  `proposer.js` came with it (`test/studio/review/proposer.test.js`). The original entry:
  `proposeRevision`
  records a thrown error as `revision-proposal-<id>-failure.json`, but the path where the
  model simply cannot produce a valid brief in two rounds ends in a bare `return null`
  ([studio/review/proposer.js](../studio/review/proposer.js)) — no artifact, no decision
  event, nothing on the page. Max sees an absent brief and cannot tell "not attempted" from
  "attempted and failed". Surfaced 2026-08-06: the Harry Potter run carried a `revise-board`
  verdict and no proposal, and re-running the proposer by hand produced a good brief on the
  first try — so whatever happened the first time is unknowable by construction. A one-line
  failure artifact on the null path would close it.

# Backlog — ASTO

> The parking lot. One line per idea. Nothing here is approved — items enter
> work only when Max pulls them into `design.md`'s plan. Mid-session ideas
> land here so the session stays on task.

- **08's agreement with Max is FALLING, and it has drifted strict (2026-08-31).**
  Re-running `tools/evaluator-report.js` over 126 judged attempts (up from 66) put
  08's board-verdict agreement at **65 of 126 (52%)**, down from **58%** — and the
  asymmetry flipped: it is now unhappy where Max is happy **41** times against 20 the
  other way. A binary verdict at 52% is barely distinguishable from a coin flip, which
  is the strongest evidence yet for the entry below asking whether an evaluator should
  return severities rather than a boolean — except that entry is about **05**, and this
  is **08**. Harmless while 08 is shown and never gates (and it is why taste findings
  are barred from D-14's auto-revise allowlist), but if 08's prose is going to be read
  at all, a verdict drifting strict will start costing boards Max would have kept.
  Worth a look at what changed: 08's prompt gained `contentConcerns` and the
  evocativeness axis across the same window, so the drift may be a *new* strictness
  rather than a decaying one. Nothing measures which.
- **The cost aggregation is a script inside a markdown file, not a tested tool
  (2026-08-31).** `docs/audit-2026-08-31.md` embeds its own zero-dependency
  aggregation so every figure is re-derivable, but it is a fenced code block —
  nothing runs it, nothing tests it, and it will drift from `pipeline-config.js`'s
  rates the moment those change (it hard-codes them, with a comment saying so). Fine
  for a one-off audit. If cost reporting becomes routine — a slim-down lap, a second
  audit, a monthly check — it should become `tools/cost-report.js` beside
  `evaluator-report.js`, importing the real rates instead of copying them, with tests.
- **`studio/README.md` went three weeks stale in ways that mattered, and nothing
  noticed (2026-08-31).** It claimed eight agents (twelve), 1160 tests (1671),
  D-1…D-13 (D-31), and — the load-bearing one — that D-5's graduation trigger was
  still pending, three weeks after it fired and shipped as D-14. Same family as the
  deck's-claimed-counts entry below, and the same cheap guard would cover both: a test
  comparing the numbers a document claims against the real ones. The dated
  measurement sections are fine as snapshots; the present-tense architectural claims
  are what rot. It is now stamped `current as of 2026-08-31`, which makes the next
  drift visible but does not prevent it.
- **The itch.io build is a frozen snapshot, and the calendar is not (2026-08-25).**
  `npm run itch` packages the game as it stands; the calendar is keyed to real
  dates and the schedule ends **2026-09-19**. After that an itch player opens to
  an empty current month and has to page back to reach the 51 boards. **Accepted
  by Max** when the tool was built — the fix is re-running `npm run itch` and
  re-uploading whenever the schedule is extended, not a code change. Revisit only
  if the itch build outlives his attention: the smallest change would be opening
  the calendar on the most recent released month when nothing matches today,
  which touches shipped game code and needs its own gate.
- **Third-party-iframe storage may not persist on itch (2026-08-25).** Safari and
  Firefox partition or block `localStorage` in a cross-origin iframe, which is
  exactly what an itch HTML5 build is. `storage.js` degrades silently and
  correctly, so nothing breaks — but **results, streaks and the statistics screen
  may reset between sessions** for some itch players, and the same player's
  history on playasto.com and on itch are two separate stores that can never
  merge. Nothing to fix; worth knowing before it arrives as a bug report.
- **Two itch iframe unknowns worth one look on the live build (2026-08-25).**
  Neither is verifiable locally. (a) `navigator.share` and the async clipboard
  are usually absent from itch's iframe `allow` list, so sharing should fall
  through to the `execCommand` path in `share.js` — degrades rather than fails,
  but untested there. (b) `src/ratings.js` posts to Supabase from a new origin;
  if the project ever gains a CORS allowlist those posts stop **silently** (the
  failure is swallowed at `ratings.js:62`), so check the network tab rather than
  waiting for rows to appear in `npm run ratings`.
- **Nothing links the itch build back to playasto.com (2026-08-25).**
  `buildShareText` emits title, score and tier squares and **no URL at all**, so
  a result shared from itch gives a reader no way to find the game. Harmless
  today and deliberate on the web (where the sharer's own URL travels with the
  paste); if itch becomes a real traffic source, the fix is a URL line in the
  share text, which is a taste call about clutter as much as a code change.

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
- **A board can repeat one root across four tiles and nothing notices (2026-08-08).** The Snow
  board shipped `snow`, `snowfall`, `snow day`, `snowman` plus `winter` — Max: *"repeating snow
  4 times is so lousy. plus we used winter, also lazy."* The 16-distinct-words rule is satisfied
  literally; nothing measures lexical diversity ACROSS sets. D-12's `lexical.js` already counts
  shared roots within a pair, so a board-level count is a small extension of code that exists.
  Offered and declined this session in favour of the span work.
- **Nothing looks for culturally loaded words (2026-08-08).** The clocks board authored
  `advance : retard` — horologically exact, and Max asked for it to be replaced. 08 checks style
  and never checks this. One report-only line in its prompt would cover it; his judgement stays
  the authority. Offered and declined this session. **Adjacent but distinct as of the D-13
  second amendment:** 08 now reports `contentConcerns` for *distressing subjects* (violence,
  tragedy — Max's school note). A slur-adjacent technical term like `retard` is a different
  failure — inadvertently loaded wording, not dark material — and is still uncovered; if it
  recurs, the fix is one more clause in the same contentConcerns instruction.
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
- ~~**If a fresh batch still tops out the same way every time, the lever is the stance quota.**~~
  **Fired and built 2026-08-08 — see design.md D-13.** The trigger was met with data: time
  stance held **19 of 54 Blacks (35%)** against 17% for the next. The lever turned out NOT to
  be the quota, though — overall stance usage is balanced, so a quota change would have moved
  `cause` and left the rut untouched. What shipped instead is a hardest-slot steer
  (`varyHardestStance`, half of the last eight) reaching both 01 and 04. The `inclusion`
  observation above stands unexamined and is now the only part left: nothing has re-measured
  whether quota'ing inclusion on every run is still shaping boards.
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
- ~~**The cross-reading check's semantic question needs a third attempt (design.md D-7).**~~
  **Built 2026-08-08 as attempt four — see design.md D-13.** The suggested fix (name each half's
  relation as its own field) shipped, and a second cause was found that the entry had not
  suspected: the checklist printed ONE orientation of each half while instructing *"judge only
  the reading in front of you"*, so the reading Max actually found — `seed : bud :: bloom :
  wilt`, his right half read the other way round — was formally outside the question. Halves may
  now be read either way. Whether v4 agrees with his `order-ambiguous` calls is D-7's
  graduation trigger, still running.
- **The cross-reading check's gate-promotion trigger (design.md D-7).** It reports and does not
  block. If it agrees with Max's `valid-but-unfair` / `order-ambiguous` calls across roughly the
  next six boards, promote it to a blocking check at `04a`. If it disagrees, the question it
  asks needs sharpening before it is trusted with a veto. **Running tally 2026-08-09: on the
  two `order-ambiguous` calls Max has made since v4 shipped, the order cluster caught both** —
  v4's cross-reading HOLDS on bicycles' yellow, and mirrors' green caught twice over (04a's
  symmetric flag + 07's `orderGuessed`, though v4 itself was not the catcher there). Not
  promoted to a gate — instead the cluster entered D-14's auto-revise allowlist, a milder
  use of the same trust: a wrong fix gets reviewed, a wrong veto silently costs a board.
- **Stage 05 flags almost exactly two sets per board.** Across 36 attempts the distribution is
  0/1/2/3 fails at 5/10/19/2 — 2 is the mode at 53%, and it was 2 on every board of the
  2026-08-05 batch. `boardPasses` is therefore false on 31 of 36 attempts (86%) and agrees with
  Max on 54% of sets. Its prose is often excellent and its verdict carries almost no
  information; worth asking whether the stage should return severities rather than a boolean.
- **The evocativeness verdict has no answer key yet.** It is shown, never enforced, and nothing
  measures whether it agrees with Max's `not-evocative` tag. At ~6 judged boards, compare — it
  is the same graduation question the cross-reading check has.
- ~~**A title collision has no route (2026-08-10).**~~ **Closed 2026-08-13 by D-22:** the
  hand editor edits the board title, and the publish panel slugs from the edited title —
  retitle-at-publish was B2's first bite, exactly as predicted below. The childhood run's
  approved board was
  titled "School Days" — the same title as the board already published from the school run,
  so its derived slug 409s `occupied` and the review page has no way to retitle or re-slug.
  Max archived the run (the published board was the stronger one), but this is the third
  face of the same seam: D-6 chose title-derived slugs, D-10's manifest note records that a
  rename reads as delete-then-add, and now a duplicate title is unpublishable by
  construction. If it recurs, the small fix is a retitle-at-publish field on the review
  page — which would also be B2 hand-editing's first real bite (HR-2).
- ~~**The Subject Scout's tone rut fired on batch two (2026-08-10).**~~ **Closed
  2026-08-11** — D-17 lever 1: the scout's banding now requires varied grammatical
  shapes, keyed off the used list's recent tail. Batch three measures it.
- **The revision scope check binds the proposal, not the builder (2026-08-13).** Batch
  five (destroyed, but the observation stands): a D-14 auto-revision whose findings named
  only `set-directional` re-entered at 01 and also re-authored `set-time-activity`, which
  had been clean — and introduced two holding cross-readings into it. The D-17 guardrail
  validates the proposer's brief; nothing constrains which sets the re-run pipeline
  actually changes. If it recurs, the fix is comparing changed sets against the findings
  at the 04a gate, not more prompt.
- **Stage 08 can deadlock a revision on `compliant` (2026-08-13, the tinsmith).** Its
  revision attempt failed terminally with "compliant must be false to match an edit list
  of 1" three rounds running — the model kept claiming compliance while listing an edit.
  An agent/validator disagreement that burned the attempt; the run sits in `failed`.
- **Gloss semantic near-leaks pass the mechanical check (2026-08-13).** sewing-room-logic's
  auto-applied gloss defines buttonhook as "a tool… for pulling small fasteners through
  tight openings" — no board word appears, but it paraphrases the set's relationship,
  the exact risk glossary-author.js's own header names. The mechanical check cannot see
  paraphrase; only Max can. Watch whether glossed sets get solved from the footnote.
- **The six destroyed batch-five subjects are drawable again (2026-08-13).** D-15's
  used-theme list reads run manifests, and the rollback deleted them — the scout can
  redraw the spice bazaar, the ice cream parlor, the puppeteer's caravan, the train
  station platform, the desert caravan at nightfall, waking a sleeping village. If a
  redraw bothers Max, the fix is a burnt-list the subject chain consults beside the
  used list.
- **The decide buttons and the form's board-verdict radio can contradict (2026-08-11).**
  Market stalls at dusk recorded approve-board·delightful feedback AND a reject decision in
  one click — `wireDecisions` only downgrades `revise-board` to a save; approve-radio +
  reject-button (or the reverse) writes both sides with no guard. Fix: align or confirm on
  mismatch. Until then the decision ledger can misstate Max's intent.
- **A point-system grade for boards** — Max's aside on low tide ("if we were grading this on
  a point system, and maybe we should"): per-set deductions (e.g. word reuse) summing to a
  board score on the feedback form. Unapproved idea; would also give the instruments a
  numeric target.
- **Word reuse inside a set reads as a flaw** — "anchor / weigh anchor… using anchor twice
  doesn't feel as good" (low tide, 2026-08-11). Adjacent to 04a's self-matching check but
  not covered: a shared stem across a set's words. Candidate 04a lexical addition.
- ~~**Cross-board subject similarity is unmeasured**~~ **Word-level half closed
  2026-08-11** — D-19: the five newest published boards' words ride every brief as a soft
  avoid-list. The SUBJECT/domain-similarity half (weather-adjacent boards feeling alike)
  remains open; revisit if batch five still feels familiar despite fresh words.
- **Board-wide vocabulary cap — offered 2026-08-11, deferred by Max.** Batch three's both
  obscurity rejects were uncapped lens boards (~2.3 gated words/board vs world's 0.0 under
  the cap). Deferred pending the Vocabulary button (D-18), which may make some gated
  vocabulary a feature instead of a defect. Revisit after a glossed batch.
- **Archiving a run has no endpoint or button.** `approved → archived` exists in the
  status machine and `updateStatus` enforces it, but no API route or UI exposes it — the
  childhood archive went through a hand-written script against `run-store`. Fine at n=1;
  if archiving becomes routine (e.g. clearing the awaiting-review backlog), it should be
  a button beside approve/reject.
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
- ~~**The Revision Proposer's graduation trigger:** at ~10 briefs with `proposal-verdict` events
  recorded (accepted / edited+diff / discarded), evaluate agreement. If Max accepts briefs
  substantially unedited, propose the bounded auto-revise loop — his stated aspiration, gated
  on evidence rather than on enthusiasm (design.md D-5).~~ **Fired 2026-08-09 — see design.md
  D-14.** 9 verdicts, all accepted, and Max asked for the loop himself mid-review. The
  bounded pre-review fix loop is designed (allowlist his: 06 high cross-set + the
  order-ambiguity cluster; taste never), agreed, and deliberately not built until next
  session. The evidence that clinched it: the machine caught all four structural defects he
  caught on the 2026-08-09 batch, before he saw the boards.
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
  the fix. Revisit only if the visible line proves insufficient. **Closed 2026-08-08 (design.md
  D-12): it proved insufficient in the worst possible way.** A server booted at 19:16 ran a
  revision at 20:00 against a fix merged at 20:48; the revision churned exactly as before and
  the only reasonable reading was that the fix had failed. The config line was right there and
  said nothing, because it reports the effort profile — which had not changed. The page now
  carries a banner whenever the source on disk is newer than the server's boot time. Still
  manual: it tells you to restart, it does not restart itself.
- **The staleness banner fired mid-review and was RIGHT — the diagnosis was wrong
  (2026-08-08).** Recorded because the first version of this entry got it backwards and the
  correction is the useful part. The banner named `studio/corpus/vocabulary.js`, whose mtime
  had moved past the server's boot time while `git diff` showed the file byte-identical to
  the commit — so it was written up as a false positive caused by a formatter. The real
  cause was **a second agent working in this repo at the same time**
  (`agent/run.js`, Max's handbook assignment), which was reading and editing under
  `studio/` and committed a `studio/pipeline.js` change on its own branch minutes later.
  Source really was changing under the running server. The banner did its job.
  **The lesson is about diagnosis, not about the banner:** "content is identical *right
  now*" does not mean "nothing is editing this tree", and a concurrent writer is invisible
  to a single `git diff` taken between its writes. The same mistake produced a phantom
  "flaky test" the same session (see below). **Still worth doing eventually:** hash the
  `.js` files under `studio/` and `src/` at boot and re-hash per `/api/config` call, so the
  banner reports a real content difference rather than a timestamp — `server.js` already
  owns that computation and `api.js` does not touch the filesystem. Low priority now that
  the loud case turned out to be a true positive.
- **A concurrent agent in the same worktree is invisible to the test suite (2026-08-08).**
  `test/studio/pipeline/integrity-gate.test.js` failed twice with `03-difficulty-rater`
  where it expects `04a-integrity`, then passed 15/15 and 1171/1171 afterward. It was
  diagnosed as CPU-load flakiness and it was nothing of the kind: `agent/run.js` was
  mid-edit on `studio/pipeline.js`, and its own commit message says it *"restores the
  gate's original pool-too-small handling (stageId 04a-integrity, unchanged)"* — the exact
  assertion that had been failing. **A green suite means nothing if another process can
  write to the tree between the edit and the run.** No code fix is proposed: the answer is
  workflow (one writer per worktree, or `git worktree` per agent — which
  `agent/run.js` could use). Worth remembering the next time a test looks flaky and the
  timing is suspicious — check `git log --all` and `ps` before reaching for a load
  explanation.
- `budget.js` cost caps only bite once every model in play is priced. Rates are estimates
  until A5 measures real spend; unpriced models are surfaced in `usage.unpricedModels`.
- Studio run artifacts accumulate under the git-ignored `studio/runs/`; no pruning yet.
- ~~**`llm.js` discards the body of an HTTP error, and the body is where the reason lives
  (2026-08-09).**~~ **Closed 2026-08-09, the same day it bit a second time** — the evening
  batch lost two auto-revisions to the identical bare `HTTP 400` (credits again), and the
  diagnosis again ran on timing patterns instead of the record. The fix landed where the
  reason was being dropped: `classifyTransportError` in `studio/failures.js` rebuilt
  `HTTP <status>` bare while the transport had already preserved the body as the error's
  message. It now appends the body (trimmed, truncated at 400 chars so a proxy's HTML
  error page cannot flood a record), which propagates unchanged into the thrown
  `StudioFailure`, every per-attempt `requests[]` entry, `request.failed.json` and
  `failure.json` — no writer needed to change. Pinned by tests at both levels: the
  classifier (body in message, bodyless unchanged, huge body truncated) and the llm loop
  (a scripted 400 with the credit-balance body surfaces the sentence in the failure AND
  the request record). The original entry:
  The whole third batch died with six records saying only `HTTP 400`; the
  API's actual response was *"Your credit balance is too low to access the Anthropic API"*
  — a billing problem wearing a request-error status. Diagnosis took a hand-written probe
  call that the failure record should have made unnecessary. One line — keep
  `error.message` (never the request) in `request.failed.json` — turns every future 4xx
  from a mystery into a sentence. Same family as D-5's amendment: an absent reason and a
  failed one must not look alike.
- R1 has no un-approve: `approved → archived` only. Fine for the rubric loop (a new run
  is cheap), but revisit if Max changes his mind about a board mid-loop.
- R1 binds `127.0.0.1`, so the Studio is not reachable from the iPhone Max playtests on.
  Deliberate — it starts runs and spends credit. Revisit only with auth, never a flag flip.
- The Review Studio adds two endpoints beyond the spec's list (`POST /api/runs/:id`
  resume, `POST /api/runs/:id/feedback`); fold them into the spec or drop them at B2.
- `run.js` and the Studio can drive the same run concurrently; the lock protects the
  files but the UX is confusing. Documented as "one driver at a time" — consider enforcing.
- ~~The game's `index.html` declares no favicon, so every page load 404s `/favicon.ico`.~~
  **Done 2026-08-13** — the deck's inline data-URI icon, one line in `index.html`;
  browser-verified no favicon request at all.
- ~~Nothing verifies that a push actually deployed.~~ **Done 2026-08-13** —
  `npm run check-deploy` byte-compares four representative live files against the
  local tree (legacy Pages serves the repo verbatim, so equality IS the check).
  It caught a real stale file on its first run. The original entry: Pages can fail
  its build while the previous version keeps serving (2026-08-05: five failed
  builds, most of a day stale); `.nojekyll` fixed the cause, this closes detection.
- ~~**01 is REPRODUCING its own prompt example, and one is already published.**~~ **Closed
  2026-08-08 — see design.md D-12 addendum.** The example is corpus data now
  (`studio/corpus/examples.js`), demoted to pair-level to match the 36 vocabulary examples
  that have never leaked, and 01 and 03 render from the one source. Two guards: no generative
  prompt may quote a finished set (every stage, not just the two caught), and no published
  board may be built from a taught pair. `trees-tools-and-time` stays published by Max's
  decision, grandfathered per-slug with its provenance recorded in design.md.
  **02 and 04 checked 2026-08-08 and both clean** — neither quotes an example, and 04 is
  protected by its own design ("choose and relabel; do not author"). The check found the
  **context door** instead: the rules corpus rides into every generative prompt and carries
  five full sets, which the guard could not see because it rendered with empty context. Now
  guarded, allowlisted with an 82-board zero-leak sweep behind it, and the rule sharpened to
  *quality exemplar* vs *mechanical demonstration*. **What remains:** the class guard matches
  four-word sets, so a fully-worked **sixteen-word board** in a prompt would still slip past —
  no prompt carries one today, and 04 is the only stage whose deliverable is that shape.
- ~~**The pair author can still truncate itself out of a run.**~~ **Closed 2026-08-08 at n=5 —
  see design.md D-12.** painting, shadows, bald eagle, sculpture and a rose all died the same
  death (~$0.62 each, $3.10 total). Raising the ceiling alone could never work, because what
  overran it was thinking, not answer. The escalation retry now steps effort down one rung as
  well, and `a rose` — a theme that had died — completed on the retry at medium/24k against the
  real API. **What remains from the original entry:** the cheap lever is still cutting 01's work
  (it is shown all 36 vocabulary entries) and the real one is still streaming, if a stage ever
  legitimately needs more than the 300s timeout buys.
- **Nothing governs tile capitalization.** `Ascent` shipped with Title Case tiles (`Piton`,
  `Carabiner`) where every earlier board is lowercase; Max noticed and asked why. The answer is
  that nothing decides it — not the schema, not `validate-puzzle`, not 08, which said nothing
  about case on that run. It is the model's habit, varying run to run. Cheap fix if consistency
  is wanted: a case rule in 01's editorial rules plus an 08 check. Not a defect until Max says
  the boards look inconsistent side by side in the select screen.
- ~~**`Ascent` was published with an unactioned `revise-set` on its Green.**~~ **Addressed
  2026-08-08 — see design.md D-12.** It had happened four times (Ascent, bbq ×2, cinema) before
  anyone noticed; publishing now refuses once with `reason: 'unapplied-edits'` and names every
  change that will not be applied. It warns, it does not block — Max is the editor. **What
  remains:** this is a workaround for B2 being deferred. If he starts acknowledging routinely,
  hand-editing has become due and HR-2 should be revisited.
- **The cross-reading note had never rendered once, and crashed the page when it fired
  (2026-08-08, design.md D-12).** Fixed the same session, but the shape of the miss is the
  lesson: 06's output is keyed `{id: "set-seasons#1", valid, note}` and the page read
  `reading.setId` and `reading.reading`, neither of which has ever existed. It was invisible
  because `valid: false` skipped before the destructure — so the code was only *reachable* on a
  finding, and findings were near-silent. **What remains:** nothing checks that a UI reader and
  an agent's schema still agree. `prompt-schema-agreement.test.js` does this for prompts and
  output schemas; the review page's readers have no equivalent, and this is the second
  consumer-side field-name mismatch (the first being `machineNotesBySet` itself, now covered).
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
- **A deep-dive appendix for the deck's cut material (2026-08-18, deferred from the v2
  compression pass at Max's call).** The v2 editing plan's Pass 5 wanted cut material
  (workflow rituals, instrument mechanics, the two dropped failures, order-fairness
  detail) preserved on public pages under `docs/` with "deeper dive" links from the
  slides. Deferred: it is a new public surface that can go stale. The material survives
  in docs/design.md, docs/log.md and git history meanwhile.
- **The deck's claimed counts have no guard (2026-08-17, restating the 2026-08-16 note
  below now that the deck is public).** The portfolio deck states 1,440 tests, 48 boards,
  133 runs and 726 feedback events as of August 17; every one will drift. The cheap
  guard is a test comparing the deck's claimed counts against the real ones, failing
  when they diverge past a tolerance.
- ~~**The process deck is a dated snapshot, not a current account (2026-08-16).**~~
  **Done the same day.** Restructured into six acts and brought current: 15 slides to 23,
  eight new (order fairness, the steering failures, the auto-revise graduation, the ship,
  what shipping changed, the first outside judgement, the cost reversal, the run-evaluator
  before/after), every stale number corrected, the diagram redrawn for stage 09 and the
  auto-revise loop, all four screenshots retaken plus three new, and the em dashes swept.
  The stamp guard now pins August 16, 2026. **What remains:** the deck will go stale again
  the same way, and nothing measures that. The cheap guard, if it recurs, is a test that
  compares the deck's claimed test/board counts against the real ones.
- ~~**Nothing on the shipped site says the puzzles are AI-generated (2026-08-14).**~~ **Built
  2026-08-16 — see design.md D-23.** The About page ships with Max's own copy, linked from
  both the title screen and the end screen (the homepage alone would have missed every
  visitor arriving on a shared `?puzzle=` link). The deck and the GDD are linked as the two
  separate files they are. **What remains:** the page asserts that every published puzzle
  was played before release and no test enforces it — D-23 records the trigger. The original
  entry:
  Raised in a
  Development Brain session while pulling `intent-over-output` against ASTO; **Max decided the
  shape the same session and deferred the build to a working session here.** The site has been
  public since 2026-08-13 and carries no disclosure anywhere — `index.html` is 58 lines with no
  footer, no about, no credits, and no match for disclosure language in the page, `src/`, or
  `styles/`. **The decided shape:** a **Credits** link on the homepage opening an **About this
  project** page — ASTO as a **capstone for a class on multi-agent AI development**, carrying the
  process deck, and stating that **the puzzles are generated by AI that Max has authored and
  edited**, and that **every published puzzle has been played and approved — or approved with
  changes — by him.** The risk being closed is *discovery, not the fact*: by the source's own test
  (Codex Mortis vs Call of Duty) ASTO's answer is a strong one, and the second clause is a claim
  about process that this repo's review record can actually back. Three things found while
  scoping it, each of which the build will need:
  1. **The deck is already publicly reachable** at `playasto.com/docs/presentation/` — legacy
     Pages serves the repo verbatim, so it has been live and unlinked since 2026-08-05 (verified
     200). It needs *linking*, not publishing.
  2. **A shared `?puzzle=` link never reaches the title screen.** Since D-20 retired the forced
     first-run tutorial, routing is deep-link → straight into the board, everything else → title.
     So a Credits link on the homepage alone misses exactly the strangers the disclosure is for —
     the ones D-20's bounce trigger is watching. The **end screen** is the surface they do reach,
     and it already has a `text-action` style (`Back to puzzles`) for a quiet link.
  3. **The deck is a 2026-08-05 snapshot** — it says "eight agents" (there are 11), and predates
     the public ship, D-14, D-21 and D-22. Date-stamp it or update it; linking it unlabelled would
     misdescribe what the visitor just played.
- **The statistics page (D-24 spun it off, 2026-08-18).** **Specced the same day** —
  `docs/superpowers/specs/2026-08-18-statistics-page-design.md`, brainstormed with Max,
  awaiting his acceptance and then a build. Max's third feature from the Connections
  screenshots: completed count, win %, streaks, mistake distribution — stat tiles and the
  bar chart, **badges deliberately cut** (an achievements subsystem doing the least work
  on that screen). The two questions this entry named are answered: **streaks count
  consecutive board dates won** (walking the calendar backward, so an old board can repair
  a gap), and **the counts read `asto.results` + the manifest, not `asto.history`** — which
  means the whole back catalogue counts on day one and the page needs no new storage.
  `asto.history` keeps accruing and powers nothing in v1.
- **Play cannot reopen a finished end screen across a reload (2026-08-18).** Within a
  session it works (the controller holds the state); after a reload Play lands on the
  title card instead, because rebuilding the end screen needs persisted `solvedSetIds`
  and an engine restore seam. ~~Belongs with the statistics spec — same storage schema
  conversation.~~ **Correction, 2026-08-18:** the coupling does not exist. The statistics
  page turned out to need no new storage at all (it reads `asto.results` + the manifest),
  so there is no shared schema conversation to join. This is independent work, and the
  heavier half of it — a restore seam on the engine — touches the module the boundary law
  guards hardest. It needs its own scoping when Max pulls it in.
- **Dead `.select-count` CSS from the retired select list (2026-08-18).** Noticed while
  folding the row layout into `.select-head` for the statistics door. The rule is styled
  in `styles/components.css` and rendered by nothing since D-24 retired the list. Left
  alone to keep that diff focused; a one-line sweep whenever someone is next in the file.
- **The static fallback pool is stale (2026-08-18).** `studio/corpus/subjects.js` holds
  91 strings from the cozy-premises era, and a fallback bypasses BOTH the register and
  family axes — v4's fallbacks were `dance`, `laundry day`, `street food`, `autumn
  leaves`, `the toolshed`, visibly flatter than the generated picks. ~0% of a six-board
  batch (fallbacks cluster in the exhausted tail of a long sampling) but ~14% of a
  100-sampling. Cheap fix if it ever bites: seed a fresh pool from the sampler's own
  best output, which now spans 18 registers.
- **`/api/player-ratings` intermittently 500s (2026-08-18).** Measured three
  consecutive Review Studio loads: 200, 500, 200 — roughly one in three. The route is
  D-21's Supabase reader and is unrelated to the register work (confirmed: that
  session's only `api.js` change was four brief fields inside `createRun`). A retry
  succeeds and returns real data, so the panel self-heals on refresh; worth a look if
  Max sees the ratings panel blank.
- **Cross-sampling repeats are by design (2026-08-18).** `sample-subjects.js` persists
  nothing, so two samplings do not constrain each other — `the taxidermist's studio`
  appeared in both v2 and v3. Correct (samples must never enter the avoid-list) but
  worth remembering when reading two lists side by side.
- **Window-edge misses in the echo guard (2026-08-18).** v4 put `brass band parade`
  (#3) and `brass band parade instruments` (#29) 26 apart — one position past the
  25-pick word-echo window. Deliberately not chased: widening the window bans common
  words for longer, and the family guard covers the cases that matter at batch scale.
- **Auto-revision keeps failing the same way (2026-08-19).** Three of twelve boards
  across batches five and six died at `[terminal-content]` because the REVISION
  introduced words outside the theme's world: the puppeteer's trunk got "backlit
  silhouette"/"glove animation", marrakech tanneries got "Kneading"/"Baking", brass
  band parade got "kickoff"/"final whistle". D-14's guard is working — it refuses a
  board the reviser made worse — but the reviser reaching outside the theme is the
  actual defect, and each failure costs a full board's spend (~$0.50–0.82). In every
  case **attempt 0001 remains complete and reviewable**, though the run's status reads
  `failed`, which hides a usable board behind a red badge in the Studio.
- **Samplings do not reserve subjects, so they preview what the generator will pick
  (2026-08-19).** Five of batch six's six subjects had already appeared in a sampler
  run — vintage postcards, marrakech, the saddler's leather, limestone sinkholes,
  brass band parade. Correct by design (`sample-subjects.js` persists nothing, so a
  sampled subject cannot poison the avoid-list) but it means Max has effectively seen
  a batch's themes before it runs. If that becomes annoying, the fix is an opt-in
  `--reserve` flag writing sampled subjects to a side-file the guard also reads.
- **Brand rollout ticket (2026-08-25, now unblocked).** Mochi's design is settled and
  **two logo variants already exist** — `docs/art/reference/6-logo-colour.jpg` and
  `7-logo-monochrome.jpg`. The rollout itself is untouched: wordmark lockup, About page,
  favicon (use the monochrome variant — it is the one that survives 16px), and the itch
  listing. Its own ticket and session; no longer waits on art direction, only on Max
  pulling it into the plan.

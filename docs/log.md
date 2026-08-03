# ASTO — Dev Log

Append-only build history. Newest first. Written by `/wrapup`, read by `/warmup`.

## 2026-08-03 — Promotion: the builder may label its hardest set Black

Follow-on from the entry below, after Max read the Board Builder finding. Recorded in full
as **design.md D-1** with its accepted risk and reconsider-when trigger.

- **Max's call:** ship a board even when the graded pool does not span all four tiers, and
  label the hardest set Black anyway. *"Upping the difficulty of level 4 maybe something we
  can train with the studio."* The rater's ceiling is to be taught through the review loop,
  not engineered around before the loop has run.
- **No locked decision moved.** Schema v1.0 still requires exactly four sets at difficulties
  1–4, and Black is still derived from difficulty 4 — there is no `tier` field. The builder
  now ranks its four chosen sets and assigns 1–4 in that order instead of matching grades
  exactly. That is Studio behaviour, not schema.
- **Built:** `promotions` on the builder's output, validated against the board it claims to
  promote (a promotion naming an absent set, or claiming no change, is rejected) · the 04a
  gate rejects any board set that was **not** in the graded pool, so the builder can choose
  and relabel but never author — enforced in code because a prompt can only ask · the Review
  Studio marks the card *"graded 3 — promoted to Black"*, since a promotion Max cannot see is
  a judgement he cannot give feedback on.
- **Verified:** `npm test` → **675 pass, 0 fail** · the promotion rendered in the browser
  through a real mock run: exactly one `.promotion`, on the black card, reading
  *"graded 3 — promoted to Black"*, italic in `--soft-ink` and **not red** — the no-list
  holds. The temporary fixture used for that check was restored (`git status` clean).
- **Next:** unchanged from below — Max reviews the waiting board and rules on the tag
  vocabulary. Note the board he is about to review was built *before* this change, so its
  Black set is the invented one, not a promoted one.

## 2026-08-03 — Aiming the model calls; the pipeline's first eight-stage run

Built on `work/studio-transport-aiming` (commits `0b1216b`, `8a4ba4f`). **No game code
touched** — `git diff main -- src/ styles/ index.html puzzles/` is empty.

- **Warmup found a fourth real run that was never logged.**
  `studio/runs/2026-08-02T23-08-42.315Z-surprise-me`, `brief.mock: false`, started ~90
  seconds *after* the R1 fixes merged, cost ~$0.23, died at `02-theme-grouper` with
  "response was truncated". It left **no stage folder at all**, so which stage failed had
  to be worked out by dividing token totals by request counts (3 requests / 15,213 tokens
  ≈ 5,071 each — impossible under a 16,000 ceiling, so it ran at the old 4,096).
- **The cause, and the proof.** The handbook's prototype-crew post-mortem records it
  exactly (`lessons-learned.md` §1.1): the Claude 5 family runs adaptive thinking by
  default, and `max_tokens` caps thinking and response text together. We send no
  `thinking` parameter, so stage 02 spent its ceiling on reasoning. **The stale server was
  still running when this session started** — PID 44977, started 22:45 UTC, seventeen
  minutes before the 23:02 commit whose fix it never loaded. Node caches modules; a
  running server never sees a code change.
- **The prototype's own fix was not adopted.** `thinking: {type: "disabled"}` predates
  adaptive thinking, and `budget_tokens` — what it was reaching for — is now a 400. Its
  agents only emitted JSON; ours rate difficulty and hunt alternate solutions, and that
  is reasoning we pay for on purpose. **Max chose per-stage `effort`** instead: `high` for
  the reasoning stages, `xhigh` for the board builder (§3: assembly, not generation, is
  the constraint-satisfaction problem that broke the prototype). Deliberately **no
  default** — effort is an error on Haiku 4.5, so the three checker stages must send no
  `output_config` at all, and a default would quietly put one on every request.
- **Also in `llm.js`:** `temperature` dropped (this model family rejects sampling
  parameters outright — nothing set it, so we were lucky rather than correct) · an
  `AbortSignal.timeout` so a wedged call becomes a bounded retryable failure · block types
  reported · the ceiling and effort **recorded**. Truncation now raises the ceiling once
  and retries; a second truncation is terminal naming both ceilings, instead of buying
  three copies of one failure. Empty text and `model_context_window_exceeded` are loud
  failures rather than a misleading JSON parse error and a silent success.
- **A dead stage now leaves evidence.** `prompt.txt` and `request.failed.json` are written
  on the failure path, the failure names its stage, and the attempt marks it failed.
  Tested by replaying this exact incident. **The real transport had no tests at all** —
  which is how a wrong request shape shipped; it has them now, with `fetch` injected.
- **Agreed with Max, from the same post-mortem:** the 04a gate now enforces **≥4 distinct
  relationship labels** — the first mechanical check here that can fail a schema-valid
  board, closing the backlog question and amending `design.md` risk 1 — and the crew's
  four hard-won content rules joined `corpus/rules.json` with provenance.
- **The real run: eight stages attempted, five complete, one board built.** Fresh server,
  `mock: false`, $0.37. 01 → 02 → 03 → 04 → 04a all passed. **Stage 03 cleared, which is
  the first live proof of last session's prompt fix**, and a real board passed the new
  integrity gate including the variety check. It failed at `05-analogy-validator`.
- **And the failure was readable off disk, which was the point.** Three more instances of
  one bug family, in three different agents. Last session's fix named each agent's
  *top-level* schema keys and the test enforced only those; **nested** required keys were
  still guesswork, and the model guesses from the shapes around it:
  - `02-theme-grouper` is handed pairs as `{a, b}` objects and its schema wants
    `["A","B"]` arrays. It returned objects. Rejected once, recovered on retry.
  - `05-analogy-validator` requires `pass` per verdict; the prompt named only `verdicts`
    and `boardPasses`, and the model wrote `passes` three rounds running. This killed it.
  - `04-board-builder` (falseTrails), `06-adversarial-solver` and `08-style-guide` had the
    same gap **latent** — the run never reached the last two.
  - The test now walks each schema to any depth and requires every `required` key to be
    named. **That generalization found the three latent cases; the run found one.**
- **A structural finding.** The run's brief asked for 8 pairs; the grouper made exactly 4
  sets from them, and the rater graded those 1, 2, 2, 3. With no difficulty-4 candidate the
  builder correctly **refused rather than compromise** (`insufficientSets`), and the gate
  sent it back. One-per-tier was arithmetically out of reach.

### The second run — eight stages, one board, `awaiting-review`

Max approved a second run with the brief raised to 14 pairs. **It completed: all eight
stages, `awaiting-review`, a board on disk, $0.53.** The first end-to-end proof of the
real transport, and the first board this pipeline has ever produced.

- **Every prompt fix verified live**, each at the stage that would have failed without it:
  02 returned `["Wallet","Cash"]` arrays first try, no rejection round · 05 returned
  `setId, pass, notes` exactly · 06 completed, and its keys were latent-broken this
  morning. The board **passed the new variety gate on real data**:
  `variety: {ok: true, distinct: 4}`.
- **`tools/check-board.js` on the generated board: clean.** Schema v1.0, 16/16 accepted of
  43,680 ordered tuples, 80 near-miss orderings. "Concealed Connections" —
  `Wallet : Cash :: Vault : Treasure` (green) · `Spider : Web :: Bakery : Bread` (yellow) ·
  `Ram : Sheep :: Mouse : Rodent` (red) · `Coal : Diamond :: Sand : Glass` (black).
- **The critic did not rubber-stamp:** the analogy validator returned `boardPasses: false`.
  Per the crew post-mortem §6, that is the correct posture, not a defect.
- **⚠️ The Board Builder authored a set instead of choosing one, and nobody rated it.**
  The rater graded five candidates 1, 2, 3, 1, 2 — **no difficulty 4 again, across both
  runs and ten graded sets**. On the rebuild the builder filled the gap by inventing
  `set-material-transformation` (`Coal : Diamond :: Sand : Glass`), which is **not in the
  graded pool**, and assigned it difficulty 4 itself. Its own prompt says "Choose exactly
  four sets from the graded candidates" and, failing that, refuse — it refused on round 1
  and invented on round 2. The board is good and passes every check, but its hardest set
  carries **no independent difficulty rating**, and GDD §16's difficulty loop compares
  *predicted* against *simulated*. **This is Max's call, not a bug to quietly fix:** either
  the builder may author to fill a tier (and the rater should then re-grade), or it may
  not (and the pool must be made to span four tiers upstream). Nothing has been changed.
- **Also observed:** a board-builder call at `xhigh` ran ~6 minutes. Well inside the new
  300s-per-request timeout only because the timeout is per request and it retried cleanly —
  but the Studio shows nothing but "running" throughout. Effort levels are a first guess
  and want calibrating against real latency and spend in A5.
- **Verified:** `npm test` → **664 pass, 0 fail** (623 at the entry below) · boundary greps
  clean: `llm.js` still owns the only server-side `fetch`, `run-store.js` is still the only
  writer of run artifacts, `pipeline.js` does no file I/O · a mock run through the restarted
  server reached `awaiting-review` with the board rendered · the live run's
  `request.json` states `maxTokens: 16000, effort: "high"` on its face, which is the fact
  that previously took arithmetic to recover · the generated board rendered in the Studio
  in ASTO's own design system, no console errors, and passed `tools/check-board.js`.
- **Total spend this session: ~$0.90** across two real runs.
- **Gate: the automated and Claude-verifiable parts are MET.** The suite is green, and a
  real run completed end to end with a board that passes the project's own content check.
  **Max acceptance is outstanding and is not claimed:** the board's editorial quality, and
  whether the thirteen quick-tags are the right vocabulary, are his judgement. The board is
  sitting in the Studio at `awaiting-review` waiting for it.
- **Next:**
  1. **Max reviews the board** — `npm run studio:review`, newest run. Record a real
     feedback event, and rule on the tag vocabulary. Changing it after thirty boards means
     re-reading old feedback through a new lens, so board one is where it is cheap.
  2. **Decide the Board Builder question above** — may it author a set to fill a missing
     tier, or must it refuse? Whichever way, the rater currently never returns a 4, and
     that wants addressing upstream rather than by the builder quietly compensating.
  3. Then the loop itself: batches of ~10 with a rules recompile between, so batch 3 vs
     batch 1 answers whether feedback actually changes the output.
  4. Carried: `effort` levels and the 300s timeout want calibrating in A5 against real
     latency and spend · First Light `explanation` editorial pass · GDD drift to propose
     upstream · the tutorial board's sets 2–4 wording is Max's to edit.

## 2026-08-02 — Review Studio R1, and the first real API run (which failed)

Third unit of work this session, on `work/review-studio-r1` (commits `8fe4b46`, `58c4d95`).
**No game code touched** — `git diff main -- src/ styles/ index.html puzzles/` is empty.

- **Max changed the plan, deliberately.** Rather than write `rubric.md` cold (A4's
  centrepiece), he wants it **compiled from ~30 recorded judgements**: generate a board,
  review it in a web UI, tag and annotate it, recompile rules between batches of ten. He
  proposed this himself — *"what if before we published a single puzzle, we went through
  20–30 iterations where I gave direct feedback on each one."* Judging concrete boards
  beats articulating taste in the abstract, and it yields a rubric with evidence attached
  to every line. **This reorders the approved Studio spec: a B1/B2 subset of the Review
  Studio moves ahead of A4 and A5.**
- **Scope agreed before building:** approve/reject/revise are **recorded only** — no
  landing into `puzzles/` (deferred to just before Phase 5b) · **no hand-editing**
  (deferred to B2) · real Anthropic transport, Max holds the key.
- **Built (`studio/review/`):** `api.js` — route handlers with no `node:http`, no `fs`,
  no `fetch`, so every rule is a function call in a test; IDs are pattern-checked before
  reaching the store, making traversal impossible by construction; the store's own guards
  stay the authority and map to 409 rather than being reimplemented. `runner.js` — the
  server's only door to the pipeline; 202-plus-polling because a real run takes minutes,
  with `manifest.status` (already a state machine) as the progress signal. `server.js` —
  binds `127.0.0.1` explicitly (`tools/serve.js` binds everything and is deliberately not
  reused); static serving is an **allowlist**, so `studio/runs/` and `.env` are not
  addressable rather than merely guarded. `ui/` — `board-html.js` is the spec's
  intentional duplication (amendment 2) as a pure string template, unit-testable with no
  DOM, using the game's classes and the game's derivations.
- **Also built:** `validateFeedbackEvent` + `validateRulesFile` (`schemas.js`) over the
  spec's ten actions and thirteen quick-tags — closed vocabularies, because the rubric is
  compiled from this corpus and a typo'd tag is signal that quietly disappears ·
  `corpus/rules.json` seeded **only** with GDD §10.2's six standards, with only
  `status: "approved"` rules ever reaching a prompt · `corpus/relationship-index.json` +
  `variety.js` for locked decision 6's surprise-me brief, counts recomputed on demand so
  there is no second source of truth · `env.js`, a `.env` loader that prints nothing on
  any path (naming a variable discloses which secrets exist; echoing a parse error echoes
  the line the secret is on) · run-store hardening: `appendFeedback` validates, and
  `appendEvent` moved under the run lock now that the decision log has two writers.
- **Three bugs found and fixed, each caught by a test written first:**
  1. **`runner.revise()` created the child attempt before building the transport**, so a
     missing key left the run wedged in `revision-requested` around an attempt that could
     never run. Reproduced live in the browser before fixing. A run now also records
     whether it came from fixtures, so a revision cannot silently switch to the real API —
     and a mock-derived board stays identifiable rather than counting as editorial signal.
  2. **The UI used `alert()`**, which blocks a page that polls itself; it wedged the
     browser pane mid-verification. Replaced with an inline notice.
  3. **Every agent's prompt could disagree with its own schema** — see below.
- **The first real API run failed, and the cause was ours (~$0.23).** Stage
  `03-difficulty-rater` was rejected three rounds running. Its prompt said *"Return one
  entry per set, keyed by its `setId`"*, so the model returned
  `{ "set-a": {...}, "set-b": {...} }` against a schema requiring `{ "grades": [...] }`.
  **The model obeyed the prompt; the prompt was wrong**, and the retry feedback lost to
  the instruction sitting in front of it.
  - **Fixtures could not have caught this.** A fixture is hand-written to match the
    schema, so A2's round-trip test proved *the schema accepts the fixture* — never that
    *the prompt produces it*. The two can disagree completely with every offline test
    green.
  - **New test `prompt-schema-agreement`** asserts every agent's prompt names the
    top-level keys its own schema requires. **It failed for five of eight agents.**
    `board-builder` is handled explicitly, its contract being "exactly one of `board` or
    `insufficientSets`", which a schema `required` array cannot express.
  - Fixed `difficulty-rater` (array, stated twice) and named the wrapper keys in
    `pair-author`, `theme-grouper`, `analogy-validator`. Stages 01 and 02 had only
    survived the failed run because the model guessed right.
- **Handbook consulted at Max's request** (he remembered debugging something similar in
  the prototype). **The failure is not recorded there** — and the search explained why:
  the prototype had **no difficulty-rater at all**; difficulty was deterministic
  (`crew.py:_normalize_board`, one set per tier). This Studio is the first to run that
  agent. **Max's decision: difficulty stays agent-rated**, since the GDD's difficulty loop
  needs it and he intends to give feedback on the ratings.
  - The search did surface a live prototype failure worth acting on:
    *"Sonnet-5 returned empty — thinking-by-default consumed the token budget."* Our
    transport sends no `thinking` parameter and Sonnet 5 thinks by default, with
    `max_tokens` capping thinking and output together. **`maxTokens` raised 4096 → 16000**
    (a ceiling, not a spend). This had not bitten us yet.
- **Verified:**
  - `npm test` → **623 pass, 0 fail** (500 at the entry below; +113 for R1, +10 for the
    prompt-schema suite). All 21 A1 run-store tests still green.
  - `node tools/check-board.js puzzles/*.json` → both clean. No board added.
  - **Boundary greps:** `api.js` and `runner.js` do no file I/O — everything through
    `run-store`; `llm.js` still owns the only server-side `fetch` (`review.js`'s is
    browser-side, calling its own API).
  - **Browser, with evidence:** run list and review page render; create → revise →
    approve all work over HTTP; double-approve correctly 409s; feedback lands as
    schema-valid `feedback.jsonl`; approved runs lock all four controls; no console or
    server errors. **Visual parity measured, not eyeballed** — tile background, border,
    radius, font, weight, size and body background are *identical values* to the game's at
    375×812 and 1280px, because the Studio links the game's real stylesheets. **No red
    anywhere** in the rendered page: the no-list holds.
  - The prompt fixes are verified **offline only** — see below.
- **Phase status: Review Studio R1 built; its automated and Claude-verifiable gates are
  MET. Two things remain open and neither is claimed as passed:**
  1. **The real-transport path is unproven.** It has been run once and it failed. The fix
     is verified against the schema and against offline tests; it has **not** been run
     against a live model. First action next session.
  2. **Max acceptance**, which is the entire point of R1: whether the thirteen quick-tags
     are the right vocabulary for what he actually wants to say about a board. Better
     found on board one than board thirty.
- **Drift check:** `docs/design.md` HR-2 updated — the Review Studio surface is arriving
  now, as an R1 subset ahead of A4/A5, with what was deferred and why recorded. No locked
  decision touched: schema v1.0 unchanged, zero dependencies held (`node:http`, `node:util`,
  `node:crypto`, `structuredClone` — all built-ins), engine-first intact, and the game's
  `board-view.js` untouched per amendment 2.
- **Next:**
  1. **Generate one real board and confirm it clears stage 03.** The prompt fix is
     unverified against a live model; treat it as unproven until a run completes.
  2. **Then the loop itself:** batches of ~10 with a rules recompile between, so batch 3
     vs batch 1 answers whether feedback actually changes the output. After ~30, compile
     `rubric.md` from the approved rules — A4's centrepiece, evidence-backed.
  3. **Tell Claude if the tag vocabulary is wrong.** Changing it later means re-reading
     old feedback through a new lens.
  4. Then A4's remainder, A5 (where budget rates get calibrated against real spend), A6a,
     then Review Studio B1–B3 proper, which is what fully closes HR-2.
  5. Carried: First Light `explanation` editorial pass (Red set weakest) · GDD drift to
     propose upstream (Appendix A pre-v1.0 schema, §8's missing `already-tried` row,
     motion 187–281ms vs Appendix E's 120–180ms) · the tutorial board's sets 2–4 wording
     is Max's to edit.

## 2026-08-02 — Studio Core A3: pipeline, blackboard, budget, mechanical gates

Built on `work/studio-core-a3` (commit `a075ea0`), red-first throughout. **No game code
touched** — `src/`, `styles/`, `index.html` and `puzzles/` are byte-identical to the entry
below; `git diff main -- src/ styles/ index.html puzzles/` is empty. A1 built the contracts
and storage, A2 the pure agents and injected transport; nothing connected them. A3 is what
makes the Core actually run.

- **New modules.** `blackboard.js` — in-memory artifact exchange for one attempt; a board
  rebuilt from stage outputs alone is indistinguishable from the original, which is what
  makes resume and revision deterministic rather than approximate, and `snapshot()` rolls
  every stage up beside its original output (provenance kept, not replaced).
  `budget.js` — request/token/cost/duration caps at stage, attempt and run scope; failed
  calls count. `pipeline-config.js` — models, prices, retry limits and caps as pure frozen
  data. `pipeline.js` — the orchestrator. `run.js` — the CLI adapter.
- **`pipeline.js` holds the boundary line.** It imports no `fs` and calls no `fetch`
  (verified by grep); every read and write goes through `run-store.js`, which is still the
  only writer of run artifacts, and `llm.js` still owns the Studio's only `fetch`. A failed
  stage is a recorded outcome — `failure.json`, a failed attempt, a returned result — never
  an exception reaching the caller. Only non-`StudioFailure` errors (i.e. bugs) escape.
- **Decisions made while building, all inside the approved spec:**
  - **Two retry classes with separate bounds** — `transport: 3` (llm.js's own loop, which
    already handles backoff and `retry-after`) and `validation: 2` (the pipeline's, the
    only place that can send the model concise feedback about *why* its output was
    rejected). Nesting one inside the other would have made the real bound 9.
  - **Stage input wiring lives in `pipeline.js`**, not in the agents. Which output feeds
    which input is orchestration knowledge; the agents' four-function contract is unchanged
    and they remain unaware of each other.
  - **`validation.json` is written last and only on success**, so a stage that has one is
    genuinely finished — which is exactly what `findFirstIncompleteStage` asks. Rejected
    rounds are kept as `response.rejected-N.txt` / `validation.rejected-N.json`; no failed
    response is ever erased.
  - **Model tiering is the spec's, not a fresh call** — Sonnet 5 for the five reasoning
    agents, Haiku 4.5 for the three narrow checkers (spec §"Budget and execution limits").
    Prices use Sonnet's **standard** $3/$15 rather than the introductory $2/$10, since a cap
    computed from the cheaper price stops enforcing when the intro period ends. Recorded as
    `pricingVersion: "2026-08-02"`.
- **`run.js` — one bullet beyond A3's literal spec list, approved in the plan.** The spec
  lists it in the repo layout but not in A3's implementation bullets. It went in now because
  HR-2's reconsider-when trigger is *"the Core grows a capability Max cannot see or exercise
  without reading code"* — and A3 is exactly that growth. HR-2 updated accordingly.
- **Additive to `run-store.js` only:** `writeStageText`, `writeAttemptArtifact`,
  `readAttemptArtifact`, `hasStageArtifact`, `listAttempts`, `recordStageStatus`,
  `recordUsage`; plus `writeTextAtomic` extracted from `writeJsonAtomic` (behaviour-
  preserving). **All 21 existing run-store tests and all 6 atomic-write tests unchanged and
  green** — no existing test was edited to accommodate new code.
- **Two things found while building, both fixed or recorded:**
  - **Bug:** usage was persisted only at the *end* of a run, so a process killed mid-run
    lost its spend record and every resume started the attempt's allowance over — the
    attempt cap could never bite. Now persisted after each stage. Caught by the resume
    suite, not by inspection.
  - **Architectural fact, verified in code:** `checkBoard` **cannot reject a schema-valid
    board**. With sixteen distinct words no two sets can share an ordered 4-tuple, so the
    accepted count is always exactly sixteen and `collisions` is always empty. It is a
    regression guard on the *engine*, not a per-board content check; `validate-puzzle.js` is
    what actually rejects boards at `04a` — in practice catching pre-v1.0 drift (`words[]`,
    a per-set `tier`) that the Board Builder's own semantic checks let past. **Nothing
    mechanical catches a board that is merely bad.** `docs/design.md` risk 1 sharpened to
    say so; a backlog line asks whether A5 should add a check that can.
- **Verified:**
  - `npm test` → **500 pass, 0 fail** (baseline 414 at the entry below; 86 new tests across
    `test/studio/pipeline/`: blackboard, budget, config, pipeline, integrity-gate, failures,
    revision, resume, run-cli).
  - `node tools/check-board.js puzzles/first-light.json puzzles/tutorial.json` → both clean,
    16/16 accepted tuples each. No board was added this session.
  - **Boundary-law greps:** no `fs` import and no `fetch` in `pipeline.js`; only
    `run-store.js` + `atomic-write.js` write run artifacts; only `llm.js` calls `fetch` in
    `studio/`; engine + `validate-puzzle.js` still import nothing outside themselves.
  - **Real CLI, not just tests.** `node studio/run.js --mock --theme "Lantern light"` →
    `attempt 0001: complete`, board "First Light", 8 requests / 7,128 tokens / ~$0.0421, and
    a 47-file run directory with per-stage `request.json` · `prompt.txt` · `response.txt` ·
    `output.json` · `validation.json`, the gate's `integrity.json`, plus `blackboard.json`,
    `board.json`, `manifest.json` (`awaiting-review`) and `decisions.jsonl`. Then
    `--revise-from 04-board-builder` → attempt `0002` reused stages 01–03 and re-ran 04
    onward in 5 requests, with `parent-attempt.json` naming the reused stages.
  - **Failure, gate, revision and resume paths are covered by tests, not assertions:** each
    of the three failure categories plus budget and integrity exhaustion recorded without
    throwing; the parent attempt proved byte-identical across a revision by hashing its tree
    before and after; the interrupted attempt produced by a real kill mid-write (a store
    that throws on one write), then resumed at exactly that stage with the half-written
    folder quarantined as `.partial-1` and cumulative spend carried forward.
  - **No browser verification** — nothing player-visible changed. The Studio is headless by
    HR-2; its surface is the CLI above.
- **Phase status: Studio Core A3 built, and its gate is MET.** A3's gate is automated +
  Claude-verifiable (tests, mock end-to-end run, artifact inspection) — there is no Max
  acceptance item in it, so nothing here is being marked passed on Max's behalf. Game phases
  are unchanged: **Phases 1–4 closed**, Phase 5a planned and not started.
- **Drift check:** two `docs/design.md` updates, both recorded above — risk 1 sharpened with
  the verified `checkBoard` fact, and **HR-2** updated (status now A1+A2+A3, interim
  verification surface now 500 tests plus the CLI, and the reconsider-when trigger tightened
  to "the Core grows a capability *the CLI* cannot exercise"). No locked decision touched:
  schema v1.0 unchanged, zero dependencies held (Node built-ins and `node:test` only, incl.
  `node:util`'s `parseArgs` and `structuredClone`), engine-first intact.
- **Next:**
  1. **Studio Phase A4 — initial corpus and variety.** **Blocked on Max:** he drafts
     `studio/corpus/rubric.md`, the one input only he can write. The rest of A4 —
     shipped-board examples, relationship taxonomy + index, machine-readable rubric, 5–8
     annotated near-misses, holdout cases stored for A6b — follows from it.
  2. Then A5 (evaluation — also where budget rates get calibrated against real spend and
     where the "can anything mechanical catch a bad board?" backlog item is answered),
     A6a (feedback capture, required for Core's Definition of Done), then Review Studio
     B1–B3, which is what actually closes HR-2.
  3. Independent and unblocked: **Phase 5a** — daily + archive + mid-puzzle persistence,
     plan at `~/.claude/plans/keen-percolating-boot.md`.
  4. Carried from before: First Light `explanation` editorial pass (Red set weakest) · GDD
     drift to propose upstream (Appendix A pre-v1.0 schema, §8's missing `already-tried`
     row, motion 187–281ms vs Appendix E's 120–180ms, §17.3 answered) · the tutorial board's
     sets 2–4 wording is Max's to edit.

## 2026-08-02 — Migrated onto project-template (governance, recovery, house rules)

Process-and-docs session on branch `work/template-migration`. **No product code touched**
— `src/`, `studio/`, `test/`, `puzzles/`, `styles/` and `index.html` are byte-identical to
the entry below. ASTO predates `project-template`, so this is the governance-doc migration
protocol run for the first time, not a birth.

- **Adopted from the template** (reviewed against its only commit, `da70440`, since the
  template repo has no tags or changelog):
  - `.claude/settings.json` — directory grants for `../maigd-course-handbook` (the Brain)
    and `../project-template` (added in a follow-up commit after the merge, so migration
    reviews read the template directly; noted in `CLAUDE.md` §11), plus the
    `Read(./.env)` / `Read(./.env.*)` denial. The untracked `settings.local.json` (the
    `npm test` allow) is unchanged. **Note:** Claude Code reads `settings.json` at
    startup, so the grants take effect from the next session, not the one that wrote them.
  - `.claude/commands/pause.md` — **new third command.** A truthful checkpoint for
    interrupted work: reports failures honestly, commits `wip(...)` on the work branch,
    leaves `main` alone, and states plainly that the gate did **not** pass.
  - `docs/governance.md` (verbatim — authority order, project health check, migration
    protocol, upstream proposals) · `docs/decisions/README.md` (verbatim ticket format,
    no tickets invented) · `docs/backlog.md` (empty parking lot).
  - `docs/recovery.md` — adopted and **ASTO-corrected**: no `npm install` step (zero
    deps, Node 22+ only), a "the game won't load" section for the `file://` trap, and a
    truthful "what recovery can't restore" naming browser `localStorage` (tutorialSeen,
    per-puzzle results) and git-ignored `studio/runs/`.
  - `docs/brief.md` — **written for ASTO**, derived from the GDD v0.13 and design.md's
    Context. It restates product intent and decides nothing new; the "locally shipped"
    definition it records is the GDD's own (10+ curated boards, tutorial → select → real
    win/loss, results surviving reload).
  - `.gitignore` merged (secrets, node_modules, build output, OS junk, `*.local` — the
    old lone `.DS_Store` line is subsumed) · `.gitattributes` · `.env.example` (names
    `ANTHROPIC_API_KEY` for the Studio's real transport, no value) · `template.json`.
- **`CLAUDE.md` folded, not replaced.** Every ASTO rule survives verbatim in meaning —
  locked decisions, the boundary law, the game rules that are easy to get wrong, the GDD
  no-list, taps-over-drag. New house sections: working with Max, the Brain knowledge loop,
  house architecture defaults, the Studio contract, gate kinds, git/recovery, safety
  rails, template provenance.
- **The real behavior change: git discipline.** `main` now holds **verified states only**;
  implementation runs on `work/<phase>` branches; `/wrapup` merges when the gate passes;
  `/pause` checkpoints WIP. The old `/wrapup` pushed straight to `main`. Commit trailer is
  now the model-agnostic `Co-Authored-By: Claude <noreply@anthropic.com>`.
- **`/warmup` and `/wrapup` extended, ASTO content kept.** warmup gained branch awareness,
  an open-decisions/backlog step, and a Brain check for new phases; wrapup gained the three
  gate kinds (with **Max acceptance never assumed** — ASTO's phase gates are playtest
  gates), blocking-vs-non-blocking routing with a switch-to-`/pause` escape hatch, ticket
  closing, the work-branch merge flow, and the `v0.1.0-local` tag trigger. Both keep
  `check-board`, the boundary-law refresher, and "a playtest is the gate".
- **Deliberately not adopted:** `/birth` (ASTO is already born and its plan approved), the
  template's `studio/index.html` proof-of-life page (ASTO's `studio/` is a real pipeline),
  and the template's skeleton `design.md` / `log.md` / `README.md`.
- **Design-doc drift — one deliberate change.** `docs/design.md` gained a **House-rule
  exceptions** section (+51 lines, 0 deletions — verified with `git diff --numstat`).
  Two exceptions recorded with reconsider-when triggers: **HR-1** strict zero dependencies
  (stricter than the house default; reconsider if hand-rolling a security/auth/parsing/
  storage/accessibility problem would be *less* safe than a library) and **HR-2** the
  Studio web surface deferred to Review Studio Part B (reconsider if Part B slips past the
  next phase gate, or the Core grows a capability Max can't exercise without reading code).
- **Verified:**
  - `npm test` → **414 pass, 0 fail** — identical to the pre-migration baseline taken at
    the start of the session.
  - `node tools/check-board.js puzzles/first-light.json` → clean, 16/16 accepted tuples.
  - `grep -rn "{{" --include="*.md" --include="*.json" .` → the only hit is
    `docs/governance.md`'s own description of the placeholder check. No unresolved
    placeholders survived from the template files.
  - `git diff main --stat` → 16 files, all docs/config; no `src/`, `studio/`, `test/`,
    `puzzles/`, `styles/` or `index.html` in the diff.
  - Governance health check run end-to-end: required docs present, current phase has a
    defined gate, `.gitignore` covers `.env`, settings deny-rule intact.
  - **Preview browser** (`npm run serve`, 375×812): the game loads, the first-run tutorial
    renders with its board and coach-mark, zero console errors. Repo reshuffle broke
    nothing.
- **Phase status:** unchanged by this session — **Phases 1–4 closed**, Phase 5a planned and
  not started, Studio Core at A2 with A3 next. This session had no phase gate of its own;
  its gate was the migration verification above (automated + Claude-verifiable), which
  passed, so the branch merged to `main`.
- **Session commits:** `94cf289` (migration, on `work/template-migration`) → `495d3b8`
  (merge to `main`, branch deleted) → `1d5ae9f` (the `../project-template` grant, a tiny
  verified fix taken directly on `main` per `CLAUDE.md` §9). `npm test` re-run green after
  the merge and again at wrapup — 414/414 each time.
- **Wrapup ran the new `/wrapup` for the first time**, which is the migration's own first
  proof: it correctly reported a clean tree already in sync and required no new commit
  beyond this log correction.
- **Next:**
  1. **Studio Phase A3 — pipeline and mechanical gates** (unchanged from below). Eight-stage
     orchestration · `blackboard.js` · integrity insertion at `04a` · `budget.js` ·
     failure recording · revision entry points · immutable child attempts · resume wired to
     `findFirstIncompleteStage`. Start it on `work/studio-core-a3` — the new git rule is
     live from now on.
  2. Then A4 (corpus + variety — **Max still drafts `studio/corpus/rubric.md`**), A5,
     A6a; Review Studio B1–B3 after Core, which is what closes HR-2.
  3. Independent and unblocked: **Phase 5a** — daily + archive + mid-puzzle persistence.

## 2026-08-02 — Studio Core A1 + A2 built (contracts, storage, agents, transport)

Second half of the same session as the entry below, which approved the design. **No game
code touched** — `src/`, `styles/` and `index.html` are byte-identical to Phase 4, and no
board was added. Everything here is new `studio/` and `test/studio/`.

- **A1 — contracts and storage (commit `15fe304`).** `stage-registry.js` (9 ordered
  stages = 8 agents + the `04a-integrity` gate, deeply frozen; `stagesFrom()` is the one
  primitive both revision and resume re-entry use) · `schemas.js` (manifest/attempt
  validators in the `validate-puzzle.js` style — pure, never throw, collect every error —
  plus the run-status transition map) · `storage/atomic-write.js` (temp → fsync → rename;
  a failed write neither clobbers the destination nor leaves litter) ·
  `storage/lock.js` (pid-aware: a dead holder's lock is stolen, a live one blocks with a
  typed `LockHeldError`) · `storage/run-store.js` — **the only module that touches run
  artifacts**, enforcing monotonic attempt ids, one running attempt per run, immutability
  of completed attempts, the transition map, and jsonl decisions/feedback.
- **A2 — agent boundaries and mock transport (commit `e825fec`).** `schema-check.js`
  (zero-dep declarative validator) · `failures.js` (the three retry categories as one
  pure decision) · `llm.js` (injected transport, retry loop with backoff + `retry-after`,
  the request record; **the only `fetch` in the Studio**) · `mock-transport.js` (fixture
  replay, scriptable failures) · the **eight pure agent modules** behind
  `agents/index.js`, sharing `agent-kit.js` · 8 committed fixtures in
  `studio/fixtures/responses/`.
- **Decisions made while building (all inside the approved spec, none overriding it):**
  - **Resume rule implemented as Max specified.** A partial stage folder is **quarantined
    to `<stage>.partial-<n>`, never deleted**, and its stage reruns fresh; the half-written
    work stays readable. Immutability is scoped to *completed* work, not whole attempts.
  - **`failures.js` split out of `llm.js`** (the spec listed no separate module). llm.js
    owns the I/O, failures.js owns the meaning — so the entire retry policy is testable
    with zero network, the same reason agents are pure. **Unrecognized failures default to
    terminal:** an unknown failure that retries is an unbounded loop.
  - **`schema-check.js` added** — zero deps means no JSON Schema library, and eight agents
    needed one dialect between them. Structured output from the API is a convenience;
    this is the authority.
  - **`storage/migration.js` deliberately not created.** With only schema v1.0 in
    existence it has no job; "old schema opened by new code fails loudly" already lives in
    the validators and is tested. It appears when a second version does.
  - Model IDs live in config, not agent files: `claude-sonnet-5` /
    `claude-haiku-4-5-20251001` (§12.1's tiers, current IDs).
- **The boundary law is enforced by test, not convention.** The agent contract suite reads
  each module's source and asserts no `fetch`, no `node:fs`, no transport import — plus no
  input mutation, and that **approved rules actually reach every prompt** (learning that
  silently failed to arrive would otherwise be invisible). The **Test-Player is blind by
  construction**: a test hands it the *entire* board — sets, explanations, integrity
  report — and asserts no label, explanation or set id reaches the prompt. **Board
  Builder's output is validated against the game's own `validatePuzzle()`**, so pipeline
  and game cannot drift.
- **One real bug, caught by its own test:** the Test-Player prompt rendered "you lose on
  your **3th** mistake" for any non-default allowance. Fixed with a proper ordinal.
- **Verified:** `npm test` → **414 pass, 0 fail** (was 154; +260, every one watched red
  first). `node tools/check-board.js` → 2 boards, all clean. A round-trip suite drives all
  eight agents through `llm.js` over the mock transport with `globalThis.fetch` replaced by
  a throwing stub — **zero network calls**, and the fixture board passes the game
  validator. **No browser verification was done or needed** — no UI file changed.
- **Phase status: Studio A1 and A2 complete and verified. A3 not started.** The Studio has
  no gate of its own until Core is runnable; the spec's Definition of Done is the target.
  Game phases are unchanged: **Phases 1–4 closed**, Phase 5a planned and not started.
- **Design-doc drift:** none new. `docs/design.md` is untouched and still describes the
  game only — correct, since the Studio has its own spec
  (`docs/superpowers/specs/2026-08-02-asto-studio-design.md`). The four deviations from
  that spec are listed above and are all additive.
- **Next:**
  1. **Studio Phase A3 — pipeline and mechanical gates.** Eight-stage orchestration ·
     `blackboard.js` · integrity insertion at `04a` (free sweep before evaluation tokens) ·
     `budget.js` enforcement · failure recording · revision entry points · immutable child
     attempts · **resume wired to `findFirstIncompleteStage`** (A1 built the storage half;
     A3 makes the pipeline use it). Fixtures and the run-store contract are ready for it.
  2. Then A4 (corpus + variety — **Max drafts `studio/corpus/rubric.md`**, the one input
     only he can write), A5 (evaluation), A6a (feedback capture).
  3. Independent and unblocked: **Phase 5a** — daily + archive + the newly added
     **mid-puzzle persistence** (see the entry below).
  4. Carried: First Light Red-set `explanation` pass · the GDD drift list (Appendix A
     schema, §8's missing `already-tried` row, motion 187–281ms vs Appendix E's 120–180ms,
     §17.3 answered, and §16's "empirical" wording now contradicted by the spec's
     predicted/simulated/human-observed split).

## 2026-08-02 — AI Puzzle Studio designed and approved; Phase 4 gate CLOSED

- **Phase 4 gate: MET.** Max playtested on the phone and called it good. Phases 1–4 are
  now all closed.
- **No game code this entry.** Design session: the AI Puzzle Studio brainstorm (paused
  2026-08-01 at the agent-roster question) resumed, completed, and was approved as
  **`docs/superpowers/specs/2026-08-02-asto-studio-design.md`** — the authority for all
  Studio work. `CLAUDE.md` updated: the Studio lives at `studio/` in THIS repo (it
  imports the game's validators directly); the handbook keeps the retired Python crew.
- **Decisions made with Max (see the spec for full detail):**
  - **All eight GDD §12.1 agents**, in order; the mechanical integrity sweep is a
    deterministic gate between Board Builder and Analogy Validator, not a ninth agent.
  - **Theme or surprise-me** (`--theme` or bare); surprise-me briefs are built from a
    relationship index so variety is pipeline logic, not memory.
  - **Two human gate types only** — editorial decision after a complete attempt, and
    (later, A6b) learning-policy approval. No gates between agents.
  - **Corpus** = extracted positives from shipped boards + Max's hand-authored
    `rubric.md` with 5–8 annotated near-misses.
  - **Feedback Learning Loop** (Max's major addition): every editorial action becomes a
    structured, routed feedback event; agents learn via versioned external memory
    (policies/examples/calibration) with per-attempt learning snapshots; permanent rules
    always require Max's approval. Split: **A6a capture is required for Done; A6b
    proposals/benchmarks build when feedback volume justifies.**
  - **Runs vs. immutable attempts**; interrupted attempts **resume** at the first
    incomplete stage (same re-entry machinery as revision) — Max's call, revised from
    the draft's mark-failed-and-restart.
  - **Blind Test-Player** — sees only what a player sees; simulated results are never
    labeled empirical. Predicted / simulated / human-observed difficulty are three
    distinct measurements (§16's Difficulty Loop, honestly framed).
  - **Review Studio matches the app literally** — links the game's stylesheets; board
    markup intentionally duplicated (~40 lines), `board-view.js` untouched (it owns
    FLIP-critical keyed DOM). GDD no-list applies to the Studio UI too.
  - **Core success bar:** an engine-valid, editorially reviewable board with a complete
    audit trail — not first-run approval-unchanged.
- **Game-side decision recorded for Phase 5a:** **mid-puzzle persistence** — leaving a
  puzzle (including reload/closed tab) restores board state. Amends the approved 5a
  plan (`~/.claude/plans/keen-percolating-boot.md`), which had scoped it out; fold in
  when 5a begins.
- **Next:**
  1. **Studio Phase A1 — contracts and storage, red-first** (stage registry, schemas,
     manifest, immutable attempts, atomic writes, locking, status transitions).
  2. Then A2–A6a per the spec's implementation order; Review Studio (B1–B3) after Core.
  3. Phase 5a (daily + archive + now mid-puzzle persistence) remains planned and
     independent — either track can proceed.
  4. Carried: First Light Red-set `explanation` pass · GDD drift list (Appendix A
     schema, §8 `already-tried` row, motion range, §17.3 answered, §16 "empirical"
     wording vs. the blind-Test-Player framing).

## 2026-08-02 — Phase 4 built: first-run tutorial, coach, title screen (gate NOT yet met)

- **Built (new):** `puzzles/tutorial.json` ("Warm Up", 4 relationship-not-category sets) ·
  `src/controller/tutorial-script.js` (PURE coach-mark machine) ·
  `src/view/tutorial-overlay.js` (the coach card) · `src/view/title-view.js` ·
  `src/storage.js` (`tutorialSeen` only; guarded — Safari private mode *throws* on
  localStorage) · `test/controller/tutorial-script.test.js` · `test/storage.test.js`.
  **Changed:** `index.html` (`#screen-title`, `#tutorial-coach`), `app.js` (routing +
  `ScreenRouter` gains a title state), `game-controller.js` (`loadPuzzle`),
  `header-view.js`, `end-view.js`, `controls-view.js`, `styles/components.css`.
  **No engine changes** — `maxMistakes: Infinity` has been built and tested since Phase 1.
- **Decisions made with Max:** hand off to the real game **after the first set** (not the
  whole board) · coach-marks are a **non-blocking bottom card**, never a scrim (Appendix D
  lists the Screen 0 wireframe as *pending*, so this was a Phase 4 design decision, not a
  spec being followed) · Claude drafts tutorial sets 2–4, Max edits · **title screen** with
  Play / How to play · the **ASTO wordmark is the way home** · Play **resumes** a live
  board · controls reordered to **Shuffle · Clear · Confirm**.
- **Two engine dials, no engine code.** The tutorial runs
  `{ maxMistakes: Infinity, clearSelectionOnFail: false }`, both existing `rules` knobs.
  The second is new this session (Max): a wrong answer now **stays in the frame** so the
  diagnosis can be checked against it — and "swap that one out" becomes one tap instead of
  rebuilding from nothing. `TUTORIAL_RULES` lives in `tutorial-script.js` so the tests
  exercise the shipped config, not a stand-in.
- **The coach diagnoses instead of shrugging.** "Not quite" teaches nothing, so every wrong
  submission is classified by *why*: cross-paired · one half backwards · three-plus-a-
  stranger · two-and-two · two-and-strays · four scattered · identical repeat. Each is a
  **ladder** of 2–3 escalating lines. Derived from `state.puzzle.sets` — the tutorial is
  explicitly allowed to hint (§5.2) and never runs on a real puzzle; the main game's
  empty `so-close` payload is untouched. No line names a set, tier, label or board word.
- **Four real bugs, all in this session's own code, all found by Max playtesting:**
  1. **Coach updated ~900ms after the status strip.** Measured with a MutationObserver:
     status 1ms, coach 894ms. It sat *after* `FrameView`/`BoardView` in the views array
     and the controller awaits each view, so it queued behind both ±4px shakes. Moved
     ahead of the animating views → **1ms**. Nothing in `node:test` can catch this class
     of bug; there is now a comment at the call site.
  2. **The coach went permanently deaf after the first solve.** `if (solvedSetIds.length >
     0) return STEPS.done` sat above every other branch, so a player who kept playing
     instead of pressing Continue got congratulated forever — a wrong answer changed
     nothing. Now the Continue **action** is sticky; the **words** are not. *A test named
     "done sticks" was asserting this exact bug and holding it in place.*
  3. **Identical copy read as frozen.** Three different scattered guesses produced one
     byte-identical sentence. Fixed by the ladders above; a submission also always
     re-animates the card even when the wording is unchanged.
  4. **Nothing changed between taps 1–3** while filling the frame. Now one line per tap
     (`relationship → pair-hunt → notation → one-more → order`), with the `::` lesson
     moved to two words — the first moment the frame shows a whole pair.
  Also fixed: leaving for the title screen **abandoned the board**. `Play` now resumes when
  that puzzle is still in play (`status === 'playing'` — a finished board correctly starts
  fresh). And a test leak-check was substring-based, flagging "sha**red**" as leaking the
  tier "red"; it is word-boundary aware now.
- **Verified:** `npm test` → **154 pass, 0 fail** (was 103; +51, red-first).
  `check-board.js puzzles/tutorial.json` → schema v1.0 ✓, **16/16 accepted of 43,680
  ordered tuples**, 0 collisions. Browser at 375×812, `localStorage` cleared: fresh profile
  lands in the tutorial (not the title), **no bean pips**, 5 wrong submissions never left
  the play screen, all 7 diagnoses fired on the real board, 9 moves → 9 distinct lines,
  6 consecutive Confirms → 6 distinct lines. Hand-off, Skip, replay, resume (solved card +
  spent bean + half-filled frame all survived), Back to title from win *and* loss, and the
  §16 First-Run Tutorial criterion all confirmed. Reduced motion exercised by overriding
  `matchMedia`: `settleIn`/`shake`/`fadeOut`/`pulse` all returned in **0ms**. Desktop
  1280px no overflow; zero console errors; all requests 200.
- **Honest limitations:** (a) **no phone playtest yet — the gate is unwalked.** (b) The
  preview browser never advances its animation timeline, so motion was verified logically,
  never watched. (c) Ladders are 2–3 rungs; the same mistake more times than that repeats
  its top rung (the card still re-animates). (d) There is now **no way to abandon a board
  mid-game and restart it** — Play resumes, and "Play again" only exists on the end screen.
  Phase 5's select surface is its natural home.
- **Design-doc drift (deviations recorded here, `design.md` left as approved):**
  - **Title screen is not in `design.md`'s Phase 4** — routing was deferred to Phase 5. It
    is a precursor to the select surface and Phase 5 may absorb it.
  - `design.md`'s "pips hidden via a view flag" proved **unnecessary** — `maxMistakes:
    Infinity` already renders zero beans. Only the `aria-label` needed suppressing (it was
    announcing "0 of 0 mistakes used").
  - `tutorialSeen` is recorded when the **last coach-mark appears**, not only on
    Continue/Skip, so a player who wanders off after being coached isn't taught twice.
- **Phase status: Phase 4 built and verified in the preview browser — GATE NOT MET.**
  The gate is Max's playtest on a real iPhone: coach-card placement against the safe area,
  and whether the shake still reads as "wrong" now that the tiles stay put.
- **Next:**
  1. **Max playtests Phase 4 on the phone.** That closes the gate.
  2. **Phase 5a — daily puzzle + archive calendar.** Plan written and approved this
     session: `~/.claude/plans/keen-percolating-boot.md`. Manifest (`puzzles/index.json`) ·
     `validate-manifest.js` · pure `daily.js` (injected `today`, never `toISOString()`) ·
     `results.js` + persisted per-puzzle results · `archive-view.js` calendar ·
     Next-puzzle chaining · tighten `date` to `YYYY-MM-DD` when present (a tightening, not
     a schema change) · drop the tutorial's `date`. Built against the **2** existing boards.
  3. **New decision to record upstream:** Max chose the **daily puzzle format** with a
     calendar archive — this answers GDD **§17.3**'s open question ("daily puzzle format or
     puzzle packs?"). It is a deviation from `design.md`'s flat `select-view.js` list.
  4. **Phase 5b — content.** The remaining 8 boards come from the **AI Puzzle Studio**
     (Max's call), whose brainstorm is still paused at the agent-roster question. Because
     the Studio authors them, it also produces §16's **Difficulty Loop** and **Pipeline
     Demo** artifacts — so **Phase 5's gate needs no reword after all**, contrary to the
     2026-08-01 entry. 5a is gated on its own checklist instead.
  5. Carried: First Light `explanation` editorial pass (Red set weakest) · GDD drift to
     propose upstream (Appendix A pre-v1.0 schema, §8's missing `already-tried` row, motion
     now 187–281ms vs Appendix E's 120–180ms, §17.3 answered twice over now) · the
     tutorial board's sets 2–4 wording is Max's to edit.

## 2026-08-01 — Started: AI Puzzle Studio design (brainstorm paused mid-way)

**No code written.** Design conversation only, paused by Max to resume next session.

- **Why this started:** Max noticed `docs/design.md` covers only the game — the AI Puzzle
  Studio pipeline is explicitly out of scope there ("the crew gets re-tooled later").
  Decision: **do not** bolt it on as a Phase 6; give it its own design plan, including a
  **web interface for Max to review agent outputs and give editorial feedback.**
- **Gap found in the existing plan (unresolved, deliberately):** Phase 5's gate says
  "full §16 acceptance pass", but GDD §16 includes two criteria no phase builds —
  **Difficulty Loop** (test-player agent produces empirical 1–4 grades) and **Pipeline
  Demo** (a puzzle traceable prompt → agent reports → decision log → JSON). Max chose to
  leave `design.md` untouched and let the Studio plan cover them. **Phase 5's gate will
  need rewording when we get there.**
- **Findings from exploring `../maigd-course-handbook/projects/asto/`:**
  - A **runnable 5-agent Python crew already exists** (~1,200 lines: Pair Author, Board
    Builder, Analogy Validator, Adversarial Solver + human editor; blackboard
    orchestration, bounded revise loop, `--mock` offline mode, Assignment-4 RAG layer,
    3 generated boards with traces + reports).
  - **Correction to an earlier log claim:** `crew/schema.py` is *already* near schema
    v1.0 — camelCase, `pairs` as source of truth, required `explanation`, derived 16
    terms, one set per difficulty. Only a leftover `tier` field drifts. The pre-v1.0
    problem is the **GDD's Appendix A**, not the crew code.
  - Max's call: **fully clean slate** — none of the code, corpus, or rubric carries over.
    Consequence to honour in the plan: the grounding corpus and editorial rubric are
    **editorial deliverables that must be budgeted**, not things that appear for free.
    The plan should also re-specify `--mock` mode and a bounded revise loop from the
    start (the two pieces that cost real debugging last time).
- **Design insight worth keeping:** `board-integrity.js` already proves mechanical
  uniqueness exhaustively (43,680 tuples, exactly 16 accepted). The **Adversarial Solver
  must not re-do that** — its job is the part brute force provably cannot see:
  *human-plausible* alternate readings (design.md risk 1).
- **Decisions locked this session:**
  1. **Purpose: both, tool-first** — it must genuinely author Phase 5's boards, with the
     §16 demo falling out of a legible review UI.
  2. **Clean slate**, no carry-over of code or content.
  3. **Node, zero dependencies** — Anthropic API over built-in `fetch`. The studio
     imports `src/source/validate-puzzle.js` and `src/engine/board-integrity.js`
     **directly**, so pipeline and game share one validator and schema drift becomes
     structurally impossible. Keeps the repo's zero-dep rule intact; tests via `node:test`.
  4. **UI scope: review, decide, and send revisions back** — approve/revise/reject with
     notes, and a revise re-invokes the pipeline from the right stage.
  5. **Split into two specs** with the **run-directory format as the contract** between
     them: **Studio Core** (agents + orchestration + artifacts, CLI-driven) then
     **Review Studio** (the web interface). Core is designed and built first.
- **Open — first question next session:** the **agent roster**. GDD §12.1 specifies eight;
  the options on the table were All 8 · Six (Pair Author, Board Builder absorbing Theme
  Grouper, Difficulty Rater, Analogy Validator, Adversarial Solver, Test-Player —
  deferring Style Guide) · Five · Four-then-grow. Note §16's Difficulty Loop requires the
  **Test-Player**, and §9.1 calls it "ASTO's primary difficulty instrument".
- **Also still open:** theme input (Max-supplied vs generated) · where the human gate sits
  in the run · model tier per agent + token budget (GDD §12.5 estimates ≈30k/pass,
  45–60k/approved puzzle) · corpus authoring approach · run-directory layout.
- **Next:**
  1. **Resume the Studio Core brainstorm** at the agent-roster question, then the open
     items above → design doc at `docs/superpowers/specs/` → implementation plan.
  2. Unchanged and independent: **Phase 4 — first-run tutorial** (no engine work needed;
     `maxMistakes: Infinity` has been built and tested since Phase 1). Phase 4 and the
     Studio are separable — either can go first.
  3. Carried: First Light `explanation` editorial pass · §8.3 watch on free so-close
     repeats · the four-item GDD drift list (motion range, `already-tried` row,
     explanation question, Appendix A schema) · Phase 5 gate rewording noted above.

## 2026-08-01 — Phase 3 complete: win/loss screens, share, and the motion pass

- **Built (new):** `src/view/end-view.js` (win + loss screens) · `src/view/motion.js`
  (flip, shake, settleIn, fadeOut, pulse, prefersReducedMotion) · `src/share.js`
  (pure `buildShareText` + `share()` with navigator.share → clipboard → selection
  fallback) · `test/share.test.js`. **Changed:** `index.html` (#screen-end),
  `styles/*` (end screens, REVEALED badge, paper grain, `.screen[hidden]`),
  board/frame/solved-sets views (motion), `game-controller.js` (async serialized
  render + `restart()`), `app.js` (ScreenRouter, share wiring). **No engine changes.**
- **Decisions made with Max:** Share = Connections-style tier-square grid, spoiler-free ·
  **no "Next puzzle" button** (depends on Phase 5 manifest/routing) — win screen offers
  **Play again** instead · **explanations shown on the win screen too**, not just the
  loss screen. That last one closes a GDD §17.3 open question ("how much explanation
  should solved sets reveal?") — propose upstream.
- **Verified:** `npm test` → **103 pass, 0 fail, exit 0** (8 new share tests, red-first);
  `check-board.js` exit 0. Manual gate in preview browser at 375×812 walked the **GDD §16
  checklist item by item** — all passed. Canonical beat confirmed by submitting
  `Fire|Spark|Tree|Seed` and watching the frame reorder to `Seed|Tree|Spark|Fire` before
  clearing. Loss screen shows all four sets, unsolved ones badged REVEALED, every card
  with its explanation. Share text verified spoiler-free (`ASTO — First Light / 4/4 ·
  no beans / ⬛🟩🟥🟨`, squares in solve order; unit-tested against all 16 board words).
  Play again fully resets. Reduced motion: full game playable, helpers return in 0ms.
  Desktop 1280px: no overflow. Zero console errors, all requests 200.
- **No-list audit:** grain on `button.tile` and `.solved-card` only (page background
  `none`); used bean = `rgb(92,70,51)` roast brown, never red; no `setInterval`, no rAF
  loops, no confetti, no particles. The only `setTimeout` is motion's liveness guard.
- **Three real bugs found at the gate, fixed and re-verified:**
  1. **`.screen[hidden]` did nothing** — `.screen { display: flex }` outranks the UA
     stylesheet's `[hidden] { display: none }`, so screens rendered stacked. **Latent
     since Phase 2** (the error screen had the same flaw, never exercised).
  2. **`Animation.finished` can never resolve** (it doesn't in the preview browser at
     all) — and view rendering had been chained onto it, so a stalled animation froze
     the whole game. Every helper now races a bounded timer AND cancels unfinished
     animations. **Motion can no longer hold the game hostage.**
  3. **`fill: 'backwards'` left staggered cards permanently invisible** if their
     animation never ran (backgrounded tab → empty win screen). Visibility is now
     restored in a `finally`, and pending animations are cancelled so they cannot pin an
     element at its first keyframe.
- **Playtest tuning (Max, on device):** motion slowed **20%**, then a further **30%** —
  `--motion-slow` 180 → 216 → **281ms**, `--motion-fast` 120 → **187ms**. On the second
  pass the two duplicated timing constants were **collapsed into one dial**: `motion.js`
  now reads `--motion-slow` from `tokens.css` at runtime and derives the card stagger
  from it, so JS animations and CSS transitions cannot drift. Verified by setting the
  token to 500ms and confirming a JS animation reported exactly 500.
- **Architecture note:** `render()` is now async and **serialized** — a queued pass reads
  `this.state` when it runs, so it always paints the latest truth. The solve sequence
  (frame beat → board close → card settle) falls out of **view order** in `app.js`, not
  timing code. Consequence: taps during a solve animation queue rather than drop. Max
  playtested and reported it feels fine; revisit if it ever reads as laggy.
- **Honest limitation:** the preview browser never advances its animation timeline, so
  **Claude verified motion logic but never watched it play.** All visual timing judgement
  came from Max on a real iPhone.
- **Phase status: Phase 3 gate MET** — §16 checklist passed, solve animation glitch-free,
  no-list held, playtested and approved by Max on device.
- **Docs drift to propose upstream (GDD is Max-owned):** motion is now 187–281ms vs
  Appendix E's stated 120–180ms (~56% longer) · §8 feedback table still lacks the
  `already-tried` row · §17.3's "how much explanation" question is now answered
  (both end screens) · Appendix A schema still pre-v1.0.
- **Next:**
  1. **Phase 4 — first-run tutorial:** `puzzles/tutorial.json` (ordinary schema-v1.0
     board, difficulty-1 set = Seed:Tree::Spark:Fire, same validator + integrity bar),
     `tutorial-script.js` (3 coach-marks: relationship-not-category · order matters ·
     what `::` means, advance conditions keyed to controller events),
     `tutorial-overlay.js`, pips hidden via a view flag, `storage.js` `tutorialSeen`
     + skip affordance. The engine's `maxMistakes: Infinity` no-lose rule is **already
     built and tested** since Phase 1 — no engine work needed.
  2. Phase 4 gate: fresh profile lands in tutorial, cannot lose, coach-marks fire
     correctly, completion routes to First Light, returning visitor skips.
  3. Still open: First Light `explanation` editorial pass (Red set weakest) · the §8.3
     watch-item on free so-close repeats · the handbook/GDD drift proposals above.

## 2026-08-01 — Live on GitHub Pages + first playtest rule: "already tried" is free

- **Shipped the game publicly (Max's call):** repo flipped to public, GitHub Pages
  enabled from `main` root. **Live at https://maxrowe1031-rotn.github.io/ASTO/** —
  every push to `main` auto-redeploys (~1 min). All fetches were already relative
  paths, so the `/ASTO/` subpath needed zero changes. Also reachable on LAN via
  `npm run serve` + `http://<mac-ip>:8080`.
- **First real-device playtest finding (iPhone, Max):** resubmitting the exact same
  wrong four-in-order cost a second bean for the same mistake. Felt unfair; Max
  specified the fix.
- **New engine rule — `already-tried`:** state gained `failedAttempts` (every charged
  miss/so-close records its exact ordered submission; `invalid` no-ops never recorded).
  Resubmitting one → outcome `already-tried`: **no mistake**, selection clears per
  `clearSelectionOnFail`, outcome carries only `type` (no hints, like so-close). Same
  four words in a *different* order = new claim, charges normally. Status copy:
  "Already tried that one." Shake animation for it arrives with Phase 3's motion pass.
- **Deliberate scope note:** so-close repeats are also free — same fairness principle,
  but it slightly softens the §8.3 so-close economy. Flagged to Max; two-line change
  if playtesting disagrees.
- **Verified:** 7 new red-first tests (repeat miss/so-close free · repeat clears
  selection · different order charges · history survives intervening solves · invalids
  unrecorded · no-hint payload) → **95 tests, 95 pass, exit 0**; check-board still
  clean (integrity sweep probes a fresh history per tuple — acceptance surface
  unchanged). Browser end-to-end: bean → free → free → different-order bean. **Max
  re-tested on the phone and confirmed.** 3 existing tests updated off the old
  repeats-charge assumption (they looped one identical miss to rack up mistakes).
- **Docs drift:** GDD §8 feedback table now lacks the `already-tried` row — propose
  upstream (GDD is Max-owned), alongside the standing Appendix A schema drift.
  CLAUDE.md's "rules easy to get wrong" updated in-repo. `docs/design.md` outcome list
  (`solved/so-close/miss`) now reads as pre-revision; deviation recorded here rather
  than editing the approved plan.
- Housekeeping: `.gitignore` added (`.DS_Store` — one snuck into a commit, removed).
- **Phase status: Phase 2 still the last gated phase, gate met.** This session was a
  playtest-driven rules revision + deployment, not a phase.
- **Next:**
  1. **Phase 3 — win/loss screens + motion polish** (unchanged from last entry):
     `end-view.js` (win: tier cards, Share, Next puzzle; loss: reveal with
     explanations), motion pass per Appendix E — FLIP solve→canonical→card, ±4px
     shake ×3 (now also for `already-tried`), `prefers-reduced-motion`, paper grain.
  2. Playtest watch-items for the §8.3 data: does free-repeat-of-so-close give too
     much away? Still open: First Light explanations editorial pass; handbook/GDD
     drift proposal.

## 2026-08-01 — Phase 2 complete: core play screen, playable in the browser

- **Built (all new):** `index.html` (play screen, fonts link, error screen) ·
  `styles/tokens.css` (Appendix E as CSS vars — palette, tier triples, type, motion) +
  `base.css` + `components.css` · `src/source/local-json-source.js` (fetch + validate at
  the boundary, injectable `fetchFn`) · six views in `src/view/` — header (bean pips),
  status strip, frame (honey-glow next slot, pointer-event drag), board (4×4, persistent
  keyed nodes), controls (Confirm-gated), solved cards ·
  `src/controller/game-controller.js` (the only engine caller) · `src/app.js` bootstrap ·
  `test/source/local-json-source.test.js` · `.claude/launch.json`. **No engine changes.**
- **Decisions made with Max:** Google Fonts `<link>` for Bree Serif/Nunito with full
  fallback stacks (network nicety, not a dependency; self-host later) · minimal status
  strip for won/lost in Phase 2 — real end screens are Phase 3's `end-view.js`.
- **Verified:**
  - `npm test` → **88 tests, 88 pass, exit 0** (82 engine/source + 6 new source tests,
    written red-first). `check-board.js` still exit 0.
  - **Manual gate, preview browser, mobile viewport 375×812 — every item passed:**
    full win (each set solved via a *different* accepted order; cards always display
    canonical) · full loss (4 roast-brown beans, board inert after) · so-close costs a
    bean + clears + leaks no set/tier · Clear free · Shuffle unsolved-only with selection
    kept · deselect compresses (board tap AND frame-slot tap) · 4th tap never submits ·
    Confirm gated at exactly 4 · drag-to-reorder commits (drag-fixed a cross-pair frame
    into canonical and solved with it) · taps alone complete the game · zero console
    errors, all requests 200 · desktop width sane.
  - Visual spec held: tiers hidden until solve, beans never red, ink fill on Confirm
    only, honey glow on next slot, flat cream page.
  - **Max playtested and approved** ("working great").
- **Two real view bugs found by the manual gate, fixed, re-verified:**
  1. **Drag-to-reorder never committed** — the dragged slot follows the pointer via
     `transform`, and `getBoundingClientRect()` includes transforms, so the drop
     hit-test always found the dragged slot itself and read the drop as "onto yourself."
     Fix: skip the dragged slot when hit-testing (`frame-view.js`).
  2. **`setPointerCapture` could kill slot taps** — if capture throws (released/synthetic
     pointer), pointerdown died before recording the tap. Now try/caught: capture is an
     optimization, not a dependency.
  Exactly the bug class engine tests can't see — the reason the gate is manual.
- **Deviations from `docs/design.md`:** none of substance. Added `status-view.js` beyond
  the listed views (the Phase 2 minimal end-state strip, agreed with Max);
  `select-view.js`/`end-view.js`/`tutorial-overlay.js` are later phases as planned.
- **Phase status: Phase 2 gate MET** — playable win and loss in mobile emulation with
  all rule behaviors correct, playtested by Max.
- **Still open:** the four First Light `explanation` strings await Max's editorial pass
  (Red set weakest) · handbook drift (GDD Appendix A / tech spec pre-v1.0) still to
  propose upstream.
- **Next:**
  1. **Phase 3 — win/loss screens + motion polish:** `end-view.js` (win: tier cards in
     order, Share, Next puzzle; loss: unsolved sets revealed in canonical order **with
     explanations**, REVEALED badges), motion pass per Appendix E (120–180ms ease-out,
     FLIP solve→canonical→card sequence, ±4px shake ×3, `prefers-reduced-motion`),
     paper grain (inline SVG feTurbulence data-URI, tiles/cards only).
  2. Phase 3 gate: GDD §16 acceptance for core loop + end states, solve animation
     glitch-free, no-list held. Real-iPhone check recommended at this gate (design.md
     risk 4: 100dvh, safe-area, touch-action are in place but untested on device).

## 2026-08-01 — Phase 1 complete: headless engine, validator, integrity, First Light

- **Built (all new):** `package.json` (zero deps, `type: module`) · `src/engine/`
  — `arrangements.js`, `rng.js`, `tiers.js`, `engine.js`, `board-integrity.js` ·
  `src/source/validate-puzzle.js` · `tools/check-board.js`, `tools/serve.js` ·
  `puzzles/first-light.json` · 10 `node:test` suites under `test/`. README rewritten
  (run instructions, boundary law, schema v1.0 example).
- **Built test-first** — each module's suite written and run red before its
  implementation existed.
- **Verified:**
  - `npm test` → **82 tests, 82 pass, 0 fail, exit 0.**
  - `node tools/check-board.js` → First Light clean: schema v1.0 valid,
    **16/16 accepted of 43,680 ordered tuples**, 80 near-miss orderings, exit 0.
  - **Negative check:** the GDD's own Appendix A board (old schema) fed to
    `check-board.js` → **10 distinct errors, exit 1**, each naming schema v1.0. The
    validator has actually failed on purpose, not just passed.
  - **Boundary law audited:** `src/engine/**` imports only its own siblings;
    `validate-puzzle.js` imports nothing. `grep` for `Math.random` / `document.` /
    `window.` / `fetch(` / `localStorage` across `src/` returns comments only.
  - No browser check — Phase 1 ships no UI by design.
- **Engine decisions made this session:**
  - `initGame` is **deterministic** (derived board order); the controller calls
    `shuffle(state, rand)` with an injected RNG, so randomness sits at exactly one seam.
  - `rules` gained two GDD §8.3 playtest seams alongside `maxMistakes`:
    **`soCloseCostsMistake`** and **`clearSelectionOnFail`**, both defaulting to shipped
    behaviour. Revisiting either is now config, not an engine edit. Both are tested.
  - `submit` returns `invalid` with a `reason` string (`not-playing` / `wrong-length` /
    `duplicate-terms` / `off-board`) — a true no-op charging no mistake.
  - The **`so-close` outcome carries only `{ type }`** — no `setId`, no order — so the
    view physically cannot leak which set or tier the player nearly had. Asserted by test.
  - State is frozen on every return; the **puzzle is referenced, never frozen** (freezing
    is a mutation of the caller's object). Both covered by `immutability.test.js`.
- **`board-integrity.js` — honest scope.** With four disjoint sets and no explicit
  `acceptedOrders`, a 43,680-tuple sweep is *structurally guaranteed* to find 16; it
  cannot discover an alternate solution the schema makes impossible. So it samples
  through the **real `engine.submit()`** rather than reimplementing the rules: if anyone
  ever sorts a submission or otherwise widens acceptance, the count balloons past 16 and
  every board in `puzzles/` fails on the next `npm test`. That is regression protection,
  **not** protection against a human-plausible wrong reading — only playtest eyes catch
  that (design.md risk 1). It also reports the **near-miss count** (80 for a clean
  board), a real authoring signal for the size of the "So close!" surface.
- **Deviations from `docs/design.md`** (none touch a locked decision):
  1. `test` script is `node --test "test/**/*.test.js"`, not bare `node --test` — node's
     default patterns would otherwise run `test/fixtures/board.js` as a test file. This
     needs **Node 22+**; `engines` and the README say so.
  2. `tools/serve.js` (~40 lines of `node:http`) instead of `npx http-server`, which
     would have quietly broken the zero-dependency promise. Unused until Phase 2.
  3. The validator also rejects a per-set **`notes`** field (present in the GDD's old
     sample) — schema v1.0 already has `explanation` for author commentary, and two
     fields for one job invites drift. Easy to drop if unwanted.
  4. Added `test/fixtures/board.js` — engine suites run against a fixture, not against
     shipped content, so a content edit can never break an engine test.
- **Phase status: Phase 1 gate MET** — `npm test` green including a headless full win
  and full loss played through engine imports alone (`test/engine/game-flow.test.js`),
  plus the `maxMistakes: Infinity` tutorial rule proven un-losable before any tutorial
  code exists. `check-board.js` passes First Light. No `index.html` — that was the point.
- **Needs Max's editorial pass:** the four `explanation` strings in
  `puzzles/first-light.json` are Claude-drafted in the voice of the design.md example.
  The Red set ("A nest is where a bird lives, the way a den is where a bear lives")
  restates its label rather than adding to it — weakest of the four.
- **Next:**
  1. **Playtest is the gate** — but Phase 1 has no UI, so the honest check is reading
     `test/engine/game-flow.test.js` and confirming the modelled loop is the game you
     want before it gets a face.
  2. Edit the four First Light `explanation` lines to taste.
  3. **Phase 2 — core play screen:** `index.html`, `styles/tokens.css` + `base.css` (GDD
     Appendix E palette, Bree Serif / Nunito with fallback stacks),
     `local-json-source.js`, the views (header + bean pips, 4×4 board, frame with
     honey-glow next slot, Confirm-gated controls, solved cards), `game-controller.js`,
     and drag-to-reorder via Pointer Events + `setPointerCapture` (never HTML5 DnD; taps
     alone must fully suffice). Views own persistent keyed DOM nodes per term — decided
     now because Phase 3's FLIP animations die under rebuild-from-state rendering.
  4. Still open from last session: the handbook touchpoint — GDD Appendix A and
     `asto-tech-spec.md` still describe the pre-v1.0 schema. This session's validator now
     rejects exactly that shape, which makes the mismatch louder. Propose, don't rewrite.

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

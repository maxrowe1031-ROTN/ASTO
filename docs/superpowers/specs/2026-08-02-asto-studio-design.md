# AI Puzzle Studio — Core, Review Studio, and Feedback Learning Loop

**Status: approved 2026-08-02.** Authored by Max (full revision of the session draft),
with four amendments agreed in review: (1) the learning loop splits into A6a
(feedback capture — required) and A6b (proposals/benchmarks — built when feedback
volume justifies it); (2) Review Studio board rendering duplicates markup intentionally
and shares the game's CSS — game views untouched; (3) interrupted pipeline attempts
resume at the first incomplete stage, via the same re-entry machinery revision uses;
(4) the GDD no-list applies to the Review Studio UI. One game-side decision is recorded
at the end: mid-puzzle state persists across reloads, added to Phase 5a's scope.

## Context

Phases 1–4 of ASTO are built and gated. Phase 5a (daily + archive) is planned and
approved. Phase 5b requires eight additional boards, authored through the **AI Puzzle
Studio** rather than entirely by hand.

The Studio is not a game phase. It is an internal authoring system living alongside the
game, with its own design and plan. It also produces the two GDD §16 artifacts no game
phase creates:

1. **Difficulty Loop** — predicted difficulty compared with simulated and eventually
   human-observed play results.
2. **Pipeline Demo** — one puzzle traceable from prompt through agent reports and
   editorial decisions to approved game JSON.

Intended outcome:

> A local authoring system that can generate engine-valid ASTO boards, present them for
> human editorial review, learn from Max's approvals and revisions, and preserve a
> complete, immutable record of how every candidate and approved board was created.

The Studio does not replace human judgment. It makes AI-generated boards easier to
inspect, revise, improve, and reproduce.

## Locked decisions

1. **Purpose: real authoring, tool-first.** It must genuinely author Phase 5b's boards;
   output must be suitable for actual editorial review and inclusion in the game.
2. **Clean implementation, shared game contracts.** No code, orchestration logic, or
   prompt structure carries over from the retired Python crew (which was coursework).
   Intentionally reused: the puzzle schema, `validatePuzzle()`, `checkBoard()`, shipped
   boards as positive corpus material, and the game's visual tokens. "Clean slate" means
   a clean Studio implementation, not isolation from the game's authoritative contracts.
3. **The Studio lives at `studio/` inside the ASTO repository** — it must import the
   game's validators directly. **`CLAUDE.md`'s paragraph saying the crew lives in the
   handbook repo must be updated.** The handbook keeps course notes, archived
   experiments, and the retired Python crew.
4. **Node, zero runtime dependencies.** Built-in `fetch` (Anthropic API), `node:test`,
   `node:http` (Review Studio server), native fs/crypto, vanilla browser ES modules.
5. **All eight GDD §12.1 agents, in order:** Pair Author · Theme Grouper · Difficulty
   Rater · Board Builder · Analogy Validator · Adversarial Solver · Test-Player · Style
   Guide. The integrity sweep is a deterministic machine gate between Board Builder and
   Analogy Validator — not a ninth agent.
6. **Theme or surprise-me.** `npm run studio -- --theme "..."` or bare. With no theme,
   the pipeline selects an underused relationship-shape brief before invoking Pair
   Author — variety is pipeline logic, not Max's memory.
7. **No mid-pipeline human gates.** The eight agents run unattended; invalid outputs are
   retried per the failure policy. Human involvement begins once a complete candidate
   exists.
8. **Human authority is final.** Max approves (unchanged or after editing), revises,
   rejects, adds to the game, or converts feedback into a permanent learning rule.
9. **Core builds before Review Studio.** CLI, orchestration, artifact store, validation,
   mock transport, and tests green before the web interface starts. The Review Studio is
   Part B of this same design.
10. **Feedback becomes versioned pipeline memory.** Every editorial action creates
    structured feedback tied to the exact attempt. Examples and measurements may update
    automatically; permanent rules, prompt-policy changes, and acceptance-criteria
    changes require Max's approval. Every run records the learning snapshot it used.

---

# Part A — Studio Core

## Repository layout

```text
studio/
  run.js                    CLI adapter
  pipeline.js               orchestration entry point
  pipeline-config.js        stages, models, retry and budget defaults
  blackboard.js             in-memory artifact exchange during one attempt
  llm.js                    the only module that touches the network
  budget.js                 request, token, cost and duration enforcement
  schemas.js                shared Studio schemas and schema versions
  stage-registry.js         fixed stage IDs and stage definitions
  storage/
    run-store.js            the only module that reads/writes run artifacts
    atomic-write.js         temp write + atomic rename
    lock.js                 per-run mutation locking
    migration.js            future manifest/schema migrations
  agents/                   8 files, one per §12.1 agent
  corpus/
    rubric.md               Max's human-readable editorial rubric
    rubric.json             machine-readable accepted rules
    examples/               accepted.jsonl · rejected.jsonl · revised.jsonl
    relationship-index.json
    holdout/                (A6b)
  learning/
    feedback-store.js  feedback-router.js  feedback-compiler.js  retriever.js
    policy-store.js  calibration.js  benchmark.js (A6b)  tags.js
  fixtures/                 responses/ · runs/ · failures/
  runs/                     .gitignore'd run directories
  review/
    server.js  api.js
    ui/  index.html · review.js · review.css
test/studio/                agents/ pipeline/ storage/ learning/ review/ fixtures/
```

## Boundary laws

- **Agent modules are pure.** Each exports `buildPrompt(input, context)`,
  `getOutputSchema()`, `parse(response)`, `validateOutput(output)`. No `fetch`, no `fs`,
  no API, no other agents, no Review Studio. Testable with zero network.
- **`llm.js` is the only network module.** Transport injected: real (Anthropic API) or
  mock (fixture replay). No `if (mock)` branches anywhere in the pipeline.
- **`pipeline.js` is the only orchestrator.** CLI and web server both call the exported
  `runPipeline(options)` directly. The server never shells out to the CLI.
- **`run-store.js` owns artifact storage.** Neither pipeline, CLI, nor server writes run
  files directly — one interpretation of the run-directory contract.
- **Game validators remain authoritative.** The Studio imports them; it may add
  editorial checks but never a competing engine schema.

## Run directory contract

**A run** is the complete editorial history of one board-generation effort. **An
attempt** is one immutable pipeline execution within it (`0001`, `0002`, …). No
completed attempt is ever overwritten.

```text
studio/runs/2026-08-02T14-03-11Z-lantern/
  manifest.json             schemaVersion, runId, createdAt, theme, brief, status,
                            currentAttemptId, attemptCount, revisionCount
  current-attempt.json      pointer to the active editorial version
  decisions.jsonl           structured; UI renders it human-readable
  feedback.jsonl
  attempts/
    0001/
      attempt.json          id, parent, starting stage, revision notes, stage statuses,
                            per-stage model config, prompt-policy versions, corpus and
                            learning hashes, request counts, tokens, estimated cost,
                            timestamps, final status, failure reason
      learning-snapshot.json
      blackboard.json
      stages/
        01-pair-author/     request.json · prompt.txt · response.txt · output.json ·
                            validation.json
        02-theme-grouper/ … 04-board-builder/
        04a-integrity/      integrity.json (deterministic gate)
        05-analogy-validator/ … 08-style-guide/
      board.json  evaluation.json  failure.json
    0002/                   + parent-attempt.json · revision.json
  approved/
    board.json  approval.json
```

Run statuses: `created · running · failed · awaiting-review · revision-requested ·
revising · approved · rejected · archived`.

**Immutable history.** A revision from stage N references earlier accepted artifacts
from the parent attempt, gets fresh folders for N onward, and records what was reused.
The original attempt stays readable in full.

**Atomicity and locking.** All JSON writes: temp file → flush/close → atomic rename.
Per-run lock for mutations. The system prevents: simultaneous approve+revise, duplicate
approval, duplicate attempt IDs, UI reads of half-written JSON, and a failed copy
leaving half a board in `puzzles/`.

**Attempt resume (amendment 3).** An interrupted attempt (process killed mid-run) is
resumed, not discarded — completed stages are paid-for work. Resume reuses the same
stage re-entry machinery as revision, pointed at the same attempt instead of a child:

- **Immutability is scoped to *completed* work.** Completed attempts are immutable.
  Completed *stage folders* within an interrupted attempt are immutable. Only the
  first incomplete stage onward is (re)executed.
- On open, `run-store.js` finds the last stage whose `output.json` + `validation.json`
  exist and validate. A partial stage folder (interrupted mid-write) is quarantined to
  `stages/<id>.partial-<n>/`, never silently deleted, and that stage re-runs fresh.
- The blackboard is reconstructed deterministically from completed stage outputs.
- `attempt.json` records every resume: count, timestamps, and the stage re-entered at.
  Token/budget accounting continues cumulatively — resumed work counts against the same
  attempt's caps.
- Resume is automatic on the next `runPipeline` invocation for a run whose current
  attempt is interrupted; `--fresh` forces a new attempt instead.

## Stage contracts and structured outputs

Every stage defines a versioned JSON schema. Use API structured-output support when
available; regardless, validate locally. A successful response passes: JSON parse →
stage-schema validation → stage-specific semantic validation → pipeline preconditions.
No downstream stage receives invalid upstream output.

**Failure categories:** retryable transport (timeout, rate limit, overload, network,
truncation) · retryable output (malformed JSON, missing fields, schema violation,
incomplete) · terminal content (valid-but-unacceptable output, budget cap, revision
limit, integrity rejection after bounded retries, refusal).

**Retry policy:** small explicit per-stage limits; each retry counts against all caps,
is stored as a separate request record with concise validation feedback, and never
erases the failed response. No unbounded self-repair loops.

## Deterministic integrity gate

After Board Builder, run the game's integrity sweep before spending evaluation tokens.
On failure: store `04a-integrity/integrity.json`, allow Board Builder a bounded repair
retry, hold Analogy Validator until the gate passes. The Adversarial Solver receives the
integrity report and is instructed not to repeat brute-force work — its scope is what
the sweep cannot prove: human-plausible alternate readings, strong cross-set semantic
associations, ambiguous ordering, misleading labels, technically-valid-but-unfair
solutions.

## Variety as a pipeline property

- **Relationship index** (machine-readable) over shipped boards, approved Studio boards,
  recent rejected candidates, and the current run. Taxonomy maintained in the corpus
  (transformation, part-whole, tool-function, cause-effect, material-object, young-
  mature, container-contents, scale/degree, …).
- **Surprise-me:** read index → identify underrepresented shapes → select a bounded
  combination → build a *positive* brief for Pair Author (request what is underused,
  don't just show old boards and say "be different").
- **Holdout set (A6b):** evaluation boards/cases outside normal prompt retrieval, for
  comparing policy versions and detecting corpus-parroting.

## Revision model

From the Review Studio, Max requests a revision from a selected stage with scope + notes
(e.g. `{fromStage: "board-builder", scope: {type: "set", setId: "set-3"}, notes}`).
Pipeline creates a child attempt and reruns from that stage forward.

**Bounds per run:** max 3 AI revision attempts (default) · per-stage retry limits ·
total request cap · token caps · estimated-cost cap · wall-clock cap. Any cap stops the
run with an explicit status. Max can still hand-edit or reject afterward.

**Preserve the complete editorial path.** A (original) → B (AI revision after notes) →
C (Max's hand-edit) all remain; learning records why A was rejected, what B improved,
why B still needed editing, what changed B→C, why C was approved. The approved board is
not the only retained example.

## Acceptance levels

1. Structurally valid → 2. Engine-valid (`validatePuzzle` + `checkBoard` + integrity) →
3. Editorially reviewable → 4. Publishable with revision → 5. Publishable unchanged →
6. Rejected.

> **Core success criterion:** the Studio can independently create an engine-valid,
> editorially reviewable board with a complete audit trail. Approval-unchanged is a
> quality metric, not the proof the architecture works.

## Difficulty Loop

Three distinct measurements, never conflated:

- **Predicted** — Difficulty Rater, before play simulation.
- **Simulated** — Test-Player. AI-generated evaluation; **never labeled empirical**.
- **Human-observed** — only from real playtests (solve rate, mistakes, time, so-close
  errors, confidence, comments).

**Blind Test-Player:** receives only what a player sees — 16 words, standard
instructions, mistake count. No intended groups, labels, explanations, author reports,
or integrity results. Multiple independent trials when budget permits; each records
proposed groups/ordering, mistakes, confidence, solved-or-not, reasoning summary,
estimated difficulty.

**Calibration** compares prediction · simulation · Max's rating · human results, and
feeds the learning system (e.g. systematic underestimates on reversible relationships,
secondary meanings, cross-set associations, proper nouns, repeated shapes).

## Budget and execution limits

Per-request accounting: model ID, input/output tokens, request + retry counts, duration,
estimated cost, pricing-table version. Model IDs live in `pipeline-config.js`, not agent
files (current family: `claude-sonnet-5` for reasoning agents, `claude-haiku-4-5-20251001`
for narrow checkers). `budget.js` enforces caps at stage/attempt/run level for requests,
tokens, cost, revision spend, and wall-clock. Failed calls count.

**Reproducibility:** a seed controls deterministic Studio behavior (shape selection,
fixture selection, retrieval ordering, mock IDs). Model responses are *not* claimed
reproducible; instead every request records enough to explain its conditions: model ID,
API version, prompt version, policy version, learning snapshot, corpus hash, API
params, complete prompt and response.

## Feedback Learning Loop

Agents improve through external, inspectable, versioned memory — never silent
self-modification.

**Structured feedback events** (`feedback.jsonl`): schemaVersion, id, run/attempt,
action, scope (board/set), tags, note, before/after, source, createdAt. Actions:
`approve-board · approve-set · approve-unchanged · revise-board · revise-set ·
hand-edit · reject-board · reject-set · change-difficulty · change-label ·
change-explanation · approve-policy · reject-policy`. Approvals are positive feedback;
sets approved unchanged are recorded individually.

**Quick tags** in the UI (plus freeform notes): relationship-does-not-click ·
order-ambiguous · too-obscure · too-easy · too-difficult · cross-set-association ·
repetitive-shape · weak-explanation · weak-label · valid-but-unfair · good-unchanged ·
strong-reveal · difficulty-accurate.

> **Amendment, 2026-08-04 — four tags added, and the tier picker built.**
> The thirteen above proved to be leaking. Across 55 events on 10 boards Max kept
> writing the same four judgements in prose because no chip carried them, and on one
> board wrote five notes while ticking nothing at all. Added, append-only (a removed
> tag would orphan the events already carrying it): **not-always-true** (his most
> common reason for killing a set — B follows from A only sometimes), **no-unifying-theme**
> (board-scoped only; a single set cannot lack a theme), **not-evocative** and its
> positive twin **feels-like-asto**.
>
> The **"plays like" tier picker** was built on this spec's own `change-difficulty`
> action with its `before`/`after` fields — anticipated here, never given a control,
> so "this should be a red" could only be written in prose, which nothing can count.
> Picking the set's current tier records nothing; `difficulty-accurate` already says
> that.

**Routing:** feedback targets the agents that can act on it (words → Pair Author;
regrouping → Theme Grouper; difficulty → Rater/Test-Player; composition → Board
Builder; plausible alternates → Adversarial Solver + Validator; copy → Style Guide;
repetitiveness → Author + Grouper + Builder). One event may target several agents with
confidences; the Studio suggests routing, Max may override.

**Three forms of learning:**
1. **Stable policies** — explicit rules approved by Max, versioned per agent.
2. **Relevant examples** — small sets of accepted/rejected/revised examples *with
   reasons*, not just answers.
3. **Calibration data** — quantitative divergence records.

**Selective retrieval** (`retriever.js`): bounded context per agent run — 4–8 approved
rules, 2–4 accepted examples, 2–4 rejected/revised examples, 0–2 failure patterns,
calibration when relevant. V1 retrieval is deterministic: tag overlap,
relationship-shape match, normalized word overlap, frequency, recency, Max-assigned
priority. No embeddings.

**Automatic vs. approved:** examples, before/after preservation, difficulty stats, tag
counts, retrieval, pattern-repeat records update automatically. Permanent rules, policy
or system-instruction changes, rule removal/weakening, responsibility changes,
acceptance-definition or weighting changes require Max's approval — the system proposes,
Max approves/edits/dismisses/defers. **No permanent rule is silently created.**

**Pattern thresholds (A6b, configurable):** 1 occurrence → example · 3 similar →
possible pattern · 5 consistent → propose a rule · explicit "always/never" from Max →
propose immediately. Proposals still require approval.

**Learning snapshots:** every attempt records feedbackCutoff, rubricVersion, per-agent
policy versions, exampleCorpusHash, calibrationVersion, relationshipIndexVersion. Old
attempts never change when new feedback arrives.

**Benchmarks and overfitting protection (A6b):** fixed suite (accepted cases,
near-misses, ambiguous-order, cross-set collisions, calibration cases, holdout). Policy
proposals are compared old-vs-new against the same suite; the benchmark informs Max, it
does not decide.

**A6a / A6b split (amendment 1):** A6a — events, tags, routing, diffs, deterministic
retrieval, snapshots — is **required for Core's Definition of Done**. A6b — pattern
thresholds, policy proposals, benchmark suite, holdout — is **specified now, built when
feedback volume justifies it** (roughly after the first few reviewed runs). Nothing is
cut; the machinery waits for the data that makes it meaningful.

## Human gates

**Gate 1 — editorial decision** after a complete attempt: approve / revise / hand-edit /
reject. No gates between agents. **Gate 2 — permanent learning-policy approval** (A6b).
Routine example storage and calibration updates gate nothing.

---

# Part B — Review Studio

Local web interface over the same Core pipeline and run store: review attempts, compare
revisions, approve/reject, request AI revision, hand-author, capture structured
feedback, review learning proposals, start runs.

**Server:** `node:http`, binds `127.0.0.1` by default, never exposed to the LAN unless
explicitly configured. Calls Core functions directly; all storage via `run-store.js`.

**API:**
```text
GET  /api/runs                GET  /api/runs/:runId
GET  /api/runs/:runId/attempts/:attemptId
POST /api/runs                POST /api/runs/:runId/revisions
POST /api/runs/:runId/decisions   POST /api/runs/:runId/edits
POST /api/runs/:runId/approve     POST /api/runs/:runId/reject
GET  /api/learning/proposals
POST /api/learning/proposals/:proposalId/approve | /reject
GET  /api/config              # added 2026-08-04 — see amendment 4
```
Every mutating endpoint validates its body, restricts IDs, rejects path traversal,
enforces request-size limits, acquires the run lock, and revalidates server-side.
Browser validation is a convenience, not the authority.

> **Amendment 3, 2026-08-04 — the candidate board is playable.**
> A reviewer judging a board by reading it is judging something no player will ever
> see. The review page now offers **Play this board**, which swaps the static preview
> for a live game built from the game's **own** `GameController` and views
> (`studio/review/ui/play.js`) — the exact composition `src/app.js` uses, minus the
> title screen, tutorial and routing. This is the deliberate opposite of the duplicated
> board markup below: nothing about how play *works* is copied, so the Studio cannot
> drift from the game's rules. It is also the sharpest test the boundary law has had —
> if the game were not genuinely composable from a validated puzzle with the app shell
> absent, this page could not exist.
>
> The server's static mounts widened to serve `src/engine/` and `src/view/` whole and
> `src/controller/game-controller.js`; `app.js`, `storage.js`, `share.js` and
> `tutorial-script.js` remain unreachable. `EndView` is deliberately **not** reused — it
> is a full-screen takeover that reveals every set with its explanation, which the
> review page already shows below and which the reviewer has usually read. A one-line
> banner reads `state.status` instead and decides nothing.
>
> **Amendment 4, 2026-08-04 — `GET /api/config`.** A long-running Studio holds the
> pipeline config it started with, so a code fix never reaches it (cost ~$0.23 once).
> The endpoint reports the config **the runner is holding** — never a re-read of the
> file, which would always agree with the repo and so report a stale server as current
> — and the run list shows it beside the button that spends money under it.
>
> **Amendment 5, 2026-08-04 — the controlled relationship vocabulary supersedes the
> eight-shape list.** This spec's "eight shapes" and the free-text `shape` field are
> retired (design.md D-3 amendment): `studio/corpus/relationship-index.json` v2.0 is
> the vocabulary — 36 Bejar/Chaffin/Embretson relation types, each with family
> (coverage axis), stance (composition axis), paradigm pair and failure mode — and
> `shape` is an enum of its ids everywhere an agent declares one. Briefs carry stance
> quotas; the grouper floors on ≥4 stances; the 04a gate requires four distinct
> stances per board; stage 08 adds the advisory unity verdict; the review card shows
> stance + paradigm + failure mode per set. Models: 03 and 08 moved Haiku → Sonnet for
> the taxonomy shakedown, to be re-measured at the slim-down lap.

**Visual relationship with ASTO (amendment 2):** the UI links the game's `tokens.css` /
`base.css` / `components.css` — typefaces, paper palette, tile and card styles are
inherited. Board markup is **intentionally duplicated** (~40 lines of static markup
using the game's classes), with cross-referencing comments in both files; the game's
`board-view.js` stays untouched — it owns persistent keyed DOM for FLIP animation and is
the wrong thing to force into dual service. Parity is verified by the side-by-side
browser gate. `review.css` adds only Studio-specific elements (run list, report panels,
attempt comparison, revision diff, feedback controls, proposals, status). **The GDD
no-list applies to the Review Studio UI** (amendment 4): no confetti, particles, or
timers; beans never red. "No changes to the game" means no gameplay or player-facing
behavior changes; small refactors extracting reusable presentation code are allowed only
when all existing tests and behavior are preserved.

**Capabilities:** review a complete run (manifest, attempt history, every prompt and
report, validation failures/retries, integrity, predicted difficulty, blind simulated
results, human playtest results when present, board rendered as ASTO, budget usage,
learning snapshot) · compare attempts (stages rerun, artifacts reused, word/set diffs,
rating and copy changes, why revision was requested) · decide (approve unchanged /
approve after edit / reject / revise-from-stage — each producing a log entry, a decision
event, and feedback events) · hand-author (change words, reorder terms, change sets,
edit labels/explanations/difficulty, build from scratch; debounced browser validation,
authoritative server validation; an invalid board can never be approved or copied) ·
start a run (theme or surprise-me, target difficulty, shape preferences, budget profile,
mock/real transport) · review learning (feedback per edit, attribution, patterns,
proposals, benchmarks, policy versions, history).

## Approval and game integration

Approving a board is one guarded operation: lock → confirm attempt is current →
revalidate → `checkBoard()` → confirm no filename collision in `puzzles/` → write temp →
run the game's board check against the temp file → atomic move into `puzzles/` → record
approval → add approved examples to the corpus → update relationship index → unlock. Any
failure means no partial landing. A board is approved at most once.

## Git and artifact policy

`studio/runs/*` ignored (keep `.gitignore`). Demonstration runs are explicitly copied
into a committed fixture/docs directory. No raw API responses, large histories, or
rejected content accumulate in git. Approved boards are normal tracked game content. No
API key or secret is ever committed, written into a prompt artifact or run directory, or
returned through the API.

---

# Verification

**Core compatibility:** all 154 existing game tests stay green · `package.json` gains
Studio scripts, zero new dependencies · game validators remain sole engine authority ·
`CLAUDE.md` updated to describe the Studio's location.

**Agent tests (×8):** prompt construction · learning-context insertion · output-schema
definition · valid parse · malformed response · semantically invalid response · retry
feedback · policy-version changes.

**Pipeline happy paths:** full mock run → complete immutable attempt, zero network ·
real themed run → engine-valid, editorially reviewable board · real surprise-me run uses
underrepresented shapes · revision creates a child attempt without altering the parent ·
revision from Board Builder reuses earlier artifacts and reruns downstream · hand edit
creates a structured diff + feedback event · approval atomically lands in `puzzles/`.

**Pipeline failure paths:** missing API key · timeout · rate limit · overload ·
truncated response · malformed JSON · valid-JSON-invalid-fields · stage semantic
failure · retry exhaustion · per-stage and total budget exhaustion · revision-limit
exhaustion · kill during write · resume of an interrupted attempt re-enters at the first
incomplete stage, reuses completed stage outputs verbatim, quarantines a partial stage
folder, and keeps cumulative budget accounting · resume after kill-during-write of the
manifest itself · `--fresh` starts a new attempt instead of resuming · duplicate run
ID · duplicate approval · concurrent approve+revise ·
invalid revision stage · corrupted manifest · old schema opened by new code · corpus
changed between attempts · destination filename collision · failure during approval copy.

**Run-directory contract:** atomic writes · monotonic attempt IDs · completed attempts
immutable · valid parent-child links · `current-attempt.json` points at a real attempt ·
valid status transitions · every request carries prompt + response metadata · every
attempt carries a learning snapshot.

**Integrity and editorial gates — one real run demonstrates:** schema-valid output ·
mechanical integrity success · blind Test-Player input · adversarial review scoped to
human-plausible ambiguity · complete editorial evidence · no manual intervention before
final review. The bar is a trustworthy candidate with enough evidence for an editorial
decision — not first-run approval-unchanged.

**Difficulty Loop:** predicted stored · multiple blind simulated trials stored ·
simulated never labeled empirical · human results attachable later · calibration
versioned · old attempts keep their original snapshots.

**Feedback Learning Loop (A6a):** approval → positive examples · rejection → negative ·
hand edits preserve before/after · routing to one or more agents · retrieval bounded and
deterministic · a future run receives the approved learning context · snapshots isolate
old attempts. **(A6b when built):** permanent changes require approval · thresholds
create proposals, never silent rules · benchmarks use the fixed holdout suite · new
policy versions never alter old attempts.

**Review Studio API:** list/read runs and attempts · start run · record decision ·
request revision · reject invalid edit · reject path traversal · reject oversized
request · reject conflicting mutation · approve valid board · reject duplicate
approval · approve/reject learning proposal.

**Browser gates** (preview browser): review a complete real run · compare parent and
revised attempts · request a revision, observe correct re-entry stage · hand-edit with
live validation · record structured feedback · approve a board, see it land in
`puzzles/` · review a learning proposal (A6b) · view an old run's exact snapshot ·
side-by-side with the game at 375×812 and 1280px — recognizably the same ASTO system,
not merely similar colors; no-list held.

---

# Implementation order

- **A1 — Contracts and storage** (red-first): stage registry · schemas · manifest ·
  immutable attempt structure · atomic writes · locking · status transitions · tests.
- **A2 — Agent boundaries and mock transport:** pure agents · output schemas · injected
  transport · fixture playback · retry classification · mock end-to-end run.
- **A3 — Pipeline and mechanical gates:** eight-stage orchestration · blackboard ·
  integrity insertion · budget enforcement · failure recording · revision entry points ·
  immutable child attempts.
- **A4 — Initial corpus and variety:** extract shipped-board examples · relationship
  taxonomy + index · **Max drafts `rubric.md`** (the one input only he can write) ·
  machine-readable rubric · 5–8 annotated near-misses · holdout cases (stored now, used
  in A6b).
- **A5 — Evaluation:** Difficulty Rater output · blind Test-Player trials · Adversarial
  Solver scope · evaluation summary · acceptance levels · calibration storage.
- **A6a — Feedback capture (required):** event schema · tags · before/after diffs ·
  routing · example compilation · calibration updates · deterministic retrieval ·
  snapshots.
- **A6b — Learning proposals (when feedback volume justifies):** pattern detection ·
  proposal workflow · benchmark comparison · holdout evaluation.
- **B1 — Review Studio read:** server · run list · attempt viewer · stage reports ·
  board rendering (duplicated markup, shared CSS) · attempt diff · budget + snapshot
  display.
- **B2 — Review Studio write:** decisions · revisions · hand editing · feedback ·
  approval · rejection · new-run form · proposal review (A6b).
- **B3 — Full browser verification:** the browser gates, using a mock run, real themed
  run, real surprise-me run, revised run, hand-edited approval, and (when A6b exists) a
  policy proposal.

# Out of scope

Public deployment · multi-user accounts · auth beyond localhost · fine-tuning ·
silent policy self-modification · embedding retrieval · cloud storage · automated
publishing without approval · replacing game validation · player-facing features · any
promise that every board is publishable unchanged.

# Definition of Done

1. All eight agents run through one tested Core pipeline.
2. Immutable, versioned attempts.
3. Every prompt, output, retry, validator result, and decision recorded.
4. Engine-valid, editorially reviewable boards produced.
5. Bounded AI revision and human hand editing supported.
6. Predicted, simulated, and human-observed difficulty distinguished.
7. Structured feedback routed into agent-specific learning (A6a).
8. Future runs retrieve relevant approved lessons (A6a).
9. Permanent policy changes require Max's approval (mechanism may be A6b; until then no
   permanent-rule pathway exists at all, which satisfies the constraint trivially).
10. Every attempt records its exact learning snapshot.
11. The Review Studio presents candidates in ASTO's visual system.
12. Approval safely and atomically adds a valid board to the game.
13. One committed demonstration artifact traces: brief → prompts/reports → mechanical
    checks → simulated evaluation → Max's feedback → revision history → decision →
    approved JSON → learning generated.

> The final system behaves less like a one-time generator and more like an editorial
> studio: it creates candidates, shows its work, accepts correction, remembers the
> correction, and becomes more aligned with Max's definition of a good ASTO puzzle
> without concealing how that learning occurred.

# Recorded game-side decision — Phase 5a scope amendment

**Mid-puzzle persistence (Max, this session):** a player who leaves a puzzle — including
a page reload or closed tab — gets their board state back: solved sets, mistakes, frame
contents, selection. Phase 4's resume is in-memory only and the approved 5a plan
(`~/.claude/plans/keen-percolating-boot.md`) scoped this out; it is now **in** 5a's
scope, since 5a already touches `storage.js` and per-puzzle results. Serialize live
game state to localStorage keyed by puzzle id (via the same guarded store — Safari
private mode tolerance comes free), restore through the engine's normal init path so
the view stays read-only, clear on finish. To be folded into the 5a plan when that
work begins; recorded here so it isn't lost.

# First steps on approval

1. Write this design to `docs/superpowers/specs/2026-08-02-asto-studio-design.md`,
   commit it, and update `CLAUDE.md`'s Studio-location paragraph.
2. Log the session's decisions to `docs/log.md` (roster, run input, gates, corpus,
   learning loop, A6 split, renderer choice, attempt-resume rule, and the Phase 5a
   mid-puzzle-persistence amendment).
3. Begin Phase A1 red-first.

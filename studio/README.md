# ASTO Puzzle Studio

The internal authoring pipeline that generates candidate ASTO boards for human editorial
review. It lives in this repo, beside the game, because it imports the game's own
validators — one schema, no drift.

**ASTO** is a cozy, mobile-first word puzzle: *"Connections, but with analogies."* A 4×4
board of 16 word tiles hides four analogy sets of four, one per difficulty tier, each set
two ordered pairs read as `A : B :: C : D`. Order is the game — `seed : tree` is not
`tree : seed` — which is why so much of what follows is about *fairness*, not correctness.

The Studio's thesis: **AI helps a human designer make better puzzles.** It never
publishes on its own. Every run ends at Max.

> Submitted as **MAIGD Assignment #6 — Build a GER Pipeline**. Everything described here
> predates the assignment except `tools/evaluator-report.js`, which was written to answer
> the assignment's central question — *does the evaluator find real issues?* — with
> measurements instead of a claim.
>
> Also **Assignment 10's deliverable 2** (pipeline source + engine integration). The game
> this pipeline feeds is live at **https://www.playasto.com**; every board on it was
> authored here and played and approved by Max before release. Whole-corpus cost figures
> are in [`../docs/audit-2026-08-31.md`](../docs/audit-2026-08-31.md).

---

## Generate → Evaluate → Refine

| GER part | Where it lives |
|---|---|
| **Generate** | Stages **01–04**: pair author → theme grouper → difficulty rater → board builder |
| **Evaluate** | **04a**, a deterministic gate, then **05–08**: analogy validator · adversarial solver · test player · style guide |
| **Refine** | `requestRevision()` re-entry, briefed by the **Revision Proposer** (D-5), plus the bounded **auto-revise loop** (D-14) that fixes allowlisted machine findings before Max ever sees the board |
| **Circuit breaker** | Four independent limits (below) |

```
  Max ──theme/constraints──▶ 01 pair author ──▶ 02 theme grouper ──▶ 03 difficulty rater
     (or 00 subject scout,                                                  │
      for a surprise-me run)                    04 board builder ◀──────────┘
                                                                │
                                              04a integrity gate │  ← deterministic, no model
                                                                ▼
                              05 validator · 06 adversarial solver · 07 test player · 08 style guide
                                                                │
                                                  09 glossary author  ← writes one definition, or declines
                                                                │
                                        ┌───────────────────────┤
                       auto-revise (D-14)│                       │
                    allowlisted findings │                       │
                     only · max 1 a board└──▶ re-enter at 01–04  │
                                                                ▼
                                                    awaiting-review ──▶ Max
                                                                          │
                                approve ─┬─ reject ─┬─ "publishable after a fix"
                                         │          │            │
                                    approved   rejected   Revision Proposer drafts a brief
                                         │                       │
                                    publish ──▶ puzzles/  Max edits/sends ──▶ requestRevision()
                                    (D-6)                        │         (max 3)
                                                                 └──▶ re-enter at 01–04
```

Stages communicate through a **blackboard** — `blackboard.js`, an in-memory artifact
exchange where stage N reads what stages 1..N−1 produced. It holds no rules, calls
nothing, and is reconstructable from stage outputs alone, so a resumed attempt sees
exactly what the original saw.

### Generate

| Stage | Job | Model / effort |
|---|---|---|
| *(00 subject-scout)* | Not a pipeline stage: invents ONE fresh subject for a surprise-me run (D-15), under a register rotation | Sonnet / low |
| 01 pair-author | Over-generate candidate pairs, each declaring its relationship shape | Sonnet / high |
| 02 theme-grouper | Group pairs into candidate sets | Sonnet / medium |
| 03 difficulty-rater | Grade each set 1–4, and say *what makes it hard* | Sonnet / medium |
| 04 board-builder | Pick one set per tier; guarantee 16 unique terms; engineer bait | Sonnet / medium |

### Evaluate

**04a is deterministic and runs first.** Class 8's rule — *prefer a script to an agent* —
was already the architecture here. The integrity gate pushes **every ordered 4-tuple of
the board's 16 words (16·15·14·13 = 43,680)** through the real engine and asserts that
exactly sixteen are accepted: 4 orders × 4 sets. Any extra accepted tuple is an
unintended alternate solution, reported with the sets it collides between. No model
opinion involved, and it costs nothing.

Then four **independent** agentic evaluators. None reads another's output — they are four
separate reads of a finished board, not a chain:

| Stage | What it looks for |
|---|---|
| 05 analogy-validator | Per-set rubric pass/fail. **Haiku** — a different model from the generator |
| 06 adversarial-solver | Alternate readings, cross-set association, unfair sets |
| 07 test-player | Plays the board; reports mistakes, and its own **`knowledgeGated`** words |
| 08 style-guide | Voice, unity, evocativeness, and `contentConcerns` — distressing material in a cozy game |

One stage runs after the evaluators rather than beside them, because it writes rather
than judges:

| Stage | Job | Model / effort |
|---|---|---|
| 09 glossary-author | Writes the ONE definition the in-game Vocabulary button reveals — or **declines**, when the board needs no gloss (D-18) | Sonnet / low |

**The generator–evaluator contract holds structurally.** Class 8: *do not let the agent
that produced the work evaluate the work.* Every evaluator runs as a separate request
with its own prompt and no generation context, and 05 runs on a different model family
entirely.

**07's `knowledgeGated` field is the most ASTO-specific thing in the pipeline**, and it
exists because of a failure. 07 is a model, so it *knows* what `speleothem` and
`Paris-Roubaix` are and plays a knowledge-gated set as though it were open — the one
agent whose whole job is "how does this feel to play" was structurally unable to notice
the defect Max found by playing. It cannot be made to forget, so it is asked to *name
what it leaned on*. `orderGuessed` (D-9) is the same move one rung further in: a model
does not experience a coin flip, so it marks the sets whose order it guessed.

### Refine — and why the human gate is where it is

`requestRevision()` opens a child attempt re-entering at any authoring stage (01–04),
reusing everything before it. Re-entering at 05+ would re-evaluate the same board and
change nothing.

The **Revision Proposer** (D-5) reads the run and drafts a brief for that machinery. Two
properties are deliberate:

- **It proposes, never authors.** Output is a brief, editable in place before sending.
- **Max's judgement is read first, the evaluators' findings second.** On the paris board
  05 failed — and 06 flagged as `[high] unfair` — the set he liked *best*. An agent keyed
  to machine findings alone would have "fixed" what he loved. Every set he praised is
  named untouchable in the brief.

**The graduation trigger fired, and the loop closed — partly.** D-5 set an
evidence-gated trigger: at ~10 briefs with recorded verdicts, evaluate agreement and
propose a bounded auto-revise loop then. It arrived at **9 verdicts, all accepted**, and
Max asked for it himself mid-review. `studio/auto-revise.js` (D-14) now runs after the
evaluators and before `awaiting-review`, and it is bounded on every axis that matters:

- **An allowlist, not a mandate.** Only 06's `cross-set-association` at `high`, and the
  order-ambiguity cluster (04a's symmetric flag, 07's `orderGuessed`, the cross-reading
  hold). `knowledgeGated` is deliberately **off** the list — a flag that names a wall
  without condemning a set must not trigger surgery. **Taste never triggers revision.**
- **One auto-revision per board**, inside the existing 3-revision cap and never in
  addition to it. If the fix still trips the allowlist, the board goes to Max as-is with
  the finding *and* the failed-fix diagnosis — a failure exit, not a second loop.
- **Inspectable.** The review card says "auto-revised before review" with the finding,
  the brief, and what changed, so the trust ratchet can be revoked per finding kind.

What did **not** graduate is the part Class 8 blesses: the human gate stays at *evaluate*.
The loop fixes structural findings the machine can prove; it never approves, never
publishes, and never touches a taste call. Across the corpus it has fired **32 times, with
27 recorded outcomes and 5 failures** — and the failures are informative: three boards
across batches five and six died because the *revision* reached outside the theme's world.
The guard refused a board the reviser made worse, which is the loop working; the reviser
reaching outside the theme is a real, open defect (`docs/backlog.md`).

### The circuit breaker — four limits, because they fail differently

| Limit | Value | What it stops |
|---|---|---|
| `maxRevisions` | **3** | An editorial loop that never converges. Enforced in `requestRevision()`; the 4th request throws `TERMINAL_CONTENT`. |
| `maxIntegrityRetries` | **2** | The 04a gate bouncing a board back to the builder forever. |
| `retries` | transport **3**, validation **2** | A wedged call, and a stage that cannot produce valid output. |
| `createBudget` | 240 requests · 12M tokens · **$60** · 2h per run | Runaway spend. Charged on failures too, because the spend happened either way. |

Two properties worth naming. **Failed calls are charged** — a budget that only counts
successes is not a budget. And llm.js **steps effort down** on a truncation rather than
only raising the ceiling: a bigger ceiling buys an over-thinking stage more room to
over-think. That fix came from five runs dying at ~$0.62 each on 2026-08-08.

Exhaustion is always a **recorded outcome**, never a hang: `StudioFailure` with a
category, and the run directory keeps the prompt, the attempts, and the model's last raw
reply.

### The human gates — both ends

A run's status moves `created → running → awaiting-review`, and **no agent can move it
past that**. `approved` and `rejected` are reachable only from Max in the Review Studio
(`npm run studio:review`), and both lead only to `archived`. There is no transition by
which a board publishes itself.

Two things he does at that gate that no agent may do for him: he **plays every candidate
board** before judging it, and he can **edit one in place** — title, labels, explanations,
words, difficulty swaps (D-22), every save validated server-side and recorded as
before/after signal. Publishing is a third, separate click.

---

## How a board reaches the game

The Studio lives inside the game's repository, and this is the reason. When Max clicks
publish, the board crosses one seam:

```
Review Studio  ──▶  storage/puzzle-store.js  ──▶  puzzles/<slug>.json
                          │                       puzzles/index.json
                          │                              │
                          ├─ validatePuzzle()  ◀──────────┤  src/source/validate-puzzle.js
                          ├─ checkBoard()                 │  src/engine/board-integrity.js
                          ├─ assigns the next free date   │
                          └─ regenerates the manifest     ▼
                                                  src/source/local-json-source.js
                                                          │      (the PuzzleSource seam)
                                                          ▼
                                                    PuzzleEngine ──▶ the game
```

**`puzzle-store.js` is the only module allowed into `puzzles/`**, exactly as
`run-store.js` is the only module allowed into run artifacts. It validates the board with
the **game's own** `validatePuzzle` and `checkBoard` — not a copy, the same modules the
browser loads — which is what makes "one schema, no drift" a structural fact rather than
a promise. A refusal writes nothing.

The store also owns two things that would otherwise be manual: it **assigns the release
date** (the next free day after the last scheduled board, D-24) and **regenerates
`puzzles/index.json`** (D-10). So the tail after a publish is `git commit && push`, and
`npm run check-deploy` to prove the push actually deployed.

The game reads the result through `src/source/local-json-source.js` — the `PuzzleSource`
seam. Nothing downstream of that seam knows a pipeline exists; a hand-authored board and
a generated one are indistinguishable to the engine, which is the property that lets the
game run correctly with the Studio absent entirely.

---

## Evaluator quality — measured, not claimed

```bash
node tools/evaluator-report.js          # or --json
```

This joins every evaluator verdict to Max's own, across the whole run corpus. Re-run
**2026-08-31**: **126 judged attempts across 109 runs** (11 mock runs, 25 unjudged runs,
27 unjudged attempts and 6 attempts with no board excluded). Every number in this section
is that run's output — re-run the command to check them.

Most of that tool is about **not lying**. The corpus spans five instrument changes, and
pooling across any of them yields a number that looks authoritative and is wrong:

1. **`formVersion` absent = version 1**, where a set's `action` was the *board's* button
   stamped onto every set — 21 of 79 tagged set-events say `reject-set` while carrying
   only praise. Those are read through their **tags only**, and counted as a separate
   population (102 trusted verdicts vs 42 tag-derived).
2. **`valid-but-unfair`** (retired 2026-08-05) meant three different things across its
   nine uses and only the prose says which. Counted under the retired tag, never
   re-sorted. The tool finds exactly the **9** design.md records.
3. **`knowledgeGated` arrived partway through.** An output without the field is not a run
   where nothing fired — it is a run that could not report. Excluded from the
   denominator rather than counted as zero.
4. **Mock runs are skipped** — a fixture board is never editorial signal.
5. **Revisions before D-11 never received the editor's notes**, so their outcomes are
   excluded from the D-5 evidence below rather than counted as failures.

### What the numbers say

| Evaluator | Result |
|---|---|
| **05 analogy-validator** | Agreed with Max on **212 of 332 sets (64%)** — 165 both liked, 47 both rejected. **Flagged 87 sets he liked** (the paris failure mode). **Passed 33 he rejected.** |
| **06 adversarial-solver** | 457 findings; **108 (24%) touched a set he rejected**, 222 touched only sets he kept. By severity: 58 high · 233 medium · 166 low. |
| **07 test-player** | `knowledgeGated` fired on **60 of 92** attempts that could report it (65%); 175 gated words, **33 on a set he then rejected**. It solved 126 of 139 trials — which is the point: it solves boards a human finds hard. |
| **08 style-guide** | Agreed on **65 of 126 boards (52%)**. Happy where he was not: 20. Unhappy where he was happy: 41. |

**Read honestly, this says the evaluators are useful and none of them is a verdict.**

- **05 has been stable at ~65% across a corpus that more than doubled.** It read 65% at
  144 sets and 64% at 332 — the same number against 2.3× the evidence, which is the
  strongest thing that can be said for any figure on this page. Its errors stay
  asymmetric and the expensive direction is still the common one: it flags **87** sets
  Max liked and misses **33** he rejected. A board where 05 fails two sets is the mode,
  not a signal.
- 06's 24% hit rate is a floor, not a ceiling — "touched" is word overlap, not proof it
  found his reason. What it *is* good for is the thing nothing else does: 04a proves no
  alternate solution is *accepted*, and 06 hunts the ones a player would *try*. Its
  severity distribution is worth noting: only 58 of 457 findings are `high`, and `high`
  cross-set association is one of the two things the auto-revise allowlist trusts.
- 07's `knowledgeGated` is the strongest instrument here, and design.md records two hits
  Max independently confirmed in his own notes: on Knights it flagged `boss` — *"the
  machine caught exactly what i got hung up on"* — and on Yankees it flagged
  Ruth/Gehrig/Mantle/Maris, the exact set he could not finish. It stayed correctly silent
  on the two all-ordinary-word boards. Its false-negative rate is still unmeasured.
- **08 got *worse* as the corpus grew — 58% at 66 boards, 52% at 126 — and that is the
  most useful finding on this page.** A binary verdict that lands at 52% carries almost
  no information, and the asymmetry flipped: it is now unhappy where Max is happy **41**
  times against 20 the other way, so it has drifted strict. Its `edits` remain more
  useful than its verdict, which is exactly why 08 is shown and never gates, and why
  taste findings are barred from the auto-revise allowlist. The open question in
  `docs/backlog.md` — whether the stage should return severities rather than a boolean —
  is answered a little more firmly by this re-run.

The most-used tags are still the positive ones — `strong-reveal` 315, `good-unchanged`
309, `feels-like-asto` 301, `difficulty-accurate` 295 — against `too-obscure` 29 and
`not-evocative` 24. The pipeline mostly produces boards Max keeps, and the ratio has held
as the corpus tripled.

### D-5 graduation evidence — the trigger fired, and why it was measuring the wrong thing

D-5 gated the bounded auto-revise loop on evidence: at ~10 briefs with recorded verdicts,
check whether Max is accepting them substantially unedited. **Standing at 2026-08-31: 14
verdicts, 14 accepted, 0 edited, 0 discarded.** The trigger fired at 9 — and Max asked for
the loop himself, mid-review, before anyone showed him the tally. It shipped as D-14.

The measurement problem this section originally recorded is the part worth keeping,
because it is the reason the trigger was nearly wrong.

Following each brief through to what *became* of it says something the acceptance rate
cannot:

```
  bbq                accepted  NOTES NEVER ARRIVED (pre-D-11)  -> rejected
  nintendo           accepted  NOTES NEVER ARRIVED (pre-D-11)  -> rejected
  naruto             accepted  NOTES NEVER ARRIVED (pre-D-11)  -> rejected
  flowers            accepted  notes arrived                   -> open
  cowboys            accepted  notes arrived                   -> rejected
  festivals          accepted  notes arrived                   -> approved
  bicycles-and-journeys accepted  notes arrived                -> approved
  mirrors            accepted  notes arrived                   -> approved
  theatre            accepted  notes arrived                   -> approved
  childhood          accepted  notes arrived                   -> open
  the-tattoo-parlor  accepted  notes arrived                   -> approved
  mending-nets       accepted  notes arrived                   -> rejected
```

**Acceptance and outcome are different measurements.** `proposal-verdict` records whether
a brief *read plausibly* at review time; it has never recorded whether the revision it
briefed *worked*. At the time this section was first written the split was stark — 5 of 5
briefs accepted, 0 of 5 producing a published board — and a trigger reading only the first
would have graduated an auto-revise loop on a process with no successes.

**Three of those early revisions are not evidence at all.** Until **D-11** (2026-08-07),
`requestRevision` wrote the editor's notes and *nothing read them back* — a revision
re-entering at 01 was a blind re-roll of the theme, and the entire brief apparatus D-5
built was writing to a channel with no receiver. Those three were rejected because they
were never told what to revise. Blaming the proposer for them would be blaming the author
of a letter nobody delivered.

The report detects this **from the artifact, not from a date**: the re-entry prompt either
carries `renderRevision()`'s marker or it does not — the same evidence D-11's own
diagnosis turned on. (It checks stages 01, 02 and 04 only; 03 grades what it is handed and
is not meant to carry the block.)

**The usable record, once those three are excluded: 5 published of 9** — 5 approved, 2
rejected, 2 still open. That is a real success rate on real boards, and it is the number
the graduation should be judged on. The threshold was never the thing that needed fixing;
the *metric* was.

---

## Running it

```bash
npm run studio -- --mock --theme "Lantern light"   # fixtures, no network, no key
npm run studio -- --theme "Lantern light"          # needs ANTHROPIC_API_KEY
npm run studio -- --run <runId>                    # resume where it stopped
npm run studio:review                              # the Review Studio (Max's gate)
npm run studio:subjects                            # sample fresh surprise-me subjects
node tools/check-board.js                          # deterministic board integrity
node tools/evaluator-report.js                     # the measurements above
node tools/check-schedule.js                       # the publishing runway
node tools/check-deploy.js                         # did the last push actually deploy?
```

`--mock` is a **transport swap**, not an `if (mock)` branch — the same code path runs.

### A run directory

```
studio/runs/<timestamp>-<slug>/
  manifest.json          status, brief, revision count
  decisions.jsonl        what happened, in order
  feedback.jsonl         Max's judgements — the corpus the report reads
  attempts/0001/
    board.json           the candidate board
    blackboard.json      the whole attempt's state, rebuilt from stage outputs
    stages/<id>/         prompt.txt · request.json · response.txt · output.json · validation.json
```

Every prompt and every raw reply is kept. That is what made the 2026-08-08 truncations
diagnosable, and it is why the report above could be written at all: both halves of every
judgement were already on disk, just never joined.

---

## Provenance

- **GDD §12** — the pipeline's specification · `docs/asto-gdd.html`
- **`docs/design.md`** — the authority: decisions **D-1 … D-32**, and House-rule
  exceptions HR-1 (zero dependencies), HR-2 (Studio web surface, discharged 2026-08-13)
  and HR-3 (binary process screenshots, rewritten 2026-09-04 by D-32)
- **`docs/superpowers/specs/2026-08-02-asto-studio-design.md`** — the approved design
- **`docs/backlog.md`** — known gaps, openly. Several are about this pipeline's
  evaluators, and the report above is partly an answer to them.

Zero dependencies, Node ≥22, `node:test`. `npm test` **as of 2026-09-04: 1615 passing,
0 failing** — down from 1671, because D-32 cut the art line and its 56 tests. The total
drifts as boards are added, because `board-integrity.test.js` globs `puzzles/*.json` and
regates every board on every run; the zero is the part that matters.

---

**This page is current as of 2026-09-04.** Sections dated earlier than that are dated on
purpose — the measurements below are a snapshot of the corpus at the time they were taken,
and re-stamping them without re-running them would be a lie. Cost figures across the whole
corpus are in [`../docs/audit-2026-08-31.md`](../docs/audit-2026-08-31.md).

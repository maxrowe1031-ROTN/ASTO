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

---

## Generate → Evaluate → Refine

| GER part | Where it lives |
|---|---|
| **Generate** | Stages **01–04**: pair author → theme grouper → difficulty rater → board builder |
| **Evaluate** | **04a**, a deterministic gate, then **05–08**: analogy validator · adversarial solver · test player · style guide |
| **Refine** | `requestRevision()` re-entry, briefed by the **Revision Proposer** (D-5) — human-gated by design |
| **Circuit breaker** | Four independent limits (below) |

```
  Max ──theme/constraints──▶ 01 pair author ──▶ 02 theme grouper ──▶ 03 difficulty rater
                                                                            │
                                                        04 board builder ◀───┘
                                                                │
                                              04a integrity gate │  ← deterministic, no model
                                                                ▼
                              05 validator · 06 adversarial solver · 07 test player · 08 style guide
                                                                │
                                                                ▼
                                                    awaiting-review ──▶ Max
                                                                          │
                                approve ─┬─ reject ─┬─ "publishable after a fix"
                                         │          │            │
                                    approved   rejected   Revision Proposer drafts a brief
                                                                 │
                                                     Max edits/sends ──▶ requestRevision()
                                                                 │         (max 3)
                                                                 └──▶ re-enter at 01–04
```

Stages communicate through a **blackboard** — `blackboard.js`, an in-memory artifact
exchange where stage N reads what stages 1..N−1 produced. It holds no rules, calls
nothing, and is reconstructable from stage outputs alone, so a resumed attempt sees
exactly what the original saw.

### Generate

| Stage | Job | Model / effort |
|---|---|---|
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
| 08 style-guide | Voice, unity, evocativeness |

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

The loop is **not closed automatically**, and that is a decision rather than an omission.
Class 8 explicitly blesses it: *"you can put the human gate at evaluate instead… rather
than running an agentic refiner at all,"* because authorship runs through the whole loop.
D-5 sets an evidence-gated graduation trigger — at ~10 briefs with recorded verdicts,
evaluate agreement and propose a bounded auto-revise loop then. Current standing is in
the measurements below.

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

---

## Evaluator quality — measured, not claimed

```bash
node tools/evaluator-report.js          # or --json
```

This joins every evaluator verdict to Max's own, across the whole run corpus. **59 judged
runs, 66 attempts** (8 mock runs and 20 unjudged runs excluded).

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
| **05 analogy-validator** | Agreed with Max on **94 of 144 sets (65%)** — 67 both liked, 27 both rejected. **Flagged 32 sets he liked** (the paris failure mode). **Passed 18 he rejected.** |
| **06 adversarial-solver** | 254 findings; **68 (27%) touched a set he rejected**, 100 touched only sets he kept. By severity: 41 high · 134 medium · 79 low. |
| **07 test-player** | `knowledgeGated` fired on **24 of 32** attempts that could report it (75%); 77 gated words, **14 on a set he then rejected**. It solved 71 of 76 trials — which is the point: it solves boards a human finds hard. |
| **08 style-guide** | Agreed on **38 of 66 boards (58%)**. Happy where he was not: 11. Unhappy where he was happy: 17. |

**Read honestly, this says the evaluators are useful and none of them is a verdict.**

- 05's 65% is higher than the **54%** in design.md D-8 — but that was a hand count over
  **13 of 24 sets** on one batch, and this is 94 of 144 across the corpus. Different
  denominators; the honest reading is "the small sample was not misleading," not "it
  improved." Its errors stay asymmetric and the expensive direction is the common one:
  it flags 32 sets Max liked and misses 18 he rejected. A board where 05 fails two sets
  is the mode, not a signal.
- 06's 27% hit rate is a floor, not a ceiling — "touched" is word overlap, not proof it
  found his reason. What it *is* good for is the thing nothing else does: 04a proves no
  alternate solution is *accepted*, and 06 hunts the ones a player would *try*.
- 07's `knowledgeGated` is the strongest instrument here, and design.md records two hits
  Max independently confirmed in his own notes: on Knights it flagged `boss` — *"the
  machine caught exactly what i got hung up on"* — and on Yankees it flagged
  Ruth/Gehrig/Mantle/Maris, the exact set he could not finish. It stayed correctly silent
  on the two all-ordinary-word boards. Its false-negative rate is still unmeasured.
- 08's 58% is barely above a coin flip on a binary, and its `edits` are more useful than
  its verdict.

The most-used tags are the positive ones — `strong-reveal` 134, `good-unchanged` 130,
`feels-like-asto` 122, `difficulty-accurate` 119 — against `not-evocative` 18 and
`relationship-does-not-click` 15. The pipeline mostly produces boards Max keeps.

### D-5 graduation evidence — and why the trigger was measuring the wrong thing

D-5 gates the bounded auto-revise loop on evidence: at ~10 briefs with recorded verdicts,
check whether Max is accepting them substantially unedited. Standing: **5 briefs, 5
accepted, 0 edited, 0 discarded.** A perfect record, halfway to the bar.

Following each brief through to what actually became of it says something else:

```
  bbq        accepted  NOTES NEVER ARRIVED (pre-D-11)  -> rejected
  nintendo   accepted  NOTES NEVER ARRIVED (pre-D-11)  -> rejected
  naruto     accepted  NOTES NEVER ARRIVED (pre-D-11)  -> rejected
  flowers    accepted  notes arrived                   -> open
  cowboys    accepted  notes arrived                   -> rejected
```

Two findings, and the second rescues the first.

**Acceptance and outcome have diverged completely** — 5 of 5 briefs accepted, 0 of 5
producing a published board. `proposal-verdict` records whether a brief *read plausibly*
at review time. It has never recorded whether the revision it briefed *worked*. A trigger
reading only the first would have graduated an auto-revise loop on a process with no
successes.

**But three of those five are not evidence.** Until **D-11** (2026-08-07),
`requestRevision` wrote the editor's notes and *nothing read them back* — a revision
re-entering at 01 was a blind re-roll of the theme, and "the entire brief apparatus D-5
built was writing to a channel with no receiver." Those three revisions were rejected
because they were never told what to revise. Blaming the proposer for them would be
blaming the author of a letter nobody delivered.

The report detects this **from the artifact, not from a date**: the re-entry prompt either
carries `renderRevision()`'s marker or it does not — the same evidence D-11's own
diagnosis turned on. (It checks stages 01, 02 and 04 only; 03 grades what it is handed and
is not meant to carry the block.)

**So the honest standing is 0 published of 2 usable, with 3 excluded** — not "0 for 5,"
and not "5 for 5." There is not yet enough evidence to graduate the loop in either
direction, and the pipeline has spent its first real post-D-11 revisions only in the last
day. The trigger's *metric* is the thing that needed changing, not its threshold.

---

## Running it

```bash
npm run studio -- --mock --theme "Lantern light"   # fixtures, no network, no key
npm run studio -- --theme "Lantern light"          # needs ANTHROPIC_API_KEY
npm run studio -- --run <runId>                    # resume where it stopped
npm run studio:review                              # the Review Studio (Max's gate)
node tools/check-board.js                          # deterministic board integrity
node tools/evaluator-report.js                     # the measurements above
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
- **`docs/design.md`** — the authority: decisions **D-1 … D-13**, and House-rule
  exceptions HR-1 (zero dependencies) and HR-2 (Studio web surface)
- **`docs/superpowers/specs/2026-08-02-asto-studio-design.md`** — the approved design
- **`docs/backlog.md`** — known gaps, openly. Several are about this pipeline's
  evaluators, and the report above is partly an answer to them.

Zero dependencies, Node ≥22, `node:test`. `npm test` at the time of writing (2026-08-08):
**1160 passing, 0 failing** — 29 of them covering the report tool and the five boundaries
above. The total drifts as boards are added, because `board-integrity.test.js` globs
`puzzles/*.json` and regates every board on every run; the zero is the part that matters.

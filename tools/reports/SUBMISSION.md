# MAIGD Assignment #6 — GER Pipeline

**Game:** ASTO — *"Connections, but with analogies."* A cozy, mobile-first browser word
puzzle. 16 tiles, four analogy sets of four, each set two ordered pairs (`A : B :: C : D`).

**The pipeline is `studio/` in the ASTO repo.** It is not a course exercise — it is the
authoring pipeline the game's shipped boards were made with, and it predates this
assignment. `studio/README.md` is the submission document; start there.

## Where each required part lives

| Required | In ASTO |
|---|---|
| **Generator** | Stages 01–04: pair author → theme grouper → difficulty rater → board builder |
| **Evaluator** | 04a deterministic integrity gate, then four independent agentic evaluators (05 validator · 06 adversarial solver · 07 test player · 08 style guide) |
| **Refiner** | `requestRevision()` re-entry, briefed by the Revision Proposer — human-gated by design |
| **Circuit breaker** | Four separate limits: `maxRevisions` 3 · `maxIntegrityRetries` 2 · transport/validation retries · a per-run budget cap |
| **README** | `studio/README.md` |

## What was built for this assignment

Only one thing: **`tools/evaluator-report.js`**.

The assignment grades evaluator quality on whether it *finds real issues and is connected
to your game*. That is answerable with evidence rather than prose — both halves of every
judgement have been on disk since 2026-08-02 (the evaluators' verdicts, and Max's own),
and had never been joined. The tool joins them.

```bash
node tools/evaluator-report.js          # the readable report
node tools/evaluator-report.js --json   # the same numbers, machine-readable
```

Headline, over 59 judged runs / 66 attempts:

- **05** agreed with Max on 94 of 144 sets (65%) — but flagged 32 he liked and missed 18
  he rejected. Useful; not a verdict.
- **06** produced 254 findings, 27% touching a set he rejected (a floor — "touched" is
  word overlap, not proof).
- **07**'s `knowledgeGated` fired on 24 of 32 attempts that could report it, and design.md
  records two hits he independently confirmed in his own notes.
- **08** agreed on 38 of 66 boards (58%) — barely above a coin flip on a binary.

Most of the tool is about **not lying**: the corpus spans five instrument changes, and
pooling across any of them yields a number that looks authoritative and is wrong. Each is
segmented, and the segmentation is what the 29 tests are mostly about.

The most interesting result is the last one. D-5's graduation trigger for automating the
refine loop counts *brief acceptance* — 5 of 5, a perfect record. Following those briefs
through to outcomes: **0 of 5 produced a published board.** And three of the five predate
D-11, when the editor's notes never reached the stages at all, so their rejections are not
evidence about the brief that asked for them. Honest standing: **0 published of 2 usable,
3 excluded.** The trigger was measuring the wrong thing, and the tool found it.

## Files in this submission

| File | What it is |
|---|---|
| `studio/README.md` | the submission document — GER mapping, breakers, gates, measured evaluator quality |
| `tools/evaluator-report.js` | the measurement |
| `test/tools/evaluator-report.test.js` | 29 tests, mostly on the five boundaries |
| `tools/reports/evaluator-report-2026-08-08.txt` | a saved run |
| `tools/reports/evaluator-report-2026-08-08.json` | the same, machine-readable |

Zero dependencies (House rule HR-1), Node ≥22, `node:test`. Suite: **1155 passing, 0
failing**.

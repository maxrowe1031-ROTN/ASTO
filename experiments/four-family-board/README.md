# The four-family experiment — DISPOSABLE

**Question:** does a board whose four sets ask four different *kinds* of relationship
question feel more like ASTO than one where all four ask the same kind?

Two hand-authored boards, same theme (the kitchen), same familiarity standard, both
clean through `tools/check-board.js`. One is built the way the pipeline builds today —
four causal/"becomes" sets. The other draws its four sets from four different families
of the Bejar/Chaffin/Embretson taxonomy (`docs/research/semeval-2012-taxonomy.md`),
with tiers assigned by how subtle the *family* is to spot rather than by word rarity.

**Which board is which is deliberately not written here.** Play both first, then open
`KEY.md`. Judging them blind is the point.

- `board-a.json`, `board-b.json` — the boards (schema v1.0).
- `install.js` — installs both as **mock** runs through `run-store`'s public API (the
  only legal writer), so they appear in the Review Studio, are playable there, and are
  excluded from the variety index like every other mock run:
  ```bash
  node experiments/four-family-board/install.js
  ```
- `KEY.md` — the unblinding. **Don't open until you've played both.**

**Gate:** Max acceptance only — the playtest. Record verdicts through the Studio's
normal feedback form on each run; the tags land in the same corpus as everything else.
Whatever the outcome, this directory stays an experiment: nothing here is promoted
into `puzzles/` or the pipeline without a redesign (the smallness exemption,
`CLAUDE.md` §5).

---

## RESULT (2026-08-04, Max played both blind)

**The experiment invalidated its own design, which is the most useful thing it could
have done.** Max approved A (the four-family board) as the better puzzle — while
correctly perceiving it as *"all the same… an object moving forward in time somehow,
or one thing after another."* He could not tell the four-family board from the
monoculture control, because every set on it — whatever its formal family — still had
a temporal/causal **arrow** (becomes / goes-to / leads-to / announces). Formal
taxonomy diversity produced zero felt diversity.

Supporting evidence from his feedback (in the two runs' `feedback.jsonl`):
- **Pattern reuse collapses difficulty:** on A he demoted yellow, red AND black all to
  green — "once you notice one relationship you start to see the same relationship
  again quickly."
- **The only real aha came from a dimension shift, not a family shift:** B's dairy
  reveal ("I hadn't considered the forms, only… the time").
- `not-evocative` + `feels-like-asto` ticked together three times: right format, flat
  content — the kitchen theme was too mundane.

**Working hypothesis out of round 1 — explicitly n=1, NOT law (Max's instruction):**
the felt variable is the *arrow*, not the family. Tested again, blind, in
`../arrow-round-2/`.

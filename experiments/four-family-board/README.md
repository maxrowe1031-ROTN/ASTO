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

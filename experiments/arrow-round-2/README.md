# Round 2 — the arrow hypothesis, blind again — DISPOSABLE

**Where round 1 left off** (`../four-family-board/`): the four-family board read to Max
as "all the same — an object moving forward in time somehow," because every set,
whatever its formal family, still had a temporal/causal **arrow**. Round 1's working
hypothesis: *what makes sets feel different isn't the taxonomy family, it's whether
they share an arrow.* **That is an n=1 hypothesis, explicitly not settled** — Max's
instruction. Round 2 exists to see whether it replicates.

Two hand-authored boards, same theme (the night), same familiarity standard, both
clean through `tools/check-board.js`. One mixes an arrowed on-ramp with three
genuinely arrowless relationships (membership, static feature, absence). The other is
all-arrowed — but written to be as evocative as the test board, incorporating Max's
round-1 `not-evocative` tags: if the hypothesis only beats a drab control, it isn't
real.

**Which is which is only in `KEY.md`. Play both first.** (And per round 1's notes:
watch for whether spotting one relationship makes the others fall quickly — the
demotion pattern — and whether any reveal shifts the dimension you were tracking.)

```bash
node experiments/arrow-round-2/install.js
```

Gate: Max acceptance only. Feedback through the Studio's normal form; tier picker
demotions are first-class evidence this round. Nothing here is promoted anywhere
without redesign (smallness exemption, `CLAUDE.md` §5).

---

## RESULT (2026-08-04, Max played both blind)

**Replicated, decisively.** Board B (the mixed arrowed/arrowless test) was approved as
*"the best puzzle yet… my face genuinely lit up… this felt like the cozy puzzle time.
This is ASTO"* — and became the first board in the corpus to score
`good-unchanged + strong-reveal + difficulty-accurate + feels-like-asto` on **all
four sets**. Board A (the all-arrowed control, written just as evocatively) was
rejected, with Max naming the effect himself, blind: *"another 'arrow' puzzle."*

The two decisive notes:
- The membership set changed his solving behaviour — *"hunting around on the board for
  the name of something till I found Venus"* — an arrowless relation is a different
  activity, not just a different answer.
- The absence set produced the biggest reaction *because it inverted the rest*: "a
  complete inverse of the other analogies and I felt a real rush." The black slot may
  naturally belong to the set that runs against the board's grain.

Kept from A's notes: individual arrowed sets can still earn `strong-reveal`
(ember:ash::echo:silence did) — the finding is about boards made *only* of them. And
A's black (night:dew::sleep:dream) over-reached: poetic explanation, mushy relation.

**Status: n=2, blind both rounds, letters flipped, evocative control. Still not law —
but strong enough to design the pipeline change against.** Next step lives in the
dev log's Next: line.

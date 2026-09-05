# Survey motion audition — DISPOSABLE

Max's idea, 2026-09-05, after the two text passes on the end-screen survey:

> "What if after a button tap, the entire line disappeared, that would really show
> it's been recorded. So when you press a number in the difficulty line, it slides
> out to the right and disappears."

This page exists to make **one taste decision** and is never promoted into production
code. When a variant wins, `src/view/survey-view.js` gets it written properly against
`src/view/motion.js`, and this file and its HTML can be deleted.

## Running it

```bash
npm run serve
```

Then open **http://localhost:8080/experiments/survey-motion.html**. It is dressed in the
real `styles/tokens.css` — not a copy — for the same reason the sound audition was: a
motion beat judged on a page that is not ASTO's cream is a different beat. The mock
survey is built at 375px, ASTO's own mobile width.

## The four variants

| | what happens on tap | keeps undo | notes |
|---|---|---|---|
| **A** | Row slides right, fades, height collapses; rows below rise | ✗ | The literal idea. Loudest "that's done." |
| **B** | Same exit, but the gap is held until all three are answered | ✗ | Nothing below jumps while you are still tapping |
| **C** ← **CHOSEN** | Row leaves right; a receipt (`✓ Difficulty 3 · change`) arrives from the left | ✓ | Keeps the answer visible and fixable |
| **D** | Only the tapped dot flies right; its neighbours fade; the label stays | ✓ | Lightest touch; row stays fully re-tappable |

**Max picked C at 300ms** (2026-09-05). The page now opens on that setting; the other
three stay selectable so the choice can be re-checked against them.

## The comment box — the same language, applied to the note

C settled the rows, and the note line should not be left speaking a different dialect.
Four options, picked with the second radio group:

| | on Send with a note | keeps undo |
|---|---|---|
| **1** | Nothing — the box greys out in place (today's shipped behaviour) | ✗ |
| **2** | Box slides right, receipt arrives from the left: `✓ "the black set landed"` | ✗ |
| **3** | Same, and the receipt carries **change**, which brings the box back pre-filled | ✓ |
| **4** | Receipt, then the whole survey folds to one line: *Thanks — all set.* | ✗ |

An empty Send never makes the box leave in any of them — nothing was filed, so nothing
may disappear. Verified for all four.

**The catch with 3, and it is not cosmetic:** `comments` is an append-only table, same
as `ratings`. A player who edits and re-sends files a **second** comment row; it does
not replace the first. For ratings that is fine and intended (D-21's tap log — the
report reads the latest). For comments it means `npm run ratings` will show both the
draft and the revision under the board, and no field says which one the player meant.
The page's own copy admits this out loud when the change link is used. If 3 wins, that
is worth a decision: either accept the duplicates, or the note needs a supersede
mechanism, which is a schema question rather than a motion one.

**What 4 costs:** it discards the three receipts along with everything else, so the
player's last view is a single thank-you rather than a summary of what they gave. That
may be the right ending or may throw away the best part of C — worth watching for
directly, since it is the one variant that undoes C's own payoff.

Also on the page: a **speed dial** (ASTO's own values are `--motion-fast: 187ms` and
`--motion-slow: 281ms`), and a **`prefers-reduced-motion` simulator** — under reduced
motion every variant still reaches the same end state, just without the journey.

## The thing to judge, beyond the feel

**A row that leaves takes the undo with it.** Today a mis-tap is fixable: tap the row
again and the answer changes — a path that is verified working in the shipped game.
Variants **A** and **B** remove that; **C** and **D** keep it. A survey nobody can
correct will quietly collect wrong answers, and the ratings feed board decisions, so
this is a real trade rather than pure taste.

The suggested way to judge: **tap a wrong number on purpose in each variant**, and see
how it feels to be stuck with it.

With C chosen this is answered for the rows — the change link is the escape hatch. It
reopens for the comment box in option 3 above, where the undo exists but is not free.

## Two findings already banked

Both are about `element.animate()`, and both would have bitten the production write-up.

### Reset came back invisible (found by Max, 2026-09-05)

The closing variant faded `#rows` and `#commentSlot` with `fill: 'forwards'` and then
removed them. **Removing an element does not cancel its animations** — so pressing Reset
rebuilt the survey correctly and painted it at `opacity: 0`. Worse, a fill-forwards
animation outranks inline style, so clearing `style.opacity` could not undo it, and once
an element is detached it no longer answers `getAnimations()`, so a later sweep cannot
reach it either. **The cancel has to happen while the element is still attached**, right
before removal.

A second, subtler version of the same class: an exit animation is async, so a tap still
in flight when Reset is pressed used to finish into the *fresh* survey and blank a row
that had just been rebuilt. Handlers now capture a generation counter before their first
await and bail if it has moved.

### Awaiting `finished` hangs when the page is not painted



The first draft `await`ed `Animation.finished` directly, and every variant hung mid-exit
— no row ever left. That is not a quirk of this page: **an animation
timeline pauses whenever the page is not being painted** (a backgrounded tab, a hidden
preview pane), and `finished` then never settles. `src/view/motion.js` already guards
against exactly this with a `Promise.race` against a timer, and its comment says why.

**Whichever variant wins must go through `motion.js`'s helpers rather than raw
`element.animate()` calls** — that guard, and the `prefers-reduced-motion` no-op, are
the two things a hand-rolled version will forget.

## Status

Nothing here is wired into the game. `src/view/survey-view.js` is untouched by this
page; the shipped survey still behaves as recorded in **D-21 addendum** and its
**second pass**.

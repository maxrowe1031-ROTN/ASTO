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
| **C** | Row leaves right; a receipt (`✓ Difficulty 3 · change`) arrives from the left | ✓ | Keeps the answer visible and fixable |
| **D** | Only the tapped dot flies right; its neighbours fade; the label stays | ✓ | Lightest touch; row stays fully re-tappable |

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

A second, smaller question: with A, the survey ends as an empty space above the comment
box. Worth deciding whether that reads as *finished* or as *gone*.

## One finding already banked

The first draft of this page `await`ed `Animation.finished` directly, and every variant
hung mid-exit — no row ever left. That is not a quirk of this page: **an animation
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

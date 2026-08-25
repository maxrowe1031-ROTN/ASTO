# Register scenes and the coffee cat — design

**Date:** 2026-08-25 · **Status:** approved design, craft parameters pending
spike round 2 · **Decision ticket:**
`docs/decisions/2026-08-19-illustrations-scope.md` (holds the history and the
five answered questions) · **Branch:** `work/scene-spike`

## What this is

A pixel-art **scene band** in the play screen's gap between header and analogy
frame: one scene per register (18), each carrying ASTO's recurring character —
**a coffee-loving cat** — with three states (idle · correct · miss). Generated
by a Studio agent under Max's review, rendered by the game from palette-index
grids. This spec records the design as brainstormed and approved 2026-08-25;
it deliberately stops short of the agent prompt and the store/validator
details, which wait on the spike's craft answers.

## The character

The recurring character is a coffee-loving cat — original IP, replacing both
the pixel-Claude idea (Anthropic's, unusable) and the carafe mascot idea.

- **Anchor, not decoration:** a character anchors a composition where a
  horizon cannot. The first spike found street-level/interior registers (the
  bakery, and by extension roughly six of the 18) have no horizon to organise
  around; the cat dissolves that limit ("cat on the counter, warm light
  behind" needs no horizon).
- **Colour: WHITE — decided** (Max, 2026-08-25, spike round 2 by eye; black
  sank into the mountain slopes and harbor water). One near-white is
  **reserved for the cat** in the palette.
- **Ties that already exist:** mistake pips are coffee beans — the cat's miss
  reaction is reacting to losing a bean.
- **Brand:** the cat is designed once, to logo standard, in this effort. The
  brand rollout (wordmark, About, favicon, itch listing) is a separate
  follow-up ticket. Logo direction recorded there: **the cat in the coffee
  cup**. The in-scene character and the logo must end up the same cat.

## Composition — layered

| Layer | Varies by | Count |
| --- | --- | --- |
| Background — the place | register | 18 scenes (still, or one ambient element) |
| Cat — pose + idle loop | register | 18 sprites |
| Reactions — correct / miss | nothing (shared) | 2 |

≈ 38 authored pieces. Accepted cost: the cat composites *over* the scene —
no occlusion, no cat woven behind scene elements. Technically this is what
makes animation affordable: a ~16×16 cat animates at ~256 cells/frame instead
of ~3,000 for a full band.

## States — three

**Idle · correct · miss.** So-close and already-tried read as misses
(consistent with sound: they shake, so they thud). Win and loss are separate
screens and get nothing here. Reactions are shared across all registers, so
states do **not** multiply per-scene art.

## Motion

- The cat's **idle loop is the primary ambient life** (tail sway, ear flick,
  slow blink).
- Each background may carry **at most one** slow ambient element (smoke,
  waves, falling snow) — or none.
- The **local-contrast rule** (first spike, bitten three times): any colour,
  moving or still, must contrast with the local background it sits against,
  not merely belong to the palette.
- Reduced-motion: ambient motion respects `prefers-reduced-motion`, as
  confetti (D-29) already does. Sanctioned GDD no-list deviation #2.

## Palette — "Sunlit Days" + cat-white

One shared palette for **all 18 scenes** — the coherence device. The band's
palette is deliberately **broader than the UI's six tokens**; sitting well
against the cream page is the constraint, token membership is not.

- **Sunlit Days** by Doph (lospec.com/palette-list/sunlit-days), 22 colours,
  chosen by Max from seven Lospec candidates off his Pinterest mood board
  (https://pin.it/2soYC9BHG). Why it fits: its base `#f2e9d3` ≈ `--cream
  #F3ECDC`, its `#e8b85c` ≈ honey `#D9A741`, its darkest `#3f3645` sits next
  to ink `#40342A` — the band reads as native ASTO while adding sky, green,
  and dusk range the UI tokens lack.
- Full set: `f2e9d3 baab99 95827f 806873 635463 3f3645 ada33d 7c7f55 e16d50
  a75d59 94b5a3 799098 6d738d e8b85c d98d49 c381a7 84648a e68a85 9e606d
  eed09b dc9a72 ba7364`.
- **Plus one reserved near-white for the cat** (~`#FDFDFF`; exact value tuned
  in the spike). If the black-cat test wins instead, the reserved colour is a
  dark, and only the winner joins the palette permanently.
- Runner-up recorded: Tachycardia (cooler/pinker; true black + white built
  in).

## Band footprint

**Decided (Max, 2026-08-25, spike round 2 by eye): `150×24 @2.5× = 375×60`,
the taller candidate** — inside the first spike's measured 74px of slack;
re-verify status-strip coexistence when the band enters the real play screen.

## Pipeline (structure settled, details deferred)

- The **agent authors everything** — cat and backgrounds — Max reviews, in
  the Studio's existing loop. The cat is its **own pipeline stage**: cat
  design → Max approves → the 18 backgrounds generate against the approved
  cat. No background work before the character is settled.
- `scene-artist` is an **off-pipeline agent** (registered, absent from
  `STAGES`, hand-triggered — the `revision-proposer` pattern), keeping art
  fully separate from the puzzle pipeline per Max's separation requirement.
- **`art-store.js`** becomes the third write seam, owning `art/` exactly as
  `run-store.js` owns runs and `puzzle-store.js` owns `puzzles/`. Art is
  **data**: palette-index grids in JSON, no binary assets.
- A `scene-html.js` sibling to `board-html.js` renders review pages.
- Deferred until after the spike: the agent prompt (grammar, constraints,
  coherence enforcement), store/validator specifics, view wiring.

## Schema amendment (Max-approved 2026-08-25)

Schema v1.0 gains an **optional `register` field** — a locked-decision
amendment. The Studio stamps it at publish (it knows the run's register); the
51 existing boards get a one-time hand backfill; a board without one shows a
default scene. Belongs to the pipeline build, not the spike.

## Verification shape

- Spike round 2 (disposable): all size × colour × state combinations render
  clean at 375px; animation verified by decoding canvas pixels (the preview
  browser only advances rAF around screenshots — first spike's lesson).
- The session gate is **Max acceptance**: band size and cat colour, by eye.
- Production gates (later): validator + tests for the art schema, headless
  game unaffected (the band is a view; the game must run with it off), and
  Max's playtest.

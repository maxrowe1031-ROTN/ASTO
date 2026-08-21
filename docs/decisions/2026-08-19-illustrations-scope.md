# Open: illustrations in the play screen — scope undecided, mood board first

**Status:** open. Max deferred the scope choice to a visual mood-board session
rather than deciding from prose. Nothing here is approved to build.

**The ask (Max, 2026-08-19):** a small illustration or animation in the space
between the header and the analogy frame — "low spec, pixelated or something",
possibly expanding that gap slightly. First image that came to him: a little
avatar character in the manner of the pixel Claude mascot.

## Findings from the scoping conversation

- **Placement:** the gap holds the status strip ("So close!" renders there), so
  art shares that space with text. The hard constraint is 375px — the play
  screen currently fits without scrolling, and every pixel added above the
  frame pushes Confirm toward the fold. Any design must be checked at 375px.
- **GDD collision 1 — ambient motion is banned.** The calendar cup's steam is
  static for exactly this reason. A character idling on loop contradicts the
  no-list as written. The dodge that keeps the spirit: **event-driven animation
  only** (react on solve/mistake, hold a pose otherwise).
- **GDD collision 2 — flat-cream backgrounds.** A framed illustration panel is
  arguably new territory rather than a background, but shipping anything here
  needs a GDD version bump (Max's).
- **IP note:** the pixel Claude avatar is Anthropic's character — not usable in
  a published game. ASTO's own icon vocabulary (the carafe, the cups) offers an
  original mascot in the same spirit: a pixel coffee pot that steams on a solve,
  spills a drop on a miss.
- **The enabling idea:** pixel art stored as DATA — a small grid of palette
  indices drawn to a canvas. Stays inside "content is data", adds no binary
  assets, and a Studio agent could plausibly generate it, which is what makes
  per-board art conceivable at all.

## The fork the mood board must settle

| Option | Art needed | Ongoing cost | Data/schema change |
| --- | --- | --- | --- |
| **A. Mascot** — one event-reactive pixel character | one sprite set | zero per board | none |
| **B. Register art** — one piece per subject register | 18 pieces | zero per board | a slug→art map file; no schema change |
| **C. Per-board art** — unique per puzzle | 51 backfill + every future board | permanent: a Studio stage, review surface, and art riding the 2-in-6 board yield | an optional field on **locked schema v1.0 — Max's explicit OK required** |

Options compose: A can ship first and B/C layer behind it later without rework.

## What the mood-board session produces

Visual candidates, seen not described: pixel styles and palettes against the
real cream/milk/oat tokens, mascot sketches (the carafe among them), panel
placements mocked at 375px with the status strip present, and event-animation
storyboards (solve/miss). Output: Max picks a scope (A/B/C) and an art
direction; that becomes the design spec's input. The `design` canvas skill or a
throwaway HTML sheet in `experiments/` are the likely instruments.

**Blocked on:** nothing — sequencing is Max's (sound audition is also queued,
spec'd at `docs/superpowers/specs/2026-08-19-sound-design.md`).

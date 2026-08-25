# Open: illustrations in the play screen — scope settled, execution open

**Status:** open, and further along than it was. The 2026-08-25 session settled
the four scope questions this ticket was originally opened for, then ran a
disposable spike that produced real findings and **five new open questions**
(bottom of this file). Nothing is approved to ship; nothing is in `main`.

**The ask (Max, 2026-08-19):** a small illustration or animation in the space
between the header and the analogy frame — "low spec, pixelated or something",
possibly expanding that gap slightly. First image that came to him: a little
avatar character in the manner of the pixel Claude mascot.

## Settled 2026-08-25 (in conversation, before any code)

| Question | Answer |
| --- | --- |
| What is the art's **job**? | **A sense of place** — it changes with the puzzle's subject. Not a fixed mascot, not mere decoration. |
| What **scope**? | **Option B: one scene per register** (18), not per board. A new board then costs *one word* at publish, not an illustration. |
| Who **draws** them? | **A Studio agent generates them**, reviewed and approved by Max — the same loop the puzzles go through. |
| Does it **move**? | **Ambient motion**, deliberately breaking the GDD no-list. Max's call, and the second sanctioned deviation after confetti (D-29). |

**Max's separation requirement, recorded because it constrains the design:** the
art pipeline must be **separate from the puzzle pipeline**, and art must exist
only for puzzles approved for publishing — never for every candidate the board
pipeline produces. Register art satisfies this by construction: `scene-artist`
would be an off-pipeline agent (like `revision-proposer` and `subject-scout`,
which are registered agents absent from `STAGES`), triggered by hand, and art is
keyed to *registers* rather than boards, so no board — approved or rejected —
ever causes art work.

## Findings from the spike (`experiments/scene-spike.html`, disposable)

Four hand-authored scenes on one locked six-token palette and one silhouette-band
grammar. **3 of 4 registers read convincingly; the fourth found a real limit.**

- **The band fits.** 375×50px (150×20 grid at 2.5×) sits in the existing gap
  inside the measured 74px of slack, coexisting with a populated "So close!"
  status strip. The 24px status strip is at y=69; content ends at 593px.
- **Source resolution matters more than footprint.** At 10 source rows a filled
  circle rasterizes to stair-steps — the sun read as a hill. Doubling the
  *source* grid at the *same* on-screen size fixed it. Both candidates now:
  `150×20 @2.5×` (full-bleed) and `168×24 @2×` (inset).
- **The grammar has a shape.** First Light, the harbor and the mountain all
  organise around a **horizon line**, which is what the band format is for.
  **The bakery does not read as a shopfront** — two structural attempts, both
  grid sizes. A street-level building has no horizon to organise around. This
  is recorded as a grammar limit, not a drawing-quality problem, and it is the
  most important open input to the questions below.
- **A palette rule the agent will need:** a colour must contrast with the
  **local background it sits in**, not merely be a member of the approved set.
  The palest token is invisible against the sky band that is already that
  colour — this bit twice, independently (a snow cap, then chimney smoke).

## The five open questions (Max, 2026-08-25) — the next session's agenda

1. **What is the right pixel count inside the grid space?** Two candidates are
   live (`150×20 @2.5×`, `168×24 @2×`) and both render legibly; nothing has
   chosen between them, and neither has been checked on a real iPhone. Relevant
   input: the spike proved resolution, not footprint, is what buys legibility.
2. **What is the reusable colour palette?** The spike locked six tokens from
   `styles/tokens.css` as a coherence device, and that lock is what made four
   scenes look related. But it cost a snow cap, and it forces the local-contrast
   rule above. Open: is six right, which six, and does the palette need one
   token that exists purely to contrast with sky?
3. **Is this the moment to look at ASTO branding more broadly — including the
   recurring character?** The original fork's Option A (an event-reactive
   mascot, the carafe from ASTO's own icon vocabulary) was set aside in favour
   of place-art, but it was never refuted. **This may deserve its own ticket:**
   it is a bigger question than the scene band, it touches the wordmark, the
   About page and the itch listing, and the IP note still stands — the pixel
   Claude avatar is Anthropic's and is not usable in a published game.
4. **How should the agent pipeline be designed?** Architecture is sketched (an
   off-pipeline `scene-artist` on the standard pure agent contract, a third
   write seam `art-store.js` owning `art/`, JSON-shaped output because the
   transport reads only text blocks and `writeJsonAtomic` rejects Buffers, a
   `scene-html.js` sibling to `board-html.js` for review). **Unbuilt and
   unvalidated.** The open half is the *prompt*: what grammar, what constraints,
   how coherence is enforced across 18 pieces, and whether architectural
   registers need a second grammar or get excluded.
5. **What states should the banner have?** The spike only has ambient. Max names
   three: **ambient · correct answer · miss**. This is a real scope increase —
   it turns the band from decoration into a **feedback surface**, which puts it
   alongside sound and motion, and it multiplies the art (18 scenes × states).
   It also revisits the D-28/D-29 territory the session already touched.

## Still true from the original scoping

- **Placement:** the gap holds the status strip; art shares that space with text.
- **GDD:** ambient motion was banned and is now being broken deliberately;
  shipping any of this needs a **GDD version bump (Max's)**, which is already
  owed for audio, the settings screen, the so-close revision and confetti.
- **IP:** the pixel Claude avatar is Anthropic's — not usable in a published
  game. ASTO's own carafe-and-cups vocabulary offers an original mascot.
- **Pixel art as data** — palette-index grids, no binary assets — is not merely
  elegant here; the Studio's existing seams make it the only shape that fits.

**Blocked on:** nothing. Sequencing is Max's. The spike is committed on
`work/scene-spike` and `main` is untouched.

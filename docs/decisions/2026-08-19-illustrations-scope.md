# Open: illustrations in the play screen — scope settled, execution open

**Status:** open — execution only. A second 2026-08-25 session (the coffee-cat
brainstorm) answered all five open questions below, or gave each a deciding
mechanism; the answers are recorded beneath each question. The design lives in
`docs/superpowers/specs/2026-08-25-register-scenes-cat-design.md`. What remains
open is craft (band size and cat colour, settled by spike round 2 + Max's eye)
and then the pipeline build. Nothing is approved to ship; nothing is in `main`.

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

## The five questions (Max, 2026-08-25) — answered in the coffee-cat brainstorm (same day)

**The reframing that answered most of them:** ASTO's recurring character is a
**coffee-loving cat**, present in every scene. A character anchors a composition
where a horizon cannot, which dissolves the bakery grammar limit (and the ~6
street-level/interior registers behind it); it replaces the carafe mascot idea;
and it ties to the coffee-bean mistake pips. Composition is **layered**: one
background + one cat idle per register, **reaction animations shared across all
registers** (~18 + 18 + 2 ≈ 38 pieces).

1. **What is the right pixel count inside the grid space?** Two candidates are
   live (`150×20 @2.5×`, `168×24 @2×`) and both render legibly; nothing has
   chosen between them, and neither has been checked on a real iPhone. Relevant
   input: the spike proved resolution, not footprint, is what buys legibility.
   **Answered:** spike round 2 decides, **taller allowed** — the two candidates
   plus a ~375×60 option inside the 74px slack, judged on whether the cat can
   visibly emote, on Max's phone.
2. **What is the reusable colour palette?** The spike locked six tokens from
   `styles/tokens.css` as a coherence device, and that lock is what made four
   scenes look related. But it cost a snow cap, and it forces the local-contrast
   rule above. Open: is six right, which six, and does the palette need one
   token that exists purely to contrast with sky?
   **Answered:** the band gets its **own palette, broader than the UI's six
   tokens** — one shared palette all 18 scenes draw from. Max chose **"Sunlit
   Days"** by Doph (lospec.com/palette-list/sunlit-days, 22 colours) from seven
   Lospec candidates off his Pinterest mood board (https://pin.it/2soYC9BHG),
   **plus one reserved near-white for the cat**. Its base ≈ `--cream`, its
   `e8b85c` ≈ honey, its darkest ≈ ink, so the band reads as native ASTO.
   Runner-up: Tachycardia. The local-contrast rule stands.
3. **Is this the moment to look at ASTO branding more broadly — including the
   recurring character?** The original fork's Option A (an event-reactive
   mascot, the carafe from ASTO's own icon vocabulary) was set aside in favour
   of place-art, but it was never refuted. **This may deserve its own ticket:**
   it is a bigger question than the scene band, it touches the wordmark, the
   About page and the itch listing, and the IP note still stands — the pixel
   Claude avatar is Anthropic's and is not usable in a published game.
   **Answered:** the character question is settled *here* — the coffee cat — and
   designed once, to logo standard, in this effort. The **brand rollout**
   (wordmark, About page, favicon, itch listing) is its own follow-up ticket.
   Logo direction recorded for that ticket: **the cat in the coffee cup** (Max's
   pick off the mood board). The logo pins are black cats while the in-scene
   character leans white; character and logo should end up the same cat.
4. **How should the agent pipeline be designed?** Architecture is sketched (an
   off-pipeline `scene-artist` on the standard pure agent contract, a third
   write seam `art-store.js` owning `art/`, JSON-shaped output because the
   transport reads only text blocks and `writeJsonAtomic` rejects Buffers, a
   `scene-html.js` sibling to `board-html.js` for review). **Unbuilt and
   unvalidated.** The open half is the *prompt*: what grammar, what constraints,
   how coherence is enforced across 18 pieces, and whether architectural
   registers need a second grammar or get excluded.
   **Answered (structure):** the **agent authors everything** — cat and
   backgrounds — with the cat as its own pipeline stage: cat design → Max
   approves → backgrounds generate against the approved cat. The character-anchor
   grammar replaces the need for a second grammar. Schema v1.0 gains an
   **optional `register` field** (locked-decision amendment, Max-approved
   2026-08-25): the Studio stamps it at publish, the 51 existing boards get a
   one-time hand backfill, and a board without one shows a default scene. The
   prompt itself remains open until the spike settles craft parameters.
5. **What states should the banner have?** The spike only has ambient. Max names
   three: **ambient · correct answer · miss**. This is a real scope increase —
   it turns the band from decoration into a **feedback surface**, which puts it
   alongside sound and motion, and it multiplies the art (18 scenes × states).
   It also revisits the D-28/D-29 territory the session already touched.
   **Answered:** **three states — idle · correct · miss**, expressed by the cat
   (reactions shared across registers, so states do NOT multiply per-scene art).
   So-close and already-tried read as misses, consistent with sound (they thud).
   Win and loss belong to their own screens. Backgrounds stay single-state and
   may carry **at most one** slow ambient element; the cat's idle loop is the
   primary ambient life.

## Still true from the original scoping

- **Placement:** the gap holds the status strip; art shares that space with text.
- **GDD:** ambient motion was banned and is now being broken deliberately;
  shipping any of this needs a **GDD version bump (Max's)**, which is already
  owed for audio, the settings screen, the so-close revision and confetti.
- **IP:** the pixel Claude avatar is Anthropic's — not usable in a published
  game. The original mascot is now the **coffee cat** (2026-08-25), retiring
  the carafe-and-cups idea.
- **Pixel art as data** — palette-index grids, no binary assets — is not merely
  elegant here; the Studio's existing seams make it the only shape that fits.

**Blocked on:** nothing. Sequencing is Max's. The spike is committed on
`work/scene-spike` and `main` is untouched.

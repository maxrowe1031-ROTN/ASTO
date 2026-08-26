# Open: illustrations in the play screen — scope settled, execution open

**Status:** open — **ART DIRECTION SETTLED by Max (2026-08-25). Production
questions now open.** Max authored a full character brief and generated six
reference sheets: the character is **Mochi**, a white cat with a red scarf,
coffee-obsessed. Source of truth lives in `docs/art/` (his two prompts +
README). Claude's pixel and flat-vector spikes are **superseded** and remain
only in `experiments/` as history.

**What Mochi settles:** character, personality, visual style (clean 2D mascot
illustration), palette (three of six colours are exact matches to
`styles/tokens.css`), the logo direction, and the three states — **Idle ·
Miss · Solved** — which match D-30 exactly and are drawn
**register-independent**, vindicating D-30's layered composition.

**The four production questions Mochi opens** — none blocking, all Max's:

1. **Format.** The sheets are raster AI images. Shipping means PNG/WebP, not
   SVG or grids. This finally retires "art as text data" — which was never a
   locked decision, only a rationalisation (already corrected once above).
   **Reference art is now committed** (Max, 2026-08-25): seven sheets at
   1100px / JPEG-88 in `docs/art/reference/`, 12MB → 1.9MB — the repo's first
   binary assets. The *shipped* asset format is still open.
2. **The band survives — scenes change instead. DECIDED (Max, 2026-08-25).**
   375×60 is **6.25:1** against 4:3 scene panels. Rather than rework a
   shipped, live play screen, **future scenes are composed band-shaped from
   the start**. Composition becomes a hard constraint on every scene prompt
   (wide panorama, one horizontal organising line, Mochi as subject, detail
   budget set by the 60px height, empty space on one side for the status
   strip and the Solved hop). Rules written up in `docs/art/README.md`.
   Accepted cost: the richness of the 4:3 scene tests does not transfer.
3. **How art is produced at scale.** An LLM agent cannot draw these. Options:
   the Studio agent authors *prompts* and Max generates by hand; or an
   image-generation API joins the pipeline (**a new external service with
   real recurring cost — Max's call, not a detail**); or everything is
   hand-made, which the volume forbids.
4. **Animation weight.** The reaction sheets are 8 frames per state. Because
   reactions are register-independent, that is **24 shared frames**, not
   24 × 18 — the layered decision paying for itself. Backgrounds are the
   variable cost.

Previously: **format DECIDED (flat vector, not pixel art); character
design and art direction still open (Max, 2026-08-25).** After the flat-vector
style spike Max's verdict: *"that's definitely better... we'll need a better
cat design and art direction but this is def better."* So the rendering format
is settled and the pixel-art assumption is retired; what remains open is the
**character design** and the **art direction** around it.

**The retired assumption, and why it lasted:** pixel art traced to one phrase
in the original 2026-08-19 ask (*"low spec, pixelated or something"*) and was
never re-examined across two spikes. This ticket also claimed palette-index
grids were "the only shape that fits" the Studio's seams — **that was
overstated**. The real constraint is *text, not binaries*; SVG satisfies it,
scales crisply from one source, and is a format an LLM can actually author
(a 3,600-cell index grid is not). The crude output of the pixel rounds was
plausibly as much a format problem as a style one.

Previously: **art direction itself is the open question (Max,
2026-08-25, end of the art-quality session).** After the gold-standard First
Light iteration, Max's verdict: the pixel-art style is not doing what he
hoped — he will come up with a clearer art style and direction before
execution continues. The craft loop is HALTED, not failed: what survives any
style change is the structure (the coffee cat as character, layered
composition, three states, register keying, the off-pipeline agent design,
the optional `register` schema field). What is style-bound and therefore
provisional until direction lands: the silhouette-band grammar, the Sunlit
Days palette, the sprite work, and possibly the band footprint. Previously:
execution only. A second 2026-08-25 session (the coffee-cat
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
   **Answered, and now DECIDED (Max, 2026-08-25, spike round 2 by eye):**
   **150×24 @2.5× = 375×60, the taller candidate.** The cat gets the headroom.
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
   Runner-up: Tachycardia. The local-contrast rule stands. **The cat is WHITE
   (Max, 2026-08-25, spike round 2 by eye)** — black sank into the mountain
   slopes and harbor water, as the dark-ground-underfoot argument predicted.
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

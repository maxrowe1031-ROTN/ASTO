# Art direction — Mochi

**Source of truth for ASTO's character and art direction (Max, 2026-08-25).**
Everything here is Max's own work: the prompts he wrote and the reference
sheets they produced. Claude's earlier pixel and flat-vector spikes are
superseded and live only in `experiments/` as history.

## The character

**Mochi** — a white cat with a small red scarf. Cozy, clever, curious,
encouraging, slightly mischievous, and obsessed with coffee. Not decoration:
an active character who reacts to the player and interacts with each scene.
Personality is communicated visually; Mochi never speaks.

- `mochi-concept-prompt.md` — the full character brief: personality, visual
  identity, expressiveness, animation states, and the explicit **Avoid** list.
- `mochi-character-sheet-prompt.md` — the production reference-sheet brief.

## Reference sheets (Max, 2026-08-25) — `reference/`

Committed downscaled to 1100px and JPEG-88: **12MB → 1.9MB**, the repo's
first binary assets (Max's call). Full-resolution originals stay with Max.

| File | What it is |
| --- | --- |
| `1-concept-exploration.jpg` | The original six design variations — "MOCHI, ASTO's Curious Cat". |
| `2-variations.jpg` | Six personality variants (Classic, Thinker, Trickster, Gardener, Explorer, Dreamer) + do/don't guide. |
| `3-scene-tests.jpg` | Six puzzle worlds (Cozy Library, Garden Path, Dream Clouds, Mountain Lookout, Cafe Corner, Puzzle Ruins) + a silhouette/scarf/expression/environment read test. |
| `4-core-pose-sheet.jpg` | Turnaround, sitting & resting, everyday poses, walk cycle, facial expressions, colour guide. |
| `5-reactions.jpg` | **The three core states as 8-frame sequences: Idle · Miss · Analogy Solved.** Drawn register-independent. |
| `6-logo-colour.jpg` | Logo, full colour — Mochi in a mug, red scarf, ASTO on the cup. |
| `7-logo-monochrome.jpg` | Logo, single colour on cream — the version that survives a favicon. |

**Two logo variants exist**, which is the right shape for a brand: colour for
the About page and itch listing, monochrome for the favicon, wordmark lockup,
and anywhere one ink is all you get.

## The palette, and why it already fits

Max's "ASTO core palette" is derived from the game's own tokens — **three of
six are exact matches** to `styles/tokens.css`:

| Sheet colour | Game token | Match |
| --- | --- | --- |
| `#4F6B47` | `--tier-green-deep` | **exact** |
| `#8F4227` | `--tier-red-deep` | **exact** |
| `#40342A` | `--ink` | **exact** |
| `#F0E6D2` | `--cream` `#F3ECDC` | very close |
| `#E6C76A` | `--honey` `#D9A741` | close |
| `#D94B3D` | *(none)* | **the one new colour** |

`#D94B3D` — the scarf red — is the only colour not already in the game. That
is good brand practice rather than a defect: the mascot gets one signature
colour that is uniquely its own. Nearest existing token is `--tier-red-main`
`#C2603E`, which is available if the scarf should sit exactly on-palette.

**One thing to watch:** the game uses tier-red for the Red difficulty tier.
A bright red scarf is on a character rather than a tile, so a clash is
unlikely — but worth a look once Mochi is on the play screen.

## What the sheets settle, and what they don't

**Settled:** the character, the palette, the personality, the visual style
(clean 2D mascot illustration, minimal shading, soft linework), the logo
direction, and the three states — which match D-30's decision exactly, and
are authored **register-independent**, which is precisely the layered
composition D-30 chose.

**Not settled** (see `docs/decisions/2026-08-19-illustrations-scope.md`):
how this art is produced at scale, what file format ships, and whether the
375×60 band survives contact with 4:3 illustrations.

## The band-shaped composition rule (Max, 2026-08-25)

Max's scene tests are roughly **4:3**. The play-screen slot is **375×60 —
6.25:1**. A Cozy Library cropped to 6.25:1 is a strip of shelf. His decision:
**keep the slot and compose future scenes band-shaped from the start**, rather
than rework a shipped, live play screen.

That makes composition a hard constraint on every future scene prompt, not a
crop applied afterwards. What the format asks for:

- **A wide panorama, not a room.** One place read left-to-right, with a clear
  horizontal organising line — a horizon, a counter, a shelf, a path.
- **Mochi is the subject; the place is the setting.** In a 60px-tall band the
  character is most of the vertical space. Scenes suggest a place with a few
  large shapes; they cannot contain a scene's worth of detail.
- **Detail budget scales with height, not width.** Props must read at ~60px
  tall. The Cafe Corner's chalkboard, biscuit, and vase would all be mush;
  one large silhouetted prop reads.
- **Nothing important in the far left or right.** The band is full-bleed and
  edges get visually trimmed by the rounded corners.
- **Empty sky/wall on one side.** The status strip ("So close!") shares this
  space, and Mochi needs somewhere to hop into on a Solved reaction.

The read test on `3-scene-tests.jpg` — silhouette, scarf visibility,
expression clarity, environment flexibility — stays exactly right; it just has
to pass at 60px tall.

**Not yet decided:** how these get produced at scale (Studio agent writes
prompts vs an image API joining the pipeline — a new recurring cost and Max's
call), and the final shipped file format.

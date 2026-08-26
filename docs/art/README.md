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

## Reference sheets produced (Max, 2026-08-25)

Held outside the repo pending a decision on committing binary assets
(see the decision ticket). Six sheets exist:

1. **Logo** — Mochi peering over an ASTO coffee cup, tail out, one colour.
2. **Mochi Core Pose Sheet** — turnaround, sitting/resting, everyday poses,
   walk cycle, facial expressions, colour guide.
3. **Mochi Reactions** — the three core states as 8-frame sequences:
   **Idle · Miss · Analogy Solved**.
4. **Mochi Scene Tests** — six puzzle worlds (Cozy Library, Garden Path,
   Dream Clouds, Mountain Lookout, Cafe Corner, Puzzle Ruins) with a
   silhouette/scarf/expression/environment read test.
5. **Mochi Variations** — six personality variants (Classic, Thinker,
   Trickster, Gardener, Explorer, Dreamer) with do/don't guidance.
6. **Concept exploration sheet** — the original six design variations.

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

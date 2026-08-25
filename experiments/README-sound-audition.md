# Sound audition — DISPOSABLE

Step 1 of `docs/superpowers/specs/2026-08-19-sound-design.md`. This exists to make
one taste decision and is never promoted into production code. When a palette is
picked, `src/view/sound.js` gets written properly on the `motion.js` pattern and
this file can be deleted.

## Running it

```bash
npm run serve
```

Then open **http://localhost:8080/experiments/sound-audition.html**. Phone or
laptop both work; the page is built at ASTO's own mobile width and dressed in the
real `styles/tokens.css`, because a cozy sound heard on a page that is not cream
is a different sound.

## What is in it

Four palettes, each covering Max's three moments (select a tile, solve a set,
make a mistake). Everything is synthesized live through Web Audio: no audio
files, no dependencies, HR-1 intact.

| palette | what it is | the bet |
|---|---|---|
| **Woodblock** | marimba bar modes (1, 3.9, 9.2) | warm and wooden, nearest the game's coffee-shop register |
| **Ceramic** | inharmonic bell partials plus a contact tick | the most literal reading of cozy: cup on saucer |
| **Hum** | breathed sine blips, slow in and out | the quietest, and the least likely to intrude at tap fifteen |
| **Paper** | filtered noise, no pitch at all | never argues with anything, but the least characterful |

Three ways to listen, in increasing order of how much they tell you:

1. **The three buttons** on each card, for the sound in isolation.
2. **"A whole round"**, which fires four selects at the real 190ms tap rhythm and
   then a solve. This is where a select that seemed fine starts to chatter.
3. **The tap test** at the bottom: pick a palette, then spam a 4x4 board of real
   ASTO words. The card cannot answer the question this one answers.

## The decision this is asking for

**Pick a palette, or redirect.** "None of these, but warmer" is a perfectly good
answer, and cheaper to act on now than after `sound.js` exists.

Three things worth having an opinion about while listening:

- **Select fires most often by far.** It has to be nearly invisible. Anything
  that is merely *pleasant* will be irritating by the fourth board.
- **Solve is the reward** and can afford to be the prettiest thing here. Say if
  it is underplayed.
- **Mistake is the trap.** None of the four is a buzzer, deliberately, because
  the GDD's mistake pips are coffee beans and never red. If one reads as
  punishment rather than a gentle "not that", it gets softened.

Mixing is allowed and probably right: the select from one palette with the solve
from another is a normal outcome of an audition.

## What is deliberately not here

No mute toggle, no volume persistence, no autoplay handling beyond the lazy
context, and no tests. All of that belongs to `src/view/sound.js` in step 2, and
building it here would be building the production module twice. The volume slider
is for auditioning only; production ships at a low default, per the spec.

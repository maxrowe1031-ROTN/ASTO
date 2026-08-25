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

## Max's mix (2026-08-25)

He picked across palettes rather than one of them: **paper select, ceramic solve,
woodblock mistake.** That reads as coherent rather than scattered, because the
three are materials off one cafe table, and because the moments are maximally
distinguishable that way: a dry unpitched tap for the frequent thing, a bright
ringing reward, a low wooden thud for the negative.

The page now opens on a **Your mix** card carrying that combination, because a
cross-palette mix raises a question the four cards cannot answer. Each palette
was levelled against **itself**, so a bandpassed noise burst is now sitting next
to a bell at gains that were never compared. The card therefore adds:

- **per-moment trim**, to balance them by ear before any of it reaches code;
- **dropdowns**, so the mix stays A/B-able (swapping solve to hum is one tap);
- **two sequences** that are the only combinations the game actually produces:
  four selects then a solve, and four selects then a mistake.

Whatever the trims end up at is real design data, not a scratch setting: it
becomes the relative levels in `sound.js`'s exported parameter table.

### The chime, retuned (same day)

Max on the first ceramic solve: *"a little too bright and metallic."* Correct, and
it named a mistake in the recipe rather than a matter of taste. `BELL`'s ratios
**are** metal (1, 2.76, 5.4 are struck-bronze modes), and worse, every partial was
given the **same decay as the fundamental** — upper partials that sustain as long
as the body is the definition of a ringing metal object. A glazed cup damps its
highs fast and keeps its body.

So the solve became two physical dials on the mix card, defaulting to a warmer
recipe rather than to a guess that cannot be argued with:

| | old | new default |
|---|---|---|
| root | 1108 Hz | **809 Hz**, a fourth lower |
| 2nd partial | 2.76 at 0.42, full decay | **2.35 at 0.27, 63% decay** |
| 3rd partial | 5.40 at 0.16, full decay | **4.28 at 0.09, 54% decay** |
| lowpass | none | **4.7 kHz** |
| contact tick | 4200 Hz | **2712 Hz, half as loud** |

**Body** moves the fundamental; **Damping** controls how fast the highs die
relative to it, plus the lowpass and the tail length together. The old bright
version stays playable on its own button, because a retune should be judged
against the thing it replaced and not against a memory of it. The panel appears
only while ceramic is the chosen solve.

**The dial positions are the deliverable.** Whatever Body and Damping read when it
sounds right are the numbers that go into `sound.js`.

**Max settled on Body 30, Damping 86** the same day. That is now the page default
and the incumbent recipe.

### A shortlist for the solve (same day)

He asked to hear more options for the solve specifically, which is the right
moment to spend choice on: it fires four times a board rather than forty, and it
is the only one the player is meant to actively enjoy. Six candidates, chosen to
be different *ideas* rather than shades of one:

| | what it is |
|---|---|
| **Cup (yours)** | the tuned ceramic at 30/86, rising. The incumbent. |
| **Cup, as a chord** | same cup, same three notes, struck together over a 14ms roll instead of in sequence |
| **Settle** | marimba, **falling**. A piece landing where it belongs. |
| **Bloom** | one strike plus a slow warm swell. Five voices, no melody. |
| **Harp** | plucked: a full harmonic series with the highs dying fastest |
| **Thumb piano** | a small damped tine rising a minor third. Handheld cozy rather than tableware cozy. |

The axis worth attention is **rise versus fall**. Every candidate before this one
rose, and a rising figure reads as *well done*. ASTO's solve animation is a snap
into canonical order, which is arguably *that is where it goes* — which is what
**Settle** is testing. It may be wrong for the game, but it had never been asked.

Each card has **Hear** and **Use in the mix**; the latter also plays four real
selects first, because a solve heard cold is not the solve the player hears. The
Body/Damping dials stay live for the three ceramic-derived candidates and hide
themselves for the others.

### Select variation (same day)

Max: *"i read somewhere that sometimes its good for sounds to have tone
variations so that it doesn't sound annoyingly repetative."* He is right, it is
standard practice (round-robin), and select is exactly where it pays: it fires
forty-odd times a board against the solve's four.

Four strategies on the mix card, because they are not equally good ideas here:

- **None** the control.
- **Random** the textbook fix. Jitter every tap, never repeats, carries no
  meaning. Push the amount up and it reads as an instrument out of tune.
- **Round robin** a fixed cycle of four. Varied but predictable, so it stays
  musical where random goes woozy.
- **Frame ladder** pitch **rises with the slot being filled** and resets when the
  frame clears. Default, and the one worth arguing for.

The ladder is the interesting one because ASTO's frame holds exactly four. The
variation stops being decoration and starts carrying information: how full the
frame is, without looking, building toward the fourth tap that completes it. A
deselect steps the ladder **back**, because the slot it filled is empty again.
At the default amount of 55 the four rungs are 0 / 1.1 / 2.2 / 3.85 semitones.

**The honest caveat, stated on the page too:** paper select is unpitched noise,
so a ladder moves its *brightness* rather than its pitch, which is much less
legible than it would be on a pitched select. Switching select to Hum or
Woodblock is worth doing while judging this, because **the ladder may be a
reason to reconsider the select**, not just a setting to turn on.

The tap-test board honours all of this, with a **Clear the frame** button and a
slot readout while the ladder is on.

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

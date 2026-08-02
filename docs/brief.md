# Brief — ASTO

> Product intent, in plain language. Restated from `docs/asto-gdd.html` (v0.13)
> and `docs/design.md`'s Context — this file decides nothing new. Where it and
> the design plan appear to disagree, `docs/design.md` wins (see
> `docs/governance.md`, Authority order).

## What it is

**ASTO** — pronounced "as too" — is a cozy, mobile-first browser word puzzle.
*Connections, but with analogies.*

A board of 16 shuffled word tiles hides four analogy sets. The player taps four
words **in order** to form `A : B :: C : D` — "A is to B as C is to D" — reviews
the filled frame, and presses Confirm. Four sets, four difficulty tiers (Green,
Yellow, Red, Black), lose on the fourth mistake. A session is 2–8 minutes.

## Who it's for

Players who enjoy daily word rituals — Connections, crosswords, word ladders,
logic puzzles — and who like being briefly stumped and then rewarded by a clean
insight. The audience skews toward people who appreciate wordplay, double
meanings, and elegant construction.

## The core experience

The fantasy is **recognition**, not power or speed. The puzzle is not "which
words are similar?" but "what relationship repeats across these pairs?" The
game wants the player leaning in, testing a theory, quietly saying the analogy
under their breath — *"Seed is to tree as spark is to fire"* — then locking it
in.

Two consequences shape everything:

- **Order is the game.** A submission is never sorted; the ordered claim is the
  claim. Right words in the wrong order gets "So close!", costs a mistake, and
  turns the penalty into a useful hint.
- **It must feel handcrafted.** AI is used behind the scenes to help author
  puzzles; the player never sees it, never hears about it, and never plays
  something that reads as generated.

Cozy is a constraint, not a mood board: no time pressure, no penalty for
thinking, no confetti, no particles, no timers, and mistake pips are coffee
beans that are never red.

## MVP vs. later

**In the prototype** — the full core loop (select, review, Confirm, solve, win,
lose), win and loss screens with explanations revealed on loss, a first-run
tutorial, a puzzle-select screen with persisted per-puzzle results, and **at
least 10 curated boards** (20 as a stretch). Content is schema v1.0 JSON loaded
locally. Behind it, the **AI Puzzle Studio** — a development-time pipeline of
specialist agents that generates, validates, stress-tests, rates, and style-
checks candidate boards for human editorial approval. The Studio is the
project's primary technical and learning focus and is designed to scale past
20 puzzles; it is never player-facing.

**Explicitly later** — daily puzzle scheduling, themed packs, streaks, accounts,
community or editorial features, and any server-backed puzzle source. The
`PuzzleSource` seam exists so `ApiSource` can arrive later without touching the
engine; nothing else about that future is being built now.

## What "locally shipped" means

ASTO is locally shipped when, served from `npm run serve` on a phone-sized
viewport with no network beyond localhost, a first-time player can land in the
tutorial, complete it, choose from **10+ validated boards**, and play any of
them to a real win or a real loss — with results surviving a reload, `npm test`
green, and every board passing `tools/check-board.js`.

Publishing to GitHub Pages is a separate milestone after that, not part of it.

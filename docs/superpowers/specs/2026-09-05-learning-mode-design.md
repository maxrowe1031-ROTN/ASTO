# Learning Mode — the Vocab button defines any tile

**Status: approved by Max 2026-09-05** (brainstormed the same day). Becomes
**D-33** in `docs/design.md` when it ships.

## Why

The Vocab button (D-18) reveals one authored definition and stops. Max: some
players want more vocabulary help than one word. **Learning Mode** is an on/off
setting, default off. When on, pressing Vocab arms the board and tapping any
tile shows that word's definition. Every tile has one.

Decisions made with Max, in order:

1. **Scope: all sixteen words** get a definition, not only knowledge-gated ones.
2. **Leak rule relaxed for these definitions.** They may say what a thing does.
   Learning Mode is an easy mode by intent. The one-word `glossary` keeps D-18's
   full leak check and is untouched.
3. **Marked lightly.** A result records `learning: true` only when the mode was
   on and at least one tile was defined. The share line carries `📖`. The
   player's record shows a small book beside the cup. Statistics unchanged for now.
4. **Press Vocab, then tap a tile.** Not cycling, not a list. The footnote shows
   the most recently defined word while it is on the board.
5. **Backfill auto-applies** to all 51 boards and the tutorial, no review file.
6. **Shape: engine rule + separate `definitions` data** (approach A).
7. **Name: Learning Mode**, one toggle.
8. **The tutorial teaches it**: what it does and where to turn it on.

Why this shape: the engine and schema already allow a list of glosses. What
stopped the button was content (one entry per board, D-18's editorial choice)
and the absence of a mode. Keeping the leak-checked gloss separate from the
relaxed definitions keeps D-18's guarantee intact and lets each validator know
which check applies.

## Data

- Optional puzzle field `definitions: [{ word, definition }]` beside `glossary`.
  An additive amendment to locked schema v1.0, Max-initiated, the same kind as
  D-18's. Boards without it simply have no Learning Mode content.
- Game validator (`src/source/validate-puzzle.js`): when present, an array of
  objects; `word` non-empty and one of the sixteen board words; `definition`
  non-empty; no word twice (case-insensitive). **Partial lists are valid** so a
  hand-edited word that loses its entry never breaks a board.
- Pipeline validator (the new agent): exactly sixteen, one per word, none extra.
- A tile with no definition shows "No definition for this one." in the footnote.

## Engine and controller

`src/engine/engine.js` (pure, unchanged imports):

- `DEFAULT_RULES.learningMode: false`.
- State gains `vocabArmed: false`, frozen with the rest.
- `revealVocab(state)`: unchanged when the rule is off. When on, it toggles
  `vocabArmed`: outcome `{ type: 'vocab-armed' }` on arming, `{ type:
  'vocab-disarmed' }` on disarming. No-op when not playing.
- `defineWord(state, term)`: only while armed and `term` is on the board. Moves
  `term` to the end of `vocabRevealed` (so "latest" is right even on a repeat),
  clears `vocabArmed`, outcome `{ type: 'vocab' }`. Otherwise `{ state, outcome: null }`.
- `withRules(state, changes)`: frozen state with the rules merged, so a settings
  change reaches the live game. Turning `learningMode` off while armed disarms.
- Solving while armed leaves `vocabArmed` alone.

`src/controller/game-controller.js`: `tileTapped` routes to `defineWord` while
`state.vocabArmed`, else select/deselect as today. New `rulesChanged(changes)`
calls `withRules` and renders. `vocabPressed` unchanged: the engine decides.

`src/view/vocab-view.js`: renders the **last** `vocabRevealed` word still on the
board. Lookup order: `glossary` (leak-checked) then `definitions`.

## Player-facing surfaces

- **Storage**: `asto.learningMode`, `isLearningMode()` false whenever unknowable,
  `setLearningMode(bool)`.
- **Settings**: a second group, **Help**, one row labelled "Learning mode" with a
  pill that says what pressing it does, "Turn on" / "Turn off", `aria-pressed`,
  the Mute precedent. A one-line note: "Vocab defines any tile you tap."
  `render({ muted, volume, learningMode })`.
- **app.js**: the toggle writes storage, repaints Settings, and calls
  `controller.rulesChanged({ learningMode })`. Every board load, tutorial
  included, merges `learningMode: storage.isLearningMode()` into its rules.
- **Controls**: the Vocab pill is hidden only when a board has neither
  `glossary` nor `definitions`. In Learning Mode it stays enabled while playing,
  `aria-pressed` mirrors `vocabArmed`, class `armed`. Default mode unchanged.
- **Board**: class `defining` on the board root while armed; tiles take a soft
  dashed outline. No motion.
- **Status line**: `vocab-armed` reads "Tap a tile to see what it means.";
  `vocab-disarmed` clears; `vocab` copy unchanged.
- **Sound**: nothing new. Arming and defining change no selection; the pill tap
  already sounds.

## Tutorial

`src/controller/tutorial-script.js` stays pure and already reads `state.rules`.

- Vocab step, mode off: current sentence plus "Want every word defined? Turn on
  Learning Mode in Settings — the gear on the calendar."
- Done step gains a `note` so a player who never presses Vocab hears it once:
  "Need more word help? Learning Mode in Settings lets Vocab define any tile you
  tap."
- Mode on during the tutorial: `vocab-armed` → "Learning Mode is on — tap any
  tile to see what it means." and `vocab` → "That's what that word means. Press
  Vocab and tap another tile whenever you like."
- `TUTORIAL_RULES` unchanged; the flag merges at load like every board.
- No step may name a set, tier, or word (the existing rule).

## Marking

- `results-recorder.js`: `learning: true` written only when the mode was on and
  `vocabRevealed` is non-empty. History rows carry it too.
- `share.js`: ` · 📖` appended to the score line under the same condition.
- `result-icons.js`: `BOOK` SVG (small closed book, static, 24-unit grid) and
  `badgeFor(result)` returning it for a learning result. Pose and colour grammar
  untouched.
- `calendar-view.js`: grid cell and day card both render the badge and add
  `is-learning`; the day card's label gains "with definitions".
- `components.css`: `.result-badge` as a lower-right corner mark in the grid
  cell and beside the cup on the day card. Ink colour. Must read at both sizes.
- `stats.js` unchanged.

## Content pipeline and backfill

- New agent `studio/agents/definitions-author.js`, stage `10-definitions-author`,
  effort `low`, registered in the agent index, stage registry, and pipeline
  config (profile bumped). Prompt: sixteen plain, friendly definitions, may say
  what a thing does, soft steer not to spell out which words pair, ≤160 chars.
  Validator: exactly sixteen, every board word once, none extra, none empty.
- `studio/gloss.js` gains `mergeDefinitions` beside `mergeGlossary` (same drop
  rule); `studio/review/api.js` merges both at save and publish.
- Review card shows a run's definitions folded under the board.
- Backfill: `studio/definitions-backfill.js` + `tools/backfill-definitions.js`,
  modelled on the glossary backfill with **no review file**. `--generate
  [--dry-run]` authors and applies through `puzzle-store` for every board lacking
  a full sixteen, sequentially, tutorial included; failures print and re-run.
- Content gate: a test that every board in `puzzles/` carries sixteen
  definitions, once the backfill has run.
- `studio/README.md`: 11 → 12 agents, stage list updated.

## Tests

Engine (`test/engine/vocab.test.js`, `game-flow.test.js`): mode off unchanged;
arm/disarm; define routes and no-ops; latest-wins order; disarm on mode off;
immutability; a headless Learning Mode playthrough with the view off.
Controller: routing while armed, `rulesChanged`. Tutorial script: the four copy
rules above. Storage, results recorder, share, result icons. Validator cases for
`definitions`. Studio: the agent's validator, `mergeDefinitions`, backfill
partition. Existing prompt-schema and registry tests pick up the new agent.

## Verification

1. `npm test` green (baseline 1633/0); `node tools/check-board.js` clean.
2. Browser at 375×812: default mode identical to today; toggle on in Settings;
   Vocab arms (outline + status line); tap a tile → footnote; tap the hard word
   → leak-checked gloss; Vocab again disarms; toggling off mid-game disarms; win
   → share carries 📖; results carry `learning: true`; mode on with no define
   records nothing; calendar cell and day card show the book beside the cup,
   hinted + learning shows brown cup plus book; zero console errors.
3. Backfill dry-run, then live; spot-check three boards; `npm run check-deploy`
   after push.
4. Log entry; D-33 in `docs/design.md`; CLAUDE.md §4 note; GDD flagged for
   Max's version bump.

## Reconsider-when (for D-33)

- Learning Mode results dominate wins on the ratings table or the calendar: the
  easy mode has become the game, and the default deserves a look.
- Definitions keep spelling out pairings so plainly that a board solves from the
  footnote: add a mechanical check (a definition may not name its partner word)
  rather than a stricter prompt.
- The Settings page's second section proves the D-27 page was not premature; if
  a third setting never arrives, nothing needs undoing.

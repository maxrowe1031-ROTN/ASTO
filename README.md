# ASTO

> *Connections, but with analogies.*

A cozy, mobile-first browser word puzzle. A 4×4 board of 16 word tiles hides four analogy
sets — `A : B :: C : D`. Tap four words **in order**, review the frame, Confirm.

**Do not open `index.html` with `file://`** — ES modules and `fetch` both fail from the
file protocol. Always serve it:

```bash
npm run serve
```

```bash
npm test
```

Zero dependencies. Vanilla HTML/CSS/JS ES modules, no build step. Tests use node's
built-in `node:test` (requires Node 22+).

## Documentation

| File | What it is |
| --- | --- |
| [`docs/design.md`](docs/design.md) | The approved build plan — locked decisions, architecture, the 5 phases and their gates. **The authority.** |
| [`docs/asto-gdd.html`](docs/asto-gdd.html) | The Game Design Document (v0.13). Open in a browser. Its no-list is spec. |
| [`docs/log.md`](docs/log.md) | Dev log, newest first. The latest `Next:` line is the live task. |
| [`CLAUDE.md`](CLAUDE.md) | Operating instructions for Claude Code in this repo. |

## Architecture — the boundary law

Headless **PuzzleEngine** → read-only **views** → one thin **GameController** →
**PuzzleSource** seam.

- `src/engine/**` and `src/source/validate-puzzle.js` are **pure**: no DOM, no `fetch`, no
  globals, no `Math.random` without an injected RNG. They import nothing outside
  themselves.
- **Views never call engine mutators** and never decide rules. They render state and emit
  intents.
- **Only `src/controller/game-controller.js` calls engine functions.** It owns no game
  state.

The test that keeps this honest: **the game must run correctly with the view turned off.**
`test/engine/game-flow.test.js` plays a full win and a full loss through engine imports
alone.

## Layout

```
src/engine/      pure game logic — the part that decides things
src/source/      PuzzleSource seam + schema v1.0 validator
src/view/        read-only renderers (Phase 2+)
src/controller/  the only writer (Phase 2+)
puzzles/         board JSON, schema v1.0
tools/           check-board.js (validate + integrity), serve.js (static server)
test/            node:test suites — engine/ · source/ · content/
```

## Puzzle schema v1.0

`pairs` is the single source of truth — the 16 board words are **derived**, there is no
`words[]`. There is no `tier` field either; tiers derive from `difficulty` 1–4 →
Green/Yellow/Red/Black. Exactly four sets, one per difficulty.

```json
{
  "id": "asto-first-light",
  "title": "First Light",
  "date": "2026-08-01",
  "sets": [
    {
      "id": "set-growth",
      "relationshipLabel": "Small origin becomes larger result",
      "explanation": "A seed grows into a tree the way a spark grows into a fire.",
      "pairs": [["Seed", "Tree"], ["Spark", "Fire"]],
      "difficulty": 1,
      "baitTags": ["nature"]
    }
  ]
}
```

Check a board before committing it:

```bash
node tools/check-board.js puzzles/first-light.json
```

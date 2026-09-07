# ASTO

> *Connections, but with analogies.*

A cozy, mobile-first browser word puzzle. A 4×4 board of 16 word tiles hides four analogy
sets — `A : B :: C : D`. Tap four words **in order**, review the frame, Confirm.

## How to play

Play at **https://www.playasto.com** — one new board a day, every past day in **Past Pours**.

1. The sixteen tiles hide **four analogies** of four words each: `A : B :: C : D`,
   *this is to that as this is to that*. Find a relationship that repeats, not a category.
2. **Tap four tiles in order.** They fill the frame as you go; tap a filled slot to take a
   word back out, or drag to reorder.
3. **Confirm.** Right words in the right order solves the set. Right words in the wrong
   order is *"So close!"* — it keeps your four in the frame and costs one bean.
4. **Four coffee beans, four mistakes.** Lose the fourth and the board reveals the rest.
   **Hint** tints one whole set; **Vocab** defines a hard word. Both are free.
5. Solve all four to finish. The colour of each set — green, yellow, red, black — shows
   how tricky it was, revealed only once you have it.

New here? **How to play** on the title screen runs a coached warm-up board.

**Do not open `index.html` with `file://`** — ES modules and `fetch` both fail from the
file protocol. Always serve it:

```bash
npm run serve
```

Then open http://localhost:8080.

```bash
npm test
```

The game is **daily** (D-24): one board releases at midnight Mountain Time, gated
client-side by each board's `date`; **Past Pours** is the calendar of every day before
this one. `npm run check-schedule` reports the publishing runway — today's board, days
queued ahead, gaps.

Zero dependencies. Vanilla HTML/CSS/JS ES modules, no build step. Tests use node's
built-in `node:test` (requires Node 22+).

## Documentation

| File | What it is |
| --- | --- |
| [`docs/design.md`](docs/design.md) | The approved build plan — locked decisions, architecture, the 5 phases and their gates, house-rule exceptions. **The authority.** |
| [`docs/asto-gdd.html`](docs/asto-gdd.html) | The Game Design Document (v0.13). Open in a browser. Its no-list is spec. |
| [`docs/brief.md`](docs/brief.md) | Product intent — what ASTO is, who it's for, MVP vs. later, what "locally shipped" means. |
| [`docs/log.md`](docs/log.md) | Dev log, newest first. The latest `Next:` line is the live task. |
| [`docs/backlog.md`](docs/backlog.md) | The parking lot. Unapproved ideas, one line each. |
| [`docs/recovery.md`](docs/recovery.md) | Plain-language rollback playbook — how to get back to a working state. |
| [`docs/governance.md`](docs/governance.md) | Authority order, project health check, template migration protocol. |
| [`docs/decisions/`](docs/decisions/) | Open questions as decision tickets. |
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

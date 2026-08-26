# Art pipeline — design (2026-08-26)

**Status:** approved in conversation with Max, unbuilt.
**Supersedes:** the `scene-artist` sketch in
`docs/decisions/2026-08-19-illustrations-scope.md`.
**Depends on:** `docs/art/` (Mochi — the character, the palette, the
band-shaped composition rules) and D-30 + its amendment in `docs/design.md`.

## Context

Max: *"I'm definitely not going to produce all these by hand. The goal is to
have the process automated similarly to the puzzle agent pipeline."*

The art direction is settled (Mochi, a white cat with a red scarf) and the
reference sheets exist. What does not exist is any way to make **18 register
scenes** without Max drawing each one in ChatGPT by hand. This spec describes
the pipeline that produces them, built to the same law as the puzzle pipeline:
**pure agents, one module owns the network, one module owns writes.**

## The two decisions that shape everything

### 1. Mochi is generated INTO each scene (Max, 2026-08-26)

The alternative — a fixed Mochi sprite composited over generated
backgrounds — would have made character consistency structurally impossible to
break, because the image model would never draw Mochi at all. Max chose
against it, and the reason is good: his scene tests are compelling precisely
*because* Mochi is holding the magnifying glass and sitting on the cloud.
Compositing a sprite over a background cannot produce that.

**Accepted consequences, stated plainly:**

- **Character consistency becomes the pipeline's central risk**, not a solved
  problem. Every render is conditioned on reference art, and the critic must
  check character fidelity as a first-class criterion.
- **Frame-by-frame animation is off the table.** 8 frames × 3 states × 18
  registers is 432 images that could never stay on-model. The three states
  become **three stills per register, cross-faded**; ambient life is CSS
  (a slow drift or parallax), not frames.
- **Volume: 18 registers × 3 states = 54 images**, plus iteration.

This partially revises D-30's layered composition. What survives: three
states, register keying, the 375×60 band. What changes: the states are stills
of whole scenes, not sprite frames over a shared background — so the
"24 shared frames" saving is gone, replaced by 54 whole images.

### 2. The render step ships as a manual transport first (Max, 2026-08-26)

`llm.js` already proves the pattern the Studio needs here: **the transport is
injected**, which is why `--mock` is a swap rather than an `if (mock)` branch.
The render step gets the same treatment, with two transports behind one
interface:

| Transport | Behaviour | Cost |
| --- | --- | --- |
| **manual** (build this) | Writes the prompt to `art/pending/<register>-<state>.txt` and waits for a PNG to appear beside it. Max renders in ChatGPT, exactly as he already does. | none |
| **api** (build later) | Calls an image API and returns bytes itself. | ~$0.02–0.19/image |

Everything except one `fetch` — the prompter, the gate, the critic, the store,
the review surface — is exercised by the manual transport. The API transport
is then a drop-in, and its approval (a new external service, a new key, real
cost) is a separate conversation with Max, deliberately deferred.

**Note for whoever wires the API:** `gpt-image-1` deprecates **2026-10-23**;
pin a current model. Pricing above is per
[OpenAI's image API](https://openai.com/index/image-generation-api/) as of
2026-08; re-check at build time.

## Architecture

### Stages — a sibling registry, not an extension of `STAGES`

The board pipeline's `STAGES` stays untouched. Art gets its own ordered list
in the same shape, for the same reason the original exists: run directories,
resume, and re-entry all derive from it.

```
01-scene-prompter   agent, pure     register + Mochi bible + band rules + state
                                    → an image prompt (TEXT IN, TEXT OUT)
02-render           transport       prompt → PNG bytes (manual | api)
02a-scene-check     gate, pure      deterministic: dimensions, aspect, file size,
                                    palette distance from the ASTO core palette,
                                    one side clear enough for the status strip
03-scene-critic     agent, vision   the rendered band + Max's own read test
                                    (silhouette · scarf · expression · environment
                                    · IS THIS MOCHI) → verdict + revision note
```

Then Max reviews and approves in the Studio, and approval publishes into
`art/` — mirroring exactly how an approved board reaches `puzzles/`.

### Modules

| New module | Mirrors | Responsibility |
| --- | --- | --- |
| `studio/agents/scene-prompter.js` | any agent | **Pure.** Standard contract (`id`, `stageId`, `getOutputSchema`, `buildPrompt`, `parse`, `validateOutput`). Fits with **zero** changes to the agent contract. |
| `studio/agents/scene-critic.js` | `adversarial-solver` | **Pure.** Judges a rendered band. Needs vision input — see Known gaps. |
| `studio/image.js` | `llm.js` | The **only** module that fetches an image API. Injected transport; manual and mock are swaps. |
| `studio/storage/art-store.js` | `run-store`, `puzzle-store` | The **only** module that writes `art/`. Handles bytes, which `run-store` does not. |
| `studio/art-run.js` | `run.js` | Orchestrator. Owns budget charging; agents stay ignorant of cost. |

Registry entries go in `studio/agents/index.js` and a new
`studio/art-stage-registry.js` — the two-places-to-name rule the existing
registry comments promise.

### Boundary law compliance

- Agents stay **pure**: no DOM, no `fetch`, no globals. The prompter and critic
  build prompts and parse replies; nothing else.
- **One network module per medium**: `llm.js` for text, `image.js` for images.
  Neither is imported by an agent.
- **One write seam**: `art-store.js` is the only module that touches `art/`,
  exactly as `run-store.js` is for run artifacts and `puzzle-store.js` for
  `puzzles/`.
- **Budget**: `budget.js` already enforces `costUsd` as a first-class metric,
  so per-image cost has somewhere to be charged on day one. No new taxonomy.

### Data

`art/` layout (owned by `art-store.js`):

```
art/
  index.json                     generated manifest, like puzzles/index.json
  <register>/
    idle.png  miss.png  solved.png
    meta.json                    prompt, transport, model, approvedAt, critic verdict
  pending/                       manual-transport handoff only, git-ignored
```

The game reads `art/index.json` and resolves `register → 3 stills`. A board
without a `register` (schema v1.0's approved optional field, D-30) falls back
to a default scene — so art is additive and never blocks a board.

## Known gaps — real work, named

1. **No image API emits 6.25:1.** The widest common size is 1536×1024 (3:2).
   The prompt must place content in a horizontal band with dead sky above and
   ground below, and the gate crops to 375×60. "Compose band-shaped" is
   therefore a *prompt discipline plus a crop*, not a canvas setting.
2. **The transport cannot send images.** `llm.js` builds
   `messages: [{ role: 'user', content: prompt }]` — `content` is a plain
   string. The critic needs the array form (`[{type:'text'},{type:'image'}]`).
   Small, contained, and required before `scene-critic` can work.
3. **Style drift across 18 scenes** stays possible even with a fixed prompt
   preamble. Likely needs a style-anchor reference image passed to every
   render; the manual transport is where that gets learned cheaply.
4. **Character fidelity has no automated ground truth.** The critic can judge
   "does this read as Mochi" only as well as a vision model can. Max's
   approval remains the real gate — as it is for boards.

## Build order

1. `scene-prompter` + tests — pure, self-contained, needed on every path.
2. `art-stage-registry` + `art-store` + tests — the write seam before anything
   writes.
3. Manual render transport + `art-run.js` — end-to-end with Max rendering.
4. Vision support in the transport, then `scene-critic`.
5. Review-surface integration (approve → publish), mirroring board review.
6. *Later, separate approval:* the API transport.

## Verification

- **Automated:** `node:test` unit tests per module; the pipeline runnable with
  `--mock` end-to-end with no network and no files written outside a temp root.
- **Claude-verifiable:** a generated prompt inspected for the band rules; a
  rendered band checked in the preview browser at 375px against the real play
  screen.
- **Max acceptance (the real gate):** do the 54 stills look like ASTO, and does
  Mochi look like Mochi. Never assumed on his behalf.

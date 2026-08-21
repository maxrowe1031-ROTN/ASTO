# Sound — the cozy kind, auditioned before it ships

## Context

Max, after the publishing-polish class (2026-08-19): *"adding any kind of
sound... could be a great addition and really add to the cozy vibe if there was a
small sound when you select a tile, get a puzzle right or wrong."*

GDD status: **unspecified, not forbidden** — no audio section exists (every
"sound" in the GDD is the adjective, as in "logically sound"), and the no-list
bans visual noise only (confetti, particles, timers). Shipping sound therefore
needs a **GDD version bump (Max's, not a working session's)** adding an audio
section once the design is accepted. Illustrations were considered the same
session and deliberately deferred: a per-board background contradicts the GDD's
written "page backgrounds stay flat cream" line and taxes every future board
with art, so they wait for their own spec and a GDD conversation.

## Decisions made with Max

- **Sound first, illustrations later** — separate spec if pursued.
- **The three moments are his**: tile select, solve (a set comes home), mistake.
- **Taste is auditioned, not described**: a disposable audition page comes
  before any production code, because nobody should approve a sound from prose.

## Design

### Step 1 — the audition page (gray-box, disposable)

`experiments/sound-audition.html`, one self-contained file under the smallness
exemption: clearly labelled disposable, never promoted into production code.

It offers 3–4 named palettes (candidates: **woodblock** — soft ticks,
marimba-ish; **ceramic** — cup-on-saucer clinks; **hum** — warm sine blips;
**paper** — filtered-noise taps). Each palette plays its select / solve /
mistake sounds on buttons, plus a strip of 16 fake tiles to feel select-spam in
rhythm — the sound that charms once must not grate at tap fifteen. All Web
Audio synthesis, no files.

**The gate is Max's ears:** he picks a palette (or redirects), and only then
does production work start.

### Step 2 — the production module (after the pick)

- **`src/view/sound.js`** — the motion.js of audio, and its exact pattern: a
  presentation-only module that knows nothing about analogies or rules; every
  helper no-ops when audio is unavailable or muted; it owns the page's ONE
  `AudioContext` the way `llm.js` owns the only fetch. Envelope and frequency
  parameters live in one exported table — the tuning dial, like `--motion-slow`.
- **Views call it where they already call motion helpers** — board-view on
  select, the solve beat where solved sets settle, the shake path on a mistake.
  No engine or controller change: sound is presentation, and the game must
  remain fully playable with it off (the boundary law says the game runs with
  the view off — a fortiori with sound off).
- **Autoplay policy:** an `AudioContext` may not start until a user gesture.
  Created lazily on the first tile tap; if the platform refuses, every helper
  keeps no-opping — sound can never cost a player the game (the same
  degrade-to-nothing law storage.js follows).
- **Mute:** a small toggle in the header (site of the wordmark and the beans),
  state persisted as `asto.muted` via `storage.js` — a stored-data addition,
  flagged here as the spec's one schema-adjacent change. **Default ON at low
  volume**; reconsider-when: any real-player complaint about unexpected audio.
- **Respecting quiet:** mute is the control; `prefers-reduced-motion` governs
  motion only and is not overloaded to imply deafness.

### Testing

The parameter table and the moment→sound mapping are pure and
`node:test`-covered headlessly (the module no-ops without an `AudioContext`, so
it loads clean in node). Whether it sounds right is **Max acceptance** — the
audition page is the instrument, and a browser pass confirms touch events
actually fire it.

### Explicitly out of scope

- Per-board illustrations/backgrounds (own spec; the GDD conflict is recorded
  above).
- Music, ambience, or win/loss fanfares beyond the three moments (auditionable
  later; the three moments ship first).
- Any dependency or audio asset files (HR-1).

## Verification (implementation session)

`npm test` stays green; the audition page opened in the preview browser and
each palette heard; after the pick, the production module verified by playing a
board in the preview with sound on, muted, and in a fresh profile (the
autoplay-refused path). **The gate is Max's playtest with ears.**

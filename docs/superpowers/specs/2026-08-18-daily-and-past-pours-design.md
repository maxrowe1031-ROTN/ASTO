# Daily ASTO + Past Pours — dated release and the calendar door

> **Revised at Max's review, 2026-08-18** (see D-24's amendment in
> `docs/design.md`): Play opens the calendar rather than today's board, the
> title screen keeps two buttons, unplayed boards wear a pot-of-coffee icon
> (grid and day card, large on the card), and the "Past Pours" label is
> retired from the UI.

## Context

Max wants ASTO feature-complete ahead of a **hard launch**: a new puzzle
released every day at midnight, and a calendar showing each day's puzzle —
Connections' "archive", renamed. A statistics page is the third feature of
the set; it is **a separate future spec**, except for one down-payment made
here: recording play history from day one, so the stats page has data when
it arrives. Brainstormed 2026-08-18; every decision below is Max's.

**Decisions made with Max:**

- **Trim to the best ~30 at hard launch, backdated.** The launch archive is
  curated, not everything ever shipped. Cut boards stay as files in
  `puzzles/` — every `?puzzle=` link ever shared keeps working — but lose
  their `date`, which unlists them. The keep-list and launch date are Max's
  call, executed later by a tool built now.
- **Client-side date gate; all boards committed.** No GitHub Action, no bot
  commits on `main` (§9's rollback invariant stays human-only). Wordle
  shipped every future answer in its bundle and it never mattered; the
  people who read `puzzles/index.json` in devtools are opting out of their
  own game. **Accepted cost:** future titles are visible in the manifest and
  future board files are fetchable. **Reconsider-when:** a puzzle's title or
  answers show up publicly before its date — then a `queue/` directory plus
  scheduled promotion becomes worth its machinery, and the client code does
  not change when it does.
- **One fixed timezone: America/Denver.** Everyone worldwide flips at
  Mountain midnight (inferred from the repo's own commit offsets; Max
  confirmed). Computed with `Intl.DateTimeFormat` — platform-native,
  DST-proof, zero-dep (HR-1 intact).
- **Past Pours replaces the puzzle list.** The calendar is the browse
  surface; the row list and `nextUnfinished` retire.
- **Tapping a day opens a title card first** — title, date, prior result,
  Play — so board titles keep working. Today's board opens directly.
- **After today's board is finished, Play reopens today's end screen**
  (result, share, Past Pours link). The daily rhythm is honest: come back
  tomorrow.
- **Badges are cut** from the future stats scope. The stat tiles and
  mistake distribution are the substance; an achievements subsystem is not.
- **During the build, all 48 current boards get sequential backdates** so
  the soft-launch site keeps behaving identically. The trim is a separate
  event, at hard launch, on Max's word.

## Design

### Data model
- Board files carry `date: "YYYY-MM-DD"` — already optional in schema v1.0,
  now the scheduling field. A future date means unreleased.
- `tools/build-manifest.js` copies `date` into each manifest entry and
  **excludes dateless boards** — trim = date removal, never file deletion.
  Entries are ordered by date (supersedes D-10's hand-ordered play order).
- `src/source/validate-manifest.js` requires `date` on every entry:
  `\d{4}-\d{2}-\d{2}`, a real calendar date, no duplicates (two boards on
  one day would make "today's puzzle" ambiguous).

### The release rule (pure)
New pure module `src/source/release.js` — imports nothing, like its
neighbors:
- `isReleased(entry, todayKey)` — `entry.date <= todayKey` (ISO strings
  compare correctly as strings).
- `releasedPuzzles(manifest, todayKey)` — the gated, date-ordered list.
- `todaysPuzzle(manifest, todayKey)` — the entry dated exactly today, or
  null (the queue ran dry).

The impure edge lives in `app.js`: one `todayKey()` built on
`Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' })`, evaluated
per interaction (a tab left open overnight flips at midnight without a
reload requirement), injected downward — the same law as the RNG seam.

### Routing (`app.js`)
- **Play** → today's board. Today already finished → today's **end screen**
  re-shown from the stored result (share still works all day).
- No board dated today → Play falls back to Past Pours, never a dead door.
- Deep link `?puzzle=` to a released or unlisted board → straight in, as
  now. To a **future-dated** board → title screen, no error ceremony.
- End screen: "Back to puzzles" → Past Pours; "Next puzzle" retires with
  `nextUnfinished` (the daily loop replaces "play the list forward").

### Past Pours (new views, read-only, intents out)
- `src/view/calendar-view.js` — GDD-style screen: month title with ‹ ›
  nav bounded earliest-board-month ↔ current month, weekday header, 7-col
  grid. Each day square: the date number, plus the **existing paper-cup
  glyph** for a played board (steaming/spilled, `is-hinted` brown — the
  `PAPER_CUP`/`CUP_*` constants move from select-view; no new art).
  Past-unplayed days: date number only. **Future days: empty squares,
  never a title.** Squares carry the spoken sentence in `aria-label`, as
  the rows did.
- Title card (in `calendar-view.js` unless it outgrows one job): title,
  date, prior result sentence (the `spokenResult` logic survives the move),
  Play. Emits `onPick(slug)` — same intent the list emitted.
- Motion: `settleIn` stagger only, 120–180ms, no-list respected. Beans
  never red; the calendar introduces no new colors, only tokens.

### Studio side
- `studio/storage/puzzle-store.js` (still the only writer into `puzzles/`)
  assigns each newly published board the **next free date** after the last
  scheduled one — publishing five boards queues five future days.
- `tools/check-schedule.js` — reports runway (queued days ahead), gaps,
  duplicates. A `/warmup` standing watch; the human-visible replacement
  for a scheduled job's low-queue alert.
- `tools/schedule-launch.js` — the one-time hard-launch tool: takes Max's
  ordered keep-list and a launch date, backdates one per day ending there,
  clears `date` from cut boards, regenerates the manifest. **Built now,
  run only on Max's word.**

### History recording (the stats down-payment)
`src/storage.js` gains `asto.history`: an append-only array; every finished
game appends `{slug, dateKey, status, mistakes, solvedCount, hintsUsed}`.
The best-result blob is untouched — cups and the calendar read it exactly
as the list did. Same degrade-to-empty guards as every other key. Nothing
reads history yet; the future stats page will.

### Docs
- `docs/design.md`: **D-24** records all of the above with the
  reconsider-when. **D-10 marked superseded** (date order replaces
  hand-ordered play order). GDD drift (screens 5/6, daily cadence) flagged
  for a version bump — the GDD is Max's.
- `docs/backlog.md`: the statistics page (history accruing), badges cut.

## Testing

All new logic is pure and `node:test`-covered without a browser: release
predicates (boundaries, dry queue), calendar month math (DST months,
February, month bounds) via injected clock, manifest `date` validation,
build-manifest exclusion and ordering, history appends and guards,
puzzle-store date assignment, both tools. Browser verification: the six
walks named in the plan (Play→today, end-screen reopen, calendar render,
day card, future squares titleless, deep links) at 375 and 1280.

**The gate is Max's playtest** of the daily loop and Past Pours.

## Explicitly out of scope
- Statistics UI (separate spec; history recording only).
- Badges (cut).
- The keep-list and launch date (Max's, tool ready).
- Any GitHub Action (reconsider-when recorded in D-24).

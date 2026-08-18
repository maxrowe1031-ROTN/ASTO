# The Statistics Page — the record the calendar already keeps

## Context

D-24 turned ASTO daily on 2026-08-18: every board carries a `date`, the calendar
replaced the select list, and `asto.history` began recording every finished game
as a down-payment on a statistics page. That page was the third of the three
features Max brought from his Connections screenshots, and it was deliberately
spun off to this spec, with **badges cut**.

Brainstormed 2026-08-18. Four decisions were Max's, and the first two reshaped
the work substantially.

**Decisions made with Max:**

- **A streak counts consecutive board dates won**, walking backward from today —
  not consecutive days shown up. Playing an old board on the calendar can repair
  a gap retroactively. Rejected alternatives: play-date streaks (Connections'
  rule) and won-on-its-own-day (the strictest). ASTO is a calendar you can
  wander, and a cozy game should not punish a good week away from the phone.
- **"Played" and "Win %" count boards, best result each** — the same record the
  calendar's cups already show. A replay improves a board's row; it never adds to
  the count.
- **The door is the calendar header.** The title screen stays at two buttons
  (Max's D-24 review call). Play → calendar → Statistics: the numbers sit one tap
  deeper than the thing they summarise, which is the right depth for a screen
  nobody opens first.
- **The end-screen restore stays out of scope** (see below — the reason it was
  ever in scope turned out not to exist).

**What those decisions bought.** Together they mean the page reads
`asto.results` + the manifest and needs **no new storage at all**. The
best-result blob has been recording since long before the daily turn, so the
entire back catalogue counts on day one — the page launches with a real record
instead of a blank slate, and every number on it agrees with a cup on the
calendar.

**What they cost, stated plainly.** `asto.history` powers nothing in v1. It keeps
accruing — it is the only record of replays and of *when* a board was played, and
a future "sessions" or heat-map surface would want it — but this design does not
read it. D-24's down-payment is not wasted; it is simply not yet spent.

**And what they dissolved.** `docs/backlog.md` filed the end-screen-restore item
("Play cannot reopen a finished end screen across a reload") under this spec on
the assumption both were the same storage-schema conversation. They are not: this
page adds no schema. The restore needs persisted `solvedSetIds` and a new restore
seam on the engine — the module the boundary law guards hardest — and it is
independent work. The backlog entry is corrected to say so.

## Design

### What the screen shows

Four stat tiles across the top, one bar chart below.

| Tile | Value |
| --- | --- |
| **Played** | released boards with a finished result; subline `of N` |
| **Win %** | wins ÷ played, rounded; `0` when played is 0 |
| **Current streak** | days |
| **Max streak** | days |

**Mistake distribution** — five horizontal bars: wins at **0 / 1 / 2 / 3** beans,
then a muted **Lost** bar. Losses are in the chart on purpose: leaving them out
would make the bars misrepresent their own denominator, and ASTO's loss screen is
educational, not shameful. Each bar prints its count as text beside it, so
nothing on this screen is chart-only information.

**Empty record** — honest zeros, and one line under the tiles: *"Play a puzzle
and your record starts here."* No error state, no empty-state illustration, no
crash.

### The model — `src/stats.js` (new, pure)

No DOM, no `fetch`, no clock, no `localStorage`. Every impure input is injected at
the edge in `app.js`, exactly as `showPours()` already does for the calendar.

```js
summarize(manifest, results, todayKey) → {
  played,          // released boards with any finished result
  totalReleased,   // released boards, the "of N"
  won,
  losses,
  winPercent,      // 0–100, rounded; 0 when played === 0
  currentStreak,
  maxStreak,
  distribution     // five buckets, counts summing to `played`
}
```

`distribution` is `[{label, mistakes, count}]` — labels `'0' '1' '2' '3' 'Lost'`,
with `mistakes: null` on the Lost bucket.

Three definitions, stated so none of them can be read two ways: **`played`** counts
released entries whose `results[slug]` is an object (`storage.allResults()` already
guards the shape); **`won`** counts those with `status === 'won'`; **`losses` is
`played - won`** — everything finished that is not a win, so a malformed status
cannot fall between the two and quietly unbalance the chart.

**Placement.** Beside `src/share.js` and `src/ratings.js` at the `src/` root: it
is neither engine (it holds no rules and no state) nor view geometry (unlike
`calendar-month.js`, which computes month grids for one view). A future surface —
share text, an end-screen line — could read it unchanged.

**It reuses `releasedPuzzles(manifest, todayKey)`** from `src/source/release.js`
rather than re-deriving the released set or re-sorting by date. That function
already owns the release rule and returns the list ascending by date, which is
precisely what the streak walk needs.

### The streak rules

The precise part, and where the tests earn their keep.

- The model walks **released boards in date order**, not calendar days. A gap in
  the schedule therefore never breaks a streak: a player cannot lose a streak on
  a day that had no puzzle. (`check-schedule` reports gaps so they stay rare, but
  the model must not depend on that.)
- **Won** means `results[slug].status === 'won'`. A loss breaks a streak. An
  unfinished game counts as nothing — `asto.results` records only finished games.
- **Max streak** — the longest run of consecutive won entries in that ordered
  list, over the whole catalogue.
- **Current streak** — count backward from the most recent released entry.
  **Today is graced:** if the final entry is *today's* board and it is not won,
  start from the entry before it instead. Without this the streak reads 0 every
  single morning before the player has had coffee. An unwon board *older* than
  today is a genuine break and does break the streak.

```js
const released = releasedPuzzles(manifest, todayKey);        // ascending
const won = (entry) => results[entry.slug]?.status === 'won';

let run = 0, maxStreak = 0;
for (const entry of released) {
  run = won(entry) ? run + 1 : 0;
  if (run > maxStreak) maxStreak = run;
}

let i = released.length - 1;
if (i >= 0 && released[i].date === todayKey && !won(released[i])) i -= 1;  // the grace
let currentStreak = 0;
while (i >= 0 && won(released[i])) { currentStreak += 1; i -= 1; }
```

Duplicate dates cannot occur — `validate-manifest.js` already rejects them.

### Two rules the edges need

- **The manifest is both numerator and denominator.** Only released manifest
  entries count. A result in storage for a board the manifest no longer lists —
  an unlisted board reached by an old `?puzzle=` link, or one cut by the
  hard-launch trim — is ignored. This is what keeps every number agreeing with
  the calendar. **Accepted consequence:** the hard-launch trim will visibly
  shrink a player's Played count (48 boards → roughly 30), a one-time drop that
  in practice only Max will see. **Reconsider-when:** a real player complains
  that finished puzzles vanished from their record — then stats would need to
  count results outside the manifest, and the calendar would need to explain
  them, which is a bigger conversation than this page.
- **A hand-edited `mistakes` cannot break the chart.** Bucketing clamps to 0–3,
  matching the degrade-and-continue rule every other read in `storage.js`
  follows. The invariant the tests hold is that the five bucket counts sum to
  `played`.

### The view — `src/view/stats-view.js` (new, read-only)

Renders the model and emits `onBack`. Calls no engine function, decides no rules,
reads no storage. Structure mirrors `calendar-view.js`: a `.select-head` with the
ASTO wordmark (→ title screen), the tiles, the chart, and a `.text-action` **Back**
(→ the calendar, not the title screen — Back means the door you came through).

Bars settle in with `settleIn` / `staggerStep` from `src/view/motion.js`; reduced
motion is already no-op'd centrally there.

### Wiring

- **`index.html`** — a `<section id="screen-stats" class="screen" aria-label="Statistics" hidden>`.
- **`src/app.js`** — `ScreenRouter.DOORS` gains `'stats'`. A `showStats()` that
  repaints from `storage.allResults()`, `manifest` and `todayKey()` on every
  entry, mirroring `showPours()` exactly — a result may have landed since last
  time, and the model is cheap enough to recompute.
- **`src/view/calendar-view.js`** — a `Statistics` `text-action` in the existing
  `.select-head`, right of the wordmark, emitting a new `onStats`.
- **`styles/components.css`** — stat tiles and bar rows, existing tokens only.

### The GDD's no-list

No confetti, no particles, no timers, no counters animating upward toward their
value. Motion is 120–180ms ease-out through the existing tokens. **Nothing on
this screen is red** — the Lost bar takes a muted ink tone; beans stay beans.

## Testing

All new logic is pure and covered headlessly in `test/stats.test.js` — no browser,
no fake DOM, injected manifest / results / `todayKey`. Required cases:

- an empty record returns all zeros and does not throw
- every released board won → `currentStreak === maxStreak === totalReleased`
- a gap in the schedule is spanned, not treated as a break
- today unplayed keeps yesterday's streak (the grace)
- today lost breaks the streak
- an unwon board older than today breaks it
- future-dated boards are excluded from every figure
- a result for a slug the manifest does not list is ignored
- win-percent rounding, including 0% and 100%
- the five distribution buckets sum to `played`
- a clamped out-of-range `mistakes` still lands in a bucket

**Browser verification** (Claude-verifiable): the Statistics affordance reachable
from the calendar; the tiles' numbers matching a hand count off the calendar
grid; Back returning to the calendar and the wordmark to the title screen; 375px
with no overflow and 44px touch targets; reduced motion honoured; console clean.

**The gate is Max's playtest** of the finished screen — the numbers being right is
automated, the screen being worth opening is his call.

## Implementation order

1. `src/stats.js` + `test/stats.test.js`, TDD — the model is pure and the streak
   rules are the whole risk.
2. `src/view/stats-view.js`, the `index.html` section, the styles.
3. Wire the router door in `app.js` and the header affordance in `calendar-view.js`.
4. Browser verification, then Max's playtest.

## Explicitly out of scope

- **Badges** — cut at D-24, still cut.
- **The end-screen restore across a reload** — independent work; stays in the
  backlog with its coupling note corrected.
- **Any read of `asto.history`** — it accrues for a later feature.
- **Any change to the engine, controller, schema, or storage.**
- Highlighting the bar for the board just finished (Connections does this); a
  nice touch that couples the stats screen to the live game state, and not worth
  that coupling in v1.

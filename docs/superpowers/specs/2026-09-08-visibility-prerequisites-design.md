# Visibility prerequisites — the share link and the play counter

**Status: approved by Max 2026-09-08** (brainstormed the same day, after a research
pass on how Meowdoku and the organic daily puzzles found their players). Becomes
**D-34** in `docs/design.md` when it ships.

## Why

Max asked whether ASTO could copy Meowdoku's visibility. It cannot: Meowdoku's rise was
bought — Oakever Games, roughly $500K a day of user acquisition, ten to fourteen thousand
AI-made ad creatives a month, ad-funded end to end. The organic cases that match ASTO's
shape (Wordle, Bracket City, Clues by Sam) share three things instead: a share artifact
that carries the game without a link, one free daily board, and a break that came from a
person with an audience playing it rather than from the creator's own posts. Free doors
exist today — Playlin's "games like Connections" list has no analogy game and takes
submissions, Room Escape Artist's daily guide takes suggestions, r/WebGames welcomes
puzzle self-promotion, Thinky Games has a Discord.

Before any of those doors is knocked on, three prerequisites, chosen by Max:

1. **The share text carries a deep link home.** Today it emits title, score and squares
   and no URL at all. A result shared from itch, or pasted anywhere, gives a reader no
   way to find the game.
2. **A play counter.** ASTO records nothing about whether anyone plays. Max chose a
   Supabase `plays` table over a hosted pageview script: it reuses the D-21 seam, adds no
   service and no script tag, and yields the two signals the Brain's
   `honest-feedback-sources` calls honest — completion rate and return rate.
3. **A refreshed itch build** once the first two land. The itch page still serves the
   2026-08-25 build. Uploading is Max's act.

Listings, the r/WebGames post and a 60–90 second gameplay clip are a follow-up session.

## Decisions made with Max, in order

1. **Counter shape: Supabase `plays` table**, one anonymous insert-only row when a board
   starts and one when it ends. Not a pageview script, not both.
2. **Share link: the deep link to the board**, `https://www.playasto.com/?puzzle=<slug>`,
   so the reader lands on the exact board their friend played. Always the home domain,
   even from itch. Never for the tutorial.

## Design

### The share link — `src/share.js`

- `SITE_URL = 'https://www.playasto.com/'`, matching `CNAME` and `check-deploy.js`.
- `shareUrlFor(slug)` is pure: `SITE_URL + '?puzzle=' + encodeURIComponent(slug)`.
- `buildShareText(state, { slug } = {})`: unchanged when `slug` is absent or null; with
  a slug, a fourth line carrying the URL. Still pure, still never a board word.
- `app.js` passes `currentSlug`. `url-state.js#hrefFor` is deliberately not used: it
  builds from the current origin, which on itch is itch's.

### The play counter

**Table.** Migration `plays_append_only` on the D-21 project, mirroring
`player_ratings_append_only`: `id`, `created_at`, `puzzle_slug`, `event` (`start` |
`finish`), `won`, `mistakes` (0–4), `hints_used` (0–4), `learning`, `client_id`. Row-level
security on; the anon role may only insert; no select, update or delete policy, so the
key shipped in the page reads nothing back.

**Client.** `src/ratings.js`, the game's one outbound seam, gains
`sendPlay({ slug, event, won, mistakes, hintsUsed, learning })`. Same swallowed-failure
contract, same anonymous `client_id`. A null slug sends nothing. The module keeps its
name — renaming the seam would touch tests, wiring and D-21's prose for no behaviour.

**Host.** New `src/play-reporter.js`, a non-view in the controller's `views` array beside
`ResultsRecorder`, and under the same law: it reads state and calls no engine function.
It sends `start` once per game (a new puzzle object, or status returning to `playing`
from a finished state) and `finish` once per finished state object. It sits after the
recorder so a finish row is only sent for a game already saved locally.

**Reader.** `studio/player-ratings.js` gains `fetchPlays()` on the service-key seam. A
new pure module `studio/plays-summary.js` turns rows into: plays per day for the last
fourteen days with starts, finishes and completion rate; distinct clients; returning
clients (seen on two or more distinct days); and per-board starts and finishes.
`tools/plays-report.js` prints it as `npm run plays`, with `--json`.

**Disclosure.** `about.html` gains one sentence: the site records anonymous survey
answers and anonymous play counts, keyed by a random id in the browser — no account, no
names. Max wrote the About copy (D-23); the sentence is his to edit.

### The itch refresh

`npm run itch` after the above is verified. Max uploads. `npm run check-deploy` after
the push to `main`.

## Error handling

Everything on the client is fire-and-forget and swallowed, exactly as D-21: a counter
that can break a board is worse than no counter. The reader names a missing
`SUPABASE_SERVICE_KEY` and nothing else.

## Testing

- `test/share.test.js`: URL line with a slug, none without, slug URL-encoded, the three
  existing lines unchanged.
- `test/ratings.test.js`: a play row's shape; a null slug is silent.
- `test/play-reporter.test.js`: start once per game, finish once per finished state
  object, restart fires start again, a new board fires start, the tutorial is silent.
- `test/studio/plays-summary.test.js`: the pure aggregation.
- Browser at 375×812: the share text's fourth line; the network tab's start and finish
  posts; one real round trip read back by `npm run plays`, then the test rows removed
  with the service role; the anon key's `select` on `plays` returns empty.

## Out of scope

Listings and posts, the clip, a pageview counter, the statistics page reading plays,
ratings or plays steering generation.

## Reconsider-when

A spam burst on `plays` — truncate and rate-limit, per D-21's accepted risk. Or the
counter shows a month of nobody but Max — then the listings push stops being optional.

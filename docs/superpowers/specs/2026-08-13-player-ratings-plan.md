# Player ratings: survey, comments, and the loop back to the Studio

## Context

ASTO is publicly shipped and Max is about to share the URL. Right now the only
editorial signal is his own; strangers' reactions are invisible. His ask: a
small end-of-puzzle survey — three questions rated **1–4** (matching the tier
scale) — so real-player data starts accumulating per board.

Decisions made with Max:
- **Data home: Supabase free tier** (he has an account; two parked projects
  exist, we create a fresh one for ASTO). This adopts one free hosted service —
  the conversation the house rules require happened in this session. HR-1's
  letter holds: no npm package, no build step; the game talks to it with plain
  `fetch`.
- **Questions: Difficulty · Delight · Fairness**, each 1–4. Fairness maps
  directly onto the editorial vocabulary (valid-but-unfair, order-ambiguous).
- **Cadence: every end screen (win AND loss), zero-friction** — a tap saves
  instantly, no submit button, never blocks Share/Next puzzle, each board asks
  only once per device. The tutorial never asks (its `currentSlug` is null).

## Architecture (boundary law applied)

- **The engine knows nothing.** Ratings are not game state; no engine change.
- **`src/ratings.js` — the game's one network seam** (mirror of `llm.js` owning
  the Studio's only fetch; recorded as such in D-21). Owns: the Supabase URL +
  publishable anon key (safe to commit by design — RLS is the lock, the secret
  service key never appears anywhere), payload building, fire-and-forget POST
  (`keepalive: true`, all failures swallowed — the survey must never break the
  game), and an anonymous `clientId` (random UUID, localStorage).
- **`src/view/survey-view.js` — a read-only view** on the end screen: three
  rows, four ink-fill dots each, emits `onRate(question, value)` intents, plus
  an optional one-line comment box ("Anything else? · 280 max") with its own
  small send action — the one part that can't be per-tap. Comments are never
  displayed anywhere; only Max reads them (no moderation surface needed). No
  beans (that's mistake vocabulary), no new motion beyond the standard
  120–180ms, GDD no-list respected.
- **`src/storage.js`** gains `ratedBoards` (slug set) behind the same guarded
  localStorage access — asks once per board per device.
- **`src/app.js`** wires it: end view hosts the survey when `currentSlug` is
  non-null and unrated; a tap → `ratings.send({slug, question, value, won,
  mistakes})` + re-render. After the first tap the board counts as rated (all
  three answers optional — partial answers are data too).

## The data model: append-only tap log

One Supabase table, one row per tap; changing an answer appends another row and
analysis takes the last per (clientId, slug, question) — no update or read
rights for the public key, same append-only ethos as the Studio's ledgers.

```sql
create table ratings (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  puzzle_slug text not null,
  question text not null check (question in ('difficulty','delight','fairness')),
  value smallint not null check (value between 1 and 4),
  won boolean,
  mistakes smallint check (mistakes between 0 and 4),
  client_id uuid
);
-- Free text lives apart: different constraints, different reader (only Max),
-- and the ratings table keeps its tight value checks.
create table comments (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  puzzle_slug text not null,
  note text not null check (char_length(note) between 1 and 280),
  won boolean,
  client_id uuid
);
alter table ratings enable row level security;
alter table comments enable row level security;
create policy anon_insert on ratings for insert to anon with check (true);
create policy anon_insert on comments for insert to anon with check (true);
-- deliberately NO select/update/delete policies: the shipped key can only append
```

Accepted risk, stated: an open anon insert can be spammed. The check
constraints bound the values, the free tier bounds the cost, and the fix if it
ever happens is a truncate plus rate limiting — not worth pre-building.

## The loop back to the Studio

Player data has to land where the editorial loop already lives, not in a
browser tab Max has to remember to open:

- **`studio/player-ratings.js`** — the Studio-side reader, and a second network
  seam beside `llm.js` (recorded as such, the same way `puzzle-store` is a
  second write seam beside `run-store`: different law, own module). Reads the
  **service key from `.env`** (a real secret — named `SUPABASE_SERVICE_KEY`,
  never committed, never sent to a browser, missing-key errors name the
  variable only). Pure aggregation over the raw rows, injected fetch for tests:
  last-write-wins per (client, slug, question), then per-board averages,
  counts, distinct players, win rate, and the comment list.
- **`tools/ratings-report.js`** — CLI over that module (`npm run ratings`),
  the `evaluator-report.js` pattern: per-board table sorted by delight,
  fairness flags (any board averaging < 2.5 called out), comments printed
  under their board. `--json` for machine reading.
- **Review Studio surface**: `GET /api/player-ratings` in `studio/review/api.js`
  (server-side fetch — the key stays on Max's machine) and a small
  "Player ratings" section on the review index page rendering the same
  aggregation. The Studio remains the one place Max sees all signal —
  machine verdicts, his own, and now players'.
- **Deliberately NOT built:** ratings feeding variety steering or the rubric
  corpus automatically. Player data *informs* Max in the Studio; whether it
  ever *drives* generation is a separate decision with its own D-number when
  the data exists.

## Build order (TDD where pure)

1. **Supabase**: create project `ASTO` (free, us-west-2) via MCP, apply the
   migration above, fetch the publishable key + service key (the latter into
   `.env` by hand — I never see or commit it; Max pastes it).
2. **`src/ratings.js`** — tests first (`test/ratings.test.js`, injected fetch):
   payload shape for ratings and comments; silent failure on fetch
   throw/non-200; clientId persistence; no send when slug is null; comment
   length clamped before send.
3. **`src/storage.js`** `ratedBoards` — tests in `test/storage.test.js`
   alongside the existing patterns.
4. **`survey-view.js` + end-screen wiring + `components.css`** rows — browser-
   verified (UI has no automated tests by design).
5. **`studio/player-ratings.js`** — tests first (injected fetch): the
   last-write-wins dedupe; aggregation math; a board with comments and no
   ratings still appears; missing key → clear error naming the variable.
6. **`tools/ratings-report.js` + the Review Studio section** — report format,
   API route, page rendering.
7. **Docs**: D-21 in `design.md` (the service adoption, both network seams,
   the append-only model, the not-built line, reconsider-whens); CLAUDE.md
   cost line gains the free Supabase note; log entry.

## Verification

- **Automated:** suite green with the new ratings/storage/player-ratings tests.
- **Claude-verifiable:** in the preview — win a board, tap ratings + leave a
  comment, then `execute_sql` via MCP shows the rows in both tables; changing
  an answer appends rather than updates; replaying the same board shows no
  survey; the tutorial's end screen shows no survey; anon `select` via the
  shipped key is refused (RLS proof); a blocked/failed fetch leaves the end
  screen fully functional; `npm run ratings` prints the aggregation with the
  test rows in it; the Review Studio's Player ratings section shows the same
  numbers.
- **Max acceptance:** the survey's look and wording on the live end screen,
  and the ratings report reading the way he wants to read it.
- Merge to `main`, push, `check-deploy` green, then one live rating on
  www.playasto.com as the end-to-end proof, visible in `npm run ratings`.

## Out of scope

- Ratings automatically steering variety or the rubric — informing Max in the
  Studio is this unit; driving generation is a future decision (noted in D-21).

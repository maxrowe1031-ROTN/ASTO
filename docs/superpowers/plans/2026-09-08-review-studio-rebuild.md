# Review Studio rebuild — the plan (2026-09-08)

**Status: approved by Max 2026-09-08.** Mockups: the design canvas linked below. Becomes **D-35** in `docs/design.md` as its phases ship.

## Context

Max: *"the design of this studio stinks out loud."* At 145 runs the Review Studio is a
new-run form over one flat list, and a review page that is a wall of machine prose above
the form. Four mockups were built with the design skill and approved "as is" — Max will
iterate once he is in the real thing. Canvas:
https://claude.ai/code/artifact/119ce4fe-bdb7-4d78-9c01-1f7e9f41b6e2

The four screens: **the Desk** (home: stat tiles, the awaiting-review queue oldest first
with machine-read chips, a batch launcher, the calendar runway, players), **Runs** (filter
chips, grouped by batch with yield and spend, table with machine read and your read),
**Review** (board first, machine reports as tabs, sticky "Your read" rail, Publish card
with the next free date), **Batch in flight** (one dot per stage per run, cost as it
accrues, Review when a board lands).

The exploration found the server already has most of what the Desk needs as pure exports
(`analyzeSchedule` in tools/check-schedule.js, `summarizePlays`, `STAGES`, `REGISTERS`);
the gaps are routes, a run-list payload with no cost/register/verdict/progress, no batch
concept, no archive route, no concurrency cap, and a 1121-line `review.js` that is
untestable only because of one module-scope `document` lookup.

## Cross-cutting decisions

- **Batch is additive brief data.** `brief.batchId` (the POST's clock stamp, colons→dashes)
  and `brief.batchLabel`. `validateManifest` only requires `brief` to be an object, so no
  schema version moves. Pre-batch runs group server-side under `date:<createdAt day>`
  labelled "Unbatched · 19 Aug". The UI never reasons about the fallback.
- **Grow `/api/runs`; no separate desk route.** One summary shape serves Desk, Runs and
  Batch. Supabase panels stay lazy: `/api/player-ratings` (exists) + new `/api/plays`.
  New `/api/schedule` for the runway. New per-run fields (all additive; the api test that
  pins the exact key list is updated deliberately): `costUsd`/`durationMs` from the
  current attempt's `usage.run`, `mock`, `autoRevise`, `subjectRegister`, `subjectStyle`,
  `batch:{id,label}`, `yourRead:{boardVerdict,taste}|null` (newest board-scoped feedback
  event for the current attempt), `published:{publishedAs,publishedId,at,date?}|null`
  (last publish decision; `date` added to new publish records), `machine:{validator:
  {clear,total}, solver, testPlayer:{gated}, unity}|null` (four stage outputs per complete
  run), `inProcess:{running,queued,startedAt,currentStage}|null` with `stageStatuses`
  only for in-flight runs.
- **Read cost.** ~7 extra small reads per run per list (~1,100 over 145 runs). Build
  uncached with a perf test (150 seeded runs, `listRuns` < 250 ms); poll the Desk/Runs
  only while a run is in flight, otherwise refresh on `hashchange`/`focus`. Escape hatch
  if the test fails: a `store.fingerprint(runId)` (4 stats) keyed cache inside `createApi`.
- **Estimated batch cost** = mean `costUsd` of the last 20 non-mock complete runs,
  computed client-side in pure `ui/rollups.js`, labelled "≈ from the last N real runs".
  Mock = $0.00. Caps in pipeline-config are ceilings, not estimates.
- **Concurrency cap (Phase C):** `createRunner({ concurrency })`, server reads
  `STUDIO_CONCURRENCY`. **Default 3 — Max's call, 2026-09-08:** a six-board batch lands in
  two waves so the first boards can be reviewed while the rest run.
- **Stop-after-current-stage** = one optional `shouldStop()` seam at the top of the stage
  loop in pipeline.js; the attempt ends as a normal `failed` with a message naming the
  last completed stage, resumable through the existing resume route. Queued runs are
  dropped and stay `created`. No new status, no new failure category.
- **Archive:** `POST /api/runs/:id/archive`, empty body, `updateStatus('archived')` +
  a `{type:'archive'}` decision; illegal transitions → 409. Filters hide archived by default.

## Where the mockups yield to the code's law

1. **Auto-revision audit is never collapsible (D-14).** When an auto-revision happened, the
   audit renders expanded under the tabs; when none, it is omitted. Only feedback history
   is a `<details>`.
2. **Publish date comes from the server.** `nextFreeDate` is exposed on the puzzle store
   (additive) and returned by `/api/schedule`; the card shows "lands on <date>" read-only.
3. **Retitling in the Publish card is a hand-edit** through the existing `POST /edits`
   (keeps D-22 provenance); the slug preview uses the shared `slugify`. `publishRun`'s
   body stays sealed.
4. **"Autosave" is a local draft, not a write.** Feedback is an append-only corpus the
   rubric compiles from; partial writes would inflate it. `ui/draft.js` keeps a
   localStorage draft keyed `runId/attemptId`, restored on render with a "Draft · not in
   the record" badge; Save / Approve / Request revision / Reject write exactly as today.
   A 409-on-stale keeps the draft and says "board changed — reload". **Max's call,
   2026-09-08: local draft, Save writes.**
5. **Stopped runs read `failed · stopped after <stage>`** with Resume. Same word the
   status machine uses.
6. **Surprise-me batches scout subjects sequentially** (each pick must see the last), so
   `POST /api/batches` answers 202 and creates runs asynchronously.

## UI module split (review.js → ~120-line router)

`studio/review/ui/`: `dom.js` (escape, money, shortTime, elapsed — replaces four `escape`
copies) · `api.js` (the fetch helper + notify; the only module touching `fetch`) ·
`poll.js` (one poller, re-armed by the router) · `rollups.js` (pure: groupRuns,
filterCounts, spend, estimateCost, queueOrder, batchTotals) · `desk.js` · `runs.js` ·
`run/model.js` (viewModel: decidable/editable/publishable/working, effective board,
breadcrumb position — the status reads exist once) · `run/header.js` · `run/board-panel.js`
· `run/tabs.js` (tab state in a module-level `Map` keyed by runId; `[data-tab-panel]
[hidden]`) · `run/rail.js` (composes the existing `feedbackControls`; the approve→save
downgrade on `revise-board` stays, commented as a UI affordance around a server rule) ·
`run/publish.js` · `run/proposal.js` · `run/audit.js` · `draft.js` · `batch.js` (C).
Sticky rail is CSS only (`.review-grid`, `.rail { position: sticky }`); re-render after an
action restores scroll. Domain leaks removed in B: client `slugOfRun` copy, `TIER_NAMES`
(import `difficultyToTier`), the raw-path `notesFor` (use `brief-text.js` only).

## Phase A — Desk + Runs (branch `work/studio-desk-runs`)

Server: new pure `studio/review/summaries.js` (`summarizeRun`, `latestBoardRead`,
`lastPublish`, `machineChips`, `batchOf`); `listRuns` uses it; move `analyzeSchedule` to
`studio/schedule.js` (check-schedule.js imports it); `GET /api/schedule` →
`{today, lastScheduled, queuedAhead, runway, gaps, datelessSlugs, nextFreeDate, entries}`;
`GET /api/plays` (503 without the reader); publish decision gains `date`.
UI: `dom.js`, `api.js`, `poll.js`, `rollups.js`, `desk.js`, `runs.js`; routes `#/`
(Desk) and `#/runs`; review page untouched. Archive button rendered disabled ("Phase C").
Tests first: `summaries.test.js`, api tests (schedule over a temp puzzles dir, plays 503 +
stub, key list, perf, publish date), `rollups.test.js`, `desk-html.test.js`,
`runs-html.test.js`, `dom.test.js`.

## Phase B — Review page (branch `work/studio-review-page`)

Server: none beyond A. UI: the `run/*` modules, `draft.js`, review.css additions
(`.review-grid`, `.rail`, `.tabs`, `.tier-card`, `.crumb`; no new colours).
Tests first: `run-model.test.js`, `tabs.test.js` (labels carry counts: `Validator 3/4`,
`Test player 1 flag`; four tier cards), `rail.test.js`, `publish-card.test.js` (never
computes a date), `draft.test.js` (stub storage), `audit.test.js` (no `<details>` when an
auto-revision exists).

## Phase C — Batches, queue, stop, archive (branch `work/studio-batches`)

Server: runner `concurrency` + queue + `stop(runIds)` + `snapshot()`; pipeline
`shouldStop` seam; `POST /api/batches` (sealed `{count 1–10, themes?, pairs, autoRevise,
mock, label?}` → 202 `{batchId}`), `GET /api/batches/:id`, `POST /api/batches/:id/stop`,
`POST /api/runs/:id/archive`; `/api/config` gains `concurrency`. UI: `batch.js`, the
launcher posts to `/api/batches`, route `#/batches/:id`, Archive live.
Tests first: runner queue/cap/stop/resume, pipeline stop-after-stage, batches API
validation and creation, archive transitions, `batch-html.test.js`, launcher body.

## Verification (every phase)

- **Automated:** `npm test` green; the new suites above.
- **Claude-verifiable** in the Browser pane at http://127.0.0.1:4321 with **mock runs only**
  (no API spend): Desk loads `/api/runs` + `/api/schedule` then `/api/plays` +
  `/api/player-ratings`; runway dry date equals `npm run check-schedule`; queue oldest
  first; a mock run started from the launcher appears in flight, the page polls at 2.5 s
  until it lands and then stops polling (10 s of silence in the network log); Runs filter
  counts sum; group-by switches without refetch; Review: tab survives a Save re-render,
  scroll unchanged; draft restores after reload with the badge; Save writes one feedback
  batch; stale tab → 409 notice, draft kept; Approve unlocks Publish showing the schedule's
  `nextFreeDate`; an auto-revised run's audit is expanded with no toggle; Batch: 6 mock
  runs, at most `concurrency` rows "now", stop drops the queue and the running rows read
  `failed · stopped after …` with Resume. Zero console errors; no red outside tier chips.
- **Max acceptance:** using the Studio for a real review after each phase; his iterations
  become the next work.
- Docs at each wrapup: **D-35** (batch as brief fields, concurrency cap, stop as resumable
  failure, the six mockup deviations), backlog lines closed (archive route, "the Review
  Studio shows only running", stale README), `studio/README.md` refreshed.

## Out of scope

Persisting the queue across restarts; batch-level decisions; scheduling publishes from the
batch panel; changing the feedback vocabulary or FORM_VERSION; the pipeline itself.

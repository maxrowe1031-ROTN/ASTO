# Recovery — how to get back to a working state

This is Max's rollback playbook. Plain language first, commands second. The
core promise: **every commit on `main` is a verified, safe restore point**,
because `/wrapup` only merges gated work and `/pause` keeps unfinished work on
its own branch.

## "Something broke and I don't know why"

Ask Claude Code:

> Show me what changed since the last commit, in plain language.

Under the hood: `git status` + `git diff --stat` + `git log --oneline -5`.
GitHub Desktop's **History** tab shows the same thing visually.

## "Throw away everything since the last commit"

Ask Claude Code:

> Discard all uncommitted changes and take me back to the last commit.

(`git restore .` — permanent for uncommitted work, so Claude should confirm
what's being discarded first.)

## "Go back to the last version that actually worked"

The last commit on `main` **is** the last verified version. Ask:

> Switch me to main and show me the last log entry so I know what state this is.

If `main` itself needs to move backward (rare — a bad merge slipped through):

> Revert the last commit on main.

(`git revert` — adds a new commit that undoes it; history is preserved, no
force-push ever.)

## "Where did my half-finished work go?"

Paused work lives on a `work/...` branch with a `wip(...)` commit. Ask:

> List my branches and show the latest commit on each.

The `docs/log.md` PAUSED entry has the exact resume point.

## "Did everything make it to GitHub?"

Ask:

> Is anything committed locally but not pushed, on any branch?

(`git status -sb` per branch — "ahead" means unpushed. GitHub Desktop shows
this as "Push origin".)

## "The game won't load"

Almost always the file protocol. **ASTO cannot be opened with `file://`** — ES
modules and `fetch` both fail there. Serve it:

```bash
npm run serve
```

Then open http://localhost:8080. If it still fails, check the browser console
first — a validator rejecting a board says so loudly by design.

## "Set this project up on a fresh machine"

1. Clone the repo with GitHub Desktop.
2. **No `npm install`** — ASTO has zero dependencies. It needs **Node 22+**
   (for `node:test` and the static server) and a browser.
3. `npm test` should report all suites green.
4. Recreate `.env` from `.env.example` only if you're running the Studio
   against the real LLM transport (values come from wherever Max stores keys —
   never from the repo). The game itself needs no `.env`.
5. Run `/warmup` — it reports the project's actual state.

## What recovery can't restore

- Anything never committed (discarded uncommitted work).
- **Browser `localStorage`** — the tutorial-seen flag and per-puzzle results
  live in the browser, not the repo. Clearing site data resets progress and
  replays the first-run tutorial. There is no export; this is deliberate for a
  prototype.
- **`studio/runs/`** — generated Studio run artifacts are git-ignored on
  purpose. A run that matters gets copied into committed fixtures deliberately;
  anything left only in `runs/` is disposable by design.

---
description: Truthful checkpoint for interrupted ASTO work — records real state including failures, commits a labeled WIP checkpoint on the work branch, and leaves main untouched. The gate is NOT passed.
---

You are pausing a session in the **ASTO game repo** before the current gate has passed.
The job is a **truthful, recoverable checkpoint** — nothing gets dressed up as done.
`main` is not touched.

## 1. Record the real state

```bash
npm test
```

- Report results **including failures** — a paused state may legitimately contain
  incomplete behavior, failing tests, and scaffolding. It must still be honest.
- Run `node tools/check-board.js` on any board touched this session, and report what it
  says even if it's ugly.
- Note what is implemented but **unverified** — especially UI that was written but never
  loaded in the preview browser.

## 2. Write the log entry (`docs/log.md`)

Prepend at the top (newest first), header `## YYYY-MM-DD — PAUSED: <title>`:

- What was completed this session; current behavior.
- **Known failures and unverified areas**, plainly listed.
- Which files/systems are mid-change, and **why the gate hasn't passed**.
- **The exact resume point** — file, function, next concrete step.
- End with `- **Next:**` — the first action when work resumes.

## 3. Route the loose ends

- New unresolved questions → `docs/decisions/` tickets.
- Unrelated ideas → `docs/backlog.md`, one line each. Do not build them.

## 4. Checkpoint commit — on the work branch only

If you're somehow on `main` with uncommitted implementation work, create the
`work/<phase>` branch now (e.g. `work/phase-5-select`, `work/studio-core-a3`) and move
the work there first. Then:

```bash
git add -A
git commit -F - <<'EOF'
wip(<area>): checkpoint <short title>

<What's done. What's incomplete or failing. Resume point.>

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
git push -u origin <work-branch>
```

- The `wip(...)` prefix marks it unmistakably as a checkpoint.
- Push the branch if a remote exists; confirm sync or say the work is local only. Never
  force-push. **Do not merge. Do not touch `main`.**

## 5. Confirm the pause

One-paragraph recap: where things stand, what's broken or unverified, where to resume.
**The phase gate is explicitly not passed** — say so.

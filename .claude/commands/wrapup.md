---
description: End-of-session wrap-up for verified ASTO work — runs the full gate, logs with evidence, checks design drift, merges the work branch to main, pushes, and hands off. Use /pause instead if the gate hasn't passed.
---

You are ending a session in the **ASTO game repo** whose intended unit of work has
reached its gate. **Base everything on what actually happened — do not invent
progress.** `docs/log.md` is the source of truth for build history (newest first).

If the gate has **not** passed, stop: this is a `/pause`, not a wrapup. Never use
`/wrapup` to disguise unfinished or failing work as complete.

## 1. Take stock
```bash
git status --short && git diff --stat && git branch --show-current
```
Summarise what was built / changed / fixed / decided this session.

## 2. Run the full gate

**Automated:**
```bash
npm test
```
- Report real results. **Never log a phase gate as passed on unverified code.**
- Run `node tools/check-board.js` on any board added or edited this session.

**Claude-verifiable:** if UI, the Studio, or player-visible behavior was touched,
verify it directly in the preview browser (static server via `npm run serve`, mobile
viewport) — screenshot or console/network check as evidence, not just a claim.

**Max acceptance:** ASTO's phase gates are largely playtest gates. If the gate includes
feel, taste, or creative quality, flag it plainly — that part stays **open** until Max
passes it. Do not mark it passed on his behalf.

**Routing failures:** a **blocking** failure (core play loop, data integrity, safety, a
locked requirement) means the gate did not pass — switch to `/pause`. Non-blocking
issues get recorded and routed to `docs/backlog.md` or a later phase.

## 3. Write the log entry (`docs/log.md`)
Prepend at the **top** (newest first):
- Header: `## YYYY-MM-DD — <short title>`
- Short bullets: what was built (files created/changed), decisions made, bugs fixed,
  **what was verified and how** — the evidence, not just the claim.
- **Phase status:** which phase, and whether its gate is met (with evidence) or still
  open — and if open, exactly which items remain (e.g. "awaiting Max's playtest").
- **Always end with `- **Next:**`** — unfinished items + anything newly surfaced. The
  `/warmup` reads this next session; it's how continuity works.

## 4. Drift, decisions, and loose ends
- If the build deviated from `docs/design.md` (a decision changed, a module moved),
  either update the plan to match reality or record the deviation. The plan and the code
  must not silently disagree. **The locked decisions (schema v1.0, zero-dep vanilla ESM,
  engine-first) need Max's explicit OK to change** — propose, don't rewrite.
- A new house-rule departure gets an **HR entry** in `docs/design.md` with its
  reconsider-when trigger — never a silent exception.
- Close or update any `docs/decisions/` tickets this session resolved.
- Unrelated ideas that surfaced go to `docs/backlog.md`, one line each.

## 5. Commit, merge, push
Only with the gate passed (or its only open item being Max acceptance, noted in the log):
```bash
git add -A
git commit -F - <<'EOF'
<type>: <short title matching the log entry>

<1–3 line body mirroring the log entry's gist>

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
```
- Conventional-commit subject: `feat:` for game features, `test:`, `fix:`, `docs:`,
  `chore:`. Body mirrors the log entry. Message **must end** with the `Co-Authored-By`
  trailer.
- **`main` holds verified states only.** On a `work/` branch with the phase complete:
  merge into `main`, push `main`, delete the merged branch. Mid-phase verified
  checkpoints may stay on the work branch — push the branch instead.
- Confirm sync (`git status -sb` shows in sync, no "ahead"). Never force-push. If the
  tree is already clean, skip commit/push and confirm sync.
- If this wrapup makes ASTO first work locally for its intended purpose (see
  `docs/brief.md`): tag it `v0.1.0-local` and set **Status: LOCALLY SHIPPED** in
  `CLAUDE.md`.

## 6. Handoff summary
Short recap: what's **done and verified** (with what evidence), what's **in progress /
unverified**, **open gate items** (especially anything awaiting Max), current **phase +
gate status**, and **what's next** (mirroring the log's `Next:` line). If a phase gate is
met, say plainly that a playtest is the next gate.

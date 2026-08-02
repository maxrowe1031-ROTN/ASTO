---
description: End-of-session wrap-up — logs what happened to docs/log.md, verifies tests, commits to main, and hands off.
---

You are ending a session in the **ASTO game repo**. **Base everything on what actually
happened — do not invent progress.** `docs/log.md` is the source of truth for build
history (newest first).

## 1. Take stock
```bash
git status --short && git diff --stat
```
Summarise what was built / changed / fixed / decided this session.

## 2. Verify before you claim anything works
```bash
npm test
```
- Report real results. **Never log a phase gate as passed on unverified code.**
- If a UI phase was touched, confirm it in the preview browser (static server, mobile
  viewport) — screenshot or console/network check as proof. If something is broken or
  unverified, say so plainly in the log.
- Run `node tools/check-board.js` on any board added this session.

## 3. Write the log entry (`docs/log.md`)
Prepend at the **top** (newest first):
- Header: `## YYYY-MM-DD — <short title>`
- Short bullets: what was built (files created/changed), decisions made, bugs fixed,
  **what was verified and how**.
- **Phase status:** which phase, and whether its gate is met (with evidence) or still open.
- **Always end with `- **Next:**`** — unfinished items + anything newly surfaced. The
  `/warmup` reads this next session; it's how continuity works.

## 4. Design-doc drift check
If the build deviated from `docs/design.md` (a decision changed, a module moved), either
update the plan to match reality or note the deviation in the log. The plan and the code
must not silently disagree. **The locked decisions (schema v1.0, zero-dep vanilla ESM,
engine-first) need the user's explicit OK to change** — propose, don't rewrite.

## 5. Commit and push to `main`
Only if tests are green (or the only failures are documented in the log as known):
```bash
git add -A
git commit -F - <<'EOF'
<type>: <short title matching the log entry>

<1–3 line body mirroring the log entry's gist>

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
git push origin main
```
- Conventional-commit subject: `feat:` for game features, `test:`, `fix:`, `docs:`,
  `chore:`. Body mirrors the log entry. Message **must end** with the `Co-Authored-By`
  trailer.
- Confirm the push (`git status -sb` shows in sync, no "ahead"). Never force-push. If
  the tree is already clean, skip commit/push and confirm sync.

## 6. Handoff summary
Short recap: what's **done and verified**, what's **in progress / unverified**, current
**phase + gate status**, and **what's next** (mirroring the log's `Next:` line). If a
phase gate is met, say plainly that a playtest is the next gate.

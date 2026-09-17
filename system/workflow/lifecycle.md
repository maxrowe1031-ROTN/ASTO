# Session lifecycle — workflow 1.0

Read `profile.json` and `project.md` beside this file, then the relevant repository authority docs. This versioned local copy works without the template or Brain. Project approval/merge policy lives in the profile; project-specific acceptance and product scope remain in the approved plan. A newer user instruction takes precedence. Do not silently change policy during a session.

## Warmup

1. Resolve the current Git root and inspect status, branch, upstream, latest commits, and existing worktrees. Record starting state once with `python3 system/workflow/workflow.py snapshot SESSION_ID`. Reuse that record on resume. It records ownership evidence, not permission to edit another session's work.
2. Read the profile's orientation documents and latest log handoff; load deeper material only for this task. Respect active character manifests; never activate an untuned/manual character without Max's instruction.
3. If a task is already chosen and authorized, continue it. Otherwise propose at most three relevant actions and clarify the real ambiguity. Report state, blockers, next action, and completion check in about 100 words. Mention shipping policy once, not on every turn.
4. Run a baseline check only when needed to distinguish existing failures or verify the task. Select the project's real check commands; never invent a test count or treat unavailable checks as passed. Full orientation, complete tool lists, and quizzes belong to learning mode or an explicit refresher.
5. If learning mode is requested, or the project notes select it for a learning session, retain three source-grounded questions, grade after answers, and explain briefly. Use the current host's question capability or chat; never block urgent implementation on a quiz. Installed tools are not necessarily callable: report actual session capabilities.
6. Once the task is clear, set a short activity-first title using the available host title tool (Codex: set_thread_title; Claude: session-title integration if present). Set it once; only Max can request later renaming. If absent, report a suggested title without blocking work.
7. Use the current task-owned workspace if suitable. Otherwise create an isolated branch/worktree from the verified intended base for implementation; do not switch another session's checkout or move its dirty files. Documentation exceptions are in the profile. Do not assume main is the default branch.
8. Cleanup is optional, never a startup prerequisite. Only remove a clean task-owned worktree whose exact branch head is the merged PR head (or is proven contained in the intended base), with no later commits, pending task, or ambiguous ownership. Squash merges require exact PR-head evidence. Never delete by branch name alone; preserve uncertainty. Never force-remove worktrees.
9. Capture relevant before evidence before edits. For static web previews the `preview` helper owns a new ephemeral loopback server and shuts it down when the supplied browser command exits. For project dev servers retain the process/session ID, check readiness and checkout identity, and stop only your process. Follow native/game verification in project notes instead of a browser default.

## During work

Use the available systematic debugging skill for a demonstrated bug; investigate cause before stacking fixes. Use frontend-design for web design and web-design-guidelines for web review within the applicable site workflow. Use feasibility-probe for a blocking unknown. These names are capabilities, not proof of installation: if unavailable, apply the relevant procedure explicitly and report that limitation. Never load every skill for every task.

## Wrapup

1. Inspect owned changes, including staged changes, and compare them with the agreed task and starting snapshot. Test the final code state with the project's relevant automated checks and real user path. Reuse still-valid evidence from this session if the tested code and environment have not changed; do not repeat a full suite just for ceremony. Re-run affected checks after fixes.
2. `python3 system/workflow/workflow.py check LABEL -- COMMAND ARGS` retains full output and the actual exit code outside tracked files. Do not pipe a gate through tail without preserving its status. Inspect the saved output; exclude credentials/private data from committed evidence. A missing command or directory is unavailable/error, not success. `scan PATTERN DIR...` validates directories and distinguishes no hits from errors.
3. Classify outcome: **paused** if required implementation or technical verification remains; **ready for review** if technical checks passed but Max acceptance is pending; **accepted** only after applicable human acceptance. A technical-only unit may be accepted without inventing a human gate. Report commit/push/PR/merge independently. Do not merge a ready-for-review change when required acceptance is still open.
4. Update only relevant product/plan/decision records. Preserve locked decisions and human-owned content. Write or update one log entry for this work unit, with actual evidence and outstanding checks; on retries update that entry instead of duplicating it. End with `Next:` (or the project's equivalent). Keep useful `Turn:`, `Correction:`, and phase snapshot conventions. Document untested paths. Tuning is an offer only when the existing project trigger applies.
5. Stage explicit owned files, never all files by default. The helper `stage SESSION_ID FILE...` rejects pre-existing changes and a nonempty index; use manual hunk review for mixed files. Inspect the staged diff before committing; never incorporate someone else's work just to clear the tree. Use the profile's authorship policy; identify the actual assistant without inventing a model version.
6. Follow the profile's delivery policy. A clean working tree may still have unpushed commits: check upstream/ahead separately. Verify destination remote, intended branch and privacy before pushing. No origin means local-only, not failure. A failed push leaves the commit in place; report it, never force-push.
7. Reuse an existing PR for the current branch. Prepare a concise description with behavior, verification, limitations and human acceptance. Use a body file for multiline text. Evidence images must be reviewed for private content and linked to a durable commit where appropriate.
8. Review at most three rounds when the project requires it. Use the available review capability; if unavailable, do an explicit local review and record that it was not an independent/plugin review. A required unavailable review remains pending. After three rounds, report remaining findings without silently accepting blockers. Never claim tests, reviews or approvals that did not happen.
9. Merge only under the exact applicable user/project authorization; a rule in another repo grants none. Never force-push. Do not switch a shared default checkout to perform a merge; keep any final integration isolated and preserve unrelated work. Cleanup requires the same exact-head/ownership evidence as warmup. Do not auto-tag a project locally shipped while its required real workflow remains unverified.
10. Handoff in about 100 words: what changed, proof and limits, outcome, actual delivery destination, open acceptance, next action. Learning mode can include the session quiz after the work is safely recorded.

## Pause

Record actual behavior, failures, unverified areas, and the exact resume point. Use the same owned-file and authorship checks. A labeled WIP commit/push may be made on the task branch under project policy; do not merge failing work or transfer unrelated files from main. Do not run a full suite solely to pause; record which checks were not run. Keep the outcome paused even if the checkpoint pushed successfully.

## Delivery policy meanings

- `human-pr`: implementation branch, push and PR; Max merges. Documentation-only exceptions are stated in the profile/authority docs.
- `phase-local-merge`: preserve the repository's standing phase-complete merge/push convention; mid-phase checkpoints stay on a branch. Required acceptance must pass first, and session-specific restrictions still apply.
- `automatic-pr-on-wrapup`: only explicit wrapup invocation carries the documented PR-and-merge authorization. Required checks/acceptance must pass; no bypass of branch protection.
- `direct-default`: normal verified documentation can commit/push directly to the intended default branch; a migration review branch is allowed.
- `local-direct-no-push`: verified local commit only; report actual sync state without asserting a credential limitation.
- `local-merge`: no remote; verified local integration under the existing policy. Do not create a remote or publish.

For all modes a task-specific “do not push/merge” instruction overrides the standing convention. This file never expands authorization to unrelated messaging, publishing, accounts or costs.

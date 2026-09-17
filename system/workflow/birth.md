# Birth — workflow 1.0

Birth is intake and planning before production implementation. Approval already given in this conversation remains valid. A feasibility probe is allowed to answer one named question; its output is evidence, not automatically production code.

## Locate and resume

Resolve the intended Git repository root explicitly, including when invoked from a subdirectory. Inspect branch/default branch, dirty and staged files, destination remote, and existing project material without modifying it. If there is no repository, initialize only within the authorized target. Never infer a new target from an ancestor repository.

Resolve Brain from the existing project's configured `brainRoot`, then the known personal Brain location `~/Documents/GitHub/Brain`; verify its index before reading or writing. Never derive it from a worktree's parent. Read the index first, then a few relevant pages. Use a named lookup agent only if actually available; direct read-only lookup is a valid fallback, with reviewed/draft status preserved. If unavailable, report and proceed.

If `system/workflow/birth-state.json` exists, inspect its state and files, not merely the presence of a birth command. Resume the first incomplete step. A completed birth is not re-interviewed or rewritten: requested changes use normal project governance. Older projects without a state file require evidence from their approved plan/log before recording a completed adoption; do not rerun birth on an already established project. Partial copies must be reconciled against the recorded manifest, preserving all existing content.

## Intake and challenge before copying

Reuse clear answers from the user and relevant prior records. Ask one compact block at a time only for consequential unknowns:

- What is it, who uses it, and what experience must work? What belongs in MVP/later/never?
- Useful exemplars and what to take/leave; no matching exemplar is acceptable.
- Intended computer/device/platform, skills, time, budget, accounts, private data, and distribution.
- What observable result counts as locally shipped? How will Max try it?
- Is any artifact publishable? Establish remote visibility/destination before an external push.

Consult applicable Brain patterns, then challenge scope, duplication, unnecessary AI/infrastructure, and whether this should be a disposable experiment. Choose explicitly:

- **Experiment:** use feasibility-probe; one question and finding, no full scaffold, character or publishing requirement.
- **Small:** brief/product, thin design and gate, log, recovery, lifecycle entry points. Character/Studio/Showcase may be deferred, explicitly recorded.
- **Full:** complete product/design plus justified Studio or verification alternative, Showcase audience, and proposed character. Existing full-project conventions remain unless Max changes them.

Resolve critical feasibility unknowns before calling decisions locked. Build only the smallest isolated probe with a stopping condition. Keep failed findings without resetting shared work. A prototype does not earn a production claim.

## Draft and approve

Draft a thin product brief (intent in Max's words, goals/pillars that settle decisions, core flow, must/later/never, success, open tickets) and design (boundaries, contracts, dependencies/costs, privacy/distribution, Phase 1 scope and concrete automated/agent-verifiable/human gates). Later phases may remain tentative. Label drafts as drafts; do not stamp them approved before Max's approval.

For a full profile propose character name/slug/role/voice; finalize only when approved and create it with manual activation. Drafted personality is not permission to use it. Showcase tagline/reflection remain Max's words. Defer nonblocking choices to named tickets rather than inventing certainty. Present the reviewable plan, requesting only missing approval. “Looks good/build it” counts; never ask again for the same decision.

## Install a recorded snapshot

Use a committed template snapshot, recording version and full commit ID. Use the local committed snapshot offline; do not copy dirty/untracked template content. Deliberate local template changes need their own reviewed checkpoint first. A template fetch is optional and must not switch/mutate a shared checkout.

Run the template's helper from its recorded checkout:

`python3 system/workflow/birth.py copy --template TEMPLATE_ROOT --revision COMMIT --target PROJECT_ROOT --profile small`

Use `full` for the full profile. The helper preflights every collision and copies only selected tracked files from the commit. It writes no commit, push, or registry entry. Existing README/license files are preserved. Existing gitignore/settings collisions are reported before any write; prepare a reviewed reconciliation instead of overwriting or repeatedly retrying. Record any intentionally reconciled scaffold manifest before resuming validation.

Fill the required destination fields listed in `birth-state.json`, including product/design/log/backlog headers, template provenance and workflow profile. Set project name, platform, orientation/log paths, real check commands, verification surface, Brain root, and approved delivery policy. Keep assistant/tool bindings in host entry points. Remove template-only `version` from project `template.json`; set bornFromVersion, lastReviewedAgainstVersion, templateCommit, and localExceptions. Update launch settings for the selected platform; do not leave a web-only launch recipe in native projects.

For a small project trim house instructions about mandatory characters/Studio/Showcase and record the selected profile instead; do not leave claims about artifacts that were deferred. For full, rename `_character` and resolve identity/manifest; fill Showcase fields and verify source anchors against the actual birth log. All new characters remain manual.

Validate with `python3 system/workflow/birth.py validate PROJECT_ROOT`. It checks actual template fields and ignores instructional brace examples; inspect its errors, required docs, manifest structure and rendering separately. Validation does not grant approval. Missing human acceptance stays pending.

## Register and finish

If a character was approved, inspect the Brain registry and its validator before editing. Match entries by stable project slug/identity and canonical project root, not worktree path. Update-or-insert the one entry; never append a duplicate or create a competing empty registry over existing data. Validate a proposed temporary candidate before replacement where the validator supports it, otherwise retain the old bytes and restore only your registry edit on failure. Re-read immediately before replacing to detect concurrent edits; a concurrent change needs reconciliation, not overwriting. Preserve all other entries. Report unavailable registration in Next. This scoped registration is authorized by birth; it is not permission to commit unrelated Brain changes.

Write the approved birth log with decisions, unresolved checks, template revision, registration result, and Next. Mark birth-state complete only when required files validate and plan/character approvals are evidenced; record the approval wording/date or source locator, never fabricate one. Completion of planning does not mean the application is built.

Checkpoint the finalized owned files under the project's delivery policy. Verify remote/visibility before pushing; if unknown, keep local and report the pending destination. Report Brain registration's separate Git status. Continue Phase 1 if already authorized; otherwise leave its precise first action.

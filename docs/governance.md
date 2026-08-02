# Governance — authority, health, and template migration

Loaded on demand (health checks, migrations, conflicts) — not part of every
session's working context.

## Authority order

When project sources disagree:

1. Max's latest explicit instruction.
2. The approved `docs/design.md` (including recorded exceptions and accepted
   risks with their reconsider-when triggers).
3. Closed decision records in `docs/decisions/`.
4. Product intent in `docs/brief.md`.
5. Schemas, public contracts, and accepted tests, where the design is silent.
6. House defaults in `CLAUDE.md` and Brain patterns adopted into the design.
7. `docs/log.md` — historical evidence, never current authority.
8. `docs/backlog.md` — unapproved possibilities.

Code is implementation reality, but it does not silently become intended
design — disagreement triggers the drift check (CLAUDE.md §6).

## Project health check

Run when something feels off, before a migration, or on request:

- Required docs exist: brief, design, log, backlog, recovery.
- No unresolved `{{PLACEHOLDER}}` values remain.
- The current phase has a defined gate (and gate kind).
- Git is on the expected branch; `main` is in a verified state; no stray
  unpushed work.
- `.gitignore` covers `.env`; the settings deny-rule is intact.
- The Studio (or its recorded alternative) runs.
- Spot-check for silent drift between code and `docs/design.md`.

## Template migration

Older projects periodically review against the current template. Migration is
never blind file replacement:

1. Compare `template.json`'s `lastReviewedAgainstVersion` with the template's
   current version; read the template's changelog for what changed.
2. Identify which changes are relevant to this project.
3. Preserve project-specific decisions and recorded exceptions.
4. Write a short migration plan; show Max first if it changes architecture,
   workflow, docs structure, user behavior, public contracts, recovery, or
   distribution. Minor behavior-preserving safety/tooling updates may proceed
   directly.
5. Run on a work branch; pass the project's existing gates; merge only after
   verification.
6. Update `lastReviewedAgainstVersion` and record adopted changes.

Do not restructure a stable project just because the template changed, when the
new rule provides no meaningful benefit here.

## Upstream proposals

A rule proven wrong or missing in **two projects** — or one serious
security/data-loss/recovery scar — becomes a proposal in the `project-template`
repo. Record the scar, the proposed change, and which projects it affects. The
template earns rules from scars, not speculation.

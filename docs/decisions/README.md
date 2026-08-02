# Decision tickets

One file per open question, slugged: `NNN-short-question.md` (e.g.
`001-persistence-strategy.md`). Keep tickets to four fields — they're working
notes, not paperwork.

```markdown
# NNN — <the question, as a question>

status: open | closed (YYYY-MM-DD)

**Why it matters / what it blocks:** <one or two lines — include what blocks
THIS decision, if anything>

**Options:** <the live candidates, one line each, with the current lean>

**Resolution:** <empty until closed — then the decision, the evidence or
reasoning, and where it got recorded (design.md section / HR exception)>
```

Rules:

- Only decisions that block the **next phase** must close before it starts.
- Closing a ticket means recording the outcome in `docs/design.md` (or as an
  HR exception) and filling the Resolution — keep the closed file; rejected
  paths and their reasoning matter later.
- If tickets keep blocking each other, that's the fog clause (`/birth` step 7):
  map the dependencies and resolve the frontier first.

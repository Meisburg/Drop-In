# Reviewer brief — V28 Slice 2a

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

Fresh-context review of **one diff against one plan slice**. You did not write
this code; do not assume it is right.

## What you are reviewing

- **The diff:** commit `418ed10` (parent `afc167c`). Three files:
  `src/components/LocationRequiredNotice.tsx` (new, 37 lines),
  `src/pages/PlaydateDetailPage.tsx` (+22),
  `src/pages/NewPlaydatePage.tsx` (+20).
- **The contract:** `plan.md` → Slice 2a. Read it, plus the Risks note on why 2a
  precedes 2b.
- **The build law:** `docs/agents/code-structure.md`.

Start with `git show 418ed10` and read every line. It is 79 lines.

## The questions

1. **"Has a home zip" — is it defined once?** Establish what this codebase
   means by "the parent has a home zip", find **every** place that predicate is
   computed or applied for this purpose, and report any two places that disagree
   with each other. Cite `file:line` for each. This is the single most important
   question in this review: Slice 2b removes the app-wide wall and moves the
   requirement onto the guards this diff adds, so if the guards' notion of "has a
   zip" is looser than the wall's, the handover silently weakens the rule.
2. **Can the guard be bypassed?** For each site, is there any path that reaches
   `togglePing`/`createPlaydate` with the zip unset — a second call site, a
   different handler, a default, an early return that skips the guard, or a
   guard placed after the write? Name it if so.
3. **The SET/CLEAR nuance.** The plan requires that clearing an existing ping is
   never blocked. Verify from the code that this holds — and that it does not
   accidentally let a *set* through (e.g. if the "already on" state is read
   before it settles).
4. **Is the notice genuinely presentational?** Does
   `LocationRequiredNotice.tsx` take its inputs as props and decide nothing? Per
   the build law, React renders and does not decide — flag any data access,
   routing logic, or domain rule inside it.
5. **The self-clearing render condition.** Both render sites re-check the zip and
   claim the notice clears itself when a zip lands. Is that true, and does the
   stale `useState(false)` flag leave any state where the notice is stuck on, or
   shown when it should not be?
6. **Anything the diff breaks.** Does either page's changed behaviour alter a
   path a spec or an e2e lane depends on?

## Rules

- Findings must cite `file:line`. A finding without a location is an opinion.
- Judge the diff against the slice. Do **not** report pre-existing lint warnings,
  unrelated files, or the two large pages' unrelated contents.
- Do not edit anything. You are read-only.
- If the slice cannot be judged because the plan is ambiguous, return BLOCKED and
  name the ambiguity rather than guessing.

## Verdict

```
Verdict: PASS | NEEDS_CHANGES | BLOCKED
Findings:
  - <severity: blocking | minor> <file:line> <what is wrong>
    why it matters: <one line>
Zip predicate: <every file:line that defines or applies it, and whether they agree>
Evidence checked: <what you actually read/ran, so the orchestrator can audit you>
```

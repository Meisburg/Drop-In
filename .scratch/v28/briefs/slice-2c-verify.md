# Verifier brief — V28 Slice 2c (closing verification)

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

You are the deterministic referee. Run the real commands. Interpret nothing, fix
nothing, report raw outcomes.

## What to verify

Slice 2c is **`420c274`** on `Meisburg/onboarding`: the slice itself is
`549c2e9`, then two comment-only fix rounds (`a6a74a4`, `420c274`).

**No lane has yet confirmed this slice's gate.** The builder reported it green but
its output is recorded nowhere, so this is the first independent confirmation.

1. **State first.** `git rev-parse HEAD` and `git status --short` verbatim. A
   modified tracked file invalidates the run; untracked files do not.
2. **The gate.** `npm run verify` — exit code plus **each stage separately**:
   build, test (file and test counts), lint (**error AND warning counts, and
   whether they moved from the 80/0 baseline**), `a11y:focus`, `steering-lint`,
   and the GUARDS line verbatim. Never infer an earlier stage from a later one
   passing. Take the counts from output you ran.
3. **The e2e lane.** `npx playwright test e2e/zip-radius.e2e.ts` — counts and
   duration. This spec exercises only a **zipped** marker: it is the regression
   proof that the zipped path is untouched, and it does **not** exercise the new
   branch. It needs a `.env`; if absent, report an ENVIRONMENT failure.
4. **The two fix rounds were comment-only** — run this twice, once per commit, and
   paste the result:
   ```
   git show a6a74a4 | grep -E "^[+-]" | grep -vE "^(\+\+\+|---)" | grep -vE "^[+-][[:space:]]*(\*|//|/\*)"
   git show 420c274 | grep -E "^[+-]" | grep -vE "^(\+\+\+|---)" | grep -vE "^[+-][[:space:]]*(\*|//|/\*)"
   ```
   Each must print **nothing**. A non-comment line is a blocking finding.
5. **The behaviour is present** — paste output:
   - `rg -n "LocationRequiredNotice" src/components/RadiusEmptyState.tsx`
   - `sed -n '103,106p' src/components/RadiusEmptyState.tsx` (or wherever the
     early return is) — confirm the condition is `profile !== null &&
     !hasHomeZip(profile.home_zip)` and that it sits **after** every hook call in
     the component. **Report the line numbers of every `useState`/`useContext`
     call and the early return**, so hook ordering is observed, not assumed.
6. **The three declared stale claims are gone from the slice's three files** —
   `rg -n "onboarding gate|keys on home_zip|bounces? to /onboarding" src/components/RadiusEmptyState.tsx src/pages/FeedPage.tsx src/lib/feed.ts`
   → paste every hit and say whether each is a true statement or a surviving
   false claim. (A multi-line claim is not caught by a single-line grep — read
   the hits.)
7. **Scope.** List the files `420c274` changes, and whether any `src/`, `e2e/`,
   script or config path outside Slice 2c's declared set
   (`src/components/RadiusEmptyState.tsx`, `src/pages/FeedPage.tsx`,
   `src/lib/feed.ts`) changed across `655b59b..420c274`. The orchestrator's own
   record commits (`plan.md`, `task-state.md`, `.scratch/`) are **not** scope
   violations — report them separately.

## Rules

- Run everything yourself, this turn. Report no count you did not observe.
- Distinguish an environment failure from a verification failure.
- Do not edit, fix or commit anything.
- Paste real output tails. "Passed" without output is not verification.

## Report

```
Verified commit: <sha>   tree: clean | dirty (<what>)
Gate: exit <n>
  build: <ok|fail>   test: <n files / n tests>   lint: <n errors / n warnings> (baseline 80/0)
  a11y:focus: <ok|fail>   steering-lint: <ok|fail>   guards: <GUARDS line verbatim>
zip-radius e2e: <n passed / n failed, duration>
Comment-only check — a6a74a4: <"printed nothing" or the offending lines>
Comment-only check — 420c274: <"printed nothing" or the offending lines>
Hook order: <useState/useContext line numbers> vs early return at <line> — hooks all first? <yes/no>
The early-return condition: <verbatim>
Stale-claim grep: <every hit, classified true | surviving-false-claim>
420c274 changes: <files>
Source-path changes in 655b59b..420c274 outside the declared set: <list or "none">
Non-source (record) changes in the range: <list>
Environment failures: <or "none">
Verdict: PASS | FAIL | ENVIRONMENT_BLOCKED
```

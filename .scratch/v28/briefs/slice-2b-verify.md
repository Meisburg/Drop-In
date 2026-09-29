# Verifier brief — V28 Slice 2b (closing verification)

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

You are the deterministic referee. Run the real commands. Interpret nothing, fix
nothing, report raw outcomes.

## What to verify

Slice 2b is **`f6bf406`** (a fix round on top of `c6c1256`, which built the slice)
on `Meisburg/onboarding`.

1. **State first.** `git rev-parse HEAD` and `git status --short`. A modified
   tracked file invalidates the run; untracked files do not.
2. **The gate.** `npm run verify` — exit code plus **each stage separately**:
   build, test (file and test counts), lint (**error AND warning counts**),
   `a11y:focus`, `steering-lint`, and the GUARDS line verbatim. Never infer an
   earlier stage from a later one passing. **The lint baseline is 80 warnings /
   0 errors** — report the observed number and say whether it moved. Get the
   count from output you ran, not from a summary.
3. **The slice's own tests.** `npx vitest run src/lib/onboarding.test.ts` — counts
   and exit code. Also name the tests that assert the *settled signed-in* gate leg
   and the *return target*, so their existence is observed rather than assumed.
4. **The e2e lane.** `npx playwright test e2e/onboarding-gate.e2e.ts` — counts and
   duration. It needs a `.env` in this workspace; if absent, report an
   ENVIRONMENT failure, not a verification failure.
5. **The deletions actually happened** — run these and paste output:
   - `rg -n "_homeZipSet" src/` → must be empty.
   - `rg -n "homeZipSet" src/` → paste every line. Each must be a **legitimate
     reader**: `db.ts` (the state provider), `onboarding.ts`'s `needsOnboarding`
     and `resolveOnboardingRedirect`, and `App.tsx`'s call to
     `resolveOnboardingRedirect`. **Report any hit that reads a value which
     nothing consumes.**
   - `rg -n "'onboard'" src/` → must be empty.
   - `rg -n "export function resolveProtectedRedirect" -A 4 src/lib/onboarding.ts`
     → the signature must have exactly two parameters and no zip.
6. **The merge arithmetic.** The slice reports the test count moved **1977 → 1975
   (−2)** because two pairs of tests merged. Verify the current total yourself and
   report whether −2 is consistent with what you observe. Do **not** accept the
   explanation on its word: if you can, name the merged tests.
7. **Scope.** List the files `f6bf406` changes, and report whether any `src/`,
   `e2e/`, `script` or config path outside those changed across
   `c6c1256..f6bf406`. The orchestrator's own record commits (`plan.md`,
   `task-state.md`, `.scratch/`) are **not** scope violations — report them
   separately.

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
Slice tests: <n tests, exit n>  — named: <the settled gate test, the return-target test>
onboarding-gate e2e: <n passed / n failed, duration>
Grep _homeZipSet: <empty or the lines>
Grep homeZipSet survivors: <every line, and whether each is a legitimate reader>
Grep 'onboard': <empty or the lines>
resolveProtectedRedirect signature: <verbatim>
Test-count check: <observed total> vs claimed 1975 (was 1977) — consistent? <yes/no + why>
f6bf406 changes: <files>
Non-source (record) changes in c6c1256..f6bf406: <list>
Environment failures: <or "none">
Verdict: PASS | FAIL | ENVIRONMENT_BLOCKED
```

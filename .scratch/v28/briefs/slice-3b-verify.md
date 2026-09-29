# Verifier brief — V28 Slice 3b (closing verification)

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

You are the deterministic referee. Run the real commands. Interpret nothing, fix
nothing, report raw outcomes.

## What to verify

Slice 3b is **`3080c65`** on `Meisburg/onboarding`. A reviewer has passed it with
no blocking findings. **Your job is the evidence gap:** its `npm run verify` result
and its three-spec Playwright run are **pasted nowhere**, the **lint count against
the 80-warning baseline is still missing** (the builder omitted the number for the
second time this batch), and one earlier `verify` run went red on an environmental
git flake. This is the first independent confirmation.

1. **State first.** `git rev-parse HEAD` and `git status --short` verbatim. A
   modified tracked file invalidates the run; untracked files do not.
2. **The gate.** `npm run verify` — exit code plus **each stage separately**:
   build, test (file and test counts), lint (**error AND warning counts, and
   whether they moved from the 80/0 baseline**), `a11y:focus`, `steering-lint`,
   and the GUARDS line verbatim. **Baselines: 65 test files / 1975 tests; lint
   80 warnings / 0 errors.** Never infer an earlier stage from a later one passing.
   **If a guard fails on a /tmp git-clone error, re-run that guard in isolation
   and report both outcomes** — that flake is recorded as environmental, but a red
   that repeats is not.
3. **The three specs.** `npx playwright test e2e/golden-path.e2e.ts e2e/onboarding-gate.e2e.ts e2e/signup-zip-fallback.e2e.ts`
   — per-test results and duration. This includes the `auth.setup.ts` **setup
   project**, which is the whole-suite dependency this slice had to reorder:
   **report its line explicitly**, and whether the marker's REST PATCH and
   `@handle` assertions ran. Needs a `.env`; if absent report an ENVIRONMENT
   failure.
4. **The landmine is clear** — run and paste:
   - `rg -n "street-address" e2e/ src/pages/LoginPage.tsx` → must be **empty**.
   - `rg -n "signupAddress|addressFieldError|zipFromAddressQuery|markSignupZipUnresolved" src/ --glob '!*.test.ts'`
     → paste every hit and classify it: a **definition** (expected for
     `addressFieldError`, `zipFromAddressQuery`, `markSignupZipUnresolved` — all
     three are scheduled for reuse or retirement in Slice 5), or a **call site**
     (report any, since the producers are supposed to be gone).
5. **The signup lands on the interview** — from the source, paste:
   - `rg -n "ONBOARDING_PATH|navigate\(|justSignedUp" src/pages/LoginPage.tsx`
   - The guard that could bounce, and the line that sets `justSignedUp`. Confirm
     the **order**: is `justSignedUp` set before the `await`?
6. **Exactly one profile-row creator.**
   `rg -n "createProfile" src/ --glob '!*.test.ts'` → report the call sites. There
   must be exactly one in a page (the name card), plus the definition.
7. **Scope.** List the files `3080c65` changes and whether any `src/`, `e2e/`,
   script or config path outside the declared five (`e2e/auth.setup.ts`,
   `e2e/fixtures.ts`, `e2e/signup-zip-fallback.e2e.ts`, `src/pages/LoginPage.tsx`,
   `src/pages/OnboardingPage.tsx`) changed across `0cbb49f..3080c65`. The
   orchestrator's record commits (`plan.md`, `task-state.md`, `.scratch/`) are
   **not** scope violations.

## Rules

- Run everything yourself, this turn. Report no count you did not observe.
- Distinguish an environment failure from a verification failure — and report a
  re-run's outcome whenever an environmental flake is suspected.
- Do not edit, fix, commit, or run the marker sweep.
- Paste real output tails. "Passed" without output is not verification.

## Report

```
Verified commit: <sha>   tree: clean | dirty (<what>)
Gate: exit <n>
  build: <ok|fail>   test: <n files / n tests>   lint: <n errors / n warnings> (baseline 80/0 — moved? <yes/no>)
  a11y:focus: <ok|fail>   steering-lint: <ok|fail>   guards: <GUARDS line verbatim>
  guard re-run after any flake: <outcome>
Three specs: <per-test pass/fail + duration; the auth.setup line verbatim>
street-address grep: <empty or the lines>
The named identifiers: <every hit, classified definition | call site>
LoginPage: navigate target <line> | the bounce guard <line> | justSignedUp set at <line> — before the await? <yes/no>
createProfile call sites in pages: <lines>
3080c65 changes: <files>
Source-path changes in 0cbb49f..3080c65 outside the declared five: <list or "none">
Non-source (record) changes in the range: <list>
Environment failures: <or "none">
Verdict: PASS | FAIL | ENVIRONMENT_BLOCKED
```

# Verifier brief — V28 Slice 3a (closing verification)

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

You are the deterministic referee. Run the real commands. Interpret nothing, fix
nothing, report raw outcomes.

## What to verify

Slice 3a is **`71e2b6b`** on `Meisburg/onboarding`. A reviewer has already passed
it with **zero findings** — so your job is *not* a second opinion. It is to
convert the builder's claims into output, because **its gate report is recorded
nowhere**: the ledger holds "dispatched", then nothing. Your counts are the first
evidence.

1. **State first.** `git rev-parse HEAD` and `git status --short` verbatim. A
   modified tracked file invalidates the run; untracked files do not.
2. **The gate.** `npm run verify` — exit code plus **each stage separately**:
   build, test (file and test counts), lint (**error AND warning counts, and
   whether they moved from the 80/0 baseline**), `a11y:focus`, `steering-lint`,
   and the GUARDS line verbatim. **The test baseline is 65 files / 1975 tests.**
   Never infer an earlier stage from a later one passing.
3. **The e2e lane.** `npx playwright test e2e/golden-path.e2e.ts` — counts and
   duration. It needs a `.env`; if absent, report an ENVIRONMENT failure, not a
   verification failure. (This lane **creates an `e2e-` account** — see item 7.)
4. **The seam, from the source, by grep** — paste each:
   - `rg -n "isFirstRun|navRenders" src/App.tsx`
   - `rg -n "pathname === ONBOARDING_PATH|ONBOARDING_PATH" src/App.tsx` — the plan
     requires exactly **one** comparison; report every occurrence and say whether
     each is code or a comment.
   - `rg -n "session !== null" src/App.tsx` — report each hit and classify it as
     **a chrome decision** or **header content**. A chrome decision still keyed on
     `session` alone is a finding.
   - The wrapper's grid class expression and `<main>`'s padding expression —
     print both verbatim. Both must derive from `navRenders`.
5. **The collapse cannot recur — check the class strings.** With `navRenders`
   false, print the exact wrapper `className` for the md+ case and confirm it
   carries **no** `grid-cols-` template. (The reviewer's structural argument: two
   columns imply the rail renders; no rail means one auto column, so column 1
   cannot be empty.) Report the raw string either way.
6. **The card.** Paste `rg -n "FirstRunCard|progressLabel" src/pages/OnboardingPage.tsx`
   and confirm the card receives `progressLabel('name')` rather than a literal.
   Paste the primary-label prop and confirm it still matches `/^Continue/`.
   Also confirm the early return sits **after** the page's hook calls — report the
   line numbers of the hooks and of the return.
7. **Side effects — the marker convention.** The builder's own runtime checks
   created two `e2e-seam3a-…@gmail.com` accounts plus one `Seam Check` profile row
   in the **live** database, and your golden-path run will create another `e2e-`
   account. Report:
   - `rg -n "e2e-%|like 'e2e-" scripts/sweep-e2e-markers.mjs scripts/lib/sweep-e2e.mjs`
     → confirm the sweep's account set is the `e2e-` email prefix.
   - **Do not run the sweep** (it deletes live rows and is scheduled for Slice 7);
     just report whether those addresses are inside the documented set.
8. **Guard order — untouched.** Run
   `git diff 18feb83..71e2b6b -- src/App.tsx | rg -n "MOD_PATH|editFallback|storedReturn|PLAYDATE_RETURN_KEY|canModerate|playdateDetailPathFromEditPath"`
   and paste the result. Zero matches means no guard line moved.
9. **Scope.** List the files `71e2b6b` changes, and whether any `src/`, `e2e/`,
   script or config path outside the declared three
   (`src/components/FirstRunCard.tsx`, `src/pages/OnboardingPage.tsx`,
   `src/App.tsx`) changed across `18feb83..71e2b6b`. The orchestrator's record
   commits (`plan.md`, `task-state.md`, `.scratch/`) are **not** scope violations.

## Rules

- Run everything yourself, this turn. Report no count you did not observe.
- Distinguish an environment failure from a verification failure.
- Do not edit, fix, commit, or run the marker sweep.
- Paste real output tails. "Passed" without output is not verification.

## Report

```
Verified commit: <sha>   tree: clean | dirty (<what>)
Gate: exit <n>
  build: <ok|fail>   test: <n files / n tests>   lint: <n errors / n warnings> (baseline 80/0)
  a11y:focus: <ok|fail>   steering-lint: <ok|fail>   guards: <GUARDS line verbatim>
golden-path e2e: <n passed / n failed, duration>
isFirstRun / navRenders: <lines>
pathname === ONBOARDING_PATH occurrences: <each, code or comment>
session !== null occurrences: <each, classified chrome-decision | header-content>
grid class expression (navRenders false, md+): <verbatim; any grid-cols-? yes/no>
main padding expression: <verbatim>
The card: progress label <verbatim> | primary label <verbatim> | hooks at <lines> vs early return at <line>
Marker sweep covers those addresses? <yes/no + the pattern line>
Guard-order diff grep: <"zero matches" or the lines>
71e2b6b changes: <files>
Source-path changes in 18feb83..71e2b6b outside the declared three: <list or "none">
Non-source (record) changes in the range: <list>
Environment failures: <or "none">
Verdict: PASS | FAIL | ENVIRONMENT_BLOCKED
```

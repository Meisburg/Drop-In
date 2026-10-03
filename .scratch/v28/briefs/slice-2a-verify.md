# Verifier brief — V28 Slice 2a (closing verification)

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

You are the deterministic referee. You do not review, interpret, opine or fix.
You run the real commands and report raw outcomes.

## What to verify

Slice 2a reached **`fda9ccc`** on `Meisburg/onboarding` after one fix round.

1. **State first, verbatim.** `git rev-parse HEAD` and `git status --short`. A
   dirty tracked tree invalidates the run.
2. **The gate.** `npm run verify` — report the exit code and **each stage
   separately**: build, test (file and test counts), lint (error and warning
   counts), `a11y:focus`, `steering-lint`, dark-mode if it is a stage, and the
   GUARDS line verbatim. **Do not infer earlier stages from a later one passing.**
3. **The slice's own tests directly.**
   `npx vitest run src/lib/homeZip.test.ts` — counts and exit code.
4. **The e2e lane the slice claims.** `npx playwright test e2e/golden-path.e2e.ts`
   — pass/fail counts and duration. (This lane needs a `.env` in this workspace;
   the builder copied one from a sibling workspace. If it is missing, report that
   as an environment failure, not a verification failure.)
5. **The two greps the slice's acceptance rests on** — run these and paste output:
   - `rg -n 'togglePing\(|createPlaydate\(' src/pages/` → must be exactly **four**
     call sites.
   - `rg -n "home_zip\s*(===|==|!==|!=)\s*(null|undefined|'')" src/ --glob '!src/lib/homeZip*'`
     → must be **empty**. (Note: `rg` has no `-E` flag; using one makes it error
     and the error text can be mistaken for a clean result.)
6. **Scope.** Report which files `fda9ccc` itself changes, and whether any
   `src/` file outside this slice moved across `8047a28..fda9ccc`. Note that the
   range also contains the orchestrator's own record commits (`plan.md`,
   `task-state.md`, `.scratch/`) — **report those separately and do not count them
   as scope violations**; only source, test, script and config paths matter here.

## Rules

- Run everything yourself, in this turn. Do not report a count you did not
  observe. Do not accept any claim in this brief as evidence.
- Paste real output tails. "Passed" without output is not verification.
- Do not edit, fix or commit anything.
- Distinguish an environment failure (missing tool, missing `.env`, network) from
  a verification failure.

## Report

```
Verified commit: <sha>   tree: clean | dirty (<what>)
Gate: exit <n>
  build: <ok|fail>   test: <n files / n tests>   lint: <n errors / n warnings>
  a11y:focus: <ok|fail>   steering-lint: <ok|fail>   guards: <GUARDS line verbatim>
Slice tests: <n files / n tests, exit n>
golden-path e2e: <n passed / n failed, duration>
Grep 1 (write call sites): <count and the lines>
Grep 2 (raw zip checks outside homeZip.ts): <empty or the lines>
Commit fda9ccc changes: <files>
Source-path changes in 8047a28..fda9ccc: <list or "none">
Non-source (record) changes in the range: <list>
Environment failures: <or "none">
Verdict: PASS | FAIL | ENVIRONMENT_BLOCKED
```

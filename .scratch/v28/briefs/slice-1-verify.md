# Verifier brief — V28 Slice 1 (closing verification)

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

You are the deterministic referee. You do not review, interpret, opine, or fix.
You run the real commands and report raw outcomes. If something fails, you report
the failure; you do not repair it.

## What to verify

Slice 1 reached its final commit **`e175714`** on branch `Meisburg/onboarding`
after two fix rounds. Establish and report:

1. **The exact commit under test.** Run `git rev-parse HEAD` and `git status
   --short` first and report both verbatim — a dirty tree or an unexpected HEAD
   invalidates the run.
2. **The gate.** Run `npm run verify` and report:
   - the exit code,
   - the test file and test counts,
   - the lint warning/error counts,
   - the GUARDS line verbatim,
   - and whether `a11y:focus` and `steering-lint` passed.
   `npm run verify` is `build && test && lint && a11y:focus && steering-lint &&
   guards` — report each stage's outcome, do not infer the earlier stages from a
   later one passing.
3. **The slice's own tests, run directly.** Run
   `npx vitest run src/lib/firstRun.test.ts src/lib/firstRunCopy.test.ts` and
   report the counts and the exit code.
4. **The four files exist as claimed** at this commit:
   `src/lib/firstRun.ts`, `src/lib/firstRun.test.ts`, `src/lib/firstRunCopy.ts`,
   `src/lib/firstRunCopy.test.ts`. Report `git show --stat e175714`.
5. **Nothing outside the slice moved.** Report whether `e175714` changes any file
   outside those four across the whole slice range `15ada15..e175714`. Name any
   such file; that is the thing most likely to be wrong and least likely to be
   noticed.

## Rules

- **Run everything yourself, in this turn.** Do not report a count you did not
  observe, and do not accept any claim in this brief as evidence.
- Paste real output tails. "Passed" without output is not verification.
- Do not edit any file. Do not fix anything you find. Do not commit.
- Do not run the e2e suite — it is out of scope for this slice and takes minutes.
- If a command fails for an environment reason (a missing tool, a network
  dependency), report it as an environment failure distinguished from a
  verification failure.

## Report

```
Verified commit: <sha>   tree: clean | dirty (<what>)
Gate: exit <n>
  build: <ok | fail>   test: <n files / n tests, pass|fail>
  lint: <n errors / n warnings>   a11y:focus: <ok|fail>
  steering-lint: <ok|fail>   guards: <the GUARDS line verbatim>
Slice tests: <n files / n tests, exit n>
Commit contents: <the four files, or what differs>
Out-of-scope changes in 15ada15..e175714: <list, or "none">
Environment failures: <or "none">
Verdict: PASS | FAIL | ENVIRONMENT_BLOCKED
```

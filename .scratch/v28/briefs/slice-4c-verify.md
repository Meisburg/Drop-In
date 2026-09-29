# Verifier brief — V28 Slice 4c (closing verification)

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

Deterministic referee: run the real commands, paste the real output, interpret
nothing, fix nothing.

Slice 4c is **`f8fe01d`**. A reviewer PASSED it and **stated plainly that it could
not prove the e2e passed** — it ran no gate. That is your lane. Record-only commits
may sit on top; report the actual HEAD and confirm the covered paths are
byte-identical to `f8fe01d`.

## 1. State

`git rev-parse HEAD`, `git status --short`, `git show --stat f8fe01d` — expect
**exactly 3 files**, +307/−3: `src/pages/OnboardingPage.tsx`,
`e2e/onboarding-resume.e2e.ts` (**new**), `e2e/fixtures.ts`.

## 2. The gate

`npm run verify` — exit code plus **each stage separately**.

**Expected, and state whether each was met:**
- tests **66 files / 1981 tests**. **4c should add no vitest test** — this repo has
  **zero `.tsx` test files**, which is why the new gating proof is a Playwright spec.
  If the count moved, say by how much and whether it is explained.
- lint **0 errors / 81 warnings** — the 80 baseline plus the one accepted
  `react(set-state-in-effect)`. **Confirm 81 and not 82.**
- `a11y:focus`, `steering-lint`, and the **GUARDS** line verbatim. **NOTE: this slice
  adds a spec that creates its own fixtures** — confirm the guards accept it (the e2e
  fixture-marker rule), and paste the guards line whether it passes or fails.
- **The `/tmp` git-clone flake:** the builder reports one **vitest** failure in the
  2nd of 4 consecutive runs, passing 3 isolation re-runs (1981/1981). **Run the gate
  and report whether the suite is clean this run**; if a guard or test fails on a
  `/tmp` hardlink error, **re-run it in isolation and report both outcomes**. The
  batch's rule: grep/report the real outcome, never infer it.

## 3. The e2e

```
npx playwright test e2e/golden-path.e2e.ts
npx playwright test e2e/onboarding-resume.e2e.ts e2e/zip-radius.e2e.ts
```

Per-test results and duration for all of them, and **the `[setup]`
`e2e/auth.setup.ts` line verbatim** — that walk has broken three times in this batch;
it must still be green.

**For the two NEW resume tests, paste their titles and pass/fail individually.**
They are the entire proof of defect #22's fix, so their real execution matters more
than any other line here.

## 4. The claims worth a grep

1. **Both gate clauses, in the source.** `rg -n "kidsCardDone|photoCardDone|hasAvatarUrl" src/pages/OnboardingPage.tsx`
   → paste the hits and confirm the two gates are `!kidsCardDone && !hasKids` and
   `!photoCardDone && !hasAvatarUrl(...)` — **both clauses on each**, since the fact
   clause alone causes an infinite Skip loop.
2. **The new fixtures helper and its storage-key claim.**
   `rg -n "localStorage|access_token" e2e/fixtures.ts` → confirm it does **not**
   hard-code a single `sb-<ref>-auth-token` key.
3. **No JWT leaves the process.** `rg -n "console\.log|writeFile" e2e/fixtures.ts e2e/onboarding-resume.e2e.ts`
   → report every hit.
4. **The new spec's fixtures follow the sweep convention.**
   `rg -n "e2e-" e2e/onboarding-resume.e2e.ts | head` → the emails/names should carry
   the `e2e-` prefix the sweep sweeps.
5. **The stale docblock is still there and untouched.**
   `rg -n "do not exist yet" src/App.tsx` → confirm Slice 7's obligation survives this
   commit unchanged (do not report it as a defect; just confirm it was not silently
   fixed).
6. `git ls-files .scratch/v28/*.mjs` → must be **empty**.

## 5. Do not

Do not edit, fix, commit, run the marker sweep, or run the full e2e suite (a
batch-end lane).

## Report

```
Verified commit: <sha>   tree: clean | dirty (<what>)
f8fe01d files: <list> (expect exactly 3, +307/-3)
Gate: exit <n>
  build: <ok|fail>   test: <n files / n tests> (expect 66/1981; did 4c add any?)   lint: <n errors / n warnings> (expect 0/81 — is it 82?)
  a11y:focus: <ok|fail>   steering-lint: <ok|fail>   guards: <GUARDS line verbatim>
  guard re-run after any flake: <outcome>   flake seen this run? <yes/no/what>
e2e:
  golden-path: <per-test + duration>   auth.setup line: <verbatim>
  onboarding-resume: <both test titles + pass/fail + duration>
  zip-radius: <per-test + duration>
The gates: <the two gate expressions, quoted verbatim from the source>
readSessionFromBrowserPage: <does it hard-code one storage key? yes/no>
console.log/writeFile in the two e2e files: <hits or "none">
new spec fixtures: <the e2e- prefixed emails/names>
stale App.tsx docblock still present? <yes/no>
throwaway drivers tracked? <yes/no>
Environment failures: <or "none">
Verdict: PASS | FAIL | ENVIRONMENT_BLOCKED
```

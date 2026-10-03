# Verifier brief — V28 Slice 4b (closing verification)

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

Deterministic referee: run the real commands, paste the real output, interpret
nothing, fix nothing.

Slice 4b is **`2828952`**. A reviewer PASSED it but ran **no gate** and recorded
that the raw output tail is still owed — that is your job. Record-only commits may
sit on top; report the actual HEAD and confirm the covered paths are byte-identical
to `2828952`.

## 1. State

`git rev-parse HEAD`, `git status --short`, `git show --stat 2828952` — expect
**exactly 6 files**, +172/−97: `src/pages/OnboardingPage.tsx`, `src/App.tsx`,
`src/lib/avatarUrl.ts` (**new**), `src/lib/avatarUrl.test.ts` (**new**),
`e2e/fixtures.ts`, `e2e/auth.setup.ts`.

## 2. The gate

`npm run verify` — exit code plus **each stage separately**.

**Expected, and state whether each was met:**
- tests **66 files / 1981 tests** — the 65/1978 baseline **plus one file and three
  tests**, which is the new `avatarUrl.test.ts` sibling test. **Say whether the
  delta is fully explained** (the new module should contribute exactly 1 file and
  its `it` count).
- lint **0 errors / 81 warnings** — the 80 baseline plus the **one accepted**
  `react(set-state-in-effect)`. 4b claims **zero new warnings**; **confirm 81 and
  not 82**.
- `a11y:focus`, `steering-lint`, and the GUARDS line verbatim. If a guard fails on a
  `/tmp` git-clone error, **re-run it in isolation and report both outcomes** — that
  flake has now appeared in 2 of 4 recent runs, so say whether it recurs here.

## 3. The e2e

```
npx playwright test e2e/avatar.e2e.ts
npx playwright test e2e/golden-path.e2e.ts
```

Per-test results and duration for both, and the **`[setup]` `e2e/auth.setup.ts`
line verbatim** — this slice changed that walk again (a second Skip tap), and it is
the project every chromium spec depends on.

## 4. The claims worth a grep

1. **The bio field is really gone.** `rg -n "bio" src/pages/OnboardingPage.tsx` →
   paste every hit and confirm they are **all comments**. Then
   `rg -n "updateBio|BIO_MAX_LENGTH" src/pages/OnboardingPage.tsx` → must be
   **empty**.
2. **`hasAvatarUrl` exists and is used.** `rg -n "hasAvatarUrl" src/` → the
   definition, its test, and the use at `src/App.tsx:167`.
3. **⚠️ DEFECT #22 — confirm the finding for Slice 4c's benefit.**
   `rg -n "nextUnfinishedCard" src/pages/OnboardingPage.tsx` → must be **empty**,
   and `rg -n "kidsCardDone|photoCardDone" src/pages/OnboardingPage.tsx` → the
   flags and their gates. This is the evidence that the sequence is flag-driven.
4. **⚠️ DEFECT #23 — size the phantom.** `rg -n "settings nudge" src/` → paste every
   hit (the orchestrator measured 8 production comments plus a test title and a
   docblock), and `rg -n "missingProfileItems" src/` → confirm the **only**
   non-definition hits are a test and a comment, i.e. **no production caller**.
5. **`auth.setup.ts` touched no assertion.** `git show 2828952 -- e2e/auth.setup.ts`
   → report the **non-comment added lines** and whether any `expect(` line changed.
6. **The throwaway drivers are still untracked.**
   `git ls-files .scratch/v28/*.mjs` → must be **empty**.

## 5. Do not

Do not edit, fix, commit, run the marker sweep, or run the full e2e suite
(a batch-end lane).

## Report

```
Verified commit: <sha>   tree: clean | dirty (<what>)
2828952 files: <list> (expect exactly 6, +172/-97)
Gate: exit <n>
  build: <ok|fail>   test: <n files / n tests> (expect 66/1981; is the +1 file/+3 tests explained?)   lint: <n errors / n warnings> (expect 0/81 — is it 82?)
  a11y:focus: <ok|fail>   steering-lint: <ok|fail>   guards: <GUARDS line verbatim>
  guard re-run after any flake: <outcome>   flake recurring? <yes/no>
e2e:
  avatar: <per-test pass/fail + duration>   golden-path: <per-test + duration>   auth.setup line: <verbatim>
bio removal: <every "bio" hit in the page, classified>   updateBio/BIO_MAX_LENGTH in the page: <empty or lines>
hasAvatarUrl: <the hits>
defect #22 evidence: nextUnfinishedCard in the page <empty?>   flags: <the lines>
defect #23 size: <every "settings nudge" hit>   missingProfileItems non-definition hits: <lines>   production callers: <n>
auth.setup.ts: non-comment added lines <n>   any expect( changed? <yes/no>
throwaway drivers tracked? <yes/no>
Environment failures: <or "none">
Verdict: PASS | FAIL | ENVIRONMENT_BLOCKED
```

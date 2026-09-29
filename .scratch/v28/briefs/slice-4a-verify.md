# Verifier brief — V28 Slice 4a (closing verification)

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

Deterministic referee: run the real commands, paste the real output, interpret
nothing, fix nothing.

Slice 4a is **`83f4f58`** (the kids card + the copy-module adoption). A reviewer
passed it, but **it did not run the gate and said so** — gate evidence is your job.
The tree may be a few record-only commits ahead; report the actual HEAD and confirm
the code content is byte-identical to `83f4f58` for the covered paths.

## 1. State

`git rev-parse HEAD`, `git status --short`, and `git show --stat 83f4f58` (expect
**exactly 4 files**: `src/pages/OnboardingPage.tsx`, `e2e/fixtures.ts`,
`e2e/auth.setup.ts`, `src/lib/firstRunCopy.ts`, +217/−98). A modified tracked file
invalidates the run; untracked files do not.

## 2. The gate

`npm run verify` — exit code plus **each stage separately**: build; test (counts);
lint (**error AND warning counts**); `a11y:focus`; `steering-lint`; the GUARDS line
verbatim.

**Expected, and say explicitly whether each was met:**
- tests **65 files / 1978 tests** (4a added no unit tests — if the count moved, say
  by how much and whether it is explained)
- lint **0 errors / 81 warnings** — the 80 baseline plus the **one accepted**
  `react(set-state-in-effect)`. **Confirm it is 81 and not 82**; the builder claims
  no new warning in its changed files.

Never infer an earlier stage from a later one passing. **If a guard fails on a
`/tmp` git-clone error, re-run that guard in isolation and report both outcomes** —
that flake has now appeared twice in this batch, so report it as recurring.

## 3. The e2e — including the spec the builder had to repair

```
npx playwright test e2e/golden-path.e2e.ts
npx playwright test e2e/zip-radius.e2e.ts
```

Report per-test results and duration for both, and **the `[setup]`
`e2e/auth.setup.ts` line explicitly** — this slice changed that walk (a Skip tap
was added), and it is the project every chromium spec depends on.

**Important:** the builder reports it fixed a **pre-existing** defect where
`zip-radius.e2e.ts` passes the label `'20 miles'` while `finishSignup` interpolated
`` `${radius} miles` ``, producing `"20 miles miles"`. Confirm `zip-radius` passes
now, and report the exact label string the helper selects.

## 4. The claims worth a grep

Paste each, with a verdict:

1. **Defect #20's fix — a card reads the module.** `rg -n "FIRST_RUN_COPY"
   src/pages/OnboardingPage.tsx` → the name card (`~:394-396`) and the kids card
   (`~:475-481`) should render `title`/`body`/`primaryLabel` from it. **Is any
   hard-coded card title/body still rendered** anywhere in that file?
2. **Exactly one kids writer.** `rg -n "addKid" src/pages/OnboardingPage.tsx` →
   report every hit and classify it (import / the one DB write / local row-state
   helpers that merely share the name). **State the number of DB writes.**
3. **The corrected count.** `rg -l "finishSignup" e2e/*.e2e.ts | wc -l` and the same
   for `signUpViewer`. **The plan and a code comment said 18; the reviewer says 17.**
   Report the real numbers — this corrects a claim the orchestrator itself got wrong.
4. **The dead module field.** `rg -n "skipLabel" src/` → report every hit and say
   whether **anything outside the test** reads it. (Expected: the declaration and
   two values in `firstRunCopy.ts`, and nothing else — i.e. dead.)
5. **The stale comment this slice created.** `rg -n "no card reads FIRST_RUN_COPY"
   src/App.tsx` → paste it. It should still be present and now false (assigned to
   Slice 7). Confirm it is **not** silently fixed or deleted in this commit.
6. `rg -n "What’s your name|What's your name" src/ e2e/` → the old card title should
   survive **only** as a history comment (typographic `’` — an ASCII `'` in a pattern
   finds nothing, which has already cost the orchestrator two false greps).

## 5. Do not

Do not edit, fix, commit, run the marker sweep, or run the full e2e suite (a
batch-end lane).

## Report

```
Verified commit: <sha>   tree: clean | dirty (<what>)
83f4f58 files: <list> (expect exactly 4, +217/-98)
Gate: exit <n>
  build: <ok|fail>   test: <n files / n tests> (expected 65/1978)   lint: <n errors / n warnings> (expected 0/81 — is it 82?)
  a11y:focus: <ok|fail>   steering-lint: <ok|fail>   guards: <GUARDS line verbatim>
  guard re-run after any flake: <outcome>   flake recurring? <yes/no>
e2e:
  golden-path: <per-test pass/fail + duration>   auth.setup line: <verbatim>
  zip-radius: <per-test pass/fail + duration>    the label the helper selects: <string>
Defect #20 fix: <the FIRST_RUN_COPY render lines> — any hard-coded card title left? <yes/no + lines>
Kids writers: <every addKid hit, classified> — number of DB writes: <n>
Counts: finishSignup consumers <n>   signUpViewer consumers <n>   (expected 17)
skipLabel: <every hit> — read outside the test? <yes/no>
App.tsx stale comment still present? <yes/no — verbatim>
"What's your name" hits: <lines>
Environment failures: <or "none">
Verdict: PASS | FAIL | ENVIRONMENT_BLOCKED
```

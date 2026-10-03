# Verifier brief — V28 Slice 3c (closing verification, after fix round 1)

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

You are the deterministic referee. Run the real commands, paste the real output,
interpret nothing, fix nothing.

Slice 3c is **`5485384`** (the fix round; the original build was `0b0ad3d`). A
reviewer blocked it once (the nudge named cards the app does not ask) and the fix
addressed that. **Your job:** confirm the gate, confirm the blocking finding is
actually gone, and confirm the fix did not break what the reviewer verified.

## 1. State first

`git rev-parse HEAD` and `git status --short`, verbatim. A modified tracked file
invalidates the run; untracked files do not.

## 2. The gate

`npm run verify` — exit code plus **each stage separately**: build; test (file and
test counts); lint (**error AND warning counts**); `a11y:focus`; `steering-lint`;
the GUARDS line verbatim.

**Expected baselines and what changed:**
- tests **65 files / 1978 tests** — 1975 before this batch-plus-fix, **+3** from the
  new `FIRST_RUN_NUDGE_COPY` describe. **Say whether you observed 1978 or a
  different number**, and if different, whether the delta is fully explained.
- lint **81 warnings / 0 errors** — the 80 baseline plus **one accepted**
  `react(set-state-in-effect)` at `src/App.tsx:130` that the orchestrator
  **accepted as recorded baseline movement**. **Confirm the count is 81/0 and not
  82** — a second new warning would be a finding.
- Never infer an earlier stage from a later one passing. If a guard fails on a
  `/tmp` git-clone error, **re-run that guard in isolation and report both
  outcomes**.

## 3. The e2e — and confirm the real command

The builder's report named `e2e/golde-path.e2e.ts`, which **does not exist** (the
real file is `e2e/golden-path.e2e.ts`). Run the real one and report its output:

```
ls e2e/golden-path.e2e.ts
npx playwright test e2e/golden-path.e2e.ts
```

Report per-test results and duration. **State whether the file the builder named
exists** — if the report's path was a typo, say so, because a typo in a reported
command means that evidence was not trustworthy as written.

## 4. ⚠️ The blocking finding must be provably gone

This is the point of the lane. The nudge used to render
`FIRST_RUN_COPY[card].title` — naming cards that do not exist yet (slices 4/5/6)
and mis-naming the one card that does (`"What should we call you?"` vs the card's
`"What’s your name?"`).

Run and paste, each with its verdict:

1. `rg -n "FIRST_RUN_COPY\[|copy\.title|card\.title" src/App.tsx` → must be
   **empty**. Report empty.
2. `rg -n "FIRST_RUN_NUDGE_COPY" src/` → paste every hit, and confirm the render
   site uses only `.title` / `.body` / `.actionLabel` from the **generic** object.
3. **Paste the `FIRST_RUN_NUDGE_COPY` definition verbatim** from
   `src/lib/firstRunCopy.ts`. Confirm from the text itself that its `title` is
   card-agnostic — i.e. it does not name kids, a photo, an area, or an account.
4. **Paste the new test describe** from `src/lib/firstRunCopy.test.ts` and say in
   one line what it actually asserts. **Does it genuinely guard against a per-card
   title leaking into the nudge line** — or does it only assert the generic object
   is non-empty (which would pass even if a card title were rendered)? Read the
   assertion, do not trust its name.
5. **The name card's rendered title**, to confirm the *other* half of the finding:
   `rg -n 'title=' src/pages/OnboardingPage.tsx`. Paste it. (Note: this repo uses
   a **typographic** apostrophe `’` — an ASCII `'` in a search pattern finds
   nothing, which cost the orchestrator two false greps. Search accordingly.)
6. **Where `FIRST_RUN_COPY` is now consumed.** Run
   `rg -n "FIRST_RUN_COPY" src/ --glob '!*.test.ts'` and paste it. The orchestrator
   expects **no non-test consumer** — only comments and the definition — because
   the nudge was its only consumer and it no longer uses it. **Report what you
   see**, and say whether the export is currently orphaned in the app (pinned only
   by its own test). This is a **recorded fact for Slice 4**, not a defect: do not
   flag it as one.
7. The two stale comments the fix round was told to reword:
   - `rg -n "other callers" src/` → must be **empty**.
   - `rg -n "slice 3b" src/App.tsx` → report any hit (the nudge's comment should
     now say slice 3c). Note `App.tsx` may legitimately mention 3b for other
     reasons — report the lines and let the reader judge, do not over-claim.

## 5. Scope

`git show --stat 5485384` — the fix should touch exactly 4 files: `src/App.tsx`,
`src/lib/firstRunCopy.ts`, `src/lib/firstRunCopy.test.ts`,
`src/pages/OnboardingPage.tsx`. List anything else. Confirm
`.scratch/v28/verify-nudge-3c.mjs` is still **not** tracked
(`git ls-files .scratch/v28/verify-nudge-3c.mjs` → empty).

## 6. Do not

Do not edit, fix, commit, run the marker sweep, or re-run the builder's throwaway
driver. Do not run the full e2e suite (that is a batch-end lane).

## Report

```
Verified commit: <sha>   tree: clean | dirty (<what>)
Gate: exit <n>
  build: <ok|fail>   test: <n files / n tests> (expected 65/1978)   lint: <n errors / n warnings> (expected 0/81 — is it 82?)
  a11y:focus: <ok|fail>   steering-lint: <ok|fail>   guards: <GUARDS line verbatim>
  guard re-run after any flake: <outcome>
golden-path: <per-test pass/fail + duration> | does the builder's reported path exist? <yes/no>
Blocking finding fixed:
  card-title refs in App.tsx: <empty or the lines>
  FIRST_RUN_NUDGE_COPY definition: <verbatim>  — card-agnostic? <yes/no>
  the new test: <verbatim assertion> — does it really guard the leak? <yes/no + why>
  the name card's title=: <the line>
  FIRST_RUN_COPY non-test consumers: <the hits> — orphaned in the app? <yes/no>
  "other callers" grep: <empty or lines>   "slice 3b" in App.tsx: <lines>
5485384 files: <list>   throwaway driver tracked? <yes/no>
Environment failures: <or "none">
Verdict: PASS | FAIL | ENVIRONMENT_BLOCKED
```

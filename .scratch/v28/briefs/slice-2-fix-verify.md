# Slice 2 FIX ROUND 1 verify — BOUNDED

You are `orchestrator-verifier`. **Read the cap before anything else.**

## ⛔ THE CAP

- **Run exactly the commands listed. No scripts, no probe files, no polling, no extra investigation.**
- **Do not re-derive** anything a listed command already answers. Report and stop.
- Roughly **6–10 minutes** of commands total. Past that, stop and report what you have.
- A truthful partial report beats an overrun — the previous lane on this slice died at 30 minutes
  after authoring its own probes, which is why this brief exists.

Worktree: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, branch `Meisburg/onboarding`.
**Fix commit `2280f01`**, base `2e784d3` (the slice commit, already verified green). If HEAD differs,
say so and **check whether the difference touches source** before proceeding — that check is expected
now, and two earlier lanes did it correctly.

## 1. The gate

`npm run verify` → report the **exit code**, the `Test Files` / `Tests` counts **verbatim**, and lint
error/warning counts.

**Expected: 67 test files / 1993 tests, 0 lint errors / 81 warnings.** The fix adds
`src/lib/photoUpload.test.ts` (5 tests), so `+1 file, +5 tests` against the previous 66/1988. **Any
other delta is a finding — say so.**

**Known flake:** `scripts/guards/no-bypass-guard` fails under parallel load (a `/tmp` commit-graph
hardlink error) and passes in isolation. **Re-run once before reporting it as a failure.**

## 2. The spec that pins the fix

```
npx playwright test e2e/name-card-photo.e2e.ts
```

This spec now **holds the upload's storage POST with a page route**, asserts Continue is disabled
while the upload is in flight, releases it, and asserts the row carries the URL. Report counts
verbatim. **If it flakes on the hold/release mechanics, re-run once and report both runs** — the
builder documented a race there (release landing before the hold exists) and guards it with an
`expect.poll`; a genuine flake here matters.

## 3. The specs the fix could break

The fix changes the Continue button's `disabled` condition on the card that **17 spec files** click
through with no photo:

```
npx playwright test e2e/onboarding-resume.e2e.ts e2e/signup-zip-fallback.e2e.ts e2e/avatar.e2e.ts e2e/dm.e2e.ts
```

Report counts verbatim, per spec. **A hung or disabled Continue shows up here as a timeout.**

## Housekeeping

Kill listeners **by port**, never `pkill -f`. Headless. Never touch the human's Chrome. Confirm the
ports you used are free at the end. Leave the tree clean.

## Report

Per section: raw command, exit code, output tail. Then **Passed / Failed / Did not run** explicitly,
plus any residual risk you found. **Do not run `npm run verify` a second time**, and do not sweep
fixtures — the orchestrator owns the batch-end sweep.

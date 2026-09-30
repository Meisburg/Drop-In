# Slice 1 verify brief — the pair 1a + 1b (deterministic referee)

You are `orchestrator-verifier`. **Run the real commands and report RAW OUTCOMES. Do not judge
intent, do not fix anything, do not edit source.** Report exit codes and output tails verbatim.

Worktree: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, branch `Meisburg/onboarding`,
at commit `525fdcf` (the pair `0f745af` + `525fdcf` is one slice; the gate applies to the pair).

**Verify the tree is at `525fdcf` and clean before you start** (`git log --oneline -1`,
`git status --porcelain`). If it is not, report that instead of proceeding.

## 1. The slice gate

```
npm run verify
```

Report its **exit code** and the **verbatim counts**: test files, tests passed/failed, lint errors
and warnings. Compare against the recorded baseline: **66 test files, 1988 tests** (1989 before
1a deleted the photo-card test), **0 lint errors / 81 warnings**.

## 2. The browser lane — the walk this slice rewrote

`npm run verify` does **not** run Playwright, and the slice rewrote four e2e specs including the
shared `e2e/auth.setup.ts` and `e2e/fixtures.ts` (17 spec files call `finishSignup`). **The walks
have never been driven in a browser.** Run:

```
npx playwright test e2e/onboarding-resume.e2e.ts e2e/signup-zip-fallback.e2e.ts e2e/no-zip-notice.e2e.ts e2e/dm.e2e.ts e2e/account-links.e2e.ts
```

`dm` and `account-links` are included because they are substantial `finishSignup` consumers — if
the shared walk broke, they are where it shows. Report the pass/fail counts verbatim.

**Release any ports by port, never with `pkill -f`** (the human works on this machine — see
`docs/agents/browser-lanes.md`). Never drive the human's Chrome.

## Two known flakes — re-run before investigating

1. **`scripts/guards/no-bypass-guard`** fails intermittently under parallel load (a `/tmp`
   hardlink/commit-graph error). It passes 26/26 in isolation. The builder hit it twice today and
   it passed on a clean re-run. **Re-run once before reporting it as a failure**, and say whether
   the failure reproduced.
2. **`e2e/places.e2e.ts:2759`** is a known flake (not run above, but do not confuse it if it
   appears).

## Report

For each command: the exact command, its **exit code**, and the **tail of the output verbatim**.
Then a plain list: which checks passed, which failed, which did not run. **Do not interpret a
failure's cause** unless the output states it. If something passed, say it passed — an absence of
findings is a result, and inventing one is worse than reporting none.

# Slice 3 verify — BOUNDED

You are `orchestrator-verifier`, fresh context. **Run exactly the three checks below, once each.**

Repo: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, branch `Meisburg/onboarding`.
**Slice commit `0c08024`; base `c9ab382`.**

## ⚠️ THE BOUND, and it is not a suggestion

**Do not author probe scripts. Do not poll the database. Do not write your own bespoke test to "confirm"
a claim. Do not build a polling loop.** A previous verifier lane on this batch died at its 30-minute
timeout doing exactly that, because its brief said "confirm the headline claim yourself if you can" —
**an unbounded instruction, and the brief was the defect.** If one of the three checks cannot answer a
question, **report that the question is unanswerable by these checks** and stop. That is a complete
answer. There is nothing to invent.

## The three checks

1. **The full gate.** `npm run verify`. Report **exit code**, **test-file count**, **test count**, lint
   **error and warning counts**, and whether guards / `a11y:focus` / `steering-lint` reported PASS.
   **Expected: 67 files, 1993 tests, 0 errors / 81 warnings** — the builder reported exactly this, so
   **either it matches or it is a finding**, and either way say which.
2. **The slice's own spec.** `npx playwright test e2e/onboarding-kid-photo.e2e.ts` — report pass/fail,
   counts, duration.
3. **The two specs the changed card puts at risk.** `e2e/onboarding-resume.e2e.ts` and
   `e2e/signup-zip-fallback.e2e.ts` — this slice rewrote the kids card that both walks cross.

## Provenance

`git log --oneline c9ab382..HEAD` — confirm the range contains **no source commit beyond `0c08024`**.
The orchestrator has committed planning records since; **those touch `.scratch/` only**, so a source file
appearing there is a real finding. Verify it with `git show --stat` rather than assuming it.

## Two known flakes

`scripts/guards/no-bypass-guard` (fails under parallel load) and `e2e/places.e2e.ts:2759`. **Re-run once
before reporting either as a failure** — and say that you did.

## ⚠️ ONE SAMPLE IS NOT EVIDENCE — GREEN OR RED

**This rule was added after a brief of mine named only the two known flakes and said "re-run once before
reporting either." A lane followed it exactly, correctly found the failure was neither, and did not
re-run — so a single red sample stood as a verdict.**

- **A RED run must be re-run at least once before you report it as a failure.** One red run cannot tell a
  flake from a defect, **and the two demand opposite responses** — fix the code, or fix the test. Report
  every run's result, not a summary of them.
- **A GREEN run must not be offered as proof a fix works.** One green run is what produced the round this
  rule came from. For a fix that pins something, run it **at least three times** and report each.

**Examples below do not limit the rule. A lane follows the rule, and only the rule.**

## Housekeeping

Kill any listener you start **by port**, never `pkill -f`. **There are pre-existing human processes on
this machine that are not ours** — leave them alone, and say in your report which listeners you saw so
the next lane does not mistake them for ours.

## Report

Raw **output tails** for each check — a claim in the ledger is not evidence. Then: pass/fail per check,
exactly what differed from expectation (or "nothing differed"), and any residual risk you can name.

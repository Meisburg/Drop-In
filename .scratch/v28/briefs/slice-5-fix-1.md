# Fix round 1 — V28 Slice 5 (the suite is red, and one of the red specs is a guard)

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

Your slice is good — two things in it are worth naming before the fix. First, you
**caught your own race bug** in `zipFromAddressQueryBounded`: arming the deadline and
then cancelling the timer immediately would have **silently disabled the timeout**, so
a never-settling lookup would have stalled forever — **exactly the wall the
pending-state rule forbids** — and a **never-settling unit test** caught it rather than
the page. That is the rule working as designed; keep that test.

Second, your report **flagged a break rather than hiding it**:
`e2e/onboarding-resume.e2e.ts` will fail against the new card. **You were right, and
the orchestrator has verified it** — see below. That flag is why this is a one-round
fix and not a mystery.

## The problem

`e2e/onboarding-resume.e2e.ts` waits three times for a heading named **"Set your
location"** (`:95`, `:128`, `:179`). Verified: **that heading now survives only in the
gazetteer load-error branch** (`OnboardingPage.tsx:556-560`). The happy path falls
through to the area card (`:743-751`, `title={areaCopy.title}`,
`testId="first-run-area-card"`). **So all three waits fail.**

**Why this is not deferrable to Slice 7:** that spec is **the only regression guard
for plan defect #22** — the resume-is-a-restart bug — and it was written two slices
ago precisely because the bug was found late and cost real analysis. Leaving it red
means the guard is **dark while Slice 6 changes the ending again**. A stale comment can
ride to Slice 7; **a broken test cannot.**

**The scope decision was the orchestrator's, not yours.** The brief named
`e2e/auth.setup.ts` in scope and forgot this spec. That is the **third** time my
out-of-scope line has been wrong in the same way (`fixtures.ts` was in no slice's
scope; `auth.setup.ts` was unnamed in 4b). So the instruction below is general, not a
file list.

## What to do

1. **Fix the three waits** in `e2e/onboarding-resume.e2e.ts` so they assert what the
   flow actually shows now — the **area card** (its testid and/or the heading it
   renders from `FIRST_RUN_COPY.area`). **Keep both tests' meaning intact**: test 1 is
   "a returning parent with kids and a photo lands on the LAST step, never the kids
   card, with the kids table still holding exactly one row"; test 2 is "a fresh parent
   starts at `nextUnfinishedCard(facts)` and each Skip advances". Do not weaken either
   assertion to make it pass.
2. **Find every other spec your change breaks — by GREP, not from my list:**
   `rg -l "finishSignup|Set your location|first-run-" e2e/*.e2e.ts`
   Your own report says **`finishSignup` now walks the area card's
   unresolvable-address leg for all 17 consumer specs, and only `zip-radius` was
   verified.** That means **16 specs are expected-green but unproven.** Fix any that
   fail, and report any that fail *for a reason that is not the flow changing*.
3. **Run them.** `npx playwright test` over the specs that walk this flow — the
   `finishSignup` consumers you found plus `onboarding-resume.e2e.ts` — and **paste
   per-spec pass/fail counts.** `nice -n 19` is fine; headless always. This is the
   point of the round: **you cannot report "the suite is green" over 16 unrun specs.**
4. **The load-error branch's wording** (`OnboardingPage.tsx:559`) still reads "Set
   your location" while the step is now the area card. Align it with the card, or say
   in your report why the error state keeps the old wording deliberately.
5. **Do not touch the page's redirect guard** (`resolveOnboardingRedirect` / the
   `<Navigate>` at `:264`) — Slice 6 re-keys it (defect #19), and after your card the
   guard is what makes the finish card unreachable. Leave it exactly as it is.

## Note for your report

State the **test count and why it moved**: it went 1981 → **1982**, which is **+4 added
in `geocode.test.ts` and −3 removed from `onboarding.test.ts`** (the dead machinery's
tests) — verified by the orchestrator, but say the arithmetic yourself rather than
leaving a reader to wonder why "+4 new tests" produced "+1".

## Verify and report

```
npm run verify
<the flow-walking specs you found by grep>
```

```
Status: DONE | BLOCKED
Files changed: <path> <what and why>
onboarding-resume: <what the three waits assert now; both tests' meaning preserved?>
Specs run: <each spec + pass/fail counts; total>
Specs that failed for a non-flow reason: <or "none">
Load-error wording: <aligned, or why it stays>
Redirect guard: <confirmed untouched>
Test count: <n, with the +4/−3 arithmetic>
Gate green: yes | no
Commit: <sha>
```

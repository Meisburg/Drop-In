# Slice 2 FIX ROUND 1 review — does the fix address the findings, and did it open a new window?

You are `orchestrator-reviewer`. **Fresh context: read the diff, not the builder's prose.**
Review **`2280f01`**; its base is the reviewed-and-passed `2e784d3`. Diff: `git diff 2e784d3 2280f01`.

Worktree: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, branch `Meisburg/onboarding`.

## What this round is

The slice passed your predecessor's review with **zero defects in the diff**, and then the machine
lane (`ocr`) found a **real defect that the review missed**. The findings, verbatim, are the
acceptance criteria for THIS round — judge the fix against these words, not against the builder's
summary:

> 1. **`OnboardingPage.tsx:671` [medium]** — Nested ternary is prohibited by the project rules. Extract a small helper so the three-state label reads as an if/else chain.
> 2. **`OnboardingPage.tsx:240` [low]** — `photoUploading` duplicates the `busy` flag `useCropStep` already returns. You can drop this state and use `photoCrop.busy` for both the label and `disabled`, keeping a single source of truth.
> 3. **`e2e/name-card-photo.e2e.ts:218` [low]** — The new file ends without a trailing newline.
> 4. **`OnboardingPage.tsx:563` [low]** — In-flight upload race: Continue is only disabled on `handleBusy`, so a parent who confirms the crop and clicks Continue while `uploadAvatar` is still running creates the row with `avatar_url` NULL, and the resolved upload sets state nothing reads again — the photo becomes an orphaned object, silently lost.

## Questions to answer

1. **Are all four actually addressed?** For each, the specific line or its absence.
2. **Is the gate's decision correct?** `photoUploadBlocksContinue(inFlight, waitExpired)` has a
   4-case table (`src/lib/photoUpload.test.ts`). Check the table against the RULING: a **failed**
   upload must not gate; an **in-flight** upload must; and the gate carries a bounded escape.
3. **⚠️ THE QUESTION I MOST WANT ANSWERED — did the fix move the defect rather than close it?**
   After the 10 s escape fires, the upload may **still be in flight** while the gate is open. If the
   parent then taps Continue, the row is created **without** the photo, and the late resolution sets
   state nobody reads — **the same orphan window, reopened**. Judge whether that is acceptable.
   My reasoning, which you may overturn: the *silence* was the defect, not the loss — the escape
   surfaces a photo error first, so the parent is told, and the photo is optional. **But verify that
   the error genuinely surfaces and that the gate genuinely opens**, and say if the trade is wrong.
4. **Does the fix reset `photoGateEscaped` on settle?** A flag that latches true would leave the gate
   permanently open, or worse, permanently closed on the next photo.
5. **Is the new lib module build-law-correct?** `src/lib/photoUpload.ts` ships a sibling test, and
   the rule is pure/injected — the page composes, `lib/` decides.
6. **Are the load-bearing identifiers still intact** — `first-run-name-card`, `given-name`,
   `family-name`, `/^Continue/`, `first-run-finish-card`, `Go to your feed`? **And critically: the
   gate now touches the Continue button that 17 spec files click with no photo** — confirm that
   `photoCrop.busy` is false in the no-photo case so `signUpViewer` is unaffected. That is the way
   this fix could break the whole suite.
7. **The builder's own declared residual:** the 10 s escape is pinned by the lib test only, not
   e2e, because a 10 s wait is too slow for a spec. Is that acceptable, or does the escape need
   browser-level proof?
8. **Report vs diff, honestly.** The builder also self-caught an unescaped apostrophe in a test name
   that `tsc -b` caught. Anything else the report describes loosely?

## Report format

- **Verdict: PASS | NEEDS_CHANGES | BLOCKED.**
- Findings with **file:line** and whether each blocks.
- Answer Q3 explicitly — it is the one I am least sure of.
- Say whether any finding repeats a previous round's class, **and check it against the PRE-slice
  state (`2e784d3`)** before declaring a recurrence — the last round's base-selection error is why
  that check is now explicit.

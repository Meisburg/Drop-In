# Slice 1 review brief — the pair 1a + 1b (fresh context, read-only)

You are `orchestrator-reviewer`. **Fresh context. Edit nothing. Commit nothing.** Every finding
carries `path:line`.

Worktree: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, branch `Meisburg/onboarding`.

## What you are reviewing

**The diff range `e252f01..525fdcf`** — two commits that this plan rules ONE slice in two parts:

- `0f745af` slice 1a — `src/lib/firstRun.ts` + its test: `'photo'` removed from `FirstRunCardId`
  and `FIRST_RUN_CARDS`, `hasPhoto` removed from `FirstRunFacts`, `isSkippable` now kids-only,
  `progressLabel` emits "N of 4".
- `525fdcf` slice 1b — every call site: the photo card deleted from `OnboardingPage.tsx`,
  `hasPhoto` dropped in `App.tsx`, the copy module's `photo` entry deleted, the "of 5" sweep in
  src + four e2e specs, and the resume spec's checkpoint re-pinned.

Read first: `plan.md` §6 slice 1 (including the ruling that 1a/1b are one slice and the gate
applies to the pair), `.scratch/v28/briefs/slice-1a-r2.md`, `.scratch/v28/briefs/slice-1b-r2.md`,
and the two builder reports under `.scratch/v28/reports/`.

## The question you are answering

**Does the diff match the PLAN SLICE — intent, scope, completeness?** You are the authority on
"right", not on "works" (a separate lane runs the commands).

## Check these specifically, and cite lines either way

1. **Is the four-card walk coherent end to end?** One `'photo'` reference left behind — in state,
   JSX, a gate, an import, a helper, or a comment that now lies — is a finding. `noUnusedLocals`
   catches imports; it does not catch a handler that is now unreachable or a comment that
   describes a card that does not exist.
2. **Are the rewritten resume assertions genuinely testing RESUME, or are they vacuous?** The
   photo card *was* the resume checkpoint. This batch has already found the vacuity class three
   times, so "the assertion passes" is not the bar — **would it fail if resume were broken?**
   Read `e2e/onboarding-resume.e2e.ts` closely and say what each rewritten assertion actually
   proves.
3. **Is anything from the deleted photo card LOST that slice 2 cannot recover?** Slice 2 re-homes
   the photo onto the name card. The crop hook, the upload call, the error handling and the
   pending state were deleted here — report exactly what remains in the diff (e.g. in git
   history) and what is simply gone.
4. **Did the "of 5" sweep touch anything it should not have?** The trap is documented: star
   ratings in `reviews.ts`, `reviews.test.ts`, `PlaceDirectory.tsx`, `PlaceDetailsPage.tsx`, and
   an unrelated `hasPhoto` local at `src/lib/places.ts:1070`. Confirm they are untouched, or
   report it.
5. **Scope discipline.** `src/components/FinishRunCard.tsx` was edited although it is not in 1b's
   declared file list. Say whether that edit is a legitimate stale-claim fix or scope creep, and
   whether anything else moved outside the declared scope.
6. **Does the type still hold?** `FIRST_RUN_COPY` is `Record<FirstRunCardId, FirstRunCardCopy>`.
   With four cards, does it have exactly four keys, and does its test assert the full key set (a
   test that merely checks four *specific* keys passes just as happily when a fifth is added —
   say whether that distinction is actually enforced).

## Verdict

**`PASS` | `NEEDS_CHANGES` | `BLOCKED`**, then findings ranked, each with `path:line`, what is
wrong, and why it matters. If you find nothing, say so plainly — a clean review is a valid
result, and inventing a finding to look useful is worse than reporting none.

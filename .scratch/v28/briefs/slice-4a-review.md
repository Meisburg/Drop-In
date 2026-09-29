# Review brief — V28 Slice 4a at `83f4f58`

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

You are a fresh-context reviewer. Judge **only** `83f4f58`'s diff against
`plan.md`'s **Slice 4a** and the contract below. Read `plan.md` Slice 4a and
`docs/agents/code-structure.md`. Do not edit, fix, commit, or run the gate.

**Scope:** 4 files, +217/−98 — `src/pages/OnboardingPage.tsx` (the kids card +
copy adoption), `e2e/fixtures.ts`, `e2e/auth.setup.ts`, `src/lib/firstRunCopy.ts`.
`auth.setup.ts` **is in scope by name** (supervisor ruling: it inlines the walk,
so the new card broke the setup project); `firstRunCopy.ts` should be
comment-only. Anything else is a finding.

The slice does two jobs: **the kids card** (card 3 of 5, first name + age, working
Skip) and **the cards start rendering `FIRST_RUN_COPY`** (defect #20's fix — the
module was previously read by nothing).

## Answer these, each with file:line evidence

1. **The kids card's correctness.** Skip must advance writing **nothing**;
   Continue must validate via the existing `validateKid` seam (including its
   **blank-row skip**) and write through `addKid`, which enforces
   `MAX_KIDS_PER_PROFILE`. Trace the actual path and say whether each holds. Does
   a write failure stay on the card with a `role="alert"` error and **never trap
   the run** (is Skip still available)?

2. **⚠️ EXACTLY ONE KIDS WRITER.** The builder claims `handleContinue` "no longer
   touches kids" and the family block is now photo + bio only. Verify from the
   diff. **`rg -n "addKid|kids" src/pages/OnboardingPage.tsx`** and classify every
   hit: is there any second path that can write kids (the location page's Continue,
   a resume, a retry), and could a parent end up writing kids twice or losing them?
   This is the failure mode that made 2a necessary — a guard is only as complete as
   the grep for the CALL SITES.

3. **The copy adoption — is the module genuinely the single source now?** Confirm
   both cards render `title`/`body`/`primaryLabel` from `FIRST_RUN_COPY`, and that
   the name card's hard-coded `"What’s your name?"` is gone (only a history comment
   should remain). Then **find any card copy still hard-coded** in the page —
   including the `handleBusy ? 'Please wait…' : …` busy label: is a transient
   busy label acceptable, or does it belong in the module too? Say which.

4. **The wording change.** The builder chose the module's wording
   (`"What should we call you?"`) over the card's (`"What's your name?"`) because
   the module is the tested artifact. Is that sound? **Does any spec, fixture or
   assertion still pin the old wording** — which would now be a broken test rather
   than a deliberate change? Grep for both strings.

5. **⚠️ THE `radiusMiles` WIDENING — judge it.** `e2e/fixtures.ts` widened
   `radiusMiles?: number` to `number | string` to fix a pre-existing "20 miles
   miles" defect (`zip-radius.e2e.ts` has always passed the full label
   `'20 miles'`). Read the new branch logic and rule: is this a **legitimate
   documented union** that preserves both forms, or a **loosening** that would mask
   a genuine misuse (e.g. a typo'd label silently becoming the selector text)? The
   builder claims it predates V28 — **verify that against `git show a0e93f2`** if
   you can, and say whether the fix belongs in the helper or in the caller.

6. **⚠️ VERIFY THIS FINDING OF MINE, IN BOTH DIRECTIONS.** The orchestrator
   believes `src/App.tsx:86` is now **stale**: it says something like "today no
   card reads `FIRST_RUN_COPY` — the cards hard-code their own", which was true
   when 3c's fix round wrote it and **became false when this slice landed**.
   **Quote the comment verbatim, and state whether it is now false.** If it is
   false, note that `App.tsx` was out of this slice's scope, so it is a **Slice 7
   obligation**, not a 4a defect. If the orchestrator is wrong, say so plainly —
   a false finding from the orchestrator must be rejected as readily as one from a
   builder. The general question worth answering: **what other comment in this
   diff asserts a fact about the codebase that this change may have expired?**

7. **The kids write path has no e2e.** The builder reports that all specs walk
   **Skip**, so the write path (fill rows → Continue → `addKid`) is proven only by
   the unit-tested seams it reuses plus code review. Confirm that from the specs,
   and say whether that gap is acceptable for this slice or must be closed.

8. **The resume/nudge facts still line up.** `nextUnfinishedCard` reads `hasKids`.
   After this slice, is `hasKids` derivable from the same source the card writes
   (a `kids` row), so the nudge's view cannot disagree with the card? Note: a
   **skipped** kids card leaves `hasKids` false, so the resume may point back at
   kids — is that the intended "never a wall, up to two extra taps" behaviour, or
   a loop? Reason it through.

9. **Scope, and leftovers.** Exactly the 4 files? Is `src/lib/firstRunCopy.ts`
   really comment-only (`git show 83f4f58 -- src/lib/firstRunCopy.ts` should show
   no change to any string value)? Any stray `console.log`, TODO, dead code, or an
   uncited claim in a comment this diff does not support? Also: the builder
   reported a stale preview server on port 4173 contaminating one run — is there
   any evidence of that leaking into the committed state (a generated file, a
   config change)?

## Verdict

`PASS` | `NEEDS_CHANGES` | `BLOCKED`, plus every finding as
`file:line — what is wrong — why it matters — how you would fix it`, marking each
**blocking** or **non-blocking**. Write down accepted residuals with their ruling
rather than dropping them. If you cannot prove something from the diff, say so.

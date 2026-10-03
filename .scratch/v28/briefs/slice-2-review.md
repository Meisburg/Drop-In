# Slice 2 review — the parent's photo joins the name card, and the two copy defects

You are `orchestrator-reviewer`. **Fresh context: read the diff and the plan, not the builder's
prose.** Review commit **`2e784d3`** (the slice); its base is `aac2bab`.

Worktree: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, branch `Meisburg/onboarding`.
Plan: `plan.md` §6 slice 2. Brief: `.scratch/v28/briefs/slice-2.md`.

**The slice's own history matters to your review:** its file list had to grow MID-FLIGHT (the
orchestrator blessed `src/lib/db.ts`), because the plan originally forbade the only correct change.
Read the plan's "SCOPE RULING" block in slice 2 before you judge scope.

## What the slice claims

1. The parent's photo re-homes onto the name card; the crop step runs on **confirm**, and Continue
   never waits on an upload.
2. `createProfile` gains an **optional** second parameter (`avatarUrl`), so the row is created
   carrying the URL — because the name card renders only when `profile === null`, there is no row
   at crop-confirm time, and `uploadAvatar`'s `avatar_url` UPDATE silently matches **0 rows**
   (`db.ts:2663-2666`). That no-op is now **load-bearing** and should be commented as such.
3. Both r2-D4 copy defects fixed: the handle-taken hint no longer advises a middle name/initial
   (a field the card does not render), and the name body no longer says "A first name is plenty"
   directly above a Last name field.
4. `hasAvatarUrl` has no legitimate use here (the card renders only when `profile === null`) and
   stays a dead export for slice 8.

## Questions to answer

1. **Does the diff satisfy the plan's six acceptance criteria** — particularly #1 proven
   end-to-end, and **a failed upload never gating Continue** (the pending-state rule)?
2. **Is the `createProfile` change safe?** The parameter is optional, the idempotent
   `23505 → getProfile` path must be untouched, and **the call site count must still be one**
   (`OnboardingPage.tsx`, measured at `:563` pre-slice). If a second caller exists, say so.
3. **The brief's zero-hit criterion is deliberately SCOPED, because its blanket form was itself a
   defect.** `rg -n "middle name|middle initial" src/pages/OnboardingPage.tsx` must be **0 hits**,
   while `src/lib/oauth.ts` and `src/lib/oauth.test.ts` must be **byte-identical**. Verify both
   halves — a builder that swept the innocent files would be wrong even if the defect disappeared.
4. **Is `e2e/name-card-photo.e2e.ts` (new, 219 lines) non-vacuous?** It is the slice's answer to
   acceptance #1 and doubles as the db seam's only test home (`createProfile` has no unit coverage).
   Does it actually assert **the object in the bucket** AND **the created row carrying the `?v=`
   URL** — i.e. would it fail if the URL never reached the insert? Name the assertion.
5. **Scope discipline.** `src/lib/db.ts` was blessed. **`e2e/name-card-photo.e2e.ts` was NOT in the
   brief** — the builder added it because condition 4 required the seam's sibling test and e2e is
   `createProfile`'s only coverage. Judge whether that was necessary, and say if it was not.
6. **The traps must be intact:** all star-rating `of 5` sites (`src/lib/reviews.ts`,
   `reviews.test.ts`, `PlaceDirectory.tsx`, `PlaceDetailsPage.tsx`), `InboxPage.tsx`'s note,
   `src/lib/places.ts`, and the `hasAvatarUrl` **export** (its test file changed comments only —
   judge whether that is a change the slice owed).
7. **The name card's load-bearing selectors** — `data-testid="first-run-name-card"`,
   `autoComplete="given-name"`, `autoComplete="family-name"`, and a `primaryLabel` matching
   `/^Continue/` — are what 17 spec files ride. Confirm they are unchanged.
8. **Report vs diff, honestly.** The builder's report says `hasAvatarUrl` is "Untouched", but
   `src/lib/avatarUrl.test.ts` changed 4/−3 (a docblock rewrite explaining that the `hasPhoto` fact
   died with the photo card). Substantively the export IS untouched. **Judge whether the report's
   description is good enough, and say so plainly** — this is the second slice in a row whose report
   under-describes a comment-only edit, and I want to know if that is a pattern worth a guard.

## Report format

- **Verdict: PASS | NEEDS_CHANGES | BLOCKED**, and why in one paragraph.
- Findings, each with **file:line**, severity, and whether it blocks.
- **State explicitly whether any finding repeats a previous round's class**, and whether you checked
  it against the pre-slice state (`aac2bab`) rather than assuming the slice caused it — the last
  review round's `ocr` findings were 3-of-4 pre-existing, and that check is now expected.
- Write your report into the worktree AND the artifact dir if you can; the worktree copy is the one
  I can commit.

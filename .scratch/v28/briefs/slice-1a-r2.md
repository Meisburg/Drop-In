# Slice 1a — the first-run model loses `photo`, the denominator becomes 4

You are `orchestrator-builder`. **Read `docs/agents/code-structure.md` before writing anything**
— it is the build law (domain logic in `src/lib/` as pure functions, React renders and does not
decide, every `lib/*.ts` ships a `lib/*.test.ts` sibling).

Worktree: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, branch `Meisburg/onboarding`.
**Read `plan.md` section 6, slice 1a** — this brief is a pointer, not a replacement.

## Why this slice exists

The human walked the built first run on a phone and decided the standalone **photo card should
not exist** — a parent's photo belongs on the name card, where they are already typing. The
card sequence becomes `account → name(+photo) → kids(+kid photo) → area(+map) → How Drop In
works`. This slice changes **only the pure model and its test**. Call sites come next, in 1b.

## Files in scope

- `src/lib/firstRun.ts`
- `src/lib/firstRun.test.ts`

**Do not touch anything else in this slice.** `src/pages/OnboardingPage.tsx`,
`src/App.tsx`, `src/pages/LoginPage.tsx` and the e2e specs are **slice 1b's** scope — the
build stays green in 1b, which is why the wide mechanical sweep is separated from this.

## The current shape (measured — verify, do not trust)

- `FirstRunCardId = 'account' | 'name' | 'kids' | 'photo' | 'area'` — `src/lib/firstRun.ts:15`
- `FIRST_RUN_CARDS` — `:17`
- `FirstRunFacts` includes `hasPhoto` — `:26`
- `isSkippable` returns true for `kids` and `photo` — `:35`
- `nextUnfinishedCard` has an explicit photo branch — `:62`
- `progressLabel` emits `"N of 5"` — `:74`
- Pinned by: the array equality `src/lib/firstRun.test.ts:103`; `progressLabel` 1..5
  `:191-195`; the photo branch `:133-135`

## What to do

1. Remove `'photo'` from the union **and** from `FIRST_RUN_CARDS`.
2. Remove `hasPhoto` from `FirstRunFacts` and the photo branch from `nextUnfinishedCard`.
   `nextUnfinishedCard` now walks four cards.
3. `isSkippable` is true for **`kids` only**.
4. **`progressLabel` ALREADY derives its denominator from `FIRST_RUN_CARDS.length`**
   (`src/lib/firstRun.ts:74`) — **your job is to keep it that way, not to add it.** r2 is exactly
   the change a hard-coded `5` would have silently broken, so the work is to *keep* the invariant
   and prove it still holds after your edit.
5. Update the test to pin the new reality: the four-card array, `1 of 4` … `4 of 4`, and that
   `kids` is still skippable while `account`, `name` and `area` are not.
   ⚠️ **Do NOT touch `src/lib/firstRun.test.ts:206`** (`"const label = '2 of 5'"`). It looks like
   the label and it is not: it is a **fixture string fed to the purity scanner** to prove prose is
   out of scope. Changing it breaks a different test's premise. Likewise `reviews.ts`,
   `reviews.test.ts`, `PlaceDirectory.tsx` and `PlaceDetailsPage.tsx` contain `"out of 5"` **star
   ratings** — not yours, and never yours.

## Acceptance criteria (each one checkable)

- `progressLabel('area') === '4 of 4'` and `progressLabel('account') === '1 of 4'`.
- `'photo'` appears **nowhere** in `src/lib/firstRun.ts` — not in the union, not in the array,
  not in a branch, not in a comment.
- `hasPhoto` appears **nowhere** in `src/lib/firstRun.ts` or `src/lib/firstRun.test.ts`.
- `isSkippable('kids') === true`; `isSkippable('account' | 'name' | 'area')` all `false`.
- The denominator is provably derived: **delete a card from `FIRST_RUN_CARDS` in a scratch
  check and confirm the label follows** — then restore it. Say in your report that you did this.
- The file still has a sibling test, and that test fails if you revert your source change
  (**state in your report how you know it is not vacuous** — this repo has been bitten by
  assertions that cannot fail).

## Verification command

```
npm run verify
```

Report the **exit code** and the **test counts** verbatim (baseline to compare against:
66 test files / 1989 tests, 0 lint errors / 81 warnings). A count that changed for a reason
outside this slice is worth flagging.

## Budget

**Small.** One local builder context. If this needs more than the model file and its test,
stop and report — it means the scope read is wrong.

## Report back

Structured: what changed, the verification output tail, the acceptance-criteria results **one
by one**, anything you could not satisfy, and any fact in this brief you found to be **wrong**.
A wrong fact in the brief is a finding, not a failure on your part.

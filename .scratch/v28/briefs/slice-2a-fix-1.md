# Fix round 1/5 — V28 Slice 2a (two missed write paths + one predicate defined twice)

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

You built Slice 2a at `418ed10`. A fresh-context reviewer read the diff
(verdict **PASS**, two minor findings) — but its second finding is substantively
blocking, so it becomes your work. The orchestrator has verified both findings
independently and amended `plan.md` → Slice 2a; **read that slice again.**

## Why this must land BEFORE Slice 2b

2b removes the app-wide location wall and hands the requirement to the guards you
wrote. A guard is only worth the paths it covers. Two write paths are currently
unguarded, so after 2b they would proceed with no location at all — exactly the
regression Slice 2a exists to prevent.

## Finding 1 (blocking) — two write paths with no guard

Verbatim from the review:

> two second going-ping write call sites (series "Same time next week" and the
> feed-card toggle) carry no zip guard; neither is in any slice's scope (2b =
> onboarding.ts/App.tsx; 2c = feed state). Unreachable while the wall stands, but
> after 2b both proceed with home_zip unset — exactly the regression 2a exists to
> prevent, and the plan's own handover test ("any write path that proceeds with
> home_zip unset") would fail on them.

Verified by the orchestrator — `togglePing(` has **three** call sites in pages,
not one, and `createPlaydate(` has one:

| call site | guarded today |
|---|---|
| `PlaydateDetailPage.tsx:906` (`handlePingToggle`) | yes |
| `PlaydateDetailPage.tsx:1068` (`handleSameTimeNextWeek`) | **no** |
| `FeedPage.tsx:786` (`handleCardPingToggle`) | **no** |
| `NewPlaydatePage.tsx:1177` (`handleSubmit`) | yes |

**Fix:** guard the two missing call sites with the same notice and the same
predicate. Same SET/CLEAR nuance applies where a toggle has an off direction:
`FeedPage.tsx:786` computes `willBeActive` before writing, so block only the
*set* direction and never block a clear. `handleSameTimeNextWeek` only ever sets
(`alreadyGoing ? true : await togglePing(nextId)`), so block the whole action
when the zip is unset.

**This was the orchestrator's grounding error, not yours** — the brief said "the
going-ping action" (singular) because it grepped handler names instead of the
write function's call sites. The check that closes it is a grep, and you must
report it (below).

## Finding 2 (blocking here, minor in isolation) — the predicate is written twice, and the two disagree

Verbatim:

> the gate's derivation treats `home_zip === ''` as UNSET (`!= null && !== ''`);
> the new guards' `== null` treats '' as SET. […] at the 2b handover the wall's
> stricter ''-exclusion is dropped; a '' home_zip (hand-edited DB or a future
> write path) would silently pass both guards.

**Fix:** define the predicate **once**, per the build law (domain logic in
`src/lib/` as a pure function, shipping a sibling test):

- New `src/lib/homeZip.ts` exporting
  `hasHomeZip(zip: string | null | undefined): boolean`.
- **Semantics: replicate the gate's exact existing semantics** —
  `zip != null && zip !== ''`. Do **not** add trimming, and do not add new
  validation; changing what counts as set would change the gate's behaviour, which
  is out of scope.
- New `src/lib/homeZip.test.ts` pinning: `null`→false, `undefined`→false,
  `''`→false, `'98101'`→true, and the `''`-is-unset case specifically, since that
  is the entire reason this module exists.
- Use it at **every** site that tests a home zip for presence, so no class of
  drift can recur: the gate derivation (`src/lib/db.ts:266`), both existing
  guards and both render re-checks in the pages you touch, the two new guards,
  and the display-only map-pin checks (`FeedPage.tsx:399`,
  `NewPlaydatePage.tsx:911`, `BrowsePage.tsx:324`). Each is a one-line change and
  behaviour-identical for every value except `''`.

## Also required in the report — two greps, as evidence

1. `rg -n 'togglePing\(|createPlaydate\(' src/pages/` — must return **four**
   call sites, each inside a `hasHomeZip` guard. Paste the output.
2. `rg -n "home_zip == null|home_zip != null|home_zip !== ''" src/` — must
   return **no hits outside `src/lib/homeZip.ts` and its test**. Paste the output.

If either grep does not come back clean, you are not done.

## Keep

The SET/CLEAR nuance already implemented in `handlePingToggle`, the
`LocationRequiredNotice` component (the reviewer confirmed it is genuinely
presentational), and the self-clearing render conditions. Do not rework them.

## Out of scope

`src/lib/onboarding.ts` (that is 2b — **the wall stays up**), `src/App.tsx`,
`e2e/`, `plan.md`, `task-state.md`, `.scratch/v28/ledger.md`, `.opencode/`.

## Verify and commit

```
npm run verify
npx playwright test e2e/golden-path.e2e.ts
```

Paste the real output tails. **If `golden-path` fails, report it — do not edit
the spec.** Scoped `git add`. Commit only when green:

```
V28 slice 2a fix 1/5: guard every ping write path, define hasHomeZip once
```

Do **not** push.

## Report back

```
Status: DONE | BLOCKED
Files changed:
  - <path> <what changed and why>
Commands run:
  - <command> -> <result>   (real output tails)
Grep 1 (write call sites, all guarded): <output>
Grep 2 (predicate written once): <output>
Gate green: yes | no
Commit: <sha>
Risks: <or "none">
Unresolved questions: <or "none">
```

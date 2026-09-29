# Reviewer brief — V28 Slice 2c (the no-zip state is honest)

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

Fresh context. You are the independent judge. Every finding must cite
`file:line`. Do not fix anything.

## The diff

Slice 2c is commit **`549c2e9`** (parent `655b59b`) on `Meisburg/onboarding`:
`git show 549c2e9`. Three files: `src/components/RadiusEmptyState.tsx` (the
behaviour), `src/pages/FeedPage.tsx` and `src/lib/feed.ts` (both declared
comment-only — **verify that claim**).

## The intent it must satisfy

`plan.md` → Slice 2c. Measured background: `src/lib/db.ts:582` returns `[]` for
a null viewer zip, so a no-zip parent's feed emptied into `RadiusEmptyState` with
**every escape disabled** and the post CTA suppressed — a lie whose only controls
were inert. Slice 2b is what made that reachable. The chosen fix is an early
return inside `RadiusEmptyState` rendering the shared `LocationRequiredNotice`.

## Questions — answer each, with citations

1. **Is the early return correct and complete?** Read
   `src/components/RadiusEmptyState.tsx` in full. Are all `useState`/hook calls
   above it (hook order)? Does the condition `profile !== null &&
   !hasHomeZip(profile.home_zip)` catch exactly the state that was broken, and
   nothing else? Is `hasHomeZip` the right predicate rather than a raw null check?
2. **What renders while the profile is still loading** (`profile === null` on a
   no-zip parent)? The builder says the `profile !== null` half deliberately
   keeps the in-flight state on the OLD render. **Is that honest, or does it
   briefly show the radius lie to the exact parent this slice exists for?** If
   the in-flight window can show "Nothing within N miles yet." to a parent who
   has no location, say so — and say whether it matters.
3. **Is the zipped path really byte-identical?** Diff the rendered JSX and every
   value it reads (`escapes`, `escapesDisabled`, `busyRadius`, `escapeError`,
   `showEscapes`, `showPostCta`) against the parent commit. Report any change,
   including ordering or a recomputed value.
4. **Do BOTH callers actually reach the early return?** The builder traced
   Browse's path as: `BrowsePage`'s `viewerRadius` is non-null even with no zip →
   every place's distance is null → `placed.length === 0` → `planDirectoryList`
   sets `radiusIsTheReason` → `radiusReason` → `PlaceDirectory.tsx:1117` renders
   `RadiusEmptyState` → early return. **Verify that trace line by line, or refute
   it.** Name any OTHER render path that produces `RadiusEmptyState` (or a
   radius-empty message) for a no-zip parent without passing through this early
   return.
5. **Is the reused copy right for this surface?** `LocationRequiredNotice` was
   written for **write** sites (slice 2a — the ping and the post). On the feed
   and on Browse nobody is trying to write; they are browsing. Read its copy and
   the `/onboarding` link it carries. **Does it read correctly on a browse
   surface, or does it describe an action the parent was not attempting?** If it
   does not fit, say what you would do — but note the plan pins reuse over new
   copy, so a change needs a reason.
6. **Stale claims.** The slice declares three fixed (`FeedPage.tsx:491`,
   `RadiusEmptyState.tsx:79-86`, `feed.ts:49`). Grep the three files for any
   surviving claim of the deleted gate or of the no-zip state being unreachable.
   The builder also flagged `src/lib/db.ts:577-578` as still stale and left it
   to Slice 7 — **is leaving it correct, and is its line reference accurate?**
7. **The untested branch.** The builder states plainly that the new branch has
   **no unit lane** (60 test files, all `.ts`, zero `.tsx`) and no no-zip e2e
   fixture until 3b. **Verify that claim** — is there truly no existing test lane
   that could cover this branch (a `.ts` seam, an existing fixture, a way to
   unit-test the decision rather than the render)? If one exists, that is a
   finding.

## Verdict

```
Verdict: PASS | NEEDS_CHANGES | BLOCKED
Findings:
  - <severity> <file:line> — <the defect> — why it matters: <the consequence>
Evidence checked: <files read, greps run>
Residual risks: <what you could not check>
```

`NEEDS_CHANGES` requires at least one cited finding. Do not invent citations — a
finding whose evidence you have not read is worse than no finding. **If you
disagree with a premise in this brief, say so and cite the code.** You are not
required to be polite.

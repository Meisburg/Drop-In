# Slice 2c — The no-zip state is honest (feed **and** Browse)

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

Read `plan.md` → Slice 2c first — **the orchestrator rewrote it after measuring,
so read it fresh rather than from memory.** Then `docs/agents/code-structure.md`.
Slice 2b is complete at `f6bf406`: the app-wide onboarding wall no longer
redirects, which is what makes this slice necessary.

## What a no-zip parent sees TODAY (measured, not assumed)

- `src/lib/db.ts:582` — `if (viewer.homeZip === null) return []`. The feed query
  returns an **empty list**.
- So `posts.length === 0` fires and `RadiusEmptyState` renders — with copy
  derived from the radius ("Nothing within N miles yet."), **every escape button
  disabled** (`escapesDisabled`, because there is no zip to widen from) and the
  post CTA suppressed (`showPostCta={false}`).

That is a **lie whose only controls are inert** — exactly the "second dead end
wearing a control's clothes" that `RadiusEmptyState`'s own doc says it exists to
remove. Before slice 2b the wall kept a no-zip parent off these pages entirely,
so this was unreachable. **2b made it reachable.** That is this slice.

## The fix — one early return, in `RadiusEmptyState`

When `!hasHomeZip(profile?.home_zip)`, `RadiusEmptyState` returns
**`<LocationRequiredNotice />`** (from `src/components/LocationRequiredNotice.tsx`,
built in slice 2a). **Reuse it — do not write new copy and do not create a second
notice component.** It is presentational, already carries the right sentence, a
real `/onboarding` link, the 44px floor and a focus cue.

With a zip present, render **exactly** what the component renders today.

### Why inside the component, not before it

`RadiusEmptyState` has **two** callers:

- `src/pages/FeedPage.tsx:1269`
- `src/components/PlaceDirectory.tsx:1117` — **Browse**, reached via
  `radiusReason`, which fires for a no-zip parent precisely because every place's
  distance is null.

Branching in `FeedPage` alone would fix the feed and leave **Browse's identical
dead end** standing. The component's own doc already claims to be *"ONE
implementation for the feed ("Near you") and Browse"*, and it already reads
`profile.home_zip` for `escapesDisabled` — so the no-zip case is already its
business. One early return fixes both, and no future caller can miss it.

**Verify Browse by construction, don't assume it.** In your report, name how you
checked that `PlaceDirectory`'s path now renders the notice — e.g. grep the two
call sites, or drive `/browse` for a no-zip viewer if you can. If you cannot
verify it, say so rather than claiming it.

## Three stale claims, all in your files

1. `src/pages/FeedPage.tsx:491` — *"The shell's onboarding gate keys on home_zip,
   so a settled signed-in session here has a zip"*. False; that is the whole
   premise of this slice.
2. `src/components/RadiusEmptyState.tsx:79-86` — the comment calls the no-zip
   guard *"belt-and-braces, not a flow"* because *"the shell's onboarding gate
   keeps that state off these pages"*. **It is a flow now.** Rewrite it to say
   what is true — and note that with the early return the disabled-escape guard
   remains only for the `session === null` case.
3. `src/lib/feed.ts:49` — `RadiusViewer`'s doc: *"`homeZip` null = not set (the
   onboarding gate keeps that state out of the feed; the filter itself treats it
   as \"no posts\")"*. The first half is false. **Comment only — no behaviour line
   in `feed.ts` may move.**

## Do NOT

- Do not change `listRadiusFeed`'s `return []` — the empty list is correct; the
  *rendering* was the lie.
- Do not change what a zipped parent sees. That path must be byte-identical,
  including the escape buttons, `busyRadius` and `escapeError`.
- Do not add a wall: no modal, no redirect, no blocking. The feed stays
  reachable and ignorable (decision 3, ADR 0001).
- Do not touch `PlaceDirectory.tsx` — the inside-the-component branch is what
  keeps it out of scope.

## Known gap you must report on

This branch has **no unit lane**: the repo has 60 test files and **all are
`.ts`** — there are zero `.tsx` tests, so a component branch cannot be
unit-tested here. The coverage is assigned to Slice 7's new no-zip e2e, which the
plan now requires to assert `location-required-notice` renders and
`empty-radius-state` does not. **State this gap plainly in your report** rather
than implying the change is test-covered.

## Verify

```
npm run verify
npx playwright test e2e/zip-radius.e2e.ts
```

`zip-radius` exercises only a **zipped** marker, so it is the regression proof
that the zipped path is untouched — it will not exercise your new branch.
Report the lint warning **count** against the **80-warning / 0-error baseline**,
and the test counts against the current **65 files / 1975 tests**.

## Commit

Scoped `git add`. Only when green:

```
V28 slice 2c: a no-zip parent gets an honest state, not a dead end
```

Do not push.

## Report

```
Status: DONE | BLOCKED
Files changed:
  - <path> <what and why>
Commands run:
  - <command> -> <result>   (real tails; lint count vs 80 baseline; test count vs 65/1975)
The branch: <where it is and why there rather than in FeedPage>
Browse check: <how you verified PlaceDirectory's path renders the notice, or "could not verify">
Stale claims fixed: <the three, one line each>
Zipped parent unchanged: <how you know>
The untested-branch gap: <your statement of it>
Gate green: yes | no
Commit: <sha>
Risks: <or "none">
Unresolved questions: <or "none">
```

# Fix round 1/5 — V28 Slice 2c (one comment states something untrue)

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

You built Slice 2c at `549c2e9`. A fresh-context reviewer returned **PASS** — the
early return is correct, all hooks precede it, the zipped path is byte-identical,
both callers reach it, and the reused copy reads correctly on a browse surface.
It found **one** inaccurate comment, written by this slice. That is this round.

## The finding (verified by the orchestrator)

`src/components/RadiusEmptyState.tsx:95-97` says the disabled-escape guard *"now
remains only for the in-flight `session === null` case."*

**That is wrong.** The guard is `busyRadius !== null || session === null ||
!hasHomeZip(homeZip)`, and while the **profile** is in flight `homeZip` is
`profile?.home_zip ?? ''` → `''` → `!hasHomeZip('')` is true. So the
`!hasHomeZip` clause is live during the in-flight profile window too, not only
for `session === null`.

## And the half the comment should now record — the reviewer PROVED this

The reviewer asked the question I told it to ask: *what renders while the profile
is in flight, and does that window show the radius lie to the exact parent this
slice exists for?* It answered it with citations, and the answer is **no surface
can**:

- `FeedPage.tsx:1248-1276` renders `RadiusEmptyState` only when
  `posts !== null && posts.length === 0`, and the feed effect is gated on
  `profile === null` (`FeedPage.tsx:495`) — so the in-flight window shows
  `"Loading…"` instead.
- `BrowsePage.tsx:313-314` returns `"Loading…"` when `profile === null`.
- `NewPlaydatePage.tsx:1231` keeps its embedded sheet behind its `loading` guard.

So the `profile !== null` half of your early return is **belt-and-braces**: the
notice fires exactly when the state settles, and no surface can show the radius
lie to a no-zip parent in flight.

## The task

Rewrite the comment block at `RadiusEmptyState.tsx:93-102` (the disabled-escape
comment and the early-return comment) so that both are **true and specific**:

1. The disabled-escape guard's `!hasHomeZip` clause is live for the in-flight
   profile window as well as for `session === null` — state that.
2. The early return's `profile !== null` half is deliberate **belt-and-braces**,
   and say *why it is safe*: no caller renders this component while the profile
   is in flight (FeedPage and BrowsePage both render `"Loading…"` on a null
   profile; `NewPlaydatePage`'s embedded sheet is behind its own loading guard).
   Cite the files in the comment so the next reader can check it.

**Comment-only.** Do not change the condition, the JSX, `escapesDisabled`, or
anything else. If you believe a code change is warranted, stop and report instead
— that would contradict a PASS verdict and needs the orchestrator.

## Do NOT

Do not touch `FeedPage.tsx`, `feed.ts`, `places.ts`, `PlaceDirectory.tsx`,
`db.ts`, `plan.md`, `task-state.md`, `.scratch/v28/ledger.md`. The
`places.ts`/`PlaceDirectory` no-zip item and the `db.ts` stale claim are assigned
to **Slice 7** in the amended plan; do not widen into them.

## Verify and commit

```
npm run verify
```

Report the lint warning count against the **80-warning / 0-error** baseline and
the test counts against **65 files / 1975 tests**. Comment-only changes cannot
move either, so if one moved, something else changed — say so.

Scoped `git add`. Only when green:

```
V28 slice 2c fix 1/5: the disabled-escape comment states what is actually true
```

Do not push.

## Report

```
Status: DONE | BLOCKED
Files changed:
  - <path> <what the comment now says>
Commands run:
  - <command> -> <result>  (real tails; lint count vs 80/0; test count vs 65/1975)
Code lines changed: <should be zero — confirm>
Gate green: yes | no
Commit: <sha>
Risks: <or "none">
Unresolved questions: <or "none">
```

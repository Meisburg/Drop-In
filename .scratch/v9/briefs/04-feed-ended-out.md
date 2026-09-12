# Builder brief — V9 ticket 04 (ended drop-ins leave the feed, into the archive)

Repo: `/home/jmeisburg/Projects/playdate-app` ("Drop In" — Vite + React + TS +
Tailwind PWA on live Supabase, project ref `ayzvjwxbxyrcgyoeaxuk`).
You are the ONLY writer: never run a git command that writes (no
commit/checkout/stash/branch/reset). Never apply a migration — this ticket
requires none, and `supabase/migrations/` must be untouched.

## Read first, in this order
1. `.scratch/v9/issues/04-feed-ended-out.md` — THE SPEC. Its AC checkboxes are
   your acceptance criteria.
2. `.scratch/v8/spec.md` — the house discipline (red-by-design specs, no
   test weakened, findings reported).
3. The code: `src/pages/FeedPage.tsx` (load ≈220-285, render ≈593-752),
   `src/lib/feed.ts` (`isEnded` ≈193, `filterFeed` ≈381,
   `queryUpcomingFeedWithClient` ≈427, `partitionPostsByTime` ≈1524),
   `src/lib/db.ts` (`listRadiusFeed` ≈525), `src/components/DropInCard.tsx`
   (≈134-205), `src/components/RadiusEmptyState.tsx`,
   `src/pages/ProfilePage.tsx` (≈1305-1330), `src/pages/UserPage.tsx` (≈440-490),
   `src/lib/follows.ts` (`endedWithinDays` ≈186, `nextOccurrencePlan` ≈227).
4. The existing specs that touch this surface: `e2e/feed-empty-state.e2e.ts`,
   `e2e/profile-posts.e2e.ts`, `e2e/polish.e2e.ts`, `e2e/quick-post.e2e.ts`,
   and the helpers in `e2e/fixtures.ts`.

## What to build
Exactly ticket 04. Nearby shows only what is still ahead or happening now — an
ended drop-in (`ends_at <= now`) disappears from `/` entirely (no greyed card,
no demotion), while a drop-in that has STARTED but not ENDED stays with its
"Happening now" badge. The cutoff moves from start-of-today to now in the DB
query AND the pure filter so the two layers cannot disagree. The archive is
`/profile`'s existing **Past** list (shipped in V8 ticket 04), reachable from
the feed: a "See past drop-ins" line under the day sections and from the empty
state. Plus the pure seam `isStillAhead(post, nowIso)`, its unit tests, and the
new `e2e/feed-ended-out.e2e.ts`.

## Traps I verified myself — handle these, do not rediscover them
- **T1 — the cutoff is `ends_at`, not `starts_at`.** `filterFeed`
  (`feed.ts:381`) currently keeps posts with
  `Date.parse(post.starts_at) >= todayStart`, and
  `queryUpcomingFeedWithClient` (`feed.ts:437`) applies `.gte('starts_at',
  cutoffIso)`. Moving that cutoff to "now" LITERALLY — `starts_at >= now` —
  would delete every drop-in that already started, which is exactly what the
  AC forbids ("A drop-in that has STARTED but not ended STAYS … those are the
  ones a parent can still walk to"). The honest expression of "still ahead or
  happening now" is `ends_at > now` on BOTH layers (it subsumes future posts,
  because `ends_at` is always after `starts_at`). Get this right on both
  layers and say so in your report.
- **T2 — one definition of the boundary.** `isEnded(post, nowIso)`
  (`feed.ts:193`) already pins `ends_at <= now`, and `partitionPostsByTime`
  (`feed.ts:1524`) already pins UPCOMING = NOT ended for the V8/04 profile
  lists. `isStillAhead` must therefore be the COMPLEMENT of `isEnded` — do not
  write a second, independently-drifting comparison. Pin the boundary in a
  unit test: at exactly `ends_at === nowIso` the post is ENDED and therefore
  NOT ahead.
- **T3 — `filterFeed`'s signature.** Its 5th parameter is `startOfTodayIso` and
  its 6th is `nowIso`, which the body currently discards (`void nowIso`,
  `feed.ts:389`). This ticket makes `nowIso` load-bearing. Update the parameter
  name/docs honestly and update every call site — `db.listRadiusFeed`
  (`db.ts:541-554`) and ~15 call sites in `src/lib/feed.test.ts`. The existing
  filterFeed invariants (radius, blocked host, hidden post, ordering) must all
  still be asserted; you are ADDING boundary cases, not replacing them.
- **T4 — what dies and what stays.** In `FeedPage.tsx` the ended-demotion split
  (`≈709-746`, the `upcoming` / `ended` filters and the second `ended.map`
  block) becomes dead code once the query stops returning ended posts: delete
  it honestly rather than leaving an unreachable branch. But `DropInCard`'s
  `ended` / `muted` / "Ended" chip (`DropInCard.tsx:135-185`) MUST STAY — the
  archive cards on `/profile` and `/u/:handle` depend on exactly that muted
  styling (V8/04's Past lists and `UserPage.tsx:280`'s split).
- **T5 — the empty state is SHARED.** `RadiusEmptyState`
  (`src/components/RadiusEmptyState.tsx:36`) takes only `radiusMiles` and is
  rendered by BOTH `FeedPage.tsx:704` and `BrowsePage.tsx:299` (the places
  directory). The "See past drop-ins" link belongs on the FEED only — add an
  optional prop (or render the link beside the component on the feed) so the
  places directory does not grow a link to a personal archive. Also update that
  component's header comment: it currently says `filterFeed` "only drops PAST
  posts", which stops being an accurate description of the cutoff.
- **T6 — do not change the profile lists.** `countPostsByHost` (`db.ts:674`,
  `:697`) uses `startOfTodayIso()` for its own reads; the Upcoming/Past split
  there is `partitionPostsByTime`, which is already the correct `ends_at <= now`
  boundary. Leave it alone. If `/profile`'s Past list already meets the
  archive rules (muted, no "I'm going" toggle, the V8/09 "Same time next week"
  affordance for the host / anyone who pinged), PROVE that with evidence rather
  than changing it gratuitously; if it does not, fix it and say which rule was
  missing.
- **T7 — make an ended post, race-proof.** A post created through `/new` always
  starts at a future slot, so the spec must construct an ended window. The
  ticket allows "post a drop-in that ends in the past (or edit one to have
  already ended)". Use whatever is most honest and cascade-safe: the marker's
  own JWT against the REST API (an UPDATE of `starts_at`/`ends_at` on the
  marker's OWN row — the host-only UPDATE policy is the wall), or the edit
  form. A plain anon write is an RLS no-op PostgREST reports as 2xx (the
  logged lesson). Do NOT weaken `validatePlaydateForm` to allow a past date
  just to make the spec convenient.
- **T8 — the spec's pivot.** The ticket requires `e2e/feed-ended-out.e2e.ts` to
  say IN THE FILE which assertion is the pivot (the feed half is RED until the
  change lands; the archive half is green before and after) and to include a
  control assertion that a live post IS present, so "absent" cannot pass
  vacuously. Write that as a comment in the spec, in the house style.

## Required checks you run yourself
- `npm run build` — exit 0.
- `npm run test` — the unit suite. Baseline on the committed tree is
  **655 passed / 655, 20 files** (this ticket lands after V9 tickets 01 and 03,
  so the baseline you actually see will be higher — report the numbers you see
  and the new/changed test files).
- `npx playwright test e2e/feed-ended-out.e2e.ts` — then, for the RED half, prove
  it fails at the documented assertion BEFORE your source change and passes
  after (stash nothing; simply run it first against the unmodified feed logic if
  you can do so without losing work — otherwise demonstrate the pivot by
  temporarily reverting your own filter change in memory and reporting the
  quoted failure).
- The FULL suite: `npm run test:e2e` (≈5-8 min, against the LIVE Supabase
  project). Two known live-API flakes — `e2e/guest-list.e2e.ts` and
  `e2e/post-edit-delete.e2e.ts` — re-run each in isolation before reporting a
  failure as real. Report pass/total.
- `npm run lint` (0 errors expected; report warnings only if they are on lines
  you changed).
- **Never weaken, delete or skip an existing assertion.** If an existing spec
  must change, quote the exact lines and justify them.

## Marker hygiene
E2E mints `e2e-<epoch>` marker accounts in the LIVE project. Make the new spec
cascade-safe and have it delete its own rows best-effort with the marker's own
JWT (the `quick-post.e2e.ts` / `golden-path.e2e.ts` cleanup pattern). Do NOT
run the sweep tool — the coordinator owns it.

## Report back, terse and structured
1. Files changed, with line counts.
2. AC-by-AC: met / not met / deviated, each with its evidence (command + output).
3. The pivot: how you proved the feed half was red before the change and green
   after, with the quoted failure.
4. Gate numbers: build exit, unit passed/total, e2e passed/total, lint.
5. Deviations and findings — the T1-T8 outcomes, anything you did not do, and
   anything the ticket did not anticipate. Report findings; do not paper over a
   failure.
6. The exact command the coordinator should run to reproduce your gate.

# 04: Nearby — ended drop-ins leave the feed, into the archive

**What to build:** Her words: *"after you've attended the event, it should drop
off of the nearby feed. It shouldn't stay there because that's confusing. But
there should be like a past events place maybe where they get like archived."*

Today the Today section keeps ended drop-ins at the bottom, greyed
(`FeedPage.tsx`, the V3 slice-1 decision) — a reasonable demotion that she is
telling us is just confusing. Remove them from Nearby entirely and give them one
honest home: the **Past** list that V8 ticket 04 already built on `/profile` and
`/u/:handle`. Add a "See past drop-ins" affordance so the archive is findable
rather than hidden.

**Blocked by:** Ticket 03 (one-writer). Independent of 01–03 in code, but it
comes after in the queue.

**Status:** ready-for-agent

- [ ] **Nearby shows only what is still ahead or happening now.** An ended
  drop-in (`ends_at <= now`) disappears from `/` — no greyed card, no demotion.
  A drop-in that has STARTED but not ended STAYS (with its "Happening now"
  badge): those are the ones a parent can still walk to
- [ ] The feed's own read stops fetching them, rather than fetching and hiding
  them: the cutoff moves from start-of-today to **now** in the query AND the pure
  filter, so the DB does less work and the client cannot disagree with it (both
  layers, the house defense-in-depth pattern)
- [ ] The archive exists and is reachable: `/profile`'s **Past** list (shipped in
  V8/04) is linked from the feed — a "See past drop-ins" line under the day
  sections, and from the empty state when there is nothing ahead
- [ ] Archive rules, pinned: Past cards render **muted**, offer **no "I'm going"**
  (the feed's toggle is absent there), and carry the V8/09 **"Same time next
  week"** affordance for the host and for anyone who pinged
- [ ] The empty state stays honest and distinct: "Nothing coming up within N
  miles." + the widen escapes (V8/02) + the new "See past drop-ins" link — it
  must not imply the archive is empty
- [ ] Pure seams + unit tests: `isStillAhead(post, nowIso)` (started-and-running
  counts as ahead; ended does not) and the feed filter's boundary at exactly
  `ends_at = now` (ended → out)
- [ ] New e2e `feed-ended-out.e2e.ts`: a post whose window has already ended is
  absent from `/` (asserted by title, with a control assertion that a live post
  IS present) and present in the profile's Past list; **green pre- and
  post-change** for the archive half, red for the feed half until the change
  lands — the spec must say which assertion is the pivot
- [ ] `npm run build && npm run test && npm run test:e2e` exit 0

**Migration check:** **NONE — read-path only.** No column, index, or policy
change: the cutoff is a query parameter (`queryUpcomingFeedWithClient`'s
`cutoffIso`), and the archive read is V8/04's `listPostsByHost` / the profile's
existing Past partition. Diff guard: no file under `supabase/migrations/`
changes.

**Verify:** `npm run build && npm run test`; `npx playwright test
e2e/feed-ended-out.e2e.ts`; full suite; live marker pass — post a drop-in that
ends in the past (or edit one to have already ended via ticket 05's edit form),
confirm it leaves `/` and shows in Past.

## Comments

### Builder report (cycle 1) — what shipped, and three records the review asked for

Shipped on the read path only (no migration, `supabase/migrations` untouched):
the cutoff is now `ends_at > now` on BOTH layers (pure `feed.isStillAhead` =
`!isEnded`; query `.gt('ends_at', cutoffIso)`, one clock read shared with the
filter), the Today-section ended-demotion is deleted, the feed links to the
archive ("See past drop-ins" under the day sections and inside the empty state),
and `/profile`'s Past rows became a real archive (muted, and their title links to
the drop-in). Spec: `e2e/feed-ended-out.e2e.ts` (2 tests, pivot + control stated
in the file). Gate: build 0 · 712/712 unit · 61/61 e2e · lint 0 errors.

**1. FOLLOW-UP (recorded, deliberately NOT fixed here) — two reads still cut at
start-of-today, and one of them prints a wrong label.** `db.listPlaceFeed`
(`src/lib/db.ts:688`) and `db.upcomingCountsByPlace` (`src/lib/db.ts:711`) still
use `.gte('starts_at', startOfTodayIso())`. Consequence, at ANY table size:
Browse renders `placeUpcomingLabel` → **"1 upcoming"** for a place whose only
drop-in has already ENDED (`places.ts` `placeUpcomingLabel`, `BrowsePage.tsx`
chip), which the feed now contradicts; and `/place/:id` can still list that ended
drop-in. The fix is the feed's own predicate (`.gt('ends_at', now)`) and needs
NO migration — it is out of scope only because this ticket is feed-scoped and
those surfaces have their own ACs and specs (V8/07). Both call sites carry a
V9/04 note pointing here.

**2. LIMITATION (recorded) — the archive is per HOST, not per attendance.** The
AC places the archive at `/profile`'s Past list, which is
`.eq('host_profile_id', …)` — so the link's likeliest tapper, a brand-new parent
whose feed is empty (the very state V8/02 targets), lands on "No posts yet.";
and a parent who PINGED someone else's ended drop-in has no listing surface at
all (they can reach the drop-in by its detail URL, where V8/09's affordance
gates them out as a stranger). `e2e/feed-ended-out.e2e.ts` assertion (10) pins
that behaviour with a fresh `e2e-v-*` viewer so a future change to the surface is
deliberate. An attended-events surface (or a pinger-scoped history) is a NEW
product surface, explicitly out of scope for a read-path ticket.

**3. SUPERSESSION (recorded) — V3/02's "the event STAYS in the feed".** That pin
was about a CANCELLED post: "the host can revert; no auto-expiry"
(`DropInCard.tsx`, V3 slice 2). With the cutoff now time-based, a cancelled post
whose window has ENDED leaves `/` like any other ended drop-in — the cutoff does
not ask why a row is over, and nothing in this ticket changed that on purpose.
So the host can no longer flip a cancellation back on from the feed once the
window is past; the detail page and the archive still offer it, and V8/09's
"Same time next week" is explicitly kept for a cancelled post
(`PlaydateDetailPage`'s own pin: "the rule here is time-based"). **No spec covers
the cancelled-and-ended case** — `e2e/host-status.e2e.ts` posts for TOMORROW and
pins "the event stays in the feed" for a post that is still ahead. `DropInCard`'s
header records the supersession; a spec for the ended-and-cancelled pair belongs
to a follow-up (it needs its own row plus a status write).


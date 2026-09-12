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

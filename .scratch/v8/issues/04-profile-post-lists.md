# 04: Real post lists on `/u/:handle` and `/profile`

**What to build:** Every profile in the app currently claims *"No posts yet."*
— the block is hardcoded (`UserPage.tsx:295-297`) regardless of history. That
is the worst possible first impression for the one surface a parent visits to
decide whether to show up, and it throws away the strongest social proof the
app has (past meetups that happened, upcoming ones to join). Render the real
lists: **Upcoming** and **Past** drop-ins for that host, as cards.

**Blocked by:** Ticket 03 (one-writer).

**Status:** ready-for-agent

- [ ] New `listPostsByHost(profileId)` in `src/lib/db.ts`: that host's playdates, non-hidden, ascending for upcoming and descending for past; the viewer's own `blocks` rows still filter the result (reuse `listBlockedHostIds`; a blocked host's page must not leak posts through this new path)
- [ ] Pure seam `partitionPostsByTime(posts, nowIso)` → `{ upcoming, past }` with unit tests (boundary: a post starting exactly now is upcoming; an ended post is past; ordering pinned in both lists)
- [ ] `/u/:handle`: "Upcoming" + "Past" sections using the existing `DropInCard` (past cards render muted via the existing `isEnded` styling); the hardcoded "No posts yet." block is **removed**; the "Hosted N drop-ins" line stays exactly as-is
- [ ] Empty states are distinguishable and honest: no posts at all → "No posts yet."; posts exist but none upcoming → "Nothing coming up — past drop-ins below."
- [ ] `/profile`: the existing Your-posts block gains the same Upcoming/Past split so a host can see past posts (where ticket 09's "Same time next week" will live); the existing per-post **Duplicate** action stays on every card, past posts included
- [ ] New e2e `profile-posts.e2e.ts`: host posts → `/u/:handle` shows it under "Upcoming" (no "No posts yet." string anywhere on the page) → the profile page shows it too; cascade-safe REST cleanup
- [ ] No pagination needed at the current data volume — but cap the query at 50 rows and render "+N older" as a plain count (never an unbounded fetch)
- [ ] `npm run build && npm run test && npm run test:e2e` exit 0

**Migration check:** **NONE — read-only over existing tables.** `playdates`
already has host-only write policies and an authenticated SELECT posture
(`0005`), `hidden_at` exclusion is already the read rule (`0009`), and `blocks`
(`0006`) is reused through the existing helper. Diff guard: nothing under
`supabase/migrations/` changes; `src/lib/db.ts` gains one query function and
its `*WithClient` twin.

**Verify:** `npm run build && npm run test`; `npx playwright test
e2e/profile-posts.e2e.ts`; live check — the founder's `/u/Jon Meisburg` shows
the real post, and a marker with zero posts still shows "No posts yet."
Sweep markers.

## Comments

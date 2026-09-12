# 03: "While you were away" — the inbox that replaces the dead-end banner

**What to build:** The closest thing to a notification in the app today is the
host banner *"N new families pinged your drop-ins"* (`FeedPage.tsx:418-426`),
which renders only while the host is already inside the app and is a dead end:
tapping it goes to `/profile` (`FeedPage.tsx:370-375`), which shows **none** of
the people who pinged. Replace it with a real "while you were away" card at the
top of the feed that says **who did what**, covering the two things a parent
must not miss:

1. **Who's going to my drop-in** — the families that pinged the host's own
   posts since the cursor, with handle + avatar (existing reads:
   `listPingsForPosts`, `get_guest_list`).
2. **A drop-in I said I'd go to was cancelled** — the viewer pinged a post whose
   `status` is now `cancelled` (or that was deleted by its host). This is the
   "don't drive to an empty park" message, and it works with **no push
   infrastructure** — which is exactly why it ships before ticket 08.
3. **New comments on my posts** since the cursor (`comments.created_at` exists,
   `0013:45`).

The cursor stays `profiles.last_seen_at` (`0024`) with the existing 1-hour
restamp throttle (`FeedPage.tsx:28`, `dueToRefreshLastSeen`) — the inbox is
dismissed by opening it, not by a new flag.

**Blocked by:** Ticket 02 (one-writer).

**Status:** ready-for-agent

- [ ] Feed-top card (amber nudge pattern, the ProfilePage "Finish your profile" shape) listing up to 3 items, each with avatar(s) + one-line copy + a tap target that lands on `/playdate/:id` for that post
- [ ] Item kinds, verbatim copy: `N families are going to "<title>"` · `"<title>" was cancelled — you said you'd go` · `N new comments on "<title>"` — no singular/plural variant needed per item, but the count must read correctly at 1 ("1 family is going to…")
- [ ] Pure seam `buildWhileAwayItems(inputs, limit)` with unit tests: ordering (cancellation first, then pings newest-first, then comments), the 3-item cap + a "+N more" line, dedupe of a post appearing under two kinds, and an empty result when everything is at or before the cursor
- [ ] Opening the inbox (a tap on the card or on "+N more") restamps the cursor via the existing awaited `restampLastSeen` + `refresh()` path, so the next feed visit shows no banner — the existing `host-retention.e2e.ts` assertions are **moved** to the new card, not duplicated (one banner, not two)
- [ ] A cancelled-post item renders even for a post the host later deleted (the join tolerates a missing row: `0008`'s reports kept nullable refs for exactly this reason — do not crash on a null title)
- [ ] The card never renders when the count is 0, unsettled, or the read fails (silent, zero-pressure soul — unchanged discipline)
- [ ] New e2e `while-away.e2e.ts`: host posts → viewer pings → host's feed shows the inbox naming the viewer → tap → the detail page → back on the feed the card is gone (cursor moved). Cascade-safe REST cleanup like `host-retention.e2e.ts`
- [ ] `npm run build && npm run test && npm run test:e2e` exit 0

**Migration check:** **NONE — no new objects.** Every input already exists:
`going_pings.created_at` (`0020:31`), `profiles.last_seen_at` (`0024`),
`playdates.status` (`0016`, trimmed by `0019`), `comments.created_at`
(`0013:45`), and the gated guest-list RPC (`0025`). The one thing to verify
rather than assume: **the client may not read other profiles' rows it doesn't
need** — names/avatars must come through the existing `get_guest_list` /
`listPingsForPosts` embeds, never a new broad `profiles` SELECT. If a query
shape needs a new SECDEF helper, that requires a migration and must be raised
to the coordinator **before** writing it (number reservation: next free).

**Verify:** `npm run build && npm run test`; `npx playwright test
e2e/while-away.e2e.ts e2e/host-retention.e2e.ts`; live marker pass on a phone —
viewer pings, host sees the viewer's name (not just a number). Sweep markers.

## Comments

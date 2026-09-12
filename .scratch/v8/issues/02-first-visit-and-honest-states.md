# 02: First visit that isn't a dead end + honest, fresh states

**What to build:** The first screen a new parent sees is
*"Nothing happening near you today — post the first one"*
(`FeedPage.tsx:433-443`). It is wrong twice: the copy says "today" over a
today-and-later list, and it offers no way out of the empty radius. With a
5-mile default (`feed.ts:53`) that screen is the ceiling on every other ticket.
Fix the escape hatch, then fix the three states that lie: a failed going-count
read **disables** the "I'm going" button with no explanation
(`PlaydateDetailPage.tsx:1240`), a failed comments load is indistinguishable
from "no comments" (`:1337`), and ping counts never refresh without a full
remount (no focus/visibility refresh; the parked ticket-07 observation).

**Blocked by:** Ticket 01 (one-writer).

**Status:** ready-for-agent

- [ ] Empty radius state (feed **and** browse): copy fixed to "Nothing within N miles yet" (N = the viewer's actual radius), plus two escapes — **"Widen to 20 miles"** (calls the existing `updateHomeZipRadius`, then refetches) and **"See everything in Seattle"** (35 mi, the max) — and the existing "Post a drop-in" CTA stays
- [ ] The escape control is present even when widening still yields nothing (it must never become a second dead end); the empty state never claims "today"
- [ ] Focus/visibility refresh: the feed refetches when the tab becomes visible again **only when the last load is older than 60 s** (pure seam `shouldRefreshFeed(lastLoadedIso, nowIso, windowMs)` + unit tests); no polling loop, no refetch storm on quick app switches
- [ ] After a card toggle, that post's going pings are re-fetched (closes the ticket-07 parked observation: `pingsByPostId` no longer goes stale until the next full load)
- [ ] Detail page degraded states: a failed going-count read keeps the ping button **enabled** (optimistic write path) and shows a retry line instead of a dead disabled control; a failed comments load renders "Couldn't load comments." + Retry instead of an absent section
- [ ] Best-effort card decorations (rain badge, going lines, kids count) keep their current silent degradation — do not add error UI to cards
- [ ] New e2e `feed-empty-state.e2e.ts`: a marker account with a home zip far from any post and a 2-mile radius sees the empty state, the widen control is tappable, and the copy contains no "today" claim (assert the control + copy, **not** that posts appear — the live city may legitimately be empty)
- [ ] `npm run build && npm run test && npm run test:e2e` exit 0

**Migration check:** **NONE — client-only.** No column, no policy, no RPC
change: the widen path reuses `updateHomeZipRadius` (`src/lib/db.ts:560`) and
the refresh reuses the existing feed query. Diff guard: nothing under
`supabase/migrations/` changes.

**Verify:** `npm run build && npm run test`; `npx playwright test
e2e/feed-empty-state.e2e.ts`; a live phone pass with a marker zip that has no
posts (confirm the escape hatch, then widen and confirm the list actually
changes). Sweep markers afterwards.

## Comments

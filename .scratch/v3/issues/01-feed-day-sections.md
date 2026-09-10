# 01: Feed day sections — "Today" is a lie

**What to build:** The feed's day-blindness fix (parking lot #1, priority 1 —
every user hits it daily). FeedPage is titled "Today" but `listRadiusFeed`
returns today-or-later and cards render time-only, so a Saturday post shows
"3-5 PM" with no date and this morning's ended drop-in still sits atop
"Today" at 3 PM. The feed gets day section headers (Today / Tomorrow /
weekday, ascending start-of-day order); within the Today section, ended
events are demoted + grayed (an "Ended" state); the soonest upcoming event
gets a "Starts soon" badge (starts within 60 minutes — orchestrator pin).
Day labels come from the section headers; no card reads as "today" without
one. All client-side over the existing `nowIso` seam; `groupByDay` is
promoted from BrowsePage to `src/lib/feed.ts` (pure, unit-tested); no
migration.

**Blocked by:** None (dispatch gated on the two-user beta green light, plan-v2 slice 3.5).

**Status:** ready-for-agent

- [ ] `groupByDay` promoted to a pure fn in `src/lib/feed.ts`; BrowsePage switched to it (no duplicate implementation)
- [ ] New pure fns in feed.ts, unit-tested with the nowIso seam: `formatDayLabel(startIso, nowIso)` ("Today" / "Tomorrow" / "Sat, Sep 12"), `isEnded(post, nowIso)`, `isStartingSoon(post, nowIso)` (starts within 60 min, not yet started)
- [ ] FeedPage renders day section headers in ascending start-of-day order
- [ ] Within the Today section: upcoming first (starts_at ascending), then ended events demoted + grayed
- [ ] "Starts soon" badge on the soonest upcoming event
- [ ] 375px: no horizontal scroll; section headers legible
- [ ] Existing e2e specs still pass (golden-path touches feed rendering; adapt assertions only if sectioning breaks them)
- [ ] npm run build && npm run test && npm run test:e2e exit 0

## Comments
# 07: Nearby — search and filters (day, age, neighbourhood, text)

**What to build:** Her words: *"for the nearby section, there should be an option
on the top to have like search functionality with filters. You can search by the
time or the day. Or maybe even by the kids age, and neighborhood."*

Today the only filter on Nearby is the radius, and the day is expressed as
section headers a parent can only scroll through. Give them a search field and
four filters that match how the decision is actually made.

**Blocked by:** Ticket 06 (one-writer) — the filters must appear in BOTH the map
view and the list view, so they land after the map does.

**Status:** ready-for-agent

- [ ] A search field at the top of Nearby: matches the **title** and the **place**
  case-insensitively as you type (no submit button, no server round-trip)
- [ ] Four filters beside/below it, each showing its active state:
  **When** (Today · Tomorrow · This weekend · Next 7 days) · **Ages** (fits my
  kids' ages, using the `kids.age` values already on the profile, compared against
  the post's derived/stated range) · **Neighbourhood** (the neighbourhoods that
  actually appear in the current results — never a dead list of 20) · **Distance**
  (the existing radius control, unchanged)
- [ ] Filtering is **client-side over the already-radius-filtered feed** (the feed
  is small; a new RPC would be premature) through one pure seam
  `applyFeedFilters(posts, filters, viewerKidAges, nowIso)` with unit tests for
  every filter, their combination, and the empty-result case
- [ ] Honest empties, pinned: when filters hide everything, the state says so
  ("No drop-ins match those filters" + **Clear filters**) and **never** blames the
  radius; the V8/02 widen escapes appear only when there are genuinely no
  drop-ins in the radius. Getting this wrong is the exact "second dead end" V8/02
  removed
- [ ] The filter state survives a view toggle (map ↔ list) and a refresh within
  the session, and is visible at a glance (a count: "3 of 7")
- [ ] **Age fit uses the same rule as Places** (V9/05): a post with no age
  information is **never hidden** by the Ages filter — unknown is not "doesn't
  fit" (the rule Places already follows)
- [ ] `scripts/mobile-audit.mjs` stays green at 320/375/390/430 and both
  orientations (the filter row is the new overflow risk), and every filter chip is
  ≥44px
- [ ] New e2e `feed-filters.e2e.ts`: search narrows by title and by place; the
  When filter changes the visible set and the day headers agree; the Ages filter
  keeps an age-less post; the Neighbourhood filter lists only what is present;
  Clear filters restores the full list; empty results show the filter-specific
  copy and NOT the radius escapes
- [ ] `npm run build && npm run test && npm run test:e2e` exit 0

**Migration check:** **NONE — client-side filtering over existing reads.** No
column, index, RPC or policy change; the feed query stays as it is (V8/02's
radius read), so no `supabase/` diff at all.

**Verify:** `npm run build && npm run test`; `npx playwright test
e2e/feed-filters.e2e.ts`; full suite; live phone pass — search "green", filter to
This weekend + fits my kids, count the results.

## Comments

# 01: Quick post — today by default, recent places, "we're here until 5"

**What to build:** Posting is the most expensive gesture in the app: six
required decisions (title, place, neighborhood, date, start time on a
30-minute grid, duration — `src/lib/feed.ts:385-410`) with **no today default**
(`NewPlaydatePage.tsx:28`, `startDate: ''`) and a start time that always opens
at **10:00 AM** (`:29`). Meanwhile the core spontaneous gesture — "we're at the
park right now" — is the one parents actually make. Make the default state of
`/new` already correct, so the common post takes typing a place and nothing
else. Target: **post in under 15 seconds.** Defaults and memory only — no
schema change, no relaxation of validation.

**Blocked by:** None (first ticket in the V8 queue).

**Status:** complete — shipped 2026-09-12 in `dd0642e`; evidence in task-state.md (V8 ticket 01)

- [x] `/new` opens with the start date = **today, device-local** and the start time = the **next 30-minute slot**, computed once at mount (never a per-render recompute that shifts under the user's finger); both stay fully editable
- [x] Pure seams with unit tests: `defaultStartDateIso(nowIso)`, `nextSlotMinutes(nowIso)`, `suggestedDurationMinutes(nowIso)` (to the next whole-hour boundary, clamped to the existing duration chips 60–180 min)
- [x] "Recent places" chips: up to 3 distinct places from the viewer's own last 10 posts; one tap fills place + address + neighborhood together; the row is **hidden** when there are none (a first-timer never sees an empty chip row)
- [x] "We're here until 5" one-tap preset: sets start = now-slot and duration = suggested; prefills the title as `Playdate at <place>` **only when the title is empty**, and only once place is set; the live `n/80` counter keeps working
- [x] New db helper `listRecentOwnPlaces(limit)` (own playdates newest-first, distinct place; pure mapper unit-tested, the existing `*WithClient` mock pattern)
- [x] Nothing auto-submits: title, place, neighborhood, date, time and duration are all still required by `validatePlaydateForm`, and a parent can still schedule 3 days ahead exactly as today
- [x] 375px: the chips row wraps like the existing duration chips; no horizontal overflow
- [x] New e2e `quick-post.e2e.ts`: `/new` shows today's date and the next slot; a recent-place chip fills the address; a post created without touching the date/time controls appears on the feed
- [x] `npm run build && npm run test && npm run test:e2e` exit 0

**Migration check:** **NONE — client-only.** No new column, no RLS change; the
recent-places read uses the viewer's existing SELECT on their own `playdates`
rows. Guard the claim in the diff: no file under `supabase/migrations/` may
change, and `git diff --stat` for this ticket must list only
`src/pages/NewPlaydatePage.tsx`, `src/lib/feed.ts`, `src/lib/feed.test.ts`,
`src/lib/db.ts`, `src/lib/db-*.test.ts`, `e2e/quick-post.e2e.ts`.

**Verify:** `npm run build && npm run test` (340 + new unit tests green);
`npx playwright test e2e/quick-post.e2e.ts`; manual phone pass — open `/new`,
confirm the date is today, the time is the next slot, and a recent-place chip
fills three fields at once. Then sweep markers
(`node scripts/sweep-e2e-markers.mjs`).

## Comments

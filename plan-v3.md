# Implementation Plan: Playdate V3 — feed day sections, host status + weather, ICS, host retention, guest list

> Owned by the orchestrator. Written BEFORE any builder dispatch. Derived
> from `.scratch/v3/parking-lot.md` (founder/CoS design review 2026-09-09,
> priorities 1-4) + `.scratch/guest-list/spec.md` (founder-approved design,
> ticket 05 pending founder read). Source V1/V2 plans and their pinned
> Interfaces remain in force where not overridden here.

## Goal

A parent sees the feed in true day sections ("Today / Tomorrow / Saturday")
so "Today" stops being a lie; hosts can mark their event "Rained out /
Cancelled" and get a best-effort "Rain likely" badge from Open-Meteo (free,
no key, no location sensing); every event can be added to any calendar via
an ICS download; hosts get a reason to come back ("N new families pinged
your drop-ins" banner + "Hosted N drop-ins" — computed history, no
reviews); and, last, going-pings disclose their guest list progressively —
host and pingers see names, everyone else sees counts only, and the V1
zero-pressure surface stays exactly as shipped. All verified by
`npm run build && npm run test && npm run test:e2e` plus per-slice live
checks against the real Supabase project, working at 375px, zero-pressure
soul preserved.

## Non-goals

- Web Push notifications (parking lot #5 — large, after deploy + beta; V4 candidate)
- Real push to hosts (ticket 04's banner is the pre-push stopgap only)
- Edit-before-start window (parked, founder call)
- Structured age-range filter (parked — needs min/max age schema)
- Smart paste / AI prefill (parked — needs server-side LLM + privacy story)
- Repeat-attendance surface ("You've crossed paths with Sarah at 4 drop-ins") — parked, V4 candidate (parking-lot design-verdict part (b); V3 ticket 04 covers computed hosted-counts only)
- Deployment (DECISION 3 stands), app stores, DMs, GPS
- Public guest lists, attendee photos, DMs between attendees (guest-list spec pins)

## Interfaces

Pinned contracts every builder must respect (reviewers enforce these):

- **Stack / checks:** unchanged from V1/V2 (Vite + React 18 + TS + Tailwind v4,
  Supabase, PWA). Gate on every slice: `npm run build && npm run test &&
  npm run test:e2e` (e2e house rule since V2: every slice runs the live
  Playwright suite serially; slices 2, 4, 5 each ship 1-2 new specs).
- **Migrations:** 0019-0024 in supabase/migrations/ (latest live = 0016 after V3.2). 0019 = status trim (ticket 06), 0020 = address + 12-field RPC (ticket 08), 0021 = kids v3 (ticket 09), 0022 = replies (ticket 10), 0023 = last_seen_at (retention), 0024 = get_guest_list (guest list). DO-block idempotency (2026-09-04 lesson); orchestrator applies live via the dashboard SQL API fallback (POST /database/query + bearer token — the Monaco SPA is broken in the CDP Chrome; task-state tooling note amendment #2) after code green.
- **Pure seams (house style):** pure logic in `src/lib/feed.ts` + new
  `src/lib/ics.ts` (one pure domain file per concern, tests colocated);
  Supabase/external-facing functions use the injected-client pattern
  (`query*WithClient` prior art); validators pure. Mock-client tests can't
  catch embed ambiguity — real-DB REST smoke probes required before slice
  close (PGRST201 lesson).
- **Day sections (ticket 01):** promote page-local `groupByDay` (BrowsePage.tsx)
  to a pure fn in `src/lib/feed.ts`; new pure fns `formatDayLabel(startIso,
  nowIso)` ("Today" | "Tomorrow" | "Sat, Sep 12"), `isEnded(post, nowIso)`,
  `isStartingSoon(post, nowIso)` (starts within 60 min, not yet started —
  orchestrator pin). FeedPage renders section headers in ascending
  start-of-day order; within the Today section: upcoming first (starts_at
  asc), ended demoted + grayed; "Starts soon" badge on the soonest upcoming.
  `nowIso` seam per filterFeed. No migration.
- **Status (ticket 02):** `playdates.status` text NOT NULL DEFAULT 'on' with
  CHECK IN ('on','rained_out','cancelled') (migration 0016). Host control
  lives ONLY in the "This is your post" panel (detail page); `setPlaydateStatus`
  in db.ts (host-only; RLS `playdates_update_host` is the wall — a non-host
  API write is a silent 0-row 2xx per the 0014 lesson, the client hides the
  control). Card + detail render muted "Rained out" / "Cancelled" states;
  events STAY in the feed (host can revert; no auto-expiry). Anon public
  surface (0015 `get_public_playdate`, 11 fields) UNCHANGED — status is
  authenticated-only in V3.
- **Weather (ticket 02):** Open-Meteo daily `precipitation_probability_max`
  for the post's host `home_zip` (V2 pin: post location = host's home_zip;
  lat/lng from the 0012 `zip_codes` seed map already loaded client-side).
  >= 50% (orchestrator pin) -> "Rain likely" ☔ badge. Best-effort: one fetch
  per distinct (zip, event-date), in-flight dedupe + module cache, retry on
  failure, NO caching of rejections (zip-cache lesson e0d3756), silently
  absent on error (no error state — zero pressure). No geolocation, no key.
  Fetch wrapper in db.ts; pure `rainBadgeLabel(probability: number | null)`
  in feed.ts.
- **ICS (ticket 03):** new `src/lib/ics.ts` — pure `buildIcs(post): string`
  (VEVENT; DTSTART/DTEND UTC from starts_at/ends_at; SUMMARY=title,
  LOCATION=place, DESCRIPTION=age_hint+details; RFC 5545 comma/semicolon
  escaping; CRLF line endings). Detail-page button beside Share (header
  action row) -> Blob download `playdate-<id>.ics`. Uses only
  public-surface fields -> shown in the signed-out view too (read-only; no
  new data exposure).
- **Retention (ticket 04):** `profiles.last_seen_at` timestamptz nullable
  (migration 0023; app-side update — FeedPage mount restamps when null or
  >= 1h stale, fire-and-forget; NO trigger; 0009's any-column moderator
  UPDATE can write it — documented in the migration header, harmless
  cursor). FeedPage banner (amber `rounded-xl border` pattern, ProfilePage
  :333): "N new families pinged your drop-ins" (N = going_pings on my posts
  created after last_seen_at); tap -> /profile (Your posts) + restamp.
  UserPage (self + /u/:handle): "Hosted N drop-ins" line near "Here since"
  (renders only when N > 0; the hardcoded "No posts yet." block stays for
  N = 0). Design verdict (parking lot 2026-09-09): computed behavioral
  history — no reviews, no vouching.
- **Guest list (ticket 05):** migration 0024 — SECURITY DEFINER
  `get_guest_list(playdate_id)` following the 0015 pattern (stable,
  `set search_path = public, pg_temp`, EXECUTE to authenticated only,
  `revoke ... from public`, DROP FUNCTION IF EXISTS + CREATE for
  idempotency). Returns the pingers' `profiles.display_name`s ordered by
  ping created_at, and ONLY when the caller is the host
  (`playdates.host_profile_id = auth.uid()`) or has pinged
  (`EXISTS going_pings` for the caller); empty result otherwise. The broad
  `going_pings_select_authenticated` (`using (true)`) STAYS — the count
  path (`getGoingCount`, db.ts:649) must keep working; regression-verified
  before/after apply (spec pin). Names never surface in feeds — cards
  unchanged. Detail-page block below the ping section: host view
  "Going: Sarah, Mia + 2 families" (max 3 names, then "+ N more"),
  attendee view "You, Sarah, Mia + 2 families", non-attendee view the
  unchanged count line; empty state hidden when count = 0. Pure seam
  `resolveGuestListVisibility(viewerIsHost, viewerHasPinged, count)` in
  feed.ts (spec pin). **Orchestrator trust review before live apply** —
  residual vector (any authenticated user can read going_pings rows
  (profile_id) + profiles (display_name) directly and reconstruct names)
  is documented in the 0018 header; accepted class: same personalization
  data as blocks.
- **Feedback overrides (2026-09-09, feedback/v3.md — origin-user pass + human calls):** card going line with up to 3 avatar circles (names stay detail-page-only) — overrides the V2 cards-count-only pin; host status options = On / Cancelled ("Rained out" removed; the Open-Meteo badge stays — an independent forecast); kid photos = YES (optional, owner-uploaded, profile-kids-list only — overrides the first-name-only pin, logged in task-state decisions); interests = free text (kid likes <=100, parent interests <=200); comment replies = one level, any authenticated user.

## Slices

### Slice 1: Feed day sections (ticket 01)

- **Objective:** the feed's "Today" stops being a lie: day section headers
  (Today / Tomorrow / weekday), ended events demoted + grayed within the
  Today section, "Starts soon" badge on the soonest upcoming. All
  client-side; no migration.
- **Files in scope:** `src/pages/FeedPage.tsx`, `src/components/DropInCard.tsx`,
  `src/pages/BrowsePage.tsx` (switched to the promoted fn), `src/lib/feed.ts`
  + `src/lib/feed.test.ts`, `e2e/` (golden-path assertions adapted only if
  they break on sectioning)
- **Approach:** promote `groupByDay` + add `formatDayLabel` / `isEnded` /
  `isStartingSoon` pure fns to feed.ts first (unit tests, nowIso seam);
  then FeedPage section rendering; DropInCard ended/soon styling;
  BrowsePage switched to the lib fn (no duplication).
- **Acceptance criteria:** per ticket 01 in `.scratch/v3/issues/01-feed-day-sections.md`
- **Verification command:** `npm run build && npm run test && npm run test:e2e`
- **Depends on:** nothing

### Slice 2: Host status + weather badge (ticket 02)

- **Objective:** hosts mark their event ON / RAINED OUT / CANCELLED (muted
  card + detail states, stays in the feed); best-effort "Rain likely" ☔
  badge from Open-Meteo for the host's home_zip. Migration 0016.
- **Files in scope:** `src/pages/PlaydateDetailPage.tsx`,
  `src/components/DropInCard.tsx`, `src/lib/db.ts` (`setPlaydateStatus` +
  weather fetch wrapper), `src/lib/feed.ts` (`rainBadgeLabel`),
  `src/lib/types.ts`, migration `supabase/migrations/0016_playdate_status.sql`,
  `e2e/host-status.e2e.ts` (new spec), `src/pages/FeedPage.tsx` (rain badge
  in Today-section), `src/lib/feed.test.ts` (rainBadgeLabel unit tests)
- **Approach:** migration first (code green, then orchestrator CDP apply);
  db.ts host-only writer + pure `rainBadgeLabel`; status control in the
  "This is your post" panel; muted states on card/detail; weather badge
  (detail + Today-section cards) with per-(zip,date) cache.
- **Acceptance criteria:** per ticket 02 in `.scratch/v3/issues/02-host-status-weather.md`
- **Verification command:** `npm run build && npm run test && npm run test:e2e`
- **Depends on:** nothing (serialized after slice 1 by the one-writer rule)

### Slice 3: Quick feedback batch (ticket 06)

- **Objective:** the origin-user's quick asks: card "going" check toggle, h1 "Near you", detail age-hint line out, status On/Cancelled (migration 0019), /new helper text out, ping button "Attend" → "✓ Going".
- **Files in scope:** src/components/DropInCard.tsx, src/pages/FeedPage.tsx, src/pages/PlaydateDetailPage.tsx, src/pages/NewPlaydatePage.tsx, src/lib/db.ts, src/lib/types.ts, e2e/host-status.e2e.ts (RAINED OUT → CANCELLED) + the heading-pin specs, migration supabase/migrations/0019_status_trim.sql
- **Approach:** ticket 06's ACs; 0019 re-CHECKs status to ('on','cancelled') + converts 'rained_out' rows to 'on' (DO-block idempotent); the type union narrows; e2e pins updated.
- **Acceptance criteria:** per ticket 06 in .scratch/v3/issues/06-quick-feedback-batch.md
- **Verification command:** npm run build && npm run test && npm run test:e2e
- **Depends on:** slice 2 (one-writer order)

### Slice 4: Card going circles (ticket 07)

- **Objective:** cards show who's coming: "N going" + up to 3 pinger avatar circles + "+N" (avatars only — names stay on the detail guest list per ticket 05). No migration.
- **Files in scope:** src/components/DropInCard.tsx, src/pages/FeedPage.tsx, src/lib/db.ts (listPingerAvatarsWithClient), src/lib/feed.ts (buildGoingLine), e2e/card-circles.e2e.ts (new spec)
- **Approach:** db query (going_pings + profiles avatar embed) + pure buildGoingLine seam first (unit tests), then the card line; the signed-out surface stays count-only.
- **Acceptance criteria:** per ticket 07 in .scratch/v3/issues/07-card-going-circles.md
- **Verification command:** npm run build && npm run test && npm run test:e2e
- **Depends on:** slice 3 (one-writer order)

### Slice 5: Add to calendar — ICS (ticket 03)

- **Objective:** "Add to calendar" on the detail page generates a valid ICS
  download from title/place/start/end/age_hint/details. Pure client-side,
  unit-testable; works signed-out too (public-surface fields only).
- **Files in scope:** `src/lib/ics.ts` + `src/lib/ics.test.ts` (new),
  `src/pages/PlaydateDetailPage.tsx`
- **Approach:** pure `buildIcs` first (RFC 5545: UTC dates, CRLF, escaping —
  unit tests); then Blob-download button beside Share in the header action
  row; visible in signed-in and signed-out views.
- **Acceptance criteria:** per ticket 03 in `.scratch/v3/issues/03-add-to-calendar-ics.md`
- **Verification command:** `npm run build && npm run test && npm run test:e2e`
- **Depends on:** serialized after slice 4 by the one-writer rule; both touch the detail page

### Slice 6: Host retention loop (ticket 04)

- **Objective:** hosts get a reason to come back: "N new families pinged
  your drop-ins" banner (last_seen_at cursor, migration 0023) + "Hosted N
  drop-ins" computed-history line on UserPage.
- **Files in scope:** `src/pages/FeedPage.tsx` (banner), `src/pages/UserPage.tsx`
  (count line), `src/lib/db.ts` (`countPingsOnMyPostsWithClient`,
  `countPostsByHostWithClient`, `touchLastSeen`), `src/lib/feed.ts`
  (`dueToRefreshLastSeen`), `src/lib/types.ts`, migration
  `supabase/migrations/0023_profiles_last_seen.sql`, `e2e/host-retention.e2e.ts`
  (new spec)
- **Approach:** migration first (CDP apply after code green); db.ts
  injected-client queries; FeedPage mount restamp (>= 1h throttle,
  fire-and-forget) + banner (ProfilePage :333 pattern); UserPage count line
  (N > 0 only).
- **Acceptance criteria:** per ticket 04 in `.scratch/v3/issues/04-host-retention.md`
- **Verification command:** `npm run build && npm run test && npm run test:e2e`
- **Depends on:** serialized after slice 5 by the one-writer rule

### Slice 7: Guest list — progressive disclosure on going pings (ticket 05)

- **Objective:** host sees who pinged their event by name; pingers see
  co-attendee names; everyone else counts only. Migration 0024
  (`get_guest_list` SECURITY DEFINER, 0015 pattern); orchestrator trust
  review before live apply.
- **Files in scope:** `src/pages/PlaydateDetailPage.tsx` (guest-list block),
  `src/lib/db.ts` (`fetchGuestListWithClient`), `src/lib/feed.ts`
  (`resolveGuestListVisibility`), `src/lib/types.ts`, migration
  `supabase/migrations/0024_get_guest_list.sql`, `e2e/guest-list.e2e.ts`
  (new spec)
- **Approach:** migration first (function only; broad SELECT policy stays);
  pure visibility seam (spec pin, unit tests); detail-page block below the
  ping section; count-path regression (getGoingCount before/after apply) +
  real-DB probes (host reads names, co-pinger reads names, third viewer
  gets no names); e2e spec: host sees guest list on a post with 2 pings.
- **Acceptance criteria:** per ticket 05 in `.scratch/v3/issues/05-guest-list.md`
  — plus the orchestrator trust review before live apply (residual vector
  documented in the 0018 header)
- **Verification command:** `npm run build && npm run test && npm run test:e2e`
- **Depends on:** slices 1-6 (one-writer order) + founder read of ticket 05 (done 2026-09-09)

## Risks / open questions

- **Dispatch gate (context gate, parking lot):** nothing here ships until
  the two-user beta (plan-v2 slice 3.5) gives the green light — beta
  feedback may reshuffle this list.
- **Ticket 05 awaits the founder's read** — slice 5 is blocked on it.
- **Weather is best-effort:** Open-Meteo is an external dependency; badge
  absence on failure is by design (no error state, zero pressure). CORS is
  assumed OK (public CORS API) — the first live check confirms.
- **Signed-out surface:** status intentionally stays authenticated-only
  (the 0015 pin holds: 11 public fields). A signed-out parent on a shared
  link cannot see "Rained out" — founder call to widen, not blocking.
- **Guest-list residual vector:** any authenticated user can read
  going_pings rows (profile_id) + profiles (display_name) directly — a
  determined viewer could reconstruct names. Documented in the 0024 header;
  accepted (same personalization-data class as blocks). The slice-5 trust
  review re-confirms before apply.
- **last_seen_at writable by moderators** (0009 any-column UPDATE policy) —
  harmless cursor; documented in the 0023 header, no tightening in V3.
- **Feed dedupe risk:** BrowsePage's `groupByDay` is page-local; slice 1
  must promote it to feed.ts and switch BrowsePage (reviewer enforces).
- **e2e artifacts:** specs hit the live Supabase project serially and share
  the marker account — schedule a marker sweep after V3 (precedent: the V2
  full sweep 2026-09-09).
- **Kid-photo pin override (human-approved 2026-09-09):** a minor's photo in a public parents' app — the first-name-only pin is overridden WITH RAILS (optional per kid, owner-uploaded, shown only in the profile kids list, avatars bucket owner-scoped writes). The reviewer audits the bucket policy in 0021 before apply.
- **Card circles expose pinger avatars in the feed** (human-requested 2026-09-09; names stay detail-only per ticket 05's amended AC).

---

## Status log (orchestrator appends after every phase transition)

- 2026-09-09 — plan-v3 drafted from `.scratch/v3/parking-lot.md`
  (priorities 1-4) + `.scratch/guest-list/spec.md`; tickets 01-05 created in
  `.scratch/v3/issues/` (05 pending founder read). No builder dispatch until
  the two-user beta green light (plan-v2 slice 3.5). V3 migration numbering
  starts at 0016 (latest live = 0015, confirmed 2026-09-09).
- 2026-09-09 — Human green light: "approve and run 1 and 2" — ticket 05
  approved (status flipped to ready-for-agent); V3 slices 1-2 dispatched
  (the green light supersedes the two-user beta gate for these slices; the
  beta itself remains open, no deadline).
- 2026-09-09 — Slices 1-2 COMPLETE: 0449de6 (feed day sections;
  160/160 unit + 12/12 e2e, reviewer PASS) + 7a705c8 (host status +
  weather; 164/164 unit + 13/13 e2e, reviewer PASS). 0016 applied live
  via the dashboard SQL API fallback (the Monaco SPA no longer hydrates
  in the CDP Chrome — task-state tooling note). Live probes PASS: host
  status round-trip (on→rained_out→on), non-host write silent 204
  0-row (RLS wall), Open-Meteo reachable (HTTP 200). Slices 3-5 await
  the human's green light (ticket 05 approved 2026-09-09).
- 2026-09-09 — FEEDBACK TRIAGE: origin-user annotation pass (feedback/v3.md, 12 items) -> ticket 06 (quick batch: card check, "Near you" h1, detail age line out, Rained-out status out + 0019, /new helper out, Attend/✓Going copy) + ticket 07 (card going circles); new tickets 08 (address + maps, 0020), 09 (kids v3: picker + photos + interests, 0021), 10 (one-level replies, 0022). Dispatch: 06 -> 07 ("go 1-2" scope), then 08 -> 09 -> 10, then ICS/retention/guest-list renumbered to slices 5-7 (migrations 0023/0024). Human calls: kid photos YES (pin override logged), interests free text, replies open to anyone (one level).
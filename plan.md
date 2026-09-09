# Implementation Plan: Playdate — drop-in meetups for Seattle parents

> Executor-grade plan. Every slice is executable without interpretation.
> Product soul (from the human's brief): recreate the moms' group chat at
> city scale — open invitations, zero pressure. Someone posts "we'll be at
> the park 3–5, come by if you like." Showing up is welcome; not showing up
> is nobody's business. The app must never reintroduce the pressure the
> group chat avoids.

## Goal

A mobile-first web app (installable PWA) where Seattle parents post drop-in
playdates ("at this playground, 3–5, come by") and browse what's happening
today in their neighborhoods. V1 "done" = a parent can sign up, join
neighborhoods, post a drop-in, see today's drop-ins near them, and ping
"we're going" — all verified by passing checks and working UI on a phone
viewport.

## Non-goals (V1)

- No RSVP/commitment tracking — the drop-in model *replaces* it (a lightweight
  optional "we're going" ping exists, but no one ever waits on a reply)
- No messaging/DMs, no comments (V2 candidates)
- No maps or GPS — neighborhoods are user-chosen tags (V2: map view)
- No notifications in V1 (PWA push is the V2 candidate)
- No photos (V2)
- No app-store apps — PWA install is the mobile path (DECIDED)
- No deployment — local for now (DECISION 3 stands, V1.5)

## Interfaces

Pinned contracts every builder must respect (reviewers enforce these):

- **Stack:** Vite + React 18 + TypeScript + Tailwind CSS v4, npm
- **Mobile-first:** every screen designed at 375px first; installable PWA
  (manifest + service worker via `vite-plugin-pwa`)
- **Backend:** Supabase (Postgres + Auth + `@supabase/supabase-js`);
  credentials already in `.env` (verified live)
- **Data model (Supabase tables):**
  - `profiles`: id (= auth user id), display_name (persistent public handle),
    created_at
  - `neighborhoods`: id, name (seeded list of ~20 Seattle neighborhoods,
    read-only in V1)
  - `memberships`: profile_id, neighborhood_id, unique pair
  - `playdates`: id, host_profile_id, title (short, e.g. "Playground time
    at Green Lake"), place (text), neighborhood_id, starts_at (timestamptz),
    ends_at (timestamptz), age_hint (text, nullable — e.g. "best for 2-5",
    advisory only), details (text, nullable)
  - `going_pings`: playdate_id, profile_id, unique pair — optional "we're
    going"; counts shown only, no per-person list required by default
  - `reports`: id, reporter_profile_id, playdate_id (nullable),
    reported_profile_id (nullable), reason (text)
  - `blocks`: blocker_profile_id, blocked_profile_id, unique pair
- **Privacy & trust rules (RLS in Supabase, mirrored in UI):**
  - Everything requires an authenticated session
  - Posts show the host's persistent `display_name` (real-name handle
    chosen at signup) — no anonymous posting in V1
  - Blocked users' posts are filtered out of the viewer's feed
  - `reports` are visible to moderators only
- **Moderation (V1-minimum, open sign-up):**
  - Report button on every post and profile
  - Block: blocked users never see each other's posts (DB-level filter)
  - `moderators` boolean flag on `profiles`; the human founder account gets
    it via a one-time SQL statement (documented, executed by human)
  - Moderator screen: list reports, hide a post (`hidden_at` timestamp on
    playdates), ban a profile (`banned_at` on profiles)
- **Layout:** `src/pages/`, `src/components/`, `src/lib/` — Supabase client
  + all data access in `src/lib/db.ts`, types in `src/lib/types.ts`
- **Routes:** `/` (today's drop-ins), `/browse` (all neighborhoods/days),
  `/playdate/:id`, `/new`, `/profile` (own family), `/u/:handle` (others),
  `/login`, `/mod` (moderators only)
- **Checks (must pass on every slice):** `npm run build && npm run test`

## Slices

### Slice 1: tracer bullet — scaffold + auth + PWA skeleton

- **Objective:** app scaffolds; Tailwind + router + Supabase client + PWA
  plugin wired; login/signup works against the real project; signup collects
  `display_name` (the persistent handle); one protected route redirects to
  `/login` when signed out.
- **Files in scope:** everything `npm create vite@latest` generates,
  `vite-plugin-pwa` setup (manifest: name "Playdate", theme color,
  192/512 icons from placeholder assets), `src/lib/db.ts`, `src/lib/types.ts`,
  `src/pages/LoginPage.tsx` (login + signup + display_name), `src/pages/`
  placeholders for the routes above, router, `.gitignore` (add `.env` before
  first commit)
- **Approach:** official Vite scaffolder; add deps (tailwind, react-router,
  supabase-js, vite-plugin-pwa); auth state via supabase session listener
- **Acceptance criteria:**
  - `npm run build` exits 0; dist contains manifest.webmanifest
  - visiting `/` signed out redirects to `/login`; signup (email + password +
    display_name) → redirect to `/` authenticated; profile row created
  - one test covers the auth-redirect logic with a mocked supabase client
- **Verification command:** `npm run build && npm run test`
- **Depends on:** nothing (credentials verified live 2026-09-04)

### Slice 2: neighborhoods + profiles

- **Objective:** after signup, onboarding asks "pick your neighborhoods"
  (multi-select from seeded list, ≥1 required); `/profile` edits display_name
  and memberships; `/u/:handle` shows a profile's posts count only (minimal
  public face).
- **Files in scope:** `src/pages/OnboardingPage.tsx`, `src/pages/ProfilePage.tsx`,
  `src/pages/UserPage.tsx`, `src/lib/db.ts` (memberships/profile CRUD),
  migration for `neighborhoods` (seed ~20 Seattle names) + `memberships` +
  `profiles` RLS
- **Acceptance criteria:**
  - signup → onboarding → feed flow works; memberships persist
  - display_name is unique (DB constraint); profile edits reflect in header
  - build + tests pass (onboarding gating logic unit-tested)
- **Verification command:** `npm run build && npm run test`
- **Depends on:** slice 1

### Slice 3: drop-in feed + posting

- **Objective:** `/` shows today's drop-ins in the user's neighborhoods
  (time-ordered, "happening now" badge for live ones, then upcoming);
  `/browse` = all days filtered by neighborhood chips; `/new` posts a drop-in
  (title, place, neighborhood, start/end time, optional age_hint + details).
  Validation: end after start; title ≤ 80 chars.
- **Files in scope:** `src/pages/FeedPage.tsx`, `src/pages/BrowsePage.tsx`,
  `src/pages/NewPlaydatePage.tsx`, `src/components/DropInCard.tsx`,
  `src/lib/db.ts` (playdate CRUD + feed query), migration for `playdates` + RLS
- **Acceptance criteria:**
  - feed shows only user's neighborhoods' posts, filtered to starts_at >=
    today 00:00, ordered by starts_at; happening-now badge correct
  - created post appears in feed immediately; invalid form shows inline
    errors, nothing saved
  - feed respects blocks (host-blocked-by-viewer posts never returned)
  - build + tests pass (feed filter + form validation unit-tested)
- **Verification command:** `npm run build && npm run test`
- **Depends on:** slice 2

### Slice 4: detail page + going-pings + trust basics

- **Objective:** `/playdate/:id` shows full details + host handle linking to
  `/u/:handle`; "We're going" toggle writes/removes a `going_pings` row;
  pings render as a friendly count ("3 families going — come say hi"); every
  post and profile gets a Report flow; block/unblock on user pages; blocked
  content filtering enforced.
- **Files in scope:** `src/pages/PlaydateDetailPage.tsx`, `src/pages/UserPage.tsx`
  (block control), `src/components/ReportDialog.tsx`, `src/lib/db.ts` (pings,
  reports, blocks), migrations for `going_pings` + `reports` + `blocks` + RLS
- **Acceptance criteria:**
  - ping toggles persist; count updates; no per-person attendee list shown
  - report captures reason and is invisible to non-moderators
  - after blocking, blocked user's posts never appear in viewer's feed/detail
  - host cannot ping own post
  - build + tests pass (ping toggle + block filter unit-tested)
- **Verification command:** `npm run build && npm run test`
- **Depends on:** slice 3

### Slice 5: moderator tools + mobile polish

- **Objective:** `/mod` for moderator-flagged accounts: report list, hide
  post, ban profile; human founder account flagged via documented one-time
  SQL. Then phone polish: all routes usable at 375px, empty states designed
  ("Nothing happening in Wallingford today — post the first one"), loading
  states.
- **Files in scope:** `src/pages/ModPage.tsx`, `src/components/*` styling
  passes, migration adding `hidden_at`/`banned_at` + moderator RLS
- **Acceptance criteria:**
  - hidden posts vanish from feed/detail for everyone; banned profiles
    cannot sign in (session rejected)
  - non-moderator cannot reach `/mod` (route guard + RLS)
  - no horizontal scroll at 375px on any route; empty states present
  - build + tests pass (mod gating unit-tested)
- **Verification command:** `npm run build && npm run test`
- **Depends on:** slice 4

## Risks / open questions

- **Trust at scale is the #1 product risk** (open sign-up + real handles +
  report/block + moderator tools is the V1 answer; invite-only pods are the
  V2 lever if moderation proves too hot).
- Seeded neighborhood list must be real Seattle neighborhoods (human
  sanity-check the seed list at slice 2 review).
- PWA install prompts vary by browser; V1 ships the manifest + minimal SW
  and does not promise offline support.
- DECISION 3 (deployment target) deferred to V1.5 — not blocking.

---

## Status log (orchestrator appends after every phase transition)

- 2026-09-04 — Plan v1 (RSVP model) drafted.
- 2026-09-04 — Plan REWRITTEN after human's product brief: drop-in model
  replaces RSVPs; neighborhoods replace age-filtering as discovery; PWA +
  mobile-first added; moderation (reports/blocks/hidden/banned) added to V1.
  DECISION 1 resolved (Supabase live). Slice 1 unblocked.
- 2026-09-09 — Slice 4 complete: detail page + going-pings + report/block UI
  (f978858). Live check caught createReport 42501 (RETURNING under
  moderators-only SELECT RLS) → fixed with plain insert (1c8e5f4);
  0007/0008 applied live via CDP; 49/49 tests. Slice 5 unblocked;
  profiles.moderators now exists via 0008.
- 2026-09-09 — Slice 5 complete: /mod (report list, hide, ban) +
  banned-session gate + 375px/empty/loading polish (2eacd47). 0009/0010
  applied live via CDP; live check PASS (hide + ban enforced, host
  self-ping rejected 400 P0001 per the human-decided trigger). 65/65
  tests. **V1 DONE** — all five slices complete. Remaining human items:
  founder-flag UPDATE (statement in 0009 header); optional 0011
  (self-elevation guard) + display_name length cap parked as human calls.
- 2026-09-09 — Founder flag attempt: UPDATE could not run — no founder
  profile exists (live profiles = 9 marker rows only, verified via CDP
  SELECT). Waiting on human sign-up, then orchestrator applies the flag.
  Tooling: browser-use LLM loop unusable on NInfer (vision/JSON 400s);
  LLM-free replacement committed at scripts/cdp-sql-runner.py (verified
  live on a SELECT).
- 2026-09-09 — Human signed up ("Jon Meisburg"); first real-user session
  exposed PGRST201: 0007's going_pings FK gave PostgREST two playdates→
  profiles paths, so every `host:profiles!inner` embed 400s (feed + detail).
  Fixed by pinning the embed to the FK hint
  (`profiles!playdates_host_profile_id_fkey`, feed.ts + db.ts:483; commit
  80f9b07; verified live with a real auth token).   Lesson: mock-client tests
  can't catch embed-ambiguity — real-DB smoke test required when a migration
  adds an FK between two already-FK-linked tables. Founder flag applied +
  verified via cdp-sql-runner (moderators=true); /mod is live.
- 2026-09-09 — V2 FEEDBACK LOG (founder, first-user pass): (1) ping toggle
  invisible on own post — host view needs explicit "this is your post"
  framing; (2) kids on profile (names/gender/ages) populating attendee +
  host views; (3) DM/messaging host↔attendee (V1 non-goal, now wanted);
  (4) report icon reads as "like" — rework; (5) time entry UX — 30-min
  increments instead of raw datetime pickers; (6) duplicate a past drop-in;
  (7) share to Signal/Messenger (Web Share API); (8) public post view for
  signed-out users + signup-gated "I'm coming" (privacy-posture change);
  (9) onboarding: photo + bio; (10) profile photos; (11) discovery by
  home-neighborhood + drive-mile radius instead of followed-neighborhood
  tags. Existing-but-invisible to founder: ping toggle (host-hidden), host
  link on cards.
- 2026-09-09 — V2 DECISIONS RESOLVED (founder): kids = FIRST NAME + AGE
  only, never full names or gender (privacy pin holds); messaging =
  public per-event COMMENTS with host replies (no DMs, zero-pressure soul
  preserved); discovery = home ZIP code + drive-radius miles (no GPS —
  follows the OfferUp/Facebook-Marketplace pattern, founder's call after
  weighing browser-geolocation tradeoffs).
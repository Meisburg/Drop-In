# Implementation Plan: Playdate V2 — radius discovery, rich profiles, comments, share, public view

> Owned by the orchestrator. Written BEFORE any builder dispatch. Derived
> from `.scratch/v2/spec.md` + tickets in `.scratch/v2/issues/` (all
> ready-for-agent, human-approved breakdown 2026-09-09). Source V1 plan and
> its pinned Interfaces remain in force where not overridden here.

## Goal

A parent can discover drop-ins within a drive radius of their home zip
(never neighborhood-following), post one in seconds with a start-stepper +
duration chips (or duplicate a past post), see rich profiles (avatar, bio,
kids: first name + age) on hosts and attendees, ask questions via public
event comments, share an event into Signal/Messenger, and — last — open a
shared event link signed-out with every action prompting sign-up. All of it
verified by `npm run build && npm run test` plus per-slice live checks
against the real Supabase project, and working at 375px.

## Non-goals

- App-store packaging (PWA install stays the phone path)
- Deployment/hosting (DECISION 3 stands; share URLs are placeholder-safe)
- DMs, GPS, kid full names/gender/photos, comment editing/threading/notifications
- Post editing (duplicate only, as in V1)

## Interfaces

Pinned contracts every builder must respect (reviewers enforce these):

- **Stack:** unchanged from V1 (Vite + React 18 + TS + Tailwind v4, Supabase,
  PWA). Checks on every slice: `npm run build && npm run test`
- **Seams (testing):** pure logic lives in `src/lib/feed.ts` / `trust.ts` /
  `moderation.ts` (+ new pure functions colocated there); Supabase-facing
  functions take the injected-client pattern; validators are pure. Mock-client
  tests cannot catch embed ambiguity — any FK added between already-linked
  tables needs a real-DB REST smoke probe before slice close (PGRST201 lesson)
- **Migrations:** 0011+ in `supabase/migrations/`, DO-block idempotency
  (2026-09-04 lesson), FK hints pinned in embeds; orchestrator applies live
  via CDP after code green (`scripts/cdp-sql-runner.py`)
- **V2 data model additions:**
  - `profiles`: + `home_zip` (text, nullable), `radius_miles` (int, default 5),
    `avatar_url` (text, nullable), `bio` (text, nullable, ≤500)
  - `zip_codes`: zip (pk), lat, lng — seeded, US gazetteer extract
  - `kids`: id, profile_id, first_name, age (int), max 5 per profile (app-enforced)
  - `comments`: id, playdate_id, author_profile_id, body (≤500), created_at,
    hidden_at (nullable)
  - Supabase Storage bucket `avatars`: public read, owner-scoped write (`<uid>/avatar`)
- **Env:** `VITE_PUBLIC_BASE_URL` added to `.env.example` + code reads it with a
  localhost fallback (share URLs placeholder-safe before deployment)
- **Trust pins (unchanged):** kid info = first name + age only; comments stay
  authenticated-only in slices 1–4 (anon read lands with slice 5 only);
  moderators hide comments via hidden_at; the self-elevation trigger closes
  the parked escalation hole in slice 2's migration pass
- **Radius:** haversine in plain SQL (no PostGIS); options 2/5/10/20/35, default 5
- **Time entry:** start = date + 30-min-stepper time; duration chips 1h/1.5h/
  2h/3h; `ends_at` computed, never typed
- **Privacy pins:** public surface (slice 5) = playdate row + host handle +
  avatar + going count ONLY; /u/:handle and comments stay authenticated-only

## Slices

### Slice 1: Quick UX batch (ticket 01)

- **Objective:** card flag removed; host sees "This is your post"; /new gets
  start steppers + duration chips (end computed); Duplicate on own posts.
- **Files in scope:** `src/components/DropInCard.tsx`, `src/pages/PlaydateDetailPage.tsx`,
  `src/pages/NewPlaydatePage.tsx`, `src/pages/ProfilePage.tsx`, `src/lib/feed.ts`
  (validators + duration math), `src/lib/types.ts`, router state for duplicate prefill
- **Approach:** pure validator rework first (unit tests), then UI; duplicate
  navigates to /new with router state, date/time fields reset; no migrations.
- **Acceptance criteria:** per ticket 01 in `.scratch/v2/issues/01-quick-ux-batch.md`
- **Verification command:** `npm run build && npm run test`
- **Depends on:** nothing

### Slice 2: Profiles v2 (ticket 02)

- **Objective:** avatar (client-resized 256px, ≤5 MB) + bio + kids
  (structured, first name + age, max 5) on profiles and everywhere a host
  line renders; onboarding optional-complete step + /profile nudge banner;
  self-elevation trigger ships in this slice's migration (0011).
- **Files in scope:** `src/pages/OnboardingPage.tsx`, `src/pages/ProfilePage.tsx`,
  `src/pages/UserPage.tsx`, `src/pages/PlaydateDetailPage.tsx`,
  `src/components/DropInCard.tsx`, `src/lib/db.ts`, `src/lib/types.ts`,
  migration 0011 (profiles columns + kids table + storage bucket + RLS +
  self-elevation trigger)
- **Acceptance criteria:** per ticket 02 in `.scratch/v2/issues/02-profiles-v2.md`
- **Verification command:** `npm run build && npm run test`
- **Depends on:** nothing (serialized after slice 1 by the one-writer rule)

### Slice 3: Zip + radius discovery (ticket 03)

- **Objective:** onboarding zip+radius replaces neighborhood picker; feed +
  browse filter by haversine distance with per-post "N mi"; neighborhoods
  become display labels; /profile edits zip + radius; migration 0012
  (zip_codes seed + profiles columns).
- **Files in scope:** `src/pages/OnboardingPage.tsx`, `src/pages/ProfilePage.tsx`,
  `src/pages/FeedPage.tsx`, `src/pages/BrowsePage.tsx`, `src/lib/db.ts`,
  `src/lib/feed.ts`, `src/lib/types.ts`, migration 0012
- **Acceptance criteria:** per ticket 03 in `.scratch/v2/issues/03-zip-radius-discovery.md`
- **Verification command:** `npm run build && npm run test`
- **Depends on:** slice 1

### Slice 3.5 (human gate, no builder): two-user beta

- **Objective:** founder + one other parent install the PWA on real phones,
  post → ping → comment (after slice 4, re-check) → share a link between
  real Signal/Messenger chats. Founder's hands-on gate before slice 4's
  trust surface widens. Orchestrator records outcomes in task-state.md.
- **Depends on:** slice 3

### Slice 4: Comments on events (ticket 04)

- **Objective:** public per-event comment thread: signed-in parents comment,
  host/author delete, moderator hide; avatars in the list; migration 0013.
- **Files in scope:** `src/pages/PlaydateDetailPage.tsx`, `src/lib/db.ts`,
  `src/lib/trust.ts` (or colocated pure comment-permission logic), `src/lib/types.ts`,
  ModPage comment-hide extension, migration 0013
- **Acceptance criteria:** per ticket 04 in `.scratch/v2/issues/04-comments.md`
- **Verification command:** `npm run build && npm run test`
- **Depends on:** slices 2 + 3

### Slice 5: Share + public event view (ticket 05)

- **Objective:** share (Web Share API + copy-link) with `VITE_PUBLIC_BASE_URL`;
  signed-out detail view (post content only); signup-gated actions with
  return-path completion of the "I'm coming" ping; migration 0014 (anon
  SELECT on playdates + join reads).
- **Files in scope:** `src/pages/PlaydateDetailPage.tsx`, `src/App.tsx` (route
  guard adjustments), `src/lib/db.ts`, `src/lib/trust.ts`, `.env.example`,
  migration 0014
- **Acceptance criteria:** per ticket 05 in `.scratch/v2/issues/05-share-public-view.md`
  — plus orchestrator trust review before live apply
- **Verification command:** `npm run build && npm run test`
- **Depends on:** slices 2, 3, 4 + beta gate

## Risks / open questions

- Zip seed size: full US gazetteer is ~41K rows — acceptable as a one-time
  seed; if the seed migration balloons the repo, ship a WA-only extract first
  (builder flags before shipping, orchestrator decides).
- Anon read (slice 5) widens the trust surface; orchestrator reviews
  block-filter and enumeration implications before live apply (pinned above).
- Avatar storage costs nothing at V2 scale but the bucket policy must be
  owner-scoped (no cross-user writes) — reviewer audits the policy DDL.
- Comment delete vs hide semantics: deletes are hard deletes (V1 posture),
  hides are moderator soft-hides — do not conflate in RLS.

---

## Status log (orchestrator appends after every phase transition)

- 2026-09-09 — plan-v2 drafted from approved tickets (01–05) + spec; slice 1
  unblocked; dev agent dispatch next.
- 2026-09-09 — Slice 1 code complete: 8bdaeb2 (report flag off cards, "This
  is your post" host panel, 30-min steppers + duration chips, duplicate
  prefill via router state; 12 new pure-function tests). Orchestrator
  re-verified: build exit 0, 77/77 tests. No migrations (none planned).
  Ticket 01 checked in tracker. Next: human live check → slice 2 dispatch.
- 2026-09-09 — E2E foundation approved (ticket 00, human). Playwright (Chromium, vite preview, marker storageState) gates the e2e specs of slices 2–5; standing rule: every V2 slice ships 1–2 e2e specs and the verifier runs npx playwright test alongside the pinned gate.
- 2026-09-09 — V2 slice 2 (profiles v2, ticket 02) complete: avatars (client 256px/≤5MB; avatars bucket owner-scoped write / public read) + bio (≤500) + structured kids (first name + age, max 5; privacy pin held — no full names/gender) + onboarding optional step + /profile nudge banner; migration 0011 (profiles cols + kids table + avatars bucket + self-elevation trigger). Commits b0981b1 + c389ce4 (e2e) + 4f3cc72 (reviewer fix: trigger non-JWT pass-through). 102/102 unit, 6/6 e2e. 0011 + trigger fix applied live via CDP; live proofs: non-mod self-elevation 400 P0001 (V1 hole still closed) + postgres ban path (regression fixed) + smoke probes (profiles/kids/avatars 200). Marker lv6-1788991152. Next: slice 3 (zip + radius, ticket 03 + migration 0012).
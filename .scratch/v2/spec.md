# Spec: Playdate V2 — radius discovery, rich profiles, comments, share, public view

Status: ready-for-agent
Feature slug: `v2`
Date: 2026-09-09
Source: founder first-user feedback (V1 complete, all 5 slices live) + grilling session 2026-09-09 (16 decisions, all recommended answers accepted)

## Problem Statement

The founder used Playdate V1 as its first real parent and hit friction in six places:

1. **Discovery doesn't match how parents think.** Following specific neighborhood tags is the wrong mental model — "where would I drive to" is measured in miles from home, not by neighborhood name. (Compare: OfferUp / Facebook Marketplace ask zip + miles.)
2. **Profiles are empty shells.** A host is just a handle. Meeting strangers requires comfort: a face (photo), a self-description, and knowing their kids' rough ages. The founder explicitly wants attendee/host context populated with kid info — first names + ages only, privacy-first.
3. **Time entry is hostile.** Raw datetime-local pickers for start AND end are slow and error-prone; drop-ins are duration-shaped in real life ("3 to 5"), and 30-minute granularity is all parents need.
4. **Recurring drop-ins are tedious.** Parents re-post the same park meetup weekly; there is no duplicate.
5. **The app is an island.** Parents' real social graph lives in Signal and Facebook Messenger group chats; there is no way to fling an event into those chats, and people without the app who receive a link hit a login wall.
6. **The report flag misleads.** A flag icon on every card reads as "favorite/like," not "report." Trust UX should be unambiguous.

Also: the ping toggle was invisible to the host on their own post (by design, but the host view gives no explanation — a discoverability bug), and comments/questions about an event had no home (DMs rejected as pressure).

## Solution

Rebuild discovery around **home zip code + drive radius** (typed, no GPS). Replace the onboarding neighborhood picker with zip + radius (default 5 mi); the feed shows everything within the radius; neighborhoods remain as display labels on posts only. Enrich profiles with **photo, bio, and kids (structured rows: first name + age, max 5)** — avatars surface on host lines everywhere. Replace the two datetime pickers with a **start-time stepper + duration chips** (30-minute steps). Add **Duplicate** on your own posts. Add **public comments on events** (host replies visible to all; any signed-in parent comments). Add **share** (Web Share API + copy-link) driven by an env-pinned base URL. Finally, make the **event detail page publicly viewable** (signed-out), with every action ("I'm coming," commenting) prompting sign-up — sequenced last, after the two-user beta.

## User Stories

1. As a parent, I want to enter my home zip code at onboarding, so that discovery matches how I think about distance.
2. As a parent, I want to pick a drive radius (2/5/10/20/35 miles), so that the feed matches what I'd actually travel.
3. As a parent, I want my zip + radius editable in /profile, so that a move (or generosity) updates my feed.
4. As a parent, I want the feed to show every drop-in within my radius regardless of neighborhood, so that I never miss something nearby.
5. As a parent, I want neighborhood names to still appear on posts as labels, so that I recognize where things are ("Ballard", "Green Lake park").
6. As a parent, I want each post to show how far away it is ("4 mi"), so that I can triage at a glance.
7. As a parent, I want to enter a start time with 30-minute steppers, so that I never type a time.
8. As a parent, I want to pick duration from chips (1h/1.5h/2h/3h), so that setting the window takes two taps.
9. As a parent, I want a Duplicate button on my own posts, so that my weekly park meetup takes 15 seconds to re-post.
10. As a parent, I want duplicate to force me to re-pick date/time, so that I never accidentally re-post a stale event.
11. As a host, I want my own post's detail page to say "This is your post," so that I understand why there's no "We're going" button on it.
12. As a parent, I want a photo and short bio on my profile, so that people know who they're meeting.
13. As a parent, I want prompted-but-optional profile completion at onboarding, so that I can join fast and finish later without a wall.
14. As a parent, I want to list my kids (first name + age, max 5) on my profile, so that other parents can judge age-fit.
15. As a parent, I want to see a host's face, bio, and kids before going to their event, so that strangers feel less like strangers.
16. As a parent, I want a small host avatar on feed cards, so that posts feel human at a glance.
17. As a parent, I want to comment a question on an event, so that I can ask "is parking okay?" without DM pressure.
18. As a host, I want to reply to comments on my event, so that one answer benefits everyone with the same question.
19. As a parent, I want to delete my own comment, so that I can clean up a mispost.
20. As a host, I want to delete comments on my own event, so that I can curate my event's thread.
21. As a moderator, I want to hide an individual comment, so that I can enforce standards without banning anyone.
22. As a parent, I want a Share button on every event, so that I can fling it into my Signal/Messenger group chats.
23. As a parent, I want a copy-link fallback, so that share works even where the Web Share API doesn't (desktop browsers).
24. As a parent without an account, I want to open a shared event link and read the event, so that I can decide whether to join.
25. As a parent without an account, I want clicking "I'm coming" to prompt me to sign up, so that the app converts me at the moment of intent.
26. As a parent without an account, I want NOT to see comments or full host profiles, so that the community layer stays protected.
27. As a parent, I want the report affordance out of my face on cards, so that feed cards stay clean and unambiguous.
28. As a parent, I want report to live on the detail page behind clear wording, so that I report deliberately, not by accident.
29. As a moderator, I want the report workflow unchanged in V2 (reports still flow to /mod), so that trust tooling doesn't regress.
30. As a parent, I want the app to stay installable as a PWA on Android and iOS home screens, so that "app" means add-to-home-screen, not app stores.
31. As the founder, I want kids' full names and gender to remain out of the product, so that the privacy posture never erodes.
32. As a parent, I want an avatar upload capped at 5 MB and auto-resized to 256px, so that uploads stay fast and storage stays cheap.

## Implementation Decisions

- **Discovery model:** `profiles` gains `home_zip` (text) and `radius_miles` (int, default 5). A seeded `zip_codes` table maps US zip → lat/lng (seed source: a public-domain US Census gazetteer extract, one-time seed migration). Feed filtering moves from `neighborhood_id IN (...)` to a haversine distance filter in SQL (plain SQL formula, no PostGIS). Neighborhoods stay in the schema as display labels; the onboarding neighborhood picker is replaced by zip + radius (memberships table and rows remain, undeployed from the filter path — no destructive migration).
- **Feed shape:** `listTodayFeed` / browse queries take the viewer's zip+radius and compute `distance_miles` per row; the pure `filterFeed` re-filter gains a distance predicate (existing seam, extended). Feed ordering stays by `starts_at`; distance is display-only in V2.
- **Time entry:** /new's two datetime-local inputs become one start-time stepper (30-min increments, date + hour/minute controls) + duration chips (1h/1.5h/2h/3h). `ends_at` is computed, never typed. Validation keeps "end after start" trivially true; `validatePlaydateForm` is reworked accordingly (pure function, unit-tested).
- **Duplicate:** a "Duplicate" action on your own posts (detail page + /profile) navigates to /new with all fields prefilled except date/time, which always require re-entry. Implemented via router state, no new tables.
- **Host view:** detail page shows an explicit "This is your post" panel (with the going count) for hosts — replacing the bare count line.
- **Profiles v2:** `profiles` gains `avatar_url` (text, nullable) and `bio` (text, nullable, length-capped ~500). A new `kids` table (id, profile_id, first_name, age int, unique (profile_id, first_name, age), max 5 rows per profile enforced in app logic). Profile edit UI and /u/:handle rendering add photo, bio, kids (first name + age only — never full name, never gender, pinned by founder decision).
- **Avatars:** Supabase Storage bucket `avatars` (public read), client-side resize to 256px square before upload, ≤5 MB input cap, ownership-scoped upload RLS (`{uid}/avatar` path convention). Onboarding makes photo+bio optional with a persistent nudge banner on /profile until complete.
- **Comments:** new `comments` table (id, playdate_id, author_profile_id, body text ≤ 500, created_at, hidden_at nullable). RLS: authenticated select (non-hidden), author-only insert, author-or-host delete, moderator-only update(hidden_at). Any signed-in user comments; host replies are ordinary comments (no thread tree in V2 — flat list, chronological). Moderators hide individual comments (extends the /mod model). Detail page renders the comment thread below the ping section.
- **Share:** Web Share API (`navigator.share`) with copy-link fallback; the shared URL is `${VITE_PUBLIC_BASE_URL}/playdate/:id` (new env var, placeholder-safe — deployment remains DECISION 3, untouched).
- **Public view (last slice):** detail-page SELECT policy for `anon` role on playdates (+ neighborhoods/profiles join reads needed to render one post); host profile pages and comments remain authenticated-only. Signed-out detail page renders read-only post content; every action surface ("We're going", comment box, report) renders a "Sign up to join in" prompt that routes to /login with a return path. No enumeration mitigations beyond V1 (IDs are already UUIDs); trust posture reviewed by the orchestrator before apply.
- **Report UX rework:** the card flag icon is removed entirely; report lives on the detail page (existing Report button, kept) and UserPage. Feed cards get a host avatar in that slot instead.
- **Migrations:** 0011 (zip_codes seed + profiles zip/radius), 0012 (profiles avatar/bio + kids + storage bucket), 0013 (comments + RLS), 0014 (anon read policy on playdates + supporting public reads). Each wrapped in the house DO-block idempotency pattern (2026-09-04 lesson); any FK added between already-FK-linked tables must pin the FK hint in embeds (2026-09-09 PGRST201 lesson).
- **Self-elevation guard:** the parked 0011 self-privilege-escalation trigger (from V1 slice 5 review) is folded into the first V2 migration pass — profiles UPDATE trigger locking `moderators`/`banned_at` writes to moderator/postgres, closing the founder-approved item.

## Testing Decisions

- Good tests assert external behavior through existing seams, never internals. The repo's established seams stay: pure functions in `src/lib/feed.ts` / `trust.ts` / `moderation.ts` (+ new pure logic: haversine/radius predicate, duration math, comment validation) unit-tested with Vitest; Supabase-facing functions tested with the injected-client mock pattern (`queryUpcomingFeedWithClient`, `togglePingWithClient` prior art); form validation via pure validators (`validatePlaydateForm` is the prior art).
- New pure seams to add (kept to the minimum, all in existing lib files): `zipCodesToDistance`-style distance predicate, `resolveEndTime(start, durationChip)`, `planCommentAction` (delete/insert permission logic), avatar resize accept/reject guard.
- Mock-client tests cannot catch PostgREST embed ambiguity (PGRST201 lesson) — every migration that adds an FK between already-linked tables requires a real-DB REST smoke probe in the live check before close.
- Live checks follow the house pattern: marker accounts via the CDP SQL runner (`scripts/cdp-sql-runner.py`), each slice's behavior proven against the live project (e.g., comment insert → visible to another viewer; hide → invisible; radius filter excludes a >N-mile post), plus `npm run build && npm run test` as the per-slice gate.

## Out of Scope

- App-store packaging (Capacitor or similar) — PWA install is the phone path (founder decision, V2).
- Deployment/hosting (DECISION 3 stands; share links point at a placeholder base URL until resolved).
- Direct messaging / DMs — rejected in favor of public comments (zero-pressure soul).
- GPS / browser geolocation — zip is typed, never sensed.
- Kids' full names, gender, or photos — first name + age only.
- Comment editing; comment threading/nesting; comment notifications.
- Editing existing posts (duplicate only) — unchanged from V1.
- App-store push notifications; map view (V3 candidates).

## Further Notes

- V1 remains fully live and untouched until each V2 slice lands; every slice keeps `npm run build && npm run test` green (the per-slice gate pinned in plan.md).
- Sequencing rationale: UX batch first (small, independent), profiles+avatars second (comment UI and cards want avatars), zip+radius third (the biggest behavioral change, isolated), comments fourth (rides on avatar work), share+public view last (needs deployment-agnostic URLs and benefits from a beta-tested app).
- The two-user beta smoke test (founder + one other parent on real phones) happens between zip+radius and public view — it is the founder's hands-on gate before the trust surface widens.
- Test-marker cleanup in the live DB (lv1–lv5 + probe users) remains an optional human task, unchanged.
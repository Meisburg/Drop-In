# 06: Settings reorg — header gear → /settings, /profile becomes read-only

**What to build:** Split the current ProfilePage (1541 lines, editor + view
in one screen) into two routes:
1. NEW `/settings` (gear icon in the top nav header): every editable
   control — profile (display name, bio, family photo), Location (home zip +
   radius), Kids (add/remove/edit), Notifications (the `NotificationsSection`
   surface), plus the private lists Following + Neighborhoods.
2. `/profile` becomes the READ-ONLY "what others see" view: avatar, display
   name, bio, kids (name + age, no editing), and your posts (upcoming/past).
   One "Edit profile" button → navigates to `/settings`.
Sign out STAYS in the top nav header (it lives there today, App.tsx lines
207-214) — /settings does not duplicate it.

**Why:** Founder judgment call (V11): "where do I change my radius?" had no
obvious answer — it was buried in a profile editor. Gear = settings is the
universal pattern; /profile should answer "what do other parents see about
me?" and nothing else.

**Status:** DONE (2026-09-16; gate 818/818 unit + 76 passed e2e (1 pre-existing conditional skip, polish.e2e.ts) + lint exit 0 + 0 editing-surface `/profile` hits left in `e2e/` (read-only specs only); commit hash recorded in the coordinator's task-state V11 update)

## Mechanics (pinned)

- Routes (declared in `src/App.tsx`, line 390 for /profile): add
  `<Route path="/settings" element={<SettingsPage />} />`. Protection is
  default-deny — `resolveAuthRedirect` (src/lib/auth.ts:44) lets only
  `/playdate/:id` and `/place/:slug` through signed-out, so /settings is
  protected automatically; the onboarding gate (home-zip check) applies
  with no registration.
- `src/App.tsx` header (lines 198-223): insert a gear icon between the
  `@{display_name}` link (lines 200-205) and the "Sign out" button
  (lines 207-214), rendered ONLY when signed in. `<Link to="/settings">`
  with the existing `NavIcon` renderer + a new `gear` path in `NAV_ICONS`
  (line 350); same `min-h-11` touch target as its siblings. The bottom nav
  "Profile" tab (line 254) keeps pointing at /profile (now read-only).
- `src/pages/SettingsPage.tsx` (new) owns the sections MOVED out of
  ProfilePage (by current heading, ProfilePage.tsx line numbers):
  - "Your profile" — display name + bio + the Photo / "A photo of your
    family" sections (lines 806/864)
  - "Location" (lines 935-960: home zip + radius, `updateHomeZipRadius`)
  - "Kids" (line 1056)
  - "Notifications" (line 1339: the `NotificationsSection` component,
    `data-testid="notifications-section"`)
  - "Following" (lines 1353-1409: Families + Places) and "Neighborhoods"
    (lines 1442-1466) — these are PRIVATE (a visitor's /u/:handle never
    shows them), so they are NOT "what others see": they move to /settings.
    FLAGGED DECISION (reversible): if the founder wants them on /profile
    instead, it's a move-back, not a rewrite.
  - Add a SectionHeader (ticket 04's component) to /settings: title
    "Settings", tagline "Profile, location, and notifications".
- `src/pages/ProfilePage.tsx` (reduced): keeps ONLY the read-only content —
  avatar, display name, bio, kids (display, no add/remove), "Your posts"
  (lines 1468-1520). Remove: all edit affordances, Location, Notifications,
  Following, Neighborhoods. Add ONE primary "Edit profile" button →
  `navigate('/settings')`. Keep ticket 04's SectionHeader ("Your family").
- Copy fix: `src/lib/push.ts` line 328 `DISMISSED_POINTER` says "turn
  notifications on any time from your profile" → "...from your settings".
  Grep the string in `e2e/` and update any spec pinning it (push-subscribe
  likely does). Same for the comment at `src/lib/pushClient.ts:392`.
- E2E blast radius (14 specs visit /profile — `grep "goto('/profile')" e2e/`):
  - EDITING specs switch to /settings (or click "Edit profile"):
    `zip-radius.e2e.ts:41` (radius edit), `avatar.e2e.ts:93` (avatar edit),
    `kid-photo-exposure.e2e.ts:626/670/747/769` (the edit steps),
    `push-subscribe.e2e.ts:369/426` (notifications on/off).
  - READING specs (posts, kids display, redirects) keep /profile:
    `profile.e2e.ts`, `profiles-v2.e2e.ts`, `profile-posts.e2e.ts`,
    `polish.e2e.ts`, `onboarding-gate.e2e.ts:19`, `loop-closing.e2e.ts:567`,
    `feed-ages.e2e.ts:438`, `feed-ended-out.e2e.ts:495` — verify each after
    the move (a spec that READS an edited value after switching to /settings
    must switch the read too).
  - Principle: a spec reads "what others see" on /profile and edits on
    /settings — never the reverse.

## Acceptance criteria

- [ ] Signed-in header shows the gear (44px target) between `@handle` and
      "Sign out"; signed-out header unchanged; /settings gated like /profile
      (signed-out → /login, no-zip → /onboarding).
- [ ] /settings sections all present and functional: profile (name/bio/
      photo), Location (zip+radius save via `updateHomeZipRadius`), Kids,
      Notifications, Following, Neighborhoods.
- [ ] /profile: read-only (zero inputs/toggles for name, bio, photo, kids,
      radius, notifications) + "Edit profile" button → /settings; avatar /
      name / bio / kids / posts still render.
- [ ] "Sign out" still in the header (not duplicated on /settings).
- [ ] Push dismiss copy points at settings; `npm run build && npm run test`
      exit 0; full e2e suite green with the route switches listed above.

**Migration check:** NONE. `supabase/` untouched.

**Depends on:** ticket 04 (its SectionHeader lands on today's /profile; this
ticket re-points it and adds the /settings header). Heaviest ticket in the
batch — schedule last, fresh reviewer context.
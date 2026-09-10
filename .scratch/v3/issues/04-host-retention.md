# 04: Host retention loop

**What to build:** Parking lot #4 (priority 4). Hosts are the supply side;
without them the app is empty, and V1 gives a host zero pull to come back
(their own post's ping count only appears if they visit it). Two pieces:
(a) FeedPage banner "N new families pinged your drop-ins" — N =
going_pings on MY posts created after `profiles.last_seen_at` (new cursor
column, migration 0024; app-side restamp on feed mount when null or >= 1h
stale, fire-and-forget; NO trigger). Tap the banner -> /profile (Your
posts) + restamp. (b) UserPage (self AND /u/:handle): a "Hosted N
drop-ins" credibility line near "Here since" — computed behavioral history
per the 2026-09-09 design verdict: NO two-sided reviews (gameable, social-
toxic), NO explicit vouching (gatekeeps, cold-start paradox). Trust
transfers by repeated exposure, made visible — and ungameable because it
is behavioral, not declared.

**Blocked by:** None (dispatch gated on the two-user beta green light, plan-v2 slice 3.5).

**Status:** ready-for-agent

- [x] Migration 0024: `profiles.last_seen_at` timestamptz nullable; DO-block idempotency; header documents that moderators can write it (0009 any-column UPDATE policy) — harmless cursor, no tightening in V3
- [ ] applied live via CDP after code green
- [x] db.ts (injected-client pattern): `countPingsOnMyPostsWithClient(client, profileId, sinceIso)`, `countPostsByHostWithClient(client, profileId)`, `touchLastSeen(client, profileId)`
- [x] FeedPage: banner (amber `rounded-xl border` pattern, ProfilePage :333) when count > 0: "N new families pinged your drop-ins"; tap -> /profile + restamp; hidden when count = 0
- [x] Pure `dueToRefreshLastSeen(lastSeenIso, nowIso, windowMs)` in feed.ts, unit-tested (the >= 1h throttle)
- [x] UserPage: "Hosted N drop-ins" line near "Here since" for self and others' pages; renders only when N > 0 (the hardcoded "No posts yet." posts block stays for N = 0)
- [x] One new e2e spec: marker A posts, marker B pings, /u/:handleA shows "Hosted 1 drop-in"
- [ ] npm run build && npm run test && npm run test:e2e exit 0

## Comments

- 2026-09-09 — Renumbered: migration 0017 → 0023 → 0024 (feedback tickets 06-10 + 0020 ping-timestamps consume 0019-0023; see plan-v3 status log).
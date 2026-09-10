# 07: Card going count + avatar circles

**What to build:** Feedback #1 ("what I would prefer to see instead is how many people are coming… it'd be cool to see their little circles… show some of them and then… plus five more if there was five more"). The card's age-hint line is replaced with a going line: "N going" + up to 3 pinger avatar circles (24px, overlapping -8px) + a "+N" overflow chip. Circles = pinger `avatar_url` only (fallback: display-name initial on a slate-200 circle); names never surface on cards (the guest list stays on the detail page per ticket 05). Data: new `listPingerAvatarsWithClient(client, playdateId, limit)` in db.ts (going_pings + profiles embed (avatar_url, display_name), ordered by ping created_at); pure seam `buildGoingLine(count, avatars, limit)` in feed.ts returning {label, circleAvatars, overflow} — unit-tested. Schema note: 0007's going_pings table has NO created_at — migration 0020 adds it (timestamptz NOT NULL DEFAULT now(); existing rows backfill to now()). Signed-out/public surface: no circles (authenticated-only data; the 0015 going-count pin stays count-only there). Own posts in your feed: circles stay visible (the host sees who's coming). Migration 0020.

**Blocked by:** Ticket 06 (one-writer; both touch DropInCard).
**Migration:** 0020 (going_pings.created_at only — no RLS change: the broad authenticated SELECT already exposes whole rows; anon has no going_pings read).

**Status:** ready-for-agent

- [ ] Migration 0020: going_pings.created_at timestamptz NOT NULL DEFAULT now() (ALTER TABLE ADD COLUMN IF NOT EXISTS inside a DO block; existing rows backfill to now(); header documents why — ticket 07 ordering + ticket 04 banner + the 0025 guest-list RPC all need it; no RLS change); applied live after code green
- [ ] `listPingsForPostsWithClient(client, postIds)` in db.ts (injected-client; single query: going_pings where playdate_id in (...), profiles embed pinned to the FK hint `profiles!going_pings_profile_id_fkey` (avatar_url, display_name, created_at) — PGRST201 lesson: two playdates→profiles paths exist; ordered by created_at; client groups by playdate_id; the pure seam takes the grouped rows)
- [ ] Pure `buildGoingLine(count, avatars, limit)` in feed.ts + unit tests (count 0 → hide the line; exactly 3 shown; overflow math (5 → 3 + "+2"); fallback initial when avatar_url missing)
- [ ] Mocked-client unit tests for listPingsForPostsWithClient AND ticket 06's listMyPingPostIdsWithClient (house TDD hygiene — both currently untested; mirror the feed.test.ts mock-client style)
- [ ] Card: the age-hint line is replaced by the going line ("3 going" + circles + "+2" chip); circles 24px overlapping; fallback = initial letter; no names on cards
- [ ] Signed-out/public view: no circles (the detail going count stays count-only there; the 0015 RPC surface unchanged)
- [ ] One new e2e spec (e2e/card-circles.e2e.ts): marker A pings marker B's post → B's feed card shows the circle + count
- [ ] 375px: the line fits on one row
- [ ] npm run build && npm run test && npm run test:e2e exit 0

## Comments
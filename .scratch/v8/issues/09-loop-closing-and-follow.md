# 09: Loop-closing — "same time next week" and following a family or a place (migration 0033)

**What to build:** A playdate ends and the app instantly forgets it (the post
grays out and drifts down the feed, `DropInCard.tsx:107-115`). That is exactly
the moment the next one should be suggested, and exactly when a parent is
willing to hold on to the family their kid just played with. Today there is no
way to do either: the only user-to-user tables are `blocks` and `going_pings`,
so a parent who meets three families on Saturday cannot find them again on
Sunday except by remembering a handle. Close the loop:

- **"Same time next week"** on a post that ended in the last 7 days, for the
  host and for everyone who pinged it. If the post belongs to a series
  (ticket 06) this is one tap that pings the **next occurrence** — no form at
  all. Otherwise it prefills `/new` with the same place, duration and titles.
- **Follow** a family or a place, and surface it where it pays off: "2 families
  you've met before are going" on cards, and a Following list on `/profile`.

**Blocked by:** Ticket 08 (one-writer).

**Status:** ready-for-agent

- [ ] **Migration 0033** — `follows`: `id`, `follower_profile_id` (FK profiles, cascade), `followee_profile_id uuid null` (FK profiles, cascade), `place_id uuid null` (FK places, cascade), `created_at`, with **exactly one target** enforced: `check ((followee_profile_id is not null) <> (place_id is not null))`, plus unique `(follower_profile_id, followee_profile_id)` and unique `(follower_profile_id, place_id)` (partial unique indexes, since NULLs don't collide)
- [ ] **Migration 0033 RLS** — owner-only everything: SELECT on your own rows, INSERT/UPDATE/DELETE where `follower_profile_id = auth.uid()`. DO-block guarded. **No new SELECT policy on `profiles` or `places`** — a follow count reaches other viewers only through a stable SECDEF `count_followers(p_profile_id uuid)` / `count_place_followers(p_place_id uuid)` (the 0025 pattern: `search_path` pinned, EXECUTE to `authenticated` only, revoke public/anon, an anon probe fails closed)
- [ ] Follow / Unfollow button on `/u/:handle` (beside Block, same row discipline) and on `/place/:id`; `/profile` gains a **Following** list (families → `/u/:handle`, places → `/place/:id`) with unfollow
- [ ] Card line: pure seam `metBeforeLine(goingPings, followeeIds)` → "2 families you've met before are going" (singular at 1, hidden at 0 or when the viewer follows nobody), rendered in the card's existing going-line area — **no new badge**
- [ ] "Same time next week" action on the detail page for ended-within-7-days posts, shown only to the host and to pingers; a series post → one tap pings the next occurrence (with the existing optimistic ping path, and a confirmation line in place); a non-series post → `/new` prefilled via the existing router-state pattern
- [ ] `/place/:id` shows "N families follow this place" (via the SECDEF count — never a broad read)
- [ ] Explicit non-goals, enforced by absence: no mutual-friend logic, no friend feed, no reviews, ratings, or vouching (the settled 2026-09-09 verdict). A follow is a **bookmark**, not a score
- [ ] Unit tests: the exactly-one-target validator, the "met before" line builder (singular/plural/hidden), and the next-occurrence chooser for a series post
- [ ] New e2e `loop-closing.e2e.ts`: host posts for today → viewer pings → viewer follows the host → viewer's feed shows the "met before" line on that host's next post → the ended post offers "Same time next week" → for a series post one tap pings the next occurrence. **Red-by-design pre-apply** (PGRST205 at the follows read); cascade-safe REST cleanup
- [ ] `npm run build && npm run test && npm run test:e2e` exit 0

**Migration check:** **REQUIRED — `supabase/migrations/0033_follows.sql`**
(reserved number; next free wins if the queue reorders). Depends on ticket 07's
`places` (0033's `place_id` FK) — apply only after 0029/0030.

- *Idempotency:* `create table if not exists` + DO-block policy guards; the two
  partial unique indexes created with `if not exists`.
- *Header must document:* the exactly-one-target CHECK, the owner-only RLS
  posture (a follow graph is personal data — no public follower lists), the
  count-only public surface via SECDEF, and the no-reviews decision.
- *Apply path (coordinator only):* CDP Chrome via
  `bash scripts/cdp-migration-tooling.sh` → Local Storage token
  `supabase.dashboard.auth.token` → `POST
  https://api.supabase.com/v1/projects/<ref>/database/query`.
- *Post-apply probes:* (1) `information_schema` proving the table, both partial
  unique indexes, and the CHECK constraint; (2) PostgREST `follows?select=id&limit=1`
  → 200 (no `PGRST205`); (3) a marker following another marker succeeds, while
  reading that other marker's follows returns **0 rows** (assert rows, not
  status — RLS-blocked reads come back 2xx); (4) an anon call to
  `count_followers` fails closed; (5) a row with both targets null, or both set,
  is rejected by the CHECK.
- *Human-owned:* none.

**Verify:** `npm run build && npm run test`; `npx playwright test
e2e/loop-closing.e2e.ts` (red-by-design pre-apply); live marker pass — follow a
host, see the line, tap "same time next week" on a real ended post. Sweep
markers.

## Comments

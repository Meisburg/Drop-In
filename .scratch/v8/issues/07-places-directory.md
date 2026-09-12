# 07: Places — the directory, the place page, and Browse becomes places (migrations 0029, 0030)

**What to build:** The product's stated goal is meeting at *fun places around
the city*, but there is no place entity: `place` is free text
(`NewPlaydatePage.tsx:270-283`), `address` is an optional string (`0021`), and
the neighborhood is a display label. So a parent cannot ask "what's fun for a
4-year-old on a rainy Tuesday?", and nothing in the app knows that Green Lake
exists. Add a seeded `places` table, make `/new` pick from it, give each place a
page, and turn the redundant Browse tab (currently the *same* `listRadiusFeed`
call as the feed, `BrowsePage.tsx:39`) into the places surface.

This ticket also fixes a real modelling error: **a drop-in's location is
currently the host's home zip** (the 2026-09-09 V2 decision). A parent hosting
at a park across town is still filtered as if the meetup were in their
driveway. Once a post names a place, distance comes from the **place's**
coordinates, with the host zip kept only as the fallback for posts without one.

**Blocked by:** Ticket 06 (one-writer).

**Status:** ready-for-agent

- [ ] **Migration 0029** — `places`: `id`, `name`, `kind text check in ('park','playground','indoor_play','museum','pool','splash_pad','library','beach','trail','other')`, `address`, `lat numeric`, `lng numeric`, `indoor boolean`, `age_min smallint`, `age_max smallint`, `notes text`, `photo_url text null`, `neighborhood_id uuid null references neighborhoods`, `source text`, `created_at`; unique on `(name, address)`; index on `(lat, lng)`
- [ ] **Migration 0029** — the Seattle seed: ~30 entries — playgrounds/parks from Seattle Parks & Recreation open data (`data.seattle.gov`), plus hand-curated indoor options (indoor play cafés, Seattle Public Library branches with play areas, museums, pools, summer splash pads, beaches, Discovery Park). **Provenance in the header** (source, retrieval date, licence) exactly as `0012` documents its SimpleMaps extract. `photo_url` seeds **null** — do not scrape third-party photos
- [ ] **Migration 0029 RLS** — SELECT to `anon` + `authenticated` (places are public infrastructure and the signed-out detail page links to them); **no INSERT/UPDATE/DELETE policies at all** (writes stay postgres-only, DO-block guarded)
- [ ] **Migration 0030** — `playdates.place_id uuid null references places(id) on delete set null`, `playdate_series.place_id` (same shape, added to ticket 06's table), and `get_public_playdate` re-created **12 → 13 fields** (adds `place_id` only — no place payload crosses to anon; the client reads `places` itself). Use the 0021 pattern: DROP + CREATE with the same EXECUTE scoping (anon + authenticated), `search_path` pinned, revoke public, and the composite type re-created through the DO-block attribute guard
- [ ] **Distance model fix** (pure `feed.ts` seam + unit tests): distance is computed from the post's **place** coordinates when `place_id` is set, and from the host's home zip only when it isn't; a post with neither stays excluded (coordinates are never invented). Tests cover both paths plus the mixed feed
- [ ] `/new` place field becomes **autocomplete** over `places` (pure `matchPlaces(query, places, limit)`, unit-tested: case-insensitive, prefix matches rank above substring, no fuzzy library) with **"Somewhere else"** always available (free text unchanged, `place_id` stays null). Picking a place fills `place_id`, `address`, and suggests its `neighborhood_id` in one tap
- [ ] New `/place/:id` page: name, kind, indoor/outdoor, age fit, address + the existing Maps link, notes, photo when present, **upcoming drop-ins here** (new `listPlaceFeed(placeId, viewer)`, radius-independent — you asked about *this* place), and **"Start a drop-in here"** → `/new` prefilled with `place_id` (the duplicate-prefill router-state pattern)
- [ ] `/browse` becomes **Places** (nav label change in `App.tsx:201-204`): a searchable list of places with "N upcoming" per place and filters — **indoor/outdoor**, **fits my kid's age** (uses the viewer's `kids` ages against `age_min`/`age_max` when present), and distance from home zip via place coords. The duplicate day-grouped drop-in list is **removed** from Browse (it lives on the feed only)
- [ ] Signed-out public detail view: the place line links to `/place/:id` (anon read), matching how the address already links to Maps
- [ ] New e2e `places.e2e.ts`: pick a place on `/new` → the post lands with a place page link → `/place/:id` lists it → "Start a drop-in here" prefills → the Places tab filters by indoor. **Red-by-design pre-apply** (PGRST205 at the first `places` read), never a crash
- [ ] `npm run build && npm run test && npm run test:e2e` exit 0

**Migration check:** **REQUIRED — `supabase/migrations/0029_places.sql` then
`0030_playdates_place.sql`** (reserved numbers; next free wins if the queue
reorders).

- *Idempotency:* `create table if not exists` + DO-block guards for every
  policy; the seed insert is `insert ... on conflict (name, address) do
  nothing`; the RPC re-create is DROP + CREATE guarded like `0021`.
- *Header must document:* the seed's provenance/licence, the `anon` read
  decision (public infrastructure, deliberate), that **no** write policies
  exist, the 12→13 public-field pin, and the distance-model change (place coords
  preferred over host home zip).
- *Grants:* `get_public_playdate` keeps its exact prior scoping (EXECUTE to
  `anon` + `authenticated`, revoke `public`); an anon probe must still return
  the 13-field payload and a hidden post must still 404 through it.
- *Apply path (coordinator only):* CDP Chrome via
  `bash scripts/cdp-migration-tooling.sh` → dashboard session token from Local
  Storage `supabase.dashboard.auth.token` → `POST
  https://api.supabase.com/v1/projects/<ref>/database/query`. Monaco editor in
  that Chrome is broken; don't use it.
- *Post-apply probes:* (1) `information_schema` proving both columns + the
  places table, and a `select count(*)` from `places` matching the seed length;
  (2) PostgREST `places?select=id&limit=1` → 200 (no `PGRST205`); (3) the
  13-field `get_public_playdate` payload verified via `order by id limit 1`
  (`min(uuid)` does not exist — the V3.5 probe lesson); (4) an anon `places`
  read succeeds while an anon `places` insert fails closed.
- *Human-owned:* the seed list gets a **human sanity-check at review** (the
  0002 precedent) — it is the app's content, and a wrong address sends a family
  to the wrong park.

**Verify:** `npm run build && npm run test` (matchPlaces + distance-model
tests); `npx playwright test e2e/places.e2e.ts` (red-by-design pre-apply); live
marker pass — pick a real playground, tap the Maps link, open its place page,
start a drop-in from it. Sweep markers.

## Comments

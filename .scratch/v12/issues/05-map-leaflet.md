# 05: A map — Leaflet + OpenStreetMap tiles on the place surfaces

**What to build:** Places already carry coordinates in the DB —
`places.lat/lng` (0029, nullable) and `zip_codes.lat/lng` (0012, NOT NULL,
the seeded gazetteer) — but nothing renders them. Add a small shared map
component built on **Leaflet + OpenStreetMap tiles** (founder decision —
explicitly no browser geolocation: no location prompts, the coordinates
come from the DB only) and render it on the place surfaces (the PlacePage
detail + the Places directory). A place with NULL coordinates renders
without a map (0029's header rule: NULL coordinate = UNKNOWN distance —
never a fake pin).

**Why:** Founder ask (V12): "show me where this is" has no answer today —
a zip + a name is all a parent gets.

**Status:** ready-for-agent

## Mechanics (pinned)

- `supabase/migrations/0029_places.sql`: `lat` / `lng` `:132-133`
  (NULLABLE, the comment `:129-131`), the index `:145`
  (`places_lat_lng_idx` on (lat, lng)), RLS `:147`, the seed `:149`; the
  header rule `:80-85` (a NULL coordinate means UNKNOWN distance).
- `supabase/migrations/0012_zip_radius.sql`: the `zip_codes` table
  `:26-30` (lat / lng NOT NULL `:28-29`), RLS `:32`, the seed `:34`+ — the
  zip → coordinate fallback for places without their own coordinates.
- `package.json`: no map library today (deps: supabase-js, react, react-dom,
  react-router; dev: playwright, tailwind, typescript, vite, vitest) — add
  `leaflet` + `@types/leaflet` (and nothing else).
- `src/` geolocation: **zero matches** for `geolocation` at filing — the
  invariant "no browser location" holds today and must hold after the
  ticket.

## Acceptance criteria

1. `leaflet` + `@types/leaflet` in `package.json`; tiles from
   OpenStreetMap (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`); no
   other new dependencies.
2. A new small map component (e.g. `src/components/PlaceMap.tsx` —
   builder's choice of name) renders on the place surfaces from stored
   coordinates (the place's own lat/lng, else its zip's, else no map).
3. NULL coordinates: no map, no crash, no 404 tile — the place renders as
   today (0029's rule).
4. No `navigator.geolocation` / location prompt introduced (the
   zero-match invariant holds after the ticket).
5. `npm run build && npm run test` exit 0; a places e2e spec
   (`places.e2e.ts` family) asserts the map container renders for a seeded
   place with coordinates (tile fetch may be mocked / skipped offline — the
   builder records the choice); lint 0 errors.

**Migration check:** NONE. `supabase/` untouched.

**Depends on:** none.
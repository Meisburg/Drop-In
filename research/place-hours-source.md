# Place hours — can OSM supply them, and at what coverage?

**Type:** research memo. No product code, migration, test, or DB row was changed.
Only `research/` was written.

## Short answer

**Partly — and only for libraries and community centres.** Of 239 seeded places,
**30 (12.6%)** have a usable `opening_hours` on their nearest OSM feature; after
a name-plausibility filter, **26 (10.9%)**. The signal is concentrated:

- **Libraries: 6/6 (100%)** — exact-name matches, real weekly schedules.
- **Community centres / `other`: 13/26** — exact or near-exact name matches.
- **Playgrounds 5/155, pools ≤1/10, splash pads 1/30, beaches 0/9, museum 0/1
  (no coords), indoor play 0/2 (no coords).**

For those buckets OSM is not a real hours source in Seattle. Recommendation:
backfill hours **only** where a same-name OSM feature within ~150 m carries
`opening_hours` (libraries + community centres), leave everything else null, and
never fabricate hours from a nearby-but-different feature.

## Method

1. Pulled all 239 rows from Supabase REST (`/rest/v1/places`, anon key).
   Kinds: playground 155, splash_pad 30, other 26, pool 10, beach 9, library 6,
   indoor_play 2, museum 1. **3 rows have null `lat`/`lng`** (Wunderkind,
   PlayDate SEA, Seattle Children's Museum) — all `source='hand'`.
2. Two POST Overpass queries (`overpass-api.de`, `out center tags;`):
   - Main, bbox `47.49,-122.46,47.74,-122.22`: `leisure` in
     park/playground/swimming_pool/sports_centre/water_park, `amenity` in
     community_centre/library/public_bath/swimming_pool, `natural=beach`.
     → **1,993 features, 132 with `opening_hours`**.
   - Supplementary: `tourism=museum`, `leisure=indoor_play`,
     `leisure=water_park`, `playground=splash_pad`. → 46 elements (adds 25
     hours-bearing museums; **no** hours on splash pads).
   - Combined unique: **2,039 features, 157 with `opening_hours`**.
     OSM data timestamp `2026-09-27T17:34:50Z`. One retry was needed on the
     second query (Overpass "server too busy"); narrowing was not required.
3. Nearest feature per place by haversine; match = ≤150 m. Name similarity =
   shared significant-token ratio of normalized names.

## Measured coverage

| kind | places | matched ≤150 m | nearest has `opening_hours` | name-plausible (sim ≥ 0.5) |
|---|---|---|---|---|
| library | 6 | 6 | **6** | **6** |
| other (community centres) | 26 | 25 | 14 | 13 |
| playground | 155 | 154 | 5 | 5 |
| pool | 10 | 10 | 2 | 1 (wrong hours — see below) |
| splash_pad | 30 | 30 | 2 | 1 |
| beach | 9 | 9 | 1 | 0 |
| museum | 1 | 0 (null coords) | 0 | 0 (OSM *has* it, with hours) |
| indoor_play | 2 | 0 (null coords) | 0 | 0 |
| **TOTAL** | **239** | **234 (97.9%)** | **30 (12.6%)** | **26 (10.9%)** |

A looser rule — "any hours-bearing OSM feature within 150 m" — reaches
**76 places (31.8%)**, but only 26 match by name. Distance alone picks the wrong
feature ~two-thirds of the time, so **76 is an upper bound, not coverage**.

## Examples (place → OSM feature)

| seeded place (kind) | OSM feature (dist) | `opening_hours` |
|---|---|---|
| Ballard Branch, Seattle Public Library (library) | The Seattle Public Library – Ballard Branch (10 m) | `Tu-Th 10:00-20:00; Fr-Mo 10:00-18:00` |
| Ballard Community Center (other) | Ballard Community Center (14 m) | `Mo-Fr 10:00-21:00; Su 10:00-15:00; Sa 10:00-18:00` |
| 12th Ave Square Park (playground) | 12th Ave Square Park (5 m) | `Mo-Su 04:00-23:30` (park-wide, not playground-specific) |
| Green Lake Park Wading Pool (splash_pad) | Green Lake Wading Pool (12 m) | `Jun 21-Sep 01 Mo-Su 12:00-19:00` (seasonal) |
| Mt Baker Park (beach) | Mount Baker Beach (4 m) | `Mo-Fr 12:00-19:00, Sa-Su 11:00-19:00` (name sim 0.33) |
| Rainier Beach Pool (pool) | Rainier Beach Community Center (52 m) | `Mo-Fr 10:00-21:00; Sa 08:30-19:00; Su 09:00-18:30` — **facility hours, not pool hours** |

## Licence and attribution

OSM data is **ODbL 1.0**. Any place page / data export showing these hours must
show **“© OpenStreetMap contributors”** and link to openstreetmap.org/copyright.
Storing and serving the extracted values is a "Produced Work" (attribution
suffices); a re-distributed derived *database* would trigger share-alike, which
is a reason to store a per-row attribution string alongside the value. Do not
mix OSM values with a proprietary hours source in one column without recording
provenance per row.

## Gotchas

1. **Syntax is complex.** Values include `PH closed`, `Su off`, month ranges
   (`Jun 21-Sep 01`), dated schedules (`2025 Jun-Aug Mo-Th 12:00-20:00`), and
   comments (`... open "late night"`). Do not regex-parse; use a real
   `opening_hours` evaluator (the `opening_hours` JS package) at read time.
2. **Pools have no pool hours.** Seattle pools are tagged `sports_centre` with
   no `opening_hours`; the nearest hours belong to the attached community
   centre. Community-centre hours ≠ pool hours. Treat pool coverage as 0.
3. **Wading pools / spray parks are seasonal** and almost never tagged; only
   Green Lake carries a season window. Summer-only hours will be wrong in winter.
4. **Mis-tagged / nearby features.** Northgate Community Center's nearest hours
   feature is the Northgate library (25 m, sim 0.17). Rainier Beach Pool's is
   the community centre. Name similarity is a required guard, not a nicety.
5. **Geometry gaps.** 3 hand-added rows have no coordinates; 2 places have no
   OSM feature within 150 m (Langston Hughes Cultural Arts Center 191 m,
   Warren G. Magnuson Park 228 m). Request `out center tags;` or ways yield no
   point.
6. **No bulk city alternative.** Seattle's facility hours live in
   parkways.seattle.gov PDFs and seattle.gov pages, not a licensed bulk feed —
   OSM is the only machine-readable bulk candidate found.
7. **Not live.** OSM hours drift; a `checked_at` timestamp is needed or hours
   silently go stale.

## Proposed schema (not implemented)

```sql
-- migration sketch only; no migration was written by this ticket
alter table public.places
  add column hours jsonb,                    -- {"raw":"Tu-Th 10:00-20:00; ...","osm_type":"node","osm_id":123}
  add column hours_source text,              -- 'osm' | 'hand' | null
  add column hours_checked_at timestamptz;   -- when the snapshot was fetched
-- keep 'osm' attribution rendered wherever hours are shown
```

## Backfill sketch (one-time, name-guarded)

1. One script, one or two Overpass POSTs (never 239), using these queries
   (bbox = `47.49,-122.46,47.74,-122.22`; POST body, `Accept: application/json`):

   ```overpass
   [out:json][timeout:180];
   (
     nwr["leisure"~"^(park|playground|swimming_pool|sports_centre|water_park)$"](47.49,-122.46,47.74,-122.22);
     nwr["amenity"~"^(community_centre|library|public_bath|swimming_pool)$"](47.49,-122.46,47.74,-122.22);
     nwr["natural"="beach"](47.49,-122.46,47.74,-122.22);
   );
   out center tags;
   ```

   ```overpass
   [out:json][timeout:120];
   (
     nwr["tourism"="museum"](47.49,-122.46,47.74,-122.22);
     nwr["leisure"="indoor_play"](47.49,-122.46,47.74,-122.22);
     nwr["leisure"="water_park"](47.49,-122.46,47.74,-122.22);
     nwr["playground"="splash_pad"](47.49,-122.46,47.74,-122.22);
     nwr["attraction"="water_park"](47.49,-122.46,47.74,-122.22);
   );
   out center tags;
   ```
2. For each place with coords: take the nearest feature within 150 m **whose
   normalized name shares ≥ 0.5 of its significant tokens** with the place name.
3. Keep only candidates whose `opening_hours` is present and parses
   (`opening_hours` package). Write `hours.raw`, `hours.osm_type`, `hours.osm_id`,
   `hours_source='osm'`, `hours_checked_at=now()`.
4. Expect to write ~26 rows (6 libraries, ~13 community centres, ~5 playground
   park-hours, ~1 splash pad). Every other row stays `null`.
5. Re-run on a schedule (e.g. quarterly) and diff before overwriting.

Expected end state: 26/239 (10.9%) real hours, 213 null — honest, not blanketed.

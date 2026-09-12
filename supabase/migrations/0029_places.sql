-- V8 ticket 07: the PLACES directory (the place entity the product's whole
-- premise assumes: "fun places around the city"). 0012's SimpleMaps discipline
-- — the extract is fetched, the resulting rows are committed as STATIC SQL, and
-- this header records the endpoints, the retrieval date, and the licence.
--
-- SEED PROVENANCE (real data; no row, address, coordinate, or photo is invented)
--   Publisher: City of Seattle / Seattle Parks and Recreation, via the City's
--   public ArcGIS feature services (org ZOyb2t4B0UYuYNYH).
--   Retrieved: 2026-09-13 (curl, outFields=*, f=json; the raw extracts live in
--   .scratch/v8/places-data/ and the seed was GENERATED from them by
--   .scratch/v8/gen-places-seed.py).
--   Licence: the City of Seattle publishes these layers as open data
--   (Seattle's open-data terms: public domain / no restrictions; attribution
--   to the City of Seattle). Every endpoint below was verified reachable and
--   returned real rows on 2026-09-13.
--
--   Play Areas       -> kind 'playground'   https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/Play_Area/FeatureServer/0/query
--   Spray Parks      -> kind 'splash_pad'   https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/Spray_Parks/FeatureServer/0/query
--   Wading Pools     -> kind 'splash_pad'   https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/Wading_Pools/FeatureServer/0/query
--   Swimming Pools   -> kind 'pool'         https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/Swimming_Pools/FeatureServer/0/query
--   Swimming Beaches -> kind 'beach'        https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/Swimming_Beaches/FeatureServer/0/query
--   Community Centers-> kind 'other'        https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/Community_Centers/FeatureServer/0/query
--                                          (indoor = true)
--   Seattle Public Library (the hand rows' coordinates)
--                    -> https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/Seattle_Public_Library/FeatureServer/0/query
--                       (returnGeometry=true&outSR=4326 — this layer carries a
--                       point geometry and no lat/lng attributes)
--
--   Field mapping: name <- PROPNAME (Play_Area) / NAME (every other layer);
--   address <- ADDRESS; lat/lng <- LATITUDE/LONGITUDE (Play_Area, Spray Parks,
--   Wading Pools, Swimming Pools, Swimming Beaches, Community Centers) or the
--   WGS84 point geometry (Seattle_Public_Library). Addresses keep the city's own
--   ALL-CAPS spelling: re-casing an authoritative address would be editing it.
--
--   `indoor`: NO heuristic was needed — the Swimming Pools layer publishes the
--   real `INDOOR_OUT` field, and it is used verbatim. The rest is the pinned
--   per-kind mapping (playground / splash_pad / beach = outdoor; community
--   center = indoor, the ticket's pin).
--
--   `notes`: the ADA attribute is folded in CONSISTENTLY and no column was
--   invented for it — ADA 'Yes' becomes the note 'Accessible (ADA).' on every
--   affected row, and nothing is said for ADA 'No' or absent. Additionally a row
--   whose own operational field says the facility is shut (Spray/Wading
--   OPENCLOSED = 'No', Community Centers OPERATIONALSTATUS = 'Closed', Swimming
--   Pools STATUS = 'Closed/Out of Service') carries 'Marked closed in the city
--   data — check before you go.', because the seed's whole job is not sending a
--   family to a closed pool.
--
--   Dropped rows (never guessed at): no name, no coordinates, or no address.
--   Address-less rows are dropped deliberately — the unique key is
--   (name, address), and NULL is distinct in a unique index, so an
--   address-less row would make the seed's ON CONFLICT a no-op and re-pasting
--   the migration would duplicate it (the 0012 re-paste-safety rule).
--   Dropped this run: 0 no-name, 5 no-coords
--   (Yesler Terrace Park Water Spray — listed with a null point in BOTH the
--   Spray Parks and Wading Pools layers — Warren G. Magnuson Wading Pool,
--   Cal Anderson Wading Pool, and Lake City Community Center; the Magnuson and
--   Cal Anderson SITES are still in the directory through their Play Areas),
--   2 no-address (the Play Areas 'South Park Plaza' and
--   'Crown Hill Park' — real parks the city publishes with no street address),
--   and 13 duplicate (name, address) rows. The duplicates are
--   almost all the SAME water feature published in both the Spray Parks and the
--   Wading Pools layer (11 of them — both map to kind 'splash_pad', so nothing
--   is lost), plus one repeated Play Area row and 'Rainier Community Center',
--   which the city publishes in BOTH Play_Area and Community_Centers. The
--   dedupe keeps the row from the EARLIER layer in the fixed order above (the
--   play-area row wins), so the same physical place is one directory entry with
--   one kind — deterministic, and stable across regeneration.
--
--   `photo_url` is NULL for EVERY row. Third-party photos are never scraped
--   (the pinned rule) — the place page renders without an image.
--
-- THE HAND-CURATED INDOOR LIST (source = 'hand'): 9 rows whose
--   addresses were verified by WEB SEARCH against the operator's own site
--   (spl.org branch pages; seattlechildrensmuseum.org; playdatesea.com;
--   wunderkindseattle.com). The library rows' COORDINATES come from the City's
--   own Seattle_Public_Library feature service (the layer above), whose
--   addresses agree with the operators' — so not a single coordinate here is
--   invented. The three remaining hand rows (the children's museum and the two
--   indoor play cafés) carry NO coordinates: the city publishes no point for
--   them and no authoritative source was found, so lat/lng are NULL. That is
--   why the columns are NULLABLE — the alternative was inventing a coordinate
--   or dropping a verified real place. A NULL coordinate means UNKNOWN
--   distance: the directory always KEEPS such a place (src/lib/places.ts,
--   browsePlaces) and never invents a distance for it.
--   Considered and deliberately EXCLUDED from the hand list: The Little Gym
--   (4 Seattle locations) and Seattle Gymnastics Academy — class-based gyms,
--   not drop-in play spaces, so a "show up and play" directory would mislead.
--   Seattle Gymnastics Academy's Columbia City location was dropped as
--   unverifiable: the operator's own site gives two conflicting addresses.
--
--   `age_min` / `age_max` are NULL for EVERY row: neither the city data nor the
--   hand list positively states an age range, and inventing one would hide real
--   places. The "fits my kid's age" filter therefore treats NULL as UNKNOWN and
--   keeps the place (see src/lib/places.ts) — a filter may only exclude a place
--   when the data positively says it does not fit. Curating age ranges is a
--   human-owned content task, exactly like the seed sanity-check.
--
--   `neighborhood_id` is NULL for EVERY row: no source field carries a
--   neighborhood (Community Centers' NEIGHBORHOOD column is NULL in all 28
--   rows, Play Areas carry only a coarse DIVISION, and matching place names to
--   seeded neighborhood names by substring would be invented data). The /new
--   suggestion (a place fills its neighborhood in one tap) is implemented and
--   unit-tested and fires as soon as a place carries one.
--
-- THE anon READ DECISION (deliberate): places are PUBLIC INFRASTRUCTURE — the
--   signed-out share page links a visitor to the place page, so `anon` gets
--   SELECT. There are NO insert/update/delete policies at all: writes stay
--   postgres-only (the seed is re-written only by service_role during the CDP
--   apply), so RLS denies every write by default.
--
-- Idempotent + re-paste-safe (the 2026-09-04 house lesson): the table via
--   IF NOT EXISTS; RLS enabled by re-running; the SELECT policy in a DO block
--   (Postgres has no CREATE POLICY IF NOT EXISTS); the seed via
--   `insert ... on conflict (name, address) do nothing`.
--
-- Seed size this run: 239 rows · beach: 9 · indoor_play: 2 · library: 6 · museum: 1 · other: 26 · playground: 155 · pool: 10 · splash_pad: 30
--   by source: hand: 9, seattle-parks: 230

-- 1) places: the seeded directory.
create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (
    kind in ('park', 'playground', 'indoor_play', 'museum', 'pool', 'splash_pad',
             'library', 'beach', 'trail', 'other')
  ),
  address text not null,
  -- Nullable on purpose: a place whose authoritative coordinate does not exist
  -- is still a real place (the three hand rows without a city point). NULL =
  -- unknown distance, never invented, and never a reason to hide the place.
  lat numeric,
  lng numeric,
  indoor boolean not null default false,
  age_min smallint,
  age_max smallint,
  notes text,
  photo_url text,
  neighborhood_id uuid references public.neighborhoods (id) on delete set null,
  source text not null,
  created_at timestamptz not null default now(),
  unique (name, address)
);

create index if not exists places_lat_lng_idx on public.places (lat, lng);

alter table public.places enable row level security;

-- 2) The seed (239 rows; see the provenance header above).
insert into public.places
  (name, kind, address, lat, lng, indoor, notes, source)
values
  ('Green Lake Park (East)', 'beach', '7201 E Green Lake Drive N', 47.68035741, -122.32952363, false, null, 'seattle-parks'),
  ('Green Lake Park (West)', 'beach', '7312 W Green Lake Drive N', 47.6820202, -122.33939468, false, null, 'seattle-parks'),
  ('Madison Park', 'beach', '1900 43rd Ave E', 47.6360502, -122.27647463, false, null, 'seattle-parks'),
  ('Madrona Park', 'beach', '800 Lake Washington Blvd', 47.60913617, -122.28247468, false, null, 'seattle-parks'),
  ('Matthews Beach', 'beach', '9300 51st Ave', 47.6969466, -122.27273966, false, null, 'seattle-parks'),
  ('Mt Baker Park', 'beach', '2301 Lake Washington Blvd', 47.58347144, -122.28746647, false, null, 'seattle-parks'),
  ('Pritchard Beach', 'beach', '8400 55th Ave S', 47.52973492, -122.26310374, false, null, 'seattle-parks'),
  ('Seward Park', 'beach', '5900 Lake Washington Blvd', 47.55161877, -122.25743367, false, null, 'seattle-parks'),
  ('Warren G Magnuson', 'beach', '65th & Sandpoint Way NE', 47.68057218, -122.24637218, false, null, 'seattle-parks'),
  ('PlayDate SEA', 'indoor_play', '1275 Mercer Street, Seattle, WA 98109', null, null, true, 'Indoor playground in South Lake Union — walk in, no appointment needed.', 'hand'),
  ('Wunderkind', 'indoor_play', '3318 NE 55th St, Seattle, WA 98105', null, null, true, 'LEGO play café in Northeast Seattle — currently mostly private parties and after-school programs.', 'hand'),
  ('Ballard Branch, Seattle Public Library', 'library', '5614 22nd Ave. N.W., Seattle, WA 98107', 47.6698432, -122.3842038, true, 'Helen G. Rosen Children''s Area.', 'hand'),
  ('Beacon Hill Branch, Seattle Public Library', 'library', '2821 Beacon Ave. S., Seattle, WA 98144', 47.5780459, -122.31140709, true, 'Dedicated children''s area.', 'hand'),
  ('Central Library, Seattle Public Library', 'library', '1000 Fourth Ave., Seattle, WA 98104', 47.60648528, -122.33296827, true, 'Children''s Center on the main floor.', 'hand'),
  ('Columbia Branch, Seattle Public Library', 'library', '4721 Rainier Ave. S., Seattle, WA 98118', 47.55994717, -122.28687924, true, 'Children''s area with park views.', 'hand'),
  ('Northeast Branch, Seattle Public Library', 'library', '6801 35th Ave. N.E., Seattle, WA 98115', 47.67785368, -122.29071129, true, 'Large children''s area with family-friendly seating.', 'hand'),
  ('Southwest Branch, Seattle Public Library', 'library', '9010 35th Ave. S.W., Seattle, WA 98126', 47.52244177, -122.3761824, true, 'Janet Maurer Daggatt Children''s Area.', 'hand'),
  ('Seattle Children''s Museum', 'museum', '305 Harrison Street, Seattle, WA 98109', null, null, true, 'Children''s museum in the Armory on the Seattle Center campus.', 'hand'),
  ('Alki Community Center', 'other', '5817 SW Stevens St', 47.57759963, -122.40698685, true, 'Marked closed in the city data — check before you go.', 'seattle-parks'),
  ('Ballard Community Center', 'other', '6020 - 28th Ave NW', 47.67284991, -122.39240533, true, null, 'seattle-parks'),
  ('Bitter Lake Community Center', 'other', '13035 Linden Ave N', 47.72431411, -122.34840814, true, null, 'seattle-parks'),
  ('Delridge Community Center', 'other', '4501 Delridge Way SW', 47.56333037, -122.36400068, true, null, 'seattle-parks'),
  ('Garfield Community Center', 'other', '2323 E Cherry St', 47.60770116, -122.30239489, true, null, 'seattle-parks'),
  ('Green Lake Community Center', 'other', '7201 E Green Lake Dr N', 47.6803782, -122.32870659, true, null, 'seattle-parks'),
  ('Hiawatha Community Center', 'other', '2700 California Ave SW', 47.57814298, -122.38460119, true, null, 'seattle-parks'),
  ('High Point Community Center', 'other', '6920 34th Ave SW', 47.5406501, -122.37479987, true, null, 'seattle-parks'),
  ('Hutchinson Community Center', 'other', '3801 S Pilgrim St', 47.51477349, -122.25982435, true, null, 'seattle-parks'),
  ('International District Community Center', 'other', '718 8th Ave S', 47.59605368, -122.32264354, true, null, 'seattle-parks'),
  ('Jefferson Park Community Center', 'other', '3801 Beacon Ave S', 47.56977871, -122.30811714, true, null, 'seattle-parks'),
  ('Langston Hughes Cultural Arts Center', 'other', '104 17th Ave S', 47.60139705, -122.31008747, true, null, 'seattle-parks'),
  ('Laurelhurst Community Center', 'other', '4554 NE 41st St', 47.65917531, -122.27786134, true, null, 'seattle-parks'),
  ('Loyal Heights Community Center', 'other', '2101 NW 77th St', 47.68476989, -122.38294476, true, null, 'seattle-parks'),
  ('Magnolia Community Center', 'other', '2550 34th Ave W', 47.64195401, -122.39982755, true, null, 'seattle-parks'),
  ('Magnuson Community Center', 'other', '7110 62nd Ave NE', 47.68054054, -122.26160731, true, null, 'seattle-parks'),
  ('Meadowbrook Community Center', 'other', '10517 35th Ave NE', 47.70595245, -122.29153944, true, null, 'seattle-parks'),
  ('Miller Community Center', 'other', '330 19th Ave E', 47.62187939, -122.30685248, true, null, 'seattle-parks'),
  ('Montlake Community Center', 'other', '1618 E Calhoun St', 47.64161273, -122.31003971, true, null, 'seattle-parks'),
  ('Northgate Community Center', 'other', '10510 5th Ave NE', 47.70618352, -122.32272291, true, null, 'seattle-parks'),
  ('Queen Anne Community Center', 'other', '1901 1st Ave W', 47.63614336, -122.3592338, true, null, 'seattle-parks'),
  ('Rainier Beach Community Center', 'other', '8825 Rainier Ave S', 47.52404172, -122.27074713, true, null, 'seattle-parks'),
  ('Ravenna-Eckstein Community Center', 'other', '6535 Ravenna Ave NE', 47.67665138, -122.30414102, true, null, 'seattle-parks'),
  ('South Park Community Center', 'other', '8319 8th Ave S', 47.52834566, -122.32401841, true, null, 'seattle-parks'),
  ('Van Asselt Community Center', 'other', '2820 S Myrtle St', 47.53940526, -122.29524074, true, null, 'seattle-parks'),
  ('Yesler Community Center', 'other', '917 E Yesler Way', 47.60148733, -122.32011644, true, null, 'seattle-parks'),
  ('12th Ave Square Park', 'playground', '564 12th Ave', 47.60724334, -122.31640595, false, null, 'seattle-parks'),
  ('12th West / West Howe Park', 'playground', '12th Ave West / West Howe St', 47.63609742, -122.37298472, false, null, 'seattle-parks'),
  ('6th Ave NW Pocket Park', 'playground', '6th Ave NW / NW 76th St', 47.68431917, -122.36362135, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Albert Davis Park', 'playground', '12526 27th Ave NE', 47.72042908, -122.2985571, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Alki Playground', 'playground', '5817 SW Lander St', 47.57789918, -122.4077309, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Alki Playground - Whales Tail', 'playground', '5817 SW Lander St', 47.57932158, -122.40716148, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Atlantic Street Park', 'playground', 'S Atlantic St / 21st Ave S', 47.58933294, -122.30546772, false, 'Accessible (ADA).', 'seattle-parks'),
  ('B.F. Day Playground', 'playground', '4020 Fremont Ave N', 47.65566774, -122.34890554, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Baker Park on Crown Hill', 'playground', 'Mary Ave NW / NW 83rd St', 47.69016536, -122.3747977, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Ballard Commons Park', 'playground', '5701 22nd Ave NW', 47.67059489, -122.38501863, false, null, 'seattle-parks'),
  ('Ballard Corners Park', 'playground', '17th Ave NW / NW 62nd St', 47.67429999, -122.37914262, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Ballard Playground', 'playground', '2644 NW 60th St', 47.6726483, -122.39254848, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Bayview Playground', 'playground', '2614 24th Ave W', 47.64430136, -122.38690553, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Bayview-Kinnear Park', 'playground', '3rd Ave W / W Prospect St', 47.62889952, -122.36023718, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Beacon Hill Playground', 'playground', '1902 13th Ave S', 47.5865218, -122.31515116, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Beer Sheva Park', 'playground', '8650 55th Ave S', 47.52468711, -122.26392871, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Benefit Playground', 'playground', '9320 38th Ave S', 47.51852715, -122.28417232, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Bhy Kracke Park', 'playground', '1200 5th Ave N', 47.63034568, -122.34779047, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Bitter Lake Open Space Park', 'playground', 'Linden Ave N & N 143rd St', 47.73111517, -122.34805734, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Bitterlake Playfield', 'playground', '13030 North Park Ave N', 47.72341905, -122.34873454, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Bradner Gardens Park', 'playground', '29th Ave S / S Grand St', 47.58733388, -122.29575427, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Brighton Playfield', 'playground', '6000 39th Ave S', 47.5485732, -122.28291676, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Bryant Playground', 'playground', '4103 NE 65th St', 47.67521302, -122.28336719, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Cal Anderson Park', 'playground', '1635 11th Ave', 47.61707006, -122.31864658, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Carkeek Park', 'playground', '950 NW Carkeek Park Rd', 47.71308135, -122.37769879, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Cascade Playground', 'playground', '333 Pontius Ave N', 47.62166645, -122.33261125, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Cedar Park', 'playground', '3737 NE 135th St', 47.72621721, -122.28808204, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Cheryl Chow Park', 'playground', '3640 35th Ave S', 47.57006066, -122.28908369, false, null, 'seattle-parks'),
  ('Colman Playground', 'playground', '1740 23rd Ave S', 47.58718821, -122.30158854, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Cottage Grove Park', 'playground', '5206 26th Ave SW', 47.55501296, -122.36513327, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Cowen Park', 'playground', '5849 15th Ave NE', 47.6723972, -122.3123571, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Dahl Playfield', 'playground', '7700 25th Ave NE', 47.68419286, -122.30003355, false, 'Accessible (ADA).', 'seattle-parks'),
  ('David Rodgers Park', 'playground', '2800 3rd Ave W', 47.64378205, -122.35876007, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Dearborn Park', 'playground', '2919 S Brandon St', 47.5531207, -122.29467281, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Delridge Playfield', 'playground', '4458 Delridge Way SW', 47.56376281, -122.36416885, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Denny Park', 'playground', '100 Dexter Ave N', 47.61945211, -122.34064861, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Discovery Park', 'playground', '3801 W Government Way', 47.65607264, -122.40498007, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Dr. Blanche Lavizzo Park', 'playground', '2100 S Jackson St', 47.59951159, -122.30446278, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Dr. Jose Rizal Park', 'playground', '1008 12th Ave S', 47.59193834, -122.31760413, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Duwamish Waterway Park', 'playground', '7900 10th Ave S', 47.53078309, -122.31965745, false, null, 'seattle-parks'),
  ('E Queen Anne Playground', 'playground', '1912 Warren Ave N', 47.63589074, -122.35409195, false, 'Accessible (ADA).', 'seattle-parks'),
  ('E.C. Hughes Playground', 'playground', '2805 SW Holden St', 47.53339754, -122.36888198, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Ella Bailey Park', 'playground', '2601 W Smith St', 47.6407383, -122.39140427, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Ercolini Park', 'playground', '48th Ave SW / SW Alaska St', 47.56168567, -122.39308576, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Fairmount Playground', 'playground', '5400 Fauntleroy Way SW', 47.554241, -122.38014468, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Fairmount Playground - School', 'playground', '5400 Fauntleroy Way SW', 47.55341248, -122.38058487, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Firehouse Mini Park', 'playground', '712 18th Ave', 47.60843329, -122.30858572, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Flo Ware Park', 'playground', '28th Ave S / S Jackson St', 47.59947501, -122.29599513, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Froula Playground', 'playground', '7112 12th Ave NE', 47.68058094, -122.31468158, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Garfield Playfield', 'playground', '500 23rd Ave', 47.60769677, -122.30036798, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Gas Works Park', 'playground', '2101 N Northlake Way', 47.64567589, -122.33352313, false, null, 'seattle-parks'),
  ('Genesee Park and Playfield', 'playground', '4316 S Genesee St', 47.56292342, -122.27975527, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Genesee Park and Playfield', 'playground', '4420 S Genesee St', 47.56540565, -122.27782693, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Georgetown Playfield', 'playground', '750 S Homer St', 47.55233616, -122.32148798, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Gilman Playground', 'playground', '923 NW 54th St', 47.66692051, -122.36920117, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Golden Gardens Park', 'playground', '8498 Seaview Pl NW', 47.69178109, -122.4037383, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Green Lake Park', 'playground', '7201 East Green Lake Dr N', 47.68064949, -122.32764197, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Greenwood Park', 'playground', '8905 Fremont Ave N', 47.69326993, -122.35049252, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Hiawatha Playfield', 'playground', '2700 California Ave SW', 47.57896239, -122.38446554, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Highland Park Playground', 'playground', '1100 SW Cloverdale St', 47.52693381, -122.34936415, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Hoa Mai Park', 'playground', '1224 S King St', 47.59889676, -122.31597568, false, null, 'seattle-parks'),
  ('Homer Harris Park', 'playground', '2401 E Howell St', 47.6174858, -122.3009772, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Hutchinson Playground', 'playground', '5732 S Norfolk St', 47.51484395, -122.25953538, false, 'Accessible (ADA).', 'seattle-parks'),
  ('International Childrens Park', 'playground', '700 S Lane St', 47.59695131, -122.32333318, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Jefferson Park', 'playground', '3801 Beacon Ave S', 47.57048707, -122.30917279, false, 'Accessible (ADA).', 'seattle-parks'),
  ('John C. Little, Sr. Park', 'playground', '6961 37th Ave S', 47.53937701, -122.28664431, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Judkins Park and Playfield', 'playground', '2150 S Norman St', 47.59262993, -122.30391467, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Kinnear Park', 'playground', '899 W Olympic Place', 47.62789724, -122.36716063, false, null, 'seattle-parks'),
  ('Kirke Park', 'playground', '7028 9th Avenue NW', 47.68017311, -122.36796255, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Lake City HUB', 'playground', '12510 33rd Ave NE', 47.71993523, -122.29246834, false, null, 'seattle-parks'),
  ('Lakeridge Park and Playground', 'playground', '10145 Rainier Ave S', 47.5104151, -122.2463172, false, null, 'seattle-parks'),
  ('Lakewood Playground', 'playground', '5013 S Angeline St', 47.55915905, -122.26967771, false, null, 'seattle-parks'),
  ('Laurelhurst Playfield', 'playground', '4544 NE 41st St', 47.65962922, -122.27783844, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Lawton Park', 'playground', '3843 26th Ave W', 47.65578323, -122.39092153, false, null, 'seattle-parks'),
  ('Leschi Park', 'playground', '201 Lakeside Ave S', 47.60084275, -122.28699306, false, null, 'seattle-parks'),
  ('Licton Springs Park', 'playground', '9536 Ashworth Ave N', 47.69859366, -122.33934006, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Lincoln Park - Beach', 'playground', '8011 Fauntleroy Way SW', 47.52634541, -122.39477284, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Lincoln Park - North', 'playground', '8011 Fauntleroy Way SW', 47.53462223, -122.39473742, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Lincoln Park - South', 'playground', '8011 Fauntleroy Way SW', 47.52715889, -122.3947795, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Little Brook Park', 'playground', '14043 32nd Ave NE', 47.73140758, -122.29423691, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Lowman Beach Park', 'playground', '7017 Beach Dr SW', 47.54036668, -122.39672777, false, null, 'seattle-parks'),
  ('Loyal Heights Playfield', 'playground', '2101 NW 77th St', 47.6846736, -122.38400376, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Madison Park', 'playground', '1898 43rd Ave E', 47.63530488, -122.2775807, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Madison Park - North Beach', 'playground', '2200 43rd Ave E', 47.63944565, -122.27677576, false, null, 'seattle-parks'),
  ('Madrona Park -Beach', 'playground', '853 Lake Washington Blvd S', 47.60864215, -122.28287804, false, null, 'seattle-parks'),
  ('Madrona Playground', 'playground', '3211 E Spring St', 47.61125539, -122.28966516, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Magnolia Park', 'playground', '1461 Magnolia Blvd W', 47.63322545, -122.39809868, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Maple Leaf Playground', 'playground', '1020 NE 82nd St', 47.68936462, -122.31717012, false, null, 'seattle-parks'),
  ('Maplewood Playfield', 'playground', '4801 Corson Ave S', 47.56073636, -122.31779604, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Matthews Beach Park', 'playground', '9300 51st Ave NE', 47.69690808, -122.2740525, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Mayfair Park', 'playground', '2600 2nd Ave N', 47.64321844, -122.35339993, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Meadowbrook Playfield', 'playground', '10533 35th Ave NE', 47.70517102, -122.29113211, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Meridian Playground', 'playground', '4649 Sunnyside Ave N', 47.66437154, -122.33223411, false, null, 'seattle-parks'),
  ('Miller Playfield', 'playground', '400 19th Ave E', 47.62109268, -122.30697925, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Montlake Playfield', 'playground', '1618 E Calhoun St', 47.64169853, -122.30944928, false, null, 'seattle-parks'),
  ('Montlake Totlot', 'playground', '26th Ave E / E Lynn St.', 47.63955595, -122.29840901, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Mrytle Reservoir Park', 'playground', 'SW Myrtle St / 35th Ave SW', 47.54060202, -122.37763297, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Mt. Baker Park', 'playground', '2521 Lake Park Drive S', 47.57853952, -122.28893294, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Northacres Park', 'playground', '12530 3rd Ave NE', 47.72137623, -122.32806536, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Northgate Park', 'playground', '10548 5th Ave NE', 47.7058995, -122.32223749, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Occidental Square', 'playground', '117 S Washington St', 47.60063822, -122.33330441, false, null, 'seattle-parks'),
  ('Othello Playground', 'playground', '4351 S Othello St', 47.53635667, -122.27700345, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Overlook Walk (Alaskan Way Boulevard)', 'playground', '1904 Western Ave', 47.60917044, -122.34301213, false, null, 'seattle-parks'),
  ('Oxbow Park', 'playground', '6430 Corson Ave S', 47.54499491, -122.32147142, false, null, 'seattle-parks'),
  ('Pathways Park', 'playground', '5201 Sand Point Way NE', 47.66732323, -122.28192425, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Peppi Playground', 'playground', '3233 E Spruce St', 47.60253568, -122.29053808, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Pinehurst Playground', 'playground', '12029 14th Ave NE', 47.71626992, -122.31423138, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Plum Tree Park', 'playground', '1717 26th Ave', 47.61699691, -122.29919413, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Powell Barnett Park', 'playground', '352 M.L. King Jr. Way', 47.60458888, -122.29591993, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Pratt Park', 'playground', '1800 S Main St', 47.60089444, -122.30787185, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Prentis Frazier Park', 'playground', '401 24th Ave E', 47.62282997, -122.30147104, false, null, 'seattle-parks'),
  ('Puget Ridge Playground', 'playground', '21st Ave SW / Croft Pl SW', 47.54740197, -122.35992085, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Rainier Beach Community Center', 'playground', '8802 Rainier Ave South', 47.52462911, -122.27122908, false, null, 'seattle-parks'),
  ('Rainier Beach Playfield', 'playground', '8802 Rainier Ave S', 47.52479405, -122.27269276, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Rainier Community Center', 'playground', '4600 38th Ave S', 47.56123268, -122.28340835, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Rainier Playfield', 'playground', '3700 S Alaska St', 47.56262801, -122.28552286, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Ravenna Park', 'playground', '5520 Ravenna Ave NE', 47.66909998, -122.30292771, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Ravenna-Eckstein CC Grounds', 'playground', '6535 Ravenna Ave NE', 47.67670201, -122.30474586, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Riverview Playfield', 'playground', '7226 12th Ave SW', 47.53928113, -122.34996231, false, null, 'seattle-parks'),
  ('Roanoke Park', 'playground', '950 E Roanoke St', 47.64425713, -122.32026451, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Rogers Playground', 'playground', '2516 Eastlake Ave E', 47.64286402, -122.32506662, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Ross Playground', 'playground', '4320 4th Ave NW', 47.66019865, -122.36121739, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Roxhill Park', 'playground', '2850 SW Roxbury St', 47.5200784, -122.36937634, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Salmon Bay Park', 'playground', '2001 NW Canoe Pl', 47.6792973, -122.38134272, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Sam Smith Park', 'playground', 'I-90 West Portal', 47.59007807, -122.29525737, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Sandel Playground', 'playground', '9053 1st Ave NW', 47.69567869, -122.35886295, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Seward Park', 'playground', '5898 Lake Washington Bv S', 47.54950036, -122.25630454, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Soundview Playfield', 'playground', '1590 NW 90th St', 47.69527728, -122.38016688, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Soundview Terrace Play Area', 'playground', '2500 11th Ave W', 47.6405541, -122.37139235, false, 'Accessible (ADA).', 'seattle-parks'),
  ('South Park Playground', 'playground', '738 S Sullivan St', 47.52833239, -122.32455951, false, null, 'seattle-parks'),
  ('Southwest Community Center', 'playground', '2801 SW Thistle St', 47.52759983, -122.36894008, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Spring Street Mini Park', 'playground', '15th Ave / E Spring St', 47.61188108, -122.3125767, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Spruce Street Mini Park', 'playground', '160 21st Ave', 47.60285061, -122.30464691, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Trolley Hill Park', 'playground', '5th Ave N / Blaine St', 47.63511461, -122.34729375, false, null, 'seattle-parks'),
  ('TT Minor Playground', 'playground', '17th Ave / E Union St', 47.61312601, -122.31056938, false, 'Accessible (ADA).', 'seattle-parks'),
  ('University Playground', 'playground', '4745 9th Ave NE', 47.66423971, -122.31974831, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Urban Triangle Park', 'playground', '2100 Westlake Ave', 47.61686161, -122.33777066, false, null, 'seattle-parks'),
  ('Van Asselt Playground', 'playground', '7200 Beacon Ave S', 47.53929336, -122.2960717, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Victory Heights Playground', 'playground', '1737 NE 106th St', 47.7060089, -122.30788451, false, null, 'seattle-parks'),
  ('Viewridge Playfield', 'playground', '4408 NE 70th St', 47.679747, -122.27996947, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Virgil Flaim Park', 'playground', '2750 NE 125th St', 47.71809653, -122.29972296, false, null, 'seattle-parks'),
  ('Volunteer Park', 'playground', '1247 15th Ave E', 47.6319611, -122.31312395, false, 'Accessible (ADA).', 'seattle-parks'),
  ('W. Magnolia Playfield', 'playground', '2518 34th Ave W', 47.64146676, -122.40037431, false, 'Accessible (ADA).', 'seattle-parks'),
  ('W. Queen Anne Playfield', 'playground', '150 W. Blaine St', 47.63564869, -122.36058796, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Wallingford Playfield', 'playground', '4219 Wallingford Ave N', 47.65894853, -122.33699984, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Walt Hundley Playfield', 'playground', '6920 34th Ave SW', 47.53997573, -122.37464527, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Ward Springs Park', 'playground', '925 4th Ave N', 47.62786041, -122.34941674, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Warren G. Magnuson Park', 'playground', '6500 Sand Point Way NE', 47.68172825, -122.25338279, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Washington Park', 'playground', '2500 Lake Washington Blvd. E', 47.62767381, -122.29398222, false, null, 'seattle-parks'),
  ('Waterfront Park', 'playground', '1401 Alaskan Wy', 47.60704633, -122.34196995, false, null, 'seattle-parks'),
  ('Webster Playground', 'playground', '3014 NW 67th St', 47.67783168, -122.39785127, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Westcrest Park', 'playground', '9000 8th Ave SW', 47.52449993, -122.34286427, false, null, 'seattle-parks'),
  ('Westlake Park', 'playground', '401 Pine Street', 47.6109983, -122.33692103, false, null, 'seattle-parks'),
  ('Woodland Park', 'playground', '5420 Phinney Ave N', 47.67131777, -122.35345754, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Yesler Community Center', 'playground', '917 East Yesler Way', 47.60100062, -122.320141, false, 'Accessible (ADA).', 'seattle-parks'),
  ('Ballard Pool', 'pool', '1471 NW 67th Street', 47.67754026, -122.37616194, true, null, 'seattle-parks'),
  ('Colman Pool', 'pool', '8603 Fauntleroy Wy S', 47.53045332, -122.40097906, false, null, 'seattle-parks'),
  ('Evans Pool', 'pool', '7201 E GreenLk Dr N', 47.68018276, -122.32843756, true, null, 'seattle-parks'),
  ('Madison Pool', 'pool', '13401 Meridian Ave N', 47.72580143, -122.3346563, true, null, 'seattle-parks'),
  ('Meadowbrook Pool', 'pool', '10515 35th Ave NE', 47.70534163, -122.29162385, true, null, 'seattle-parks'),
  ('Medgar Evers Pool', 'pool', '500 23rd Ave', 47.6068876, -122.30240183, true, null, 'seattle-parks'),
  ('Mounger Pool', 'pool', '2535 32nd Ave West', 47.64290025, -122.3988701, false, null, 'seattle-parks'),
  ('Queen Anne Pool', 'pool', '1920 1st Ave West', 47.63626287, -122.35795027, true, 'Marked closed in the city data — check before you go.', 'seattle-parks'),
  ('Rainier Beach Pool', 'pool', '8825 Rainier Ave S', 47.52476642, -122.27033751, true, null, 'seattle-parks'),
  ('Southwest Pool', 'pool', '2801 SW Thistle St', 47.52800132, -122.36916224, true, null, 'seattle-parks'),
  ('Ballard Commons Park Water Spray', 'splash_pad', '5701 22nd Ave NW', 47.67038419, -122.38524506, false, null, 'seattle-parks'),
  ('Beacon Hill Playground Wading Pool', 'splash_pad', '1820 13th Ave S', 47.58678374, -122.31503374, false, null, 'seattle-parks'),
  ('Beacon Mountain Water Spray', 'splash_pad', '3801 Beacon Ave S', 47.57002964, -122.31006935, false, null, 'seattle-parks'),
  ('Bitter Lake Playfield Wading Pool', 'splash_pad', '13035 Linden Ave N', 47.7234732, -122.34917749, false, null, 'seattle-parks'),
  ('Delridge Playfield Wading Pool', 'splash_pad', '4501 Delridge Way SW', 47.56415029, -122.36411414, false, null, 'seattle-parks'),
  ('E.C. Hughes Playground Wading Pool', 'splash_pad', '2805 SW Holden St', 47.53337673, -122.36885665, false, null, 'seattle-parks'),
  ('East Queen Anne Playground Wading Pool', 'splash_pad', '160 Howe St', 47.63614261, -122.35415934, false, null, 'seattle-parks'),
  ('Edwin T. Pratt Park Water Spray', 'splash_pad', '1800 S Main St', 47.60106112, -122.30683107, false, null, 'seattle-parks'),
  ('Georgetown Playfield Water Spray', 'splash_pad', '750 S Homer St', 47.55214777, -122.32113825, false, null, 'seattle-parks'),
  ('Gilman Playground Wading Pool', 'splash_pad', '923 NW 54th St', 47.66691355, -122.36962521, false, null, 'seattle-parks'),
  ('Green Lake Park Wading Pool', 'splash_pad', 'N 73rd St & W Green Lake Dr N', 47.68527021, -122.33695876, false, null, 'seattle-parks'),
  ('Hiawatha Playfield Wading Pool', 'splash_pad', '2700 California Ave SW', 47.57893701, -122.38396337, false, null, 'seattle-parks'),
  ('Highland Park Playground Water Spray', 'splash_pad', '1100 SW Cloverdale St', 47.52710535, -122.34973022, false, null, 'seattle-parks'),
  ('John C. Little, Sr. Park Water Spray', 'splash_pad', '6961 37th Ave S', 47.53924338, -122.28648153, false, null, 'seattle-parks'),
  ('Judkins Park and Playfield Water Spray', 'splash_pad', '2150 S Norman St', 47.59236548, -122.30390733, false, null, 'seattle-parks'),
  ('Lake Union Park Water Spray', 'splash_pad', '800 Terry Ave N', 47.62654185, -122.3373604, false, null, 'seattle-parks'),
  ('Lincoln Park Wading Pool', 'splash_pad', '8011 Fauntleroy Way SW', 47.53456275, -122.39375935, false, null, 'seattle-parks'),
  ('Northacres Park Water Spray', 'splash_pad', '12800 1st Ave NE', 47.72208112, -122.32847748, false, null, 'seattle-parks'),
  ('Peppi''s Playground Wading Pool', 'splash_pad', '3233 E Spruce St', 47.60249105, -122.29090747, false, null, 'seattle-parks'),
  ('Powell Barnett Park Wading Pool', 'splash_pad', '352 Martin Luther King Way', 47.6045572, -122.29586088, false, null, 'seattle-parks'),
  ('Ravenna Park Wading Pool', 'splash_pad', '5520 Ravenna Ave NE', 47.66941156, -122.30330531, false, null, 'seattle-parks'),
  ('Ron K. Bills Memorial Fountain', 'splash_pad', '330 19th Ave E', 47.62153943, -122.30661269, false, null, 'seattle-parks'),
  ('Sandel Playground Wading Pool', 'splash_pad', '9053 1st Ave NW', 47.69580735, -122.3584773, false, null, 'seattle-parks'),
  ('Soundview Playfield Wading Pool', 'splash_pad', '1590 NW 90th', 47.69517448, -122.38020371, false, null, 'seattle-parks'),
  ('South Park Playground Water Spray', 'splash_pad', '8319 8th Ave S', 47.52839183, -122.32475406, false, 'Marked closed in the city data — check before you go.', 'seattle-parks'),
  ('Van Asselt Playground Wading Pool', 'splash_pad', '2820 S Myrtle St', 47.53942596, -122.29625733, false, null, 'seattle-parks'),
  ('View Ridge Playfield Wading Pool', 'splash_pad', '4408 NE 70th St', 47.6798588, -122.28125414, false, 'Marked closed in the city data — check before you go.', 'seattle-parks'),
  ('Volunteer Park Wading Pool', 'splash_pad', '1400 E Galer St', 47.63206938, -122.31394689, false, null, 'seattle-parks'),
  ('Waldo J. Dahl Playfield Wading Pool', 'splash_pad', '7700 25th Ave NE', 47.68411395, -122.29954119, false, null, 'seattle-parks'),
  ('Wallingford Playfield Wading Pool', 'splash_pad', '4219 Wallingford Ave N', 47.65891534, -122.33656161, false, null, 'seattle-parks')
on conflict (name, address) do nothing;

-- 3) RLS: SELECT to anon + authenticated. Public infrastructure (the signed-out
--    detail page links to a place page), so this is deliberate and is the ONLY
--    policy on the table — no INSERT/UPDATE/DELETE policy exists anywhere, and
--    RLS denies by default, so writes stay postgres-only. DO-block guarded
--    (there is no CREATE POLICY IF NOT EXISTS).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'places'
      and policyname = 'places_select_public'
  ) then
    create policy "places_select_public"
      on public.places for select
      to anon, authenticated
      using (true);
  end if;
end
$$;

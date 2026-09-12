#!/usr/bin/env python3
"""
Generate supabase/migrations/0029_places.sql from the REAL City of Seattle
ArcGIS extracts in .scratch/v8/places-data/ plus the hand-curated indoor list
in .scratch/v8/hand-places.json.

Deterministic: same inputs -> byte-identical SQL (rows are sorted), so the
committed migration is reviewable and re-generatable.

Run:  python3 .scratch/v8/gen-places-seed.py
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
DATA = ROOT / ".scratch" / "v8" / "places-data"
OUT = ROOT / "supabase" / "migrations" / "0029_places.sql"
RETRIEVED = "2026-09-13"

# name field, address field -> (kind, indoor, source)
DATASET = [
    ("Play_Area", "PROPNAME", "playground", False, "seattle-parks"),
    ("Spray_Parks", "NAME", "splash_pad", False, "seattle-parks"),
    ("Wading_Pools", "NAME", "splash_pad", False, "seattle-parks"),
    ("Swimming_Pools", "NAME", "pool", None, "seattle-parks"),  # indoor from INDOOR_OUT
    ("Swimming_Beaches", "NAME", "beach", False, "seattle-parks"),
    ("Community_Centers", "NAME", "other", True, "seattle-parks"),
]

SERVICE_BASE = "https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services"


def load(service):
    return json.loads((DATA / f"{service}.json").read_text())["features"]


def num(value, places=8):
    """A numeric literal for the SQL, trailing zeros trimmed (never rounded away)."""
    text = f"{float(value):.{places}f}".rstrip("0").rstrip(".")
    return text if text not in ("", "-0") else "0"


def sql_str(value):
    return "'" + str(value).replace("'", "''") + "'"


def tidy(value):
    """Collapse the dataset's doubled spaces ('104  17th Ave S')."""
    return " ".join(str(value).split())


def addr_title(value):
    """The city data is ALL CAPS; keep it exactly as published (never re-cased:
    re-casing is editing an authoritative address)."""
    return tidy(value)


def closed_reason(service, attrs):
    """The dataset's own operational field, when it says the facility is shut."""
    if service in ("Spray_Parks", "Wading_Pools"):
        if (attrs.get("OPENCLOSED") or "").strip().lower() == "no":
            return "Marked closed in the city data — check before you go."
    if service == "Community_Centers":
        if (attrs.get("OPERATIONALSTATUS") or "").strip().lower() == "closed":
            return "Marked closed in the city data — check before you go."
    if service == "Swimming_Pools":
        if (attrs.get("STATUS") or "").strip().lower() == "closed/out of service":
            return "Marked closed in the city data — check before you go."
    return None


def build_rows():
    rows = []
    dropped = {"no_name": 0, "no_coords": 0, "no_address": 0, "dupe": 0}
    seen = set()

    for service, name_field, kind, indoor_default, source in DATASET:
        for feature in load(service):
            a = feature["attributes"]
            name = tidy(a.get(name_field) or "")
            if name == "":
                dropped["no_name"] += 1
                continue
            lat, lng = a.get("LATITUDE"), a.get("LONGITUDE")
            if lat is None or lng is None:
                dropped["no_coords"] += 1
                continue
            address = addr_title(a.get("ADDRESS") or "")
            if address == "":
                # Dropped deliberately: the unique key is (name, address) and a
                # NULL address would make the seed's ON CONFLICT a no-op, so a
                # re-paste would duplicate the row (the 0012 re-paste-safety rule).
                dropped["no_address"] += 1
                continue

            # indoor: the pool layer publishes the real thing (INDOOR_OUT);
            # everything else is the pinned per-kind mapping.
            indoor = indoor_default
            if indoor is None:
                indoor = (a.get("INDOOR_OUT") or "").strip().lower() != "outdoor"

            notes = []
            if (a.get("ADA") or "").strip().lower() == "yes":
                notes.append("Accessible (ADA).")
            shutdown = closed_reason(service, a)
            if shutdown is not None:
                notes.append(shutdown)

            key = (name.lower(), address.lower())
            if key in seen:
                dropped["dupe"] += 1
                continue
            seen.add(key)
            rows.append(
                {
                    "name": name,
                    "kind": kind,
                    "address": address,
                    "lat": num(lat),
                    "lng": num(lng),
                    "indoor": indoor,
                    "notes": " ".join(notes) if notes else None,
                    "source": source,
                }
            )

    # Hand-curated indoor rows (real addresses verified by web search; library
    # coordinates from the City's own Seattle_Public_Library feature service).
    hand = json.loads((DATA.parent / "hand-places.json").read_text())
    for row in hand:
        key = (row["name"].lower(), row["address"].lower())
        if key in seen:
            dropped["dupe"] += 1
            continue
        seen.add(key)
        rows.append(
            {
                "name": row["name"],
                "kind": row["kind"],
                "address": row["address"],
                "lat": num(row["lat"]) if row.get("lat") is not None else None,
                "lng": num(row["lng"]) if row.get("lng") is not None else None,
                "indoor": True,
                "notes": row.get("notes"),
                "source": "hand",
            }
        )

    rows.sort(key=lambda r: (r["kind"], r["name"].lower(), r["address"].lower()))
    return rows, dropped, len(hand)


def value_tuple(r):
    parts = [
        sql_str(r["name"]),
        sql_str(r["kind"]),
        sql_str(r["address"]),
        r["lat"] if r["lat"] is not None else "null",
        r["lng"] if r["lng"] is not None else "null",
        "true" if r["indoor"] else "false",
        sql_str(r["notes"]) if r["notes"] else "null",
        f"'{r['source']}'",
    ]
    return "  (" + ", ".join(parts) + ")"


def main():
    rows, dropped, hand_count = build_rows()
    by_kind = {}
    by_source = {}
    for r in rows:
        by_kind[r["kind"]] = by_kind.get(r["kind"], 0) + 1
        by_source[r["source"]] = by_source.get(r["source"], 0) + 1

    header = f"""-- V8 ticket 07: the PLACES directory (the place entity the product's whole
-- premise assumes: "fun places around the city"). 0012's SimpleMaps discipline
-- — the extract is fetched, the resulting rows are committed as STATIC SQL, and
-- this header records the endpoints, the retrieval date, and the licence.
--
-- SEED PROVENANCE (real data; no row, address, coordinate, or photo is invented)
--   Publisher: City of Seattle / Seattle Parks and Recreation, via the City's
--   public ArcGIS feature services (org ZOyb2t4B0UYuYNYH).
--   Retrieved: {RETRIEVED} (curl, outFields=*, f=json; the raw extracts live in
--   .scratch/v8/places-data/ and the seed was GENERATED from them by
--   .scratch/v8/gen-places-seed.py).
--   Licence: the City of Seattle publishes these layers as open data
--   (Seattle's open-data terms: public domain / no restrictions; attribution
--   to the City of Seattle). Every endpoint below was verified reachable and
--   returned real rows on {RETRIEVED}.
--
--   Play Areas       -> kind 'playground'   {SERVICE_BASE}/Play_Area/FeatureServer/0/query
--   Spray Parks      -> kind 'splash_pad'   {SERVICE_BASE}/Spray_Parks/FeatureServer/0/query
--   Wading Pools     -> kind 'splash_pad'   {SERVICE_BASE}/Wading_Pools/FeatureServer/0/query
--   Swimming Pools   -> kind 'pool'         {SERVICE_BASE}/Swimming_Pools/FeatureServer/0/query
--   Swimming Beaches -> kind 'beach'        {SERVICE_BASE}/Swimming_Beaches/FeatureServer/0/query
--   Community Centers-> kind 'other'        {SERVICE_BASE}/Community_Centers/FeatureServer/0/query
--                                          (indoor = true)
--   Seattle Public Library (the hand rows' coordinates)
--                    -> {SERVICE_BASE}/Seattle_Public_Library/FeatureServer/0/query
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
--   Dropped this run: {dropped['no_name']} no-name, {dropped['no_coords']} no-coords
--   (Yesler Terrace Park Water Spray — listed with a null point in BOTH the
--   Spray Parks and Wading Pools layers — Warren G. Magnuson Wading Pool,
--   Cal Anderson Wading Pool, and Lake City Community Center; the Magnuson and
--   Cal Anderson SITES are still in the directory through their Play Areas),
--   {dropped['no_address']} no-address (the Play Areas 'South Park Plaza' and
--   'Crown Hill Park' — real parks the city publishes with no street address),
--   and {dropped['dupe']} duplicate (name, address) rows. The duplicates are
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
-- THE HAND-CURATED INDOOR LIST (source = 'hand'): {hand_count} rows whose
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
-- Seed size this run: {len(rows)} rows{''.join(f' · {k}: {v}' for k, v in sorted(by_kind.items()))}
--   by source: {', '.join(f'{k}: {v}' for k, v in sorted(by_source.items()))}

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

-- 2) The seed ({len(rows)} rows; see the provenance header above).
insert into public.places
  (name, kind, address, lat, lng, indoor, notes, source)
values
"""

    body = ",\n".join(value_tuple(r) for r in rows)
    tail = """
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
"""

    OUT.write_text(header + body + tail)
    print(f"wrote {OUT}")
    print(f"rows: {len(rows)}  by kind: {sorted(by_kind.items())}")
    print(f"by source: {sorted(by_source.items())}")
    print(f"dropped: {dropped}")


if __name__ == "__main__":
    main()

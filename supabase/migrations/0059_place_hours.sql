-- ===========================================================================
-- V27 (migration 0059): "is it open right now?" for `places`.
-- ===========================================================================
--
-- What this does: adds THREE nullable columns to `public.places` — a normalized
-- weekly `hours` (jsonb), the `hours_source` that produced it, and the
-- `hours_checked_at` timestamp of the snapshot. Strictly additive; no
-- constraint on the data, no policy change, no existing row touched. Re-paste
-- safe (the 0046 / 0048 `information_schema` guard shape).
--
-- Why: the founder's priority list for a place card —
--
--   *"I'd want to see, like, is it open? … is it indoor or outdoor? … how other
--   parents have reviewed it … and how close it is to me. Those are the
--   prominent things."*
--
-- Indoor/outdoor, distance and stars come from data the directory already has.
-- "Is it open" does not exist anywhere, and the two honest sources differ in
-- quality, which is why `hours_source` is a column rather than a silent mix:
--
--   * `'osm'` — a real per-venue schedule matched from OpenStreetMap (ODbL;
--     "© OpenStreetMap contributors" must be rendered wherever it is shown).
--     Measured coverage is thin: 26/239 rows, concentrated in libraries (6/6)
--     and community centres (~13/26). See `research/place-hours-source.md`.
--   * `'city_default'` — Seattle Parks' standard open-space hours (roughly
--     6:00–22:00 daily) applied to playgrounds/beaches. This is a LABELLED
--     citywide assumption, not a venue schedule, and the card says "typical
--     hours" when it is the source.
--
-- THE SHAPE IS NORMALIZED, NOT RAW. `hours` holds:
--
--   { "display": "6:00 AM – 10:00 PM",
--     "weekly": { "0": [["06:00","22:00"]], "1": [["06:00","22:00"]], ... } }
--
-- keyed by JS `Date.getDay()` (0 = Sunday), each value a list of `[open, close]`
-- 24h "HH:MM" pairs. Normalizing at backfill time is deliberate: the OSM
-- `opening_hours` grammar (month ranges, "PH closed", quoted comments) is
-- genuinely hard, so it is parsed ONCE by the backfill with the `opening_hours`
-- package and the app only ever evaluates simple intervals (`placeHours.ts`,
-- pure + unit-tested). A raw string the parser could not normalize is NOT
-- written — the row stays NULL rather than being shown as a guessed schedule.
--
-- A NULL IS A SUPPORTED END STATE (the 0048 rule): 213 of 239 rows have no
-- trustworthy hours today. The card renders NO open/closed chip for them —
-- never a fabricated "Open".
--
-- NO NOT NULL, NO CHECK (the 0021 / 0046 / 0048 lesson): a hand-correction must
-- never be blocked by a constraint. The SHAPE is enforced one layer up —
-- `placeHours.ts` accepts only a well-formed `weekly` map and returns `null`
-- (unknown) for anything else, so junk cannot become a status claim.
--
-- NO RLS CHANGE: `places` is world-readable already and this column rides the
-- existing whole-row SELECT posture; there is still no insert/update/delete
-- policy for any app role, so hours arrive only through the service-role
-- backfill.
--
-- Apply order: independent; assumes only that `public.places` exists (since
-- 0029). Last applied migration is 0055.

-- ---------------------------------------------------------------------------
-- 1. The hours columns.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'places' and column_name = 'hours'
  ) then
    alter table public.places add column hours jsonb;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'places' and column_name = 'hours_source'
  ) then
    alter table public.places add column hours_source text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'places' and column_name = 'hours_checked_at'
  ) then
    alter table public.places add column hours_checked_at timestamptz;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Read the columns honestly, in the schema itself.
-- ---------------------------------------------------------------------------
comment on column public.places.hours is
  'Normalized weekly opening hours: {display, weekly:{<getDay>:[["HH:MM","HH:MM"],...]}}. NULL = unknown. Parsed once at backfill time; never guessed.';
comment on column public.places.hours_source is
  'Where hours came from: ''osm'' (ODbL, per-venue) or ''city_default'' (Seattle open-space default). NULL when hours is NULL.';
comment on column public.places.hours_checked_at is
  'When the hours snapshot was fetched, so a stale schedule can be re-checked rather than trusted forever.';

-- ---------------------------------------------------------------------------
-- 3. A partial index for the backfill's coverage report (the 0048 pattern).
-- ---------------------------------------------------------------------------
create index if not exists places_hours_missing_idx
  on public.places (id)
  where hours is null;

-- ===========================================================================
-- V20 t01 (migration 0048): the operator WEBSITE for `places`.
-- ===========================================================================
--
-- What this does: adds ONE nullable text column to `public.places` —
-- `website_url`. It adds no constraint, changes no policy, and touches no
-- existing row. Strictly additive and re-paste-safe: this is a LIVE-DATABASE
-- migration (the project it applies to holds real family data).
--
-- Why: the founder's ruling on the place page's imagery —
--
--   *"instead of using images, we just try to link to the website for that
--   place so people can learn more about it… maybe we have to get rid of the
--   image part of this because I can't police this and fix all the broken
--   images."*
--
-- V18 (0046) sourced Commons photos for a curated subset and shipped the
-- attribution machinery; V20 removes the photo from the product's surfaces
-- (the founder cannot maintain 239 rows of imagery) and replaces it with the
-- one affordance that is both useful and maintainable: a link to the place's
-- own site.
--
-- THE DIRECTORY HAS NO SUCH FIELD TODAY. `places` is seeded from the City of
-- Seattle's ArcGIS feature services (0029's header records the layers), and
-- NOT ONE of those layers publishes an operator URL. So this column arrives
-- EMPTY for all 239 rows and is filled by a reviewed backfill
-- (`scripts/backfill-place-websites.mjs`), exactly like the 0046 photo
-- backfill: the script writes only rows where an official page was VERIFIED
-- reachable and actually about that place, and every other row keeps NULL.
--
-- **A NULL HERE IS A SUPPORTED END STATE, NOT A GAP.** `placeLearnMoreLink`
-- (`src/lib/places.ts`) falls back to the derived OpenStreetMap search URL and
-- the button says "Find it on the map" rather than pretending it is the
-- operator's site. Most of the 155 playgrounds and 30 spray pads genuinely have
-- no web page; that is a fact about the world, not debt to be closed by
-- inventing URL slugs.
--
-- NO `NOT NULL`, NO CHECK (the 0021 lesson, V3 ticket 08; restated by 0046):
-- the value is free text that a human hand-corrects later, and a constraint
-- here would block a legitimate correction. The SHAPE is enforced one layer up
-- instead — `placeLearnMoreLink` accepts only an `http(s)` URL and falls back
-- for anything else, so a junk value cannot reach an `href`.
--
-- NO RLS CHANGE. `places` is world-readable already (the 0029 anon SELECT is
-- the reason a signed-out visitor can open a place page at all), and this
-- column rides the existing whole-row SELECT posture — the 0014 / 0016 / 0021 /
-- 0046 column-add lesson: adding a column does not, and must not, quietly
-- re-scope a table's policies. There is still NO insert/update/delete policy on
-- `places` for any app role, so a parent can never rewrite a directory row:
-- websites arrive only through the service-role backfill.
--
-- Idempotent + re-paste-safe (house pattern, 2026-09-04 lesson; 0041 / 0045 /
-- 0046 precedents): `add column if not exists` is supported for columns (unlike
-- `create policy`, which has no IF NOT EXISTS and must be DO-block guarded).
-- The guard below is written as an explicit `information_schema` check, which
-- is 0046's shape and converges on a partial prior application. Run once or a
-- hundred times, the table ends in the same state: 239 rows, one empty new
-- column, every pre-existing column byte-identical.
--
-- Apply order: independent. It assumes only that `public.places` exists (it has
-- since 0029) and touches nothing else. The last applied migration is 0047.

-- ---------------------------------------------------------------------------
-- 1. The website column.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'places'
      and column_name = 'website_url'
  ) then
    alter table public.places add column website_url text;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. A partial index for the backfill's own verification query.
--
--    `scripts/backfill-place-websites.mjs --report` asks "how many rows still
--    have no site", and the coverage report is read after every run. The index
--    is on the NULL side, so it is tiny (most rows are NULL today) and it makes
--    that count an index-only scan rather than a 239-row seq scan. It is
--    created only if absent, so re-pasting is a no-op.
-- ---------------------------------------------------------------------------
create index if not exists places_website_url_missing_idx
  on public.places (id)
  where website_url is null;

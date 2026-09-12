-- V8 ticket 07 (part 2): the drop-in's PLACE link — `playdates.place_id` and
-- `playdate_series.place_id`, plus the signed-out public surface extended
-- 12 -> 13 fields.
--
-- Pinned decisions (ticket 07):
--
-- (a) THE DISTANCE-MODEL FIX. Through V8 a drop-in's LOCATION was the HOST's
--     home zip (the 2026-09-09 V2 decision), so a parent hosting at a park
--     across town was filtered as if the meetup were in their driveway. With
--     `place_id` set, distance is computed from the PLACE's own coordinates
--     (places.lat/lng, 0029) and the host zip is kept ONLY as the fallback for
--     posts that name no place. That is the entire existing corpus — every post
--     created before this migration has place_id null, so nothing about the
--     current feed changes until a parent picks a place. The rule lives in ONE
--     pure, unit-tested seam (src/lib/feed.ts postDistanceMiles, exercised by
--     filterFeed); a post that resolves to neither a place nor a host zip stays
--     EXCLUDED, because coordinates are never invented.
--
--     NOTE (deliberate, and this migration does not change it): the weekly
--     occurrence generator (0028 ensure_series_occurrences) inserts an EXPLICIT
--     column list that predates this column, so occurrences it creates for the
--     weeks ahead carry place_id null while the first occurrence carries the
--     value /new wrote. `playdate_series.place_id` is therefore stored and
--     available, and the generator's propagation is a separate change (adding
--     `s.place_id` to its insert), deliberately left out of the ticket's pinned
--     object list. Until then a series' later weeks fall back to the host zip.
--
-- (b) THE 12 -> 13 PIN CHANGE: get_public_playdate's payload gains the post's
--     place_id as the 13th field (after address; the other 12 are UNCHANGED —
--     0015's pinned public surface + 0016's pin hold: status stays
--     authenticated-only, a signed-out visitor still never sees "Cancelled").
--     WHY: the signed-out detail view's place line links to the place page (the
--     way the address already links to Maps), so the id must cross to anon.
--     WHAT DOES NOT CROSS: no place NAME, ADDRESS, COORDINATE, KIND, NOTES or
--     PHOTO. The id is the whole payload addition — the client reads the public
--     `places` table itself (0029's anon SELECT), so anon's reachable place
--     data is exactly the same public infrastructure either way, and the RPC
--     stays a thin projection of the post.
--
-- (c) NO RLS CHANGE (the 0014/0016/0021 column-add lesson): place_id is a new
--     playdates column and rides the EXISTING playdates SELECT posture — the
--     broad authenticated whole-row SELECT (0005: using (true)) and 0015's
--     hidden-aware anon policy are both column-agnostic, so no policy DDL here
--     and no new 42501 surface. The INSERT/UPDATE policies are untouched (the
--     /new insert carries place_id ONLY when a place was actually picked —
--     src/lib/places.ts placeIdField omits the key otherwise, so a free-text
--     post's payload is byte-identical to pre-0030).
--
-- (d) `on delete set null` on both FKs: a place leaving the directory must
--     never delete the drop-ins that met there. The post survives, keeps its
--     free-text `place`, and its distance falls back to the host zip — exactly
--     the documented fallback, not a broken row.
--
-- (e) Postgres has no ALTER TYPE: the 0021 12-field public_playdate composite
--     type is recreated with the 13th field (the function is dropped first — it
--     depends on the type). The swap is DO-block guarded on the type's
--     'place_id' attribute (pg_attribute) so a re-paste on an already-13-field
--     live DB is a no-op — the 0021/0022 pattern, WITH ONE CORRECTION:
--
--     The guard joins on `t.typrelid = a.attrelid`, NOT 0021's
--     `t.oid = a.attrelid`. A composite type's pg_attribute rows carry the
--     pg_class OID (pg_type.typrelid), never the pg_type OID, so 0021's join
--     matches NOTHING and its `if not exists` is ALWAYS true: re-pasting 0021
--     (or 0022, which copied it) drops and recreates the public_playdate type
--     every time instead of no-op'ing. Verified against PostgreSQL 16: for a
--     type created by CREATE TYPE ... AS, typrelid <> oid (16495 vs 16497 in a
--     scratch DB), the 0021 join returns 0 rows for an attribute that exists,
--     and this join returns 1. Correcting it here is what makes THIS migration's
--     re-paste a genuine no-op; 0021's own defect is left alone (that file is
--     applied live and is not this ticket's to rewrite — reported instead).
--
-- Idempotent + re-paste-safe (2026-09-04 house lesson): both column adds are
-- ADD COLUMN IF NOT EXISTS inside DO blocks (0020/0021's structure); both FK
-- constraints are guarded on pg_constraint; the index is IF NOT EXISTS; the
-- function re-create is DROP FUNCTION IF EXISTS + CREATE (0015's pattern);
-- GRANT/REVOKE are themselves re-runnable.

-- 1) The columns. No inline REFERENCES: the FK is added separately and guarded
--    by name, so a re-paste (or a column that somehow already exists) still
--    converges on the pinned constraint.
do $$
begin
  alter table public.playdates add column if not exists place_id uuid;
  alter table public.playdate_series add column if not exists place_id uuid;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'playdates_place_id_fkey'
      and conrelid = 'public.playdates'::regclass
  ) then
    alter table public.playdates
      add constraint "playdates_place_id_fkey"
      foreign key (place_id) references public.places (id) on delete set null;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'playdate_series_place_id_fkey'
      and conrelid = 'public.playdate_series'::regclass
  ) then
    alter table public.playdate_series
      add constraint "playdate_series_place_id_fkey"
      foreign key (place_id) references public.places (id) on delete set null;
  end if;
end
$$;

-- 2) The lookup index for the place page's "upcoming drop-ins here"
--    (listPlaceFeed filters .eq('place_id', ...)). Without it that read is a
--    sequential scan of every playdate ever posted.
create index if not exists playdates_place_id_idx on public.playdates (place_id);

-- 3) The RPC payload (the composite type): 12 -> 13 fields (the guard is the
--    type's 'place_id' attribute — a re-paste on an already-migrated live DB
--    skips the swap entirely). `place_id` sits with the other location fields,
--    right after `address`; the 12 existing attributes keep their names AND
--    their order, so every existing consumer's field access is unchanged.
do $$
begin
  if not exists (
    select 1
    from pg_attribute a
    join pg_type t on t.typrelid = a.attrelid
    join pg_namespace ns on ns.oid = t.typnamespace
    where ns.nspname = 'public'
      and t.typname = 'public_playdate'
      and a.attname = 'place_id'
      and not a.attisdropped
  ) then
    drop function if exists public.get_public_playdate(uuid);
    drop type if exists public.public_playdate;
    create type public.public_playdate as (
      id uuid,
      title text,
      place text,
      address text,
      place_id uuid,
      starts_at timestamptz,
      ends_at timestamptz,
      age_hint text,
      details text,
      neighborhood_name text,
      host_display_name text,
      host_avatar_url text,
      going_count integer
    );
  end if;
end
$$;

-- 4) The signed-out detail fetch: the SECURITY DEFINER function RE-CREATED
--    (0015/0021's pattern, EXACT — the same search_path pin, the same body
--    shape; the payload now carries the 13th field). A missing OR hidden post
--    returns NULL — the client settles not-found, so a hidden post's existence
--    is not confirmed to a signed-out visitor.
drop function if exists public.get_public_playdate(uuid);

create function public.get_public_playdate(p_id uuid)
returns public.public_playdate
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  result public.public_playdate;
begin
  select
    p.id,
    p.title,
    p.place,
    p.address,
    p.place_id,
    p.starts_at,
    p.ends_at,
    p.age_hint,
    p.details,
    n.name,
    h.display_name,
    h.avatar_url,
    (select count(*) from public.going_pings gp where gp.playdate_id = p.id)
  into result
  from public.playdates p
  join public.neighborhoods n on n.id = p.neighborhood_id
  left join public.profiles h on h.id = p.host_profile_id
  where p.id = p_id
    and p.hidden_at is null;

  if not found then
    return null;
  end if;
  return result;
end;
$$;

-- 5) EXECUTE: the two app roles only (Postgres grants EXECUTE to PUBLIC by
--    default on a new function — the revoke closes that). 0015's scoping,
--    UNCHANGED: anon + authenticated, and only those. An anon probe must still
--    return the 13-field payload, and a hidden post must still 404 through it.
grant execute on function public.get_public_playdate(uuid) to anon, authenticated;
revoke execute on function public.get_public_playdate(uuid) from public;

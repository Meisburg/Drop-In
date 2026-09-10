-- V3 slice 5 (ticket 08): address + tap-to-Maps link — playdates.address
-- (optional; the /new field's <=120-char cap is trim-only, no DB CHECK)
-- + the signed-out public surface extended 11 -> 12 fields.
--
-- Pinned decisions (plan-v3.md Interfaces, ticket 08):
-- (a) THE 11 -> 12 PIN CHANGE: get_public_playdate's payload gains the
--     post's address as the 12th field (after place; the other 11 are
--     UNCHANGED — 0015's pinned public surface + 0016's pin holds:
--     status stays authenticated-only, a signed-out visitor still never
--     sees "Cancelled"). WHY: ticket 08 — the detail page's place line
--     becomes a tappable Google Maps link when an address is present,
--     and that link renders in the signed-out (public) view too; the
--     signed-out detail read flows through this RPC (db.ts's
--     getPublicPlaydateDetail), so the address must cross to anon.
-- (b) NO RLS CHANGE (the 0014/0016 column-add lesson): address is a new
--     playdates column and rides the EXISTING playdates SELECT posture —
--     the broad authenticated whole-row SELECT (0005: using (true)) and
--     0015's hidden-aware anon policy (playdates_select_anon:
--     using (hidden_at is null)) are both column-agnostic, so no policy
--     DDL here and no new 42501 surface; anon's only path to a post's
--     public fields in the APP is this RPC (the app's signed-out detail
--     read), which now projects the 12-field payload. The INSERT/UPDATE
--     policies are untouched (the /new insert carries the column only
--     when the parent typed one).
-- (c) Postgres has no ALTER TYPE: the 0015 11-field public_playdate
--     composite type is recreated with the 12th field (the function is
--     dropped first — it depends on the type). The swap is DO-block
--     guarded (guarded on the type's 'address' attribute, pg_attribute)
--     so a re-paste on an already-12-field live DB is a no-op.
--
-- Idempotent + re-paste-safe (2026-09-04 house lesson): the column add is
-- ADD COLUMN IF NOT EXISTS inside a DO block (0020's structure); the
-- function re-create is DROP FUNCTION IF EXISTS + CREATE (0015's
-- create-or-replace made explicitly re-runnable); GRANT/REVOKE are
-- themselves re-runnable.

-- 1) The column (0020's DO-block house structure).
do $$
begin
  alter table public.playdates add column if not exists address text;
end
$$;

-- 2) The RPC payload (the composite type): 11 -> 12 fields (the guard is
--    the type's 'address' attribute — a re-paste on an already-migrated
--    live DB skips the swap entirely).
do $$
begin
  if not exists (
    select 1
    from pg_attribute a
    join pg_type t on t.oid = a.attrelid
    join pg_namespace ns on ns.oid = t.typnamespace
    where ns.nspname = 'public'
      and t.typname = 'public_playdate'
      and a.attname = 'address'
      and not a.attisdropped
  ) then
    drop function if exists public.get_public_playdate(uuid);
    drop type if exists public.public_playdate;
    create type public.public_playdate as (
      id uuid,
      title text,
      place text,
      address text,
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

-- 3) The signed-out detail fetch: the SECURITY DEFINER function
--    RE-CREATED (0015's pattern, EXACT — the same search_path pin, the
--    same body shape; the payload now carries the 12th field). A missing
--    OR hidden post returns NULL — the client settles not-found, so a
--    hidden post's existence is not confirmed to a signed-out visitor.
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

-- 4) EXECUTE: the two app roles only (Postgres grants EXECUTE to PUBLIC
--    by default on a new function — the revoke closes that). 0015's
--    scoping, UNCHANGED: anon + authenticated, and only those.
grant execute on function public.get_public_playdate(uuid) to anon, authenticated;
revoke execute on function public.get_public_playdate(uuid) from public;

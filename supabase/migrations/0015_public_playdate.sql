-- V2 slice 5 (ticket 05, share + public event view): the signed-out public
-- surface for one drop-in.
--
-- Numbering note (plan-v2.md Interfaces): 0014 was consumed by slice 4's
-- moderator hide-path fix (0014_comments_hide_fix.sql — its header logged
-- the renumber), so slice 5's anon-read migration ships as 0015.
--
-- TRUST-REVIEW POINTER (orchestrator): this migration WIDENS the trust
-- surface — the orchestrator reviews the enumeration + block-filter
-- implications below BEFORE the live apply (the CDP pass).
--
-- The public surface (pinned, plan-v2 Interfaces — exactly this, nothing
-- more): the playdate's public fields (title, place, time window,
-- age_hint, details) + the neighborhood display label + the host's
-- display_name + avatar_url + the going count (a COUNT over
-- going_pings — never the per-person rows).
--
-- Enumeration implication (documented per the pin): the anon SELECT on
-- playdates (USING hidden_at is null — visible posts are public content;
-- the distribution layer, the Share button, depends on it) lets a
-- signed-out visitor enumerate post titles/places/times and read one
-- post directly. That is intended. What stays CLOSED to anon:
--   - profiles: no anon policy — the host handle + avatar reach anon ONLY
--     through the SECURITY DEFINER function below, which projects exactly
--     display_name + avatar_url (no bio, kids, home_zip, or any other
--     profile column);
--   - going_pings: no anon policy — the count comes from the function,
--     the rows themselves never cross anon RLS;
--   - comments (0013: authenticated-only, UNCHANGED), blocks, reports
--     (0008: moderators-only SELECT), kids, and every write path
--     (neighborhoods is a 0002 seed list — it gains an anon READ of the
--     display labels only; it has no write policy, so no role can write);
--   - hidden posts (0009's hidden_at) are excluded from BOTH the anon
--     table read (the anon SELECT policy is hidden-aware: USING hidden_at
--     is null) and the RPC (the function filters hidden_at is null — a
--     signed-out visitor gets not-found), so a hidden post's existence is
--     not confirmed to anon. Role-scoping: the policy is anon-only (TO
--     anon), so authenticated direct reads of the table keep the existing
--     0005 posture — hidden rows remain visible to signed-in direct table
--     reads and are filtered in the app's feed query; unchanged by this
--     slice.
--   The feed's DB-level block filter (0006 blocks table) is a query-time
--   filter, not a policy — it does not interact with the anon read.
--
-- Idempotent + re-paste-safe (2026-09-04 house lesson: no CREATE POLICY
-- IF NOT EXISTS — the type + policies are DO-block guarded; the function
-- is CREATE OR REPLACE; GRANT/REVOKE are themselves re-runnable).
-- No 42501 surface: the new SELECT policies are anon-only (TO anon) —
-- Postgres never evaluates a role-scoped policy for a different role, so
-- the authenticated update/delete paths are untouched (the 0014 lesson
-- applies to a role's OWN policies only); the playdates anon policy's
-- USING (hidden_at is null) can only exclude rows from the anon read,
-- never block a write.

-- 1) The composite row the RPC returns (the pinned public surface).
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace ns on ns.oid = t.typnamespace
    where ns.nspname = 'public'
      and t.typname = 'public_playdate'
  ) then
    create type public.public_playdate as (
      id uuid,
      title text,
      place text,
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

-- 2) Anon read of the visible playdate rows (posts are public content;
--    hidden posts are walled by the USING clause; see the header for the
--    enumeration + hidden-post notes).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'playdates'
      and policyname = 'playdates_select_anon'
  ) then
    create policy "playdates_select_anon"
      on public.playdates for select
      to anon
      using (hidden_at is null);
  end if;
end
$$;

-- 3) Anon read of the neighborhood display labels (0002 seeded the list):
--    a signed-out detail view renders the label, so the join read is open
--    to anon — labels only (no write policy exists on the table).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'neighborhoods'
      and policyname = 'neighborhoods_select_anon'
  ) then
    create policy "neighborhoods_select_anon"
      on public.neighborhoods for select
      to anon
      using (true);
  end if;
end
$$;
-- 4) The signed-out detail fetch: the SECURITY DEFINER function. It runs
--    as the creating role (postgres — the dashboard/CDP apply path), so
--    the joins below bypass RLS; it selects EXACTLY the pinned public
--    surface (the profiles join projects only display_name + avatar_url —
--    never bio, kids, home_zip, or any other profile column) and counts
--    going_pings (the rows themselves never cross anon RLS). A missing OR
--    hidden post returns NULL — the client settles not-found, so a hidden
--    post's existence is not confirmed to a signed-out visitor.
--    search_path is pinned (SECURITY DEFINER hygiene: the function never
--    inherits the caller's search_path).
create or replace function public.get_public_playdate(p_id uuid)
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

-- 5) EXECUTE: the two app roles only (Postgres grants EXECUTE to PUBLIC
--    by default on a new function — the revoke closes that).
grant execute on function public.get_public_playdate(uuid) to anon, authenticated;
revoke execute on function public.get_public_playdate(uuid) from public;

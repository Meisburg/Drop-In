-- V3 slice 10 (ticket 05): the guest list — progressive disclosure on going
-- pings. The SECURITY DEFINER get_guest_list RPC.
--
-- Pinned decisions (plan-v3.md Interfaces, ticket 05; the founder-approved
-- design in .scratch/guest-list/spec.md, approved 2026-09-09):
-- (a) THE GATE: get_guest_list(p_id uuid) returns the pingers' display_names
--     (the profiles display_name — the family's handle; kids' first names
--     stay in the kids table and NEVER appear here — the privacy pin holds)
--     ordered by ping created_at (the 0020 column), and ONLY when the
--     caller is the post's host (playdates.host_profile_id = auth.uid()) OR
--     has pinged the post (EXISTS going_pings for the caller). Everyone
--     else gets an EMPTY set — names never cross to strangers (the V1
--     zero-pressure surface for non-attendees stays exactly as shipped).
--     auth.uid() inside a SECURITY DEFINER function reads the CALLER's
--     PostgREST request.jwt (set per request) — proven live 2026-09-10 by
--     0023's SECDEF helper `comment_parent_visible` (commit 90a159f,
--     applied live; the live check's authenticated comment-read probes
--     returning 200 are the proof) — so the gate keys off the calling user,
--     not the definer role.
-- (b) BROAD-SELECT-STAYS (the spec pin, plan-v3 Interfaces ticket 05):
--     the existing `going_pings_select_authenticated` policy (using (true)
--     — the count path) is UNCHANGED. getGoingCount (db.ts, the head/count
--     request over the broad SELECT) keeps working for EVERY authenticated
--     viewer; the regression is verified before/after apply (the count
--     path is untouched by this function). NO RLS change here at all —
--     the function IS the gate (a SECURITY DEFINER read bypasses RLS by
--     design, projecting exactly the names); the broad SELECT remains for
--     counts, the function for names.
-- (c) RESIDUAL VECTOR (documented, accepted — the same class as blocks):
--     any authenticated user can read going_pings rows (profile_id) and
--     profiles (display_name) directly and, for a post they care about,
--     reconstruct the guest names WITHOUT this RPC. The RPC does not make
--     that worse (it only narrows to host/pinger); it is the sanctioned,
--     UI-visible path. Accepted class: same personalization data as blocks
--     (the task-state / plan-v3 risk log). Not tightened in V3.
--
-- Idempotent + re-paste-safe (2026-09-04 house lesson): the function is
-- DROP FUNCTION IF EXISTS + CREATE (the 0021 structure); GRANT/REVOKE are
-- themselves re-runnable.
--
-- EXECUTE scoping (the 0015 pattern, NARROWED to the signed-in surface):
-- EXECUTE to authenticated ONLY — the guest list is a signed-in feature
-- (the host/pinger gate reads auth.uid(), which is NULL for anon, so an
-- anon call would return empty anyway; revoking anon closes the surface).
-- Postgres grants EXECUTE to PUBLIC by default on a new function — the
-- revoke closes that.

drop function if exists public.get_guest_list(uuid);

create function public.get_guest_list(p_id uuid)
returns setof text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  caller uuid;
begin
  caller := auth.uid();
  -- No caller (anon / no JWT) OR not the host AND not a pinger -> no
  -- names cross (the stranger surface stays count-only).
  if caller is null then
    return;
  end if;
  if not exists (
        select 1 from public.playdates p
        where p.id = p_id and p.host_profile_id = caller
      )
     and not exists (
        select 1 from public.going_pings gp
        where gp.playdate_id = p_id and gp.profile_id = caller
      ) then
    return;
  end if;
  return query
    select pr.display_name
    from public.going_pings gp
    join public.profiles pr on pr.id = gp.profile_id
    where gp.playdate_id = p_id
    order by gp.created_at asc;
end;
$$;

grant execute on function public.get_guest_list(uuid) to authenticated;
revoke execute on function public.get_guest_list(uuid) from public;
revoke execute on function public.get_guest_list(uuid) from anon;

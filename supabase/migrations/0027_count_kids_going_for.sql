-- V6: the FEED needs the kids count for many posts at once.
--
-- 0026 shipped count_kids_going(p_id) — one post per call. The feed renders a
-- whole day of cards, so calling it per card would mean one round trip per
-- card on a phone, which is exactly the kind of thing that makes a feed feel
-- slow. This is the batched form: one call, one row per post that has any kids
-- selected.
--
-- Posts with no kids selected are simply ABSENT from the result (not returned
-- as 0) — the client maps by id and defaults to zero, so the payload stays
-- proportional to actual attendance rather than to the size of the feed.
--
-- Same privacy posture as 0026 (decision #2): a bare count for every
-- authenticated viewer, identities never cross. Signed-out visitors get
-- nothing (EXECUTE is authenticated-only, matching the detail page's own
-- count-only public surface).
--
-- Idempotent + re-paste-safe (the 2026-09-04 house lesson): DROP + CREATE.

drop function if exists public.count_kids_going_for(uuid[]);

create function public.count_kids_going_for(p_ids uuid[])
returns table (playdate_id uuid, kids_count integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select pk.playdate_id, count(distinct pk.kid_id)::integer as kids_count
  from public.ping_kids pk
  where pk.playdate_id = any(p_ids)
  group by pk.playdate_id;
$$;

grant execute on function public.count_kids_going_for(uuid[]) to authenticated;
revoke execute on function public.count_kids_going_for(uuid[]) from public;
revoke execute on function public.count_kids_going_for(uuid[]) from anon;

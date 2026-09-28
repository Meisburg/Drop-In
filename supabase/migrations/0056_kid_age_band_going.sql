-- V27 slice 4: the FEED needs the AGE BAND of the kids coming, for many posts
-- at once.
--
-- WHAT IT ANSWERS: "how old are the kids who are coming to this post?" as ONE
-- aggregate range per post — `min(kids.age)..max(kids.age)` over the pingers'
-- own ping_kids selections (0026). The card's going line already states HOW
-- MANY kids are coming (0027's count_kids_going_for); this adds the ONE thing
-- a parent actually needs to judge a playdate — the crowd's age — without ever
-- naming or identifying a single child.
--
-- THE 0027 TEMPLATE, copied exactly: this is the batched form, one call for a
-- whole feed of cards rather than one round trip per card. Posts with no kids
-- selected are simply ABSENT from the result (not returned as a row), so the
-- payload stays proportional to actual attendance. DROP + CREATE, `stable`,
-- `security definer`, `set search_path = public, pg_temp`, granted to
-- `authenticated`, revoked from `public` and `anon` (the 0026/0027 posture:
-- signed-out visitors get nothing).
--
-- PRIVACY (decision #2, 2026-09-11): an AGGREGATE BAND is the only thing that
-- crosses — two integers derived with `min`/`max`, never a per-kid age and
-- never an identity. A single kid is indistinguishable from a dozen: the rows
-- themselves stay closed, and the per-kid ages/identities remain behind 0026's
-- GATED `get_kids_going` (host, people going, moderators only). This function
-- projects no kid id, no name, no avatar_url — nothing but the band.
--
-- DROP-IN CARD (decision #2): the card's per-kid ages stay OFF it. This band is
-- the card's second, aggregate half of the kids line (the V27 slice 4
-- `goingCountsLabel` reads it); the host and the people going are the only
-- callers who see per-kid detail, through the detail page's gated read.
--
-- Idempotent + re-paste-safe (the 2026-09-04 house lesson): DROP + CREATE.

drop function if exists public.kid_age_band_going_for(uuid[]);

create function public.kid_age_band_going_for(p_ids uuid[])
returns table (playdate_id uuid, min_age integer, max_age integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select pk.playdate_id,
         min(k.age)::integer as min_age,
         max(k.age)::integer as max_age
  from public.ping_kids pk
  join public.kids k on k.id = pk.kid_id
  where pk.playdate_id = any(p_ids)
    and k.age is not null
  group by pk.playdate_id;
$$;

grant execute on function public.kid_age_band_going_for(uuid[]) to authenticated;
revoke execute on function public.kid_age_band_going_for(uuid[]) from public;
revoke execute on function public.kid_age_band_going_for(uuid[]) from anon;

-- ===========================================================================
-- probe-0060-live.sql — the FUNCTIONAL proof of migration 0060, run against
-- the LIVE project inside an explicit transaction that is ALWAYS rolled back.
-- ===========================================================================
--
-- WHY THIS FILE EXISTS. Migration 0060's read-back proves the guard is present
-- and functional (it calls `is_e2e_profile` on a real fixture id and a real
-- account id). It CANNOT prove the thing that actually matters: that the TRIGGER
-- no longer writes a notification row when a fixture posts at a place a real
-- parent follows. Only a real insert can prove that. So this probe inserts
-- three playdates and one ping as real rows, measures what landed in
-- `notification_log`, and rolls everything back.
--
-- THE THREE MEASUREMENTS (the last SELECT is the evidence; the API returns the
-- rows of the last statement even when a `rollback` follows it):
--
--   fixture_notifies         a FIXTURE-hosted post at a followed place → 0
--                            (before 0060 this was 1 — the email the founder got
--                             21 times in two days)
--   control_notifies         a REAL-hosted post at the same followed place → 1
--                            (the guard must not switch real alerts off)
--   fixture_actor_notifies   a FIXTURE ping on a REAL post → 0
--                            (producer 1's guard: this is the 2026-09-24 email
--                             class, `e2e-… Marker is going` → a real post)
--
-- Zero persistence is proven by reading the tables again after the rollback
-- (the runbook in task-state.md records that read).
-- ===========================================================================
begin;

create temp table probe on commit drop as
select
  (select u.id from auth.users u where u.email = 'jonmeisburg@gmail.com') as real_id,
  (select u.id
     from auth.users u
    where u.email like 'e2e-%'
    order by u.created_at desc
    limit 1) as e2e_id,
  (select pl.id from public.places pl where pl.name = 'Green Lake Park') as place_id,
  null::uuid as fixture_post,
  null::uuid as control_post,
  null::uuid as real_post;

-- The real parent follows the place (already true live; idempotent here).
insert into public.follows (follower_profile_id, place_id)
select p.real_id, p.place_id
  from probe p
 where p.real_id is not null
   and p.place_id is not null
   and not exists (
     select 1 from public.follows f
      where f.follower_profile_id = p.real_id
        and f.place_id = p.place_id
   );

-- 1. THE FIXTURE POST — the exact shape that emailed the founder. `title`
--    carries the record marker too, so the row is identifiable as well as
--    suppressed. `series_id` is NULL, so the trigger's WHEN clause admits it.
with ins as (
  insert into public.playdates
    (host_profile_id, title, place, place_id, starts_at, ends_at)
  select p.e2e_id, 'e2e probe-0060 fixture post', 'Green Lake Park', p.place_id,
         now() + interval '3 days', now() + interval '3 days 1 hour'
    from probe p
   where p.e2e_id is not null and p.place_id is not null
  returning id
)
update probe set fixture_post = (select id from ins);

-- 2. THE CONTROL — a real host, the same followed place, the same instant. If
--    the guard were written as "suppress followers of this place" instead of
--    "suppress fixtures", this would come back 0 and the probe would fail.
with ins as (
  insert into public.playdates
    (host_profile_id, title, place, place_id, starts_at, ends_at)
  select p.real_id, 'probe-0060 control post (real host)', 'Green Lake Park',
         p.place_id, now() + interval '4 days', now() + interval '4 days 1 hour'
    from probe p
   where p.real_id is not null and p.place_id is not null
  returning id
)
update probe set control_post = (select id from ins);

-- 3. THE FIXTURE ACTOR on a real parent's post — producer 1's guard.
with ins as (
  insert into public.playdates
    (host_profile_id, title, place, place_id, starts_at, ends_at)
  select p.real_id, 'probe-0060 real post (fixture pinger)', 'Green Lake Park',
         p.place_id, now() + interval '5 days', now() + interval '5 days 1 hour'
    from probe p
   where p.real_id is not null and p.place_id is not null
  returning id
)
update probe set real_post = (select id from ins);

insert into public.going_pings (playdate_id, profile_id)
select p.real_post, p.e2e_id from probe p
 where p.real_post is not null and p.e2e_id is not null;

-- The evidence. `fixture_guard` and `real_guard` are the two directions the
-- predicate must get right; the three counts are the behaviour.
select
  p.fixture_post is not null as fixture_posted,
  p.control_post is not null as control_posted,
  p.real_post   is not null as real_post_pinged,
  (select count(*) from public.notification_log nl
    where nl.playdate_id = p.fixture_post) as fixture_notifies_expect_0,
  (select count(*) from public.notification_log nl
    where nl.playdate_id = p.control_post) as control_notifies_expect_1,
  (select count(*) from public.notification_log nl
    where nl.playdate_id = p.real_post
      and nl.kind = 'ping_received') as fixture_actor_notifies_expect_0,
  (select count(*) from public.notification_log nl
    where nl.playdate_id = p.control_post
      and nl.kind = 'followed_new_dropin') as control_kind_expect_followed_new_dropin,
  public.is_e2e_profile(p.e2e_id) as fixture_guard_expect_true,
  public.is_e2e_profile(p.real_id) as real_guard_expect_false
from probe p;

rollback;

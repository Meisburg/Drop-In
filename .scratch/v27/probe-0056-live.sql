-- V27 slice 1 — LIVE functional probe for migration 0056, ROLLED BACK.
-- Inserts a real message as a real playdate's host, asserts the producer wrote
-- one new_message row per other participant with the pinned copy/url, then
-- asserts the re-arm resets sent_at on a second message. Zero persistence.
begin;
do $$
declare
  v_pd uuid;
  v_host uuid;
  v_expected int;
  v_count int;
  v_title text;
  v_url text;
begin
  -- A playdate with at least one pinger who is not the host.
  select p.id, p.host_profile_id
    into v_pd, v_host
    from public.playdates p
   where exists (
     select 1 from public.going_pings gp
      where gp.playdate_id = p.id
        and gp.profile_id is distinct from p.host_profile_id
   )
   limit 1;

  if v_pd is null then
    raise exception 'v27 probe: no playdate with a non-host pinger (cannot exercise the producer)';
  end if;

  -- The expected recipient set: host UNION pingers, minus the sender (the host).
  select count(*) into v_expected
    from (
      select p.host_profile_id as profile_id from public.playdates p where p.id = v_pd
      union
      select gp.profile_id from public.going_pings gp where gp.playdate_id = v_pd
    ) s
   where s.profile_id is distinct from v_host;

  insert into public.messages (playdate_id, sender_id, body)
  values (v_pd, v_host, 'v27 live probe — rolled back');

  select count(*), max(title), max(url)
    into v_count, v_title, v_url
    from public.notification_log
   where playdate_id = v_pd and kind = 'new_message';

  if v_count <> v_expected then
    raise exception 'v27 probe: expected % new_message rows, got %', v_expected, v_count;
  end if;
  if v_title is distinct from (
    select p.display_name || ' messaged you'
      from public.profiles p where p.id = v_host
  ) then
    raise exception 'v27 probe: title is %', v_title;
  end if;
  if v_url is distinct from '/inbox?thread=' || v_pd::text then
    raise exception 'v27 probe: url is %', v_url;
  end if;

  -- RE-ARM: mark the rows sent, send a second message, assert sent_at reset.
  update public.notification_log
     set sent_at = now(), error = 'probe'
   where playdate_id = v_pd and kind = 'new_message';

  perform pg_sleep(0.02);

  insert into public.messages (playdate_id, sender_id, body)
  values (v_pd, v_host, 'v27 live probe 2 — rolled back');

  if exists (
    select 1 from public.notification_log
     where playdate_id = v_pd and kind = 'new_message' and sent_at is not null
  ) then
    raise exception 'v27 probe: re-arm did not reset sent_at';
  end if;

  select count(*) into v_count
    from public.notification_log
   where playdate_id = v_pd and kind = 'new_message';
  if v_count <> v_expected then
    raise exception 'v27 probe: re-arm changed the row count to % (expected %)', v_count, v_expected;
  end if;

  raise notice 'v27 live probe OK: playdate %, % recipient rows, title %, url %', v_pd, v_count, v_title, v_url;
end
$$;
rollback;

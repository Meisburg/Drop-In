-- ===========================================================================
-- V28 (migration 0060): THE FIXTURE GUARD, THE LOST PRODUCER, AND THE
-- CLOBBERED FORMATTER.
-- ===========================================================================
--
-- WHAT THIS FILE IS. Three repairs that turned out to be one incident, found
-- on 2026-09-30 by a human asking "why is the app emailing me?" — the answer
-- was a Playwright fixture, and behind the fixture was a migration that was
-- applied to production and never committed.
--
-- ---------------------------------------------------------------------------
-- (1) THE FIXTURE GUARD — the actual complaint.
-- ---------------------------------------------------------------------------
-- The founder's inbox carried 21 `followed_new_dropin` emails in two days, all
-- of the form `"e2e e2e-1790760927 Marker stale neighbourhood"`. The chain:
-- he follows the place `Green Lake Park`; three specs hardcode
-- `PLACE_NAME = 'Green Lake Park'` (e2e/post-location, e2e/places,
-- e2e/post-fast) and `playwright.config.ts` drives the LIVE project; every
-- fixture post at that place fanned out a real notification to a real parent.
--
-- THAT IS THE SAME FAILURE CLASS docs/agents/e2e-fixture-convention.md ALREADY
-- NAMES, one step further along. The convention guarantees a fixture is
-- *identifiable* (`email like 'e2e-%'`, title marker) so the sweep can remove
-- it. It says nothing about the fixture's SIDE EFFECTS — and a notification is
-- a side effect that cannot be swept: `notification_log` rows are deleted with
-- the account, but the EMAIL HAS ALREADY LEFT. The sweep cannot un-send.
--
-- So the rule has to be preventive, and it has to live where the side effect is
-- created: A FIXTURE ACCOUNT'S ACTION NEVER PRODUCES A NOTIFICATION. The marker
-- checked is the ACCOUNT marker, the convention's PRIMARY handle — the same
-- `like 'e2e-%'` the sweep's delete is scoped to (scripts/lib/sweep-e2e.mjs
-- ACCOUNT_MARKER), not the title marker, which is the straggler handle.
--
-- THE GUARD IS IN EVERY PRODUCER, NOT JUST THE ONE THAT FIRED. The founder's
-- log shows the class was already wider than one kind: `ping_received` on
-- 2026-09-24 ("e2e-1790228964 Marker is going" → a REAL post of his) and
-- `cancelled` on 2026-09-20 (a fixture post he had pinged). Fixing only
-- `followed_new_dropin` would leave the same email arriving through four other
-- doors on the next e2e run.
--
-- WHAT "THE ACTOR" IS, PER PRODUCER (the column that carries the marker):
--   notify_ping_received          new.profile_id          the pinger
--   notify_new_comment            new.author_profile_id   the commenter
--   notify_new_message            new.sender_id           the sender
--   notify_playdate_cancelled     v_row.host_profile_id   the post's host
--   notify_followed_new_dropin    new.host_profile_id     the post's host
-- A fixture action is DROPPED ENTIRELY — including fixture-to-fixture, which
-- was only ever noise for an account the sweep is about to delete.
--
-- FAIL OPEN, ALWAYS (the emailFallback rule, made the same way and for the same
-- reason). `public.is_e2e_profile` returns `false` when the read does not come
-- back — a NULL id, or an `insufficient_privilege` error. A guard that failed
-- CLOSED on an unreadable `auth.users` would silently switch off every parent's
-- alerts at once, which is far worse than the fixture email it exists to stop.
-- Unknown means SEND.
--
-- ---------------------------------------------------------------------------
-- (2) THE LOST PRODUCER — repo/production drift, repaired.
-- ---------------------------------------------------------------------------
-- `public.notify_followed_new_dropin`, its trigger, the `followed_new_dropin`
-- kind, `notification_payload`'s two new parameters, and its place-label/
-- start-time copy existed ONLY IN THE LIVE DATABASE. There is no migration for
-- them in any branch (`git log -S followed_new_dropin` → nothing; every other
-- public function is in the repo). The live function's own comments number
-- themselves "0052 pin e"/"pin h", and 0052 in the repo is the reviews
-- migration — so this was written in a workspace as 0052, applied live, and
-- lost when the V27 integration renumbered four colliding `0056_*` files.
-- THIS FILE IS THAT MIGRATION, RECOVERED VERBATIM FROM THE LIVE SCHEMA.
--
-- ---------------------------------------------------------------------------
-- (3) THE CLOBBERED FORMATTER — a real, live product defect.
-- ---------------------------------------------------------------------------
-- Because the lost migration was applied to production AFTER 0055 and 0056, its
-- `notification_payload` (written against the 0041 vintage) OVERWROTE both of
-- theirs. Live, `notification_payload` has no `review_due` branch and no
-- `new_message` branch, so both fell through to `else 'Drop In'` / `else ''`.
--
-- PROVEN, not inferred — every `new_message` row in production today renders
-- `title = 'Drop In'`, EMPTY body, and the drop-in url instead of the thread:
--
--   kind        | title   | body  | url
--   new_message | Drop In |       | /playdate/<id>          (should be
--                "<sender> messaged you" / "Tap to reply in \"<post>\"" /
--                /inbox?thread=<id>)
--
-- `review_due` is inert by luck, not by design: the sender builds those rows in
-- TypeScript (`reviewPromptRow`, supabase/functions/send-push/index.ts), so the
-- SQL branch is only reachable from a direct probe. `new_message` is NOT inert —
-- its only producer is the `notify_new_message` trigger, which calls this
-- function. Blast radius when this was found: 8 broken rows, all created by the
-- day's e2e run, ZERO real recipients.
--
-- SO THIS FILE RESTORES THE UNION: the 7-parameter signature (the lost
-- migration's, a strict superset — the 2 new parameters carry DEFAULTS, so every
-- existing 5-argument caller keeps working) carrying ALL EIGHT branches,
-- char-for-char from 0032/0041/0055/0056.
--
-- ⚠️ SUPERSEDES 0055 AND 0056. Both `drop function … ; create function …` this
-- same function with the OLD 5-parameter signature, so a future re-paste of
-- either one silently reverts the two new branches AND this file's read-back
-- would then fail loudly. Re-apply 0060 after any re-paste of 0055/0056.
--
-- Idempotent + re-paste-safe (the 2026-09-04 house lesson): the kind CHECK is
-- dropped by its discovered name and re-added only when absent; the functions
-- are DROP IF EXISTS + CREATE (the 0021/0025/0032/0041/0055/0056 structure);
-- the trigger is DROP IF EXISTS + CREATE; GRANT/REVOKE are re-runnable. The
-- read-back asserts the file's own effect and raises on any gap.
--
-- Depends on: 0001 (profiles), 0007 (going_pings), 0032 (notification_log),
-- 0041, 0042/0044 (messages), 0052 (reviews), 0055, 0056, 0033 (follows).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. The guard itself — ONE definition of "is this a fixture account", so the
--    five producers cannot drift apart. Reads `auth.users` (the marker's home),
--    which is why it is SECURITY DEFINER: the producers that call it are
--    definer functions owned by the schema owner, and this keeps the privilege
--    question in one place instead of five.
--
--    EXECUTE is revoked from public/anon/authenticated below: this is an
--    internal predicate, not a surface. An anon caller asking "is this uuid a
--    test account" is an enumeration primitive, and there is no screen that
--    needs it.
-- ---------------------------------------------------------------------------
drop function if exists public.is_e2e_profile(uuid);

create function public.is_e2e_profile(p_profile_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_e2e boolean;
begin
  -- A NULL id is never a fixture. The producers read their actor column from a
  -- trigger row, and an absent actor must not suppress a notification.
  if p_profile_id is null then
    return false;
  end if;

  begin
    select (u.email like 'e2e-%')
      into v_is_e2e
      from auth.users u
      where u.id = p_profile_id;
  exception
    when insufficient_privilege then
      -- FAIL OPEN (header). An unreadable `auth.users` means "unknown", and
      -- unknown must SEND — the identical ruling `emailFallback` makes for an
      -- unreadable `email_optout`, for the identical reason: a guard that fails
      -- closed on a read error turns off every parent's alerts at once.
      return false;
  end;

  -- No row (a profile with no auth user) is not a fixture either.
  return coalesce(v_is_e2e, false);
end;
$$;

revoke execute on function public.is_e2e_profile(uuid) from public;
revoke execute on function public.is_e2e_profile(uuid) from anon;
revoke execute on function public.is_e2e_profile(uuid) from authenticated;

-- ---------------------------------------------------------------------------
-- 2. The `followed_new_dropin` kind joins the CHECK (idempotent: drop the
--    discovered constraint, then add only when none survives).
-- ---------------------------------------------------------------------------
do $$
declare
  v_conname text;
begin
  select c.conname into v_conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid
                         and a.attnum = any (c.conkey)
   where c.conrelid = 'public.notification_log'::regclass
     and c.contype = 'c'
     and a.attname = 'kind'
   limit 1;
  if v_conname is not null then
    execute format(
      'alter table public.notification_log drop constraint %I', v_conname
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid
                           and a.attnum = any (c.conkey)
     where c.conrelid = 'public.notification_log'::regclass
       and c.contype = 'c'
       and a.attname = 'kind'
  ) then
    alter table public.notification_log
      add constraint "notification_log_kind_check"
      check (kind in ('ping_received', 'starting_soon', 'cancelled',
                      'new_comment', 'ended', 'review_due', 'new_message',
                      'followed_new_dropin'));
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. The formatter, restored as the FULL union (header (3)).
--
--    Signature: the lost migration's 7-parameter form. `p_place_label` and
--    `p_starts_at` DEFAULT to NULL, so the 5-argument calls in
--    0032/0041/0055/0056 — and every producer — resolve to this one function.
--    The OLD 5-parameter function (if a re-paste of 0056 recreated it) is
--    dropped first, so exactly ONE `notification_payload` can exist.
--
--    Flags are pinned to what 0032 established and every successor kept:
--    STABLE (it reads nothing but its arguments) and NOT SECURITY DEFINER (it
--    touches no table, so it needs no privilege). The url rule carries THREE
--    branches: `review_due` opens the PLACE (0055) and `new_message` opens the
--    THREAD (0056); every other kind keeps the drop-in link char-for-char.
-- ---------------------------------------------------------------------------
drop function if exists public.notification_payload(text, uuid, text, text, int);
drop function if exists public.notification_payload(text, uuid, text, text, int, text, timestamptz);

create function public.notification_payload(
  p_kind text,
  p_playdate_id uuid,
  p_post_title text,
  p_actor_name text,
  p_going_count int,
  p_place_label text default null,
  p_starts_at timestamptz default null
)
returns table (title text, body text, url text)
language sql
stable
set search_path = public, pg_temp
as $$
  with t as (
    select
      -- A post whose title is unreadable (a pre-0005 row, or a title that was
      -- cleared) falls back to "your drop-in" rather than rendering `"null"`
      -- or an empty pair of quotes — the same fallback the feed's while-away
      -- copy uses (src/lib/feed.ts, quotedTitle).
      coalesce(nullif(btrim(p_post_title), ''), 'your drop-in') as subject,
      coalesce(nullif(btrim(p_actor_name), ''), 'A parent') as actor,
      greatest(coalesce(p_going_count, 0), 0) as going,
      -- The post's own TEXT place, trimmed; NULL when blank. A place label
      -- that survives btrim wins over the actor form below.
      nullif(btrim(p_place_label), '') as place_label,
      '/playdate/' || p_playdate_id::text as link
  )
  select
    case p_kind
      when 'ping_received' then t.actor || ' is going'
      when 'new_comment' then t.actor || ' commented'
      when 'cancelled' then 'Cancelled: "' || t.subject || '"'
      -- 0041: honest history — an early end is labelled "Ended", not
      -- "Cancelled".
      when 'ended' then 'Ended: "' || t.subject || '"'
      when 'starting_soon' then 'Starting soon: "' || t.subject || '"'
      -- 0055: char-for-char the TS title in buildNotificationPayload's
      -- `review_due` branch (supabase/functions/_shared/pushCopy.ts).
      when 'review_due' then 'How was "' || t.subject || '"?'
      -- 0056: the sender, not the message (that slice's privacy pin).
      when 'new_message' then t.actor || ' messaged you'
      -- The recovered producer's branch: the place the drop-in is at, or the
      -- host's name when the post carries no readable place.
      when 'followed_new_dropin' then
        case
          when t.place_label is null then 'New drop-in from ' || t.actor
          else 'New drop-in at ' || t.place_label
        end
      else 'Drop In'
    end as title,
    case p_kind
      when 'ping_received' then 'to "' || t.subject || '"'
      when 'new_comment' then 'on "' || t.subject || '"'
      -- The "don't drive to an empty park" sentence (0032 pin e).
      when 'cancelled' then 'The host called it off — don''t head out.'
      -- 0041: the same sentence class for the early-end case (pin d).
      when 'ended' then 'The host ended it — don''t head out.'
      when 'starting_soon' then
        'Starts within the hour · '
        || case
              -- The zero branch (0032's amendment note): a NULL/0 count says
              -- who is actually coming rather than printing "0 families are
              -- going" at a parent who IS going.
              when t.going <= 0 then 'you''re the only one going so far'
              when t.going = 1 then '1 family is going'
              else t.going::text || ' families are going'
            end
      -- 0055: NOT "you went" (that header's honesty pin). `going_pings` has no
      -- status column and no check-in exists, so a ping is a stated intention
      -- and this sentence stays true for a no-show too.
      when 'review_due' then 'You said you were going — rate the place.'
      -- 0056: the thread to open. NO message content — the subject is the
      -- post's title, never the message body.
      when 'new_message' then 'Tap to reply in "' || t.subject || '"'
      -- The recovered producer: the subject, plus the when-label when the post
      -- has a start.
      --
      -- 'FM' applies pattern-wise, so it is placed PER FIELD: FM on 'Dy' kills
      -- the day name's trailing padding, FM on 'HH12' kills the hour's leading
      -- zero, and 'MI' deliberately keeps NO FM so the minutes stay two digits
      -- — 'FMMI' would strip the minute leading zero and render 9:05 as
      -- '9:5am', which the TS twin (minute: '2-digit') never does. The zone is
      -- the app's (America/Los_Angeles), so the label does not move with the
      -- reader's device.
      when 'followed_new_dropin' then
        '"' || t.subject || '"'
        || case
              when p_starts_at is null then ''
              else ' · ' || to_char(
                p_starts_at at time zone 'America/Los_Angeles',
                'FMDy FMHH12:MIam'
              )
            end
      else ''
    end as body,
    -- 0055: the review prompt opens the PLACE, not the drop-in. NULL IN, NULL
    -- OUT — a caller MUST gate on `place_id is not null`: there is no SQL
    -- fallback, and `notification_log.url` is `text not null`, so a NULL here
    -- is a failed insert rather than a bad link. The TS twin falls back to the
    -- drop-in route; this branch cannot, by design.
    --
    -- 0056: a message opens the THREAD — the parent's job is to reply.
    --
    -- NO ENCODING QUESTION in either branch, unlike the TS twins: both
    -- arguments are TYPED `uuid`, so they can never contain `/` or any
    -- character that `encodeURIComponent` would alter.
    case p_kind
      when 'review_due' then '/place/' || p_playdate_id::text || '/details'
      when 'new_message' then '/inbox?thread=' || p_playdate_id::text
      else t.link
    end as url
  from t;
$$;

-- The EXECUTE posture is 0032's: the formatter is the SENDER's formatter, and
-- the schema owner (the headless `scripts/db-sql.sh` path this file's read-back
-- probes through) always holds EXECUTE.
revoke execute on function public.notification_payload(text, uuid, text, text, int, text, timestamptz) from public;
revoke execute on function public.notification_payload(text, uuid, text, text, int, text, timestamptz) from anon;
revoke execute on function public.notification_payload(text, uuid, text, text, int, text, timestamptz) from authenticated;
grant execute on function public.notification_payload(text, uuid, text, text, int, text, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 4. The five producers, each with ONE new guard clause and nothing else
--    changed char-for-char. The guard goes AFTER the "no readable post" early
--    return (so the existing discipline order is untouched) and BEFORE the
--    insert (so no row is ever written for a fixture).
--
--    `notify_playdate_cancelled` returns `coalesce(new, old)`: it is also the
--    BEFORE DELETE trigger, and a NULL return there would CANCEL THE DELETE
--    instead of skipping a notification.
-- ---------------------------------------------------------------------------

-- Producer 1: a ping lands on your post → the post's host.
create or replace function public.notify_ping_received()
returns trigger
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_host uuid;
  v_post_title text;
  v_actor_name text;
  v_title text;
  v_body text;
  v_url text;
begin
  select p.host_profile_id, p.title
    into v_host, v_post_title
    from public.playdates p
    where p.id = new.playdate_id;

  -- No readable post (deleted in the same transaction): nothing to tell
  -- anyone, and never an exception — a producer must not break the write it
  -- is riding on.
  if v_host is null then
    return new;
  end if;

  -- FIXTURE GUARD (0060): a Playwright fixture's ping never notifies anyone.
  -- The acting column here is the PINGER.
  if public.is_e2e_profile(new.profile_id) then
    return new;
  end if;

  -- Pin g: null actor → true → pass through.
  if v_host is distinct from auth.uid() then
    select pr.display_name into v_actor_name
      from public.profiles pr
      where pr.id = new.profile_id;

    select pl.title, pl.body, pl.url
      into v_title, v_body, v_url
      from public.notification_payload(
        'ping_received', new.playdate_id, v_post_title, v_actor_name, null
      ) as pl;

    insert into public.notification_log (profile_id, kind, playdate_id, title, body, url)
    values (v_host, 'ping_received', new.playdate_id, v_title, v_body, v_url)
    on conflict (profile_id, kind, playdate_id) do nothing;
  end if;

  return new;
end;
$$;

-- Producer 2: a comment/reply on your post → the post's host, plus the parent
-- comment's author when the new comment is a reply.
create or replace function public.notify_new_comment()
returns trigger
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_host uuid;
  v_post_title text;
  v_parent_author uuid;
  v_actor_name text;
begin
  select p.host_profile_id, p.title
    into v_host, v_post_title
    from public.playdates p
    where p.id = new.playdate_id;

  if v_host is null then
    return new;
  end if;

  -- FIXTURE GUARD (0060): the acting column is the COMMENT's author.
  if public.is_e2e_profile(new.author_profile_id) then
    return new;
  end if;

  if new.parent_id is not null then
    select c.author_profile_id into v_parent_author
      from public.comments c
      where c.id = new.parent_id;
  end if;

  select pr.display_name into v_actor_name
    from public.profiles pr
    where pr.id = new.author_profile_id;

  insert into public.notification_log (profile_id, kind, playdate_id, title, body, url)
  select r.profile_id, 'new_comment', new.playdate_id, pl.title, pl.body, pl.url
  from (
    select v_host as profile_id
    union all
    select v_parent_author
  ) as r,
  public.notification_payload(
    'new_comment', new.playdate_id, v_post_title, v_actor_name, null
  ) as pl
  -- `is distinct from` is null-safe on both sides (pin g): with no actor every
  -- recipient is notified, and a NULL recipient row is dropped.
  where r.profile_id is not null
    and r.profile_id is distinct from auth.uid()
  on conflict (profile_id, kind, playdate_id) do nothing;

  return new;
end;
$$;

-- Producer 3: a post you pinged is cancelled, ended or deleted → everyone who
-- pinged it (the "don't drive to an empty park" notice). ONE function, THREE
-- triggers, switching on TG_OP.
create or replace function public.notify_playdate_cancelled()
returns trigger
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.playdates;
  v_kind text;
begin
  if tg_op = 'DELETE' then
    v_row := old;
    -- The post is GONE: the "called it off" copy holds (0032 pin e).
    v_kind := 'cancelled';
  else
    -- 0041: 'ended' joins 'cancelled' as a notifying status (pin c). Any
    -- other flip (an 'ended' → 'on' revert) still fires the trigger — the
    -- WHEN clause is unchanged — and writes nothing.
    if new.status not in ('cancelled', 'ended') then
      return new;
    end if;
    v_row := new;
    v_kind := new.status;
  end if;

  -- FIXTURE GUARD (0060): the acting column is the POST'S HOST — the fixture
  -- host cancelled it, so nobody who pinged it is told. The return value is
  -- `coalesce(new, old)`: on DELETE a non-NULL row MUST come back or Postgres
  -- CANCELS THE DELETE, which would silently make the post undeletable.
  if public.is_e2e_profile(v_row.host_profile_id) then
    return coalesce(new, old);
  end if;

  insert into public.notification_log (profile_id, kind, playdate_id, title, body, url)
  select gp.profile_id, v_kind, v_row.id, pl.title, pl.body, pl.url
  from public.going_pings gp,
  public.notification_payload(
    v_kind, v_row.id, v_row.title, null, null
  ) as pl
  where gp.playdate_id = v_row.id
    and gp.profile_id is distinct from auth.uid()
  on conflict (profile_id, kind, playdate_id) do nothing;

  return coalesce(new, old);
end;
$$;

-- Producer 4: a message in a drop-in thread → the host and everyone who
-- pinged, minus the sender.
create or replace function public.notify_new_message()
returns trigger
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_host uuid;
  v_post_title text;
  v_actor_name text;
begin
  -- Free-form DMs are OUT OF SCOPE for this producer (0056's header). A DM has
  -- no playdate thread to point at, so there is nothing to write.
  if new.playdate_id is null then
    return new;
  end if;

  select p.host_profile_id, p.title
    into v_host, v_post_title
    from public.playdates p
    where p.id = new.playdate_id;

  if v_host is null then
    return new;
  end if;

  -- FIXTURE GUARD (0060): the acting column is the message SENDER.
  if public.is_e2e_profile(new.sender_id) then
    return new;
  end if;

  select pr.display_name into v_actor_name
    from public.profiles pr
    where pr.id = new.sender_id;

  insert into public.notification_log (profile_id, kind, playdate_id, title, body, url)
  select r.profile_id, 'new_message', new.playdate_id, pl.title, pl.body, pl.url
  from (
    -- The host, plus everyone who pinged — deduplicated.
    select v_host as profile_id
    union
    select gp.profile_id
      from public.going_pings gp
      where gp.playdate_id = new.playdate_id
  ) as r,
  public.notification_payload(
    'new_message', new.playdate_id, v_post_title, v_actor_name, null
  ) as pl
  -- Never the sender (the actor is ON the row), and never a NULL recipient.
  where r.profile_id is not null
    and r.profile_id is distinct from new.sender_id
  -- THE RE-ARM (0056's header): a repeat message resets the same row to "owed"
  -- so the next message buzzes again. ONE pending notification per
  -- conversation, deliberately — not a history.
  on conflict (profile_id, kind, playdate_id) do update
    set title = excluded.title,
        body = excluded.body,
        url = excluded.url,
        created_at = now(),
        sent_at = null,
        error = null;

  return new;
end;
$$;

-- Producer 5: a new drop-in at a place you follow (or by a parent you follow)
-- → every follower. RECOVERED from production (header (2)); the ONLY change is
-- the guard clause.
create or replace function public.notify_followed_new_dropin()
returns trigger
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_place_label text;
begin
  -- FIXTURE GUARD (0060) — THE DEFECT THIS FILE EXISTS FOR. Every fixture post
  -- at a place a real parent follows used to email that parent; 21 arrived in
  -- the founder's inbox in two days. The acting column is the POST'S HOST.
  if public.is_e2e_profile(new.host_profile_id) then
    return new;
  end if;

  -- `place` is NOT NULL (0029/0030 posture), so the only no-place case is
  -- empty/whitespace text.
  v_place_label := nullif(btrim(new.place), '');

  -- Defensive: an unresolvable host must never break the INSERT this rides on
  -- (the 0032 discipline — the insert below resolves the actor name with an
  -- honest fallback, so no separate lookup is needed).
  insert into public.notification_log (profile_id, kind, playdate_id, title, body, url)
  select f.follower_profile_id, 'followed_new_dropin', new.id, pl.title, pl.body, pl.url
  from (
    -- Pin a: the SAME parent can match both arms (a family follow AND a place
    -- follow); `union all` is the honest fan-out and the ON CONFLICT wall at
    -- the end of this statement is what makes it ONE row.
    select f.follower_profile_id
    from public.follows f
    where f.followee_profile_id = new.host_profile_id
    union all
    select f2.follower_profile_id
    from public.follows f2
    where f2.place_id = new.place_id
  ) f
  cross join lateral (
    -- Pin d: a scalar subquery, NOT a row-shaped lateral — a lateral with zero
    -- matches (an unreadable/absent profile) would drop the WHOLE cross join
    -- row, erasing the fan-out instead of falling back. A scalar subselect
    -- always yields exactly one row: the name, or the 'A parent' fallback.
    select coalesce(
      (select nullif(btrim(h.display_name), '')
         from public.profiles h
        where h.id = new.host_profile_id),
      'A parent'
    ) as actor
  ) a
  cross join public.notification_payload(
    'followed_new_dropin', new.id, new.title, a.actor, null, v_place_label, new.starts_at
  ) as pl
  where f.follower_profile_id is not null
    and f.follower_profile_id is distinct from auth.uid()
  on conflict (profile_id, kind, playdate_id) do nothing;

  return new;
end;
$$;

-- Trigger functions are not reachable through PostgREST (they return
-- `trigger`), so this is defense in depth rather than a boundary — but the
-- revoke costs nothing and keeps the "one caller shape per function" posture.
revoke execute on function public.notify_ping_received() from public;
revoke execute on function public.notify_ping_received() from anon;
revoke execute on function public.notify_new_comment() from public;
revoke execute on function public.notify_new_comment() from anon;
revoke execute on function public.notify_playdate_cancelled() from public;
revoke execute on function public.notify_playdate_cancelled() from anon;
revoke execute on function public.notify_new_message() from public;
revoke execute on function public.notify_new_message() from anon;
revoke execute on function public.notify_followed_new_dropin() from public;
revoke execute on function public.notify_followed_new_dropin() from anon;

-- ---------------------------------------------------------------------------
-- 5. The recovered trigger. `WHEN (new.series_id is null)` is the lost
--    migration's own clause, kept verbatim: a SERIES materializes its
--    occurrences as child rows, and notifying once per generated occurrence
--    would buzz a follower N times for one thing a host scheduled once. The
--    trigger fires AFTER INSERT for the parent post only.
-- ---------------------------------------------------------------------------
drop trigger if exists notification_followed_new_dropin on public.playdates;

create trigger notification_followed_new_dropin
  after insert
  on public.playdates
  for each row
  when (new.series_id is null)
  execute function public.notify_followed_new_dropin();

-- ---------------------------------------------------------------------------
-- 6. Read-back — the migration asserts its own effect rather than assuming it.
-- ---------------------------------------------------------------------------
-- The house lesson (V18): a 2xx write touching zero rows exits 0 with a
-- reassuring log. These are READ-ONLY probes. They RAISE, never print:
--   (1) exactly one CHECK on `kind`, admitting all EIGHT kinds;
--   (2) `notification_payload` is the 7-parameter union — STABLE, NOT security
--       definer, and the 5-parameter signature is GONE (a surviving twin is
--       the failure that looks like success: a 5-arg call would resolve to it
--       and silently lose the two new branches);
--   (3) it actually RENDERS the pinned copy for all eight kinds, including the
--       two branches the lost migration had clobbered;
--   (4) the guard is FUNCTIONAL, not merely present: a real `e2e-%` account is
--       recognised and a real account is not;
--   (5) all five producers call it, and the trigger exists with the pinned
--       WHEN clause.
do $$
declare
  missing text[] := array[]::text[];
  v_def text;
  v_count int;
  v_src text;
  v_title text;
  v_body text;
  v_url text;
  v_volatile text;
  v_prosecdef boolean;
  v_e2e uuid;
  v_real uuid;
  v_pd uuid := gen_random_uuid();
  v_kind text;
  v_fn text;
begin
  -- (1) Exactly one CHECK on `kind`, and it admits all eight kinds.
  select count(*) into v_count
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid
                         and a.attnum = any (c.conkey)
   where c.conrelid = 'public.notification_log'::regclass
     and c.contype = 'c'
     and a.attname = 'kind';

  if v_count <> 1 then
    missing := array_append(
      missing, format('expected exactly 1 CHECK on kind, found %s', v_count)
    );
  end if;

  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid
                         and a.attnum = any (c.conkey)
   where c.conrelid = 'public.notification_log'::regclass
     and c.contype = 'c'
     and a.attname = 'kind'
   limit 1;

  foreach v_kind in array array['ping_received', 'starting_soon', 'cancelled',
                                'new_comment', 'ended', 'review_due',
                                'new_message', 'followed_new_dropin'] loop
    if v_def is null or position(v_kind in v_def) = 0 then
      missing := array_append(
        missing, format('kind CHECK does not admit %s', v_kind)
      );
    end if;
  end loop;

  -- (2a) The 5-parameter function must be GONE.
  if to_regprocedure(
       'public.notification_payload(text, uuid, text, text, int)'
     ) is not null then
    missing := array_append(
      missing,
      'the OLD 5-argument notification_payload survived — a 5-argument call would resolve to it and lose review_due/new_message'
    );
  end if;

  -- (2b) The 7-parameter union exists, STABLE, not definer.
  select p.provolatile::text, p.prosecdef
    into v_volatile, v_prosecdef
    from pg_proc p
   where p.oid = to_regprocedure(
           'public.notification_payload(text, uuid, text, text, int, text, timestamptz)'
         );

  if v_volatile is null then
    missing := array_append(
      missing,
      'function public.notification_payload(text, uuid, text, text, int, text, timestamptz)'
    );
  else
    if v_volatile <> 's' then
      missing := array_append(missing, 'notification_payload is no longer STABLE');
    end if;
    if v_prosecdef is distinct from false then
      missing := array_append(
        missing,
        format('notification_payload prosecdef changed to %s', v_prosecdef)
      );
    end if;
  end if;

  -- (3) Every branch RENDERS its pinned copy. Only run when (2b) found the
  -- function, so a failure message stays honest.
  if v_volatile is not null then
    select pl.title, pl.body, pl.url
      into v_title, v_body, v_url
      from public.notification_payload(
             'followed_new_dropin', v_pd, 'Drop-in at Green Lake Park', 'Jordan',
             null, 'Green Lake Park', '2026-09-30T10:00:00Z'
           ) pl;
    if v_title is distinct from 'New drop-in at Green Lake Park' then
      missing := array_append(
        missing, format('followed_new_dropin title is %L', v_title)
      );
    end if;
    if v_body is distinct from '"Drop-in at Green Lake Park" · Wed 3:00am' then
      missing := array_append(
        missing, format('followed_new_dropin body is %L', v_body)
      );
    end if;
    if v_url is distinct from '/playdate/' || v_pd::text then
      missing := array_append(
        missing, format('followed_new_dropin url is %L', v_url)
      );
    end if;

    -- No place label, no start → the actor form and a bare subject. This is
    -- the branch that keeps a place-less post from rendering "at ".
    select pl.title, pl.body
      into v_title, v_body
      from public.notification_payload(
             'followed_new_dropin', v_pd, 'Drop-in', 'Jordan', null, '   ', null
           ) pl;
    if v_title is distinct from 'New drop-in from Jordan' then
      missing := array_append(
        missing, format('followed_new_dropin (no place) title is %L', v_title)
      );
    end if;
    if v_body is distinct from '"Drop-in"' then
      missing := array_append(
        missing, format('followed_new_dropin (no place) body is %L', v_body)
      );
    end if;

    -- The two branches the lost migration CLOBBERED (header (3)).
    select pl.title, pl.body, pl.url
      into v_title, v_body, v_url
      from public.notification_payload(
             'review_due', v_pd, 'Green Lake', null, null
           ) pl;
    if v_title is distinct from 'How was "Green Lake"?' then
      missing := array_append(missing, format('review_due title is %L', v_title));
    end if;
    if v_body is distinct from 'You said you were going — rate the place.' then
      missing := array_append(missing, format('review_due body is %L', v_body));
    end if;
    if v_url is distinct from '/place/' || v_pd::text || '/details' then
      missing := array_append(missing, format('review_due url is %L', v_url));
    end if;

    select pl.title, pl.body, pl.url
      into v_title, v_body, v_url
      from public.notification_payload(
             'new_message', v_pd, 'Green Lake', 'Jordan', null
           ) pl;
    if v_title is distinct from 'Jordan messaged you' then
      missing := array_append(missing, format('new_message title is %L', v_title));
    end if;
    if v_body is distinct from 'Tap to reply in "Green Lake"' then
      missing := array_append(missing, format('new_message body is %L', v_body));
    end if;
    if v_url is distinct from '/inbox?thread=' || v_pd::text then
      missing := array_append(missing, format('new_message url is %L', v_url));
    end if;

    -- The four kinds that were never in doubt, so a restore that broke them
    -- fails here instead of in a parent's inbox.
    select pl.title, pl.body, pl.url
      into v_title, v_body, v_url
      from public.notification_payload(
             'ping_received', v_pd, 'Green Lake', 'Jordan', null
           ) pl;
    if v_title is distinct from 'Jordan is going'
       or v_body is distinct from 'to "Green Lake"'
       or v_url is distinct from '/playdate/' || v_pd::text then
      missing := array_append(
        missing, format('ping_received is %L / %L / %L', v_title, v_body, v_url)
      );
    end if;

    select pl.title, pl.body
      into v_title, v_body
      from public.notification_payload(
             'starting_soon', v_pd, 'Green Lake', null, 0
           ) pl;
    if v_body is distinct from
       'Starts within the hour · you''re the only one going so far' then
      missing := array_append(
        missing, format('starting_soon zero branch is %L', v_body)
      );
    end if;

    select pl.title, pl.body
      into v_title, v_body
      from public.notification_payload(
             'ended', v_pd, 'Green Lake', null, null
           ) pl;
    if v_title is distinct from 'Ended: "Green Lake"'
       or v_body is distinct from 'The host ended it — don''t head out.' then
      missing := array_append(missing, format('ended is %L / %L', v_title, v_body));
    end if;

    select pl.title, pl.body
      into v_title, v_body
      from public.notification_payload(
             'cancelled', v_pd, 'Green Lake', null, null
           ) pl;
    if v_title is distinct from 'Cancelled: "Green Lake"'
       or v_body is distinct from 'The host called it off — don''t head out.' then
      missing := array_append(
        missing, format('cancelled is %L / %L', v_title, v_body)
      );
    end if;

    select pl.title, pl.body
      into v_title, v_body
      from public.notification_payload(
             'new_comment', v_pd, 'Green Lake', 'Jordan', null
           ) pl;
    if v_title is distinct from 'Jordan commented'
       or v_body is distinct from 'on "Green Lake"' then
      missing := array_append(
        missing, format('new_comment is %L / %L', v_title, v_body)
      );
    end if;
  end if;

  -- (4) The guard is FUNCTIONAL. A real `e2e-%` account must be recognised and
  -- a real account must not be — the two directions that matter, both probed
  -- against live data rather than asserted in prose.
  if to_regprocedure('public.is_e2e_profile(uuid)') is null then
    missing := array_append(missing, 'function public.is_e2e_profile(uuid)');
  else
    select u.id into v_e2e from auth.users u where u.email like 'e2e-%' limit 1;
    select u.id into v_real
      from auth.users u
     where u.email not like 'e2e-%'
     limit 1;

    if v_e2e is not null and public.is_e2e_profile(v_e2e) is not true then
      missing := array_append(
        missing,
        'the fixture guard does NOT recognise an e2e-% account — fixtures would notify real parents again'
      );
    end if;
    if v_real is not null and public.is_e2e_profile(v_real) is not false then
      missing := array_append(
        missing,
        'the fixture guard flags a REAL account — it would switch off real notifications'
      );
    end if;
    -- A NULL id is never a fixture (fail open).
    if public.is_e2e_profile(null) is not false then
      missing := array_append(missing, 'the fixture guard rejects a NULL profile id');
    end if;
  end if;

  -- (5) Every producer calls the guard, and the recovered trigger is wired with
  -- the pinned WHEN clause. A textual check on `prosrc` is deliberate: it is a
  -- DRIFT TRIPWIRE that fails the moment a future redefinition drops the
  -- clause, and the behavioural proof is the rolled-back probe
  -- (.scratch/v28/probe-0060-live.sql), which no read-back can replace.
  foreach v_fn in array array['notify_ping_received', 'notify_new_comment',
                              'notify_playdate_cancelled', 'notify_new_message',
                              'notify_followed_new_dropin'] loop
    select p.prosrc into v_src
      from pg_proc p
     where p.oid = to_regprocedure('public.' || v_fn || '()');
    if v_src is null then
      missing := array_append(missing, format('producer public.%s()', v_fn));
    elsif position('is_e2e_profile' in v_src) = 0 then
      missing := array_append(
        missing,
        format('%s has no fixture guard — a fixture can still notify through it', v_fn)
      );
    end if;
  end loop;

  select count(*) into v_count
    from pg_trigger t
   where t.tgrelid = 'public.playdates'::regclass
     and t.tgname = 'notification_followed_new_dropin'
     and not t.tgisinternal;
  if v_count <> 1 then
    missing := array_append(
      missing, 'trigger notification_followed_new_dropin on public.playdates'
    );
  end if;

  if array_length(missing, 1) is not null then
    raise exception '0060 read-back FAILED — %', array_to_string(missing, '; ');
  end if;

  raise notice '0060 read-back OK — CHECK admits 8 kinds; notification_payload is the 7-parameter union (stable, definer = %); followed_new_dropin/review_due/new_message all render; the fixture guard is live in 5 producers.', v_prosecdef;
end
$$;

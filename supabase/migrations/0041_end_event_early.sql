-- ===========================================================================
-- V12 ticket 03 (migration 0041): END AN EVENT EARLY — the `ended` status
-- (founder decision 2026-09-17, option A: honest history).
-- ===========================================================================
--
-- What this does: when a host ends an event early (it wrapped, it rained,
-- it just stopped), the post is not "cancelled"; it ENDED. Consequences
-- pinned by the ticket (.scratch/v12/issues/03-end-event-early.md):
--   1. The host status panel gains the third option (today: on/cancelled).
--   2. The feed drops `ended` posts immediately (the client-side change;
--      this migration only makes the value legal in the DB).
--   3. History keeps them: the owner's "Your posts → Past" (and the
--      archive) show them labelled "ended", distinct from "cancelled".
--
-- This migration widens the two DB-side value gates (playdates.status's
-- CHECK, notification_log.kind's CHECK) and generalizes 0032's
-- cancellation producer so an `ended` transition notifies the pingers.
--
-- Pinned decisions:
--
-- (a) ASSUMES 0019 IS APPLIED FIRST (the live project is past 0019 — the
--     last applied migration is 0040): this migration only widens the
--     live 2-value CHECK at 0019_status_trim.sql:46-56; it adds no column.
--     NO ROW CONVERSION — existing rows are 'on' / 'cancelled' (0019:32
--     already converted the legacy 'rained_out' rows to 'on'), so the
--     widened constraint validates all of them on the add.
--
-- (b) PROBE — the host-write path ADMITS THE NEW VALUE (ticket 03, probe a):
--     `playdates_update_host` (0005:78-82; carried forward by 0016:13-18)
--     is a GENERIC host-write policy — `using (host_profile_id = auth.uid())
--     with check (host_profile_id = auth.uid())`. It restricts WHO (the
--     host) but never WHICH columns or values, so `status = 'ended'` rides
--     the existing host-update path unchanged; the only value gate is
--     `playdates_status_chk`, which section 1 widens. NO RLS CHANGE.
--
-- (c) PROBE — the 0032 producer on an on→ended transition (ticket 03,
--     probe b): `notify_playdate_cancelled()` (0032:416) FIRES on any
--     status change (the trigger's WHEN clause, 0032:458: `old.status is
--     distinct from new.status`) but its guard `new.status <> 'cancelled'`
--     (0032:429) makes an on→ended update a NO-OP — pingers get no notice
--     for exactly the "don't head out" case that matters most (the event
--     is ending early, before anyone drives to it).
--
--     DECISION (the ticket's default, pinned here): an `ended` transition
--     NOTIFIES, with a NEW kind 'ended' — honest history, distinct copy
--     ("The host ended it"), not folded into 'cancelled'. Section 3
--     generalizes the one function: a status UPDATE picks the kind from
--     the NEW status ('cancelled' → 'cancelled', 'ended' → 'ended'); a
--     DELETE still writes kind 'cancelled' (the post is gone — the
--     "called it off" copy holds). The UPDATE guard narrows to
--     `new.status in ('cancelled', 'ended')`; every other flip (an
--     'ended' → 'on' revert, the 0016-era on→other) still fires the
--     trigger (the WHEN clause is UNCHANGED) but writes nothing. The
--     BEFORE DELETE trigger (0032:463-467) and 0032's revokes (:473-478)
--     are unaffected; the 0032 revokes persist through create-or-replace
--     and are re-issued below so this file is self-contained.
--
-- (d) `notification_payload` (0032:216) gains an `ended` branch — title
--     'Ended: "<subject>"', body 'The host ended it — don't head out.'
--     (the same "don't drive to an empty park" sentence class as the
--     'cancelled' body, 0032 pin e). The TS twin (buildNotificationPayload
--     in supabase/functions/_shared/pushCopy.ts) carries the same branch,
--     char-for-char; both are pinned by src/lib/push.test.ts.
--
-- (e) notification_log.kind's CHECK (0032:155, declared INLINE so Postgres
--     auto-names it `notification_log_kind_check`) widens from four kinds
--     to five: 'ping_received', 'starting_soon', 'cancelled',
--     'new_comment', 'ended'. The dedupe key (0032 pin a:
--     unique (profile_id, kind, playdate_id)) is UNCHANGED — an
--     (parent, 'ended', post) row is distinct from an (parent,
--     'cancelled', post) row. ACCEPTED RESIDUAL: a post that is ended and
--     then DELETED owes one row of each kind (two distinct notifications);
--     the window is narrow (a host who ends early does not usually also
--     delete the same evening) and the wall's job is "never the SAME
--     notification twice", which still holds per kind.
--
-- (f) THE CATCH-UP SCAN IS ALREADY SAFE: send-push's starting_soon scan
--     (supabase/functions/send-push/index.ts:140) filters
--     `.eq('playdate.status', 'on')`, so an `ended` post no longer owes a
--     "Starting soon" push once it ends — the scan needs no change.
--
-- Idempotent + re-paste-safe (the 0016/0019 structure): each CHECK's drop
-- is guarded, each add is guarded (first-time apply widens in place; a
-- re-paste drops the 3-value constraint and re-adds it). The kind CHECK is
-- 0032's INLINE unnamed constraint, so its guards match by COLUMN (any
-- table CHECK on `kind`) rather than by the auto-name — robust to the
-- auto-name, and the add re-creates it explicitly named. The function +
-- triggers follow the 0032 structure: create or replace, then
-- drop-trigger-if-exists + create trigger; notification_payload is
-- DROP + CREATE (it returns a table — the 0021/0028/0032 structure).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Widen playdates.status's CHECK (0019's 2-value constraint becomes the
--    3-value one). No row conversion (pin a) — the add validates existing
--    'on' / 'cancelled' rows as-is.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'playdates_status_chk'
      and conrelid = 'public.playdates'::regclass
  ) then
    alter table public.playdates drop constraint "playdates_status_chk";
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'playdates_status_chk'
      and conrelid = 'public.playdates'::regclass
  ) then
    alter table public.playdates
      add constraint "playdates_status_chk"
      check (status in ('on', 'cancelled', 'ended'));
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Widen notification_log.kind's CHECK (0032's 4-value constraint becomes
--    the 5-value one). 0032 declared it inline (0032:155), so Postgres
--    auto-named it `notification_log_kind_check`; the guards match by column
--    (any table CHECK whose key includes `kind`) so a re-paste is safe
--    regardless of the auto-name (pin e).
-- ---------------------------------------------------------------------------
do $$
declare
  v_conname text;
begin
  select c.conname
    into v_conname
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
                      'new_comment', 'ended'));
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. The "don't head out" producer, generalized (pin c): a status UPDATE
--    picks the kind from the NEW status; a DELETE still writes 'cancelled'.
--    The two TRIGGERS are unchanged from 0032 (the AFTER UPDATE one keeps
--    its WHEN clause, so only status flips fire; the BEFORE DELETE one
--    keeps riding this same function, pin f of 0032).
-- ---------------------------------------------------------------------------
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

  insert into public.notification_log (profile_id, kind, playdate_id, title, body, url)
  select gp.profile_id, v_kind, v_row.id, pl.title, pl.body, pl.url
  from public.going_pings gp,
  public.notification_payload(
    v_kind, v_row.id, v_row.title, null, null
  ) as pl
  where gp.playdate_id = v_row.id
    and gp.profile_id is distinct from auth.uid()
  on conflict (profile_id, kind, playdate_id) do nothing;

  -- A BEFORE DELETE trigger MUST return a non-NULL row or Postgres cancels the
  -- delete; on DELETE, NEW is null, so this resolves to OLD. On UPDATE the
  -- return value is ignored.
  return coalesce(new, old);
end;
$$;

drop trigger if exists notification_playdate_cancelled on public.playdates;

create trigger notification_playdate_cancelled
  after update
  on public.playdates
  for each row
  when (old.status is distinct from new.status)
  execute function public.notify_playdate_cancelled();

drop trigger if exists notification_playdate_deleted on public.playdates;

create trigger notification_playdate_deleted
  before delete
  on public.playdates
  for each row
  execute function public.notify_playdate_cancelled();

-- ---------------------------------------------------------------------------
-- 4. The copy rule (pin d): `notification_payload` gains the `ended`
--    branch. DROP + CREATE — it returns a table (the 0021/0028/0032
--    structure); every other branch is carried over char-for-char from
--    0032:216-266 (the post-apply probe at 0032:204-209 still passes).
-- ---------------------------------------------------------------------------
drop function if exists public.notification_payload(text, uuid, text, text, int);

create function public.notification_payload(
  p_kind text,
  p_playdate_id uuid,
  p_post_title text,
  p_actor_name text,
  p_going_count int
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
      '/playdate/' || p_playdate_id::text as link
  )
  select
    case p_kind
      when 'ping_received' then t.actor || ' is going'
      when 'new_comment' then t.actor || ' commented'
      when 'cancelled' then 'Cancelled: "' || t.subject || '"'
      -- 0041: honest history (pin d) — an early end is labelled "Ended",
      -- not "Cancelled".
      when 'ended' then 'Ended: "' || t.subject || '"'
      when 'starting_soon' then 'Starting soon: "' || t.subject || '"'
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
              -- The zero branch (see the amendment note in 0032's header): a
              -- NULL/0 count says who is actually coming rather than printing
              -- "0 families are going" at a parent who is going.
              when t.going <= 0 then 'you''re the only one going so far'
              when t.going = 1 then '1 family is going'
              else t.going::text || ' families are going'
            end
      else ''
    end as body,
    t.link as url
  from t;
$$;

-- The EXECUTE posture is 0032's (re-issued so this file is self-contained):
-- the formatter is the SENDER's; the schema owner (the dashboard SQL path the
-- coordinator's probe uses) can always call it.
revoke execute on function public.notification_payload(text, uuid, text, text, int) from public;
revoke execute on function public.notification_payload(text, uuid, text, text, int) from anon;
revoke execute on function public.notification_payload(text, uuid, text, text, int) from authenticated;
grant execute on function public.notification_payload(text, uuid, text, text, int) to service_role;

-- Trigger functions are not reachable through PostgREST (they return
-- `trigger`), so this is defense in depth (the 0032:469-472 posture) —
-- create-or-replace preserves 0032's revokes; re-issued for self-containment.
revoke execute on function public.notify_playdate_cancelled() from public;
revoke execute on function public.notify_playdate_cancelled() from anon;
-- ===========================================================================
-- V27 slice 1 (migration 0056): the `new_message` notification kind — a new
-- playdate-scoped message notifies the other participants.
-- ===========================================================================
--
-- What this does: widens ONE existing CHECK constraint, replaces TWO existing
-- functions (the copy formatter and a NEW producer), and adds ONE trigger on
-- `public.messages`. It adds no table, no column, no index, no policy, and no
-- row. Strictly additive and re-paste-safe: this is a LIVE-DATABASE migration
-- (the project holds real family data), so every statement is guarded.
--
-- WHY `new_message` RIDES THE EXISTING OUTBOX, unchanged: the sender
-- (`send-push`) drains `notification_log` generically — it reads title/body/url
-- and posts them — so a new kind needs no sender branch. The producer below
-- writes exactly those three columns through the same formatter every other
-- kind uses, and the drain carries it. `supabase/functions/send-push/index.ts`
-- is deliberately UNTOUCHED.
--
-- THE RE-ARM, WHICH IS THE POINT OF THIS KIND (read before "fixing" it):
-- every other producer writes `on conflict … do nothing` — "if we already told
-- them about this drop-in, never tell them again" (0032 pin a). A conversation
-- is not an event: a chat must buzz AGAIN on the next message, so the insert
-- here is `on conflict (profile_id, kind, playdate_id) do update …`, resetting
-- `sent_at = null` (the row is owed again) and stamping `created_at = now()` so
-- the /profile fallback list shows the LATEST message alert. The result is ONE
-- row per (parent, conversation) that is re-armed by each new message, not a
-- history of them. `do nothing` would buzz once ever and then go silent, which
-- is the bug this kind exists to prevent.
--
-- WHAT IT DELIBERATELY DOES NOT DO:
--
--   * NO FREE-FORM DM NOTIFICATION. `messages.playdate_id` is nullable by
--     design (0043's DMs), and this producer early-returns on a NULL. A DM
--     needs its own URL (`/inbox?dm=<peer>`), its own recipient set
--     (`message_recipients`), and NULL-distinct dedupe semantics — its own
--     slice. The guard is `if new.playdate_id is null then return new; end if;`.
--   * NO MESSAGE CONTENT IN ANY PUSH. The producer reads the post's title and
--     the sender's display name, never `new.body`. A parent's message on a
--     lock screen is a privacy leak this product does not take; the push names
--     the sender and points at the thread.
--   * NO `auth.uid()` COMPARISON. Every other producer excludes the actor with
--     `is distinct from auth.uid()` (0032 pin g). This producer has a real
--     actor on the row — `new.sender_id` — and uses it, so the exclusion is
--     exact even on a service-role/trigger path where `auth.uid()` is null.
--   * NO SECURITY DEFINER ON `notification_payload`. It has never had the flag
--     (0032 and 0041 and 0055 all omit it; section 2's body carries 0055's
--     `language sql stable set search_path = public, pg_temp` verbatim), and
--     adding it here would be a privilege change dressed as a copy change.
--     Section 4 ASSERTS `prosecdef = false` rather than trusting this comment.
--
-- THE SEVENTH KIND IS THE SAME STRING IN EVERY HAND-MAINTAINED PLACE:
--   * `public.notification_log.kind`'s CHECK (this file, section 1);
--   * `notification_payload`'s CASE branches (this file, section 2);
--   * `NOTIFICATION_KINDS` in `supabase/functions/_shared/pushCopy.ts`;
--   * `EMAIL_KINDS` in `supabase/functions/_shared/emailCopy.ts` (the
--     DRIFT GUARD in `src/lib/email.test.ts` asserts the two lists are equal);
--   * the `NotificationKind` union + `NOTIFICATION_KIND_COPY` in
--     `src/lib/push.ts` (the `Record` forces the entry at compile time).
--   * and the hand-written name array in `e2e/push-subscribe.e2e.ts`, which
--     `npm run verify` cannot see (e2e is a separate lane) — recorded so the
--     omission is a known gap, not a surprise.
--
-- Idempotent + re-paste-safe (the 0016/0019/0041/0055 structure): the kind
-- CHECK is 0032's INLINE unnamed constraint, so its guards match by COLUMN
-- (any table CHECK whose key includes `kind`) rather than by the auto-name — a
-- second paste drops the seven-value constraint and re-adds it identically: a
-- no-op, not an error. The formatter is DROP + CREATE (it returns a table — the
-- 0021/0028/0032/0041/0055 structure). The producer is `create or replace`
-- (its signature is stable), the trigger is `drop trigger if exists` +
-- `create trigger`.
--
-- Apply order: independent, but assumes 0055 is applied (it is — the last
-- applied migration is 0055). Section 1 drops whatever kind CHECK exists, so
-- applying this before 0055 would still produce the correct seven-value
-- constraint.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Widen notification_log.kind's CHECK (0055's 6-value constraint becomes the
--    7-value one). 0032 declared it inline (0032:155), so Postgres auto-named
--    it `notification_log_kind_check`; the guards match by column (any table
--    CHECK whose key includes `kind`) so a re-paste is safe regardless of the
--    auto-name.
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
                      'new_comment', 'ended', 'review_due', 'new_message'));
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. The copy rule: `notification_payload` gains the `new_message` branch.
--    DROP + CREATE — it returns a table (the 0021/0028/0032/0041/0055
--    structure); every other branch is carried over char-for-char from
--    0055:172-256. The pinned signature (text, uuid, text, text, int) is
--    UNCHANGED — no parameter is added and no message content is carried.
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
      -- 0041: honest history — an early end is labelled "Ended", not
      -- "Cancelled".
      when 'ended' then 'Ended: "' || t.subject || '"'
      when 'starting_soon' then 'Starting soon: "' || t.subject || '"'
      -- 0055: `How was "<subject>"?` — char-for-char the TS title in
      -- buildNotificationPayload's `review_due` branch.
      when 'review_due' then 'How was "' || t.subject || '"?'
      -- 0056: the sender, not the message (the privacy pin in the header).
      -- Char-for-char the TS title in buildNotificationPayload's
      -- `new_message` branch and the vitest spec.
      when 'new_message' then t.actor || ' messaged you'
      else 'Drop In'
    end as title,
    case p_kind
      when 'ping_received' then 'to "' || t.subject || '"'
      when 'new_comment' then 'on "' || t.subject || '"'
      -- The "don't drive to an empty park" sentence (0032 pin e).
      when 'cancelled' then 'The host called it off — don''t head out.'
      -- 0041: the same sentence class for the early-end case.
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
      -- 0055: NOT "you went" (that header's honesty pin). `going_pings` has no
      -- status column and no check-in exists, so a ping is a stated intention
      -- and this sentence stays true for a no-show too.
      when 'review_due' then 'You said you were going — rate the place.'
      -- 0056: the thread the parent should open to reply. NO message content —
      -- the subject is the post's title, never `new.body` (the header's
      -- privacy pin).
      when 'new_message' then 'Tap to reply in "' || t.subject || '"'
      else ''
    end as body,
    -- 0055: the review prompt opens the PLACE, not the drop-in.
    --
    -- 0056: a message opens the THREAD, not the drop-in's detail page — the
    -- parent's job is to reply, and the conversation lives at
    -- `/inbox?thread=<playdate id>`. A NEW branch, exactly like the 0055 one:
    -- the pinned signature still has no extra parameter, so the branch reads
    -- the playdate id from the SECOND argument position (which every producer
    -- already passes as the playdate/post id); every other kind keeps `t.link`
    -- char-for-char.
    --
    -- NO ENCODING QUESTION HERE, unlike the TS twin: `messageThreadUrl`
    -- applies `encodeURIComponent`, but this argument is TYPED `uuid`, so it
    -- can never contain `/` or any character encoding would alter. The two
    -- spellings agree by construction for every value this branch can be
    -- handed. (0032's `playdate_id` is a soft reference and may be NULL — but
    -- this producer only ever calls the formatter with `new.playdate_id`, and
    -- it has already returned for a NULL one, so this branch is never handed
    -- NULL.)
    case p_kind
      when 'review_due' then '/place/' || p_playdate_id::text || '/details'
      when 'new_message' then '/inbox?thread=' || p_playdate_id::text
      else t.link
    end as url
  from t;
$$;

-- The EXECUTE posture is 0032's (re-issued so this file is self-contained):
-- the formatter is the SENDER's, and the schema owner (the dashboard SQL path
-- the read-back's probe uses) can always call it.
revoke execute on function public.notification_payload(text, uuid, text, text, int) from public;
revoke execute on function public.notification_payload(text, uuid, text, text, int) from anon;
revoke execute on function public.notification_payload(text, uuid, text, text, int) from authenticated;
grant execute on function public.notification_payload(text, uuid, text, text, int) to service_role;

-- ---------------------------------------------------------------------------
-- 3. The producer: a new message on a drop-in → every OTHER participant (the
--    post's host UNION its going_pings profiles, minus the sender).
--
-- AFTER INSERT, like 0032's social producers: the row is committed-visible at
-- this point and nothing here can block a legitimate message. The recipient
-- set is the SAME participation rule the messages RLS/guard uses (0042), read
-- directly rather than through `auth.uid()` — because the actor is ON the row
-- (`new.sender_id`), so the exclusion is exact even when there is no session.
--
-- The `UNION` (not `union all`) matters: the host can also be a pinger, and a
-- duplicate profile_id in one INSERT would make Postgres raise
-- "ON CONFLICT DO UPDATE command cannot affect row a second time".
-- ---------------------------------------------------------------------------
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
  -- Free-form DMs are OUT OF SCOPE for this slice (header). A DM has no
  -- playdate thread to point at, so there is nothing to write.
  if new.playdate_id is null then
    return new;
  end if;

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

  select pr.display_name into v_actor_name
    from public.profiles pr
    where pr.id = new.sender_id;

  insert into public.notification_log (profile_id, kind, playdate_id, title, body, url)
  select r.profile_id, 'new_message', new.playdate_id, pl.title, pl.body, pl.url
  from (
    -- The host, plus everyone who pinged — deduplicated (see the header).
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
  -- THE RE-ARM (header): a repeat message resets the same row to "owed" so the
  -- next message buzzes again. ONE pending notification per conversation,
  -- deliberately — not a history.
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

drop trigger if exists notification_new_message on public.messages;

create trigger notification_new_message
  after insert
  on public.messages
  for each row
  execute function public.notify_new_message();

-- Trigger functions are not reachable through PostgREST (they return
-- `trigger`), so this is defense in depth rather than a boundary — but the
-- revoke costs nothing and keeps the "one caller shape per function" posture
-- (the 0015/0032 pattern).
revoke execute on function public.notify_new_message() from public;
revoke execute on function public.notify_new_message() from anon;

-- ---------------------------------------------------------------------------
-- 4. Read-back — the migration asserts its own effect rather than assuming it.
-- ---------------------------------------------------------------------------
-- The house lesson (V18): a 2xx write touching zero rows exits 0 with a
-- reassuring log. These are READ-ONLY probes; they raise if the kind CHECK was
-- not actually widened, if a second stray kind CHECK survived, if the function
-- lost its pinned signature or its `stable` / `prosecdef` flags, or if the
-- `new_message` branch does not render the pinned strings. The functional
-- probe is possible because the schema owner always holds EXECUTE (0032's own
-- note) and the function is STABLE — it writes nothing.
do $$
declare
  missing text[] := array[]::text[];
  v_def text;
  v_count int;
  v_title text;
  v_body text;
  v_url text;
  v_volatile text;
  v_prosecdef boolean;
  v_pd uuid := gen_random_uuid();
  v_kind text;
begin
  -- (1) Exactly one CHECK on `kind`, and it admits all seven kinds. A
  --     surviving six-value twin is the failure that looks like success: the
  --     insert would fail with a constraint the reader is not looking at.
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
                                'new_message'] loop
    if v_def is null or position(v_kind in v_def) = 0 then
      missing := array_append(
        missing, format('kind CHECK does not admit %s', v_kind)
      );
    end if;
  end loop;

  -- (2) The function is the SAME signature it has always had, still STABLE, and
  --     with the SAME `prosecdef` flag it has always had (the header's pin:
  --     SECURITY DEFINER is absent in 0032/0041/0055 and this file does not add
  --     it). Both flags are ASSERTED, not printed — `to_regprocedure` returns
  --     NULL rather than raising, so an absent function is reported rather
  --     than aborting the read-back.
  select p.provolatile::text, p.prosecdef
    into v_volatile, v_prosecdef
    from pg_proc p
   where p.oid = to_regprocedure(
           'public.notification_payload(text, uuid, text, text, int)'
         );

  if v_volatile is null then
    missing := array_append(
      missing,
      'function public.notification_payload(text, uuid, text, text, int)'
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

  -- (3) The branch actually RENDERS the pinned copy (not merely exists). Only
  --     run when (2) found the function, so the failure message stays honest.
  if v_volatile is not null then
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
  end if;

  if array_length(missing, 1) is not null then
    raise exception '0056 read-back FAILED — %', array_to_string(missing, '; ');
  end if;

  raise notice '0056 read-back OK — kind CHECK admits 7 kinds including new_message; notification_payload stable (security definer = %), new_message → % / %', v_prosecdef, v_title, v_url;
end
$$;

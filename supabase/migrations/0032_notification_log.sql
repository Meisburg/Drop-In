-- ===========================================================================
-- V8 ticket 08 (migration 0032): NOTIFICATION_LOG — the outbox, the dedupe
-- key, and the audit trail.
-- ===========================================================================
--
-- What this adds: one row per (parent, kind, post) notification we owe. The
-- row is BOTH the outbox the sender drains and the audit trail that answers
-- "did we already tell them?" — and it is the visible fallback for a parent
-- who denied the browser permission (the /profile Notifications section's
-- recent list reads it under the owner-only SELECT policy below).
--
-- AMENDED IN PLACE 2026-09-12 (the 0023 → 90a159f amendment pattern — re-apply
-- this file to update a live database): `starting_soon`'s body gained a ZERO
-- branch. It used to render "… · 0 families are going" for a NULL/0 count,
-- which reads as "nobody is coming" on a notice that is only ever sent to
-- parents who ARE going. The TS twin (familiesGoingLabel in
-- supabase/functions/_shared/pushCopy.ts) carries the same three branches,
-- char-for-char, and both are pinned by src/lib/push.test.ts.
--
-- Pinned decisions (ticket 08 + .scratch/v8/spec.md; load-bearing, not
-- preferences):
--
-- (a) THE UNIQUE KEY IS THE ANTI-DOUBLE-SEND WALL:
--         unique (profile_id, kind, playdate_id)
--     (inline → constraint `notification_log_profile_id_kind_playdate_id_key`).
--     Every producer is an event that can fire twice — a retried ping, an
--     edited-then-cancelled post, a re-run of the sender — and every producer
--     writes with `on conflict do nothing`, so a second attempt is a no-op
--     rather than a second buzz on a parent's phone. The sender is therefore
--     SAFE TO INVOKE REPEATEDLY (every 5 minutes, plus any manual kick): the
--     constraint, not the scheduler, is the guard. Do not "clean this up" into
--     a plain index — the ON CONFLICT inference depends on it.
--
--     NULLs are DISTINCT in a unique constraint, so `playdate_id is null` rows
--     do not dedupe against each other. That is deliberate and currently
--     unreachable: all four kinds carry a post (`starting_soon`, `cancelled`
--     and the two social kinds are all about one drop-in), and the producers
--     below always pass one.
--
-- (b) `playdate_id` IS A SOFT REFERENCE — DELIBERATELY NO FOREIGN KEY. This
--     looks like an omission and is not:
--       * `on delete cascade` would DELETE the very cancellation notice the
--         delete producer just wrote. The producer must run BEFORE DELETE
--         (below, pin f) while the post and its pings still exist, and the FK
--         cascade fires after the parent row goes — so the row inserted to say
--         "don't drive to the empty park" would be removed in the same
--         transaction, i.e. the one notification that matters most would never
--         be sent.
--       * `on delete set null` is no better: it would NULL the column after
--         the insert, which both loses "which drop-in" AND breaks the dedupe
--         key (pin a) for exactly the rows that are hardest to reason about.
--     So the column keeps the id of a post that may no longer exist, the URL
--     points at the app's own honest not-found state for it, and the row
--     survives as the audit trail. The FK to `profiles` IS real (cascade):
--     deleting a parent takes their log with them.
--
-- (c) INSERTS ARE SERVICE-ROLE / DEFINER ONLY — THERE IS NO AUTHENTICATED
--     INSERT OR UPDATE POLICY, AND THAT IS THE POINT. The producers are the
--     SECURITY DEFINER trigger functions below plus the sender (which runs on
--     the service-role key); both write past RLS as the table owner. An
--     authenticated INSERT must FAIL CLOSED (42501) — otherwise any signed-in
--     parent could forge a notification row for anyone, i.e. push arbitrary
--     copy to another parent's device with our name on it. The RLS surface is
--     exactly ONE policy: owner-only SELECT (pin d). Do not add an insert
--     policy "so the client can log things".
--
-- (d) OWNER-ONLY SELECT. Same reasoning as 0031's capability pin, weaker
--     consequence: the log holds the copy that was pushed (titles, bodies)
--     plus which posts a parent was told about, which is that parent's
--     business and nobody else's. No cross-profile read, no moderator read.
--
-- (e) THE FOUR PRODUCERS (all pinned by ticket 08):
--       ping_received  a ping lands on your post          → the post's host
--       new_comment    a comment/reply on your post        → the post's host,
--                                                            plus (on a reply)
--                                                            the parent
--                                                            comment's author
--       cancelled      a post you pinged flips to cancelled,
--                      or its host deletes it              → everyone who
--                                                            pinged it
--       starting_soon  a post you pinged starts within 60
--                      minutes and you have not been told  → everyone who
--                                                            pinged it
--     The first three are EVENT-DRIVEN triggers (below) and need no
--     scheduler. `starting_soon` CANNOT be event-driven — "starts in an hour"
--     is a property of the clock, not of any write — so it is produced by the
--     `send-push` Edge Function's own catch-up scan, which inserts the missing
--     rows as it sends them (the scan is a PostgREST anti-join across
--     `going_pings` / `playdates` / this table; see
--     supabase/functions/send-push/index.ts).
--
--     'rained_out' DELIBERATELY DOES NOT NOTIFY, and that is a decision worth
--     naming because it looks like an oversight next to 'cancelled'. The
--     ticket's kind set is exactly those four strings, and a rained-out
--     drop-in is a "check before you go" state rather than a "do not come"
--     one — 0016's three-way status exists precisely so a host can say the
--     ground is wet without cancelling the plan. Adding a fifth kind is a
--     product call plus a migration, not something to smuggle in here.
--
-- (f) THE DELETE PRODUCER IS A **BEFORE** DELETE TRIGGER, and that is
--     required, not stylistic: `going_pings` cascades on post delete (0007),
--     so by the time an AFTER DELETE trigger ran, the attendee list it must
--     notify would already be gone. Reading the pings in a BEFORE DELETE
--     trigger is safe from the usual objection — a phantom notification on a
--     rolled-back delete — because the INSERT into this table is in the SAME
--     transaction: if the delete rolls back, so does the notice.
--
-- (g) NEVER NOTIFY THE ACTOR ABOUT THEIR OWN ACTION. Every producer compares
--     each recipient against `auth.uid() is distinct from recipient` — which
--     is null-safe on purpose: when there is no actor (the post-apply probe,
--     a service-role write, any `auth.uid() is null` path) the comparison is
--     TRUE and the producer PASSES THROUGH and notifies everyone, exactly the
--     0011 lesson. A producer that raised or silently skipped when
--     `auth.uid()` is null would make every dashboard-issued write invisible.
--
-- (h) THE TRIGGER FUNCTIONS ARE SECURITY DEFINER WITH A PINNED `search_path`
--     (the 0015/0028 pattern) — that is what lets them write past this
--     table's RLS (owner bypasses RLS; pin c) and read the post/ping rows they
--     need regardless of the caller's policies. They are declared VOLATILE
--     because they write; `notification_payload` below is STABLE and writes
--     nothing.
--
-- (i) ONE PLACE HOLDS THE COPY. `notification_payload` (below) is the single
--     server-side formatter for all four kinds' title/body/url, including the
--     singular the ticket pins ("1 family is going" — the plural template
--     would read "1 families", the same broken-English class the feed's
--     while-away copy already fixed at src/lib/feed.ts). Its unit-tested
--     client twin is `buildNotificationPayload` in
--     supabase/functions/_shared/pushCopy.ts, imported by src/lib/push.ts —
--     the same twin pairing as 0028's generator ↔ src/lib/series.ts. Keep the
--     two in step; the vitest spec pins the wording of all four kinds.
--
-- ACCEPTED RESIDUAL (documented, not fixed — the 0025/0028 header's
-- discipline): the /profile per-kind on/off switches are enforced at the
-- SERVICE WORKER, not by the sender. `pushsubscriptionchange`-era browsers
-- have no server-side preference table (0031/0032 are the only migrations
-- this ticket may add), so a muted kind is still delivered over the wire and
-- dropped on the device by the SW's `push` handler — the parent never sees it,
-- which is the behaviour they asked for, but the push service still carries
-- it. Gating the sender per kind needs a third table (profile × kind) and is
-- deliberately out of scope here.
--
-- Idempotent + re-paste-safe: `create table if not exists` with the CHECK and
-- the unique constraint declared INLINE; the RLS policy is DO-block guarded;
-- the partial index is `create index if not exists`; every function is
-- `create or replace` (the trigger functions' signature is stable, so
-- replacing is safe) except `notification_payload`, which is DROP + CREATE
-- because it returns a table (the 0021/0028 structure); every trigger is
-- `drop trigger if exists` + `create trigger`.
-- ===========================================================================

create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('ping_received', 'starting_soon', 'cancelled', 'new_comment')),
  -- Soft reference — NO FK, on purpose (pin b). Nullable (pin a).
  playdate_id uuid null,
  -- The exact copy that was (or will be) pushed. NOT NULL: a notification with
  -- no body is a bug, and the producers always compute these through
  -- notification_payload (pin i).
  title text not null,
  body text not null,
  url text not null,
  created_at timestamptz not null default now(),
  -- NULL = still owed. The sender stamps both on every attempt (a row with no
  -- subscription at all is stamped `sent_at` + `error = 'no subscription'`
  -- rather than retried forever).
  sent_at timestamptz null,
  error text null,
  -- The anti-double-send wall (pin a) — INLINE so a re-paste is a no-op.
  unique (profile_id, kind, playdate_id)
);

alter table public.notification_log enable row level security;

-- The ONLY policy on this table (pins c and d): owner-only SELECT. The
-- absence of INSERT/UPDATE/DELETE policies is the feature.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notification_log'
      and policyname = 'notification_log_select_owner'
  ) then
    create policy "notification_log_select_owner"
      on public.notification_log for select
      to authenticated
      using (profile_id = auth.uid());
  end if;
end
$$;

-- The sender's drain (every 5 minutes) is `where sent_at is null`; a partial
-- index keeps that scan proportional to the BACKLOG rather than to the table's
-- total history, which only ever grows.
create index if not exists notification_log_unsent_idx
  on public.notification_log (created_at)
  where sent_at is null;

-- ---------------------------------------------------------------------------
-- The copy rule (pin i). STABLE and writes nothing — it is a pure formatter,
-- so it is safe for the post-apply probe to call directly:
--     select * from public.notification_payload(
--       'starting_soon', gen_random_uuid(), 'Green Lake', null, 1)
--   → title 'Starting soon: "Green Lake"', body '… · 1 family is going'
--     select * from public.notification_payload(
--       'starting_soon', gen_random_uuid(), 'Green Lake', null, null)
--   → body '… · you''re the only one going so far' (the zero branch)
-- EXECUTE is revoked from public/anon/authenticated and granted to
-- service_role only: it is the SENDER's formatter, and the schema owner (the
-- dashboard SQL path the coordinator's probe uses) can always call it.
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
      when 'starting_soon' then 'Starting soon: "' || t.subject || '"'
      else 'Drop In'
    end as title,
    case p_kind
      when 'ping_received' then 'to "' || t.subject || '"'
      when 'new_comment' then 'on "' || t.subject || '"'
      -- The "don't drive to an empty park" sentence (pin e).
      when 'cancelled' then 'The host called it off — don''t head out.'
      when 'starting_soon' then
        'Starts within the hour · '
        || case
             -- The zero branch (see the amendment note in the header): a
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

revoke execute on function public.notification_payload(text, uuid, text, text, int) from public;
revoke execute on function public.notification_payload(text, uuid, text, text, int) from anon;
revoke execute on function public.notification_payload(text, uuid, text, text, int) from authenticated;
grant execute on function public.notification_payload(text, uuid, text, text, int) to service_role;

-- ---------------------------------------------------------------------------
-- Producer 1: a ping lands on your post → the post's host (pin e).
--
-- AFTER INSERT on going_pings: the row is committed-visible at this point and
-- nothing here can block a legitimate ping. 0010's guard trigger already
-- refuses a host pinging their own post; the actor comparison below is the
-- null-safe belt to that braces (pin g).
-- ---------------------------------------------------------------------------
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

drop trigger if exists notification_ping_received on public.going_pings;

create trigger notification_ping_received
  after insert
  on public.going_pings
  for each row
  execute function public.notify_ping_received();

-- ---------------------------------------------------------------------------
-- Producer 2: a comment/reply on your post → the post's host, plus the parent
-- comment's author when the new comment is a reply (pin e).
--
-- Both recipients share the dedupe key (profile_id, kind, playdate_id), so a
-- host who is ALSO the parent comment's author gets exactly one row — which is
-- the desired outcome, not a collision.
-- ---------------------------------------------------------------------------
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

drop trigger if exists notification_new_comment on public.comments;

create trigger notification_new_comment
  after insert
  on public.comments
  for each row
  execute function public.notify_new_comment();

-- ---------------------------------------------------------------------------
-- Producer 3: a post you pinged is cancelled or deleted → everyone who pinged
-- it (pin e) — the "don't drive to an empty park" notice.
--
-- ONE function, TWO triggers, switching on TG_OP:
--   * AFTER UPDATE, filtered to a status CHANGE by the trigger's WHEN clause
--     (so unrelated edits — 0016's revert, ticket 05's title/place edits —
--     never fire it), and additionally to `new.status = 'cancelled'` inside so
--     that 'on' → 'rained_out' does not send a cancellation.
--   * BEFORE DELETE, because the pings cascade away with the post (pin f).
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
begin
  if tg_op = 'DELETE' then
    v_row := old;
  else
    if new.status <> 'cancelled' then
      return new;
    end if;
    v_row := new;
  end if;

  insert into public.notification_log (profile_id, kind, playdate_id, title, body, url)
  select gp.profile_id, 'cancelled', v_row.id, pl.title, pl.body, pl.url
  from public.going_pings gp,
  public.notification_payload(
    'cancelled', v_row.id, v_row.title, null, null
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

-- Trigger functions are not reachable through PostgREST (they return
-- `trigger`), so this is defense in depth rather than a boundary — but the
-- revoke costs nothing and keeps the "one caller shape per function" posture
-- (the 0015/0025 pattern).
revoke execute on function public.notify_ping_received() from public;
revoke execute on function public.notify_new_comment() from public;
revoke execute on function public.notify_playdate_cancelled() from public;
revoke execute on function public.notify_ping_received() from anon;
revoke execute on function public.notify_new_comment() from anon;
revoke execute on function public.notify_playdate_cancelled() from anon;

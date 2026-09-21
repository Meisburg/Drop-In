-- V15 send repair (founder feedback 2026-09-20): free-form DMs failed in the
-- live app with "Could not send your message."
--
-- ROOT CAUSE (four independent live defects, all from 0043 not fully applying
-- through the CDP SQL editor — the same partial-apply failure mode recorded for
-- 0042's realtime publication entry):
--
--   1. messages_participation_guard() was still the 0042 version: no free-form
--      branch, so an insert with playdate_id IS NULL fell into the playdate
--      check (`p.id = NULL` never matches) and raised
--      'sender is not a participant in this playdate'. EVERY DM send failed.
--   2. The trigger was BEFORE INSERT while the function inserts
--      message_recipients rows that FK to messages(id). Under BEFORE INSERT the
--      parent row does not exist yet, so the FK was violated. It must be AFTER
--      INSERT.
--   3. The function ran as the INVOKER (prosecdef = false). message_recipients
--      has RLS enabled, so the trigger's own writes were silently subject to
--      the caller's policies. It must be SECURITY DEFINER.
--   4. message_recipients was missing its SELECT and UPDATE policies, and
--      messages_select_participants was missing the sender_id branch. Together
--      these broke the client's read-back (.select('id').single()) and the
--      follow-up .upsert() with 42501.
--
-- THE DESIGN CHANGE: the recipient write is now owned by the trigger, not the
-- client. The client sends ONE row carrying `recipient_hint`, and the AFTER
-- INSERT trigger records BOTH the sender and the hinted recipient. This removes
-- the two-step client write entirely — that step could never work, because
-- ON CONFLICT DO UPDATE needs an UPDATE policy AND a SELECT of the conflicting
-- row, and the SELECT policy is scoped to `profile_id = auth.uid()`, so a
-- sender can never see (let alone update) the row they are adding for the OTHER
-- party.
--
-- Idempotent + re-paste-safe (house lesson from 0007/0025/0042/0043).

-- ---------------------------------------------------------------------------
-- 1. The recipient hint: who the sender is talking to. Read by the trigger;
--    not a read-shape column (MessageRow does not select it).
-- ---------------------------------------------------------------------------
alter table public.messages add column if not exists recipient_hint uuid;

-- ---------------------------------------------------------------------------
-- 2. The guard function: free-form branch + SECURITY DEFINER, so the trigger's
--    own message_recipients writes are not filtered by the caller's RLS.
-- ---------------------------------------------------------------------------
create or replace function public.messages_participation_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.playdate_id is not null then
    -- Playdate-scoped: existing participation check (host or pinger).
    if not exists (
      select 1 from public.playdates p
      where p.id = new.playdate_id
        and (
          p.host_profile_id = new.sender_id
          or exists (
            select 1 from public.going_pings gp
            where gp.playdate_id = p.id
              and gp.profile_id = new.sender_id
          )
        )
    ) then
      raise exception 'sender is not a participant in this playdate';
    end if;
    -- Populate recipients: host + all pingers.
    insert into public.message_recipients (message_id, profile_id)
    values (new.id, new.sender_id)
    on conflict do nothing;
    insert into public.message_recipients (message_id, profile_id)
    select new.id, p.host_profile_id
    from public.playdates p
    where p.id = new.playdate_id
      and p.host_profile_id <> new.sender_id
    on conflict do nothing;
    insert into public.message_recipients (message_id, profile_id)
    select new.id, gp.profile_id
    from public.going_pings gp
    where gp.playdate_id = new.playdate_id
      and gp.profile_id <> new.sender_id
    on conflict do nothing;
  else
    -- Free-form: sender must be the authenticated caller.
    if new.sender_id <> auth.uid() then
      raise exception 'cannot send a message as another user';
    end if;
    -- Sender + the hinted recipient, both written here (see the header note:
    -- the client no longer writes message_recipients).
    insert into public.message_recipients (message_id, profile_id)
    values (new.id, new.sender_id)
    on conflict do nothing;
    if new.recipient_hint is not null then
      insert into public.message_recipients (message_id, profile_id)
      values (new.id, new.recipient_hint)
      on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. The trigger must fire AFTER INSERT: the function's message_recipients
--    writes FK to messages(id), which does not exist during a BEFORE trigger.
-- ---------------------------------------------------------------------------
drop trigger if exists messages_participation_guard on public.messages;

create trigger messages_participation_guard
  after insert
  on public.messages
  for each row
  execute function public.messages_participation_guard();

-- ---------------------------------------------------------------------------
-- 4. message_recipients policies. SELECT must let BOTH sides of a thread read
--    the rows: the recipient (own rows) and the SENDER (the rows describing
--    who they addressed a message to — which is how the inbox list and the
--    thread view resolve the counterparty). The sender branch goes through the
--    SECURITY DEFINER helper below: inlining the subquery on messages here
--    recursed infinitely (42P17), because messages' own policy reads
--    message_recipients.
-- ---------------------------------------------------------------------------
create or replace function public.is_message_sender(p_message_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.messages m
    where m.id = p_message_id and m.sender_id = auth.uid()
  );
$$;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'message_recipients'
      and policyname = 'message_recipients_select_participant'
  ) then
    drop policy "message_recipients_select_participant" on public.message_recipients;
  end if;
  create policy "message_recipients_select_participant"
    on public.message_recipients for select
    to authenticated
    using (
      profile_id = auth.uid()
      or public.is_message_sender(message_id)
    );

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'message_recipients'
      and policyname = 'message_recipients_update_self_or_recipient'
  ) then
    create policy "message_recipients_update_self_or_recipient"
      on public.message_recipients for update
      to authenticated
      using (profile_id = auth.uid())
      with check (profile_id = auth.uid());
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. messages SELECT: add the sender_id branch. Without it the client's
--    INSERT ... RETURNING id (`.select('id').single()`) fails 42501, because
--    RETURNING is filtered by the SELECT policy and the recipient row that
--    would satisfy it is written by the AFTER trigger — i.e. after RETURNING
--    has already been evaluated.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'messages'
      and policyname = 'messages_select_participants'
  ) then
    drop policy "messages_select_participants" on public.messages;
  end if;
  create policy "messages_select_participants"
    on public.messages for select
    to authenticated
    using (
      sender_id = auth.uid()
      or exists (
        select 1 from public.message_recipients mr
        where mr.message_id = messages.id
          and mr.profile_id = auth.uid()
      )
      or exists (
        select 1 from public.playdates p
        where p.id = messages.playdate_id
          and (
            p.host_profile_id = auth.uid()
            or exists (
              select 1 from public.going_pings gp
              where gp.playdate_id = p.id
                and gp.profile_id = auth.uid()
            )
          )
      )
    );
end
$$;

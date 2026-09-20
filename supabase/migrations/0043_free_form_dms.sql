-- V15 ticket 01: free-form DMs — make messages.playdate_id nullable, add
-- message_recipients (tracks who's in a free-form thread), and add
-- message_reactions (thumbs-up reactions on messages).
--
-- Pinned decisions (spec.md / issues/01-free-form-dms.md):
-- - Existing playdate-scoped messages keep their playdate_id; new free-form
--   threads use NULL. The participation guard trigger is updated to allow
--   free-form inserts (sender + one recipient via message_recipients).
-- - message_recipients: for playdate-scoped messages, populated by the
--   trigger (host + pingers). For free-form: sender + the one other party.
-- - message_reactions: one reaction type (thumbs-up) in V15; PK
--   (message_id, profile_id); Realtime broadcast on INSERT.
--
-- Idempotent + re-paste-safe (house lesson from 0007/0025/0042).

-- ---------------------------------------------------------------------------
-- 1. Make playdate_id nullable (free-form threads have no playdate).
-- ---------------------------------------------------------------------------
alter table public.messages alter column playdate_id drop not null;

-- ---------------------------------------------------------------------------
-- 2. message_recipients: who can see a conversation.
--    For playdate-scoped: host + all pingers (populated by the trigger).
--    For free-form: sender + the one other participant.
-- ---------------------------------------------------------------------------
create table if not exists public.message_recipients (
  message_id uuid not null references public.messages (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  primary key (message_id, profile_id)
);

alter table public.message_recipients enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'message_recipients'
      and policyname = 'message_recipients_select_participant'
  ) then
    create policy "message_recipients_select_participant"
      on public.message_recipients for select
      to authenticated
      using (profile_id = auth.uid());
  end if;
  -- INSERT is only via the trigger (the RLS insert policy is intentionally
  -- absent; the trigger runs as SECURITY DEFINER context of the caller).
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Update the participation guard trigger:
--    - playdate-scoped (playdate_id IS NOT NULL): existing logic unchanged.
--    - free-form (playdate_id IS NULL): sender must be the caller; the
--      recipient is validated client-side (the UI picks a specific user).
--      We still insert a message_recipients row for the sender so the
--      recipient can discover the conversation.
-- ---------------------------------------------------------------------------
create or replace function public.messages_participation_guard()
returns trigger
language plpgsql
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
    -- Insert sender as a recipient (the other party is added by the
    -- client after the insert, via a separate upsert).
    insert into public.message_recipients (message_id, profile_id)
    values (new.id, new.sender_id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Add an INSERT policy on message_recipients for the free-form case:
--    a caller may add themselves OR the recipient they chose (the UI passes
--    the target profile_id). The SELECT policy above already scopes reads.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'message_recipients'
      and policyname = 'message_recipients_insert_self_or_recipient'
  ) then
    create policy "message_recipients_insert_self_or_recipient"
      on public.message_recipients for insert
      to authenticated
      with check (
        profile_id = auth.uid()
        or exists (
          select 1 from public.messages m
          where m.id = message_recipients.message_id
            and m.sender_id = auth.uid()
        )
      );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Widen the messages SELECT policy: a participant can read a message when
--    they are a recipient (covers both playdate-scoped AND free-form).
--    The old EXISTS-on-playdates subquery stays for backward compat; we add
--    an OR branch on message_recipients.
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
      -- Playdate-scoped path (original): host or pinger of the playdate.
      exists (
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
      or
      -- Free-form path: the caller is a recorded recipient.
      exists (
        select 1 from public.message_recipients mr
        where mr.message_id = messages.id
          and mr.profile_id = auth.uid()
      )
    );
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Widen the messages INSERT policy: allow free-form (playdate_id IS NULL)
--    when sender_id = auth.uid(). The trigger enforces the rest.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'messages'
      and policyname = 'messages_insert_sender_participant'
  ) then
    drop policy "messages_insert_sender_participant" on public.messages;
  end if;
  create policy "messages_insert_sender_participant"
    on public.messages for insert
    to authenticated
    with check (
      sender_id = auth.uid()
    );
end
$$;

-- ---------------------------------------------------------------------------
-- 7. message_reactions: thumbs-up on messages (V15 ticket 08, same migration).
-- ---------------------------------------------------------------------------
create table if not exists public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, profile_id)
);

alter table public.message_reactions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'message_reactions'
      and policyname = 'message_reactions_select_participant'
  ) then
    create policy "message_reactions_select_participant"
      on public.message_reactions for select
      to authenticated
      using (
        exists (
          select 1 from public.message_recipients mr
          where mr.message_id = message_reactions.message_id
            and mr.profile_id = auth.uid()
        )
        or
        exists (
          select 1 from public.playdates p
          where p.id = (select m.playdate_id from public.messages m where m.id = message_reactions.message_id)
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
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'message_reactions'
      and policyname = 'message_reactions_insert_own'
  ) then
    create policy "message_reactions_insert_own"
      on public.message_reactions for insert
      to authenticated
      with check (profile_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'message_reactions'
      and policyname = 'message_reactions_delete_own'
  ) then
    create policy "message_reactions_delete_own"
      on public.message_reactions for delete
      to authenticated
      using (profile_id = auth.uid());
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 8. Read-path indexes.
-- ---------------------------------------------------------------------------
drop index if exists public.idx_message_recipients_profile;
create index idx_message_recipients_profile
  on public.message_recipients (profile_id, message_id);

drop index if exists public.idx_message_reactions_message;
create index idx_message_reactions_message
  on public.message_reactions (message_id);

-- ---------------------------------------------------------------------------
-- 9. Realtime: add message_reactions to the publication.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_reactions'
  ) then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
end
$$;
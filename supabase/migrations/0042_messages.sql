-- V14 ticket 01: parent↔parent messaging — the messages + conversation_reads
-- tables, RLS, and the read-path index.
--
-- Pinned decisions (spec.md / issues/01-inbox-messaging.md):
-- - Messages are IMMUTABLE in V14: no UPDATE, no DELETE policies.
-- - Conversations are playdate-scoped: a message belongs to a drop-in; the
--   participants are the post's host and its pingers (going_pings). No
--   free-form DMs between arbitrary parents.
-- - conversation_reads tracks per-(playdate, profile) last_read_at so the
--   inbox can show an unread count (messages where created_at > last_read_at,
--   or all messages when no read row exists).
--
-- Idempotent + re-paste-safe (house lesson from 0007/0025): IF NOT EXISTS on
-- the tables; every policy inside a DO block (Postgres has no CREATE POLICY
-- IF NOT EXISTS); DROP INDEX IF EXISTS before CREATE INDEX.

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  playdate_id uuid not null references public.playdates (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_reads (
  playdate_id uuid not null references public.playdates (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (playdate_id, profile_id)
);

alter table public.messages enable row level security;
alter table public.conversation_reads enable row level security;

-- ---------------------------------------------------------------------------
-- messages RLS (mirrors the going_pings pattern, gated on participation):
-- A caller is a participant in a playdate's conversation when they are the
-- post's host (playdates.host_profile_id = auth.uid()) OR they have a
-- going_pings row on that playdate. The inline EXISTS subquery keeps the
-- policy self-contained (the 0025 house pattern).
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'messages'
      and policyname = 'messages_select_participants'
  ) then
    create policy "messages_select_participants"
      on public.messages for select
      to authenticated
      using (
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
      );
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'messages'
      and policyname = 'messages_insert_sender_participant'
  ) then
    create policy "messages_insert_sender_participant"
      on public.messages for insert
      to authenticated
      with check (
        sender_id = auth.uid()
      );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- messages INSERT participation guard (trigger, mirrors 0010's house pattern):
-- A caller may only insert a message into a playdate's conversation when they
-- are a participant — the post's host OR a pinger. RLS alone cannot express
-- this because `new` is not visible inside nested EXISTS subqueries in a
-- WITH CHECK clause; the BEFORE INSERT trigger closes the gap at the DB level.
-- ---------------------------------------------------------------------------

create or replace function public.messages_participation_guard()
returns trigger
language plpgsql
as $$
begin
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
  return new;
end;
$$;

drop trigger if exists messages_participation_guard on public.messages;

create trigger messages_participation_guard
  before insert
  on public.messages
  for each row
  execute function public.messages_participation_guard();

-- ---------------------------------------------------------------------------
-- conversation_reads RLS: each profile manages only its own read cursors.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'conversation_reads'
      and policyname = 'conversation_reads_select_own'
  ) then
    create policy "conversation_reads_select_own"
      on public.conversation_reads for select
      to authenticated
      using (profile_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'conversation_reads'
      and policyname = 'conversation_reads_insert_own'
  ) then
    create policy "conversation_reads_insert_own"
      on public.conversation_reads for insert
      to authenticated
      with check (profile_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'conversation_reads'
      and policyname = 'conversation_reads_update_own'
  ) then
    create policy "conversation_reads_update_own"
      on public.conversation_reads for update
      to authenticated
      using (profile_id = auth.uid())
      with check (profile_id = auth.uid());
  end if;
end
$$;

-- Read-path index: the thread view lists a playdate's messages by time.
drop index if exists public.idx_messages_playdate_created;
create index idx_messages_playdate_created
  on public.messages (playdate_id, created_at);
-- ---------------------------------------------------------------------------
-- Realtime: add the messages table to the supabase_realtime publication so
-- INSERTs are broadcast to subscribed channels. (conversation_reads is not
-- needed — unread counts refresh via the list reload, not realtime.)
-- Idempotent: skip if already present.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end
$$;

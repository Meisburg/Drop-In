-- V2 slice 4 (ticket 04): comments on events — the public per-event
-- question thread. Any signed-in parent can comment (<= 500 chars, the
-- DM replacement); the comment's author or the event's host can delete;
-- a moderator can soft-hide (hidden_at, the /mod model — hidden comments
-- are invisible to everyone).
--
-- Pinned contracts (plan-v2.md Interfaces: the `comments` data model +
-- trust pins):
-- - comments: id, playdate_id, author_profile_id, body (<= 500),
--   created_at, hidden_at (nullable)
-- - RLS: SELECT to authenticated with hidden_at is null (a soft-hidden
--   row is invisible to EVERYONE, including its author — the hard DELETE
--   is the author/host path; deletes are hard, hides are soft, do not
--   conflate, per plan-v2's comment delete-vs-hide note)
-- - INSERT: author only (author_profile_id = auth.uid())
-- - DELETE: the author, or the event's host (the host can clean up their
--   own event)
-- - UPDATE (hidden_at): moderators only (mirror of 0009's moderator
--   policy shape — the flag is read off the actor's own profiles row)
--
-- Comments stay authenticated-only in slices 1–4 (plan-v2 trust pin:
-- anon read lands with slice 5 only) — there is deliberately NO anon
-- SELECT policy here.
--
-- Idempotent + re-paste-safe (2026-09-04 house lesson: no CREATE POLICY
-- IF NOT EXISTS — every policy is DO-block guarded; the table / RLS /
-- index idioms below are themselves idempotent).
--
-- The DELETE policy's host check subqueries playdates under RLS (0005's
-- select policy is open to authenticated, so a host's subquery sees
-- their own row). The moderator UPDATE subqueries profiles under RLS
-- (0001's select policy is open to authenticated).
--
-- PGRST201 pin: the app's embeds pin the FK hint
-- (`author:profiles!comments_author_profile_id_fkey` — the auto-generated
-- constraint name for the author_profile_id FK below); the REST smoke
-- probes live in the slice report.

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  playdate_id uuid not null references public.playdates (id) on delete cascade,
  author_profile_id uuid not null references public.profiles (id) on delete cascade,
  body text not null
    check (char_length(trim(body)) > 0 and char_length(body) <= 500),
  created_at timestamptz not null default now(),
  hidden_at timestamptz
);

alter table public.comments enable row level security;

-- The comment thread is read per event (created_at ascending): the
-- detail-page list query scans by playdate_id + time order.
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'comments'
      and indexname = 'comments_playdate_id_created_at_idx'
  ) then
    create index "comments_playdate_id_created_at_idx"
      on public.comments (playdate_id, created_at);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'comments'
      and policyname = 'comments_select_authenticated'
  ) then
    create policy "comments_select_authenticated"
      on public.comments for select
      to authenticated
      using (hidden_at is null);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'comments'
      and policyname = 'comments_insert_own'
  ) then
    create policy "comments_insert_own"
      on public.comments for insert
      to authenticated
      with check (author_profile_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'comments'
      and policyname = 'comments_delete_author_or_host'
  ) then
    create policy "comments_delete_author_or_host"
      on public.comments for delete
      to authenticated
      using (
        author_profile_id = auth.uid()
        or exists (
          select 1 from public.playdates p
          where p.id = comments.playdate_id
            and p.host_profile_id = auth.uid()
        )
      );
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'comments'
      and policyname = 'comments_update_moderators'
  ) then
    create policy "comments_update_moderators"
      on public.comments for update
      to authenticated
      using (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.moderators
        )
      )
      with check (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.moderators
        )
      );
  end if;
end
$$;
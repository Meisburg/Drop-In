-- Slice 5: moderation — hidden_at on playdates (hide a post) + banned_at on
-- profiles (ban a profile), and the moderator UPDATE policies that make
-- the /mod tools work (pinned in plan.md Interfaces: "Moderator screen:
-- list reports, hide a post (hidden_at timestamp on playdates), ban a
-- profile (banned_at on profiles)").
--
-- Idempotent + re-paste-safe: ADD COLUMN IF NOT EXISTS is valid, idempotent
-- Postgres (unlike CREATE POLICY — see the 2026-09-04 LESSON in
-- task-state.md); the columns are added inside DO blocks and every policy
-- is created inside a DO block (house pattern: 0005/0006/0008).
--
-- This migration EXPECTS profiles.moderators to already exist — 0008 added
-- it for the reports SELECT policy. Do NOT re-create it here (2026-09-09
-- decision: 0008 owns the column). The one-time founder flag is manual SQL
-- the human runs in the dashboard (it is data, not schema — not a
-- migration):
--
--   update public.profiles
--   set moderators = true
--   where display_name = '<founder handle>';
--
-- V1-accepted risk (documented): Postgres RLS cannot restrict WHICH
-- columns a policy lets a role update — the moderator UPDATE policies
-- below grant a moderator UPDATE on any column of the row, not just
-- hidden_at / banned_at. Moderators are trusted in V1; an RPC-based
-- update surface is the V2 tightening.
--
-- The policies are additive: 0005's host-only playdates UPDATE policy and
-- 0001's self-only profiles UPDATE policy stay as-is (Postgres applies all
-- matching policies with OR).

do $$
begin
  alter table public.playdates add column if not exists hidden_at timestamptz;
end
$$;

do $$
begin
  alter table public.profiles add column if not exists banned_at timestamptz;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'playdates'
      and policyname = 'playdates_update_moderators'
  ) then
    create policy "playdates_update_moderators"
      on public.playdates for update
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
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_update_moderators'
  ) then
    create policy "profiles_update_moderators"
      on public.profiles for update
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
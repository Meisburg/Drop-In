-- V2 slice 2 (ticket 02): rich profiles — avatars, bio, kids, the
-- 'avatars' storage bucket, and the self-elevation guard trigger.
--
-- ===========================================================================
-- SUPERSEDED IN PART BY 0040 — DO NOT RE-PASTE THE KIDS POLICY SECTION OF
-- THIS FILE (V9 ticket 10, review cycle 1, F4). The DO block below recreates
-- `kids_select_authenticated` (`using (true)` for authenticated) from a
-- NAME-BASED existence guard. 0040 replaces it with
-- `kids_select_own_host_pinger_mod` (own family / host of a drop-in the kid is
-- attached to / a family who pinged it / moderators). Re-pasting this file
-- after 0040 finds the old policy absent, recreates it, and — because policies
-- of the same command are ORed — SILENTLY RE-OPENS every family's kids rows,
-- with no error and no warning. The other statements in this file (the kids
-- table, the profiles columns, the bucket, the storage policies) are
-- `if not exists` and remain safe to re-run; the four kids policies are not.
-- 0040 owns `kids_select_own_host_pinger_mod` now.
-- ===========================================================================
--
-- Pinned contracts (plan-v2.md Interfaces):
-- - profiles: + avatar_url (text, nullable), + bio (text, nullable, <= 500)
-- - kids: id, profile_id, first_name, age (int) — first name + age ONLY
--   (privacy pin: no full names, no gender — in the schema or the UI)
-- - Supabase Storage bucket `avatars`: public read, owner-scoped write to
--   <uid>/avatar
--
-- The self-elevation guard closes the parked V1 escalation hole (slice-5
-- reviewer finding; task-state.md decisions log 2026-09-09): 0001's
-- self-only UPDATE policy plus 0008's moderators column let ANY
-- authenticated user set their own moderators = true via direct API. A
-- BEFORE UPDATE trigger (0010 is the pattern: guard function +
-- DROP TRIGGER IF EXISTS / CREATE) locks moderators / banned_at to
-- moderators — a non-moderator's UPDATE touching either column is
-- rejected at the DB level.
--
-- Idempotent + re-paste-safe (2026-09-04 house lesson: no
-- CREATE POLICY IF NOT EXISTS — every DDL below is DO-block guarded or
-- itself idempotent): columns via ALTER TABLE ... ADD COLUMN IF NOT EXISTS
-- inside DO blocks; the constraint, index, and policies in DO blocks; the
-- trigger function via CREATE OR REPLACE; the trigger via
-- DROP IF EXISTS + CREATE.

-- 1) profiles: avatar_url + bio (with the 500-char backstop the app also
-- enforces; a NULL bio never trips the check).
do $$
begin
  alter table public.profiles add column if not exists avatar_url text;
  alter table public.profiles add column if not exists bio text;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_bio_length_chk'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint "profiles_bio_length_chk" check (char_length(bio) <= 500);
  end if;
end
$$;

-- 2) kids: a profile's structured kid rows (first name + age ONLY — the
-- privacy pin; no full-name or gender column exists, so the app cannot
-- write one). Max 5 per profile is app-enforced (plan-v2 Interfaces), not
-- a DB constraint.
create table if not exists public.kids (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  first_name text not null,
  age integer not null
);

alter table public.kids enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'kids'
      and indexname = 'kids_profile_id_idx'
  ) then
    create index "kids_profile_id_idx" on public.kids (profile_id);
  end if;
end
$$;

-- Kids ride the public profile surface (/u/:handle, the detail host —
-- first name + age only): any authenticated user can read them. Writes are
-- owner-only (a family manages its own kids; RLS is the wall).
--
-- SUPERSEDED BY 0040 (V9 ticket 10) — this wide SELECT policy no longer
-- describes the live posture and must NOT be re-created: 0040 replaced it with
-- kids_select_own_host_pinger_mod (own family / host / pinger / moderator).
-- Re-running this DO block would OR the wide policy back on and quietly
-- re-open every family's kid rows.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'kids'
      and policyname = 'kids_select_authenticated'
  ) then
    create policy "kids_select_authenticated"
      on public.kids for select
      to authenticated
      using (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'kids'
      and policyname = 'kids_insert_own'
  ) then
    create policy "kids_insert_own"
      on public.kids for insert
      to authenticated
      with check (profile_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'kids'
      and policyname = 'kids_update_own'
  ) then
    create policy "kids_update_own"
      on public.kids for update
      to authenticated
      using (profile_id = auth.uid())
      with check (profile_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'kids'
      and policyname = 'kids_delete_own'
  ) then
    create policy "kids_delete_own"
      on public.kids for delete
      to authenticated
      using (profile_id = auth.uid());
  end if;
end
$$;

-- 3) The 'avatars' storage bucket: public read (the public flag serves the
-- public URL endpoint; the read policy below covers the storage API) and
-- owner-scoped write — every object path is <auth.uid()>/avatar, so a user
-- can never write into another user's folder (plan-v2 reviewer audit:
-- no cross-user writes).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update
set name = excluded.name, public = excluded.public;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'avatars_public_read'
  ) then
    create policy "avatars_public_read"
      on storage.objects for select
      using (bucket_id = 'avatars');
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'avatars_owner_insert'
  ) then
    create policy "avatars_owner_insert"
      on storage.objects for insert
      to authenticated
      with check (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'avatars_owner_update'
  ) then
    create policy "avatars_owner_update"
      on storage.objects for update
      to authenticated
      using (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      )
      with check (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'avatars_owner_delete'
  ) then
    create policy "avatars_owner_delete"
      on storage.objects for delete
      to authenticated
      using (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end
$$;

-- 4) The self-elevation guard (the parked V1 escalation hole): a
-- non-moderator cannot set moderators / banned_at on any profiles row via
-- direct API. The actor's moderator flag is read from the actor's own row
-- (the open-to-authenticated profiles SELECT policy makes that read safe
-- under RLS). Moderators pass through — 0009's moderator UPDATE policies
-- remain the grant. A non-moderator's own-row updates (display_name, bio,
-- avatar_url) are untouched by the guard (neither locked column changes).
-- Non-JWT roles (postgres, service_role — dashboard SQL, the CDP runner)
-- have auth.uid() IS NULL and pass through: the pinned scope is
-- moderators/postgres, so the DB operators keep the ban path.
create or replace function public.profiles_self_elevation_guard()
returns trigger
language plpgsql
as $$
declare
  actor_is_moderator boolean;
begin
  if auth.uid() is null then
    return new;
  end if;

  select p.moderators
    into actor_is_moderator
    from public.profiles p
   where p.id = auth.uid();

  if coalesce(actor_is_moderator, false) then
    return new;
  end if;

  if new.moderators is distinct from old.moderators and new.moderators is true then
    raise exception 'only moderators can grant moderator status';
  end if;
  if new.banned_at is distinct from old.banned_at then
    raise exception 'only moderators can set or clear banned_at';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_self_elevation_guard on public.profiles;

create trigger profiles_self_elevation_guard
  before update
  on public.profiles
  for each row
  execute function public.profiles_self_elevation_guard();
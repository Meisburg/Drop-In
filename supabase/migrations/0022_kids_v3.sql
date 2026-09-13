-- V3 slice 6 (ticket 09): kids v3 — the "kids you're bringing" picker,
-- per-kid photos, and conversation starters (kids.likes,
-- profiles.interests).
--
-- ===========================================================================
-- SUPERSEDED IN PART BY 0040 — DO NOT RE-PASTE THE POLICY SECTION OF THIS
-- FILE (V9 ticket 10, review cycle 1, F4). This file's DO blocks recreate
-- `playdate_kids_select_authenticated` (`using (true)` for authenticated) and
-- `playdate_kids_insert_host` (host-only, no ownership check on kid_id) from
-- NAME-BASED existence guards. 0040 replaces both with the kid-name gate
-- (`playdate_kids_select_host_pinger_mod`) and with an INSERT that also
-- requires the kid to be the caller's own. Re-pasting this file after 0040
-- therefore finds neither old policy present, recreates BOTH, and — because
-- policies of the same command are ORed — SILENTLY RE-OPENS the table, with no
-- error and no warning. The schema changes this file owns (the table, the
-- index, and the kids.avatar_url / kids.likes / profiles.interests columns)
-- are `if not exists` and safe to re-run; the two policies are not. 0040 is
-- the file that owns them now.
-- ===========================================================================
--
-- Pinned decisions (plan-v3.md slice 6, ticket 09):
-- (a) playdate_kids: the host's per-post selection of their own kids
--     (id, playdate_id FK ON DELETE CASCADE, kid_id FK ON DELETE
--     CASCADE, unique pair). The /new picker's delete-then-insert
--     (replace-on-duplicate — the duplicate flow re-posts with a fresh
--     playdate row, so each post carries its own selection) lands here;
--     the detail page's "Kids coming" line reads it (names + ages only —
--     NO photos on the event line; the kid-photo pin: photos render
--     only in the profile kids list).
-- (b) kids.avatar_url (text, nullable) + kids.likes (text, nullable,
--     <=100 UI pin, NO DB CHECK) + profiles.interests (text, nullable,
--     <=200 UI pin, NO DB CHECK). The 0021 column-add lesson: NO RLS
--     change — the new columns ride the EXISTING SELECT posture (kids:
--     0011's open-to-authenticated select + owner-only writes; profiles:
--     the existing UPDATE policies), so no new 42501 surface. The caps
--     are app-enforced (the UI wall) — no DB CHECK, the 0021 address
--     lesson.
-- (c) THE AVATARS-BUCKET KID-PATH POLICY CHECK (ticket 09's AC + the
--     reviewer's pre-apply audit of the human-approved kid-photo pin
--     override): NO NEW POLICY. 0011's avatars_owner_insert /
--     avatars_owner_update / avatars_owner_delete key on
--     (storage.foldername(name))[1] = auth.uid()::text — the path's
--     FIRST folder must be the caller's own user id. The kid photo path
--     <uid>/kids/<kidId> (db.ts uploadKidPhoto) puts the caller's uid in
--     first position, so the EXISTING owner-scoped write policies
--     ALREADY cover it: a cross-user write (<victim-uid>/kids/<kid>) is
--     rejected by the same first-folder check, exactly as
--     <victim-uid>/avatar was. The live-check probe (the storage.policy
--     listing) confirms the covering policy is present; this header is
--     the audit record.
--
-- Idempotent + re-paste-safe (2026-09-04 house lesson: no CREATE POLICY
-- IF NOT EXISTS — the table + columns are IF NOT EXISTS / ADD COLUMN IF
-- NOT EXISTS inside DO blocks; every policy + index is DO-block
-- guarded; 0007/0011/0020/0021 use the same structure).

-- 1) The per-post kids selection (the 0007 going_pings unique-pair
--    shape, + the 0022 pinned id column).
create table if not exists public.playdate_kids (
  id uuid primary key default gen_random_uuid(),
  playdate_id uuid not null references public.playdates (id) on delete cascade,
  kid_id uuid not null references public.kids (id) on delete cascade,
  unique (playdate_id, kid_id)
);

alter table public.playdate_kids enable row level security;

-- The detail page's line fetch is per playdate_id (listPlaydateKidNames).
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'playdate_kids'
      and indexname = 'playdate_kids_playdate_id_idx'
  ) then
    create index "playdate_kids_playdate_id_idx" on public.playdate_kids (playdate_id);
  end if;
end
$$;

-- RLS (pinned privacy rules in plan-v3 slice 6):
-- - SELECT: any authenticated user — the "Kids coming" line is a
--   signed-in detail surface, and the names + ages are the public-
--   profile-surface class (the 0011 kids open-to-authenticated select,
--   first name + age only).
-- - INSERT/DELETE: host-scoped — only the post's host manages its own
--   selection (the 0005 host-scoped pattern: the playdates join on
--   host_profile_id = auth.uid()). A non-host write is a silent RLS
--   no-op (0 rows, 2xx — the 0014 lesson); the UI offers the picker to
--   the host only, the RLS is the wall.
--
-- SUPERSEDED BY 0040 (V9 ticket 10) — NEITHER of the two policies below
-- describes the live posture any more, and re-creating them would OR them back
-- on with no warning:
--   * SELECT is 0040's playdate_kids_select_host_pinger_mod (host / pinger /
--     own kid / moderator), not `using (true)`;
--   * INSERT is 0040's re-created playdate_kids_insert_host, which additionally
--     requires the attached kid to be the CALLER'S OWN (kid_owned_by_caller) —
--     without that clause a host could attach someone else's child to their own
--     post and read that child's whole row, which is exactly the bypass review
--     cycle 1 found (F2).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'playdate_kids'
      and policyname = 'playdate_kids_select_authenticated'
  ) then
    create policy "playdate_kids_select_authenticated"
      on public.playdate_kids for select
      to authenticated
      using (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'playdate_kids'
      and policyname = 'playdate_kids_insert_host'
  ) then
    create policy "playdate_kids_insert_host"
      on public.playdate_kids for insert
      to authenticated
      with check (
        exists (
          select 1 from public.playdates p
          where p.id = playdate_id
            and p.host_profile_id = auth.uid()
        )
      );
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'playdate_kids'
      and policyname = 'playdate_kids_delete_host'
  ) then
    create policy "playdate_kids_delete_host"
      on public.playdate_kids for delete
      to authenticated
      using (
        exists (
          select 1 from public.playdates p
          where p.id = playdate_id
            and p.host_profile_id = auth.uid()
        )
      );
  end if;
end
$$;

-- 2) The 0022 columns (0020/0021's DO-block house structure; the
--    <=100 / <=200 caps are UI pins only — no DB CHECK, the 0021
--    address lesson). The kids UPDATE rides 0011's kids_update_own
--    (owner-only) and the profiles UPDATE rides the existing posture —
--    no policy DDL here (decision (b)).
do $$
begin
  alter table public.kids add column if not exists avatar_url text;
  alter table public.kids add column if not exists likes text;
  alter table public.profiles add column if not exists interests text;
end
$$;

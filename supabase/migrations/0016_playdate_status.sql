-- V3 slice 2 (ticket 02): host status — playdates.status ('on' /
-- 'rained_out' / 'cancelled'). A host marks a drop-in rained out or
-- cancelled (the "This is your post" panel on the detail page); the card +
-- detail render a muted state, and the event STAYS in the feed (the host
-- can revert; no auto-expiry — the DB never filters on status).
--
-- Pinned decisions (plan-v3.md Interfaces, ticket 02):
-- (a) status is an AUTHENTICATED-ONLY surface: 0015's get_public_playdate
--     is UNCHANGED and still returns exactly its 11 public fields — a
--     signed-out visitor never sees "Rained out" / "Cancelled" (the
--     public-surface pin holds; widening it is a founder call, not this
--     migration).
-- (b) host-only writes are enforced by the EXISTING RLS
--     `playdates_update_host` (0005: using/with check
--     host_profile_id = auth.uid()) — no new policy in this migration.
--     A non-host API write is a silent 0-row 2xx (the 0014/PostgREST
--     lesson logged in task-state.md), so the client hides the status
--     control from non-hosts; the DB wall is the backstop.
-- (c) the 0014 RLS lesson: NO SELECT-policy change in this migration. The
--     column rides the existing playdates SELECT posture (authenticated:
--     using (true); anon: 0015's hidden-aware playdates_select_anon);
--     both are column-agnostic, so a status UPDATE re-checks only what
--     the existing policies already permit (no 42501 surface — the 42501
--     class is the 0009 any-column moderator UPDATE, unchanged here).
--
-- Idempotent + re-paste-safe (2026-09-04 house lesson: Postgres has no
-- CREATE POLICY / guardless-idiom IF NOT EXISTS — the column add is
-- ADD COLUMN IF NOT EXISTS inside a DO block, the constraint is
-- pg_constraint-guarded, mirroring 0009/0011). The CHECK is the DB
-- backstop for the app's three-option control (the UI only ever writes
-- the three values).

do $$
begin
  alter table public.playdates add column if not exists status text not null default 'on';
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
      add constraint "playdates_status_chk" check (status in ('on', 'rained_out', 'cancelled'));
  end if;
end
$$;
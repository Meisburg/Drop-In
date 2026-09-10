-- V3 slice 4 (ticket 07): going_pings.created_at — when the ping was set.
--
-- 0007's going_pings table (playdate_id, profile_id, unique pair) has no
-- created_at — this migration adds it (timestamptz NOT NULL DEFAULT
-- now()):
-- - ticket 07 (V3 slice 4): the card's going line orders the pinger
--   circles by the ping's created_at (listPingsForPostsWithClient's
--   .order('created_at'));
-- - ticket 04 (the "new activity" retention banner) and the 0025
--   guest-list RPC both key off the ping timestamp too.
-- Existing rows backfill to now() (the ADD COLUMN default applies to
-- existing rows): pre-0020 pings all get "now" — their relative order is
-- arbitrary, which is fine, they predate the column.
--
-- Pinned decisions:
-- (a) assumes 0007 (the table) is applied first — the live project is
--     past 0007.
-- (b) NO RLS change (the 0007 pin holds): the SELECT policy
--     going_pings_select_authenticated is `to authenticated using (true)`
--     — column-agnostic, so the new column rides the existing posture
--     (the 0014/0016 lesson: no new 42501 surface; anon has no
--     going_pings read at all). The INSERT/DELETE policies are
--     untouched.
--
-- Idempotent + re-paste-safe (the 0016 house structure): the column add
-- is ADD COLUMN IF NOT EXISTS inside a DO block (Postgres has no bare
-- IF NOT EXISTS idiom outside this guard — 2026-09-04 house lesson).

do $$
begin
  alter table public.going_pings add column if not exists created_at timestamptz not null default now();
end
$$;
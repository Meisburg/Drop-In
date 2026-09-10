-- V3 slice 3 (ticket 06): the status trim — "Rained out" is gone.
--
-- Feedback decision (feedback/v3.md #5, origin-user pass 2026-09-09 —
-- "go 1" green light): the "Rained out" host-status option is REMOVED as
-- redundant with Cancelled. The host's control narrows to On / Cancelled;
-- the app type union narrows to 'on' | 'cancelled'; the muted card/detail
-- state renders for "Cancelled" only. The Open-Meteo "Rain likely" badge
-- (V3 slice 2, the host zip's daily rain probability) is an INDEPENDENT
-- forecast, not a status state — it stays, untouched by this migration.
-- Existing 'rained_out' rows convert to 'on' (the event is back on — the
-- host can re-mark it Cancelled if it is actually off).
--
-- Pinned decisions:
-- (a) assumes 0016 (the status column + playdates_status_chk constraint)
--     is applied first — the live project is past 0016 (applied via the
--     dashboard SQL API fallback, 2026-09-09); this migration only
--     re-trims the CHECK + converts rows, it adds no column.
-- (b) the conversion runs BEFORE the CHECK narrows: a new CHECK
--     constraint validates existing rows, so the 'rained_out' rows must
--     already be 'on' by the time the tightened constraint exists.
-- (c) RLS is UNCHANGED (the 0016 pin holds): host-only writes still ride
--     the existing playdates_update_host policy; no SELECT-policy change,
--     the 0014 lesson (no 42501 surface). 0015's public surface is
--     untouched (the 11-field pin holds).
--
-- Idempotent + re-paste-safe (the 0016 structure): the drop is
-- pg_constraint-guarded, the add is pg_constraint-guarded. First-time
-- apply on a 0016 project: convert rows → drop the 3-value CHECK → add
-- the 2-value CHECK. A re-paste: the UPDATE is a no-op, the drop removes
-- the 2-value CHECK, the add recreates it.

update public.playdates set status = 'on' where status = 'rained_out';

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'playdates_status_chk'
      and conrelid = 'public.playdates'::regclass
  ) then
    alter table public.playdates drop constraint "playdates_status_chk";
  end if;
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
      add constraint "playdates_status_chk" check (status in ('on', 'cancelled'));
  end if;
end
$$;
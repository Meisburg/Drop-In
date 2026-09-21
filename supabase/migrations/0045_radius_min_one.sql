-- ===========================================================================
-- V16 t07 item 3 (migration 0045): the radius floor drops from 2 to 1 mile.
-- ===========================================================================
--
-- What this does: ONE thing — it widens `profiles_radius_miles_chk` from
-- `radius_miles between 2 and 35` to `radius_miles between 1 and 35`. No column
-- is added, no data is touched, no policy changes. It is a constraint-only
-- migration, and it is a LIVE-DATABASE migration (the project it applies to
-- holds real family data), so it is strictly additive and re-paste-safe.
--
-- Why: the founder's ask (V16 t07 item 3, founder decision Q1) was a "Within
-- 1 mile" distance option — they want to zoom in close, not just wide. The app
-- side of that lives in TWO constants in src/lib/feed.ts — `RADIUS_MIN_MILES`
-- (feeds `validateRadiusMiles`, so without it the UI would offer "Within 1 mile"
-- and then REJECT it at save time) and `RADIUS_MILES_OPTIONS`. Those two and
-- this file must agree; a migration that disagrees with the UI constants is the
-- defect class this comment exists to prevent. If any of the three changes, all
-- three change.
--
-- NO EXISTING ROW CAN BE INVALIDATED. The new range is strictly WIDER than the
-- old one — [1,35] ⊇ [2,35] — so every value the old CHECK admitted the new one
-- admits too. A constraint WIDEN cannot fail validation on existing data (unlike
-- a tighten, which would need a row audit first). No row conversion, no
-- backfill.
--
-- ONE HONEST CAVEAT (raised in review): `add constraint` validates existing rows
-- and takes a SHARE lock on `profiles` for the duration of that scan, so
-- concurrent writes to that table are briefly blocked. At family scale the scan
-- is trivial and the block is milliseconds — but "no down-time concern" would
-- overstate the guarantee, so it is stated precisely instead.
--
-- Idempotent + re-paste-safe (house pattern, 2026-09-04 lesson; 0012 / 0040 /
-- 0041 / 0044 precedents): a WIDEN cannot use 0012's guard-and-add shape
-- alone — `add constraint` will NOT replace a constraint that already exists
-- (it errors 42710), so re-pasting 0012's block verbatim would fail on the
-- second run. The shape below is therefore DROP-then-ADD: an unconditional
-- `drop constraint if exists` (which is itself a no-op when absent) followed by
-- the DO-block-guarded add, exactly as 0012 guards it. Run once or a hundred
-- times, the table ends in the same state: the 1–35 check, and nothing else.
--
-- Apply order: ASSUMES 0012 IS APPLIED (the live project is well past it — the
-- last applied migration is 0044). Section 1 drops the constraint 0012 added at
-- 0012_zip_radius.sql:668-679; if 0012 had somehow never applied, the drop
-- no-ops and the add installs the constraint fresh. Either way this file
-- converges.

-- ---------------------------------------------------------------------------
-- 1. The radius CHECK: 2–35 becomes 1–35.
--
--    The drop is UNCONDITIONAL (with `if exists`): it must run on every
--    application so a re-paste replaces the old 2-mile floor rather than
--    tripping over it. The add then carries 0012's guard so the common case
--    (constraint just dropped) still reads as the house idempotent pattern.
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists "profiles_radius_miles_chk";

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_radius_miles_chk'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint "profiles_radius_miles_chk" check (radius_miles between 1 and 35);
  end if;
end
$$;

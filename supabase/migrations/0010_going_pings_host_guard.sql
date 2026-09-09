-- Slice 5: DB-level guard for the host self-ping on going_pings.
--
-- 0007's header documents the "host cannot ping own post" guard as
-- client-side only (planPing in src/lib/trust.ts no-ops the host's own
-- toggle; a direct API INSERT of a host's ping still succeeds). Human
-- decision 2026-09-09 (task-state.md): close that gap at the DB level in
-- this slice. (Same migration era as 0008, which owns the
-- profiles.moderators column that 0009's mod tools build on — no schema
-- overlap here: going_pings is 0007's table.)
--
-- A CHECK constraint cannot span tables (the guard needs the playdates
-- row's host_profile_id), so the guard is a BEFORE INSERT trigger
-- function. Idempotent + re-paste-safe: CREATE OR REPLACE FUNCTION is
-- itself idempotent, and the trigger uses DROP TRIGGER IF EXISTS +
-- CREATE (Postgres has no CREATE TRIGGER IF NOT EXISTS).

create or replace function public.going_pings_host_guard()
returns trigger
language plpgsql
as $$
begin
  if new.profile_id = (
    select host_profile_id from public.playdates where id = new.playdate_id
  ) then
    raise exception 'hosts cannot ping their own post';
  end if;
  return new;
end;
$$;

drop trigger if exists going_pings_host_guard on public.going_pings;

create trigger going_pings_host_guard
  before insert
  on public.going_pings
  for each row
  execute function public.going_pings_host_guard();
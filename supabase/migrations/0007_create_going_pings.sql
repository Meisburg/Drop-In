-- Slice 4: going_pings — the optional "we're going" ping (pinned data model
-- in plan.md Interfaces: playdate_id, profile_id, unique pair). Counts are
-- shown only — the UI never lists per-person attendees.
--
-- Idempotent + re-paste-safe: IF NOT EXISTS on the table; every policy is
-- created inside a DO block (Postgres has no CREATE POLICY IF NOT EXISTS —
-- see the logged LESSON in task-state.md; 0005/0006 use the same pattern).

create table if not exists public.going_pings (
  playdate_id uuid not null references public.playdates (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  primary key (playdate_id, profile_id)
);

alter table public.going_pings enable row level security;

-- RLS (pinned privacy rules in plan.md Interfaces):
-- - SELECT: any authenticated user — the count is a friendly, public-ish
--   number, and no attendee list is ever exposed.
-- - INSERT: only as yourself (profile_id = auth.uid()). The
--   "host cannot ping own post" guard lives in the client (the db.ts
--   toggle fetches the post's host first and no-ops); a DB-level guard
--   would need a playdates lookup in the check and is intentionally skipped
--   to keep the policy simple.
-- - DELETE: own pings only.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'going_pings'
      and policyname = 'going_pings_select_authenticated'
  ) then
    create policy "going_pings_select_authenticated"
      on public.going_pings for select
      to authenticated
      using (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'going_pings'
      and policyname = 'going_pings_insert_own'
  ) then
    create policy "going_pings_insert_own"
      on public.going_pings for insert
      to authenticated
      with check (profile_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'going_pings'
      and policyname = 'going_pings_delete_own'
  ) then
    create policy "going_pings_delete_own"
      on public.going_pings for delete
      to authenticated
      using (profile_id = auth.uid());
  end if;
end
$$;
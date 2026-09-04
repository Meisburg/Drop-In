-- Slice 3: playdates — drop-in posts (pinned data model in plan.md
-- Interfaces: id, host_profile_id, title, place, neighborhood_id,
-- starts_at, ends_at, age_hint (nullable), details (nullable)).
-- host_profile_id = the posting parent's profiles row (auth user id).
--
-- Idempotent + re-paste-safe: IF NOT EXISTS on the table; the index and
-- every policy are created inside DO blocks (Postgres has no
-- CREATE POLICY / guardless-idiom IF NOT EXISTS — see the logged LESSON
-- in task-state.md; 0002/0003/0004 use the same pattern).

create table if not exists public.playdates (
  id uuid primary key default gen_random_uuid(),
  host_profile_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  place text not null,
  neighborhood_id uuid not null references public.neighborhoods (id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  age_hint text,
  details text,
  created_at timestamptz not null default now()
);

alter table public.playdates enable row level security;

-- Feed/browse queries scan by neighborhood + time range.
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'playdates'
      and indexname = 'playdates_neighborhood_starts_at_idx'
  ) then
    create index "playdates_neighborhood_starts_at_idx"
      on public.playdates (neighborhood_id, starts_at);
  end if;
end
$$;

-- RLS (pinned privacy rules in plan.md Interfaces):
-- - SELECT: any authenticated user can read drop-ins. Block filtering is a
--   DB-level filter in the feed query (see listTodayFeed / blocks table),
--   not a policy — a blocked user's posts stay *invisible*, not forbidden.
-- - INSERT: a user posts only as themselves (host_profile_id = auth.uid()).
-- - UPDATE/DELETE: the host only (capability for later slices — no
--   edit/delete UI until slice 4+).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'playdates'
      and policyname = 'playdates_select_authenticated'
  ) then
    create policy "playdates_select_authenticated"
      on public.playdates for select
      to authenticated
      using (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'playdates'
      and policyname = 'playdates_insert_own_host'
  ) then
    create policy "playdates_insert_own_host"
      on public.playdates for insert
      to authenticated
      with check (host_profile_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'playdates'
      and policyname = 'playdates_update_host'
  ) then
    create policy "playdates_update_host"
      on public.playdates for update
      to authenticated
      using (host_profile_id = auth.uid())
      with check (host_profile_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'playdates'
      and policyname = 'playdates_delete_host'
  ) then
    create policy "playdates_delete_host"
      on public.playdates for delete
      to authenticated
      using (host_profile_id = auth.uid());
  end if;
end
$$;
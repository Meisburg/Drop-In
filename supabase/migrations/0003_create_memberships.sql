-- Slice 2: memberships — which neighborhoods each profile follows.
-- The (profile_id, neighborhood_id) pair is unique (primary key), per the
-- pinned data model in plan.md Interfaces.
--
-- Idempotent + re-paste-safe: IF NOT EXISTS on table; policy creation is
-- wrapped in a DO block (Postgres has no CREATE POLICY IF NOT EXISTS).

create table if not exists public.memberships (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  neighborhood_id uuid not null references public.neighborhoods (id) on delete cascade,
  primary key (profile_id, neighborhood_id)
);

alter table public.memberships enable row level security;

-- A user manages only their own memberships (no update policy: changes are
-- delete + insert).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'memberships'
      and policyname = 'memberships_select_own'
  ) then
    create policy "memberships_select_own"
      on public.memberships for select
      to authenticated
      using (profile_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'memberships'
      and policyname = 'memberships_insert_own'
  ) then
    create policy "memberships_insert_own"
      on public.memberships for insert
      to authenticated
      with check (profile_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'memberships'
      and policyname = 'memberships_delete_own'
  ) then
    create policy "memberships_delete_own"
      on public.memberships for delete
      to authenticated
      using (profile_id = auth.uid());
  end if;
end
$$;
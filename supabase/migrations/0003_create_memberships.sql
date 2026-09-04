-- Slice 2: memberships — which neighborhoods each profile follows.
-- The (profile_id, neighborhood_id) pair is unique (primary key), per the
-- pinned data model in plan.md Interfaces.
--
-- Idempotent + re-paste-safe: IF NOT EXISTS on table/policies.

create table if not exists public.memberships (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  neighborhood_id uuid not null references public.neighborhoods (id) on delete cascade,
  primary key (profile_id, neighborhood_id)
);

alter table public.memberships enable row level security;

-- A user manages only their own memberships (no update policy: changes are
-- delete + insert).
create policy if not exists "memberships_select_own"
  on public.memberships for select
  to authenticated
  using (profile_id = auth.uid());

create policy if not exists "memberships_insert_own"
  on public.memberships for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy if not exists "memberships_delete_own"
  on public.memberships for delete
  to authenticated
  using (profile_id = auth.uid());
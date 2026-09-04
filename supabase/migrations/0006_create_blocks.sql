-- Slice 3: blocks — "blocked users never see each other's posts"
-- (pinned data model in plan.md Interfaces: blocker_profile_id,
-- blocked_profile_id, unique pair). The table moved forward from slice 4
-- because slice 3's feed AC needs the DB-level block filter; the
-- block/unblock UI stays in slice 4.
--
-- Idempotent + re-paste-safe: IF NOT EXISTS on the table; policy creation
-- is wrapped in a DO block (Postgres has no CREATE POLICY IF NOT EXISTS —
-- see the logged LESSON in task-state.md; 0002/0003/0004 use the same
-- pattern).

create table if not exists public.blocks (
  blocker_profile_id uuid not null references public.profiles (id) on delete cascade,
  blocked_profile_id uuid not null references public.profiles (id) on delete cascade,
  primary key (blocker_profile_id, blocked_profile_id)
);

alter table public.blocks enable row level security;

-- A user manages only their own blocks (blocker = the auth user): they can
-- read, add, and remove their own rows, and nothing else.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'blocks'
      and policyname = 'blocks_select_own'
  ) then
    create policy "blocks_select_own"
      on public.blocks for select
      to authenticated
      using (blocker_profile_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'blocks'
      and policyname = 'blocks_insert_own'
  ) then
    create policy "blocks_insert_own"
      on public.blocks for insert
      to authenticated
      with check (blocker_profile_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'blocks'
      and policyname = 'blocks_delete_own'
  ) then
    create policy "blocks_delete_own"
      on public.blocks for delete
      to authenticated
      using (blocker_profile_id = auth.uid());
  end if;
end
$$;
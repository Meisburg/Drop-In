-- Slice 1: profiles table (pinned data model from plan.md Interfaces).
-- id = Supabase auth user id; display_name is the persistent public handle.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Authenticated users can read every profile (display_name is a public handle).
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

-- A user inserts only their own row (signup creates the caller's profile).
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- A user updates only their own row.
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
-- Slice 2: neighborhoods — seeded list of real Seattle neighborhoods
-- (pinned data model in plan.md Interfaces: id, name; read-only in V1).
--
-- Idempotent + re-paste-safe: the seed uses ON CONFLICT, and policies use
-- IF NOT EXISTS (Postgres 13+, available on Supabase).

create table if not exists public.neighborhoods (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

-- Well-known Seattle neighborhoods (deduplicated; no two entries cover the
-- same area). The human sanity-checks this list at slice 2 review.
insert into public.neighborhoods (name)
values
  ('Ballard'),
  ('Belltown'),
  ('Capitol Hill'),
  ('Central District'),
  ('Columbia City'),
  ('Denny-Blaine'),
  ('Fremont'),
  ('Green Lake'),
  ('Greenwood'),
  ('Laurelhurst'),
  ('Magnolia'),
  ('Madison Park'),
  ('Montlake'),
  ('Othello'),
  ('Queen Anne'),
  ('Ravenna'),
  ('Seward Park'),
  ('South Lake Union'),
  ('Wallingford'),
  ('West Seattle')
on conflict (name) do nothing;

alter table public.neighborhoods enable row level security;

-- Authenticated users can read the list; that is the only policy
-- (read-only in V1 — no insert/update/delete).
create policy if not exists "neighborhoods_select_authenticated"
  on public.neighborhoods for select
  to authenticated
  using (true);
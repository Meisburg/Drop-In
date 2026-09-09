-- Slice 4: reports — the report flow on every post + profile (pinned data
-- model in plan.md Interfaces: id, reporter_profile_id, playdate_id
-- (nullable), reported_profile_id (nullable), reason, created_at). Reports
-- are visible to moderators only; the /mod tools land in slice 5.
--
-- Idempotent + re-paste-safe: IF NOT EXISTS on the table and the
-- profiles.moderators column; every policy is created inside a DO block
-- (Postgres has no CREATE POLICY IF NOT EXISTS — see the logged LESSON in
-- task-state.md; 0005/0006 use the same pattern).
--
-- The reports SELECT policy (moderators only) needs the profiles
-- `moderators` flag, which slice 5 has not added yet — so this migration
-- adds the column now. ALTER TABLE ... ADD COLUMN IF NOT EXISTS is valid,
-- idempotent Postgres (unlike CREATE POLICY — only that DDL lacks IF NOT
-- EXISTS). Slice 5's documented one-time founder flag just updates this
-- column; it is NOT NULL DEFAULT false, so no backfill.

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_profile_id uuid not null references public.profiles (id) on delete cascade,
  -- A report on a deleted post / deleted profile survives (moderation
  -- evidence) with the reference nulled — both columns are nullable by the
  -- pinned model, so SET NULL keeps the row instead of CASCADE deleting it.
  playdate_id uuid references public.playdates (id) on delete set null,
  reported_profile_id uuid references public.profiles (id) on delete set null,
  reason text not null,
  created_at timestamptz not null default now()
);

alter table public.reports enable row level security;

-- See the header comment: the SELECT policy below reads this column, and it
-- does not exist yet (slice 5 owns the mod tools, not the column).
do $$
begin
  alter table public.profiles add column if not exists moderators boolean not null default false;
end
$$;

-- RLS (pinned privacy rules in plan.md Interfaces):
-- - INSERT: any authenticated user can file a report, only as themselves.
-- - SELECT: moderators only (the profiles.moderators flag, added above).
--   Non-moderators — including the reporter — never read reports back.
-- - UPDATE/DELETE: V1-minimum, moderators-only (no self-service edits or
--   deletes of reports; slice 5's mod tools may build on this, e.g.
--   marking a report resolved).

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'reports'
      and policyname = 'reports_insert_own_reporter'
  ) then
    create policy "reports_insert_own_reporter"
      on public.reports for insert
      to authenticated
      with check (reporter_profile_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'reports'
      and policyname = 'reports_select_moderators'
  ) then
    create policy "reports_select_moderators"
      on public.reports for select
      to authenticated
      using (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.moderators
        )
      );
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'reports'
      and policyname = 'reports_update_moderators'
  ) then
    create policy "reports_update_moderators"
      on public.reports for update
      to authenticated
      using (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.moderators
        )
      )
      with check (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.moderators
        )
      );
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'reports'
      and policyname = 'reports_delete_moderators'
  ) then
    create policy "reports_delete_moderators"
      on public.reports for delete
      to authenticated
      using (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.moderators
        )
      );
  end if;
end
$$;
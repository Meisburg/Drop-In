-- V2 slice 4 fix (ticket 04): the moderator comment-hide path (42501).
--
-- Root cause (live-proven, lv8 check probe 16): 0013's SELECT policy
-- comments_select_authenticated is USING (hidden_at is null). Postgres
-- ALSO evaluates a table's SELECT-policy USING clause against the NEW row
-- of an UPDATE — so when the moderator UPDATE (0013's
-- comments_update_moderators) sets hidden_at to non-null, the new row
-- violates the SELECT policy -> 42501 "new row violates row-level
-- security policy". Evidence: a no-op UPDATE (body = body) succeeds
-- while setting hidden_at errors; 0009's playdates hide works because
-- its SELECT policy qual does not block the new row.
--
-- Fix: widen the SELECT policy with the moderator branch — hidden
-- comments stay invisible to non-moderators (the original filter) and
-- become readable by moderators (the EXISTS over the actor's own
-- profiles row, the 0008/0013 moderator subquery shape). The UPDATE's
-- new row is admitted by the moderator branch, so the hide path works.
--
-- Numbering note (plan-v2 Interfaces): 0014 was reserved for slice 5's
-- anon-read migration; THIS fix takes 0014. Slice 5 will be renumbered
-- to 0015 at its dispatch.
--
-- Idempotent + re-paste-safe (2026-09-04 house lesson: no CREATE POLICY
-- IF NOT EXISTS — the recreate is DO-block guarded; DROP POLICY IF
-- EXISTS is itself re-runnable).
--
-- The 0013 UPDATE policy (comments_update_moderators) is left UNTOUCHED:
-- its USING and WITH CHECK are both the moderator subquery (exists
-- (select 1 from public.profiles p where p.id = auth.uid() and
-- p.moderators)) — row-independent (no reference to the new row's
-- columns), so it cannot block the new row. The 42501 came solely from
-- the SELECT policy's USING.

drop policy if exists "comments_select_authenticated" on public.comments;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'comments'
      and policyname = 'comments_select_authenticated'
  ) then
    create policy "comments_select_authenticated"
      on public.comments for select
      to authenticated
      using (
        hidden_at is null
        or exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.moderators
        )
      );
  end if;
end
$$;
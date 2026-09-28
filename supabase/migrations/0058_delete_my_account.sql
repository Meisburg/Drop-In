-- ===========================================================================
-- (migration 0058): the parent's OWN delete-account call — delete_my_account().
-- ===========================================================================
--
-- WHAT THIS ADDS: ONE SECURITY DEFINER function, callable by a signed-in parent,
-- that deletes the CALLER's `auth.users` row. Every table in this schema hangs
-- off `profiles.id`, and `profiles.id` references `auth.users(id)` ON DELETE
-- CASCADE (0001), so removing the auth row removes the profile and, through the
-- existing cascades, the family's posts, kids, pings, follows, blocks, comments
-- and reviews. No new table, no new column, no data touched by the migration
-- itself.
--
-- WHY (the ask): Settings promised an account surface and the app had no way to
-- leave. A parent who wants out should not have to email a stranger; the
-- Settings "Delete my account" control calls this function.
--
-- WHY SECURITY DEFINER, STATED PLAINLY: an authenticated parent cannot delete
-- from `auth.users` directly (that schema is not exposed and the role has no
-- grant). The function executes as its owner (the migration role), which can.
-- The CALLER is never a parameter — `auth.uid()` is read INSIDE the function, so
-- a parent can only ever delete themselves. There is no id for a caller to
-- forge.
--
-- FAIL CLOSED: an anonymous caller (`auth.uid()` is null) raises rather than
-- silently succeeding. EXECUTE is revoked from PUBLIC and from `anon`, and
-- granted only to `authenticated`.
--
-- Idempotent + re-paste-safe (the 2026-09-04 house lesson): `create or replace
-- function` is the guard — a second run replaces the body with no error and no
-- data change. The two GRANT statements are likewise re-runnable.
-- ASSUMES only 0001 (the profiles -> auth.users cascade), which the live project
-- is far past.
-- ===========================================================================

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'delete_my_account: not authenticated';
  end if;
  -- The auth row is the root: profiles cascades from it, and every family-owned
  -- table cascades from profiles. Deleting it here is the whole operation.
  delete from auth.users where id = caller;
end;
$$;

-- Only a signed-in parent may call it; the body then re-checks auth.uid().
-- The anon revoke is separate on purpose: Supabase's schema defaults grant
-- EXECUTE to `anon` EXPLICITLY, and `revoke ... from public` does not remove an
-- explicit role grant. Verified live 2026-09-27: after the PUBLIC revoke alone,
-- `has_function_privilege('anon', …, 'EXECUTE')` was still true.
revoke all on function public.delete_my_account() from public;
revoke all on function public.delete_my_account() from anon;
grant execute on function public.delete_my_account() to authenticated;

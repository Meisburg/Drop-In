-- ===========================================================================
-- V8 ticket 11 (migration 0034): EMAIL VERIFICATION — the trust gate, part 1.
-- ===========================================================================
--
-- WHAT THIS IS: the schema half of "verified email" — a mirrored
-- `profiles.email_confirmed_at` plus the backfill, so the value is readable by
-- the app (PostgREST cannot read the `auth` schema) without any new RLS
-- posture on `profiles`.
--
-- WHY IT SHIPS WITHOUT THE UI (the sequencing decision, 2026-09-13):
-- ticket 11's FIRST step is human-owned — Supabase Dashboard →
-- Authentication → Email → enable "Confirm email". Until that is on, Supabase
-- AUTO-CONFIRMS every signup, so `auth.users.email_confirmed_at` is set for
-- everybody within seconds of signup. A "Verified email" chip shipped now
-- would therefore mark EVERY account verified, including accounts whose owner
-- never opened an inbox — a trust claim that is worse than no badge at all,
-- on a live deployment parents can already use. So the column lands now (the
-- flip becomes a pure dashboard action, with no migration left to write) and
-- the visible chip lands with the toggle, per `docs/email-verification-setup.md`.
--
-- PINS:
--  (a) auth.users.email_confirmed_at is the SOURCE OF TRUTH. This column is a
--      READ MIRROR, written only by the trigger below — never by the app.
--  (b) The trigger function is SECURITY DEFINER with `search_path` pinned:
--      Supabase's signup path runs as an internal role that has no UPDATE
--      grant on public.profiles, so the mirror would silently fail without it.
--  (c) The trigger passes through when `auth.uid()` is null (the 0011 lesson:
--      a guard that must allow a server role must not test the JWT).
--  (d) NO RLS CHANGE. The column rides the existing `profiles` posture — the
--      0014/0016 column-add lesson. The value is read through the same reads
--      that already fetch a profile; it does NOT cross to the public signed-out
--      surface (get_public_playdate keeps its field count).
--  (e) The backfill is a plain UPDATE ... FROM auth.users, naturally
--      re-runnable, and a no-op row-wise once it has run.
--
-- Idempotent + re-paste safe (the 2026-09-04 house lesson): add column if not
-- exists; drop trigger if exists + create; create or replace the function.
-- ===========================================================================

alter table public.profiles
  add column if not exists email_confirmed_at timestamptz;

-- (e) Backfill: every already-confirmed account gets its mirror now, so the
-- chip (when it ships) is correct for existing parents from day one.
update public.profiles p
set email_confirmed_at = u.email_confirmed_at
from auth.users u
where u.id = p.id
  and u.email_confirmed_at is not null
  and p.email_confirmed_at is distinct from u.email_confirmed_at;

-- (b) + (c): the mirror writer. SECURITY DEFINER so the internal signup role
-- can write public.profiles; search_path pinned; no JWT is involved on this
-- path at all (it runs inside Supabase's own auth transaction), which is why
-- there is no auth.uid() branch to take — the function simply never consults
-- one, and it only ever writes the row whose id the auth row already names.
create or replace function public.mirror_email_confirmed_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.email_confirmed_at is distinct from old.email_confirmed_at then
    update public.profiles
    set email_confirmed_at = new.email_confirmed_at
    where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_mirror_email_confirmed_at on auth.users;

create trigger profiles_mirror_email_confirmed_at
  after update of email_confirmed_at on auth.users
  for each row
  execute function public.mirror_email_confirmed_at();

-- INSERT is covered too: a signup that is auto-confirmed (the current
-- deployment) writes the value on the very first row, and an unconfirmed
-- signup inserts NULL. Two triggers rather than one AFTER INSERT OR UPDATE
-- so the UPDATE path's `old` reference stays valid.
create or replace function public.mirror_email_confirmed_at_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.email_confirmed_at is not null then
    update public.profiles
    set email_confirmed_at = new.email_confirmed_at
    where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_mirror_email_confirmed_at_insert on auth.users;

create trigger profiles_mirror_email_confirmed_at_insert
  after insert on auth.users
  for each row
  execute function public.mirror_email_confirmed_at_on_insert();

-- The trigger functions are not part of the app's callable surface: only the
-- auth path invokes them. Nothing is granted to anon/authenticated, and the
-- defaults are revoked for tidiness.
revoke execute on function public.mirror_email_confirmed_at() from public;
revoke execute on function public.mirror_email_confirmed_at() from anon;
revoke execute on function public.mirror_email_confirmed_at() from authenticated;
revoke execute on function public.mirror_email_confirmed_at_on_insert() from public;
revoke execute on function public.mirror_email_confirmed_at_on_insert() from anon;
revoke execute on function public.mirror_email_confirmed_at_on_insert() from authenticated;

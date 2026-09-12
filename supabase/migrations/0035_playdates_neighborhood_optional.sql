-- V9 ticket 01: the NEIGHBOURHOOD stops being a question — a post may carry
-- none, and the signed-out RPC must still answer for such a post.
--
-- The product decision this migration serves, in the parent's words: "maybe
-- you just put in the address and not a neighborhood because people aren't
-- going to know that". Through V8 every post had to name a neighbourhood
-- (`playdates.neighborhood_id` was NOT NULL, 0005:16) and /new asked for it
-- with a REQUIRED select, so the one thing the form demanded was the one thing
-- a parent cannot answer. V9 ticket 01 moves the place picker to the top of
-- /new ("Where? — pick a place", with a visible Browse places affordance over
-- the 239 seeded places) and takes the neighbourhood question off the form
-- entirely. This migration is what makes that postable.
--
-- (a) THE NULLABLE COLUMN IS DELIBERATE, not a relaxation of an invariant we
--     forgot. The neighbourhood is genuinely UNKNOWN for most posts now: the
--     parent is never asked, and the place picker fills it only when the PLACE
--     carries one — which today is never (every one of 0029's seeded rows has
--     `neighborhood_id` null, as 0029's header says). So NULL means "we did not
--     ask", never "the answer was empty".
--
--     WHAT DOES NOT CHANGE:
--       * the FK stays `playdates_neighborhood_id_fkey ... ON DELETE RESTRICT`
--         (verified live before writing this file: conname
--         `playdates_neighborhood_id_fkey`, confdeltype 'r'). A neighbourhood
--         that a post DOES name can still not be deleted out from under it.
--       * NO RLS POLICY IS TOUCHED (the 0014/0016/0021 lesson). Every playdates
--         policy is column-agnostic — the authenticated whole-row SELECT
--         (0005: using (true)), 0015's hidden-aware anon policy, and the
--         host-only INSERT/UPDATE/DELETE — so a nullable column needs no policy
--         DDL and opens no new 42501 surface. This migration contains no
--         `create policy`/`alter policy`/`drop policy` statement at all.
--       * EXISTING ROWS KEEP THEIR VALUES. This is DROP NOT NULL: not one row
--         is read, written, or backfilled. Every pre-V9 post still names its
--         neighbourhood, and the feed/card/detail renders it exactly as before.
--
-- (b) THE PUBLIC RPC IS RE-CREATED WITH A LEFT JOIN, and that is the second
--     half of the same decision. get_public_playdate (0015, extended 11 -> 12
--     by 0021 and 12 -> 13 by 0030) joined the neighbourhood with an INNER
--     join:
--
--         join public.neighborhoods n on n.id = p.neighborhood_id
--
--     An inner join over a NULL FK matches nothing, so the whole `select ...
--     into result` returns no row, `not found` is true, and the function
--     returns NULL — which the signed-out detail page renders as NOT FOUND. A
--     drop-in that plainly exists would be invisible to every logged-out
--     visitor, and the only symptom would be an unexplained 404. `left join`
--     is the fix: the post is returned with `neighborhood_name` null.
--
--     A NULL LABEL IS NOT AN ERROR, and the composite type does NOT change:
--     `neighborhood_name` is already `text` (nullable) in public_playdate, so
--     there is no type swap here and therefore NO type guard to write. (The
--     0021/0022 guard would have been needed only if the attribute list
--     changed; note for the next migration that needs one: 0021/0022's
--     `t.oid = a.attrelid` never matches — a composite type's pg_attribute rows
--     carry pg_class OID (pg_type.typrelid) — and 0030 corrected it to
--     `t.typrelid = a.attrelid`. That corrected join is the one to copy.)
--
--     EVERYTHING ELSE ABOUT THE FUNCTION IS UNCHANGED: the same 13-field
--     projection in the same order, the same `security definer`, `stable`,
--     `set search_path = public, pg_temp`, the same `hidden_at is null`
--     scoping (a missing OR hidden post still returns NULL and its existence is
--     never confirmed to anon), and the same EXECUTE scoping (anon +
--     authenticated, revoked from public).
--
-- (c) THE SERIES COLUMN — the same question, one table over (T5). This is a
--     deliberate, NECESSARY extension of the ticket's "no other column
--     changes" line, and it was verified against the live project before being
--     written:
--
--       select table_name, column_name, is_nullable
--       from information_schema.columns
--       where table_schema = 'public'
--         and table_name in ('playdates','playdate_series')
--         and column_name = 'neighborhood_id';
--       -> playdate_series | neighborhood_id | NO
--          playdates       | neighborhood_id | NO
--
--     `playdate_series.neighborhood_id` is NOT NULL (0028:127) and 0028's
--     generator copies `s.neighborhood_id` into every occurrence it creates
--     (0028:289 and :307). With /new no longer asking, "Repeat weekly" would
--     create a series row with no neighbourhood and fail its OWN insert
--     23502 — after 0035's first statement, so the post the parent was looking
--     at would still fail, for a reason one table away from where they are
--     looking. The series is not a different kind of plan: it is the same
--     question asked of the same form, so it gets the same answer. Its FK
--     (`playdate_series_neighborhood_id_fkey`, verified live as ON DELETE
--     RESTRICT) is likewise untouched, and no series row is modified.
--
-- Idempotent + re-paste-safe (the 2026-09-04 house lesson): `alter table ...
-- alter column ... drop not null` is naturally re-runnable — it is a no-op on
-- an already-nullable column and cannot fail, so (unlike CREATE POLICY) it
-- needs no DO-block guard; the function re-create is DROP FUNCTION IF EXISTS +
-- CREATE (0015/0021/0030's pattern), and GRANT/REVOKE are themselves
-- re-runnable. Re-pasting this file on the migrated database changes nothing.

-- 1) The post's neighbourhood: optional, and NULL means "we did not ask".
alter table public.playdates alter column neighborhood_id drop not null;

-- 2) The series' neighbourhood: the same column for the same form (see (c)).
alter table public.playdate_series alter column neighborhood_id drop not null;

-- 3) The signed-out detail fetch, RE-CREATED with a LEFT join (see (b)). The
--    function is dropped first because its body changes; the composite type it
--    returns is NOT touched.
drop function if exists public.get_public_playdate(uuid);

create function public.get_public_playdate(p_id uuid)
returns public.public_playdate
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  result public.public_playdate;
begin
  select
    p.id,
    p.title,
    p.place,
    p.address,
    p.place_id,
    p.starts_at,
    p.ends_at,
    p.age_hint,
    p.details,
    n.name,
    h.display_name,
    h.avatar_url,
    (select count(*) from public.going_pings gp where gp.playdate_id = p.id)
  into result
  from public.playdates p
  -- V9 ticket 01: LEFT join. An inner join here would return NO ROW for a post
  -- with no neighbourhood, and this function's `not found` branch would answer
  -- NULL — i.e. the signed-out visitor gets "not found" for a post that exists.
  left join public.neighborhoods n on n.id = p.neighborhood_id
  left join public.profiles h on h.id = p.host_profile_id
  where p.id = p_id
    and p.hidden_at is null;

  if not found then
    return null;
  end if;
  return result;
end;
$$;

-- 4) EXECUTE: the two app roles only (Postgres grants EXECUTE to PUBLIC by
--    default on a new function — the revoke closes that). 0015's scoping,
--    UNCHANGED: anon + authenticated, and only those.
grant execute on function public.get_public_playdate(uuid) to anon, authenticated;
revoke execute on function public.get_public_playdate(uuid) from public;

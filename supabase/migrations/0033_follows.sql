-- ===========================================================================
-- V8 ticket 09 (migration 0033): FOLLOWS — the "find them again" bookmark.
-- ===========================================================================
--
-- What this adds: ONE table, `follows`, holding a signed-in parent's bookmark
-- on either ANOTHER FAMILY or a PLACE — plus the two count functions that are
-- the only sanctioned way to read somebody else's follow numbers.
--
-- The problem it closes (ticket 09): a playdate ends and the app instantly
-- forgets it. The only user-to-user tables were `blocks` (0006) and
-- `going_pings` (0007), so a parent who met three families on Saturday could
-- not find them again on Sunday except by remembering a handle. A follow is
-- that bookmark.
--
-- Pinned decisions (ticket 09 + .scratch/v8/spec.md; every one load-bearing):
--
-- (a) EXACTLY ONE TARGET PER ROW, enforced by the database:
--         check ((followee_profile_id is not null) <> (place_id is not null))
--     (named `follows_one_target_check` so the post-apply information_schema
--     probe can name it). A row with BOTH targets set, or NEITHER, is rejected
--     by Postgres — not by the client. The client mirrors the same rule in the
--     pure `validateFollowTarget` seam (src/lib/follows.ts, unit-tested), but
--     the CHECK is what makes it true. `<>` on two booleans is XOR: exactly one
--     side must be non-null.
--
-- (b) ONE ROW PER (FOLLOWER, TARGET) — the two PARTIAL unique indexes, not a
--     plain unique constraint:
--         follows_follower_followee_key  (follower_profile_id, followee_profile_id) where followee_profile_id is not null
--         follows_follower_place_key     (follower_profile_id, place_id)            where place_id is not null
--     A plain unique index would NOT do the job: NULLs do not collide in a
--     unique index, so (me, NULL, place-1) and (me, NULL, place-2) would be
--     distinct (fine) — but the guarantee we actually need is that a second
--     follow of the SAME target cannot exist, and a single composite index over
--     all three columns would also permit (me, NULL, place-1) twice. The two
--     partial indexes each cover exactly one target kind, so "follow twice" is
--     a 23505 and the client's insert treats 23505 as ALREADY FOLLOWING (the
--     db.toggleBlock discipline) — never a duplicate row. `if not exists` keeps
--     the file re-pasteable.
--
-- (c) OWNER-ONLY RLS on all four verbs: SELECT/INSERT/UPDATE/DELETE are all
--     `follower_profile_id = auth.uid()`. A FOLLOW GRAPH IS PERSONAL DATA — who
--     you are watching is nobody else's business, so there is deliberately NO
--     policy that lets another signed-in parent read your rows and NO public
--     follower LIST of any kind. Nobody can enumerate who follows whom: not a
--     stranger, not a moderator, not the owner of the followed row.
--
-- (d) COUNT-ONLY PUBLIC SURFACE, through SECURITY DEFINER functions:
--     `count_followers(p_profile_id uuid)` and
--     `count_place_followers(p_place_id uuid)`. Because (c) blocks every
--     cross-viewer read, a count for ANOTHER family's or a place's screen can
--     only come from these functions — and this migration adds NO new SELECT
--     policy on `profiles` or `places` (the 0025 discipline: the function IS
--     the gate, and it projects ONE integer, never a row). Posture, identical
--     to 0025/0028: SECURITY DEFINER, `stable` (both are read-only — no writes,
--     so unlike 0028's generator there is no volatility exception here),
--     `search_path` pinned to (public, pg_temp), EXECUTE granted to
--     `authenticated` ONLY with PUBLIC and anon REVOKED.
--
--     WHY anon IS REVOKED EVEN THOUGH /place/:id IS A PUBLIC ROUTE (the
--     explicit decision the ticket asks for): a signed-out visitor to
--     /place/:id sees NO follower count and NO follow control — the page shows
--     the same sign-in prompt its "Upcoming drop-ins here" section already
--     shows. Three reasons: (1) there is then exactly ONE posture for both
--     functions, so an anon probe fails closed (401 / 42501) for the family
--     count AND the place count, and no future screen can accidentally widen
--     it; (2) a follow is only actionable signed-in, so a count next to a
--     control the visitor cannot press is decoration; (3) failing closed means
--     the whole directory's follow numbers cannot be scraped by an
--     unauthenticated crawler. The count leaks no per-person data either way
--     (it is one integer) — this is about the SHAPE of the surface, and the
--     smaller surface wins.
--
-- (e) `on delete cascade` on all three FKs: deleting a profile or a place
--     removes the bookmarks that point at it. A dangling follow is not a state
--     — the Following list would render a row it cannot name.
--
-- (f) NO MUTUAL-FRIEND LOGIC, NO FRIEND FEED, NO REVIEWS, RATINGS OR
--     VOUCHING — the settled 2026-09-09 verdict, and this file's whole reason
--     for being this small. There is no `is_mutual`, no reciprocal flag, no
--     score, no rating column, no "reviews" table, and no function here that
--     ranks or grades a parent. A FOLLOW IS A BOOKMARK, NOT A SCORE. The UI
--     deliberately shows no per-family follower count (see the note above
--     `count_followers` below) — a visible popularity number on a parent's
--     page would be exactly the grading this decision forbids.
--
-- Idempotent + re-paste-safe (the 2026-09-04 house lesson): the table is
-- `create table if not exists`; every FK, the CHECK, and EVERY policy live in
-- their OWN DO-block guard (Postgres has no `CREATE POLICY IF NOT EXISTS`, and
-- a bare ADD CONSTRAINT is not re-runnable); the two partial unique indexes are
-- `create unique index if not exists`; the functions are DROP FUNCTION IF
-- EXISTS + CREATE (the 0021/0025 structure); GRANT/REVOKE are themselves
-- re-runnable. The FKs and the CHECK are added by GUARD rather than inline in
-- `create table`, so a re-paste over a HALF-APPLIED table (one that exists
-- without them) still completes the rule set instead of silently keeping a
-- table with no exactly-one-target rule — the 0028 lesson.
--
-- Depends on: 0029/0030 (`places`, for the `place_id` FK). Apply AFTER them.
-- ===========================================================================

-- 1) The bookmark itself. Columns only: every FK and the CHECK are added by
--    their own guard below (see the idempotency note).
create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  -- The bookmark's owner. Always the signed-in parent (the RLS policies pin
  -- this to auth.uid() on every verb).
  follower_profile_id uuid not null,
  -- Target kind 1: another FAMILY. NULL when the target is a place.
  followee_profile_id uuid,
  -- Target kind 2: a PLACE (the directory row, 0029). NULL when the target is
  -- a family. Exactly one of these two is non-null (the CHECK below).
  place_id uuid,
  created_at timestamptz not null default now()
);

alter table public.follows enable row level security;

-- 2) The three FKs, each as a NAMED constraint in its own guard (pin (e)).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'follows_follower_profile_id_fkey'
      and conrelid = 'public.follows'::regclass
  ) then
    alter table public.follows
      add constraint follows_follower_profile_id_fkey
      foreign key (follower_profile_id) references public.profiles (id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'follows_followee_profile_id_fkey'
      and conrelid = 'public.follows'::regclass
  ) then
    alter table public.follows
      add constraint follows_followee_profile_id_fkey
      foreign key (followee_profile_id) references public.profiles (id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'follows_place_id_fkey'
      and conrelid = 'public.follows'::regclass
  ) then
    alter table public.follows
      add constraint follows_place_id_fkey
      foreign key (place_id) references public.places (id) on delete cascade;
  end if;
end
$$;

-- 3) Pin (a): EXACTLY ONE TARGET. `<>` on two booleans is XOR, so both-null
--    and both-set are both rejected — by the database, for every writer.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'follows_one_target_check'
      and conrelid = 'public.follows'::regclass
  ) then
    alter table public.follows
      add constraint follows_one_target_check
      check ((followee_profile_id is not null) <> (place_id is not null));
  end if;
end
$$;

-- 4) Pin (b): one row per (follower, target). Two PARTIAL unique indexes —
--    one per target kind, because NULLs do not collide in a unique index and a
--    single index over all three columns would not stop a repeated place
--    follow. Re-runnable via `if not exists`.
create unique index if not exists follows_follower_followee_key
  on public.follows (follower_profile_id, followee_profile_id)
  where followee_profile_id is not null;

create unique index if not exists follows_follower_place_key
  on public.follows (follower_profile_id, place_id)
  where place_id is not null;

-- 5) Pin (c): OWNER-ONLY on all four verbs. Every policy is its own DO-block
--    guard keyed on its policyname, so a half-applied paste completes cleanly.
--    NO policy grants a cross-viewer read — that is the pinned privacy posture
--    (a follow graph is personal data), and it is what makes the SECDEF counts
--    below the only way a count can ever cross to another screen.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'follows'
      and policyname = 'follows_select_owner'
  ) then
    -- Your own bookmarks. A read of somebody else's rows returns ZERO ROWS
    -- (2xx, no error — the 0014 lesson: assert rows, not status).
    create policy "follows_select_owner"
      on public.follows for select
      to authenticated
      using (follower_profile_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies
      where schemaname = 'public'
      and tablename = 'follows'
      and policyname = 'follows_insert_owner'
  ) then
    create policy "follows_insert_owner"
      on public.follows for insert
      to authenticated
      with check (follower_profile_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies
      where schemaname = 'public'
      and tablename = 'follows'
      and policyname = 'follows_update_owner'
  ) then
    -- A follow has no mutable field today (the target is the row's identity),
    -- so UPDATE is the least-privileged owner-scoped verb: it exists so the
    -- table is complete for the four-verb posture and so a future "mute for a
    -- while" flag has somewhere to land WITHOUT a new policy. Both USING and
    -- WITH CHECK are owner-scoped: an UPDATE can neither target nor produce a
    -- row owned by somebody else.
    create policy "follows_update_owner"
      on public.follows for update
      to authenticated
      using (follower_profile_id = auth.uid())
      with check (follower_profile_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies
      where schemaname = 'public'
      and tablename = 'follows'
      and policyname = 'follows_delete_owner'
  ) then
    -- Unfollow deletes THIS row (the client's toggle). Deleting a row you do
    -- not own matches nothing: a silent 0-row 2xx, never an error.
    create policy "follows_delete_owner"
      on public.follows for delete
      to authenticated
      using (follower_profile_id = auth.uid());
  end if;
end
$$;

-- 6) Pin (d): the count-only read surface. SECURITY DEFINER (it reads past the
--    owner-only SELECT policy by design), STABLE (read-only), `search_path`
--    pinned, EXECUTE to authenticated ONLY. It projects ONE INTEGER — never a
--    row, never a handle, never a list.
--
--    THE UI DOES NOT RENDER count_followers, AND THAT IS DELIBERATE (pin (f)):
--    a visible "N families follow @someone" line is a popularity score on a
--    parent, which the settled no-reviews/no-vouching verdict forbids. The
--    function exists because the SANCTIONED count surface must be the SECDEF
--    function rather than a widened SELECT policy — and because a future,
--    non-scoring screen (a place, a neighbourhood) needs exactly this shape.
--    `count_place_followers` IS rendered: /place/:id shows "N families follow
--    this place" — a fact about a PARK, not about a person.
drop function if exists public.count_followers(uuid);

create function public.count_followers(p_profile_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::int
  from public.follows f
  where f.followee_profile_id = p_profile_id;
$$;

drop function if exists public.count_place_followers(uuid);

create function public.count_place_followers(p_place_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::int
  from public.follows f
  where f.place_id = p_place_id;
$$;

-- 7) EXECUTE scoping (the 0015/0025/0028 pattern, narrowed to the signed-in
--    surface): Postgres grants EXECUTE to PUBLIC by default on a new function,
--    so PUBLIC and anon are revoked explicitly and only `authenticated` is
--    granted. An anon call must fail closed (401 / 42501) for BOTH functions —
--    see pin (d) for why the public /place/:id route is no exception.
grant execute on function public.count_followers(uuid) to authenticated;
revoke execute on function public.count_followers(uuid) from public;
revoke execute on function public.count_followers(uuid) from anon;

grant execute on function public.count_place_followers(uuid) to authenticated;
revoke execute on function public.count_place_followers(uuid) from public;
revoke execute on function public.count_place_followers(uuid) from anon;

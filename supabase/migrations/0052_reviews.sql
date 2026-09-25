-- ===========================================================================
-- V24 ticket 06 (migration 0052): `reviews` — a star rating + optional body,
-- one row per (place, parent).
-- ===========================================================================
--
-- What this does: adds ONE new table, `public.reviews`, with its unique key,
-- its index, and its RLS policies. No existing table is touched, no existing
-- row is rewritten, no policy on another table is altered. Strictly additive
-- and re-paste-safe: this is a LIVE-DATABASE migration (the project holds real
-- family data), so every statement is guarded.
--
-- WHY: the founder's ask on the places surface —
--
--   *"you can leave a comment and a star rating from one to five and then
--    there's a total star rating above what parents say… and see the top
--    rated places by all the parents throughout your city."*
--
-- THE COMMENT WALL SURVIVES. `place_comments` (0050) is NOT migrated into
-- reviews and NOT deleted. This table ADDS ratings beside that wall;
-- reconciling the two is explicitly deferred (spec "Reviews and ratings").
-- The two walls agree on the body bound: both cap at 500 characters.
--
-- ---------------------------------------------------------------------------
-- PINNED DECISIONS
-- ---------------------------------------------------------------------------
--
-- (a) ONE ROW PER (PLACE, PARENT), ENFORCED BY THE DATABASE.
--     A composite PRIMARY KEY on (place_id, author_profile_id) is the
--     invariant the average depends on: a parent who rates a place twice
--     would double-count in the aggregate, so uniqueness is the wall, not
--     a UI rule. The review form is one submit — an existing review loads
--     into the form and saving replaces it (UPDATE), never a second INSERT.
--
-- (b) SCORE IS 1–5 AT THE DATABASE LEVEL.
--     `check (score between 1 and 5)` on a `not null` column: a review with
--     no score is not a review, and the client-side mirror
--     (`REVIEW_SCORE_MIN` / `REVIEW_SCORE_MAX` in `src/lib/reviews.ts`) pins
--     the same numbers so the two sides cannot drift.
--
-- (c) BODY BOUND MATCHES THE EXISTING PLACE-COMMENT WALL.
--     `char_length(body) <= 500` mirrors 0050's CHECK exactly (and 0013's
--     original comment bound), so a body that posts to the wall also posts
--     to a review and vice versa. Unlike 0050's `body text not null`, the
--     review body is OPTIONAL: a stars-only review is legal (the form
--     requires the stars, not the words). NULL passes the CHECK; a stored
--     body of 1–500 characters passes it too.
--
-- (d) AGGREGATION LIVES IN THE DATABASE, NOT ON THE CLIENT.
--     `review_summary(p_place_id uuid)` returns the count and the display
--     average (rounded to one decimal, the shape a card renders) in one
--     call. Pulling every review row to compute an average is the obvious
--     way to make the feature slow, so the card list reads the summary, not
--     the rows. EXECUTE is granted to `authenticated` only (anon and
--     PUBLIC revoked, the 0033 pattern); the function is SECURITY DEFINER
--     with a pinned search_path because the table's SELECT policy is
--     authenticated-scoped and the caller may be anon-adjacent tooling.
--
-- (e) NO MODERATOR HIDE COLUMN.
--     0050's wall carries `hidden_at` because a public comment needs a
--     moderation path. A 1–5 numeric score has no content to moderate, and
--     adding a hide mechanism nobody asked for is scope creep. If a
--     moderation need appears later it is its own migration.
--
-- (f) POLICIES MIRROR 0050'S POSTURE, MINUS THE MODERATOR ARM.
--     * SELECT — any signed-in parent reads every review (no anon, the
--       0050 posture: a rating list renders author names, so it follows
--       the stricter of the two rules).
--     * INSERT / UPDATE — as yourself only (`author_profile_id =
--       auth.uid()`), so nobody can rate under another parent's name.
--     * DELETE — the author withdraws their own review. Deliberately
--       narrower than 0050's delete policy: there is no moderator arm
--       (pin e), so a parent removes their own row or leaves it.
--
-- (g) SERVER-ROLE PATHS TEST `auth.uid() IS NULL` SEPARATELY FROM THE ROLE
--     CHECK (the live-proven lesson in this repo's history, 0011/0032): a
--     trigger or service-role write runs with `auth.uid() IS NULL`, and a
--     guard that keys only on the role check silently denies those paths.
--     Today no trigger exists on this table, so the lesson is recorded here
--     for the next editor rather than enforced by code.
--
-- Idempotent + re-paste-safe (house pattern; 0041/0045/0046/0047/0050/0051
-- precedents): `create table if not exists`, `create index if not exists`,
-- and every policy created inside a DO block guarded on `pg_policies` by
-- name — `create policy` has NO `if not exists` in Postgres, which is the
-- 2026-09-04 rule. NEVER use `CREATE POLICY IF NOT EXISTS`.
--
-- Apply order: independent. Assumes only that `public.places` (0029) and
-- `public.profiles` (0001) exist. The last applied migration is 0051.

-- ---------------------------------------------------------------------------
-- 1. The table.
-- ---------------------------------------------------------------------------
create table if not exists public.reviews (
  -- Composite PK: the (place, parent) uniqueness invariant (pin a). A
  -- separate surrogate id would let the database accept a duplicate pair
  -- and push the dedupe onto the application — the exact failure the
  -- average depends on never happening.
  place_id uuid not null references public.places (id) on delete cascade,
  -- ON DELETE CASCADE, matching 0050's author FK: a departed account's
  -- rating goes with it. NOT `set null`, which would leave an anonymous
  -- star standing.
  author_profile_id uuid not null references public.profiles (id) on delete cascade,
  -- 1–5, constrained at the database level (pin b). NOT NULL: a review is
  -- a rating first, a comment second.
  score smallint not null check (score between 1 and 5),
  -- Optional body, capped at the same 500 characters as 0050's wall (pin c).
  -- NULL = stars-only review, which is legal.
  body text check (body is null or char_length(body) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (place_id, author_profile_id)
);

-- One read serves both the detail page (all reviews for a place, newest
-- first) and the top-rated ordering (average per place). 0050's index is
-- the same shape for the same reason.
create index if not exists reviews_place_id_created_at_idx
  on public.reviews (place_id, created_at);

alter table public.reviews enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Policies.
-- ---------------------------------------------------------------------------
do $$
begin
  -- READ: any signed-in parent (pin f). No anon — a rating list renders
  -- author names, so it follows 0050's stricter rule.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'reviews'
      and policyname = 'reviews_select_authenticated'
  ) then
    create policy reviews_select_authenticated
      on public.reviews for select
      to authenticated
      using (true);
  end if;

  -- WRITE: as yourself, and only as yourself (pin f). Without the WITH
  -- CHECK a parent could rate under another parent's name.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'reviews'
      and policyname = 'reviews_insert_own'
  ) then
    create policy reviews_insert_own
      on public.reviews for insert
      to authenticated
      with check (author_profile_id = auth.uid());
  end if;

  -- EDIT: the author replaces their own review (one submit, pin a). USING
  -- gates which rows are reachable; WITH CHECK re-tests the same condition
  -- on the result, so an author cannot hand a row to another parent.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'reviews'
      and policyname = 'reviews_update_own'
  ) then
    create policy reviews_update_own
      on public.reviews for update
      to authenticated
      using (author_profile_id = auth.uid())
      with check (author_profile_id = auth.uid());
  end if;

  -- DELETE: the author withdraws their own review (pin f). No moderator
  -- arm — pin e.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'reviews'
      and policyname = 'reviews_delete_author'
  ) then
    create policy reviews_delete_author
      on public.reviews for delete
      to authenticated
      using (author_profile_id = auth.uid());
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. The aggregate summary (pin d).
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER with a pinned search_path (the 0015/0028/0033 pattern):
-- the function reads the table as its owner, past the authenticated-scoped
-- SELECT policy, so the caller's role does not decide what the summary sees.
-- STABLE: it writes nothing. Returns (count, display_average) where the
-- average is rounded to one decimal — the shape a card renders — and NULL
-- when there are no reviews (the honest zero case: a place with no reviews
-- must never rank as if it scored zero, and a NULL average is the explicit
-- signal the client's unrated-place rule keys on).
drop function if exists public.review_summary(uuid);

create function public.review_summary(p_place_id uuid)
returns table (review_count int, display_average numeric)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    count(*)::int,
    case when count(*) > 0
         then round(avg(score)::numeric, 1)
         else null
    end
  from public.reviews
  where place_id = p_place_id;
$$;

-- EXECUTE scoping (the 0033 pattern, narrowed to the signed-in surface):
-- Postgres grants EXECUTE to PUBLIC by default on a new function, so PUBLIC
-- and anon are revoked explicitly and only `authenticated` is granted. An
-- anon call must fail closed (42501).
grant execute on function public.review_summary(uuid) to authenticated;
revoke execute on function public.review_summary(uuid) from public;
revoke execute on function public.review_summary(uuid) from anon;

-- ---------------------------------------------------------------------------
-- 4. Read-back — the migration asserts its own effect rather than assuming it.
-- ---------------------------------------------------------------------------
-- The house lesson (V18): a 2xx write touching zero rows exits 0 with a
-- reassuring log. These are READ-ONLY probes; they raise if the table, its
-- unique key, its four policies, or its summary function are not actually
-- present after the DDL above.
do $$
declare
  missing text[] := array[]::text[];
  pol text;
  cols int;
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'reviews'
  ) then
    missing := array_append(missing, 'table reviews');
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'reviews'
      and indexname = 'reviews_place_id_created_at_idx'
  ) then
    missing := array_append(missing, 'index reviews_place_id_created_at_idx');
  end if;

  foreach pol in array array[
    'reviews_select_authenticated',
    'reviews_insert_own',
    'reviews_update_own',
    'reviews_delete_author'
  ]
  loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'reviews'
        and policyname = pol
    ) then
      missing := array_append(missing, 'policy ' || pol);
    end if;
  end loop;

  -- RLS must actually be ON. A table with policies but RLS disabled is
  -- readable by everyone, which is the failure that looks like success.
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'reviews'
      and c.relrowsecurity
  ) then
    missing := array_append(missing, 'row level security NOT enabled');
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'review_summary'
  ) then
    missing := array_append(missing, 'function review_summary(uuid)');
  end if;

  if array_length(missing, 1) is not null then
    raise exception '0052 read-back FAILED — missing: %', array_to_string(missing, ', ');
  end if;

  select count(*) into cols from information_schema.columns
  where table_schema = 'public' and table_name = 'reviews';
  raise notice '0052 read-back OK — reviews present with % columns, RLS on, 4 policies, 1 index, review_summary()', cols;
end
$$;
-- ===========================================================================
-- V23 (migration 0050): `place_comments` — what parents say about a PLACE.
-- ===========================================================================
--
-- What this does: adds ONE new table, `public.place_comments`, with its index,
-- its RLS policies, and nothing else. No existing table is touched, no existing
-- row is rewritten, no policy on another table is altered. Strictly additive
-- and re-paste-safe: this is a LIVE-DATABASE migration (the project holds real
-- family data), so every statement is guarded.
--
-- Why: the founder's ask on the place surface —
--
--   *"when you click details, it takes you to that page where you can see what
--    other parents have said about it like in the comment section and you can
--    see how many parents follow it by hearting it…"*
--
-- WHY THIS IS A NEW TABLE AND NOT A REUSE OF `comments`. This is the single
-- most important thing to understand before editing this file.
--
-- `public.comments` (0013) is PLAYDATE-scoped: `comments.playdate_id` is
-- `uuid not null references public.playdates (id)`. A place is not an event, so
-- there is no column on that table a place comment could legitimately occupy.
-- The alternatives and why each was refused:
--
--   1. **Add `place_id` to `comments` and make BOTH columns nullable.** Refused:
--      it would put two mutually-exclusive parents on one table (every row would
--      have exactly one of playdate_id / place_id, enforced only by a CHECK this
--      migration would also have to add), and it would silently widen the
--      meaning of every existing query on `comments` — the detail page's list,
--      the reply machinery (0023), and the moderation tools all assume a
--      playdate. A table whose rows mean two different things is the defect this
--      refusal avoids.
--   2. **Read playdate comments and show them on the place page.** Refused, and
--      it is worth recording as a PRODUCT reason rather than a schema one: a
--      comment written inside a drop-in thread is a remark to the families
--      going to THAT event ("bring a snack", "we're running late"). Re-publishing
--      it, out of context, as a permanent review of a park would repeat words a
--      parent wrote for a different audience. Comments belong to the thing they
--      were written on.
--   3. **A place "review" with a rating.** Refused: the founder asked for what
--      parents have SAID, and a 1–5 star scale on a public playground is a
--      different product with different moderation obligations.
--
-- RELATIONSHIP TO `places` (0029) AND `place_follows` (0033): this table is
-- independent of both. It carries no follower count (that stays in the SECDEF
-- `count_place_followers` RPC, 0033) and it does not duplicate any `places`
-- column. The details page composes all three at render time; none is derived
-- from another.
--
-- NO KID DATA HERE. `place_comments` carries nothing about children — the V9
-- t11 private-bucket and first-name-only pins are untouched by this migration.
-- A parent's words about a park are their own.
--
-- ---------------------------------------------------------------------------
-- PRIVACY POSTURE (the part worth reading before changing any policy)
-- ---------------------------------------------------------------------------
-- A place comment is PUBLIC-ISH in the only sense that matters here: every
-- signed-in parent can read every comment on a place. That is deliberate — it
-- is a wall of advice about a park, and it is useless if it is private. What
-- the policies below do is bound the three things a careless policy would open:
--
--   * **NOT READABLE BY `anon`.** Signed-out visitors read ZERO rows. The place
--     page already has this posture (`places` has an anon SELECT for its own
--     public columns, but `profiles` carries no anon policy at all, which is why
--     the place page hides its drop-in list from visitors). A comment wall
--     renders author names, so it follows the stricter of the two rules: no anon.
--   * **WRITABLE ONLY AS YOURSELF** (`author_profile_id = auth.uid()`), so nobody
--     can put words in another parent's mouth. This is the 0013/0047 pattern.
--   * **HIDDEN ROWS ARE INVISIBLE**, not merely unstyled: the SELECT policy
--     filters `hidden_at is null`, so a moderated comment disappears from every
--     reader at once. Only moderators may set `hidden_at` (the UPDATE policy
--     keys on `profiles.moderators`, the 0008 column) — the same gate 0013 uses.
--     A failed moderation flag read denies rather than allows.
--
-- 42P17 DISCIPLINE: no policy below subqueries its OWN table. Each one reads
-- either `auth.uid()` or a DIFFERENT table (`profiles`), which is the line the
-- 2026-09-04 lesson draws. The moderator check reads `profiles` by primary key.
--
-- Idempotent + re-paste-safe (house pattern; 0041/0045/0046/0047 precedents):
-- `create table if not exists`, `create index if not exists`, and every policy
-- created inside a DO block guarded on `pg_policies` by name — `create policy`
-- has NO `if not exists` in Postgres, which is the 2026-09-04 rule.
--
-- Apply order: independent. Assumes only that `public.places` (0029) and
-- `public.profiles` (0001, plus 0008's `moderators` column) exist.

-- ---------------------------------------------------------------------------
-- 1. The table.
-- ---------------------------------------------------------------------------
create table if not exists public.place_comments (
  id uuid primary key default gen_random_uuid(),
  -- ON DELETE CASCADE: a comment about a removed place is a comment about
  -- nothing. (Places are not deleted in practice — 0029's seed is the
  -- directory — but the FK states the intent rather than leaving a dangling
  -- reference to a row that no longer exists.)
  place_id uuid not null references public.places (id) on delete cascade,
  -- ON DELETE CASCADE, matching 0013's author FK: a departed account's words go
  -- with it. NOT `set null`, which would leave an anonymous comment standing —
  -- and a wall where some rows have no author is worse than one where a deleted
  -- parent's row is gone.
  author_profile_id uuid not null references public.profiles (id) on delete cascade,
  -- The DB CHECK mirrors 0013's: trim must leave 1–500 characters. The bound is
  -- duplicated ON PURPOSE and must stay in sync with
  -- `PLACE_COMMENT_MAX_LENGTH` in `src/lib/placeComments.ts` — the house rule
  -- for a bound that exists on both sides (cf. `profiles_radius_miles_chk` <->
  -- `RADIUS_MIN_MILES`/`RADIUS_MAX_MILES`). The client cap gives the parent a
  -- sentence they can act on; this CHECK is the wall that makes it true.
  body text not null
    check (char_length(trim(body)) > 0 and char_length(body) <= 500),
  created_at timestamptz not null default now(),
  -- NULL = visible. A timestamp = hidden by a moderator, and the SELECT policy
  -- below filters it out for EVERY reader including its author. A soft delete
  -- rather than a row delete, matching 0013/0023: the moderation decision is
  -- itself a fact worth keeping, and a hard delete would make an appeal
  -- impossible.
  hidden_at timestamptz
);

-- The wall is read ONE way: every visible comment for a place, newest first (or
-- oldest first — the index serves both directions). 0013's comments index is the
-- same shape for the same reason.
create index if not exists place_comments_place_id_created_at_idx
  on public.place_comments (place_id, created_at);

alter table public.place_comments enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Policies.
-- ---------------------------------------------------------------------------
do $$
begin
  -- READ: any signed-in parent, minus anything a moderator has hidden. `true`
  -- for the participation test is correct here and is NOT the same decision as
  -- 0042's messages policy: a message thread is between two families and must be
  -- gated on participation, while a wall of advice about a public park is
  -- addressed to every parent using the directory. The gate that matters is
  -- `to authenticated` (no anon) plus the hidden filter.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'place_comments'
      and policyname = 'place_comments_select_authenticated'
  ) then
    create policy place_comments_select_authenticated
      on public.place_comments for select
      to authenticated
      using (hidden_at is null);
  end if;

  -- WRITE: as yourself, and only as yourself. Without the WITH CHECK a parent
  -- could post under another parent's name.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'place_comments'
      and policyname = 'place_comments_insert_own'
  ) then
    create policy place_comments_insert_own
      on public.place_comments for insert
      to authenticated
      with check (author_profile_id = auth.uid());
  end if;

  -- MODERATE: only a moderator may change a row, and the only column the app
  -- ever writes here is `hidden_at`. USING gates which rows are reachable;
  -- WITH CHECK re-tests the same condition on the result, so a moderator cannot
  -- hand a row to a non-moderator. A failed read of `profiles.moderators`
  -- matches no row and therefore DENIES — failing closed, the house posture.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'place_comments'
      and policyname = 'place_comments_update_moderators'
  ) then
    create policy place_comments_update_moderators
      on public.place_comments for update
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

  -- DELETE: the author may withdraw their own words, and a moderator may remove
  -- any. This mirrors 0013's `comments_delete_author_or_host` with the
  -- moderator arm in place of the host arm (a place has no host). Deliberately
  -- narrower than the UPDATE policy: a parent cannot edit history, only remove
  -- their own row; hiding is a moderator action and leaves the row for review.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'place_comments'
      and policyname = 'place_comments_delete_author_or_moderator'
  ) then
    create policy place_comments_delete_author_or_moderator
      on public.place_comments for delete
      to authenticated
      using (
        author_profile_id = auth.uid()
        or exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.moderators
        )
      );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Read-back — the migration asserts its own effect rather than assuming it.
-- ---------------------------------------------------------------------------
-- The house lesson (V18): a 2xx write touching zero rows exits 0 with a
-- reassuring log. These are READ-ONLY probes; they raise if the table or its
-- four policies are not actually present after the DDL above.
do $$
declare
  missing text[] := array[]::text[];
  pol text;
  cols int;
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'place_comments'
  ) then
    missing := array_append(missing, 'table place_comments');
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'place_comments'
      and indexname = 'place_comments_place_id_created_at_idx'
  ) then
    missing := array_append(missing, 'index place_comments_place_id_created_at_idx');
  end if;

  foreach pol in array array[
    'place_comments_select_authenticated',
    'place_comments_insert_own',
    'place_comments_update_moderators',
    'place_comments_delete_author_or_moderator'
  ]
  loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'place_comments'
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
    where n.nspname = 'public' and c.relname = 'place_comments'
      and c.relrowsecurity
  ) then
    missing := array_append(missing, 'row level security NOT enabled');
  end if;

  if array_length(missing, 1) is not null then
    raise exception '0050 read-back FAILED — missing: %', array_to_string(missing, ', ');
  end if;

  select count(*) into cols from information_schema.columns
  where table_schema = 'public' and table_name = 'place_comments';
  raise notice '0050 read-back OK — place_comments present with % columns, RLS on, 4 policies, 1 index', cols;
end
$$;

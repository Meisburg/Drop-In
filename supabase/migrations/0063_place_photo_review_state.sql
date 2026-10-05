-- ===========================================================================
-- Place-photo sourcing (migration 0063): is this picture one a human has seen?
-- ===========================================================================
--
-- WHAT THIS DOES: adds ONE nullable text column to `public.places` —
-- `photo_review_state`, the values `'confirmed'` / `'unreviewed'` — and backfills
-- every row that already carries a photo to `'confirmed'`. No policy changes, no
-- other column touched, no existing value rewritten. Strictly additive and
-- re-paste-safe: this is a LIVE-DATABASE migration and `places` is the founder's
-- real Seattle directory.
--
-- WHY IT EXISTS. The founder asked for the blanks to be filled automatically:
-- *"I don't want to have to manually populate them if I don't have to."* Then he
-- stated his own model of the system, which is the design:
--
--   *"The idea is that it will automatically try to add the correct images for
--   every place and then I'll go through it as the manual reviewer and upload
--   better photos for any that need them."*
--
-- So the fill is BEST-EFFORT and the human is the filter — not "only fill what is
-- certain". That moves the real question from precision to *what a family sees
-- while the review is pending*, and the answer is two tiers with two review
-- states (`.scratch/place-photo-sourcing/spec.md` §2, amended):
--
--   tier 1 — the candidate's own title names the place. Written `'confirmed'`:
--     the evidence travels with the file, so it is live to parents immediately.
--   tier 2 — the best remaining candidate that is not blocklisted. Written
--     `'unreviewed'`: it is stored on the row so the moderator can judge it, and
--     it is NOT shown to parents until a moderator confirms it. Those rows keep
--     the per-kind illustration meanwhile — exactly what they show today, so
--     nothing regresses and no unvetted picture reaches a family card.
--
-- MEASURED BEFORE WRITING THIS (live production, 2026-10-05): 239 places, 112 of
-- them with `photo_url is null`. The other 127 already carry a photo, and every
-- one of them was applied by a pipeline a human reviewed (V18's candidate sheet,
-- or the moderator's editor since 0062). That is what the backfill records — not
-- a claim that they are the RIGHT photo, only that a person has already been in
-- the loop for them. Re-reviewing them is explicitly out of this slice's scope.
--
-- WHY A NULLABLE COLUMN WITH NO DEFAULT. NULL means "no photo", and it is the
-- honest value for a blank row: a DEFAULT of `'confirmed'` would stamp a
-- review state on 112 rows that have nothing to review, and would make the
-- backfill below a no-op that appears to have worked. The app treats NULL as
-- VISIBLE for a row that HAS a photo (`placePhotoVisibleTo`), which is what keeps
-- a pre-column writer from silently deleting pictures from the directory; on a
-- row with no photo the state is unread either way (the `hasPlacePhoto` half of
-- that same predicate).
--
-- WHY A CHECK AND NOT AN ENUM. The vocabulary is two values and it is already
-- carried in one tested place in TypeScript (`PlacePhotoReviewState`); the column
-- constraint exists so a future writer cannot invent a third state that no
-- render knows how to treat — a picture that is neither confirmed nor unreviewed
-- would be visible to everyone by the NULL rule above, which is exactly the
-- silent failure this column is here to prevent. `in (...)`, not an enum type:
-- adding a state later stays a data change plus a one-line constraint update,
-- with no `alter type` on a live table.
--
-- NO RLS CHANGE. `places` keeps its SELECT-only posture for the world plus the
-- 0062 moderator UPDATE policy; this adds a column to the row that policy already
-- writes (the editor's save/keep path sets it). Adding a column must not quietly
-- re-scope a table's policies — the 0014 / 0016 / 0021 / 0046 lesson.
--
-- Idempotent and re-paste-safe (the 0041 / 0045 / 0046 precedents):
-- `add column if not exists` for the column, a DO-block guard on `pg_constraint`
-- for the check (there is no `add constraint if not exists`), and a backfill
-- whose WHERE clause excludes what it already wrote. Run once or a hundred times,
-- the table ends in the same state.
--
-- Apply order: independent. It assumes only that `public.places` exists (it has
-- since the original seed) and that `photo_url` is present — it is not, and must
-- not be, re-added here. The last applied migration is 0062.

-- ---------------------------------------------------------------------------
-- 1. The column.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'places'
      and column_name = 'photo_review_state'
  ) then
    alter table public.places add column photo_review_state text;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. The two-value vocabulary, as a guarded CHECK.
--
--    NULL stays legal: it is the state of every row with no photo, and of a row
--    whose photo predates this column if the backfill below is somehow skipped.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.places'::regclass
      and conname = 'places_photo_review_state_check'
  ) then
    alter table public.places
      add constraint places_photo_review_state_check
      check (photo_review_state is null or photo_review_state in ('confirmed', 'unreviewed'));
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. The backfill: every row that HAS a photo, and has no state yet, is
--    `'confirmed'`.
--
--    The `photo_review_state is null` half is what makes this idempotent AND safe
--    to re-run after a sourcing run: it can never overwrite an `'unreviewed'`
--    tier-2 fill with `'confirmed'`, which would publish exactly the pictures
--    this column exists to withhold.
--
--    The empty-string half mirrors the app's own rule: `hasPlacePhoto` treats
--    `''` as no picture, so a row carrying `''` must not be stamped as reviewed
--    either.
-- ---------------------------------------------------------------------------
update public.places
set photo_review_state = 'confirmed'
where photo_url is not null
  and photo_url <> ''
  and photo_review_state is null;

-- ---------------------------------------------------------------------------
-- 4. THE READ-BACK. This file asserts what it just did rather than trusting the
--    HTTP 201 — the 0060 standard, and the reason it is a DO block and not a
--    comment: a migration that silently created nothing looks identical to one
--    that worked. Every assertion raises, so a partial apply is a FAILED apply.
-- ---------------------------------------------------------------------------
do $$
declare
  v_column integer;
  v_constraint integer;
  v_constraint_def text;
  v_photos_without_state integer;
  v_confirmed integer;
  v_unreviewed integer;
  v_blanks integer;
begin
  -- 4a) The column exists, is text, and is NULLABLE. A NOT NULL column here
  -- would make the 112 blank rows unwritable for every future seed.
  select count(*) into v_column
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'places'
    and column_name = 'photo_review_state'
    and data_type = 'text'
    and is_nullable = 'YES';
  if v_column <> 1 then
    raise exception 'photo_review_state is missing, not text, or not nullable (found %)', v_column;
  end if;

  -- 4b) The check landed AND covers both values. Counting the constraint alone
  -- would pass on a constraint that forbids everything.
  select count(*), max(pg_get_constraintdef(oid)) into v_constraint, v_constraint_def
  from pg_constraint
  where conrelid = 'public.places'::regclass
    and conname = 'places_photo_review_state_check'
    and contype = 'c';
  if v_constraint <> 1 then
    raise exception 'places_photo_review_state_check is missing (found %)', v_constraint;
  end if;
  if v_constraint_def not like '%confirmed%' or v_constraint_def not like '%unreviewed%' then
    raise exception 'the check does not name both states: %', v_constraint_def;
  end if;

  -- 4c) THE ASSERTION THAT MATTERS: no row carries a picture with no review
  -- state. If this is non-zero the app would fall back to "visible" for rows the
  -- migration never classified, which is the silent half-applied state.
  select count(*) into v_photos_without_state
  from public.places
  where photo_url is not null and photo_url <> '' and photo_review_state is null;
  if v_photos_without_state <> 0 then
    raise exception '% photo(s) have no review state after the backfill', v_photos_without_state;
  end if;

  -- 4d) The directory PARTITIONS: confirmed + unreviewed + blank = total. Written
  -- this way rather than "confirmed + blank = total" because a later sourcing run
  -- legitimately leaves `'unreviewed'` rows behind, and this file has to still
  -- pass when it is re-pasted after one — a read-back that only holds before the
  -- feature is used would fail the first re-run.
  --
  -- Measured at write time: 239 places, 112 blank, so 127 confirmed and 0
  -- unreviewed. A zero-confirmed database would mean the backfill's predicate is
  -- wrong, which 4c alone cannot catch on a database whose photos were deleted.
  select count(*) into v_confirmed
  from public.places where photo_review_state = 'confirmed';
  select count(*) into v_unreviewed
  from public.places where photo_review_state = 'unreviewed';
  select count(*) into v_blanks
  from public.places where photo_url is null or photo_url = '';
  if v_confirmed + v_unreviewed + v_blanks <> (select count(*) from public.places) then
    raise exception
      'the directory does not partition into confirmed+unreviewed+blank: % + % + % <> % total',
      v_confirmed, v_unreviewed, v_blanks, (select count(*) from public.places);
  end if;

  raise notice
    'migration 0063 read-back PASSED: column + check present, % confirmed, % unreviewed, % blank',
    v_confirmed, v_unreviewed, v_blanks;
end
$$;

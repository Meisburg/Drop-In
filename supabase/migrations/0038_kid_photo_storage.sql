-- ===========================================================================
-- V9 ticket 11 (migration 0038): a child's photo is not public property.
-- Kid photos move to a PRIVATE bucket; parent avatars do not move at all; the
-- parent gets an optional FAMILY photo and an "About our family" line instead.
-- ===========================================================================
--
-- FOLDS V9 TICKET 08 ("Profile — no kid photos; an optional family photo +
-- about-us"), which reserved this number. Ticket 08's UI half rides this
-- migration: the kid-photo control is gone from `<uid>/profile` and no kid photo
-- renders anywhere, the family photo lands in `profiles.family_photo_url` at
-- `<uid>/family/photo.jpg`, and `profiles.bio` is relabelled "About our family"
-- (label and placeholder ONLY — no column change).
--
-- ---------------------------------------------------------------------------
-- THE EXPOSURE, AS MEASURED (not inferred) — V9 ticket 10's review cycle 1
-- ---------------------------------------------------------------------------
-- A child's photo could be LISTED AND DOWNLOADED by anyone, with no account and
-- no knowledge of any URL. Every fact below was verified live against this
-- project before this file existed:
--
--   * ONE bucket existed: `avatars`, `public = true`, with
--     `avatars_public_read` granted to role `public` (0011_profiles_v2.sql:154-170).
--   * Kid photos were written there at `<uid>/kids/<kidId>` and the URL came
--     from `getPublicUrl` (the kid-photo upload path, removed by this ticket),
--     while parent avatars lived at `<uid>/avatar`.
--   * With the anon key that SHIPS IN THE CLIENT BUNDLE and no session:
--         POST /storage/v1/object/list/avatars   {"prefix":""}
--       answered HTTP 200 and listed the user folders, and
--         POST /storage/v1/object/list/avatars   {"prefix":"<uid>/kids"}
--       answered HTTP 200 WITH 3 FILES — the exact `<uid>/kids/<kidId>` shape.
--     That single walk enumerated child-photo objects under one founder's
--     prefix (a LOWER BOUND: only the prefixes the root listing exposed were
--     walked). The bytes were then fetchable anonymously at
--         /storage/v1/object/public/avatars/<uid>/kids/<kidId>
--     No child's image was downloaded in the course of the investigation.
--   * THE PATHS ARE PERMANENT. `kids.avatar_url` stored the public URL,
--     `uploadKidAvatar` reused the same object name, and deleting a kid row did
--     NOT delete the object — so every URL ever handed out (including every one
--     handed to any signed-in parent before 0040 gated the column) resolved
--     signed out, forever.
--
-- Ticket 10 (0040, applied) gated the POINTER: after it, a signed-in stranger
-- reads `[]` from `kids` and cannot see `avatar_url` at all. It did not touch
-- the FILE. That is this migration.
--
-- ---------------------------------------------------------------------------
-- THE DECISION (human, 2026-09-13, verbatim: "yes, private bucket")
-- ---------------------------------------------------------------------------
-- OPTION A, recorded in .scratch/v9/issues/11-kid-photo-storage.md: kid photos
-- move to a PRIVATE bucket served by signed URLs, the already-uploaded files are
-- MIGRATED SO THEY SURVIVE, their OLD PUBLIC URLS DIE, and parent avatars are
-- SEPARATED from kid photos rather than locked down.
--
-- THE CONSEQUENCE THE HUMAN ACCEPTED WITH IT, stated once more because it is the
-- whole point rather than a side effect: "the files survive" is true of the
-- IMAGES, not of the OLD URLS. Every URL ever minted for a kid photo stops
-- resolving the moment the objects leave the public bucket — that IS the
-- closure, and it is why `kids.avatar_url` has to be rewritten (see section 4).
-- Deleting the objects instead would have been the other way to close it; the
-- human's standing "delete nothing" preference is why they were moved.
--
-- WHY NOT SIMPLY FLIP `avatars` PRIVATE: the SAME bucket holds PARENT avatars at
-- `<uid>/avatar`, which are public on purpose — every feed card, the detail page
-- and both profile pages render them straight from that URL. A bucket-level flip
-- would break all of them (option B in the ticket's table: a signed-URL dance on
-- every avatar render, for no privacy gain). Hence two buckets, not one flag.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS FILE DOES — five sections, all idempotent
-- ---------------------------------------------------------------------------
-- 1. Creates the PRIVATE bucket `kid-photos` as a `storage.buckets` ROW
--    (bucket creation is a row, not DDL), pinned `public = false` on every run.
-- 2. Adds the storage POLICIES on `storage.objects`, path-scoped with
--    `storage.foldername(name)` — the TWO PATH CLASSES and their DIFFERING
--    rules:
--      * `<uid>/kids/<kidId>`   → THE OWNER ALONE, forever. Nobody else may list
--        it or mint a signed URL for it — not another signed-in parent (that
--        would undo 0040's gate through the storage layer), not an anon caller.
--        The app renders NO kid photo at all any more; the class stays readable
--        by its owner so the images the human asked to KEEP remain reachable if
--        this decision is ever reversed.
--      * `<uid>/family/photo.<ext>` → ANY SIGNED-IN FAMILY. A "photo of your
--        family" will USUALLY DEPICT THE CHILDREN, so it must not be anonymous
--        (the ticket's T4): no public bucket, no anon read, no anon mint. It is
--        readable by every signed-in family because that is exactly the audience
--        `/u/:handle` has and the whole reason the parent adds it.
--    Writes (insert/update/delete) are owner-scoped on the FIRST folder, the
--    0011 `avatars_owner_*` pattern: a caller can only write under their own uid.
-- 3. Adds `profiles.family_photo_url text` (nullable, no CHECK — the caps are
--    app-enforced, the 0021 lesson). NO PROFILES RLS POLICY CHANGES: the column
--    rides the existing posture (the 0014/0016 column-add lesson), and a new
--    SELECT/UPDATE policy here could silently break the owner's own write
--    read-back.
-- 4. Documents the intent for `kids.avatar_url` — the column is KEPT and its
--    value is REWRITTEN BY THE COORDINATOR'S SCRIPT, not by this file (the
--    object move needs the Storage API, which SQL cannot reach; see below).
-- 5. Records the probes to run, including the object counts BEFORE and AFTER.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS FILE DELIBERATELY DOES NOT DO
-- ---------------------------------------------------------------------------
-- * IT DOES NOT MOVE ANY OBJECT, and it does not `update storage.objects`. THIS
--   PROJECT HAS NO OBJECT-MOVE HELPER — `pg_proc` has no
--   `storage.move_object` / `storage.copy_object` — so a raw row update would
--   move the ROW and STRAND THE BYTES in the old bucket: the storage API serves
--   objects from the (bucket_id, name) pair's backing store, and a row that
--   teleports between buckets points at bytes that are not there. The move is
--   therefore `node scripts/migrate-kid-photos.mjs --yes` (coordinator-run,
--   service-role, verify-then-delete), which reads each object through the
--   Storage API, writes it into `kid-photos`, verifies the bytes, and only then
--   deletes the public original.
-- * IT DOES NOT DELETE ANYTHING. No kid row, no kid photo, no URL, no column.
--   "Keep the files" is the human's intent and this file is non-destructive.
-- * IT DOES NOT TOUCH 0040. The kid-name gate (`kids_select_own_host_pinger_mod`,
--   the two INSERT policies with `kid_owned_by_caller`, the ages-only
--   `kid_ages_for`, the gated `get_playdate_kids`) is left exactly as it is: this
--   migration changes where an IMAGE lives and who may fetch its bytes, not who
--   may read a NAME.
-- * IT DOES NOT CHANGE THE PUBLIC SURFACE. `get_public_playdate` keeps its field
--   count; no kid photo and no family photo is added to the signed-out payload.
--   The only public object in this app remains the host's own avatar.
-- * IT DOES NOT SET `file_size_limit` / `allowed_mime_types` ON THE BUCKET. The
--   ≤5MB / image-only gate is app-enforced in `useCropStep.beginCrop` (via
--   `validateFamilyPhotoFile`), matching 0011's own no-limit posture on
--   `avatars`. Recorded as a decision: adding a server-side cap here would be a
--   new policy this ticket was not asked for and would need its own probe.
--
-- ---------------------------------------------------------------------------
-- SECTION 4 DETAIL: `kids.avatar_url` (ticket T7)
-- ---------------------------------------------------------------------------
-- The column STAYS (non-destructive; the human's "keep the files" intent) and
-- NOTHING RENDERS IT — the ticket's AC is "no code path reaches a kid's
-- avatar_url for display", and the client change removes the last one. Its
-- stored values, however, point at the soon-dead PUBLIC path, so leaving them
-- alone would leave a dead pointer in the database. The rewrite is done by the
-- move script in the same run that moves the objects, because that is the run
-- that can prove the destination exists:
--
--     update public.kids
--        set avatar_url = 'kid-photos/' || <the object path>
--      where id = '<kidId>' and profile_id = '<ownerUid>'
--        and avatar_url like '%/storage/v1/object/public/avatars/%'
--
-- The chosen value is the BUCKET-QUALIFIED OBJECT PATH (`kid-photos/<uid>/kids/
-- <kidId>`, the pure `kidPhotoStoredRef`). Why that shape, in three lines:
--   * the information worth keeping is the object path, and that is what is
--     stored;
--   * it is deliberately NOT a URL. Every URL form is either dead (the old
--     public one) or expiring (a signed one), and a stored expiring URL is a
--     broken image on a timer — the reason T6 forbids persisting one;
--   * the bucket prefix makes the value unambiguous, so a future reader (or the
--     reversal this keeps open) cannot mistake it for the old public shape or
--     for a bare key in the `avatars` bucket.
-- Rows whose object the script could NOT verify are NOT rewritten: an
-- unverifiable pointer is reported as a count and left for a human, because
-- rewriting it would claim an image exists that nobody has confirmed.
--
-- ---------------------------------------------------------------------------
-- THE PROBES TO RUN (counts are EVIDENCE, not claims in this header)
-- ---------------------------------------------------------------------------
-- P1. The bucket row exists and is PRIVATE:
--       select id, name, public from storage.buckets where id = 'kid-photos';
--     → one row, `public = false`.
-- P2. The new policies exist, one per command/class:
--       select policyname, cmd, qual from pg_policies
--        where schemaname = 'storage' and tablename = 'objects'
--          and policyname like 'kid_photos%' order by policyname;
--     → 5 rows (2 select, 1 insert, 1 update, 1 delete).
-- P3. The column exists and is nullable:
--       select column_name, is_nullable, data_type from information_schema.columns
--        where table_schema = 'public' and table_name = 'profiles'
--          and column_name = 'family_photo_url';
--     → 1 row, `is_nullable = YES`, `text`.
-- P4. PostgREST sees the column (no PGRST205):
--       GET /rest/v1/profiles?select=family_photo_url&limit=1   (the app's key)
--     → HTTP 200.
-- P5. NO profiles/kids policy changed — before and after must be identical:
--       select tablename, policyname, cmd, roles, qual from pg_policies
--        where schemaname = 'public' and tablename in ('profiles','kids')
--        order by tablename, policyname;
--     → byte-identical to the same query run before this file was applied.
-- P6. THE OBJECT COUNTS (the ticket's "nothing is lost silently" AC) — run
--     BEFORE applying, BETWEEN applying and the script, and AFTER the script.
--     THIS HEADER MAKES NO CLAIM ABOUT WHAT THE NUMBERS WILL BE; the coordinator
--     records them. What IS recorded here is the BEFORE state, MEASURED
--     read-only through `node scripts/apply-migration.mjs --sql "<these four
--     counts>"` before this file was written (HTTP 201):
--         public_kid_objects = 3   ← the exposure: three child photos anon-listable
--         private_kid_objects = 0  (the bucket did not exist)
--         kids_rows_with_legacy_url = 3   kids_rows_rewritten = 0
--     and the same probe answered `buckets = 1` (only `avatars`) and
--     `move_helpers = 0` (no storage.move_object / copy_object in pg_proc — the
--     reason this ticket needs a script at all).
--     The queries:
--       select count(*) as kid_objects_in_public_bucket from storage.objects
--        where bucket_id = 'avatars'
--          and split_part(name, '/', 2) = 'kids';
--       select count(*) as kid_objects_in_private_bucket from storage.objects
--        where bucket_id = 'kid-photos'
--          and split_part(name, '/', 2) = 'kids';
--       select count(*) as kids_rows_with_legacy_url from public.kids
--        where avatar_url like '%/storage/v1/object/public/avatars/%';
--       select count(*) as kids_rows_rewritten from public.kids
--        where avatar_url like 'kid-photos/%';
--     EXPECTED END STATE, counted rather than asserted: the first is 0, the
--     second equals whatever the first was before the script ran (3, as measured
--     above), and the third is 0. A non-zero FIRST count after the script means
--     the exposure is still open — the script prints exactly that warning.
-- P7. THE CORE PROBE — the exact call that found the exposure, run with the anon
--     key ALONE (no session). It must answer with NO kid objects, and the same
--     walk must still list the `avatars` bucket (parent avatars stay public):
--       POST /storage/v1/object/list/avatars   {"prefix":""}
--       POST /storage/v1/object/list/avatars   {"prefix":"<uid>/kids"}
--     → HTTP 200 for both; the second answers `[]` for EVERY uid.
--     `e2e/kid-photo-exposure.e2e.ts` runs this walk on every full e2e gate
--     (PIVOT A, its test 1).
--
--     AND THE OLD URL ITSELF (review cycle 1, F7). The e2e spec CANNOT prove this
--     one — the only key it could name has never existed in a spec run (no spec
--     uploads a kid photo to the public bucket), so its assertion there is
--     labelled a SHAPE check, not evidence. This is the real one; run it against
--     a key the dry run printed, CACHE-BUSTED:
--       KEY='<uid>/kids/<kidId>'                        # from the dry-run output
--       URL="https://<ref>.supabase.co/storage/v1/object/public/avatars/$KEY"
--       curl -s -o /dev/null -w '%{http_code}\n' "$URL?cb=$(date +%s)"   # BEFORE → 200
--       node scripts/migrate-kid-photos.mjs --yes
--       curl -s -o /dev/null -w '%{http_code}\n' "$URL?cb=$(date +%s)"   # AFTER  → not 200
--     The `?cb=` is required, not cosmetic — see the cache tail below.
--
--     THE ≤1h CDN CACHE TAIL, stated plainly (review cycle 1, F5). Every object in
--     `avatars` is stored with `cache-control: max-age=3600` (probed live), so the
--     CDN can keep serving a DELETED public URL for up to an hour — and no row
--     count, no policy and no SQL query can see that tail. The move script
--     attempts a CDN purge per moved key and reports how many were refused
--     (Supabase's storage API does not document a purge endpoint), so the honest
--     statement is: the closure is complete at the ORIGIN the moment the object
--     rows are gone, and complete at every EDGE within the hour. Read a single 200
--     on an old URL within the hour as a CACHE HIT, never as a failed move — and
--     never read one 404 as proof for every edge.
--
-- P8. THE SIGNED-URL PAIR, proving the two classes differ (the ticket's T4
--     "prove it with a probe, not an assumption"):
--       * as the OWNER:  POST /storage/v1/object/sign/kid-photos/<uid>/kids/<kidId>
--         → 200 with a signed URL (the family can still reach the file it kept);
--       * as ANOTHER SIGNED-IN FAMILY:
--         POST /storage/v1/object/sign/kid-photos/<ownerUid>/kids/<kidId>
--         → NOT 200 (a signed-URL path must never let one parent fetch another
--         family's kid photos — that would undo 0040's gate);
--       * as ANOTHER SIGNED-IN FAMILY, for the FAMILY class:
--         POST /storage/v1/object/sign/kid-photos/<ownerUid>/family/photo.jpg
--         → 200 (signed-in families see each other's family photo on /u/:handle).
-- P9. An anon read of `kids` stays `[]` (0040 still intact), and anon cannot
--     list `kid-photos` at all.
-- P10. THE BUCKET IS STILL PRIVATE — the property the whole closure rests on
--     (review cycle 1, F2). The move script refuses to run unless this holds, and
--     it re-checks it as its last act with one anonymous fetch of a key that now
--     EXISTS in the private bucket:
--       GET /storage/v1/object/public/kid-photos/<uid>/kids/<kidId>   → not 200
--     → P1 again after the move: `select id, public from storage.buckets where
--     id = 'kid-photos';` — `public` must still be false.
--
-- Apply path (coordinator only):
--   node scripts/apply-migration.mjs supabase/migrations/0038_kid_photo_storage.sql
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) THE PRIVATE BUCKET. A bucket is a ROW in storage.buckets, not DDL.
--
-- `on conflict do update` rather than `do nothing`, following 0011's own form
-- for `avatars`: a re-run of this file then RE-PINS `public = false` instead of
-- leaving a flipped flag alone. Idempotent, and re-running is the repair — the
-- same property 0040 relies on. 0038 is the file that owns this bucket.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('kid-photos', 'kid-photos', false)
on conflict (id) do update
set name = excluded.name, public = false;

-- ---------------------------------------------------------------------------
-- 2) THE STORAGE POLICIES. Postgres has NO `create policy if not exists`, so
-- every policy is DO-block guarded on pg_policies — the 0011/0022/0040 pattern.
--
-- The path scope is `(storage.foldername(name))[1]` = the owner's uid and
-- `[2]` = the class folder, i.e. the SAME two segments the client's pure
-- `photoStorage.ts` rules use, so the policies and the app agree by construction.
-- `foldername` is 1-based and DROPS the object's own name: for
-- `<uid>/kids/<kidId>` it answers `{<uid>, kids}`.
--
-- The class check is on folder 2 and is REQUIRED, not decoration: without it the
-- two classes would collapse into one rule, and the only rule that keeps a kid
-- photo out of another parent's hands is the one that says `kids`.
-- ---------------------------------------------------------------------------
do $$
begin
  -- 2a) THE KID CLASS, READ: the owner alone. `to authenticated` (never
  -- `public`), and the first-folder check is the whole gate: another signed-in
  -- parent fails `foldername(name)[1] = auth.uid()::text` and an anon caller
  -- matches no policy for this bucket at all. The storage API requires SELECT
  -- on an object before it will mint a signed URL for it, so this same policy is
  -- what makes P8's stranger-mint attempt fail.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'kid_photos_read_own_kids'
  ) then
    create policy "kid_photos_read_own_kids"
      on storage.objects for select
      to authenticated
      using (
        bucket_id = 'kid-photos'
        and (storage.foldername(name))[2] = 'kids'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  -- 2b) THE FAMILY CLASS, READ: any signed-in family. NO owner check — that is
  -- the point of the class (it renders on /u/:handle, which only signed-in
  -- families can open). It stays OUT of the public bucket so no anon caller can
  -- list or fetch it: a family photo usually depicts the children.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'kid_photos_read_family'
  ) then
    create policy "kid_photos_read_family"
      on storage.objects for select
      to authenticated
      using (
        bucket_id = 'kid-photos'
        and (storage.foldername(name))[2] = 'family'
      );
  end if;

  -- 2c) WRITES: owner-scoped on the first folder, exactly 0011's
  -- avatars_owner_* shape, for BOTH classes. The app today writes only
  -- `<uid>/family/photo.jpg` (the kid-photo upload is gone), and the kid class
  -- keeps its write path so the reversal this migration preserves is not
  -- half-blocked by policy. A cross-user write cannot even name a path.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'kid_photos_owner_insert'
  ) then
    create policy "kid_photos_owner_insert"
      on storage.objects for insert
      to authenticated
      with check (
        bucket_id = 'kid-photos'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  -- update: `using` (which rows may be chosen) AND `with check` (what they may
  -- become) — 0011's own pair. Both key on the first folder, so an UPDATE can
  -- neither reach another family's object nor move one into another's folder.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'kid_photos_owner_update'
  ) then
    create policy "kid_photos_owner_update"
      on storage.objects for update
      to authenticated
      using (
        bucket_id = 'kid-photos'
        and (storage.foldername(name))[1] = auth.uid()::text
      )
      with check (
        bucket_id = 'kid-photos'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'kid_photos_owner_delete'
  ) then
    create policy "kid_photos_owner_delete"
      on storage.objects for delete
      to authenticated
      using (
        bucket_id = 'kid-photos'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end
$$;

-- THE `avatars` BUCKET IS UNTOUCHED, ON PURPOSE (the ticket's T5). Its
-- `public = true` flag and all four 0011 policies (`avatars_public_read` for
-- role `public`, and the three owner-scoped writes) stay exactly as they are:
-- parent avatars remain PUBLIC, with no signed-URL indirection, because every
-- card and the detail page render them and the human chose separation rather
-- than lockdown. This file adds no policy to that bucket and drops none.

-- ---------------------------------------------------------------------------
-- 3) THE FAMILY PHOTO COLUMN (ticket 08's half).
--
-- Nullable, `text`, no CHECK and NO RLS CHANGE: the ≤500-char/≤5MB style caps in
-- this schema are app-enforced (the 0021 address lesson), and the column rides
-- the existing profiles SELECT/UPDATE posture (the 0014/0016 column-add lesson:
-- a column added under an unchanged policy set is the safe move, while a new
-- SELECT policy is exactly how an owner's own write read-back gets 42501'd).
--
-- IT HOLDS AN OBJECT PATH, NOT A URL, despite the name: e.g.
-- `kid-photos/<uid>/family/photo.jpg`. The image is in the PRIVATE bucket and a
-- signed URL expires, so a persisted URL would break on a timer (T6). The render
-- sites mint one from this path (batched, best-effort, never written back).
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists family_photo_url text;

comment on column public.profiles.family_photo_url is
  'V9 ticket 11 (migration 0038): the optional family photo, uploaded through the avatar pipeline (square crop, 512px, <=5MB). Holds an OBJECT PATH in the PRIVATE kid-photos bucket (e.g. kid-photos/<uid>/family/photo.jpg), NEVER a URL: signed URLs expire, so they are minted at render time by db.signedFamilyPhotoUrls and never persisted. Readable by any signed-in family (the photo usually depicts the children, so it is not public and has no anon read). Pre-0038 this column does not exist (the render is null-safe).';

-- ---------------------------------------------------------------------------
-- 4) `kids.avatar_url` — THE INTENT, DOCUMENTED HERE, DEFERRED TO THE SCRIPT.
--
-- No UPDATE runs in this file. The rewrite has to happen in the SAME run that
-- moves the bytes (the script), because only that run can prove the destination
-- object exists — and rewriting a pointer to an unverified object would be a
-- claim the migration cannot support. The exact statement, the chosen value's
-- shape and the reason for it are in SECTION 4 DETAIL at the top of this file.
--
-- The comment below lands on the live column so the decision travels with the
-- schema rather than only with this file.
-- ---------------------------------------------------------------------------
comment on column public.kids.avatar_url is
  'V9 ticket 11 (migration 0038): KEPT, NEVER RENDERED. No code path may reach a kid''s avatar_url for display (the upload control is gone and no kid photo appears anywhere on the app). INTENDED END STATE, reached only once scripts/migrate-kid-photos.mjs has run: the value is the bucket-qualified OBJECT PATH of the private copy (kid-photos/<uid>/kids/<kidId>) — never a URL, because the old public URL is dead by design (that IS the closure) and a signed one expires. Until that script runs, the value still holds the dead public URL; rows whose object the script could not verify are left alone and reported, so this column is the place to check which state a row is in (the P6 count probe in this file''s header is the query).';

-- ---------------------------------------------------------------------------
-- 5) DONE. The probes in the header are the acceptance evidence; section 1's
-- `on conflict do update` and section 2's DO-block guards make re-running this
-- file safe, and re-running it is how a drift (a bucket flipped public, a
-- policy dropped) is repaired.
--
-- THE GATE, in order:
--   1. node scripts/apply-migration.mjs supabase/migrations/0038_kid_photo_storage.sql
--   2. node scripts/migrate-kid-photos.mjs           # DRY RUN: the plan, no writes
--   3. node scripts/migrate-kid-photos.mjs --yes     # the move + the rewrite
--   4. the probes above (P6 counts, P7 the core probe, P8 the signed-URL pair)
--   5. npm run test:e2e                              # e2e/kid-photo-exposure.e2e.ts
-- ---------------------------------------------------------------------------

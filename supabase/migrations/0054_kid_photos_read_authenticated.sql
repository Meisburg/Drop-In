-- ===========================================================================
-- V25 ticket 14 (migration 0054): a kid's photo is visible to any SIGNED-IN
-- parent — the class guard stays, the owner check goes.
-- ===========================================================================
--
-- WHY 0054 AND NOT 0053: another writer holds 0053 (`0053_email_optout.sql`,
-- uncommitted in the main checkout while this file was written — the batch
-- ledger records the contention). A free number costs nothing; a collision in a
-- live-migration directory does.
--
-- ---------------------------------------------------------------------------
-- THE DECISION (founder, 2026-09-26, via the CoS; verbatim in
-- .scratch/v25/issues/14-kids-photos-visible.md and in the batch ledger)
-- ---------------------------------------------------------------------------
--   "I don't think the photos should be private. I think it's optional if you
--    want to upload photos and if someone chooses to upload photos, other
--    people should be able to see them."
--   "It's no different than how anyone uses social media like Facebook where
--    people share pictures of their kids. I think it's fine."
--
-- Restated: uploading a child's photo stays OPTIONAL; when a parent uploads one,
-- other SIGNED-IN parents may see it. "People" is scoped to signed-in parents
-- (AGENTS.md: "parents authenticate before seeing anything"); the open internet
-- is NOT granted, and the ticket records that as a separate open question.
--
-- IT REVERSES AN INVARIANT, DELIBERATELY AND WITH AUTHORITY. V9 ticket 11
-- (0038) moved the kid class into this PRIVATE bucket and gave it
-- `kid_photos_read_own_kids` — `to authenticated` AND
-- `(storage.foldername(name))[1] = auth.uid()::text`, i.e. THE OWNER ALONE. The
-- 2026-09-13 human confirmation of that (option A) and this 2026-09-26 reversal
-- are both on the record; the reversal is authorized. 0038's own header
-- anticipated it: the class stayed readable by its owner "so the images the
-- human asked to KEEP remain reachable if this decision is ever reversed".
--
-- ---------------------------------------------------------------------------
-- WHAT CHANGES — exactly one thing
-- ---------------------------------------------------------------------------
-- The SELECT policy for the KID class. The owner check goes; the CLASS check
-- (`(storage.foldername(name))[2] = 'kids'`) and the role (`to authenticated`)
-- stay. The family class keeps its own separate rule (`kid_photos_read_family`,
-- 0038) — this file must not collapse the two classes into one.
--
-- WHAT THIS REVERSAL DOES NOT AUTHORIZE (the ticket's own boundary):
--   * THE BUCKET STAYS PRIVATE. `storage.buckets.public` stays false (re-pinned
--     below; a no-op while it is already false). A `/object/public/kid-photos/…`
--     fetch therefore answers non-200 for EVERYONE, signed in or not.
--   * ANON STILL READS NOTHING. Every policy in this bucket is
--     `to authenticated`; role `anon` matches none, so a signed-out caller can
--     neither list, nor fetch, nor mint for any object here.
--   * NO WRITE WIDENS. insert / update / delete stay owner-scoped on the FIRST
--     folder (0038's `kid_photos_owner_*`). This file adds no write policy and
--     drops none.
--   * 0040's NAME GATE IS UNTOUCHED (the asymmetry note at the bottom).
--
-- ---------------------------------------------------------------------------
-- THE HONEST CONSEQUENCE, stated rather than buried
-- ---------------------------------------------------------------------------
-- Widening a storage SELECT policy widens the whole storage API surface for
-- that class, not just the one render path. After this file, ANY authenticated
-- caller may
--   (a) MINT a signed URL for any `<uid>/kids/<kidId>` object,
--   (b) LIST objects under `<uid>/kids` — and, with a root listing, discover the
--       kid-class objects of every family (the List API filters rows by this
--       same policy),
--   (c) FETCH the bytes behind any signed URL they minted.
-- That IS the decision ("other people should be able to see them"), and it is
-- the same surface the FAMILY class has had since 0038. What it is NOT is
-- discovery of NAMES: 0040 still returns `kids` rows only to the family, the
-- host/pinger of a shared drop-in, and moderators, so a signed-in stranger can
-- fetch a photo whose path they somehow know, but still cannot read the child's
-- name (or the kid id, or the `avatar_url` column) out of the database.
--
-- ---------------------------------------------------------------------------
-- IDEMPOTENT AND RE-PASTE-SAFE
-- ---------------------------------------------------------------------------
-- `create policy` has no `IF NOT EXISTS` (the 2026-09-04 rule), so the
-- replacement is the 0040 pattern exactly: `drop policy if exists` for the OLD
-- name, then a DO-block-guarded create of the NEW name keyed on `pg_policies`.
-- `drop policy if exists` is itself the guard (it is a no-op when absent), which
-- is why 0040 uses it to replace a policy rather than to be "non-additive".
--   * Run once: the old (owner-scoped) policy is dropped, the new
--     (class-scoped) one is created.
--   * Run again: the old name is already gone (no-op) and the new name already
--     exists (the guarded create is a no-op). The end state is identical.
--   * A state where BOTH exist converges too: the old is dropped, the new stays.
--     (Storage policies are OR'd, so a lingering old policy could never have
--     narrowed the new one anyway.)
-- THE NEW NAME IS PART OF THE FIX: a policy still called `…_own_kids` while it
-- grants every signed-in parent would be a name that lies about the rule it
-- enforces — the defect class this batch keeps paying for.
-- FAIL-CLOSED INTERVAL: between the drop and the create the kid class has no
-- SELECT policy of its own, so reads are REFUSED rather than opened. A failure
-- there leaves the class closed and is reported by P1 below, never a silent
-- widening.
--
-- ---------------------------------------------------------------------------
-- THE PROBES TO RUN (counts are evidence, not claims in this header)
-- ---------------------------------------------------------------------------
-- MEASURED read-only BEFORE this file was written (`bash scripts/db-sql.sh
-- --read "…"`, HTTP 201 both):
--   * five `kid_photos%` policies exist, and the kid-class SELECT is
--     `kid_photos_read_own_kids` with
--     `bucket_id = 'kid-photos' AND foldername(name)[2] = 'kids' AND
--      foldername(name)[1] = auth.uid()::text`;
--   * `storage.buckets`: `kid-photos` → public = false, `avatars` → public = true;
--   * `storage.objects` in `kid-photos`: 4 objects in the `kids` class, 2 in the
--     `family` class (6 total).
-- P1. The replacement happened and the old name is gone:
--       select policyname, cmd, roles::text, qual from pg_policies
--        where schemaname = 'storage' and tablename = 'objects'
--          and policyname like 'kid_photos%' order by policyname;
--     EXPECTED: still five rows; the kid-class SELECT is `kid_photos_read_kids`
--       with qual `bucket_id = 'kid-photos' AND foldername(name)[2] = 'kids'`
--       and NO `auth.uid()` term; no row named `kid_photos_read_own_kids`.
-- P2. The bucket is still private:
--       select id, public from storage.buckets where id = 'kid-photos';
--     EXPECTED: one row, public = false.
-- P3. THE WALL, from anon: mint for a real kid object with the ANON key alone
--       POST /storage/v1/object/sign/kid-photos/<uid>/kids/<kidId>
--     EXPECTED: no `token=` URL.
-- P4. THE REVERSAL, from a NON-OWNER session: the same POST with another
--     signed-in parent's JWT.
--     EXPECTED: 200 with a `token=` URL. (This one is proven with a real second
--     account's session in e2e/kid-photo-exposure.e2e.ts — a shell probe here
--     would need that account's token, so it is the lane's evidence, not this
--     header's claim.)
-- P5. The anon List API still finds nothing in this bucket:
--       POST /storage/v1/object/list/kid-photos  {"prefix":""}   (anon key)
--     EXPECTED: [].
-- P6. The NAME gate is unchanged (0040), asserted by e2e/kid-names-privacy.e2e.ts
--     3b/6b: a signed-in stranger's `kids?profile_id=eq.<owner>` read → [].
--
-- Apply path (coordinator only):
--   bash scripts/db-sql.sh --file supabase/migrations/0054_kid_photos_read_authenticated.sql
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) THE BUCKET STAYS PRIVATE. 0038 owns this row; re-pinning `public = false`
-- here makes the property this file DEPENDS ON part of the file, and it is a
-- no-op whenever 0038's own re-pin already holds (which the P2 measurement
-- above says it does). `on conflict do update` is 0038's own form: re-running is
-- the repair if the flag ever drifts.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('kid-photos', 'kid-photos', false)
on conflict (id) do update
set name = excluded.name, public = false;

-- ---------------------------------------------------------------------------
-- 2) THE KID-CLASS READ POLICY, REPLACED (not added to: the owner check is the
-- thing being removed, so this table has exactly one kid-class SELECT rule
-- afterwards, as it did before).
--
-- The DO block below is the 0011/0022/0038/0040 guard pattern and is what makes
-- a re-paste a no-op. The `drop policy if exists` above it is unconditional on
-- purpose — it must remove the OLD NAME from any state, and it is the guard for
-- a policy that may legitimately not exist.
-- ---------------------------------------------------------------------------
drop policy if exists "kid_photos_read_own_kids" on storage.objects;

do $$
begin
  -- THE KID CLASS, READ: any SIGNED-IN parent. `to authenticated` (never
  -- `public`, never `anon`), and the CLASS check on the second folder is the
  -- whole remaining gate — the same segment `photoStorage.ts`'s
  -- `isKidPhotoPath` and this repo's path rules key on, so the policy and the
  -- app agree by construction. Dropping the class check would swallow the
  -- family class and widen the whole bucket; it stays.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'kid_photos_read_kids'
  ) then
    create policy "kid_photos_read_kids"
      on storage.objects for select
      to authenticated
      using (
        bucket_id = 'kid-photos'
        and (storage.foldername(name))[2] = 'kids'
      );
  end if;
end
$$;

-- The rule travels with the policy, not only with this file (0038's own
-- `comment on column` reasoning). `comment on` overwrites in place, so it is
-- idempotent without a guard.
comment on policy "kid_photos_read_kids" on storage.objects is
  'V25 ticket 14 (migration 0054): the kid class (<uid>/kids/<kidId>) in the PRIVATE kid-photos bucket is readable by ANY authenticated parent, not its owner alone — the founder reversed V9 ticket 11''s owner-only rule on 2026-09-26 ("if someone chooses to upload photos, other people should be able to see them"). The CLASS check ((storage.foldername(name))[2] = ''kids'') is the remaining gate and must stay: without it this rule would swallow the family class. Role is authenticated, never public/anon, and the bucket stays public = false, so a signed-out caller can neither read, list nor mint for any object here. Writes stay owner-scoped (kid_photos_owner_insert/update/delete). It replaces kid_photos_read_own_kids, whose name and owner check both had to go.';

-- THE FAMILY CLASS IS UNTOUCHED. `kid_photos_read_family` is already
-- `to authenticated` with no owner check (0038), which is what makes the
-- reversal below consistent rather than a special case, and the three
-- owner-scoped write policies (`kid_photos_owner_insert/update/delete`) are
-- untouched: this ticket widens who may READ, and nothing about who may WRITE.

-- ---------------------------------------------------------------------------
-- 3) THE ASYMMETRY THIS FILE DOES NOT FIX (ticket note 7 — flagged, not
-- silently aligned). Migration 0040 still limits a kid's first NAME (and the
-- `kids` rows themselves) to the family, a host/pinger on a shared drop-in, and
-- moderators. After this file a signed-in parent who somehow knows a kid
-- object's path can fetch the FACE while still being refused the NAME. Closing
-- that gap means changing 0040, which is a separate decision and is NOT taken
-- here.
-- ---------------------------------------------------------------------------

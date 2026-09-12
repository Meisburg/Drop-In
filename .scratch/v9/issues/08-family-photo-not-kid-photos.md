# 08: Profile — no kid photos; an optional family photo + about-us

**What to build:** Her words: *"my wife says that you shouldn't upload pictures
of the kids next to the kids profile, but in the bio for the adult there could be
like a place where they going to upload a photo of their family and then they
could have like a little like about me section like a description about their
family but it's all optional they don't have to post it."*

This **reverses a decision the human made on 2026-09-09** ("kid photos = YES —
overrides the first-name-only privacy pin"), and the person who has to live with
it is the one asking. Do the reversal without destroying anything: stop rendering
kid photos and remove the control, keep the stored files, and give the parent a
family photo and a family description instead — both optional.

**Blocked by:** Ticket 07 (one-writer).

**Status:** ready-for-agent — **pending one human confirmation** (this reverses a
logged decision; see the judgment call)

- [ ] The kid editor on `/profile` **loses its photo control entirely**: a kid row
  is first name (optional), age, likes. No upload, no preview, no camera
- [ ] Kid photos **stop rendering anywhere**: `/u/:handle`'s kid rows drop the
  40px circle (they show name · age · likes), and the full-screen lightbox no
  longer opens for a kid's photo. No code path may reach a kid's `avatar_url`
- [ ] **Nothing is deleted.** The `kids.avatar_url` column and the storage objects
  stay (no destructive migration) so this stays a UI decision that can be reversed
  — documented in the ticket and in the migration header
- [ ] `/profile` gains **"A photo of your family"** (optional, one image, the
  existing avatar pipeline's rules: 256/512px square, ≤5MB, the crop step) stored
  at `profiles.family_photo_url` with the storage path `<uid>/family/…` (under
  0011's owner-scoped write policies — **verify the path policy covers a
  `family/` folder, and report it if it does not** rather than writing new
  storage DDL silently)
- [ ] The existing `bio` field is **reframed as "About our family"** (label and
  placeholder only — no new column): optional, ≤500 chars, and the profile's
  nudge banner language follows ("Parents like knowing who they're meeting")
- [ ] `/u/:handle` and `/profile` render, in order: family photo (when set) →
  "About our family" (when set) → the kids list (name · age · likes) → the rest.
  Every one of them is optional and the page must look finished with none of them
- [ ] The signed-out public surface is unchanged in shape: `get_public_playdate`
  keeps its field count; the host's own avatar is the only image on a public
  drop-in (a family photo is NOT added to the public payload in this ticket — say
  so in the report if you disagree)
- [ ] Pure seams + unit tests: `familyPhotoPath(profileId, ext)` (the `<uid>/family/`
  prefix), the family-photo validator reusing the avatar rules, and
  `profileBlurbOrder(profile)` (which optional blocks render, pinned order)
- [ ] New e2e `family-photo.e2e.ts`: uploading a family photo shows it on
  `/profile` and `/u/:handle`; a kid row shows no photo anywhere (asserted by the
  ABSENCE of an `<img>` in the kid row and no photo control); "About our family"
  saves and renders; an empty profile still renders cleanly; **red-by-design
  pre-0038** only for the new column's parts
- [ ] `npm run build && npm run test && npm run test:e2e` exit 0

**Migration check:** **REQUIRED — `supabase/migrations/0038_profiles_family_photo.sql`**
(number reserved; next free wins if the queue reorders).

- *Idempotency:* `add column if not exists profiles.family_photo_url text`;
  nothing else. Storage DDL only if the reviewer's path audit shows 0011's
  policies do NOT cover `<uid>/family/…` (in which case say so loudly and add the
  narrowest possible policy in a DO block).
- *Header must document:* that kid photos are hidden by UI decision while the
  column and the files REMAIN (a reversal must not be data loss), the
  `<uid>/family/` path and which storage policy covers it, and that no RLS policy
  on `profiles` changed (the column rides the existing posture — the 0014/0016
  column-add lesson).
- *Apply path (coordinator only):* `node scripts/apply-migration.mjs supabase/migrations/0038_*.sql`.
- *Post-apply probes:* (1) the column exists and is nullable; (2) a PostgREST read
  of `profiles?select=family_photo_url` → 200 (no PGRST205); (3) an upload to
  `<uid>/family/…` succeeds with the owner's JWT and **fails** with another
  account's JWT (the storage policy is the wall); (4) the kids' `avatar_url`
  values are still in the database (proof the reversal hid nothing destructive).
- *Human-owned:* confirm the reversal of the 2026-09-09 kid-photo decision.

**Verify:** `npm run build && npm run test`; `npx playwright test
e2e/family-photo.e2e.ts e2e/profiles-v2.e2e.ts e2e/kids-v3.e2e.ts`; full suite;
live phone pass — upload a family photo, then confirm no kid photo appears
anywhere.

## Comments

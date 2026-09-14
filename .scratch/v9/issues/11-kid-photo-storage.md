# 11: Kid photos — close the public storage exposure; family photo instead

**Filed:** 2026-09-13 by the coordinator, out of V9 ticket 10's review cycle 1
(a fresh-context reviewer verified the exposure live), on the human's explicit
instruction.
**Folds in:** **ticket 08** ("Profile — no kid photos; an optional family photo +
about-us"). Ticket 08 is not a separate work item any more: its kid-photo
reversal and its family-photo feature both run through the same storage path and
the same bucket decision, so they ship together here. Ticket 08's own file
carries a FOLDED note; its `0038` reservation carries over to this ticket.

**Status:** `ready-for-agent` — the DECISION was CONFIRMED by the human on
2026-09-13 (option A: private bucket + signed URLs, files migrated, old public
URLs die, parent avatars separated). Recorded below.

## The exposure, verified live (not inferred)

**A child's photo can be listed and downloaded by anyone, with no account and no
knowledge of any URL.** Kid photos are stored in the `avatars` bucket, which is
**public**, and that bucket is readable by the `public` role:

- `BUCKET | avatars | public = true`, and `STORAGEPOL | avatars_public_read |
  cmd=SELECT | roles={public} | qual=(bucket_id = 'avatars'::text)`.
- Kid photos are written there by `src/lib/db.ts:2556-2572` at the path
  **`<uid>/kids/<kidId>`**, with the URL minted by `getPublicUrl`
  (`src/lib/db.ts:2507`).
- Using **only the anon key that ships in the client bundle** (no session, no
  JWT): `POST /storage/v1/object/list/avatars` with `{"prefix":""}` → **HTTP 200**
  listing user folders, and with `{"prefix":"<uid>/kids"}` → **HTTP 200 with 3
  files** — the exact `<uid>/kids/<kidId>` shape. That one probe enumerated **6
  child-photo objects** (a LOWER BOUND: only the prefixes the root listing
  exposed were walked). The bytes are then fetchable anonymously at
  `/storage/v1/object/public/avatars/<uid>/kids/<kidId>`. No child's image was
  downloaded in the course of this investigation.
- **The paths are permanent.** `kids.avatar_url` stores the URL; the app appends
  only a cache-busting `?v=` (`db.ts:2518-2524`); `uploadKidAvatar` reuses the
  same object name; and deleting the kid row does **not** delete the object. So
  every URL ever handed out — including every URL that was world-readable to any
  signed-in parent before V9 ticket 10 (measured: a stranger's read returned 6
  kid rows including 3 photo URLs) — still resolves, signed out.

**Why this is a separate ticket from 10.** Ticket 10 gated the *column*: after
0040 a stranger cannot read `kids.avatar_url` (verified — the same JWT that read
6 rows now reads `[]`). That closed the *pointer*, not the *file*. The object
remains publicly listable and fetchable, which is why ticket 10's copy was
corrected to stop claiming photos were gated, and why this ticket exists.

## THE DECISION — CONFIRMED 2026-09-13

**The human chose option A, verbatim: "yes, private bucket."** So: kid photos
move to a PRIVATE bucket served by signed URLs; the already-uploaded files are
**migrated so they survive** and their **old public URLs die**; parent avatars
are **separated** from kid photos and keep their public posture.

**One consequence the human accepted with it:** "the files survive" is true of
the *images*, not of the *old URLs* — the whole point of the move is that a
previously anonymous URL stops resolving.

The reason this is a decision and not a detail: **the `avatars` bucket is shared
with PARENT avatars** (`<uid>/avatar`, written by `uploadAvatarObject`, rendered
on every card and the detail page, deliberately public). So you cannot simply
flip `avatars` private — that would break every parent avatar in the app. The two
paths have to be separated:

| option | files kept? | exposure closed? | cost |
|---|---|---|---|
| **A (recommended)** new private bucket (e.g. `kid-photos`), kid photos moved there, read via signed URLs for the family | yes | yes — the public copies stop resolving | one storage migration + a signed-URL read path; `kids.avatar_url` must be rewritten |
| B make `avatars` private and serve parent avatars by signed URL too | yes | yes | every avatar render becomes a signed-URL dance — a big regression for no privacy gain |
| C leave the bucket and just remove the kid-photo UI (ticket 08's original plan) | yes | **NO** — the files stay anonymously fetchable forever | cheapest, does not fix the finding |
| D delete the kid-photo objects outright | no | yes | destructive; contradicts the human's earlier "delete nothing" preference — and it is the only option that makes the already-published URLs *and* the stored URLs dead |

**C is the option the earlier plan implicitly assumed and this finding
disqualifies.** A and D both close the exposure; A is the non-destructive one.
**The human should also know:** under A, `kids.avatar_url` values in the database
must be rewritten to the new bucket (and the old objects removed from the public
bucket), so "we kept the files" is true of the *images* but the *old public
URLs* are gone by design — that is the closure.

## Acceptance criteria

- [x] The DECISION is CONFIRMED (2026-09-13, the human: "yes, private bucket") and recorded above
- [ ] **The exposure is closed and PROVEN closed:** an anonymous request can no
  longer list or fetch any kid photo — the exact probe that found it
  (`POST /storage/v1/object/list/avatars` with `{"prefix":"<uid>/kids"}` using
  only the anon key) must answer with **no kid-photo objects**, and a fetch of an
  old public kid-photo URL must **fail**. A signed-URL read by the family still
  works
- [ ] **Parent avatars are unaffected** — they keep rendering on cards, the detail
  page and `/profile` with no signed-URL indirection for them
- [ ] **Kid photos stop being uploaded and stop being rendered** (ticket 08's
  reversal, kept): the kid editor on `/profile` loses its photo control entirely
  (no upload, no preview, no camera); no code path reaches a kid's `avatar_url`
  for display; `/u/:handle`'s kid rows show name · age · likes
- [ ] **Nothing is lost silently:** whatever the decision does to the stored
  objects is stated in the ticket and the migration header, and the number of
  kid-photo objects before and after is RECORDED (a probe, not a claim)
- [ ] `/profile` gains **"A photo of your family"** (optional, one image, the
  existing avatar pipeline's rules: square crop, ≤5MB, the crop step) stored at
  `profiles.family_photo_url`, with parent avatars' public posture unchanged and
  a documented decision about the family photo's own visibility (it is the
  parent's own image and may be public like an avatar — say which, and why)
- [ ] The existing `bio` field is reframed as **"About our family"** (label and
  placeholder only, no new column): optional, ≤500 chars, and the profile nudges
  follow
- [ ] `/u/:handle` and `/profile` render, in order: family photo (when set) →
  "About our family" (when set) → the kids list (name · age · likes) → the rest,
  and the page looks finished with none of them
- [ ] `get_public_playdate` keeps its field count; no kid photo and no family
  photo is added to the signed-out payload in this ticket
- [ ] Pure seams + unit tests: `familyPhotoPath(profileId, ext)`, the
  family-photo validator reusing the avatar rules, `profileBlurbOrder(profile)`
  (which optional blocks render, pinned order), and the kid-photo path/URL
  decision
- [ ] New e2e `kid-photo-exposure.e2e.ts`: the anonymous list probe above returns
  no kid objects; a kid row shows no `<img>` and no photo control anywhere; the
  family photo uploads and renders; "About our family" saves and renders; an
  empty profile still renders cleanly
- [ ] `npm run build && npm run test && npm run test:e2e` exit 0

**Migration check:** **REQUIRED — `supabase/migrations/0038_kid_photo_storage.sql`**
(0038 was ticket 08's reservation and carries over; next free wins if 0037/0038/
0039/0040 shift). Expected content: `add column if not exists
profiles.family_photo_url text` (ticket 08's half), the storage work the decision
needs (a new private bucket + its narrow policies, or object moves — DO-block
guarded, no `create policy if not exists`), and any `kids.avatar_url` rewrite.
Header must document: the exposure as it was measured, the decision and its
consequence for old URLs, the object counts before/after, that parent avatars
keep their public posture, and that no `profiles` RLS policy changed (the
0014/0016 column-add lesson).

- *Post-apply probes:* (1) the column exists and is nullable; (2) a PostgREST read
  of `profiles?select=family_photo_url` → 200 (no PGRST205); (3) **the anonymous
  kid-photo list/fetch probe fails** (the core probe of this ticket); (4) a
  parent avatar still renders publicly; (5) the family photo's own read path
  behaves as documented; (6) an anon read of `kids` stays `[]`.
- *Human-owned:* the DECISION above.

**Verify:** `npm run build && npm run test`; `npx playwright test
e2e/kid-photo-exposure.e2e.ts e2e/profiles-v2.e2e.ts e2e/kids-v3.e2e.ts`; full
suite; then the live phone pass — load a drop-in with the anon key only and
confirm no kid photo can be listed or fetched.

## Comments

**2026-09-13 — provenance.** V9 ticket 10 added a copy sentence claiming a kid
photo is gated like a name. A fresh-context reviewer checked that claim instead
of trusting it, found the bucket wide open, and verified it with the anon key
only. Ticket 10's fix cycle then **removed the false photo clause** (the copy now
claims the name gate alone) and **did not touch the storage posture** — that is
this ticket. The human chose this follow-up over "record it and move on", and
chose to fold ticket 08 into it rather than leave the photo work split across two
files.

**Carried over from ticket 08 (unchanged intent):** this reverses the 2026-09-09
human decision "kid photos = YES — overrides the first-name-only privacy pin",
made by the same person. Ticket 08's own words: *"Do the reversal without
destroying anything: stop rendering kid photos and remove the control, keep the
stored files, and give the parent a family photo and a family description
instead — both optional."* The storage finding adds one honest caveat to "keep
the stored files": under the recommended option the FILES survive but their old
public URLs cannot, because making them stop resolving is the whole point.

**One thing the parent must be told, in the UI.** Today a parent who uploaded a
kid photo has been told (V9 ticket 05's copy) that a name is gated, and ticket
10's corrected copy says nothing about photos. Once this ticket lands, the kid
photo is gone from the app; the honest thing is to say so where the control used
to be, rather than removing it in silence.

**2026-09-13 — BUILT (builder report, review cycle 1 fixes applied; NOT applied to
the live project — the coordinator applies 0038 and runs the move).** Status of
each half, and the deviations a reviewer or a future reader needs:

- **The client half is shipped and green**: no kid photo is uploaded or rendered
  anywhere, the family photo + "About our family" are in, and the parent is told
  where the control went. The storage half is written and gated but **not
  applied**: `supabase/migrations/0038_kid_photo_storage.sql` and
  `scripts/migrate-kid-photos.mjs` (coordinator-run, `--yes`-gated, idempotent,
  verify-then-delete).
- **DEVIATION FROM TICKET 08 (recorded because 08 asked for it explicitly): the
  family photo does NOT live under 0011's `avatars_owner_*` policies, and 0011
  does NOT cover a `family/` folder in the sense 08 meant.** Those policies are
  scoped `bucket_id = 'avatars'`, so a `<uid>/family/…` object in THAT bucket
  would have been covered by the same first-folder check — but ticket 11's
  confirmed decision puts the family photo in the private `kid-photos` bucket
  instead, where 0038 gives it its own five policies (owner-scoped writes,
  `authenticated` read for the `family` class, owner-only read for the `kids`
  class). Putting it in the public bucket was the one option that would have
  re-created the exposure under a new name.
- **THE FAMILY PHOTO IS NOT PUBLIC — and that is a decision, not an oversight.**
  Ticket 08's text offered "it is the parent's own image and may be public like
  an avatar — say which, and why". It is **private + readable by any signed-in
  family** (`familyPhotoVisibility`): a "photo of your family" will usually DEPICT
  THE CHILDREN, `/u/:handle` is a signed-in surface anyway, and a public object
  would be anonymous-fetchable exactly like the kid photos this ticket moved. The
  user copy says "It shows on your profile, to signed-in families."
- **RESIDUAL, accepted and recorded (not fixed here):** `kid_photos_read_family`
  is `to authenticated` with no owner check, and `profiles_select_authenticated`
  is `using (true)` — so **any account that can sign up can read every family's
  family photo**. That is ticket 11's accepted class (the photo is shown on a
  profile page whose whole audience is signed-in families), and the copy is honest
  about it ("to signed-in families"); but signup is the only barrier, and a
  stricter rule (shared drop-in / follow / host relationship) is a future ticket,
  not this one.
- **Second residual, stated so nobody over-reads the closure:** the `avatars`
  objects are stored with `cache-control: max-age=3600`, so after the move the CDN
  may keep serving a deleted public URL for up to an hour. The closure is complete
  at the origin immediately and at every edge within the hour; the script attempts
  a purge and reports refusals. Probes must cache-bust (`?cb=…`) — 0038's P7 note
  has the exact commands.
- **`kids.avatar_url` (T7) is REWRITTEN, not cleared**, to the bucket-qualified
  object path `kid-photos/<uid>/kids/<kidId>`; rows whose private copy the script
  could not verify are left alone and reported as a count.

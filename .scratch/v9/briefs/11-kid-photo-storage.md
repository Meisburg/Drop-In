# Builder brief — V9 ticket 11 (kid photos: close the public storage exposure; family photo instead)

Repo: `/home/jmeisburg/Projects/playdate-app` ("Drop In" — Vite + React + TS +
Tailwind PWA on live Supabase, project ref `ayzvjwxbxyrcgyoeaxuk`).
You are the ONLY writer: never run a git command that writes. **You write the
migration and the migration SCRIPT; the coordinator applies 0038 and RUNS the
script.** Do not apply anything, do not run the script, do not touch storage.

## Read first
1. `.scratch/v9/issues/11-kid-photo-storage.md` — THE SPEC (ACs + migration
   check + the exposure evidence + the options table). **The human has CONFIRMED
   option A**: kid photos move to a PRIVATE bucket served by signed URLs, the
   already-uploaded files are MIGRATED so they survive, their old public URLs
   die, and parent avatars are separated from kid photos.
2. `.scratch/v9/issues/08-family-photo-not-kid-photos.md` — **folded into this
   ticket**; its ACs ride along (that is where the family photo + "About our
   family" come from, and its reversal's exact wording).
3. `.scratch/v9/issues/10-kid-names-privacy-gate.md` + migration
   `0040_kid_names_gate.sql` — ticket 10 just shipped the NAME gate; read it so
   you do not undo it. **Its `/u/:handle` and detail-page rules are load-bearing
   here.**
4. `supabase/migrations/0011_profiles_v2.sql` (the `avatars` owner path policies
   and the kids table), `0022_kids_v3.sql` (the playdate_kids gate + its new
   kid-ownership clause), `0026_ping_kids.sql`, `0038` does not exist yet.
5. `src/lib/db.ts` — `uploadKidPhoto` (~2556-2572), `getPublicUrl` (~2507),
   `uploadAvatarObject`, `prepareAvatarFile`, `AVATAR_SIZE_PX`, the crop step
   (`src/lib/photoCrop.ts`, `src/components/useCropStep.tsx`,
   `CropPhotoDialog.tsx`), `listKids`, `updateKidWithClient`, `addKid`,
   `getProfileByHandle` (~386).
6. `src/pages/ProfilePage.tsx` (the kid editor + the Kids block + the privacy
   copy), `src/pages/UserPage.tsx` (the kid rows, now self-view gated),
   `src/components/ImageLightbox.tsx`.
7. `e2e/kids-v3.e2e.ts`, `e2e/profiles-v2.e2e.ts`, `e2e/polish.e2e.ts`,
   `e2e/kid-names-privacy.e2e.ts` (the stranger-account pattern),
   `e2e/fixtures.ts`.

## Facts I verified myself — build on these, do not rediscover them
- **T1 — the live storage state.** Exactly ONE bucket exists: `avatars`,
  `public = true`, with `avatars_public_read` granted to role `public`. Kid
  photos live at **`<uid>/kids/<kidId>`** (`db.ts:2556-2572`, URL minted by
  `getPublicUrl` at `:2507`); parent avatars live at **`<uid>/avatar`**.
  I confirmed the exposure myself with the anon key alone: the bucket root lists
  the user folders, and one `<uid>/kids` prefix returned **3 kid-photo objects**.
- **T2 — THERE IS NO OBJECT-MOVE HELPER.** `pg_proc` has **no**
  `storage.move_object` / `storage.copy_object` in this project, so a raw
  `update storage.objects set bucket_id = …` would move the ROW and strand the
  BYTES. **The byte move must go through the Storage API** (read the object with
  admin rights, write it to the new bucket, verify, then delete the public
  original). Write that as a script; the coordinator runs it.
- **T3 — the admin key, and how to handle it.** The service-role key lives in the
  `cron.job` row (jobid 3) as `'Authorization', 'Bearer <key>'` inside the job
  command — I verified the SHAPE with the secret masked, and `docs/push-setup.md`
  documents it. **Do NOT read it, do NOT print it, do NOT put it in a file you
  commit, and never echo it in a report.** Your script must obtain it
  IN-PROCESS at runtime through the dashboard SQL API (the
  `.scratch/cron-schedule-send-push.mjs` pattern: a 0600 temp file if needed,
  never a terminal argument, never chat), keep it in memory only, and print
  **COUNTS AND PATHS ONLY**. It must refuse to do anything without an explicit
  `--yes`, and it must be **idempotent** (re-running copies nothing twice).
- **T4 — the family photo must NOT recreate the exposure.** A "photo of your
  family" will usually DEPICT THE CHILDREN. Putting it in the public `avatars`
  bucket would re-open exactly what this ticket closes. So the private bucket
  holds BOTH path classes, with DIFFERENT policies:
  - `<uid>/kids/<kidId>` → **owner-only, forever** (nobody else, not even another
    signed-in parent);
  - `<uid>/family/<file>` → readable by `authenticated` (profiles are for
    signed-in families, and the photo is shown on `/profile` and `/u/:handle`),
    so signed URLs can be minted for display.
  **Critical:** a signed-URL path must never let an arbitrary signed-in parent
  fetch another family's KID photos — that would undo ticket 10's gate. Prove it
  with a probe, not an assumption.
- **T5 — parent avatars stay public and unchanged.** Every card and the detail
  page render them; do NOT make `avatars` private and do NOT put avatars behind
  signed URLs. Separation, not lockdown.
- **T6 — signed URLs: batch, best-effort, never persisted.** Use the batched form
  (one call per page, not one per image); a failure means no image, never a
  broken page or an error state; and NEVER store a signed URL in the database
  (they expire) — store the PATH and mint at render.
- **T7 — `kids.avatar_url`.** Keep the column (non-destructive — the human's
  "keep the files" intent). Its stored values point at the soon-dead public path,
  so decide and DOCUMENT: rewrite them to the new private path (so a reversal
  works) or clear them. Recommend: rewrite to the private path in the same script
  run that moves the objects, and say so in the migration header.
- **T8 — the closure must be PROVEN, not asserted.** The exact probe that found
  the exposure must fail afterwards: an anon `POST /storage/v1/object/list/avatars`
  `{"prefix":"<uid>/kids"}` returns no kid objects, and an old public kid-photo
  URL no longer resolves. Record the object count before and after.
- **T9 — bucket creation is a ROW, not DDL.** `insert into storage.buckets (id,
  name, public) values ('kid-photos','kid-photos',false)` — guard it with a
  `where not exists` / `on conflict do nothing` in a DO block. Storage POLICIES
  on `storage.objects` are DO-block guarded (no `create policy if not exists`),
  and must be path-scoped with `storage.foldername(name)` (0011's
  `avatars_owner_*` pattern is the model: it keys on the first folder).
- **T10 — the number is `0038`** (carried over from ticket 08 when it folded in).
- **T11 — the copy the parent sees.** A parent who uploaded a kid photo was told
  (ticket 05's copy) that a name is gated, and ticket 10's corrected copy says
  nothing about photos. Now the photo is gone from the app: say so where the
  control used to be, rather than removing it in silence. Keep the sentence TRUE
  — do not promise photo privacy the storage layer does not deliver.
- **T12 — do not undo ticket 10.** The kid-name gate (`kids` SELECT policy,
  `playdate_kids` SELECT + INSERT with `kid_owned_by_caller`, the ages-only
  `kid_ages_for`, the gated `get_playdate_kids`) stays exactly as it is. The
  `/u/:handle` kids card stays self-view only. If your storage policy work or the
  family-photo feature needs a `kids` read, route it the same way ticket 10 did.

## Deliverables
1. **`supabase/migrations/0038_kid_photo_storage.sql`** — the private bucket row,
   the path-scoped storage policies, `add column if not exists
   profiles.family_photo_url text`, and the documented intent for
   `kids.avatar_url`. Header documents: the exposure as measured (with the anon
   probe), the decision and its consequence for old URLs, the two path classes
   and their differing policies, that parent avatars keep their public posture,
   that no `profiles`/`kids` RLS policy changed (the 0014/0016 column-add lesson),
   and the object counts before/after as a probe TO RUN, not a claim.
2. **`scripts/migrate-kid-photos.mjs`** — coordinator-run, service-role,
   in-process key, `--yes` gated, idempotent, verify-then-delete, counts only.
   It must also rewrite `kids.avatar_url` for the moved objects.
3. **Client**: the kid-photo upload control and every kid-photo render go (folded
   ticket 08); the family photo (upload through the existing crop/validate
   pipeline, ≤5MB, path `<uid>/family/…`) and "About our family" (the existing
   `bio` field relabelled, ≤500 chars) arrive; `/profile` and `/u/:handle` render
   family photo → about-us → kids list, and look finished with none of them;
   signed-URL minting is batched + best-effort + never persisted.
4. **Unit seams**: `familyPhotoPath(profileId, ext)`, the family-photo validator
   reusing the avatar rules, `profileBlurbOrder(profile)`, and the kid-photo
   path/visibility decision.
5. **`e2e/kid-photo-exposure.e2e.ts`** — the anon list probe returns no kid
   objects; a kid row renders no `<img>` and there is no photo control; the
   family photo uploads via the crop dialog and renders on `/profile` and
   `/u/:handle`; "About our family" saves and renders; an empty profile renders
   cleanly; a signed-in STRANGER cannot mint a URL for another family's kid
   photo.

## Required checks you run yourself
- `npm run build` — exit 0. Baseline on the committed tree: **757/757 unit (21
  files) · e2e 66/66 · lint 0 errors (39 warnings)**. Anything worse is your
  regression.
- `npm run test` — report passed/total and the new/changed files.
- Your spec, then the FULL suite: `npm run test:e2e` **redirected to a file,
  NEVER piped** (a pipeline's exit code is `tail`'s, which once reported 0 during
  a genuinely failing 32-spec run). Known live-API flakes: `guest-list`,
  `post-edit-delete` — re-run in isolation before calling a failure real.
- Expect a **documented red pre-apply** for the parts that need 0038 (the private
  bucket, the column, the policy behaviour). State in the spec which assertions
  are the pivot, and quote the pre-apply evidence exactly. Everything that does
  not need 0038 must be green in the same run.
- `npm run lint` (warnings only on lines you changed).
- **Never weaken, delete or skip an existing assertion.** The kid-row assertions
  in `kids-v3` / `profiles-v2` / `polish` will need the photo control removed —
  that is expected, quote each change.

## Marker hygiene
E2E mints `e2e-<epoch>` markers and uploads storage objects. Every spec you add
must be cascade-safe, must delete its own rows AND its own uploaded objects
best-effort (including the family photo), and must not leave a kid photo behind.
Do NOT run `scripts/sweep-e2e-markers.mjs` — the coordinator owns the sweep.

## Report back, terse and structured
1. Files changed with line counts, and the diff guard
   (`git status --short supabase/migrations` shows ONLY your new 0038).
2. AC-by-AC: met / not met / deviated, with evidence (command + output).
3. The pivot: the exact pre-apply failure(s) and assertion lines.
4. Gate numbers: build, unit passed/total, e2e passed/total (and which are the
   documented reds), lint.
5. Deviations and findings — the T1-T12 outcomes, what you did about
   `kids.avatar_url`, the family photo's visibility decision and why, exactly
   what the script does and what the coordinator must run, and anything the
   ticket did not anticipate. **Report findings; do not paper over them.**
6. The exact commands the coordinator should run: the apply, the script, and the
   re-gate.

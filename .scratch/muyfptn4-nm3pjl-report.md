# muyfptn4-nm3pjl — scope determination: user-addable places

Slice: determine whether user-addable places already exist. **Finding: none of the
asked-for feature exists.** There is no place-create path, no user place-edit, and no
place-level moderation. What exists is adjacent (below, Q5): a read-only seeded
directory, a moderator-only photo-replace tool, and a moderator report queue.

Base: `d88052e`. Worktree: `/tmp/pd-wt/muyfptn4-nm3pjl`. No code changes made
(no defect found); gate output below.

## Q1 — Is there any path for a user to CREATE a place?

**No. Nothing exists: no affordance, no form, no route, no client write, no RLS INSERT.**

Where I looked and what I found:

- **Affordance on /browse or /place/:id — none.** `/browse` renders
  `PlaceDirectory` (`src/pages/BrowsePage.tsx:403`). The directory's per-row actions
  are Save bookmark, "Details", and "Start a drop-in"
  (`src/components/PlaceDirectory.tsx:2011` — a drop-in POST at that place, not a
  place create); the map panel offers "Host here" the same way
  (`src/components/PlaceDirectory.tsx:89`). There is no "+", no "Add a place", no
  "Suggest a place" control anywhere. The only "Add a place" strings in the repo are
  drop-in-form placeholder copy (`src/lib/postSummary.ts:367`, `src/lib/feed.ts:1001`)
  — they describe naming a place on a playdate post, not creating a directory row.
- **Route — none.** The full route table (`src/App.tsx:885–976`) has `/place/:id`
  (943) and `/place/:id/details` (952) only. `/playdate/:id/edit` (957) and `/new`
  (958) are the drop-in (playdate) surfaces. There is no `/place/new` or similar.
- **Client write — none.** Every `places` access in `src/lib/db.ts` is a SELECT:
  `listPlaces` (923), `getPlaceById` (934), plus selects at 883 and 4432. All `.insert(`
  calls in db.ts (563, 669, 1176, 1655, 2490, 3290, 3581, 3670, 3762, 4556, 5056,
  5240, 5275, 5613, 6061, 6551) target other tables (playdates, neighborhoods,
  going_pings, ping_kids, blocks, kids, comments, series, follows, messages,
  reactions, link requests, place comments). There is no `.insert` into `places`
  anywhere in the app.
- **RLS — INSERT denied by default.** `supabase/migrations/0029_places.sql:106–110`:
  *"There are NO insert/update/delete policies at all: writes stay postgres-only (the
  seed is re-written only by service_role during the CDP apply), so RLS denies every
  write by default."* The only `places` policy at creation was
  `places_select_public` (0029:399–413). Migration 0062 later added exactly one more —
  a moderator UPDATE policy — and is explicit that it does not open creation:
  `0062_place_photo_moderation.sql:74–77`: *"⚠️ SCOPE: UPDATE only. This
  deliberately does not grant INSERT or DELETE — the founder asked to REPLACE a
  picture, not to add or remove directory rows."*

## Q2 — Is there a photo upload for a place?

**Yes — but it is a moderator-only replacement tool for EXISTING places, and it is
not reachable from any place-create path (because no place-create path exists).**

- Bucket + RLS: `0062_place_photo_moderation.sql:49–52` creates the public
  `place-photos` storage bucket; :143–171 makes its INSERT/UPDATE policies
  moderator-only (`exists (… p.moderators)`), with a public read (:131–135).
- Upload seam: `src/lib/db.ts:2651–2664` (`uploadPlacePhoto` →
  `supabase.storage.from('place-photos')`), and the row write
  `src/lib/db.ts:2630–2635` (`setPlacePhoto` via `issueModeratorUpdate`) — its own
  comment calls it *"THE FIRST WRITE PATH TO `places` IN THE APP'S HISTORY"*
  (db.ts:2618) and notes a non-moderator call *"is rejected by the database, not by
  this code"* (db.ts:2623–2625).
- Editor UI: `src/components/PlacePhotoAdmin.tsx:111` + the pure seams in
  `src/lib/placePhotoAdmin.ts` (URL paste :130, file upload validation :153, crop
  constants :102–113, patch builders :361/:390/:415). Three doors, all gated by the
  same `canModerate` predicate: the /browse directory card
  (`src/components/PlaceDirectory.tsx:1632`, gated by
  `canEditPlacePhotos={canModerate(profile)}` passed at `src/pages/BrowsePage.tsx:421`),
  the place page (`src/pages/PlacePage.tsx:1345`, gated at :682), and /mod
  (`src/pages/ModPage.tsx:464`, behind the /mod route guard, `src/App.tsx:974`).
- A signed-in ordinary parent sees no photo editor anywhere; a place-create flow
  cannot reuse it, since no place-create flow exists (Q1).

## Q3 — Can a user EDIT an existing place?

**No. No user-facing edit of any place field exists; the only place write in the app
is the moderator photo replacement (Q2).**

- No edit affordance on the place page, the details subpage, or the directory rows.
  The place details page's only write path is the user comment composer
  (`src/pages/PlaceDetailsPage.tsx:625` — `createPlaceComment`, db.ts:6543,
  migration 0050); comments are user data about a place, not place editing.
- No edit form or UPDATE seam for place fields (name, kind, address, hours, notes…)
  exists: a search for create/edit place identifiers across `src/` returns only
  `createPlaceComment` and the moderator `editingPhotoPlace` state
  (`src/components/PlaceDirectory.tsx:326`).
- RLS backstop: the only UPDATE policy on `places` is
  `places_update_moderators` (`0062_place_photo_moderation.sql:87–101`,
  `using/with check exists (… p.moderators)`), granted to `authenticated` but
  filtered to moderator profiles — an ordinary signed-in parent's UPDATE is denied
  by the database.

## Q4 — Is there any moderation surface for places, or pending/verified states?

**Partial and photo-only. There is a photo review state and a moderator queue — but no
place-level approval/reject/flag, and no pending/verified state on the place itself.**

- `places.photo_review_state` ∈ {'confirmed','unreviewed', NULL}
  (`supabase/migrations/0063_place_photo_review_state.sql:84,104`; type at
  `src/lib/types.ts:313`). Tier-2 auto-sourced photos land as 'unreviewed' and are
  withheld from parents until a moderator confirms them — the app rule is
  `placePhotoVisibleTo` (`src/lib/places.ts:1289`), the confirm tap is
  `confirmPlacePhotoPatch` (`src/lib/placePhotoAdmin.ts:415–417`).
- General moderation: `/mod` (`src/pages/ModPage.tsx`) lists the `reports` queue
  (`listReports`, db.ts) and can `hidePlaydate` / `banProfile` (db.ts:2593–2613).
  The reports table (`supabase/migrations/0008_create_reports.sql:17–23`) has
  `playdate_id` and `reported_profile_id` only — **no place-report column** — so
  places cannot be reported or flagged by users at all.
- No place row is ever pending/verified: all 239 seeded rows are live on create
  (0029:150–392), and no later migration adds a place-level status.

## Q5 — What DOES exist that is adjacent?

- `src/components/PlaceDirectory.tsx` (2098 lines) — the directory surface rendered
  by /browse (`BrowsePage.tsx:403`) and embedded in the /new sheet; search/filter/
  saved rows, "Not on the map yet" section (:1481), row actions (:2011).
- `src/pages/PlacePage.tsx` (`/place/:id`, App.tsx:943) and
  `src/pages/PlaceDetailsPage.tsx` (`/place/:id/details`, App.tsx:952) — place detail
  + details subpage with the user comment composer (PlaceDetailsPage.tsx:625).
- `src/lib/placePhotoAdmin.ts` + `src/components/PlacePhotoAdmin.tsx` — the
  moderator place-photo editor (pure seams + component), mounted at three doors
  (PlaceDirectory.tsx:1632, PlacePage.tsx:1345, ModPage.tsx:464).
- `src/lib/placePhotoSourcing.ts` — the best-effort photo auto-sourcing pipeline
  (tier 1/2, `reviewStateForTier` at :886) feeding `photo_review_state`.
- `src/lib/db.ts:2630` (`setPlacePhoto`) and `:2651` (`uploadPlacePhoto`) +
  `issueModeratorUpdate`/`canModerate` (`src/lib/moderation.ts`,
  `ModeratorTable` includes 'places' at :67) — the existing moderator write path a
  future promotion flow could ride.
- `src/lib/db.ts:923` (`listPlaces`) / `:934` (`getPlaceById`) — the directory reads.
- Migrations 0062/0063 — the bucket, the moderator UPDATE policy, and the review-state
  column (the DB half of the photo moderation story).

## Q6 — What is the smallest real slice?

**A "Suggest a place" affordance on /browse (e.g. a "Don't see your place?" control in
`src/components/PlaceDirectory.tsx`) that writes a signed-in user's name/address/kind
into a new `place_suggestions` table (new migration: table + INSERT policy for
`authenticated`), plus a review queue on `/mod` (`src/pages/ModPage.tsx`) that
promotes accepted suggestions into `places` via the existing moderator write path
(0062's `places_update_moderators`) — keeping the directory seed-only for ordinary
users while giving the founder a user-driven intake + human review loop.**

Do not implement; this is the scope report, not the build.

## Defects found during this slice

None. No small self-contained fix was warranted (and none was made).

## Verification (raw output)

`npm run typecheck` → `tsc -b --noEmit`, no diagnostics (exit 0).

`npm run guards` — first run failed with `e2e-target-guard: Cannot read
/tmp/pd-wt/muyfptn4-nm3pjl/.env — the e2e target cannot be resolved`: a fresh
worktree carries no untracked local `.env` (the guard resolves the e2e target from
it; sibling worktrees `v33-5` and `place-pills-p5l9` both carry a copy). Copied the
untracked local `~/Projects/playdate-app/.env` into the worktree (it stays
untracked/ignored, not staged). Re-run:

```
e2e-target-guard: PASS — the e2e target is declared and acceptable.
GUARDS: PASS — all deterministic rules hold.
```

No file with an existing spec was changed, so no spec run was required.
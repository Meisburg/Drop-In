# Spec: the 2026-10-05 annotations — photos, one-tap fixes, readable filters

**Status:** ready-for-agent
**Source:** `source-annotations.json` in this directory — 7 annotations exported
from the vibe-annotations tool on 2026-10-05T03:49Z against the deployed
`drop-in-mu.vercel.app`, captured at 628×579. Verbatim; this file is the
interpretation, that file is the record.
**Verified against:** `master` @ `83e39a2` (read-only recon, every finding with
`file:line`). Five of the founder's descriptions did not match the tree and the
corrections are recorded under Decisions below.

**What this effort fixes:** seven things a parent (and the moderator, walking the
app on a phone) hit in the live product.

**The through-line:** in six of the seven, **the capability already exists and is
not where the parent needs it.** The crop dialog shipped in V7.1 and card 2 still
says only "Photo added". Place photos render on `/browse` cards and nowhere on
`/place/:id`. The moderator's photo editor is live, correct, and reachable only by
typing a URL that appears nowhere in the app. The tour dims the very control it
is teaching. Only one item — the truncating filters — is genuinely new UI.

**No migration. No new route. No new table. No SQL.** Two of the seven are
deletions.

---

## Decisions taken (founder, 2026-10-05) — binding for builders

1. **Onboarding card 2 photo:** bring it to parity with `/profile` — a visible
   preview of the chosen photo, a **Remove** control, and tapping the preview
   re-opens the crop. Reuse the existing dialog; invent nothing.
2. **Place photo on `/place/:id`:** restore it — photo above the heading, with
   its credit line, and the per-kind illustration standing in when there is none.
   This is a **conscious reversal of V20** (which removed place imagery because
   the founder could not maintain it); the moderator photo tool shipped in V28 r4
   is what makes the reversal coherent.
3. **Time presets on `/new`:** delete the row. They were a founder pick on
   2026-09-27 and are pinned by a v29-5 acceptance criterion — the criterion is
   rewritten in the same slice, not left contradicting the app.
4. **Filter triggers:** a short caption above each ("Setting" / "Distance" /
   "When") **and** values shortened so no trigger truncates.
5. **Moderator door:** a moderator-only row in Settings → Account linking to the
   existing `/mod`. Five tabs is the mobile budget; no sixth tab.
6. **Place-photo editing from place surfaces:** a moderator-only affordance on
   the browse card and the place detail header, opening the **existing** editor.
   `/mod` remains the bulk surface.
7. **`/profile` Settings link:** removed from both read and edit modes. The
   header gear is on every screen and stays.

**Corrections recorded (the annotation said X, the tree says Y):**

- *"it just says Photo added"* → the crop step exists and is wired at five call
  sites; what card 2 lacks is a **preview and a remove control**, both of which
  `/profile` already has.
- *"there's no photo"* → `/browse` cards have rendered place photos since V27
  (`381a11c`). `/place/:id` is the only photo-free surface.
- *"a box is drawn around a page icon"* → the veil is a flat
  `bg-slate-900/25` with no cutout, so the ringed control really is dimmed.
- The time presets are not incidental — they are a recorded founder pick with a
  passing e2e spec and an acceptance criterion.

---

## Problem Statement

A parent uses Drop In on a phone. Seven things get in the way:

1. On the first-run name card, having chosen and cropped a photo, they see a
   button whose text changed to **"Photo added"** — no picture, no way to remove
   it, no way to adjust the framing they just set. On `/profile` the same photo
   shows a preview and a Remove control, so the app teaches two different
   behaviours for one thing.
2. The first-run tour draws a ring around the control it is explaining — and
   covers that control with a 25% black veil, so the thing being taught is the
   dimmest thing on screen.
3. The post form offers four one-tap time presets *above* a time field that
   already holds the time. Two controls, one decision.
4. On `/browse`, three filter buttons truncate to **"Any SETT…"** and
   **"within three…"** on a phone. They are buttons opening bottom sheets, so a
   parent who does not tap cannot learn what they filter.
5. Opening a place shows a name and some tags and **no image at all**, while the
   card they tapped to get there had one.
6. A place photo is wrong or missing, and there is **no way to fix it from the
   place** — the tool that can do it exists but lives behind a URL the app never
   links to, and the app has no moderator entry point anywhere.
7. `/profile` offers a "Settings" pill next to "Edit profile" while the header
   already carries a gear on every screen. Two doors, one room.

## Solution

Seven bounded changes, delivered as one batch, ordered subtractive-first:

- **Card 2 parity** — preview, Remove, tap-to-re-crop, using the shipped dialog.
- **Tour spotlight** — cut a transparent hole in the veil at the ring's own
  rectangle, so the ringed control renders at full brightness and everything
  else stays dimmed.
- **Presets deleted** — the time field becomes the only time control.
- **Filters legible** — a caption per trigger plus values that fit.
- **Place hero** — the place's photo above the heading, with its credit and the
  per-kind illustration as the honest stand-in.
- **One moderator door and one contextual edit** — a Settings → Account row to
  `/mod`, and an "Edit photo" control on the browse card and the place header,
  both opening the editor that already exists.
- **Profile link removed** — one door to Settings, not two.

## User Stories

1. As a parent in my first run, I want to see the photo I just chose, so that I
   know what other parents will see.
2. As a parent in my first run, I want to remove a photo I do not like, so that
   I am not stuck with it on the card that defines my account.
3. As a parent, I want to re-open the crop on a photo I already added, so that I
   can fix the framing without starting the whole flow over.
4. As a parent, I want the same photo controls on the first-run card and on my
   profile, so that I learn one behaviour rather than two.
5. As a parent adding a kid's photo, I want the same adjust-and-remove controls I
   get for my own, so that the family photos behave consistently.
6. As a parent seeing the tour for the first time, I want the control being
   explained to be fully visible, so that I can tell what the ring is around.
7. As a parent, I want the rest of the screen to stay dimmed during the tour, so
   that I can tell it is a tour and not a broken screen.
8. As a parent, I want a tap anywhere to still reach the app through the tour, so
   that it never traps me.
9. As a parent, I want the tour to remain a one-time thing, so that it does not
   interrupt me on every load.
10. As a parent posting a drop-in, I want one obvious place to set the time, so
    that I am not choosing between two controls that do the same thing.
11. As a parent editing an existing drop-in, I want the post form to behave the
    same as it does today, so that the deletion costs me nothing.
12. As a parent browsing places on my phone, I want each filter to say what it
    filters, so that I know what "Any setting" is a setting *of*.
13. As a parent, I want the current filter value readable without an ellipsis, so
    that I can see what I am filtering by.
14. As a parent, I want to understand the filter row at a glance, so that I do
    not have to tap to learn what a control does.
15. As a parent who uses a screen reader, I want each filter trigger to announce
    its purpose as well as its value, so that the caption is not a visual-only
    crutch.
16. As a parent opening a place, I want to see a photo of it above the name, so
    that I recognize where I am going before I read anything.
17. As a parent, I want a place with no photo to show an honest illustration
    rather than an empty frame, so that the page does not look broken.
18. As a parent, I want to know where a place's photo came from, so that I can
    trust it.
19. As a parent, I want a photo that fails to load to fall back the way the
    browse card already does, so that one broken URL does not leave a hole.
20. As the moderator, I want to reach the place-photo tool from Settings, so that
    I do not have to remember and type a URL.
21. As the moderator, I want to fix a place's photo from the place I am already
    looking at, so that I do not have to find it by name afterwards.
22. As the moderator, I want the contextual editor and the bulk tool to be the
    same editor, so that a fix behaves identically wherever I start it.
23. As the moderator, I want the bulk tool to stay available, so that I can work
    through places one at a time when I choose to.
24. As a parent who is not a moderator, I want no photo-editing controls anywhere
    in the app, so that the surfaces stay uncluttered and the permission stays
    explicit.
25. As a parent on my profile, I want one obvious door to Settings rather than
    two competing ones, so that the header reads cleanly.
26. As a parent, I want Settings still one tap away from every screen, so that
    removing the profile link costs me nothing.
27. As a future maintainer, I want the reversal of the V20 place-photo decision
    recorded where decisions live, so that I do not read the removal and the
    restoration as an accident.
28. As a future maintainer, I want the acceptance criterion that pinned the time
    presets rewritten in the same slice, so that the plan does not contradict the
    app.

## Implementation Decisions

### Shape

- **Zero SQL.** No migration, no new route, no new table. One existing route
  (`/mod`) gains a second entry point.
- The batch is mostly subtractive: **two deletions** (the presets row, the profile
  Settings link), **one restoration** (the place hero), **three parities/mounts**
  (card 2, the two moderator affordances), **one CSS change** (the veil cutout).
- Card 2's `pendingAvatarUrl` state and the `photoPickerLabel` switch already
  exist; the work is markup, not state.

### Seams (few, and mostly existing)

1. **`src/lib/feed.ts` — one deletion, one addition.**
   - Delete `timePresets()` and its test block. The render site and the
     `PlaydateFormFields` slot prop go with it; `/edit` already passes nothing.
   - Add `filterTriggerLabels(...)` returning, for each of the three filters, a
     `{ caption, value }` pair — caption from the sheet's existing vocabulary
     ("Setting" / "Distance" / "When"), value shortened to fit. The component
     renders what this returns; it decides nothing. One function, one sibling
     test.
2. **`src/lib/places.ts` — one shared predicate.** The "should a photo show"
   rule currently lives inside the directory row. Add `hasPlacePhoto(place)` so
   the row and the new hero share **one rule, two callers** — the pattern this
   repo already names and prefers. Reuse the existing `photoCreditLine` for
   provenance; do not write a second credit formatter. Boundary: the predicate
   covers the data half (URL present and non-empty); the *failed-to-load*
   fallback stays component state, as it is today.
3. **`src/lib/firstRunTooltips.ts` + `FirstRunTooltips.tsx` — no new module.**
   The ring's rectangle is already computed once from the target element. The
   veil consumes that **same rectangle** for its cutout. One derivation, two
   renders. The veil stays `aria-hidden`; the pass-through behaviour and the
   dismissal fact do not change.
4. **`useCropStep` + `CropPhotoDialog` — reused unchanged.** No change to
   `lib/photoCrop.ts`, its encoder, or the dialog's geometry.
5. **`canModerate` (pure, already tested) gates every new affordance**, and
   `PlacePhotoAdmin` + `lib/placePhotoAdmin.ts` are **reused unchanged**. New
   work is mounting: a Settings → Account row, and a modal host on two place
   surfaces. `ModalShell` already exists for the host.

### Interactions and accessibility

- **The browse-card edit control must be a sibling of the card's anchor, never
  nested inside it.** Interactive-inside-interactive is invalid, breaks tap
  targets, and would fire the card's navigation on the way to the editor.
- Every new control keeps the repo's **44px minimum tap target**, and no new
  input is introduced, so the 16px input floor is untouched.
- The Settings → Account row is a link to the existing `/mod` route; it renders
  only for a moderator-flagged profile, the same gate the route already applies.
- The place hero image carries **empty `alt`**: the `<h1>` immediately below
  names the place, and the credit chip carries provenance, so a spoken
  description would repeat the heading. The illustration stand-in stays
  `aria-hidden`, matching the browse card.
- The filter captions are **visible text**, not `sr-only` — the annotation's
  complaint is precisely that the purpose is invisible. The trigger's accessible
  name follows from the caption plus the value in the DOM.

### Copy pinned by this spec

- Filter captions: **Setting**, **Distance**, **When**.
- Short values: **Any** (type and date), and the radius as a bare distance
  (**1 mi**, **2 mi**, **5 mi**, **10 mi**, **20 mi**, **35 mi**, **Any**).
  The exact strings are fixed by the unit test, so the reviewer can read them.
- Moderator row: **Moderator tools**.
- Place-surface affordance: **Edit photo**.
- Place-section control stays **Fix a place photo** on `/mod` (unchanged).

### What is explicitly NOT changed

- `/mod`'s existing single-place-at-a-time flow, its deferred 239-row read, and
  its picker testids.
- The crop dialog's copy, geometry, or encoder.
- `/new`'s draft behaviour, its fields, or its validation.
- `places.photo_url` and the attribution columns: unchanged shape, unchanged
  reads.

### Recorded reversal and record-keeping

- The V20 ruling lives in an **applied** migration header and in `task-state.md`.
  Do not edit either. Add an ADR recording the reversal and what changed to make
  it coherent (the moderator photo tool), and reference it from the plan.
- `plan.md`'s v29-5 acceptance criterion 3 ("Now / In an hour / Tomorrow 10am /
  Sat 10am still work") is **rewritten** in the presets slice to state that the
  time field is the only time control, with the date and reason of the decision.

## Testing Decisions

**What makes a good test here:** it asserts what a parent sees and taps, or a
pure decision's output — never a class name, a z-index, or a component's internal
state. Unit tests belong on the pure seams; anything involving the DOM, the crop
bitmap, a modal, or permissions belongs in Playwright.

- **Unit — `src/lib/feed.test.ts`:** the `timePresets` block is deleted with the
  function. New cases cover `filterTriggerLabels` at every radius option and
  every date label, asserting the caption and the shortened value, so the copy is
  readable in one place.
- **Unit — `src/lib/places.test.ts`:** `hasPlacePhoto` across null URL, empty
  string, and a real URL. Prior art: the existing table-driven cases in the same
  file.
- **Unit — `src/lib/firstRunTooltips.test.ts`:** unchanged. The cutout is DOM
  geometry; asserting CSS here would test implementation, and the e2e already
  owns the pass-through.
- **e2e — `name-card-photo.e2e.ts`:** after choosing a photo, the preview is
  visible; Remove clears it; tapping the preview re-opens **"Adjust the photo"**.
- **e2e — `first-run-tooltips.e2e.ts`:** the veil's cutout rectangle equals the
  ring's rectangle — the browser-observable statement of "the highlighted control
  is not dimmed" — plus the existing pass-through and dismissal assertions.
- **e2e — `place-filters.e2e.ts`:** the three captions are visible and no trigger
  truncates at phone width.
- **e2e — `places.e2e.ts`:** the place page's credit-line count flips from zero
  to one (the existing pin at the photo-credit assertion is the thing that must
  change).
- **e2e — new `place-photo-admin.e2e.ts`:** a moderator opens the editor from a
  place surface and replaces a photo by URL; a non-moderator sees the control
  nowhere. The editor currently has **zero** e2e coverage, which is why an
  unreachable tool looked like a missing one.
- **Deleted — `time-presets.e2e.ts`:** removed with the feature.
- **Gate:** `npm run verify` (build + test + lint + a11y:focus + steering-lint +
  guards). Re-run `node scripts/mobile-audit.mjs`, because the filter captions
  change `/browse`, which the audit covers. The hero changes `/place/:id`, which
  it does not — record that gap rather than claiming coverage.
- **Guards:** no new route, so no `playtest/routes.json` change. Every new
  control is checked against the 44px tap-target rule. New copy names no place
  category, so the copy-taxonomy guard has nothing to declare.

## Out of Scope

- **Parent-submitted place photos, and any approval queue.** Editing stays
  moderator-only.
- **Deleting or clearing a place photo's attribution**, and clearing a photo's
  URL through the UI: migration 0062 is UPDATE-only by design.
- **Bulk photo import**, or a "places missing a photo" worklist. The picker
  already flags "No photo" per result; turning that into a queue is its own work.
- **A sixth navigation tab.**
- **Any change to the crop dialog, the crop geometry module, or its encoder.**
- **Any change to kid-photo flows** beyond the parity that already exists.
- **A migration, a new route, or a new table.**
- **The two stale record claims the recon found** (`plan.md`'s "nothing is
  pushed", `task-state.md`'s `imageOrientation` note) and the two credential
  findings (the GitHub PAT embedded in `.git/config`'s origin URL, and
  `.vercel-env-tmp.json`'s OIDC token). Recorded here; each is its own work.

## Further Notes

- **The annotation export is now a repo artefact.** Three earlier batches (V13,
  V21, V24) are cited in `task-state.md` but their exports are not in the repo —
  which is how a live moderator tool (V28 r4, migration 0062) came to appear in
  no markdown anywhere except its commit message. This directory fixes that for
  this batch; the JSON's sha256 is recorded above its copy.
- **Suggested order:** deletions first (presets, profile link) — they are
  independent and shrink the diff surface; then readability (filters, tour
  cutout); then card-2 parity; then the place-photo work last, because the hero
  and the two moderator mounts are the only items that can regress a surface a
  parent already uses.
- **Deploy check before human review:** at spec time `origin/master` was three
  commits ahead of the bundle `drop-in-mu.vercel.app` was serving. Verify by
  content, not by bundle filename — the hash moves with which environment
  variables were inlined.
- **A batch-size judgement, stated so it can be overruled:** seven slices is more
  than this repo's recent batches (V29 was ten, but each had a browser check). If
  the place-photo pair looks like it wants its own batch, it can be split at the
  seam without touching anything above.

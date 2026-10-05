# Implementation Plan: V30 — the 2026-10-05 annotations

> Owned by the orchestrator. Written BEFORE any builder dispatch. Every slice
> below must be executable without interpretation. If a slice cannot state its
> acceptance criteria and verification command, it is not ready.
>
> The default slice gate is `npm run verify` (build + test + lint + a11y:focus +
> steering-lint + guards). Anything extra is pinned per slice.
>
> V29's plan is preserved **byte-identically** at `plan-v29-backup.md`
> (sha256 `e74970c5…`, matching `plan.md` at `969315b`) and is **not** edited —
> including its v29-5 acceptance criterion for the time presets, which this batch
> supersedes (see §6).

**Bottom line:** the founder walked the live app on a phone and left **seven
annotations**. Verified against the tree, they collapse into **nine slices** —
two of them deletions, one a conscious reversal of a recorded product decision,
and six where the capability already exists and is not where a parent needs it.
**No migration. No new route. No new table. No SQL.**

- **Base:** `969315b` on `master` (one **docs-only** commit ahead of
  `origin/master` at `932df1e`); tracked tree clean.
- **Gate measured THIS TURN, not remembered:** `npm run verify` → **exit 0** on a
  clean tree at `932df1e`; **75 test files / 2191 tests passed**; **86 lint
  warnings / 0 errors**; **GUARDS: PASS** (factory-guard: **185 checks passed**).
  The only commit since is `969315b`, which touches `plan.md` and `task-state.md`
  and no source — so the baseline stands. **Baseline that must not regress:
  75 / 2191 / 86 / 0.**
- **Source of truth:** `.scratch/vibe-annotations-2026-10-05/spec.md` (the spec),
  `issues/01`–`issues/09` (the tickets, all `ready-for-agent`), and
  `source-annotations.json` (the founder's verbatim export, sha256
  `cd3fab30…`). The spec owns the reasoning; the tickets own the detail; this
  plan owns sequencing and the pinned interfaces.

---

## 1. What this revision is

| Slice | Item | Ticket | Annotation | Size | Risk |
|---|---|---|---|---|---|
| **v30-1** | The post form has one time control | 01 | 3 | small | deletion — supersedes an archived criterion |
| **v30-2** | The profile page has one door to Settings | 02 | 7 | tiny | none — deletion |
| **v30-3** | The place filters say what they filter | 03 | 4 | small | new copy — pinned strings |
| **v30-4** | The first-run tour spotlights its target | 04 | 2 | small | CSS geometry; only browser-assertable |
| **v30-5** | The name card shows the photo you chose | 05 | 1 | small | none — parity with an existing flow |
| **v30-6** | A place page shows the place | 06 | 6 | medium | 🔴 **reverses V20**; touches a public surface |
| **v30-7** | A moderator can find the moderator tools | 07 | 5 | tiny | none |
| **v30-8** | A moderator can fix a photo from the card | 08 | 5 | medium | new modal on a link-wrapped card |
| **v30-9** | A moderator can fix a photo from the place | 09 | 5+6 | small | depends on v30-6 + v30-8 |
| **v30-10** | Batch close: full suite, lanes, sweep check, handoff | — | — | — | — |

**Two of the nine are deletions. One is a restoration.** That shape is the point:
the app mostly does not need new capability — it needs the capability it already
has to be reachable, legible, and honest about what it shows.

---

## 2. The measured state of the base (do not trust this prose either — re-run it)

### 2.1 The gate, and what it does not cover

`npm run verify` exit 0 on a **clean tracked tree**: 75 files / 2191 tests /
86 warnings / 0 errors / GUARDS PASS. The gate does **not** run Playwright, and
it does not run `scripts/mobile-audit.mjs` — both are pinned per slice below,
because three of these slices change what a phone renders.

### 2.2 ⚠️ Master moved five times during planning, from another session

A **concurrent session** pushed and committed `6a15fff`, `6ce0811`, `83e39a2`,
`9f358df`, `932df1e`, then `969315b` (local, unpushed). One of those was a **real
regression fix**: the `ocr` lane found that a failed *decorative* pings read on
the place-details page ran the posts `catch` and emptied the list, so a place
with drop-ins rendered "Nothing planned yet." (`6a15fff`; all 17 `ocr` findings
now closed). Consequences for this batch:

- **Re-measure the base before the first dispatch.** `969315b` is the base *as of
  planning*; if master has moved again, the builder's diff range and the gate
  baseline both move with it.
- **Do not treat a green tree as "nobody else is working."** A builder that finds
  diffs outside its slice must **report** them, not absorb them.
- **`969315b` is unpushed.** Whether it travels with this batch's first push is a
  human call, not a builder's.

### 2.3 ⚠️ The deployed app lags the pushed commits

At planning time `drop-in-mu.vercel.app` was serving the **pre-`6a15fff`**
bundle while `origin/master` was already past it. Verify the deploy **by
content, not by bundle filename** — the hash moves with which environment
variables were inlined — before any human review of this batch. A reviewer
looking at a stale deploy will "confirm" a defect that is already fixed.

### 2.4 The known-red Playwright specs, so the close does not chase them

The nightly live lane has been red since 2026-09-28: `places.e2e.ts:917` (named
known flake), `places.e2e.ts:1674` (**fails at the base commit too**),
`places-map-view.e2e.ts:574` (`aria-current`, **persistent**, not a flake), and
`push-subscribe.e2e.ts:489` (unexplained). None is this batch's; the batch close
must separate inherited failures from regressions **using a worktree at the base
commit** — the instrument v29-11 used to prove the 17 failures it found were its
own and not flakes.

---

## 3. Interfaces pinned before dispatch

The build law applies: domain decisions are pure functions in `lib/` with
injected dependencies and a sibling test; React renders and does not decide.
**Pin these shapes so nine slices across one batch cannot each invent one.**

1. **`filterTriggerLabels(...)` — `src/lib/feed.ts` (new, pure).** For the three
   directory filters, returns a `{ caption, value }` pair per trigger. Captions
   are exactly **Setting**, **Distance**, **When**. Values shorten to fit: the
   setting and the date read **Any** when unset, the date keeps **Today** /
   **Tomorrow** / **Weekend**, and distance reads a bare **1 mi … 35 mi** or
   **Any**. The component renders what this returns; the exact strings are pinned
   by unit test so a reviewer can read them in one place.
2. **`hasPlacePhoto(place)` — `src/lib/places.ts` (new, pure).** True iff the
   place has a non-empty photo URL. **One rule, two callers** — the directory
   card and the new place hero. Boundary declared: it covers the *data* half
   only; the *failed-to-load* fallback stays component state, as today. Reuse
   the existing credit-line formatter; do not write a second one.
3. **The tour cutout — `src/components/FirstRunTooltips.tsx` only, no new
   module.** The ring's rectangle is already computed once from the target; the
   veil consumes the **same** rectangle. No second geometry, no new pure module:
   the decision is "the hole is the ring", and one derivation feeds both.
4. **Reused unchanged, and named so no builder forks them:** `canModerate`
   (the gate), `PlacePhotoAdmin` + `src/lib/placePhotoAdmin.ts` (the editor),
   `useCropStep` + `CropPhotoDialog` (the crop), `ModalShell` (the host),
   `photoCreditLine` (provenance).
5. **The permission rule is unchanged and stays the database's.** Every new
   affordance renders only for a moderator-flagged profile, via the same
   `canModerate` the `/mod` route guard reads. The row and the buttons are
   discoverability; RLS is the authority.
6. **Reversal of record.** V20 removed place imagery because the founder could
   not maintain it. The reinstatement is deliberate; the applied migration that
   recorded the removal is **not edited**, and an ADR records the reversal and
   what changed (the moderator photo tool — V28 r4, migration 0062).
7. **The browser checks write to the LIVE database.** `e2e/.e2e-target.json`
   declares a production waiver expiring **2026-11-15**, so every e2e run below
   adds marker accounts. The close confirms residue with `select`; **deletion is a
   dated deferral to launch prep** (§6), not this batch's job.

---

## 4. Sequencing, and why it is not the annotation order

Frontier first: **v30-1 … v30-8 have no blockers** and can run in any order or be
split across sessions. The order below is chosen for review ergonomics, not
dependency:

1. **Deletions first** (v30-1, v30-2) — smallest diffs, zero new UI, and they
   shrink what a reviewer has to hold in mind.
2. **Readability next** (v30-3, v30-4) — one pure function and one CSS change,
   both browser-verifiable in seconds.
3. **Parity** (v30-5) — reuses a shipped dialog.
4. **The public-surface work last** (v30-6), then the moderator mounts
   (v30-7, v30-8, v30-9) — these are the only slices that can regress a surface a
   parent already uses, so they get the freshest attention.
5. **v30-9 is the only blocked slice** — on v30-6 (the photo it edits) and
   v30-8 (the modal host and the spec it extends).

---

## 5. Slices

Every slice: base = the previous slice's tip (or the batch base for the first
parallel slice); gate `npm run verify` exit 0; review lanes as usual. **Never
delete a test that pins old behaviour without replacing what it protected** — the
two deletions in this batch both have replacements named below.

### v30-1 — The post form has one time control (ticket 01)

- **Objective:** the quick-start preset row is gone from `/new`; the time field
  is the only time control, and editing a drop-in is unchanged.
- **Files in scope:** `src/lib/feed.ts`, `src/lib/feed.test.ts`,
  `src/pages/NewPlaydatePage.tsx`, `src/components/PlaydateFormFields.tsx`,
  `e2e/time-presets.e2e.ts` (delete).
- **Approach:** delete the preset builder and its test block; remove the render
  site and the now-unused slot prop; delete the spec. The form's existing
  defaults are not touched — a fresh form still opens at the parent's own clock.
  The archived v29-5 criterion is superseded by §6 of this plan, not by editing
  `plan-v29-backup.md`.
- **Acceptance criteria:**
  - `/new` renders no preset row; the time field is the only way to set a start.
  - A fresh form still defaults to the parent's current clock; `/edit` is
    unchanged and still renders no preset row.
  - No reference to the preset builder or the deleted spec remains in `src/`,
    `e2e/` or `scripts/`.
- **Verification command:** `npm run verify`; `grep -rn "timePreset" src e2e
  scripts` returns nothing.
- **Budget:** one local builder context; this is a subtraction.
- **Depends on:** nothing.

### v30-2 — The profile page has one door to Settings (ticket 02)

- **Objective:** the Settings pills are gone from both profile modes; the header
  gear remains the single entry point.
- **Files in scope:** `src/pages/ProfilePage.tsx`.
- **Approach:** delete both links (read mode and edit mode). Do **not** touch
  Settings' own link back to the profile — the removal is one-directional, and
  the reverse door is a recorded V27 decision.
- **Acceptance criteria:**
  - Neither profile mode renders a Settings link.
  - The header gear renders on every signed-in route and still opens Settings.
  - `e2e/sign-out.e2e.ts`, which pins the gear as the surviving control, passes
    unchanged.
- **Verification command:** `npm run verify`; `npx playwright test
  e2e/sign-out.e2e.ts`.
- **Budget:** one local builder context; minutes of work.
- **Depends on:** nothing.

### v30-3 — The place filters say what they filter (ticket 03)

- **Objective:** each directory filter trigger carries a visible caption and a
  value that does not truncate at phone width; sheets, options and testids are
  unchanged.
- **Files in scope:** `src/lib/feed.ts`, `src/lib/feed.test.ts`,
  `src/components/PlaceDirectory.tsx`, `e2e/place-filters.e2e.ts`.
- **Approach:** add `filterTriggerLabels` (§3.1); the component renders its
  output. The triggers stay buttons opening the same sheets — this changes what
  they display, not how they work.
- **Acceptance criteria:**
  - Unit tests pin the exact caption and value strings for every distance and
    date option.
  - At 390px wide, no trigger truncates and all three captions are visible
    without opening a sheet.
  - Each trigger's accessible name includes its caption, not only its value.
  - Sheet titles, option labels and testids are unchanged.
- **Verification command:** `npm run verify`; `npx playwright test
  e2e/place-filters.e2e.ts`; `node scripts/mobile-audit.mjs` (the places route is
  in its set).
- **Budget:** one local builder context.
- **Depends on:** nothing.

### v30-4 — The first-run tour spotlights its target (ticket 04)

- **Objective:** the ringed control renders undimmed while the rest of the screen
  stays dimmed; pass-through, Escape, Skip and once-per-tab dismissal are
  unchanged.
- **Files in scope:** `src/components/FirstRunTooltips.tsx`,
  `e2e/first-run-tooltips.e2e.ts`.
- **Approach:** reuse the ring's already-computed rectangle for the veil's cutout
  (a mask or an equivalent hole). Do not add a module, do not add a second
  geometry derivation, and do not weaken the veil: everything outside the cutout
  stays dimmed, because that is what makes it read as a tour.
- **Acceptance criteria:**
  - The cutout rectangle equals the ring's rectangle at every step, asserted in
    the browser.
  - Everything outside the cutout remains dimmed.
  - The veil stays hidden from assistive technology.
  - Pass-through, Escape, Skip and the dismissal fact behave exactly as before.
- **Verification command:** `npm run verify`; `npx playwright test
  e2e/first-run-tooltips.e2e.ts`.
- **Budget:** one local builder context.
- **Depends on:** nothing.

### v30-5 — The first-run name card shows the photo you chose (ticket 05)

- **Objective:** after choosing and cropping a photo on the name card, the card
  shows it, offers Remove, and re-opens the crop when the preview is tapped.
- **Files in scope:** `src/pages/OnboardingPage.tsx`,
  `e2e/name-card-photo.e2e.ts`.
- **Approach:** render the already-held pending photo as a preview, add a Remove
  control that clears it, and route a tap on the preview back through the
  existing crop step. Label logic otherwise unchanged. A parent who never picks a
  photo sees no preview and no Remove.
- **Acceptance criteria:**
  - The chosen photo is visible on the card, not only the words "Photo added".
  - Remove returns the card to its "Add a photo" state and leaves the name
    answers intact.
  - Tapping the preview re-opens "Adjust the photo" with the current photo.
  - The crop dialog, its copy and the crop geometry are unchanged.
- **Verification command:** `npm run verify`; `npx playwright test
  e2e/name-card-photo.e2e.ts`.
- **Budget:** one local builder context.
- **Depends on:** nothing.

### v30-6 — A place page shows the place (ticket 06) 🔴

- **Objective:** a place page shows its photo above the name with its credit; a
  place with no photo, or one whose photo fails, shows the same per-kind
  illustration the directory card uses.
- **Files in scope:** `src/lib/places.ts`, `src/lib/places.test.ts`,
  `src/pages/PlacePage.tsx`, `e2e/places.e2e.ts`,
  `docs/adr/0002-place-photos-return.md` (new).
- **Approach:** add `hasPlacePhoto` (§3.2) and reuse the existing credit
  formatter; render the hero above the heading; keep the illustration stand-in
  `aria-hidden`, matching the card; give the image an empty `alt` because the
  heading immediately below names the place. Write the ADR recording the V20
  reversal, what changed, and what was rejected (a placeholder frame — the
  existing in-tree ruling is that nothing placeholder-shaped stands in that slot).
- **Acceptance criteria:**
  - The photo renders above the heading, with provenance visible.
  - No photo (or a failed load) shows the per-kind illustration, hidden from
    assistive technology, with no empty frame.
  - One predicate decides "show a photo" for both surfaces; one credit formatter
    serves both.
  - The e2e pin asserting **zero** photo credits on a place page is updated to
    assert one, and says why it changed.
  - The ADR exists and cites V20 and the moderator tool; the applied migration is
    untouched.
- **Verification command:** `npm run verify`; `npx playwright test
  e2e/places.e2e.ts`.
- **Budget:** one local builder context. If the hero plus the ADR cannot land
  inside it, the ADR becomes its own tiny slice — do not drop the ADR.
- **Depends on:** nothing.

### v30-7 — A moderator can find the moderator tools (ticket 07)

- **Objective:** a moderator-only row in Settings → Account opens the existing
  moderator tools; a non-moderator sees no row.
- **Files in scope:** `src/components/AccountSection.tsx`,
  `e2e/moderator-door.e2e.ts` (new).
- **Approach:** add one row, gated by `canModerate` on the loaded profile, linking
  to the existing `/mod` route. No new route, no nav tab.
- **Acceptance criteria:**
  - A moderator-flagged profile sees the row, labelled **Moderator tools**, and
    it opens `/mod`.
  - A non-moderator never sees the row.
  - The route's existing guard is unchanged and remains the authority.
- **Verification command:** `npm run verify`; `npx playwright test
  e2e/moderator-door.e2e.ts`.
- **Budget:** one local builder context; minutes of work.
- **Depends on:** nothing.

### v30-8 — A moderator can fix a photo from the card (ticket 08)

- **Objective:** from a directory place card, a moderator opens the existing
  editor in a modal and replaces the photo by link or upload; the card updates
  without a reload. A non-moderator sees no control.
- **Files in scope:** `src/components/PlaceDirectory.tsx`,
  `e2e/place-photo-admin.e2e.ts` (new).
- **Approach:** mount the existing editor inside the existing modal host, opened
  by a moderator-only **Edit photo** control that is a **sibling of the card's
  anchor, never nested inside it**. Saving refreshes the card in place. The
  editor and its pure module are reused unchanged — this slice mounts, it does
  not build.
- **Acceptance criteria:**
  - A moderator sees **Edit photo** on a card; it opens the shipped editor; a
    save updates the card with no manual reload.
  - The control is never nested inside the card's link, and meets the 44px
    minimum tap target.
  - A non-moderator sees no control anywhere in the directory.
  - The new spec covers the moderator path end to end and the non-moderator
    absence — the editor currently has **zero** e2e coverage, which is exactly how
    a live tool came to look like a missing one.
- **Verification command:** `npm run verify`; `npx playwright test
  e2e/place-photo-admin.e2e.ts`.
- **Budget:** one local builder context.
- **Depends on:** nothing.

### v30-9 — A moderator can fix a photo from the place (ticket 09)

- **Objective:** from the place page's photo, a moderator opens the same editor
  and replaces the photo; the page updates in place.
- **Files in scope:** `src/pages/PlacePage.tsx`,
  `e2e/place-photo-admin.e2e.ts` (extend).
- **Approach:** reuse the mount pattern and the modal host from v30-8; the
  control sits with the hero. Extend v30-8's spec rather than adding a second
  behavioural spec for the same editor.
- **Acceptance criteria:**
  - A moderator sees the control beside the place's photo and it opens the same
    editor the card opens.
  - A save updates the photo on the page with no manual reload.
  - The control meets the 44px minimum and its accessible name states what it
    does rather than relying on an icon.
  - A non-moderator sees no control on the page.
  - No second editor spec exists — one editor, one behavioural spec.
- **Verification command:** `npm run verify`; `npx playwright test
  e2e/place-photo-admin.e2e.ts`.
- **Budget:** one local builder context.
- **Depends on:** v30-6 (the photo it edits must render), v30-8 (the host and the
  spec it extends).

### v30-10 — Batch close (orchestrator; no builder)

- **Objective:** the batch is proven, not asserted.
- **Approach:** full `npm run test:e2e`; the `ocr` lane over the batch range (it is
  installed — `v1.12.11` — and v29-11's "unavailable" was a false negative);
  `node scripts/mobile-audit.mjs`; and a diff review against the base **for
  inherited failures**, using a throwaway worktree at the base commit (§2.4).
  Then update `task-state.md` with the ledger entries and hand off.
- **Acceptance criteria:**
  - Full Playwright suite run recorded with raw output; every failure classified
    as inherited or introduced, with the base worktree as the instrument.
  - `ocr` findings recorded with each one adjudicated (confirmed / refuted /
    accepted), never silently dropped.
  - The mobile audit recorded for every route it covers, and its **gap** for
    `/place/:id` (which it does not cover) stated rather than implied.
  - `node scripts/sweep-e2e-markers.mjs select` run to confirm this batch added no
    content-table residue. **Deletion is not run** — the sweep is deferred to
    launch prep by the founder's 2026-10-04 decision (§6).
  - `task-state.md` carries the batch ledger, the evidence pointers and the
    carried-forward list from §6.
- **Verification command:** `npm run test:e2e`; `npm run verify`;
  `node scripts/mobile-audit.mjs`.
- **Depends on:** v30-1 … v30-9.

---

## 6. Carried forward — recorded here so the file swap does not lose them

- **Superseded criterion (recorded, because an archived plan is not edited):**
  V29 acceptance criterion 3 for the time presets ("Now / In an hour /
  Tomorrow 10am / Sat 10am still work") is superseded by v30-1 on **2026-10-05**:
  the time field is the only time control. The V29 plan is preserved
  byte-identically at `plan-v29-backup.md` (sha256 `e74970c5…`).
- **Marker sweep — decided, deferred to launch prep (founder, 2026-10-04):**
  284 accounts / 573 rows at last measure, `founder_overlap: 0`, every content
  table at zero, so nothing is visible to a family. The count grows with every run
  (264 → 284 in a day), so one sweep at launch prep beats two. **A dated
  deferral, not a dropped item.**
- **Human-owned, still open:** the 5-parent first-open test that v29-1 unblocked;
  the four paid/irreversible native-app decisions
  (`docs/handoff-native-apps.md`); the V24 read-surface privacy item as it stands
  in the reminder.
- **Config reconciliation, needs its own slice:** `factory/config.json`'s
  strata-max `ram_gb: 55` against the measured 52 — changing it fails 4
  assertions in `scripts/factory/scheduler.test.mjs:299`, so the config and its
  assertion must move together.
- **Credential hygiene:** a live **GitHub PAT is embedded in this repo's `origin`
  URL in `.git/config`** — rotate it and use a credential helper. *(The
  `.vercel-env-tmp.json` OIDC item is **closed**: the file no longer exists and
  was never tracked, so no rotation is needed.)*
- **Stale record claims found by the recon:** `plan-v29-backup.md`'s "Production
  is still V27. Nothing in this plan is pushed" and `task-state.md`'s
  `imageOrientation` note. Neither is this batch's work; both are now known.
- **The nightly live e2e lane has been red since 2026-09-28** (§2.4). Fixing it is
  its own batch; this one only has to avoid adding to it.

---

## 7. Non-goals (with the reason)

- **No parent-submitted place photos, and no approval queue.** Editing stays
  moderator-only: a place photo is a shared fact about a public place, and a
  stranger's wrong photo is worse than a missing one.
- **No deleting or clearing a place photo's attribution through the UI.**
  Migration 0062 is UPDATE-only by design.
- **No bulk photo import and no "places missing a photo" worklist.** The picker
  already flags "No photo" per result; turning that into a queue is its own work.
- **No sixth navigation tab.** Five is the mobile budget.
- **No change to the crop dialog, the crop geometry module, or its encoder.**
  They shipped in V7.1 and are pinned by 34 tests; this batch only reaches them.
- **No change to `/new`'s draft behaviour, fields or validation** beyond removing
  the preset row.
- **No migration, no new route, no new table.**
- **No touching `DropInCard`'s going-line rules** — the v29-2 fix and its `ocr`
  follow-up are fresh, and a photo batch is the wrong place to re-open them.

---

## 8. Risks / open questions

1. **The reversal will read as a regression to anyone who remembers V20.** The ADR
   in v30-6 is the mitigation, and it is an acceptance criterion, not a nicety. A
   reviewer who flags "photos were deliberately removed" is right about the
   history and wrong about this decision — say so in the review, do not revert.
2. **A control inside a link.** The directory card is an anchor; a nested button
   is invalid, breaks the tap target, and fires navigation. Pinned as a sibling in
   v30-8's criteria, and worth an explicit look in review.
3. **The cutout is only browser-assertable.** A CSS hole that also breaks
   pass-through would be worse than the dimming it fixes. The existing
   pass-through assertion is the guard; keep it.
4. **Copy is a contract now.** The filter captions and short values are pinned by
   unit test so a reviewer can read them in one place — which also means a wording
   change is a test change, deliberately.
5. **Master moved five times during planning** (§2.2), and one of those commits is
   unpushed. Re-measure the base before the first dispatch, and require builders
   to report out-of-slice diffs rather than absorb them.
6. **The deployed app lags the pushed commits** (§2.3). Re-check by content before
   any human review.
7. **Nine slices is more than this repo's recent batches.** They are independent
   by construction; if review capacity is the constraint, the natural split is
   {v30-1…v30-5} and {v30-6…v30-9}, with v30-9's two blockers staying inside the
   second half.

**Human decisions needed before dispatch:** none. Every slice above is settled by
the spec's seven decisions (2026-10-05) and the ticket acceptance criteria.

---

## 9. Status log (orchestrator appends after every phase transition)

- **2026-10-05 — planning.** Seven phone annotations captured and verified
  against the tree by read-only recon; **five of the founder's descriptions were
  corrected against the code** (the crop step exists and is wired at five sites;
  `/browse` cards already show photos since V27; only `/place/:id` is photo-free;
  the tour veil has no cutout; the presets were a recorded founder pick). Spec and
  nine tickets published under `.scratch/vibe-annotations-2026-10-05/`; the
  annotation export is now a repo artefact (`source-annotations.json`, sha256
  `cd3fab30…`). Gate measured this turn on a clean tree: **75 files / 2191 tests /
  86 warnings / 0 errors / GUARDS PASS, exit 0**. V29's plan archived
  byte-identically at `plan-v29-backup.md` (sha256 `e74970c5…`, matching
  `plan.md` at `969315b`). **Next: re-measure the base, then dispatch v30-1.**

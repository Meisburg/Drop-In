# Implementation Plan: V33 — the founder's third annotation batch

> Owned by the orchestrator. Written BEFORE any builder dispatch. Every slice
> below must be executable without interpretation. If a slice cannot state its
> acceptance criteria and verification command, it is not ready.
>
> The default slice gate is `npm run verify` (build + typecheck:e2e + test +
> lint + a11y:focus + steering-lint + guards). It does **NOT** run Playwright, so
> every browser assertion is pinned per slice, explicitly, in its own line.
>
> **V32's plan is preserved byte-identically at commit `0ee9c66`** (`git show
> 0ee9c66:plan.md`) and is **not** edited. V31's is at `plan-v31-backup.md`.

**Bottom line.** 24 pending annotations collapse to **14 slices**. Seven of them
need no decision and dispatch today; four need a ruling from Jon first (§6); and
**three need no build at all** — one is already shipped and the other two are
verify-or-explain. The highest-value item in the batch is a real, reproducible
defect the founder hit live: `matchPlaces` cannot find "greenlake".

- **Base:** `30e83d2` on `master`, 11 commits ahead of `origin/master`
  (`5fc5f25`). **Nothing is pushed, and nothing will be.**
- **Baseline gate that must not regress:** **91 files / 2681 tests / 88
  warnings / 0 errors · GUARDS exit 0**, measured by the previous controller on
  the committed tree.
- **Evidence for every claim below:** `/tmp/pd-slices/HANDOFF-V33.md` (this
  batch's brief), `.scratch/BATCH-SUMMARY-V32.md` (what just landed),
  `/tmp/pd-slices/pending-24.txt` (all 24 annotations, verbatim, sorted by time).
- ⚠️ **Every anchor in the 24 annotations is a snapshot of a bundle that has
  since changed** (v32-5 deleted 817 lines from `PlaceDirectory.tsx` alone).
  **Re-locate every anchor by content, never by line number.**

---

## 1. What this revision is

| Slice | Annotation(s) | Item | Size | Ready? |
|---|---|---|---|---|
| **v33-0** | — | the carried V32 debts: the lost 390px assertion + the snapshot race | small e2e | ✅ |
| **v33-1** | `muyfmog8` | `matchPlaces` ignores whitespace and punctuation | small, `lib/` | ✅ |
| **v33-2** | `muyfsjwv`, `muyfsxah` | place photo admin becomes one step, with Edit photo | small UI | ✅ |
| **v33-3** | `muye8eek` | ✅ **already built** (`8ecaa35`) — resolve, explain the data gap | no build | ✅ |
| **v33-4** | `muye9a6l` | the drop-in page says where the place is | small | ✅ |
| **v33-5** | `muyed1t6` | the card counts parents and kids, one age range | small | ✅ |
| **v33-6** | `muyekozk` | the action buttons sit beside Going, not full-width | tiny | ✅ |
| **v33-7** | `muyefjzq` | **the window is not an hour** — a real defect, then the polish | medium, behaviour | ✅ |
| **v33-13** | `muyejzaa` | confetti on Going + the mark above the modal's text | small | ✅ |
| **v33-8** | `muye28ed`, `muye1a35`, `muydzvu9`, `muyemm3k` | settings becomes a page you can act on | medium | ⛔ ruling |
| **v33-9** | `muye6aeo` | a hero photo above the profile name | medium | ⛔ ruling |
| **v33-10** | `muydnms9`, `muydpqw0`, `muydrqml`, `muydtkbk`, `muyfmj1g` | the directory's search / filter / sort module | large | ⛔ ruling + prototypes |
| **v33-11** | `muyfptn4`, `muye39z4` | places become community-owned; three roles | XL | ⛔ ADR + recommendation |
| **v33-12** | `muyc3jnt`, `muyc5kwv` | the inbox identity pair | small-medium | ⛔ wording ruling |

**Dispatch order is the table order, minus the ⛔ rows.** One builder at a time
(the V32 discipline). Nothing in waves 1–2 waits on a decision.

---

## 2. Non-goals

- **No push.** `origin/master` stays at `5fc5f25`.
- **No new paid service, no data dropped, no policy widened.** Any slice that
  would need one stops and surfaces — that is the one standing stop condition.
- **No restyle of a surface the annotation does not name.** v33-5 changes the
  card's own count line, not the card.
- **The 62 places without a photo are a DATA gap, not a layout one** (v33-3).
  Backfilling photos is queued as a recommendation (§6, R2), not a slice here.
- **The external Google Maps door stays.** It answers the area question; the
  in-app coffee toggle answers the per-place one (v32-10's ruling).

---

## 3. Interfaces

Pinned here so builders do not re-decide them. **Read, do not invent.**

| Contract | Where |
|---|---|
| `matchPlaces(query, places, limit)` — ranks 0–3, stable tie-break | `src/lib/places.ts:770` |
| `PlacePhotoAdmin` — `photo-mode-url` / `photo-mode-upload`, `photo-save-btn`, crop dialog | `src/components/PlacePhotoAdmin.tsx:281-430` |
| `detail-place-photo` (+ slot), `hasPlacePhoto`, `placePhotoVisibleTo`, `photoCreditLine` | `PlaydateDetailPage.tsx:2323`, `places.ts:1111`,`:1148`,`:1091` |
| `PlaceKindArt` — the per-kind illustration fallback | `src/components/PlaceKindArt.tsx:24-30` |
| `placePath`, `placeMapsHref` | `src/pages/PlaydateDetailPage.tsx:2355-2400` |
| `goingCountsLabel(pingCount, kidsCount, ageBand)`, `buildGoingLine`, `cardAgeRangeLabel` | `src/lib/feed.ts:1531-1578`, `DropInCard.tsx:523` |
| `validatePlaydateForm`, `isDuration`, `PLAYDATE_DURATIONS_MINUTES`, `TIME_STEP_MINUTES`, `stepTimeMinutes` | `src/lib/feed.ts:990-1090` |
| `ModalShell` + the Going confirmation | `src/components/ModalShell.tsx:191`, `PlaydateDetailPage.tsx` |
| `activeTodayLabel`, `profiles.last_seen_at`; the avatar primitive | `src/lib/*`, `v32` G5 findings |

**New, and pinned by this plan:**

- **v33-1:** the normalization seam lives in `src/lib/places.ts` beside
  `matchPlaces`, with a sibling test. Both sides normalize: lowercase, collapse
  whitespace runs, **fold apostrophes to straight and drop them from the
  comparison key**, drop `.` `,` `'` `’` and non-alphanumeric separators.
  `"greenlake"` → "Green Lake Park"; `"McDonald's"` → `"mcdonalds"`; and a query
  that is already correct (`"green lake"`) keeps its current rank.
- **v33-5:** the counts line names **parents** and **kids** explicitly, and the
  card shows an age range **exactly once**. `lib/` decides which of the two age
  sources renders; the `.tsx` renders the decision.
- **v33-7:** the window's validity is **not** chip membership. Any length that
  is a positive whole number of minutes on the form's own step grid, up to 24
  hours, is postable; the four chips remain one-tap presets. Pinned as a `lib/`
  predicate with a sibling test.
- **v33-13:** the animation is scoped to the **Going confirmation only** — the
  modal is every action's shell.

---

## 4. Slices

### v33-0 — The carried V32 debts (no annotation)

- **Objective:** the two open findings from V32 (`BATCH-SUMMARY` §3a/3b) close,
  so the gate stops claiming an assertion it does not make.
- **Files in scope:** `e2e/place-filters.e2e.ts` (`:100-131`).
- **Problem, measured:** `:100-108` claims *"The 390px no-ellipsis check is NOT
  lost with it: the indoor toggle and the kind chips carry that assertion now"*
  — **it is not carried**; the removed loop's `scrollWidth > clientWidth` check
  was never re-added. And `:124-131` snapshots `countRows.evaluateAll(...)` once
  with no wait, so a not-yet-resolved `upcomingStartTimes` fails with no retry.
- **Approach:** restore the no-ellipsis / no-widening assertion **for the indoor
  toggle and the kind chips** (the claim's own words), and make the count
  assertion wait for the read to land before snapshotting. Do not weaken either.
- **Acceptance criteria:**
  - The 390px assertion exists and is **mutation-proved**: widening a chip
    element in the source makes it fail. Show the red run.
  - The count assertion polls/waits; it passes twice in a row on the same tree.
  - No comment in the file states something the code does not do.
- **Verification command:** `npm run verify`; then
  `E2E_BASE_URL=http://localhost:<port> npx playwright test e2e/place-filters.e2e.ts
  --reporter=list` on a **freshly minted marker on that port** (twice).
- **Budget:** one small e2e dispatch. **Depends on:** nothing. **Do it first** —
  it is the only open finding where a gate is weaker than it claims.

### v33-1 — `matchPlaces` ignores whitespace and punctuation (`muyfmog8`)

- **Objective:** typing `greenlake` finds "Green Lake Park"; `mcdonalds` finds
  "McDonald's".
- **Files in scope:** `src/lib/places.ts` (`matchPlaces` + its docblock),
  `src/lib/places.test.ts` (its existing `matchPlaces` block), and any caller
  whose copy promises behaviour that changes.
- **Problem, measured:** the matcher is a word-prefix matcher over the raw
  lowercase string. `greenlake` matches **none** of the 5 "Green Lake" rows: no
  word starts with it and the stored name contains a space. The founder typed
  exactly `greenlake` at 11:19 and filed it; **five places he was trying to find
  returned nothing.**
- **Approach:** normalize BOTH sides through one exported seam before comparing —
  lowercase, collapse whitespace, fold `’`→`'`, then strip apostrophes and the
  separators `.` `,` `-` `'` and any remaining non-alphanumeric run. Compare on
  the folded key; **rank on the original string's shape** so an exact prefix
  still beats a word prefix (a normalized `name.startsWith` on the folded key is
  rank 0; a folded word startsWith is rank 1; folded contains is rank 2; address
  contains is rank 3). The empty-query and non-positive-`limit` rules are
  **unchanged** ("nothing typed, nothing matched").
- **Acceptance criteria:**
  - `greenlake` returns all 5 Green Lake rows (list them) and **ranks "Green
    Lake Park" first**; `mcdonalds` returns "McDonald's"; `"green lake"`
    (already correct) keeps its current rank.
  - A punctuation-only query (e.g. `"---"`) returns `[]` — it is not a match-all.
  - The empty / whitespace-only / non-positive-limit rules still return `[]`,
    asserted, because widening the matcher is exactly what could break them.
  - `src/lib/places.ts` exports the normalizer with a sibling test, and the test
    names the defect it detects (the `greenlake` case) rather than the mechanism.
  - No behaviour change to the caller's ordering contract: the tie-break stays
    name then id, so the same query never reshuffles.
- **Verification command:** `npm run verify`; plus a browser check on a private
  port that typing `greenlake` into the `/browse` search box shows the Green Lake
  rows (the founder's own action), screenshotted into the report.
- **Budget:** one local builder context — one pure function and its test.
  **Depends on:** nothing. **DISPATCH FIRST.**

### v33-2 — Place photo admin becomes one step (`muyfsjwv`, `muyfsxah`)

- **Objective:** clicking the photo control opens the image/uploader directly,
  and there is an explicit **Edit photo** control.
- **Files in scope:** `src/components/PlacePhotoAdmin.tsx`
  (`:281-430` today: two mode buttons at `:308`/`:320`, then the URL input or
  file input, then three actions at `:400`/`:414`/`:426`),
  `e2e/place-photo-admin.e2e.ts` (every locator whose element moves).
- **Problem, measured:** the founder must first pick a **mode** ("Paste a link" /
  "Upload a file"), and the mode defaults to `url`. He wants the uploader to open
  **first** and be the priority, with "or paste a link" as a **plain paste field**
  (not a button), plus an **Edit photo** control he could find.
- **Approach:** the crop/upload path becomes the default and first thing shown;
  "or paste a link" becomes a visible paste field beside it (no mode button); an
  `Edit photo` control renders whenever a photo is present. Keep the existing
  single save path (`prepareCroppedPhotoFile` → `uploadPlacePhoto` → set) so a
  framed link and a framed upload cannot drift.
- **Acceptance criteria:**
  - Opening the admin shows the **file picker / uploader first**, with no
    intermediate mode-selection step; "or paste a link" is a field, not a button.
  - Choosing a file still opens the crop dialog and saving still writes the row —
    proven by reading `places.photo_url` back, not by a testid presence.
  - An **`Edit photo`** control exists when a photo is already set, and it leads
    to the same one-step flow.
  - Every tap target keeps a ≥44px smallest dimension (`rule.json`), and no
    `data-testid` a spec locates positively vanishes without that spec changing
    **in the same diff** (`scripts/guards/stale-locator-guard.mjs`).
- **Verification command:** `npm run verify`; `E2E_BASE_URL=http://localhost:<port>
  npx playwright test e2e/place-photo-admin.e2e.ts --reporter=list` with a fresh
  marker; the live DB read-back quoted.
- **Budget:** one local builder context. **Depends on:** nothing.

### v33-3 — The place image "first and foremost": NO BUILD (`muye8eek`)

- **Verdict: already built by `8ecaa35` (09:34). Do not dispatch a builder.**
- **Evidence, in the tree and independent of any memory:** the slot is a
  **sibling before** the title block (`PlaydateDetailPage.tsx:2323`), and
  `e2e/post-location.e2e.ts:539-555` already asserts, **by geometry**, that the
  photo's bottom edge sits **above** the `h1`'s top edge on the signed-in detail
  page, with the credit overlay. The annotation (10:40) points inside the block
  `8ecaa35` had just added.
- **The residual, and it is real:** a place with **no photo** renders
  `PlaceKindArt` — a per-kind illustration, not a photo of where he is going.
  **62 of 234 places have no `photo_url`.** So the honest resolution is:
  - resolve the annotation in the toolbar citing `8ecaa35`, and
  - record the gap as a **data** finding (recommendation R2, §6), not a layout
    bug.
- **Verification command:** none (no code changes). The resolution note quotes
  the sha and the spec that proves it.

### v33-4 — The drop-in page says where the place is (`muye9a6l`)

- **Objective:** the place on a drop-in page is more than a bare name.
- **Files in scope:** `src/pages/PlaydateDetailPage.tsx` (the place paragraph,
  `:2355-2400`; the rating line below it, `:2400-2415`),
  `e2e/post-location.e2e.ts` (`:568-570` pins `p` exact-text of the place
  paragraph — it must change in the same diff).
- **Approach — the founder's own delegation, decided here:** `inline the place's
  own info, then link`. The paragraph already links the name to `/places/:id`
  (`:2363`) with the neighbourhood appended. Add the place's own facts as a
  single quiet line under the name — kind / indoor, distance, and open state where
  the data exists — and keep the link as the door, because **the drop-in is about
  the playdate, not the place**: a parent deciding whether to come needs "what and
  where, in one glance", and anything longer belongs on the place page, which
  already owns reviews, photos, hours and directions. Reuse the directory row's
  existing trust-line seam rather than inventing a second vocabulary.
- **Acceptance criteria:**
  - The name is still a link to the place page for a `place_id` post, and the
    free-text post still uses the Maps door (or plain text) — unchanged.
  - The new facts come from **already-loaded data**; if a fact needs a new read,
    do not add it (state which facts were dropped for that reason).
  - The quiet line renders **nothing** when the post has no `place_id` — no
    placeholder, no separator.
  - `e2e/post-location.e2e.ts`'s exact-text pin is updated in the same diff,
    deliberately, and its comment says why.
- **Verification command:** `npm run verify`; `npx playwright test
  e2e/post-location.e2e.ts e2e/place-reviews.e2e.ts --reporter=list` with a fresh
  marker.
- **Budget:** one local builder context. **Depends on:** nothing.

### v33-5 — The card counts parents and kids, and says the ages once (`muyed1t6`)

- **Objective:** the feed card says **how many parents**, **how many kids** and
  **what ages**, instead of a bare ages line.
- **Files in scope:** `src/components/DropInCard.tsx` (`:517-526` the
  `card-age-range` line, `:573-626` the going line), `src/lib/feed.ts`
  (`goingCountsLabel` `:1567`, `buildGoingLine` `:1531`, `cardAgeRangeLabel`),
  `src/lib/feed.test.ts` (the label block), and every spec that asserts the old
  strings (`e2e/feed-ages.e2e.ts`, `e2e/card-circles.e2e.ts`, and any other).
- **Problem, measured:** the card renders **two age signals and no explicit
  counts**: `card-age-range` (the **host's** kids' ages, above the place) and,
  when people are going, `3 going · 2 kids (ages 2–5)`. "Going" is the ambiguous
  word the founder has already complained about once (V6's own note: *"it only
  says like one going as in like the parent"*). He is pointing at the ages line
  and asking for counts.
- **Approach:** one line, one age range, named counts:
  - the counts line reads parent-count and kid-count **explicitly** (not
    "going"), and carries the **attendee** kids' band when it is known;
  - the card shows an **age range exactly once** — when the going line renders,
    `card-age-range` is suppressed; when nobody is going (or the pings were never
    read), the existing host-kids line stands alone, which is the only age signal
    a fresh post has;
  - the decision is a `lib/` seam with a sibling test, so the `.tsx` renders it.
- **Acceptance criteria:**
  - A card with RSVPs reads parents and kids as **words**, with the attendee age
    band; a card with none still shows the host's intended ages.
  - **No card renders two age ranges** — asserted on the rendered DOM (both
    testids are checked, one must be absent).
  - The `card-age-range` absence case is asserted too (it is an absence claim,
    and an absence assertion that runs before paint is vacuous — wait for paint).
  - `e2e/card-circles.e2e.ts`'s pinned `goingCountsLabel` expectations move in
    the same diff, deliberately, with the founder's words in the comment.
  - Nothing is added for signed-out viewers that a signed-in viewer does not get
    (no new leak).
- **Verification command:** `npm run verify`; `E2E_BASE_URL=http://localhost:<port>
  npx playwright test e2e/feed-ages.e2e.ts e2e/card-circles.e2e.ts --reporter=list`
  with a fresh marker.
- **Budget:** one local builder context. **Depends on:** nothing. **Serialize
  with v33-13** if both touch `DropInCard.tsx` (13 does not — it touches the
  modal — so they are independent).

### v33-6 — The action buttons sit beside Going (`muyekozk`)

- **Objective:** the secondary actions on a drop-in stop being full-width and
  sit beside the Going control.
- **Files in scope:** `src/pages/PlaydateDetailPage.tsx` (the RSVP block and the
  share/calendar/directions row; locate by content, not by the stale `:2709`),
  plus any spec whose geometry assertion moves.
- **Approach:** one wrapping action row at the top of the page: the Going control
  leads, the secondary actions follow at their natural width (not `w-full`),
  wrapping rather than overflowing at 390px. Keep every label and every testid.
- **Acceptance criteria:**
  - The secondary buttons are **not full-width**, and at 390px the row wraps
    without horizontal page overflow (assert `scrollWidth <= clientWidth + 1`).
  - Every control keeps ≥44px and its existing accessible name.
  - No control is lost — the count of actions before and after is asserted.
  - The `h1`/status-chip adjacency and the ≤1 `h1` rules are untouched.
- **Verification command:** `npm run verify`; `npx playwright test
  e2e/rsvp-confirmation.e2e.ts e2e/post-edit-delete.e2e.ts --reporter=list` with a
  fresh marker.
- **Budget:** one small builder context. **Depends on:** v33-4 if that slice adds
  a line above this block — **serialize**.

### v33-7 — The window is not an hour (`muyefjzq`) — **a defect first, polish second**

- **Objective:** a parent can post a window of any length, and the two time
  controls stop behaving as if the length were chosen for them.
- **Files in scope:** `src/lib/feed.ts` (`validatePlaydateForm` `:1010`,
  `isDuration` `:1078`, the parse/snap sites `:1259`, `:1417`, `:3241`),
  `src/components/PlaydateFormFields.tsx` (`whenBlock` `:545`, `endBlock`
  `:612-636`, `durationBlock` `:590`), `src/pages/NewPlaydatePage.tsx`
  (`:184`, `:506`), `src/lib/feed.test.ts` (`:1287-1290`, `:1326`, `:4107`,
  `:4160`), and the specs that step the end control.
- **Problem, measured, and it is a behaviour defect — not a polish request:**
  `validatePlaydateForm` rejects any `durationMinutes` that is not one of
  `PLAYDATE_DURATIONS_MINUTES = [60, 90, 120, 180]` with **"Pick a duration."**
  On `/new`, the End stepper writes `durationMinutes = end − start`, so a parent
  who sets a **30-minute** or a 2.5-hour window is refused at submit. That is
  exactly his sentence: *"I don't want it to be telling people it has to be an
  hour."* The two steppers are also **coupled by construction** (the end is
  derived from start + duration), which is his *"I don't want them to be linked
  together."*
- **Approach — two halves, both required:**
  1. **The defect.** Duration validity stops being chip membership: a new `lib/`
     predicate accepts any **positive whole number of minutes on the form's own
     step grid**, up to 24 hours. The four chips remain one-tap presets. Every
     parse/snap site that used `isDuration` as a sanity gate is re-checked: a
     stored 30-minute window must read back as 30, not as 0.
  2. **The polish.** The start/end control becomes one refined control that
     presents a **window**, not a duration: stepping the start no longer silently
     drags the end (or the drag is explicit and visible), and no copy implies a
     fixed hour. Keep both values 30-minute-stepped and accessible (`end-time-label`
     and the start control's existing names must survive, or the specs move in the
     same diff).
- **Acceptance criteria:**
  - A **30-minute** window can be posted end to end on `/new` — proven by
    creating the row and reading `start_at`/`ends_at` back, showing a 30-minute
    span. A 2.5-hour window likewise.
  - `0`, negative, off-grid and >24h windows are still refused, each with its own
    assertion (widening a validator is exactly how a bound gets lost).
  - The chips still write their four presets, and a chip selection still reads as
    selected.
  - `feed.test.ts:1287-1290` (the "45 and 0 are errors" pin) is rewritten
    deliberately, with the founder's words in the comment — and a new assertion
    proves `0` still fails, so the change is not a deletion.
  - No copy anywhere on the form states or implies an hour.
  - The `/edit` read path round-trips an off-chip stored duration (its own test).
- **Verification command:** `npm run verify`; the created row's `start_at` /
  `ends_at` read back from the live DB, output quoted;
  `E2E_BASE_URL=http://localhost:<port> npx playwright test e2e/post-fast.e2e.ts
  e2e/feed-empty-state.e2e.ts --reporter=list` with a fresh marker.
- **Budget:** one local builder context, and it is the largest of the ready
  slices — **if the `/edit` round-trip grows, split half 1 (the validator) from
  half 2 (the control) and ship the defect first.**
- **Depends on:** nothing. ⚠️ **Behaviour change, founder-requested, recorded as
  such in the report** — the operator's standing stop condition does not apply:
  Jon asked for it in the annotation, in his own words.

### v33-13 — Delight in the Going confirmation (`muyejzaa`)

- **Objective:** saying you are going feels like something, and the modal stops
  looking boring.
- **Files in scope:** `src/components/ModalShell.tsx` (`:191` — the modal the
  annotation points at), `src/pages/PlaydateDetailPage.tsx` or
  `src/components/DropInCard.tsx` (whichever raises the Going confirmation),
  plus a `lib/` seam if the animation's trigger is a decision.
- **Approach:** a confetti burst on the **Going confirmation only** — the modal
  is every action's shell, so the trigger is the confirmation's own variant, not
  the shell. Add the drop-in mark above the modal's text. Respect
  `prefers-reduced-motion` (the repo already uses `motion-reduce:` throughout):
  under reduced motion the confirmation still reads as celebratory by
  copy/colour, with no animation.
- **Acceptance criteria:**
  - Confetti fires on the Going confirmation and **not** on any other modal
    (asserted: another action's modal shows no confetti node).
  - The mark renders above the modal's text, with an accessible name or
    `aria-hidden` as appropriate — not a decorative image with a filled `alt`.
  - Under `prefers-reduced-motion: reduce`, no element animates (assert the
    animation is absent), and no content is lost.
  - No layout shift that pushes the modal's buttons off-screen at 390×844.
- **Verification command:** `npm run verify`; `npx playwright test
  e2e/rsvp-confirmation.e2e.ts e2e/polish.e2e.ts --reporter=list` with a fresh
  marker.
- **Budget:** one small builder context. **Depends on:** nothing.

---

## 5. Slices that need a ruling BEFORE dispatch (⛔)

These are written up so the decision is cheap, and **no builder is dispatched on
any of them until Jon rules.** Full reasoning: `HANDOFF-V33.md` §5.

- **v33-8 — settings becomes a page you can act on.** Four annotations
  (`muye28ed`, `muye1a35`, `muydzvu9`, `muyemm3k`). The rule he states is *"for
  every section there should be a way to change it — otherwise what's the point
  of having it here."* The ruling needed: **which sections are editable, and which
  stay read-only by design** (privacy facts are not all editable: his name is
  shown as *"Your name"* precisely because it is other parents' data). Log out
  moves to the bottom, away from Delete account, regardless — that half needs no
  ruling. The "families you follow" / "places you save" pair is restructured, not
  merged, because one is a following edge and the other is a bookmark.
- **v33-9 — a hero photo above the profile name.** `muye6aeo`. **Direct tension
  with a ruling made one batch ago** (`v32-6`: *the photos stay after the kids*,
  `14305b4`). A hero on the **read** view is compatible with that ruling; a hero
  that **absorbs** the "Family photos" block makes that section redundant — which
  is the part to decide. The pan/crop/swap machinery already exists for the
  Places rectangle, so the cost is low once the shape is ruled.
- **v33-10 — the directory's search / filter / sort module.** Five annotations
  (`muydnms9`, `muydpqw0`, `muydrqml`, `muydtkbk`, `muyfmj1g`). ⚠️ **He is asking
  to remove prominence he previously asked for** (V27's "prominent dropdown
  filters"), and the row he points at was changed nine minutes before he filed.
  **Do not dispatch a builder.** Plan: 2–3 cheap prototypes shown to him, then one
  slice. Two hard facts to put in front of the ruling: (a) the search box already
  **expands to the full row while typing** is *not* true today — his complaint
  that he "can't see what he's typing" is real and can be fixed independently;
  (b) **"top-rated" is currently invisible** — 4 reviews on 4 of 234 places, so a
  most-reviewed default would order four rows and tie-break 230. Its dependency is
  not code: **how do reviews get populated?** (R1, §6).
- **v33-11 — places become community-owned; three roles.** `muyfptn4`,
  `muye39z4`. The largest ask in the batch and the only one that adds a public,
  abusable surface. Needs an **ADR** in `docs/adr/` and a **written
  recommendation** before any code: dedupe, abuse handling, who approves, and
  what `places.photo_review_state` **already** does (§3 of the migration history:
  a review flow exists and must be discovered before a roles model is designed).
  Its near end — the photo-admin UI — is **v33-2** and ships now.
- **v33-12 — the inbox identity pair.** `muyc3jnt`, `muyc5kwv`. The avatar
  primitive, `activeTodayLabel` and `profiles.last_seen_at` already exist and
  already render on the inbox **row**. The ruling needed: he wants to know
  *"whether I'm wasting my time messaging them"*, and the app deliberately refuses
  to claim more than "Active today" — it is **not presence**. So: widen the wording,
  or explain the limit to him. (V32's G5 conflict also stands: no face on every
  bubble — the app deliberately writes a counterpart down once.)

---

## 6. Recommendations owed to Jon (not slices)

- **R1 — reviews are the bottleneck for "top-rated".** 4 reviews on 4 of 234
  places. Until reviews are populated, `c3b2863`'s star line and any "top-rated"
  sort are nearly invisible. Options to put to him: prompt a rating after a
  drop-in has passed, seed from an editorial list, or drop the sort.
- **R2 — 62 places have no photo, and that is why "see where I'm going" is
  sometimes an illustration.** Options: a one-off Wikimedia/OSM photo pass, a
  "no photo yet — add one" affordance (which needs v33-11's permissions), or
  accept the illustration as the honest state.
- **R3 — `coffee_nearby` is still 215 of 234 `null`** (queued as `v32-10b`). The
  script is written and re-runnable; it needs a long, paced window, not another
  impatient run.
- **R4 — marker residue is 590 rows** and `scripts/sweep-e2e-markers.mjs delete`
  refuses because 6+6 `direct_conversation_reads` rows cascade into pre-existing
  marker profiles. `founder_overlap: 0` on both sides. Clearing those collateral
  rows is a judgement call, not a script default.

---

## 7. Decisions taken, and the risks that remain

**Taken by the orchestrator (reversible, no approval needed):** the dispatch
order in §1; v33-3 is a no-build (evidence in the tree); v33-4's "inline the
place's own facts, then link" reading of *"use your best judgment"*; v33-5's
one-age-range rule; v33-7's "any window on the step grid" bound; v33-13 scoped to
the Going confirmation.

**Not taken — escalated:** the four ⛔ rulings in §5. Nothing else is blocked.

**Remaining risks, named so they are not misread as regressions:**

- **Every annotation anchor is stale.** `v33-*` briefs must say "re-locate by
  content".
- **Pre-existing e2e failures — never claim to fix:** `e2e/feed-empty-state.e2e.ts:301`,
  `e2e/places.e2e.ts:2655`, and the intermittent live-data flake
  `e2e/places-map-view.e2e.ts:730`.
- **Two files are another session's and are never reverted or staged:**
  `vite.config.ts` (dev-only `server.host`, which requires the
  `ALLOW_CONFIG_CHANGE` waiver on every `verify`) and
  `src/dev/AgentationDev.tsx` (the `:4747` toolbar endpoint).
- **`ocr` reads code only** (`.md` and agent configs are `unsupported_ext`), so
  plan prose is outside its view by construction.
- **v33-5 and v33-7 change strings/validation that specs pin.** The
  `stale-locator-guard` catches the locators; nothing catches a *meaning* change,
  so each slice's report must name every spec it rewrote and why.

---

## 8. Ledger

    V33: handoff read; HEAD 30e83d2 confirmed; only the three known files dirty
    V33: plan.md committed (0ee9c66) — V32's plan is now the record, not a WIP file
    V33: plan written (base 30e83d2); 24 annotations → 14 slices, 4 blocked on rulings
    V33: v33-3 triaged as NO BUILD — 8ecaa35 already puts the photo above the h1,
         proven by e2e/post-location.e2e.ts:539-555 (geometry, not DOM order)
    V33: v33-7 re-classified — the form REFUSES any window but 60/90/120/180
         minutes, so "it has to be an hour" is a behavioural defect, not polish

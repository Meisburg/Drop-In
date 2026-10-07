# Implementation Plan: V32 — the founder's second annotation batch

> Owned by the orchestrator. Written BEFORE any builder dispatch. Every slice
> below must be executable without interpretation. If a slice cannot state its
> acceptance criteria and verification command, it is not ready.
>
> The default slice gate is `npm run verify` (build + typecheck:e2e + test +
> lint + a11y:focus + steering-lint + guards). It does **NOT** run Playwright, so
> every browser assertion is pinned per slice, explicitly, in its own line.
>
> V31's plan is preserved **byte-identically** at `plan-v31-backup.md`
> (sha256 `fb193c65…`, matching `plan.md` at `648a176`) and is **not** edited.

**Bottom line:** ten annotations collapse to **ten slices, three of which carry a
migration**, and every product decision the batch needed has been **ruled by the
founder** — nothing is waiting on a question. Three annotations were duplicates of
others on a different surface, so the batch is smaller than its size suggests:

- **A4 is A2** — identical anchor (`LocationModal.tsx:402:9`), and the toolbar
  buckets feedback per route (`src/dev/AgentationDev.tsx:24-29`), so within his
  `/` session A2 *is* "annotation 1 … on the drop in page".
- **A7 and A9 are one change** — the same sentence about the same missing field,
  on the feed card and the detail page.
- **A6 is three separable pieces** — a reorder, a missing editor, and a schema.

- **Base:** `5fc5f25` on `master`, tracked tree clean. The founder reviewed this
  exact tree on the `:5173` dev server.
- **Evidence for every claim below:** `.scratch/founder-annotations-2026-10-07-batch2/`
  — `source-annotations.json` (raw), `numbered.json` (A1–A10), `triage.md` (the
  per-surface findings, with `file:line` throughout).
- **Gate measured THIS TURN, on the committed tree at `5fc5f25`:** `npm run verify`
  → **exit 0** — **90 test files / 2657 tests passed**, **87 lint warnings / 0
  errors**, **GUARDS: PASS** (factory-guard: 185 checks). Re-run and confirmed
  **exit 0** a second time. **Baseline that must not regress: 90 / 2657 / 87 / 0.**
- **V31's recorded baseline is stale and was replaced, not inherited.** V31's plan
  says 75 files / 2197 tests / 86 warnings; the tree has grown to 90 / 2657 / 87.
  Any slice that compares against V31's numbers will report a false regression.

---

## 1. What this revision is

| Slice | Annotation | Item | Size | Ruling |
|---|---|---|---|---|
| **v32-1** | A8 | The host panel stops being a wall | one-line fix | — |
| **v32-2** | A6c | The interests editor comes back | tiny | — |
| **v32-3** | A3 | The radius default is one mile | small + **migration 0066** | Q3: default only, his row untouched |
| **v32-4** | A7 + A9 | The location photo leads, on three surfaces | medium | — |
| **v32-5** | A1 | The "When" filter leaves `/browse` | medium + many tests | — |
| **v32-6** | A6a | The editor's section order matches the read view | medium | Q2: photos stay after the kids |
| **v32-7** | A2 + A4 | The radius slider gains its own map | medium-large | — |
| **v32-8** | A6b | Per-parent interests | medium + **migration 0067** | — |
| **v32-9** | A10 | The star rating | medium | Q1: **the place**, not the drop-in |
| **v32-10** | A5 | The coffee toggle | medium-large + **migration 0068** | Q4: OpenStreetMap, cached on the row |

Migration numbers are pinned in dispatch order: **0066** radius default,
**0067** `parent_cards.interests`, **0068** `places.coffee_nearby`. A slice that
runs out of order renumbers, and the renumbering is a ledger entry.

**Every slice can dispatch today.**

---

## 2. Non-goals

- **A "no ceiling" radius.** `/browse`'s `'any'` sentinel is deliberately
  unreachable (`PlaceDirectory.tsx:290-292`); nothing here reopens it.
- **Rating the place where it already lives.** `PlaceRatingLine` is already on
  three surfaces; v32-9 does not move or restyle them.
- **Replacing the external Google Maps door.** v32-10 adds an in-app answer or
  says why it cannot; it does not delete the existing honest door.
- **Redesigning the drop-in detail page.** v32-1 restyles one block. The page's
  structure, its RSVP block and its copy are out of scope.
- **A second `h1` anywhere.** v32-4 inserts an image; it does not restructure
  headings (`e2e/rsvp-confirmation.e2e.ts:168-180` takes the document's first `h1`).

---

## 3. Interfaces

Pinned here so builders do not re-decide them.

**Already exist — read, do not invent:**

| Contract | Where |
|---|---|
| `hasPlacePhoto`, `placePhotoVisibleTo`, `photoCreditLine` | `src/lib/places.ts:1111`, `:1148-1155`, `:1091` |
| `PlaceKindArt` — the per-kind illustration fallback | `src/components/PlaceKindArt.tsx:24-30` |
| `places.photo_url`, attribution, `photo_review_state` | `0029_places.sql:138`, `0046:60+`, `0063:84` |
| `radiusPreviewCircle`, `framingCircle`, `zoomForRadius` | `src/lib/places.ts:1039-1062`, `:2098` |
| `PlaceMap` / `PlacesMap` with `radiusCircle`, lazy wrapper | `src/components/PlaceMap.tsx:226`, `PlaceMapLazy.tsx:69-73` |
| `PlaceRatingLine`, `reviewRatingLine`, `getReviewSummary` | `PlaceRatingLine.tsx:24-63`, `src/lib/reviews.ts:183`, `src/lib/db.ts:6737-6760` |
| `parent_cards` row = one per parent, and its RLS | `0047_parent_cards_account_links.sql:90-110`, `:121-139` |

**New, and pinned by this plan:**

- `PlaydateWithNeighborhood.place_ref` (`src/lib/types.ts:634`) gains
  `photo_url: string | null` and `photo_review_state: 'confirmed' | 'unreviewed' | null`.
  Fed by widening the existing embed at `src/lib/feed.ts:864` and the projection at
  `src/lib/db.ts:836`; **`getPlaydateDetail` (`src/lib/db.ts:1524-1541`) gains the
  same `places` embed**, because it currently fetches no place row at all.
- `parent_cards.interests text` (nullable, no CHECK — matching `profiles.interests`
  at `0022_kids_v3.sql:162`; the length cap is a UI pin, `0022:31`).
- `DEFAULT_RADIUS_MILES = 1` (`src/lib/feed.ts:72`) and the DB column default
  (`0012_zip_radius.sql:664`). The CHECK already permits 1 (`0045_radius_min_one.sql:65`).
- One `lib/` seam per new decision (the build law: React renders, `lib/` decides).
  A slice that adds a conditional to a `.tsx` without a `lib/` sibling is a plan
  defect, not a builder problem.

---

## 4. Slices

### v32-1 — The host panel stops being a wall (A8)

- **Objective:** the host's "This is your post" panel drops from ~219px to a
  single compact row without losing one control.
- **Files in scope:** `src/pages/PlaydateDetailPage.tsx` (the block is
  `1979-2126`, and it is the **first child** of the page root at `:1956`, above the
  title). Plus any e2e spec whose copy or accessible name moves.
- **Approach:** this is a **class-level restyle of an already-rendered block** —
  no schema, no new data, no new contract. Measured: the panel is 218.77px of a
  785.43px page (≈28%), it is not sticky, and the arithmetic only reaches 219px
  because the three `HOST_STATUS_OPTIONS` labels ("On" / "Cancelled" / **"End this
  post now"**, `:2792`) wrap to two lines at 448px. Collapse the count line and the
  `Edit`/`Delete`/`Duplicate` row onto one line; drop the `mt-3 border-t pt-3`
  section wrappers (`:2058`, `:2095`); keep the Status options reachable — the file
  says they are the **only** status surface (`:2053-2056`). The panel's
  `shadow-sm` (`:1984`) already contradicts `DESIGN.md:387` ("flat at rest, borders
  not shadows") and `:502` ("Shadow Strategy: none at rest"), so the minimal
  restyle also aligns it with the written design law.
- **Acceptance criteria:**
  - Every control still exists and still works: `edit-post`, `delete-post`,
    Duplicate, the retry button, all three status options, `stop-repeating`.
  - The panel is **at most 60% of its measured 218.77px height** at 448px wide, and
    the three status options sit on **one** row at 448px.
  - Every control keeps a **≥44px** smallest dimension (`rule.json:29-39`,
    `DESIGN.md:372`). Today these sit at the floor only via `px-3 py-3` + `text-sm`;
    a one-line layout must state `min-h-11` explicitly.
  - `Delete` is **not** a filled red control (`DESIGN.md:471`).
  - No string that a spec locates positively changes without that spec changing in
    the same diff — `scripts/guards/stale-locator-guard.mjs:60-65` fails otherwise.
- **Verification command:** `npm run verify`; then `npx playwright test
  e2e/post-edit-delete.e2e.ts e2e/host-status.e2e.ts e2e/post-again.e2e.ts
  e2e/feed-empty-state.e2e.ts --reporter=list` with a **fresh marker minted on the
  port under test** (`E2E_BASE_URL=http://localhost:<port> npx playwright test
  e2e/auth.setup.ts …` — Playwright restores `localStorage` per origin, so a lane
  pointed at a port its state was not minted on measures the app **signed out**).
- **Budget:** one local builder context; a layout change and spec copy.
- **Depends on:** nothing. **Note:** no audit lane covers this panel —
  `mobile-audit.mjs:53` uses a placeholder id signed out and `signed-in-audit.mjs`
  never visits a detail page — so `rule.json` and the reviewer are the only guards.

### v32-2 — The interests editor comes back (A6c)

- **Objective:** a parent can type their own interests on `/profile`, where today
  the field is stored and shown but unwritable.
- **Files in scope:** `src/pages/ProfilePage.tsx` (the stub is `:805-814`; the read
  render is `src/components/ProfileView.tsx:884-886` gated by `showsInterests` at
  `:510`). Plus a `lib/` seam if the cap moves into one.
- **Problem, measured:** `profiles.interests text` exists (`0022_kids_v3.sql:162`)
  and already renders — but the editor stubs it out with `interests: () =>
  Promise.resolve()`, commented *"V15 T07 removed them from /settings entirely"*.
  So the founder is asking to display a field he cannot fill in. This is the
  cheapest half of A6 and needs **no schema**.
- **Approach:** restore the input in the identity card, reusing the existing
  length cap (≤100, `0022:31`) and the existing write path shape. Keep the read
  render untouched. If the cap is currently a bare literal, it becomes a pinned
  const with a sibling test rather than a third copy.
- **Acceptance criteria:**
  - A parent can type interests, save, reload, and see the value persist.
  - `ProfileView` renders `Interests: …` only when non-empty (`showsInterests`
    unchanged) — an empty field renders **nothing**, asserted.
  - The 100-character cap is enforced by a `lib/` seam with a sibling test, not by
    a `.tsx` literal.
  - No second copy of the cap string anywhere (`grep` for the literal returns one
    definition).
- **Verification command:** `npm run verify`; `npx playwright test
  e2e/profile.e2e.ts --reporter=list` with a fresh marker.
- **Budget:** one local builder context; one input and one seam.
- **Depends on:** nothing.

### v32-3 — The radius default is one mile (A3) — **RULED: default only**

- **Objective:** a brand-new parent's radius starts at 1 mile, and the fallback
  agrees, with his own stored row handled the way he decides.
- **Files in scope:** `supabase/migrations/0066_*.sql` (new),
  `src/lib/feed.ts:72`, `src/pages/ProfilePage.tsx:228` (a stray literal `5` that
  ignores the constant), `e2e/fixtures.ts:976`, `src/lib/feed.test.ts`,
  `src/components/LocationModal.tsx:410` (the A3b defect below).
- **Approach:** the default and the fallback are **different lines** and both move:

  | Site | Line | Which default |
  |---|---|---|
  | DB column default | `0012_zip_radius.sql:664` | the **brand-new user** (`createProfile` inserts no radius, `src/lib/db.ts:550-570`) |
  | `DEFAULT_RADIUS_MILES = 5` | `src/lib/feed.ts:72` | the **fallback when nothing is stored** (11 readers) |
  | `useState<number>(DEFAULT_RADIUS_MILES)` | `OnboardingPage.tsx:327` | follows the constant — no edit |
  | literal `5` | `ProfilePage.tsx:228` | a second source of truth that must join the constant |

  The migration is **strictly additive and idempotent** (`alter column … set
  default 1`), per `rule.json:12-16`. Six assertions pin the 5
  (`src/lib/feed.test.ts:2629-2683`) and move with it.
- **⚠️ The honest caveat, and it must appear in the slice's record: the 35 he saw
  is his own stored row.** `profiles.radius_miles` is 35 for him, and `/` passes
  `profile.radius_miles ?? DEFAULT_RADIUS_MILES` (`FeedPage.tsx:1334`). **Q3 ruled:
  change the default only — his own row is not touched, so his screen does not
  change.** The slice's report must say so in those words, because "the default is
  now 1" and "the founder sees 1" are different claims and only the first is true.
  If he later wants his row at 1, that is one `update`, not a slice.
- **Acceptance criteria:**
  - A fresh profile is created with `radius_miles = 1`, proven by reading the row
    back, not by reading the migration.
  - `DEFAULT_RADIUS_MILES` is 1 and every reader follows it; the stray literal at
    `ProfilePage.tsx:228` no longer exists as a literal.
  - The migration is idempotent: applying it twice exits clean, and the read-back
    shows `default 1`.
  - **A3b is fixed in the same slice:** on `/browse` with a stored radius above 30,
    the slider's label and its thumb agree instead of the thumb pinning at `max=30`
    while the label reads 35 (`LocationModal.tsx:410`).
  - The unit suite's six default assertions read 1, and the count grows rather than
    shrinks.
- **Verification command:** `npm run verify`; the migration applied and read back
  (`select column_default from information_schema.columns where table_name =
  'profiles' and column_name = 'radius_miles'`), output quoted; `npx playwright
  test e2e/zip-radius.e2e.ts e2e/feed-empty-state.e2e.ts --reporter=list` with a
  fresh marker.
- **Budget:** one local builder context; a migration, a constant and its assertions.
- **Depends on:** nothing.

### v32-4 — The location photo leads, on three surfaces (A7 + A9)

- **Objective:** a drop-in shows the place's photo above its heading, on the feed
  card, the signed-in detail page, and the signed-out public detail page.
- **Files in scope:** `src/lib/feed.ts:864` (the embed), `src/lib/db.ts:836`,
  `:1524-1541` (the detail read), `src/lib/types.ts:634`,
  `src/components/DropInCard.tsx` (banner inside the body `Link` at `:379`),
  `src/pages/PlaydateDetailPage.tsx` (insert before the title block at `:2129`,
  and before the public branch's own `h1` block at `1733`).
- **Approach:** the photo exists; **the plumbing does not.** `places.photo_url`
  (`0029:138`) is reached through nullable `playdates.place_id` (`0030:83`); the
  feed's embed selects only `( id, kind, indoor )` and `listRadiusFeed` projects
  coordinates out of an already-loaded places map and discards the rest
  (`db.ts:836`, `:883`). Extend the projection and the detail read; do not add a
  column. Render through the three existing rules — `hasPlacePhoto`,
  `placePhotoVisibleTo` (an `unreviewed` photo must **not** reach a parent),
  `photoCreditLine` — and fall back to `PlaceKindArt`, which is the pattern at
  `PlaceDirectory.tsx:1904-1922` and is quoted there in his own earlier words.
  Use `aspect-[2/1]`, not `h-36`: the stored photos are 1400×700
  (`PlacePage.tsx:642-656` records why). The card's box deliberately has no
  `overflow-hidden` (`DropInCard.tsx:652-655`, focus rings), so the banner clips
  itself with `rounded-t-xl`, mirroring the address row's `rounded-b-xl`.
- **Acceptance criteria:**
  - A drop-in whose place has a `confirmed` photo renders that photo **above** its
    heading on all three surfaces; the credit renders.
  - A drop-in whose place has an `unreviewed` photo renders the **per-kind
    illustration**, never the photo — asserted, because this is the moderation
    boundary.
  - A drop-in with **no `place_id`** (a free-text address) renders the illustration,
    never a grey frame and never a broken image.
  - The status chip remains the `h1`'s **immediate next sibling** — six specs assert
    `h1 + span` (`e2e/host-status.e2e.ts:97,103,116,175,180`,
    `e2e/while-away.e2e.ts:229`). Inserting **before** `:2129` satisfies this;
    inserting between the `h1` (`:2140`) and the chip (`:2142`) breaks all six.
  - The place paragraph still contains **exactly** the place name
    (`e2e/post-location.e2e.ts:432-434`, `e2e/places.e2e.ts:2124-2126`).
  - The banner `<img>` carries an `alt` (`rule.json:34`); the card banner uses its
    **own** testid — `dropin-card` is shared with `ProfileView.tsx:1154`.
  - Exactly **one** `h1` per page (`e2e/rsvp-confirmation.e2e.ts:168-180`).
- **Verification command:** `npm run verify`; `E2E_BASE_URL=http://localhost:<port>
  npx playwright test e2e/address-maps.e2e.ts e2e/post-location.e2e.ts
  e2e/host-status.e2e.ts e2e/feed-ages.e2e.ts --reporter=list` after minting a fresh
  marker on that port.
- **Budget:** one local builder context, but it **touches four render surfaces** —
  if it overruns, split the feed card from the two detail branches.
- **Depends on:** nothing.

### v32-5 — The "When" filter leaves `/browse` (A1)

- **Objective:** the last dropdown on `/browse` is gone, with nothing left dead
  behind it.
- **Files in scope:** `src/components/PlaceDirectory.tsx`, `src/lib/places.ts`,
  `src/lib/places.test.ts` (`:2451-2650`, `:2799-2839`),
  `e2e/place-filters.e2e.ts` (`:100-113`).
- **Approach:** the visible delete is 7 lines (`PlaceDirectory.tsx:1005-1011`); the
  honest removal is a cascade. He is right that it does not belong: it filters
  **in memory** through `planDirectoryList` (`places.ts:2278-2343`) via
  `placeInDateWindow` (`:1410-1445`) — no query, no URL param, no persistence, and
  no other route carries a date window. Each of these becomes dead and the reviewer
  checks for exactly this:
  `dateWindow` state (`:350`), `openDropdown` (`:417`), `triggers` (`:812`),
  `whenOptions` (`:813-816`), the "show Upcoming instead" empty state
  (`:1354-1371`); and in `places.ts`: `DATE_WINDOWS` (`:1309`),
  `DATE_DROPDOWN_LABELS` (`:1319`), `filterTriggerLabels` (`:1355-1378`), the
  `dateWindow` param (`:2317`), both predicates (`:2431-2437`, `:2478-2483`),
  and the empty copy (`:1454-1456`). `DropdownTrigger` (`:57-111`) and
  `PlaceFilterSheet` then have **zero callers**.
  `upcomingStartTimes` **stays** — it still feeds `upcomingCount` on every row
  (`places.ts:2398-2404`).
- **Acceptance criteria:**
  - `/browse` renders **no** `places-when-filter` and no date-window control.
  - Nothing is left dead: `DropdownTrigger`, `PlaceFilterSheet`, `DATE_WINDOWS`,
  `DATE_DROPDOWN_LABELS`, `filterTriggerLabels` and the date predicates are
  **deleted**, not orphaned. A `grep` for each returns nothing.
  - The e2e spec that located the control positively is updated **in the same
  diff** — `scripts/guards/stale-locator-guard.mjs:49-60` fails otherwise.
  - `upcomingCount` still renders on every directory row (its own assertion).
  - The remaining kinds chips, the indoor toggle and the coffee door still work,
    and `/browse` still side-scrolls at 390px without widening the page.
- **Verification command:** `npm run verify` (the guards included, which is what
  catches a stranded locator); `npx playwright test e2e/place-filters.e2e.ts
  e2e/places.e2e.ts --reporter=list` with a fresh marker.
- **Budget:** one local builder context; a cascade, and the tests are most of it.
- **Depends on:** nothing. (v32-10 later touches the same chip row — serialize them.)

### v32-6 — The editor's section order matches the read view (A6a) — **RULED: photos stay after the kids**

- **Objective:** the profile editor reads user → parents → kids, matching the read
  view, with every pinned source of truth moved in one diff.
- **Files in scope:** `src/pages/ProfilePage.tsx` (move the block at `1621-1671`
  plus its comment `1608-1620`), `src/lib/profileSections.ts:47`,
  `src/lib/photoStorage.ts:400-420`, `src/components/ProfileView.tsx:48-53`,
  `scripts/profile-order-check.mjs`, and the three comment blocks that become lies.
- **Approach:** **step 0, before any edit, run the guard and record its raw
  output.** `473d35b` moved the read view's parents above its kids section and did
  not re-pin the guard, so the read-side subsequence check
  (`scripts/profile-order-check.mjs:466-470`, `PINNED` at `:107`) plausibly
  **already fails on the current tree**. That is an inference from reading the
  code and it must be confirmed or killed by a live run, because otherwise this
  slice cannot tell its own regression from a pre-existing one.
  Then move the block, and move all six pins with it:

  | Pin | Where | Today |
  |---|---|---|
  | `PINNED` | `profile-order-check.mjs:107` | kids before parents |
  | `'edit mode puts kids BEFORE the parents group'` | `profile-order-check.mjs:526-530` | asserts the **opposite** of A6 |
  | `ALLOWED_AFTER_PHOTO` edit tail non-empty | `profile-order-check.mjs:645-663` | moving parents up **empties the tail** |
  | `PROFILE_SECTIONS` | `src/lib/profileSections.ts:47` | kids before parents |
  | `PROFILE_EDIT_SECTIONS` | `ProfilePage.tsx:81-85` | kids before parents |
  | `profileBlurbOrder` edit branch | `src/lib/photoStorage.ts:400-420` | kids before parents |

  `src/lib/profileSections.test.ts:92` asserts `isInPinnedOrder(['user','parents',
  'kids'])` is **false** and `:104` re-sorts to kids-first; both invert.
  The three lying comments move in the same diff:
  `ProfilePage.tsx:1615-1616`, `:1328-1333`, `:1685-1691`.
  **Q2 ruled: *Family photos* stays after the kids.** The target edit order is
  therefore **user → parents → kids → family photos**, which is exactly the read
  view's projection (`ProfileView.tsx:622`, `:750`, `:903`) — the two surfaces end
  up agreeing, which is the whole point of the slice. The cost is explicit: the
  family photo is now the **last** block in the editor, so the guard's
  `ALLOWED_AFTER_PHOTO` edit-tail rule (`:645-663`) — which encodes his older ask
  that the family photo is the "closer of the optional blocks" — must be
  **relaxed in the same diff**, with the ruling and his words recorded in the
  guard's docblock. That is a deliberate change to a founder rule, not an
  incidental test edit, and the report must label it as such.
  ⚠️ Because the photo lands last, the guard must still fail if the photo drifts
  **above** the kids, which is what his older ask actually protects. Keep that half.
- **Acceptance criteria:**
  - The guard's raw output at step 0 is quoted, and its verdict at the end is
  **PASS** — with the pre-existing condition, if any, named as pre-existing.
  A green guard after a re-pin is only meaningful if the starting state is known.
  - The edit DOM order is user → parents → kids → family photos (asserted on the
  rendered DOM, not on a constant).
  - Read and edit agree: `src/lib/profileSections.ts` and
  `src/pages/ProfilePage.tsx:81-85` declare the same order, and the guard's
  cross-surface check passes.
  - The guard still **fails** when the family photo is moved above the kids —
  shown by a mutation, because relaxing a rule that then fires on nothing is how a
  guard quietly stops guarding.
  - No comment in the diff states an order the code does not produce.
- **Verification command:** `npm run a11y:profile-order` (step 0 and again at the
  end, raw output both times); `npm run verify`; `npx playwright test
  e2e/account-links.e2e.ts e2e/profile.e2e.ts --reporter=list` with a fresh marker.
  ⚠️ This lane is a **live browser lane** that seeds a parent card through the
  marker's session and restores it — and `npm run verify` does **not** run it, so
  it is a deliberate explicit run. It is origin-bound: mint the marker on the port.
- **Budget:** one local builder context; the guard work is half of it.
- **Depends on:** nothing. **Serialize with v32-2** — both edit `ProfilePage.tsx`.

### v32-7 — The radius slider gains its own map (A2 + A4)

- **Objective:** the location modal shows a map above the radius slider, with the
  home pin and a blast-radius circle that follows the drag, on `/` and on `/browse`.
- **Files in scope:** `src/components/LocationModal.tsx` (the control is
  `396-420`; the sheet is `:305-306`), `src/pages/FeedPage.tsx` (the modal props,
  `:1331-1338`), a new `src/lib/*.ts` seam + its sibling test,
  `src/components/PlaceDirectory.tsx:1242-1249`,
  `e2e/places-map-view.e2e.ts`, `e2e/feed-empty-state.e2e.ts`.
- **Approach:** **the map, the pin and the circle already exist** — `PlaceMap.tsx`
  is Leaflet + OpenStreetMap (`:49`), takes `radiusCircle` (`:226`), draws the home
  pin (`:476-491`) and a to-scale circle (`:493-537`), and a **live drag preview is
  already wired** on `/browse` (`radiusPreviewCircle`, `places.ts:1039-1062`,
  driven from `PlaceDirectory.tsx:1242-1249`). A2 is therefore **relocation and
  wiring**, not construction:
  1. Put the map **inside** the sheet above the radius label. It must be inside:
     the sheet is `items-end` on phones (`:306`) and would otherwise cover a map
     rendered behind it, and the band that landed today (`feed-map-band`) only
     renders in map view.
  2. Give it an explicit height — a zero-height Leaflet pane renders nothing.
  3. Wire `/`: `FeedPage.tsx:1331-1338` passes the modal **no map and no
     `onRadiusChange`**, so the slider drives nothing there today.
  4. Reuse `radiusPreviewCircle` + `framingCircle` behind a `lib/` seam with a
     sibling test; the modal's geometry decision is a rule, not a render.
  5. Stacking is already solved (`MODAL_OVER_LEAFLET_Z_CLASS` = `z-[1100]`,
     `LocationModal.tsx:306`, `src/lib/stacking.ts:58`).
  6. ⚠️ On `/` leaflet is code-split (`PlaceMapLazy.tsx:69-73`), so a map in the
     modal pulls that chunk **on modal open**. On `/browse` it is already in the
     bundle.
- **Acceptance criteria:**
  - Opening the modal on `/` and on `/browse` shows a map above the radius slider
    with a home pin, and dragging the slider changes the drawn circle — asserted by
    comparing the circle's rendered geometry before and after a drag, not by
    asserting the element exists.
  - On a 390×844 viewport the map is **visible inside the open sheet** (non-zero
    height, inside the sheet's box) — the failure mode this slice exists to avoid.
  - The circle reflects the **stored or draft** radius on open, and follows the
    draft while dragging; the map never shows a radius the label does not.
  - The geometry decision lives in `src/lib/` with a sibling test; the `.tsx`
    renders it.
  - `npm run verify` and the two named specs pass, with the modal's own testids
    unchanged (`location-radius-slider`, `location-modal`, …).
- **Verification command:** `npm run verify`; `E2E_BASE_URL=http://localhost:<port>
  npx playwright test e2e/places-map-view.e2e.ts e2e/feed-empty-state.e2e.ts
  --reporter=list` after minting a fresh marker on that port.
- **Budget:** one local builder context for placement + seam; if the `/` wiring
  grows, split it.
- **Depends on:** v32-3 (both edit `LocationModal.tsx`) — serialize.

### v32-8 — Per-parent interests (A6b)

- **Objective:** each parent row carries an Interests line that other signed-in
  parents can read.
- **Files in scope:** `supabase/migrations/0067_*.sql` (new),
  `src/components/ProfileView.tsx` (the parent rows, `:621-672`),
  `src/pages/ProfilePage.tsx` (`ParentCardEditor`), `src/lib/parentCards.ts`,
  plus a `lib/` seam and sibling test.
- **Approach:** one nullable `interests text` column on `public.parent_cards`
  (`0047:90-110`) — one row per parent, which is exactly his "each parent".
  **No policy change is needed:** `parent_cards_select_authenticated` reads
  `using (true)` for `authenticated` (`0047:121-139`), and RLS is row-level, so a
  new column is visible to other signed-in parents automatically, which is his
  stated purpose; `anon` still reads nothing and writes stay owner-only by row.
  Plain `text`, not an array or a join table: both existing fields of this kind are
  plain nullable `text` (`profiles.interests` `0022:162`, `kids.likes` `0022:161`)
  and the schema has no array or join-table precedent. Naming follows the app's own
  split — **"Interests"** for a parent, "likes" for a kid.
  ⚠️ Batch-1's triage recorded this as "roughly half a day"; that estimate is the
  one to beat, not to assume.
- **Acceptance criteria:**
  - Migration is strictly additive and idempotent (`rule.json:12-16`); applied and
    **read back**, with the output quoted.
  - A second signed-in parent reads another parent's interests — proven by a real
    read as a non-owner, not by reading the policy. `anon` reads **zero** rows,
    proven in the same run.
  - The owner writes and updates their own row; a non-owner write is **refused**,
    proven.
  - The read render shows `Interests: …` only when non-empty; empty renders nothing.
  - Batch-1's A1-b acceptance (the parent rows stack one per row) still holds.
- **Verification command:** `npm run verify`; the migration applied + read back;
  `npx playwright test e2e/account-links.e2e.ts e2e/profile.e2e.ts --reporter=list`
  with a fresh marker.
- **Budget:** one local builder context; a migration, an editor field, a read line.
- **Depends on:** v32-2 (both add a field to the same editor) and v32-6 (both edit
  the parent card area) — serialize. **Takes migration 0067** (v32-3 owns 0066).

### v32-9 — The star rating (A10) — **RULED: the place's rating**

- **Objective:** the drop-in detail page shows the place's existing star rating.
- **Files in scope:** `src/pages/PlaydateDetailPage.tsx` (mount `PlaceRatingLine`
  in the place block, `2129-2179`), `src/lib/db.ts` (`getReviewSummary`, already
  exists), `src/components/PlaceRatingLine.tsx`, `e2e/place-reviews.e2e.ts`.
- **Approach:** **Q1 ruled: the stars rate the PLACE.** The app already has the
  whole mechanism — `reviews` (`0052_reviews.sql`, `score 1–5`, PK
  `(place_id, author_profile_id)`), the pure rules (`src/lib/reviews.ts`),
  `getReviewSummary` (`src/lib/db.ts:6737-6760`) and the shared display element
  `PlaceRatingLine` (already on three surfaces). **No migration.** The page already
  holds `detail.place_id` (`:2151`), so this is one read and one mount. He chose
  the place reading over "place now, drop-in later", so **rating the drop-in
  itself is out of scope and is not queued.**
  The one decision, pinned here rather than left to the builder: **a signed-out
  visitor sees no rating line.** `review_summary` is granted to `authenticated`
  **only** (`0052_reviews.sql` §3), so the choices are granting anon EXECUTE (a
  policy widening this slice must not do silently) or hiding the line — and the
  repo already has the precedent for hiding: the place page tells a signed-out
  visitor *"Reviews are for signed-in parents."* and **does not issue the read at
  all**. Reuse that, and do not issue the read.
- **Acceptance criteria:**
  - The rating renders on the drop-in detail page, and is **absent** (not zero, not
    "Be the first to rate") when the place genuinely has no rating.
  - A **signed-out** visitor to a public drop-in page sees no rating line **and no
    request to `review_summary` is issued** — asserted both ways, because the
    second is the one that leaks.
  - `data-testid="place-rating-line"` now appears on a **fourth** surface, so its
    count is pinned deliberately rather than left to collide with a future
    `toHaveCount(1)`.
  - The existing three surfaces are byte-identical in behaviour (no restyle).
- **Verification command:** `npm run verify`; `npx playwright test
  e2e/place-reviews.e2e.ts e2e/rsvp-confirmation.e2e.ts --reporter=list` with a
  fresh marker.
- **Budget:** one local builder context; one read and one mount.
- **Depends on:** nothing. (v32-4 also edits this page — serialize.)

### v32-10 — The coffee toggle (A5) — **RULED: OpenStreetMap, cached on the row**

- **Objective:** a parent can ask "can our kids play here **and** can we drink a
  coffee", and get an answer in the app.
- **Files in scope:** `supabase/migrations/0068_*.sql` (new), `scripts/` (a new
  refresh script), `src/components/PlaceDirectory.tsx:1169-1191` (the existing
  door), `src/lib/places.ts` (a predicate beside the `indoor` branch at `:1532`),
  `src/lib/types.ts`.
- **Approach:** **Q4 ruled: OpenStreetMap, cached on the row.** He is right that the
  chip does not satisfy him: `f3ec849` shipped an `<a href>` to Google Maps with no
  `aria-pressed` and no state, while the real kind chips at `:1107-1131` carry both.
  But a toggle needs a fact to filter on, and the app has none — the chip's own
  comment predicted this shape (`:1160-1168`, *"needs a nearby-places source
  (Google Places Nearby or Overpass) plus a caching decision; that is a slice, not a
  chip"*) and `e2e/places.e2e.ts:3215-3225` pins the wall it describes (0 live rows
  for coffee/cafe/food/zoo).
  **The caching decision is pinned here, and it is the whole design:** Overpass is a
  shared free endpoint with rate limits and multi-second latency, so it is **not**
  queried at read time. A **`places.coffee_nearby boolean`** column is populated by
  a **script** that asks Overpass once per place and is re-runnable, and the toggle
  filters on the **column**. That keeps the read path offline and testable — this
  repo's posture — instead of making every directory load depend on a public API
  being up. It also makes the toggle's correctness a `lib/` predicate over a stored
  fact, which is exactly the `indoor` branch's shape (`places.ts:1532`).
  **A toggle with no such fact would be a chip that filters nothing** — the defect
  the existing comment exists to prevent — so the column lands **before** the
  toggle, in one slice, with the script's output as evidence.
  ⚠️ The column is nullable and **three-valued** on purpose: `true` = a cafe is
  near, `false` = asked Overpass and none is, `null` = never asked. A place that was
  never asked must not be silently treated as "no cafe".
- **Acceptance criteria:**
  - The chip has a real selected/unselected state (`aria-pressed`, an `onClick`,
    matching `:1107-1131`) **and selecting it changes the directory's rows** —
    asserted by comparing the rendered row set with the toggle off and on.
  - The migration is strictly additive and idempotent (`rule.json:12-16`), applied
    and **read back**, output quoted.
  - The refresh script is **re-runnable** and idempotent, and its output states how
    many places it asked about and how many it set true/false — so a partial run is
    visible rather than silent.
  - A place with `coffee_nearby = null` is **excluded** when the toggle is on, and
    the empty state says what it knows; a place with `false` is excluded too. Both
    cases have their own assertion, because collapsing them is the bug this design
    is shaped to avoid.
  - The predicate lives in `src/lib/places.ts` with a sibling test, in the style of
    the `indoor` branch (`:1532`), and its test names the defect it detects.
  - The chip row still satisfies its pinned count assertion
    (`e2e/places.e2e.ts:3238`, `PLACE_KIND_CHIP_KINDS.length + 2`), which the new
    state must not perturb.
  - The existing external Google Maps door is **kept** — the in-app toggle answers
    the per-place question, and the door still answers the area question.
- **Verification command:** `npm run verify`; the migration applied + read back; the
  refresh script run and its output quoted; `npx playwright test e2e/places.e2e.ts
  e2e/place-filters.e2e.ts --reporter=list` with a fresh marker.
- **Budget:** one local builder context for the toggle and the predicate; the
  migration plus the refresh script is likely its own slice — **split before
  dispatch** if the script's Overpass work grows past a first pass.
- **Depends on:** v32-5 (the same file, serialized). **Takes migration 0068.**

---

## 5. Decisions taken, and the risks that remain

**Ruled, 2026-10-07 — these are no longer open questions:**

**Q1 → A10 rates the place, not the drop-in.** The existing `reviews` table, rules
and `PlaceRatingLine` are reused; **no migration**, and rating the drop-in itself is
not queued. The decision that follows is pinned in v32-9: a signed-out visitor sees
no rating line and the read is not issued, matching the place page's precedent.

**Q2 → *Family photos* stays after the kids.** The editor becomes user → parents →
kids → photos, matching the read view exactly. This **relaxes the guard rule that
encodes his older ask** that the family photo is the closer of the optional blocks;
the relaxation, his two words, and the reason are recorded in the guard's docblock,
and v32-6 must still prove the guard fires if the photo drifts above the kids.

**Q3 → the default changes; his own row does not.** `DEFAULT_RADIUS_MILES` and the
DB column default become 1 for new parents. **His screen does not change** — his
`profiles.radius_miles` is 35. The slice report must state that plainly rather than
implying a visible fix.

**Q4 → OpenStreetMap, cached on the row.** A `places.coffee_nearby boolean` is
filled by a re-runnable script and the toggle filters the **column**, so no read
path depends on a public API. Three-valued on purpose (`true` / `false` / `null`).
The existing Google Maps door is kept.

**Remaining risks, named so they are not misread as regressions:**

- The profile-order guard is **not in `npm run verify`** and plausibly **already
  fails on the read side** after `473d35b` (A6e). v32-6 measures it first, and a
  pre-existing failure must be labelled as one.
- `profiles.interests` renders but has been unwritable since V15 T07 (A6d).
- The radius slider's `max=30` disagrees with a stored 35 (A3b) — fixed in v32-3.
- `mobile-audit.mjs` does not measure the drop-in detail panel, and no lane measures
  a range input (A3c).
- **v32-10's Overpass pass is the one slice whose quality depends on an external
  dataset**, so its `false` values are only as good as OpenStreetMap's coverage of
  cafes near these 239 places. The script's output is the evidence, and the empty
  state must not overclaim.

---

## 6. Supersessions and decisions recorded, not implied

- **A4 is not a slice.** It repeats A2 on the same element; the toolbar's per-route
  bucketing plus the identical anchor settle it, and the timestamp rules out the
  tempting A8 reading (A8 was written six minutes *after* A4).
- **A7 and A9 are one slice.** Same sentence, same missing field; shipping one alone
  leaves the two surfaces inconsistent.
- **No schema for the banner.** `places.photo_url` already exists; the work is a
  projection. The alternative — a host-uploaded post photo — is a different product
  and is not planned.
- **Nothing is resolved on `:4747` yet.** All ten stay pending until they ship or are
  dismissed, so the founder's queue still shows real open work.

---

## 7. Ledger

    V32: annotation batch pulled (10 items, 5 sessions) — .scratch/founder-annotations-2026-10-07-batch2/
    V32: five read-only explorers dispatched, one per surface; reports folded into triage.md
    V32: plan written (base 5fc5f25); plan-v31-backup.md preserved (sha256 fb193c65…)
    V32: batch = 10 slices, three migrations (0066 radius, 0067 parent interests, 0068 coffee)
    V32: all four product decisions ruled by the founder (Q1 place rating … Q4 OpenStreetMap)
    V32: gate measured — exit 0, 90 files / 2657 tests / 87 warnings / 0 errors / GUARDS PASS (re-run, same)

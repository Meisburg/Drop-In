# V16 — the founder's mobile feedback batch (opened 2026-09-21)

Source: the founder's own feedback while using the **deployed app on his phone**,
delivered as 4 screenshots + pasted DOM snippets across 6 screens.

## Why this batch exists (and what it says about the loop)

The founder's stated problem was "I'm struggling to give really targeted
feedback." This batch is the answer to that: **screenshots + pasted DOM =
targeted.** Every item below is either measured or visually evidenced, which
means each one can become a bounded slice with a real verification step.

The Airbnb screenshots (images 2–3) are **Airbnb's app, not ours** — reference
material for the places/browse redesign, never a bug report. Recorded that way.

## Batch shape

- **6 screens**: Login, Nearby, Inbox, Places, Post, Profile, Settings, plus the
  profile-owner modal.
- **26 items**. Triaged below into: copy (trivial), layout/order, real defects,
  and one design-system-sized redesign.
- **0 migrations expected** — nothing here obviously needs schema. If t06 (a
  bigger likes field) drops the 100-char limit, that is a `text` column check,
  not a new table.

---

## Triaged tickets

### t01 — copy removals and one rewrite (trivial, no design decisions)
Cheapest possible batch: pure text. Four removals + one replacement.

- **Login**: `Messages from the drop-ins you're both going to.` →
  `See what families are up to in your area!`
- **Inbox**: remove `Messages from the drop-ins you're both going to.`
- **Profile**: remove `This is what other families see about you. Edits save as you go.`
- **Settings**: notifications must be individually controllable for
  "you posted something" and "you said you're going" — check what exists
  before building anything.
- **Gate**: `npm run build && npm run test`; copy assertions in playtest
  `must_contain` where a removed string is currently asserted.

### t02 — Inbox reaction button: the emoji reads as selected (defect, diagnosed)
**The founder's read was "it looks yellow / already selected." The code does not
agree with the obvious diagnosis — I checked, and the diagnosis is different.**

`src/pages/InboxPage.tsx:159-163` — the unpressed state is already neutral:

```tsx
reaction.mine
  ? 'border-indigo-600 bg-indigo-600 text-white'   // pressed: indigo fill
  : 'border-slate-300 bg-white text-slate-500 hover:border-slate-400'  // rest: white
```

So the button **fill** is white at rest, and `aria-pressed="false"` in the
founder's own pasted markup confirms it. **What is yellow is the 👍 emoji
glyph itself** (`<span aria-hidden="true">👍</span>`, line 167) — a color emoji
paints its own native yellow regardless of the `text-slate-500` the button
sets, because `color` does not apply to a color-emoji glyph.

**The real defect:** the emoji is the only saturated thing in a row of neutral
slate controls, so the eye reads it as "active" before any interaction. The
button's `color` declaration has no effect on it — a dead style.

**Fix space (for the builder to choose):**
- Desaturate the glyph at rest (`filter: grayscale(1)` / `opacity`) and restore
  full color when `reaction.mine` — makes the visual state match the semantic
  state.
- Or swap the emoji for an inline SVG thumb, which honors `currentColor` and
  removes the platform-emoji dependency entirely.

- **Evidence**: code above + founder screenshot + pasted `aria-pressed="false"`.
- **Gate**: unit test asserting the rest state carries no saturated fill;
  visual check in the playtest lane.

### t03 — Post form: remove Ages chips, fix section order, fix duplicate overflow

**CODE-VERIFIED 2026-09-21 (round 1) — two of the three items changed shape.**

1. Remove the entire `ages-chips` block (Ages optional).
   **CONFIRMED PRESENT**, but **NOT A SAFE DELETION — see the consequence
   below.** The block is `src/components/PlaydateFormFields.tsx:847`
   (`data-testid="ages-chips"`, comment at :815), rendered by exactly ONE
   consumer: `NewPlaydatePage.tsx:1064`
   (`agesSlot={<AgeRangeChips selected={ageRange} onSelect={setAgeRange} .../>}`).

   **THE CONSEQUENCE, code-verified:** the chips are the ONLY way a host can
   set a STATED age range. `ageRange` feeds the submit at
   `NewPlaydatePage.tsx:865-866` (`ageMin: ageRange?.min, ageMax:
   ageRange?.max`), which `db.createPlaydate`'s `ageRangeFields` writes to
   `playdates.age_min` / `age_max` (migration `0037_playdates_age_range.sql`).
   Removing the chips means **no post can ever carry a stated age range again**
   — every card would fall back to the DERIVED from-kids path.

   The existing comment at `NewPlaydatePage.tsx:1055-1061` pins the current
   semantics: *"The stated range wins over the derived one on the card."*
   Removing the chips deletes the stated path entirely.

   **This is a PRODUCT DECISION, not a cleanup.** It needs a founder ruling
   before dispatch:
   - **(i)** Remove the chips and accept that ages are always derived from the
     kids a host is bringing (simpler form; the DB columns stay, nothing writes
     them; the card's stated-over-derived precedence becomes dead code).
   - **(ii)** Remove the chips but KEEP the stated path by deriving it
     automatically from the selected kids (no new UI, ages still stated).
   - **(iii)** Keep the chips; the founder's instinct was about form length, so
     move them behind the existing "More options" disclosure instead.
   Recommendation: **(ii)** or **(iii)**. (i) silently degrades the card's
   information for every future post.

2. Order must be: `Kids you're bringing (optional)` then `Details (optional)`.
   **ALREADY CORRECT — NO WORK.** `PlaydateFormFields.tsx:608` is "Kids you're
   bringing" and `:652` is "Details", in that order. The founder's item is a
   fourth instance of this batch's recurring pattern: the feedback describes a
   state the code is not in. Recorded as verified-existing, dropped from the
   slice.

3. **Defect**: "Duplicate existing" list — text spills outside the buttons
   (founder image 4).

   **DIAGNOSED, exact cause:** `src/pages/NewPlaydatePage.tsx:754-755` defines
   `lastPostClassName` with **`w-fit`**, and the row button at `:965` applies it.
   The row label is `{row.label}{statusLabel ? ' · ' + statusLabel : ''}` — a
   long title plus a date. `w-fit` sizes the pill to its *unwrapped* content
   width, but the pill also carries `min-h-11` (a fixed 44px floor) and
   `rounded-full`. When the text wraps to two lines inside that pill, the text
   overflows the visible rounded shape — the exact spilling the founder
   photographed.

   **The fix** is a layout correction, not a string change: the row must either
   truncate to one line (`truncate` + `min-w-0`, letting the flex parent bound
   it) or drop `w-fit` so the pill grows to a real width and wraps sanely. The
   container at `:953` is `flex max-h-64 flex-col gap-1 overflow-y-auto` —
   a **column** flex, so each row button is its own full-width line already;
   `w-fit` is fighting that.

   **Gate**: unit + e2e `post-fast` / `post-edit-delete` updates; the overflow
   is verifiable at 320px in the mobile audit.

**Slice size after verification: 2 real items (ages chips out, duplicate rows
fixed), 1 dropped as already-correct.**

### t04 — Profile: combine the two modals, fix likes field, remove hosted modal
1. Combine "Your photo" + display-name into ONE modal — hover the photo circle
   to edit/remove, change display name in the same place.
2. **Defect**: the `kid-likes` field is too small to read what you typed, and
   the 100-char limit is wrong. Make it a real textarea, raise/remove the cap.
   (Possible migration — check the column type first.)

   **Verified:** `src/pages/ProfilePage.tsx:1015` wraps Likes in a
   `flex min-w-0 flex-1 basis-40 items-center gap-1` row — a single-line
   `<input>` sharing a row with the age input, so it is inherently narrow. The
   cap is a **UI-only pin**, not a DB constraint: `LIKES_MAX_LENGTH = 100`
   (`src/lib/db.ts:2300`) and the column is `kids.likes text` (nullable,
   migration `0022_kids_v3.sql:161`). **No migration needed** — a `text` column
   already holds any length; only `validateKidLikes` and the counter UI change.
3. Remove the "Hosted drop-ins" modal.

- **Gate**: unit on the likes limit constant; e2e `profile.e2e.ts` updates;
  maxLength assertion changes.

### t05 — Profile owner modal: identity, order, kids, parents
1. Avatar (`h-10 w-10`) is too small for the identity surface — size it to the
   name/heading.
2. Order must be: `@name` → About the kids → About the parents →
   hosted drop-ins.
3. **About the parents**: show a parent photo + description, plus a "Message"
   button routing to Inbox.

   **ITEM 3 IS PARTLY ALREADY BUILT (code-verified 2026-09-21, round 2).** The
   Message button EXISTS: `UserPage.tsx:548-557`, `data-testid=
   "message-profile"`, and it already routes to the inbox
   (`navigate(\`/inbox?dm=${profileId}\`)`). What is genuinely missing from
   item 3 is only the **parent photo** in the About-the-parents block — today
   that block renders `profile.bio` + `profile.interests` and no image
   (`UserPage.tsx:419-436`). **Restated scope: add the parent photo, keep the
   existing Message button as-is.**
   NOTE: `UserPage.tsx:518-520` gates the whole action row on
   `isOwnProfile ? null : ...` — so on your OWN page there is no Message button
   (correct: you cannot message yourself). The founder's ask was about the
   visitor view.

4. **About the kids**: show each kid's photo + description. Photos exist in the
   private `kid-photos` bucket but are NOT rendering here.

   **CONFIRMED.** The kids rows (`UserPage.tsx:495-513`) render
   `kidLabel(kid.first_name, kid.age)` plus an optional ` · Likes: ...` and no
   `<img>` at all; the existing comment at :442-446 pins *"no code path may
   reach a kid's avatar_url for display"*, and `kidPhotoVisibility` returns
   `'owner'` only for the owner. Founder decision Q3 = render kid photos on
   `/u/:handle` **when `isOwnProfile` is true**. The kids section already
   gates on `isOwnProfile` (:493), so the visitor path stays photo-free with
   no change to the privacy rule.

- **Note**: item 4 may be the V9 t04 invariant biting — kid photos are
  owner-self-view only *by design*. **This is a judgment call for the founder**:
  the owner's own modal is a self-view, so showing photos may be correct. Confirm
  before building; do not silently weaken the privacy invariant.

### t06 — Nearby: distance filter, location setter, map at top (design-sized)
The biggest item, and the one the Airbnb reference actually informs.

**CODE-VERIFIED 2026-09-21 (round 2) — item 1 is PARTIALLY ALREADY BUILT.**

1. `Nothing within 35 miles yet.` needs the same Distance filter the Places
   section has — let the user widen/narrow.

   **PARTIALLY EXISTS, and the gap is narrower than the founder thought.**
   The empty state is the shared `RadiusEmptyState` (`src/components/
   RadiusEmptyState.tsx`), and it **already renders escape buttons** that
   change the radius — no new control is needed to widen:
   - `radiusEscapes(radiusMiles)` (`src/lib/feed.ts:1874-1886`) returns, in
     ascending order: `Back to 5 miles` (only when current > 5), `Widen to 20
     miles`, `See everything in Seattle` (35).
   - Each button calls the EXISTING `updateHomeZipRadius` and then `refresh()`,
     which re-runs the feed query (`RadiusEmptyState.tsx:63-78`).
   - Buttons are disabled when there is no session or no home zip (:61).

   **So what the founder is actually missing is:** (a) the escapes only appear
   in the EMPTY state — a feed with one result at 5 miles offers no way to
   widen, and (b) there is no way to NARROW below the saved radius from the
   feed, and (c) no address/ZIP entry on this screen at all.

   **Restated scope for t06.1**: promote the radius control from empty-state-only
   into a persistent control on the feed (the founder's ask), rather than
   building escapes that already exist. Verify the "already built" claim in
   the built app before writing code.

2. Let the user set ZIP or address here, so they trust "near you".

   **CONFIRMED ABSENT on the feed.** The only ZIP control is inside
   `RadiusEmptyState`'s escape write path, which reuses the ALREADY-SAVED
   `home_zip` (`profile?.home_zip`, :52) — it can change the radius but not the
   zip. Setting a zip lives on `/profile` (or onboarding). Real work.

3. Show a map at the TOP of the nearby list (like Places does), with a
   **map/list toggle**.

   **CONFIRMED ABSENT.** `FeedPage.tsx` has no `PlacesMap` import; Browse is the
   only page with a map (`BrowsePage.tsx:392`). Real work — and note the feed is
   a DIFFERENT data shape from Browse (posts vs places), so `PlacesMap`
   (which takes `places`) cannot be reused as-is. A post-marker map is new
   work, not a wiring job.

   **HOW THE JOIN WOULD WORK (verified round 4):** a playdate row carries
   **`place_id`** (`src/lib/types.ts:196`) and `address` (:178), so a feed map
   joins posts → `places` for coordinates. `PlacesMap` takes
   `places: readonly Place[]` (`PlaceMap.tsx:179-191`), so the feed either
   (a) passes the DISTINCT places its posts reference and uses its own marker
   layer for per-post pins, or (b) the map component grows a post-marker mode.
   Option (a) needs no change to the shared component; note that posts with
   `place_id === null` (free-text places) have NO coordinates and must be
   handled — the feed already tracks an `unplaced` concept for Browse's
   equivalent (`filteredUnplaced`).
   **Size: this is a real slice, not a one-liner.** It also depends on t07's
   map work (default zoom policy, z-index), so sequence it AFTER t07.

- **Gate**: unit on distance filtering; playtest route grows; visual check.
- **Sequencing note:** t06.3 depends on t07's map work (marker rendering,
  z-index discipline). Decide whether the feed map shares t07's component
  before dispatching either.

### t07 — Places: map fixes, default zoom, distance options, Airbnb-style redesign
Seven sub-items; the redesign is the large one.

**Real defects (do first):**
1. **Set location opens BEHIND the map** (image 1 — clear visual proof).

   **DIAGNOSED 2026-09-21 (round 2) — root cause is a z-index INVERSION, proven
   from the BUILT css, not inferred:**
   - The `location-modal` carries Tailwind **`z-50`**, which the built
     stylesheet emits as `.z-50{z-index:50}` (`BrowsePage.tsx:666`).
   - Leaflet's own controls (the +/− zoom buttons, the attribution bar) carry
     **`z-index: 800`** — `leaflet-control{z-index:800}` in the built CSS
     (source: node_modules/leaflet/dist/leaflet.css:100,134).
   - **50 < 800**, so the Leaflet zoom control paints ON TOP of the modal
     backdrop. The founder's screenshot shows exactly this: the +/− box sitting
     over the dimmed map inside the "Set location" dialog.

   Note this is NOT the usual leaflet.css-source-order trap the repo already
   documents in `src/index.css:217-229`; that one is about specificity in the
   tap-target override. This is a plain stacking comparison the modal loses.

   **The fix:** the modal must out-stack Leaflet. Options, in order of
   preference: (a) raise the modal above 800 (Tailwind `z-[900]`, or the
   repo's own convention if one exists); (b) give the modal's stacking context
   an isolated root so Leaflet's internal z-indexes are contained — but a
   `fixed` overlay already creates a stacking context, so this alone does NOT
   fix it (the comparison is between two positioned siblings at the root);
   (c) lower Leaflet's control z-index globally — REJECT, that affects every
   map and is a shared-component change for a modal-local bug.
   **Prefer (a)**, and apply it to BOTH modals in `BrowsePage.tsx` (`:573`
   filter-sort and `:666` location) since they share the bug — the founder only
   photographed one, but they are the same `z-50` string.
   **Gate:** this is verifiable in the rendered DOM — assert the modal's
   computed z-index exceeds the Leaflet control's, in a unit-adjacent way, or
   assert the class string via the existing pattern.
2. Map defaults to a wide view where dozens of blue dots cluster into a blob.
   Default to a tight zoom at the user's ZIP/address, showing their home pin and
   the nearest places.

   **DIAGNOSED 2026-09-21 (round 2), exact cause:**
   `src/components/PlaceMap.tsx:305-310` builds `boundsPoints` from **every
   place PLUS the home pin**, then calls
   `map.fitBounds(L.latLngBounds(boundsPoints), { padding: [28,28], maxZoom: DETAIL_ZOOM })`.
   `fitBounds` picks the zoom that fits **all** points, and `maxZoom: 15`
   (`DETAIL_ZOOM`, :42) only caps how far IN it may go — it does nothing to stop
   the view zooming OUT. With dozens of places spread across Seattle the fit is
   a wide city view, and every marker collapses into the overlapping blue blob
   the founder photographed. The home pin is then a dot in that blob.
   **The fix is a policy change, not a bug fix:** the view must anchor on
   HOME at a fixed zoom (`HOME_PIN_ZOOM = 13`, :44 — already defined and used
   for the home-pin-only branch at :222) and let off-screen places sit outside
   the canvas, OR fit to the RADIUS CIRCLE rather than to the points. The
   existing `radiusCircle` effect (:319+) already recenters to fit the radius —
   that is the anchor the founder actually wants, and the points-fit is
   fighting it.
   **Note the V15 t02 invariant at :300-303:** *"the pin can never scroll out of
   view (V15 t02's AC1 — the view is anchored on home) and every place on the
   map is inside the canvas and tappable."* Those two goals CONFLICT at city
   scale. This needs a founder ruling on which wins — see "Open questions".

3. Distance options are missing `Within 1 mile`.
   **CONFIRMED,** and it needs migration 0045: the options come from
   `RADIUS_MILES_OPTIONS = [2, 5, 10, 20, 35]` (`src/lib/feed.ts:58`) and the DB
   backstop is `check (radius_miles between 2 and 35)`
   (`0012_zip_radius.sql:676`). Founder decision Q1 = widen to 1–35.

4. The `places-distance-filter` dropdown is now **redundant** if a Set location
   control sits above the map — remove it.
   **CONFIRMED PRESENT** at `BrowsePage.tsx:470-490`, options built from
   `RADIUS_MILES_OPTIONS`. Founder decision Q4 = keep both, demote the dropdown
   to a compact control (they do different jobs: Set location = origin, dropdown
   = range). **This supersedes the founder's "remove" ask** — recorded so the
   builder does not delete it.

**Redesign (from the Airbnb reference, images 2–3):**
5. Search results open already zoomed to the user's area.
6. Map at top, list below.
7. Big photo per place card; heart to save at top-right of the photo; a floating
   **Map** button that scrolls back to the map when you've scrolled down.

- **Gate**: this needs a spec before build — it changes the page's whole shape.
  Do NOT dispatch as a single slice; `/to-spec` then slice it.

---

## Dispatch order (proposed)

| # | Ticket | Size | Risk |
|---|---|---|---|
| 1 | t01 copy | trivial | none |
| 2 | t02 reaction button | small | none |
| 3 | t03 post form | small | the overflow is a real defect |
| 4 | t04 profile modals | medium | possible migration |
| 5 | t05 owner modal | medium | **privacy judgment call — needs founder** |
| 6 | t06 nearby map | large | design decision |
| 7 | t07 places redesign | XL | **spec first, then slice** |

Per-ticket gate: `npm run build && npm run test`. Batch gate: full suite +
lint + playtest lane.

## Founder decisions (2026-09-21 — "accept all", after a grilling round)

Facts established by a read-only explorer subagent (`f23f7452`) before these
decisions, because the original feedback assumed a UI shape that does not
exist:

- **There is no owner MODAL.** The header `@name` at `src/App.tsx:203-208` is a
  plain `<Link to={/u/${display_name}}>` — it NAVIGATES. The owner's own visit
  renders `src/pages/UserPage.tsx` in self-view (`isOwnProfile`).
- `src/pages/ProfilePage.tsx` (route `/profile`) is the EDITOR and renders the
  same three headings. **These are two different files** and both were in scope
  for the founder's reorder request.
- **Kid photos are owner-only by construction**: `kidPhotoVisibility`
  (`src/lib/photoStorage.ts:173-179`) returns `'owner' | 'denied'` and nothing
  else; the signed-in-stranger case is the one the test exists for
  (`photoStorage.test.ts:63`). Exactly ONE surface renders a kid photo today —
  the owner's `/profile` editor (`ProfilePage.tsx:1296-1302`).
- **Family photo is a separate concept**: `profiles.family_photo_url`, object at
  `<uid>/family/photo.<ext>`, readable by ANY signed-in family
  (`familyPhotoVisibility`, `photoStorage.ts:254-258`).
- **The notification toggles the founder asked for already exist**, five
  per-kind mutes (`src/lib/push.ts:59-79`, rendered
  `NotificationsSection.tsx:348-367`), including exactly "Someone joins your
  drop-in". Prefs are CLIENT-SIDE ONLY (`localStorage` `dropin.push.muted`,
  `push.ts:248`, mirrored to Cache Storage for the service worker) — there is no
  preferences table.

### The seven decisions

| Q | Decision |
|---|---|
| Q1 | **Widen** `profiles_radius_miles_chk` to `between 1 and 35` and add `1` to `RADIUS_MILES_OPTIONS`. One migration. |
| Q2 | Toggles exist but are **unfindable** → fix placement/discoverability, do NOT build new kinds. |
| Q3 | Kid photos MAY render on `/u/:handle` **only when `isOwnProfile` is true** — the existing `'owner'` rule already permits it; the visitor path stays photo-free. |
| Q4 | Reorder **`UserPage.tsx` only** (kids → parents). The `/profile` editor keeps its established layout. |
| Q5 | Ship the t07 **defects now**; the Airbnb-style redesign goes to its own spec + batch. |
| Q6 | Acceptance needs **both**: measurable rules (map height, photo present, heart hit area ≥44px) AND full-route phone screenshots for the taste call. |
| Q7 | **Merge** the three attendee toggles into one "Changes to drop-ins I'm attending" switch. No migration, no new kinds. |

### Consequences of the decisions

- **Q1 makes t07 the batch's only migration** (0045). It changes the SAVED
  profile radius, not merely a view filter — blast radius is wider than "zoom
  in". Applied live via CDP at ship time.
- **Q3 is now small**: `UserPage.tsx` already branches on `isOwnProfile`, and
  `kidPhotoVisibility` already returns `'owner'` for the owner. The work is
  extending the mint call to that surface behind the existing gate — NOT a
  privacy change.
- **Q4 touches `profileBlurbOrder`** (`photoStorage.ts:302-311`), a pure seam
  with tests — the reorder is a seam change plus test update, not a JSX shuffle.
- **Q2 and Q7 are the same file** (`NotificationsSection.tsx`) and should ship
  as one slice to avoid two passes over the same component.
- **Q6 grows the mobile audit** from 2 routes to all 8, with screenshots.

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
Three bounded changes:

1. Remove the entire `ages-chips` block (Ages optional).
2. Order must be: `Kids you're bringing (optional)` then `Details (optional)`.
3. **Defect**: "Duplicate existing" list — text spills outside the buttons
   (image 4).

- **Gate**: unit + e2e `post-fast` / `post-edit-delete` updates; the overflow is
  verifiable at 320px in the mobile audit.

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
4. **About the kids**: show each kid's photo + description. Photos exist in the
   private `kid-photos` bucket but are NOT rendering here.

- **Note**: item 4 may be the V9 t04 invariant biting — kid photos are
  owner-self-view only *by design*. **This is a judgment call for the founder**:
  the owner's own modal is a self-view, so showing photos may be correct. Confirm
  before building; do not silently weaken the privacy invariant.

### t06 — Nearby: distance filter, location setter, map at top (design-sized)
The biggest item, and the one the Airbnb reference actually informs.

1. `Nothing within 35 miles yet.` needs the same Distance filter the Places
   section has — let the user widen/narrow.
2. Let the user set ZIP or address here, so they trust "near you".
3. Show a map at the TOP of the nearby list (like Places does), with a
   **map/list toggle**.

- **Gate**: unit on distance filtering; playtest route grows; visual check.

### t07 — Places: map fixes, default zoom, distance options, Airbnb-style redesign
Seven sub-items; the redesign is the large one.

**Real defects (do first):**
1. **Set location opens BEHIND the map** (image 1 — clear visual proof).
2. Map defaults to a wide view where dozens of blue dots cluster into a blob.
   Default to a tight zoom at the user's ZIP/address, showing their home pin and
   the nearest places.
3. Distance options are missing `Within 1 mile`.
4. The `places-distance-filter` dropdown is now **redundant** if a Set location
   control sits above the map — remove it.

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

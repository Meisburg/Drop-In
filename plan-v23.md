# Implementation Plan: V23 — the feedback batch (9 founder annotations, 4 pages)

> Owned by the orchestrator. Written BEFORE any builder dispatch.
> Source: the founder's written feedback, 2026-09-23, delivered with three
> screenshots (duplicate-row text spill; the Places map blanked by the popup;
> the Post page's bottom "Browse all places" button).
> V22's plan is at `plan-v22-backup.md`.
>
> **FILENAME NOTE.** This plan lives at `plan-v23.md` rather than the shared
> `plan.md` on purpose. A SECOND WRITER on this checkout reverted `plan.md` and
> `task-state.md` to HEAD at ~13:5x, destroying this plan once already (see
> `.scratch/v23/ledger.md`, "V23 BATCH: PAUSED"). Until that writer stops, the
> batch's documents use V23-scoped names so they cannot be clobbered again.
>
> The default slice gate is `npm run verify` (build + test + lint + a11y:focus +
> steering-lint + guards). Slices that touch rendered behavior ALSO pin
> `node scripts/mobile-audit.mjs` (needs `npm run build && npm run preview`).

## Goal

Four surfaces lose the specific things the founder named: **Drop Ins** stops
shoving two post buttons and a permanent location form into the page and gets
ONE clear choice instead; **Post a drop-in** stops spilling text out of its
buttons, moves the place picker into a scrollable lightbox, and gives every place
a "Start a drop-in / Details" pair instead of a dead "Browse all places" button
at the bottom; **Places** stops breaking its own map when a pin is tapped and
loses the "Find it on the map" button; **Inbox** shows a colour dot for unread
and can no longer show one parent twice.

We know it is done when `npm run verify` passes on a FROZEN tree, the mobile
audit passes at every phone viewport, and the specific assertions below hold.

Baseline before any work (measured 2026-09-23, commit `ff49d0c`):
**1147 tests passing / 36 files**, lint 0 errors / 68 warnings.

**The user's three decisions, taken before planning:**
1. **Place Details gets a REAL comment wall** — a new `place_comments` table
   with RLS + moderation, not a read-through of playdate comments.
2. **Sleek is skipped.** The `design-mobile-apps` skill was run and read in full;
   its *principles* are applied in code (see below), but no sleek.design design
   passes are generated and no API key is used.
3. **One batch, sliced, plan first** — this file.

## Non-goals

- **No rebrand.** The terracotta palette, the raised role-based type scale, and
  the Bricolage Grotesque / system-stack split stand (`PRODUCT.md`).
- **No new runtime dependencies.** React 18, Tailwind v4, `react-router`,
  Leaflet, Supabase only. The lightbox reuses `FocusTrap`, not a modal library.
- **No removal of `/browse`.** The founder wants the *bottom button* gone from
  `/new`, and the picker lightboxed. `/browse` keeps its route and nav tab.
- **No public place profiles.**
- **No "Find it on the map" replacement on the map popup** — removal, not a
  substitute; the place page's "Learn more" already carries the OSM fallback.
- **NOT MINE, NOT TOUCHED:** the concurrent writer's read-view/edit-surface
  section-order work (`photoStorage.ts`, `ProfileView.tsx`, `ProfilePage.tsx`,
  `photoStorage.test.ts`, `scripts/profile-order-check.mjs`). It is in the tree
  and its ownership is undecided; no V23 slice may edit those files.

## Design principles (from the `design-mobile-apps` skill, applied in code)

1. **A tab bar is for navigation, not actions** — the Drop Ins page's job is to
   make the remaining action read as a *choice*, not a shove.
2. **Do not mix icon sets.** New icons come from the existing
   `src/components/icons.ts` (Solar, via `NAV_ICONS`).
3. **44px minimum tap target, 16px minimum input font** — enforced by
   `scripts/mobile-audit.mjs` and `.opencodereview/rule.json`.
4. **Review the whole screen, never a viewport crop.**
5. **A control is offered only when the thing behind it is real** (the V19/V20
   `placeActions` discipline): "Details" must lead to a page that exists.

## Interfaces

**New pure module — `src/lib/placeComments.ts`** (build law: pure function +
sibling `placeComments.test.ts`):
```ts
export const PLACE_COMMENT_MAX_LENGTH = 500
export function validatePlaceComment(body: string): string | null
export function placeCommentCountLabel(count: number, placeName: string): string
export function sortPlaceComments<T extends { created_at: string }>(rows: readonly T[]): T[]
```

**Migration — `supabase/migrations/0050_place_comments.sql`.** Idempotent
(`create table if not exists`; every policy guarded on `pg_policies` by name —
`create policy` has no `if not exists`). Policies mirror 0013/0047: SELECT to
`authenticated` where `hidden_at is null`; INSERT only as yourself
(`author_profile_id = auth.uid()`); UPDATE only for moderators; DELETE by author
or moderator. **Not readable by `anon`.**

**New route — `/place/:id/details`**, the Place Details page (comment wall,
follower count + Follow control, upcoming drop-ins here, web-search link).

**The one shared "Details" seam — `placeDetailsPath(placeId)`** in
`src/lib/places.ts`, beside `placePath`. Builders use this, never a hand-written
`/place/${id}/details`.

**Shared component — `src/components/LocationModal.tsx`**, extracted from
`PlaceDirectory.tsx`'s inline "Set location" dialog so `/browse` AND the feed
open the SAME modal. Props: `open`, `onClose`, `radiusMiles`, `homeZip`,
`onGeocode`, `onApplyRadius`. Existing e2e testids (`location-modal`,
`location-see-places-btn`, `location-radius-slider`, `location-modal-close`)
MUST keep working — `e2e/places.e2e.ts:1539-1602` asserts them.

## Slices

### Slice 1: the Drop Ins page — one choice, and location behind the modal

- **Objective:** The feed's top stops presenting a shoved-in button and a
  permanently-visible zip form; the action becomes one choice among two, and
  location moves behind `LocationModal`.
- **Files in scope:** `src/pages/FeedPage.tsx`,
  `src/components/LocationModal.tsx` (new), `src/components/PlaceDirectory.tsx`,
  `src/components/RadiusEmptyState.tsx`, `src/lib/feed.ts` (+test),
  `e2e/zip-radius.e2e.ts`, `e2e/feed-empty-state.e2e.ts`.
- **Approach:** Replace the standalone link (`FeedPage.tsx:1018-1032`) and the
  always-visible Distance select + zip form (`:1105-1185`) with ONE `md:max-w-md`
  action row: a primary "Post a drop-in" (`data-testid="feed-post-drop-in"`
  retained) and a secondary choice that opens `LocationModal`, carrying the
  location summary (`homeZipControlLabel(profile.home_zip)` + the radius).
  Radius options come from `feed.radiusChoices(...)`; the slider reuses the
  existing bounds constant from `lib/places.ts`. Add a `showPostCta` opt-out to
  `RadiusEmptyState` mirroring `showEscapes`, passed `false` from the feed, so
  the second "Post a drop-in" disappears — while the location choice and the
  radius escapes keep the empty state from being a dead end.
- **Acceptance criteria:**
  - `/` renders exactly ONE element with the accessible name "Post a drop-in".
  - The feed renders exactly ONE location control; it opens `LocationModal`,
    which contains the address input, the radius slider, and the apply button.
  - Zero home-zip `<input>` visible on the feed until the modal opens.
  - `data-testid="feed-post-drop-in"` still exists and is ≥44px tall.
  - **The EMPTY radius state still offers a way forward** (location choice
    reachable; escapes behaviour unchanged) — asserted on the empty feed.
  - `e2e/places.e2e.ts`'s four `location-*` testids still pass.
- **Verification command:** `npm run verify && npx playwright test e2e/zip-radius.e2e.ts e2e/feed-empty-state.e2e.ts e2e/places.e2e.ts && node scripts/mobile-audit.mjs`
- **Budget:** one local builder context (~98k tokens).
- **Depends on:** nothing.

### Slice 2: the Post page — the duplicate-row spill

- **Objective:** The text the founder screenshotted stops escaping its buttons.
- **Files in scope:** `src/pages/NewPlaydatePage.tsx` (+ assertions in
  `e2e/post-again.e2e.ts`).
- **Approach:** The duplicate-picker row (`NewPlaydatePage.tsx:1060-1074`,
  class `lastPostClassName`) is a `rounded-full` STADIUM drawn around a label
  that wraps to 2–3 lines. A stadium's radius is half the box height, so the
  curve necessarily cuts through every line after the first — which is exactly
  the founder's screenshot. **Change `rounded-full` → `rounded-xl`** and keep
  every other class. Do NOT truncate: the label carries the title AND the day
  the clone lands on, and nothing else repeats it.
- **Acceptance criteria (the test that can actually FAIL):**
  - For the `post-again` row at 375px and 320px: `radius < height/2` (NOT
    stadium-shaped) AND the text's client rects are fully inside the border box
    AND `scrollWidth <= clientWidth + 1` AND height ≥ 44px.
  - **Red-green required:** with `rounded-full` restored the criterion must
    FAIL; with the fix it must PASS. Proof script pattern:
    `.scratch/v23/verify-corner.mjs`.
- **Verification command:** `npm run verify && npx playwright test e2e/post-again.e2e.ts e2e/quick-post.e2e.ts`
- **Budget:** one local builder context.
- **Depends on:** nothing.
- **PARKED (needs the founder):** "Playdate → Title" is NOT a label bug — the
  field already reads "Title"; the word appears in the generated title VALUE
  (`GENERATED_TITLE_PREFIX = 'Playdate at '`, `postSummary.ts:46`). Renaming it
  is a copy decision. Ask before touching it.

### Slice 3: the place picker becomes a scrollable lightbox, and loses its bottom button

- **Objective:** "Browse places" opens a real, scrollable lightbox; the bottom
  "Browse all N places" button is gone.
- **Files in scope:** `src/pages/NewPlaydatePage.tsx`,
  `src/components/PlaydateFormFields.tsx`, `e2e/place-directory-in-new.e2e.ts`.
- **Approach:** The `place-directory-sheet` overlay ALREADY exists
  (`NewPlaydatePage.tsx:1218`) and already renders the full `PlaceDirectory`;
  the FIELD's "Browse places" button opens the inline list instead
  (`PlaydateFormFields.tsx:301-318`). Point that button at the sheet, add
  `FocusTrap` + Escape-to-close + a sticky search field, and delete the bottom
  `browse-all-places` button (`:1206-1214`). The inline typing autocomplete
  stays (the fast path).
- **Acceptance criteria:**
  - Tapping "Browse places" opens `place-directory-sheet`; it is scrollable
    (`scrollHeight > clientHeight`) and contains the search field plus ≥1
    `place-row`.
  - The sheet traps focus and closes on Escape.
  - `data-testid="browse-all-places"` does not exist anywhere in `/new`.
  - The typing autocomplete still opens `place-suggestions`.
- **Verification command:** `npm run verify && npx playwright test e2e/place-directory-in-new.e2e.ts`
- **Budget:** one local builder context.
- **Depends on:** slice 2 (same file — serialize).

### Slice 4: every place offers "Start a drop-in" and "Details"

- **Objective:** The pair the founder named appears on the picker's selection
  panel, and "Details" leads to a real page.
- **Files in scope:** `src/components/PlaceMap.tsx`,
  `src/pages/NewPlaydatePage.tsx`, `src/lib/places.ts` (+test),
  `src/pages/PlacePage.tsx`, `e2e/places.e2e.ts`.
- **Approach:** Add `placeDetailsPath` and render a "Details" link
  (`data-testid="place-picker-details"`) beside `place-picker-select`. On the
  map POPUP, drop the `learnMore` map-search fallback (label "Find it on the
  map", `PlaceMap.tsx:833-844`) while keeping "Visit website" when a verified
  site exists. PlacePage gains a "More about this place" link to its details
  route.
- **Acceptance criteria:**
  - `place-picker-selection` contains both `place-picker-select` and a
    `place-picker-details` link with `href` = `/place/<id>/details`.
  - `placeDetailsPath` has a sibling unit test.
  - On `/browse`'s popup, no `learn-more` renders with
    `data-link-kind="map-search"`; a place WITH a verified site still renders
    `data-link-kind="website"`.
  - `/place/:id/details` is registered in `scripts/playtest/routes.json`.
- **Verification command:** `npm run verify && npx playwright test e2e/places.e2e.ts`
- **Budget:** one local builder context.
- **Depends on:** slice 3.

### Slice 5: the Place Details page + the place comment wall (migration 0050)

- **Objective:** `/place/:id/details` carries what the founder described: what
  parents have said, how many follow it, a way to follow, and a link out.
- **Files in scope:** `supabase/migrations/0050_place_comments.sql`,
  `src/lib/placeComments.ts` (new) + test, `src/pages/PlaceDetailsPage.tsx`
  (new), `src/App.tsx`, `src/lib/db.ts` (+ a `db-v6.test.ts` sibling),
  `src/lib/places.ts` (the web-search href + test), `e2e/place-details.e2e.ts`
  (new), `scripts/playtest/routes.json`.
- **Approach:** TWO builder rounds — migration + `lib` seams first, then the
  page. Compose EXISTING seams: `countPlaceFollowers`, `getPlaceFollowState`,
  `toggleFollowPlace`, `listPlaceFeed`, `placeLearnMoreLink`. The "search the
  web" link is a pure `placeWebSearchHref(name, address)` (Google search, new
  tab) — the founder's own suggestion, so we maintain no place database.
- **Acceptance criteria:**
  - Migration 0050 applies twice with no error (idempotent) — applied LIVE and
    read back.
  - A signed-in parent posts a ≤500-char comment, newest-first; empty/oversized
    is rejected with the validator's own sentence.
  - A signed-out visitor reads ZERO comment rows (probed at the DB layer).
  - The page shows the follower count + Follow control, upcoming drop-ins here,
    and a `place-web-search` link.
  - All new controls ≥44px; all new inputs ≥16px font.
- **Verification command:** `npm run verify && npx playwright test e2e/place-details.e2e.ts`
- **Budget:** TWO builder contexts, explicitly split.
- **Depends on:** slices 1–4.

### Slice 6: the Places map popup stops blanking the map

- **Objective:** Tapping a blue circle on `/browse` leaves the map visible.
- **Files in scope:** `src/components/PlaceMap.tsx`, `e2e/places.e2e.ts`.
- **Approach:** The V20 t03 change made the container `overflow: visible` while a
  popup is open so the bubble is not clipped; combined with the popup's
  `maxHeight` and `autoPan` padding the bubble now blankets the band. Cap the
  popup to a fraction of the map's height and reduce it to name + address + the
  two buttons. Prove by MEASURING.
- **Acceptance criteria:**
  - With a popup open on `/browse`: `place-marker-info` height < 60% of
    `places-map-band` height, and the map container's box still intersects the
    viewport.
  - No `map-search` learn-more in the popup; the website link is unaffected.
  - `host-here` navigates, `marker-details` links, and a second tap closes.
- **Verification command:** `npm run verify && npx playwright test e2e/places.e2e.ts`
- **Budget:** one local builder context.
- **Depends on:** slice 4 (same file — serialize).

### Slice 7: Inbox — an unread marker, and one row per parent

- **Objective:** Unread conversations carry a colour dot that clears once seen,
  and the same parent cannot appear twice.
- **Files in scope:** `src/pages/InboxPage.tsx`, `src/lib/db.ts`,
  `src/lib/inbox.ts` (new — **SEAM ALREADY WRITTEN AND PRESERVED**, see below),
  `e2e/inbox.e2e.ts`, `e2e/dm.e2e.ts`.
- **Approach:** RECON CORRECTED THE ORIGINAL PLAN — see `.scratch/v23/ledger.md`
  ("V23 s7: RECON BEFORE DISPATCH"). (a) **The dot:** playdate conversations
  already have a real read cursor (`conversation_reads` +
  `markConversationRead`), so the dot clears with no schema change. **DMs cannot
  have one:** `listDirectConversationsWithClient` hardcodes `unreadCount: 0`
  because `conversation_reads.playdate_id` is `NOT NULL` and FK'd to `playdates`,
  while a DM is identified by `messages.playdate_id IS NULL`. Scope the dot to
  playdate rows, comment why, and REPORT the DM gap — do not ship an
  unrequested migration. (b) **The duplicate:** merge on the counterpart's
  profile ID, never the display name (two parents can share a name). So
  `ConversationSummary` gains `otherPartyId`, and the merge is a pure id-keyed
  function preferring the newer `latestAt`.
- **SEAM ALREADY EXISTS:** `src/lib/inbox.ts` (exporting `mergeConversations`,
  `MergedConversation`, `DmConversationRow`, `PlaydateConversationRow`) and
  `src/lib/inbox.test.ts` were written in this batch and **survived the tree
  clobber** — preserved at `.scratch/v23/preserved/` and re-verified standalone
  (`npx vitest run src/lib/inbox.test.ts` → 6 passed). Re-apply them and wire
  the page; do not rewrite the seam.
- **Acceptance criteria:**
  - A playdate row with unread renders a dot; opening the thread and returning
    renders it WITHOUT the dot (end-to-end against the real read cursor).
  - A DM row and a playdate row with the same counterpart id render as ONE row —
    the newer `latestAt` wins.
  - Two DIFFERENT parents sharing a display name render as TWO rows.
  - The seam's sibling test covers: no overlap, DM-newer, playdate-newer,
    three-way, same-name-different-id, input immutability.
  - The DM unread gap is reported, not silently shipped.
- **Verification command:** `npm run verify && npx playwright test e2e/inbox.e2e.ts e2e/dm.e2e.ts`
- **Budget:** one local builder context.
- **Depends on:** nothing.

## Risks / open questions

- **A SECOND WRITER IS ACTIVE ON THIS CHECKOUT — see `.scratch/v23/ledger.md`,
  "V23 BATCH: PAUSED".** It reverted every V23 product change, plus `plan.md`
  and `task-state.md`, at ~13:5x–14:03. It owns `photoStorage.ts`,
  `ProfileView.tsx`, `ProfilePage.tsx`, `photoStorage.test.ts`,
  `scripts/profile-order-check.mjs`. **No slice may edit those.** The batch must
  not claim a gate result until the tree is frozen for the whole run.
- **RESOLVED — place comments.** The founder chose the real wall (0050).
- **RESOLVED — Sleek.** Skipped; principles applied in code.
- **OPEN — the "Playdate at …" title copy** (slice 2). Needs a founder call.
- **RESOLVED — the DM unread gap** (slice 7). The founder authorized a separate
  read-cursor table; shipped as migration `0051` (`direct_conversation_reads`)
  with the dot + badge on DM rows (record: `task-state.md`, follow-up #3).
- **The feed's empty state** must not become a dead end when its CTA is removed.
- **`/place/:id/details` vs `/place/:id`** risks "same fact, two spellings";
  mitigated by the shared `placeDetailsPath` seam, but the reviewer should check
  the two pages agree on name, address, and follower count.

---

## Status log (orchestrator appends after every phase transition)

- 2026-09-23 — V22 confirmed complete (`ff49d0c`). V23 feedback received with 3
  screenshots. Skill `design-mobile-apps` fetched and read in full (571 lines);
  Sleek device flow started, then abandoned unapproved on the founder's
  instruction. Three scope decisions taken. Plan written; slices 1, 2, 7
  dispatched.
- 2026-09-23 — **s2 COMPLETE and independently verified red/green** (the spill
  fix). s2 also corrected the record: the acceptance test both the builder and I
  first reached for (rect containment / scrollWidth) is TRUE on the buggy code
  and therefore worthless; the criterion was replaced with the stadium-versus-
  lines test. "Playdate → Title" investigated and found to be a VALUE, not a
  label — parked for the founder.
- 2026-09-23 — **s7 COMPLETE** (dot scoped to playdate rows; id-keyed merge
  seam + 6 tests; DM unread gap reported with a recommendation). s1 was in
  flight. An unexplained modification to `scripts/profile-order-check.mjs` was
  found and reverted (not wired into `verify`, no provenance).
- 2026-09-23 14:10 — **BATCH PAUSED on the founder's instruction.** The second
  writer clobbered the tree: every V23 product change reverted, `plan.md` and
  `task-state.md` reverted to HEAD. Seam + `LocationModal` preserved under
  `.scratch/v23/preserved/`. Slices 3–6 unstarted. Resume protocol pinned in the
  ledger.

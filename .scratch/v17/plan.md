# Implementation Plan: V17 — Places redesign (t01–t04)

> Owned by the orchestrator. Written BEFORE any builder dispatch. Every slice
> below is executable without interpretation.
>
> Spec: `.scratch/v17/spec.md` (all decisions ruled 2026-09-21).
> Build law: `docs/agents/code-structure.md` — builders read it before writing.
> Gate: `npm run verify` (build + test + lint) unless a slice pins more.
>
> **⚠️ EVIDENCE MUST BE A FILE, NOT PROSE.** Every slice writes its command
> output to `.scratch/v17/evidence/<slice>-<what>.log` (e.g. `t02-e2e.log`) so a
> reviewer inspects real output rather than a summary. The t02 review made this
> a **blocking finding** — the results were true, but they existed only as prose
> in the ledger, which is precisely the "a success claim is not evidence"
> failure the review lane exists to catch. Redirect and record the exit code:
>
> ```bash
> npm run build > .scratch/v17/evidence/<slice>-build.log 2>&1
> echo "exit=$?" >> .scratch/v17/evidence/<slice>-build.log
> ```

## Goal

`/browse` becomes the Airbnb-shaped places screen the founder asked for in
V16 t07 items 5–7, minus the photos (which are t05, a separate batch). After
t01–t04: the map is a deliberate fixed-height band at the top of the page, the
list reads as content scrolling beneath it, each place card is a proper
content-forward card with a heart that saves the place, a floating **Map**
button returns you to the band once you've scrolled, and the map frames itself
to what your search actually found.

**We know it worked** when: `npm run verify` is green; targeted `places` e2e
passes; the playtest lane still passes 8 routes; and the measurable rules below
hold at 390px (map band 240px–60dvh, first row below the band, heart and
floating button ≥44px).

## Non-goals

- **No photos.** t05 owns the Commons sourcing + backfill. t01 builds the card
  photo-capable with the kind-illustration fallback, so t05 slots in later.
- **No `saved_places` table and no second save concept.** The heart IS the
  existing place *follow* (`follows`, migration 0033). A reviewer must reject a
  diff that adds a parallel save table.
- **No per-card follower counts.** `countPlaceFollowers` is one RPC per place; a
  grid of 239 must not call it. The heart shows the caller's own state only.
- **No re-introduction of a points-fit.** V16 t07 item 2 (`93f313b`) deleted
  `fitBounds` over every marker. t04 extends `framingCircle`; it must not
  re-add that call. Reverting `93f313b` is the failure mode.
- **No map/list toggle** on `/browse` — that is V16 t06 item 3, still unshipped.
- **No new route**, so `.scratch/playtest/routes.json` is unchanged.

## Interfaces

Pinned so builders do not re-decide them.

**Existing seams that MUST be reused, not reimplemented:**

| Seam | Location | Used by |
|---|---|---|
| `listMyFollowsWithClient(client, profileId)` | `src/lib/db.ts:3723` | t02 — one batched read for the whole grid |
| `toggleFollowPlace(placeId)` | `src/lib/db.ts:3961` | t02 — the existing write; `insertFollowRow` already treats 23505 as success (`:3927`) |
| `followTargetsFrom(rows)` | `src/lib/follows.ts:104` | t02 — returns place-id **sets** |
| `framingCircle(input)` | `src/lib/places.ts:733` | t04 — the sole framing authority |
| `MODAL_OVER_LEAFLET_Z_CLASS` = `z-[1100]` | `src/lib/stacking.ts` | t03 — see the layer table before choosing any z |

**New seam t02 must add** (`src/lib/places.ts` + sibling test):

> **CORRECTED 2026-09-21 after the t02 review.** This was first pinned as
> `placeFollowIds(...): Map<placeId, followId>`, justified by the claim that
> "the unfollow path needs" the follow row id. **That claim was false.** The
> unfollow path is `toggleFollowPlace(placeId)` (`db.ts:3961`), which resolves
> the row id itself — `findFollowRow(...)` then `deleteFollowRow(..., existing.id)`
> (`db.ts:3969-3971`). The builder implemented the Map faithfully, the reviewer
> caught that its value was never read, and the correct fix is to shrink the
> seam rather than force a dead value into use. Lesson for later slices: do not
> justify a new seam with a consumer you have not traced to a real call site.

```ts
/**
 * The place ids the caller follows, for the browse grid's hearts.
 * `followTargetsFrom` (follows.ts:104) is shaped around the FOLLOW ROW and
 * splits family vs place ids; this gives the grid a direct place-id set.
 * Rows with a null/absent/blank place_id are skipped (family follows).
 */
export function placeFollowIdSet(
  rows: ReadonlyArray<{ id?: string | null; place_id?: string | null }>,
): Set<string>
```

**New seam t04 must extend** (`src/lib/places.ts` + sibling test) — add the
searched subset as an optional input; the existing call contract stays valid:

```ts
export function framingCircle(input: {
  geocodeCenter: { lat: number; lng: number } | null
  homePin: { lat: number; lng: number } | null
  radiusMiles: number
  /** t04: the SEARCHED subset. Absent/empty = today's behaviour exactly. */
  focusPoints?: ReadonlyArray<{ lat: number; lng: number }>
}): FramingCircle | null
```

**Layer band (from `stacking.ts` — read it, do not guess):**

```
Leaflet panes/controls  <= 1000
a modal over a map         1100   MODAL_OVER_LEAFLET_Z_CLASS
the image lightbox         1200   IMAGE_LIGHTBOX_Z_CLASS
```

The floating Map button (t03) is a plain in-page control, **below** 1000.

**Testids** (e2e drives these; do not rename existing ones):

- Keep: `place-row`, `places-search`, `filter-sort-btn`, `places-see-all`,
  `set-location-btn`, `places-distance-filter`, `row-start-dropin-<id>`,
  `row-learn-more-<id>`, `location-modal`, `filter-sort-modal`.
- New in t01: `places-map-band`, `place-card-photo`.
- New in t02: `place-heart-<placeId>`.
- New in t03: `scroll-to-map-btn`.

**⚠️ E2E RUNS REQUIRE A FRESH BUILD — every e2e command below starts with
`npm run build`.** `playwright.config.ts:54-59` serves `dist/` via
`npm run preview`, and `preview` (`package.json:17`) does NOT rebuild. A bare
`npx playwright test` therefore runs the browser lane against whatever bundle
happens to sit in `dist/` — a stale build can produce BOTH a false pass (the new
UI isn't there, so nothing asserts it) and a false failure. This is not
theoretical: it was caught while writing this plan. Do not drop the build step
from any verification command.

**⚠️ DO NOT USE `npx tsc --noEmit` AS A TYPECHECK IN THIS REPO — IT CHECKS
NOTHING.** The root `tsconfig.json` is `{ "files": [], "references": [...] }`:
it has no sources of its own and only points at `tsconfig.app.json`,
`tsconfig.node.json`, `tsconfig.sw.json`. A bare `tsc --noEmit` type-checks that
empty file list and **exits 0 no matter how broken the code is**. The real
check is `tsc -b`, which is what `npm run build` runs (`package.json:14`).

Not hypothetical either: during the t02 slice, `npx tsc --noEmit` reported
**clean** while `npx tsc -b` reported **two hard errors** — `Cannot find name
'supabase'` (a page calling an unimported client) and a bad object literal in a
test. `npm run build` catches both. Every command below therefore uses
`npm run build` (or `npm run verify`) as its typecheck; none uses `tsc --noEmit`.

## Slices

### Slice 1 (t02): Heart = the existing place follow

- **Objective:** each place card carries a heart that reflects and toggles the
  caller's EXISTING follow of that place. No new table, no count.
- **Files in scope:** `src/lib/places.ts`, `src/lib/places.test.ts`,
  `src/pages/BrowsePage.tsx`, `e2e/places.e2e.ts`.
- **Approach:** add `placeFollowIds` (Interfaces above) with its test. In
  `BrowsePage`, load `listMyFollowsWithClient` in a **new effect that copies the
  existing signed-in-only pattern verbatim** — `BrowsePage.tsx:172-185` (the
  `upcomingCountsByPlace` effect: `if (loading || session === null) return`, a
  `cancelled` flag, `.catch(() => setX(null))`). Do not invent a new shape; this
  page already has three effects (`:134`, `:156`, `:172`) and the third is the
  model. Hold `Map<placeId, followId>` state. The heart is optimistic: flip
  local state, call `toggleFollowPlace`, roll back on throw. Signed-out renders
  no heart (matching `PlacePage.tsx:376-385`, which prompts sign-in instead).
- **A failure must not break the page:** a failed follows read leaves the map
  empty and every heart unfilled — identical to today's rendering, never an
  error state (the `:162-164` precedent).
- **Acceptance criteria:**
  - A signed-in parent who already follows a place sees that card's heart
    filled on first paint (state comes from the batched read, not a per-card
    call).
  - Tapping an empty heart fills it; tapping a filled heart empties it; the
    `follows` row is created/removed accordingly.
  - A failed toggle restores the previous state and shows no crash.
  - A failed follows READ leaves every heart unfilled and the page rendering
    normally — no error state, no empty page.
  - Signed out: no heart is rendered on any card, and no follows request is
    made (the `session === null` guard).
  - The heart's tap target is **≥44px** in both dimensions.
  - No `countPlaceFollowers` call anywhere in `BrowsePage.tsx`.
- **Verification command:**
  `npm run build && npm run test -- places && npx playwright test e2e/places.e2e.ts`
- **Budget:** one local builder context (~98k, `qwen3.8-27b`).
- **Depends on:** nothing.

### Slice 2 (t03): Floating "Map" scroll-back button

- **Objective:** once the user has scrolled past the map, a floating button
  returns them to it.
- **Files in scope:** `src/pages/BrowsePage.tsx`, `e2e/places.e2e.ts`.
- **Approach:** a fixed-position button that appears only when the map band is
  scrolled out of view (an IntersectionObserver on the band, or a scroll
  threshold — builder picks the simpler one and says which). On tap, scroll the
  band into view smoothly. It must be **below** Leaflet's 1000
  (`stacking.ts`); a plain in-page control needs no explicit z at all, which is
  the preferred answer.
- **Acceptance criteria:**
  - Hidden while the map band is visible; visible after scrolling past it.
  - Tapping it brings the band back into the viewport.
  - Tap target **≥44px**; it never covers the heart of the bottom-most card
    (it sits above the last row's content or the page reserves space for it).
  - It renders **below** the map's stacking layer — assert its computed
    z-index is lower than 1000, or that it carries no z-index.
- **Verification command:**
  `npm run build && npx playwright test e2e/places.e2e.ts`
- **Budget:** one local builder context.
- **Depends on:** nothing (but lands naturally after t01's band exists).

### Slice 3 (t01): Map band + content-forward card

- **Objective:** the map becomes a deliberate fixed-height band at the top of
  `/browse`, and the list scrolls beneath it in Airbnb's shape.
- **Files in scope:** `src/pages/BrowsePage.tsx`, `src/components/PlaceMap.tsx`
  (only if a height/class prop is needed), `e2e/places.e2e.ts`.
- **Approach:** give the map container a band height (`h-[45dvh] min-h-[240px]`,
  or the equivalent the builder measures) inside the existing map card, and
  restructure `PlaceRow` into a card with the photo/illustration slot at top
  (falling back to a per-`kind` illustration while t05 is unbuilt), the heart
  at top-right of that slot, then name / kind / distance / ages, then the two
  existing row actions. The grouped-lead + overflow-door structure
  (`leadGroups`, `overflowRows`) is KEPT — 239 image-bearing cards is a real
  phone cost.
- **Acceptance criteria:**
  - At 390px wide, `places-map-band` renders **≥240px and ≤60dvh** tall.
  - The first list row's top edge is **below** the band's bottom edge.
  - Every card renders the photo slot; with no `photo_url`, it renders the
    kind-illustration fallback, never a broken image or an empty box.
  - `BROWSE_LIST_LEAD_LIMIT` grouping and the `places-see-all` door still work.
  - All existing e2e testids above still resolve.
- **Verification command:**
  `npm run verify && npx playwright test e2e/places.e2e.ts`
  (`verify` already runs `npm run build`, which the e2e lane needs — see the
  build warning under Interfaces.)
- **Budget:** one local builder context. If the card restructure plus the band
  does not fit, split the band from the card.
- **Depends on:** t02 (the heart is part of the card's header). Run t02 first.

### Slice 4 (t04): Frame the map to the search results

- **Objective:** an active search query frames the map on the places that
  matched, instead of leaving the camera on the home radius.
- **Files in scope:** `src/lib/places.ts`, `src/lib/places.test.ts`,
  `src/pages/BrowsePage.tsx`, `e2e/places.e2e.ts`.
- **Approach:** extend `framingCircle` (Interfaces above) with `focusPoints` —
  the coordinates of the **filtered** rows. Absent/empty keeps today's exact
  behaviour (this is the regression guard). The returned circle must never
  exceed the viewer's radius, so the frame cannot zoom out past the radius the
  V16 t07 item 2 ruling established. **Do not add a `fitBounds` over markers in
  `PlaceMap.tsx`** — the circle effect stays the sole framing authority.

  **MEASURED BEFORE-STATE (orchestrator, on the t01 tree, 390x844).** The data
  side is ALREADY filter-aware — `BrowsePage.tsx:554` passes `placed`, derived
  from the `browsePlaces` pipeline, so the map only ever draws filtered rows.
  Only the FRAMING is query-independent:
  - unfiltered: every placed row inside the 5-mile circle (the dense blob the
    founder originally photographed — a marker-DENSITY read, not a framing bug);
  - search `"pool"`: markers drop to **19** (measured by counting
    `path.leaflet-interactive`) yet the frame is unchanged — the whole radius
    circle, with the matching pools scattered thinly across it.
  Screenshot: `.scratch/v17/T04-search-pool-390.png`. So t04 changes framing
  ONLY, and the 19-marker case is the concrete acceptance case to beat.
- **Acceptance criteria:**
  - With no query, the returned circle is **identical** to pre-t04 for the same
    inputs (asserted in `places.test.ts` — this is the guard against reverting
    `93f313b`).
  - With a query yielding ≥1 placed result, the returned circle TIGHTENS to
    those points: it is no larger than the viewer's radius, and strictly smaller
    whenever the results occupy less than the whole radius.
  - The framed radius never exceeds the viewer's radius.
  - A query yielding 0 placed results does not throw and does not produce a
    degenerate (zero-extent) circle — it falls back to today's radius frame.
  - `grep boundsPoints src/components/PlaceMap.tsx` returns nothing.
  - **Concrete case to beat:** the measured search `"pool"` (19 markers) frames
    visibly tighter than the unfiltered radius frame.
- **Verification command:**
  `npm run build && npm run test -- places && npx playwright test e2e/places.e2e.ts`
- **Budget:** one local builder context.
- **Depends on:** t01 (measured against the band layout, not the old one).

## Risks / open questions

- **t05 (photos) is out of this plan.** The card's photo slot ships with the
  kind-illustration fallback. If t05 never lands, the cards still look
  deliberate rather than broken.
- **239 cards with an image slot is a phone cost.** Mitigated by keeping the
  6-row lead + overflow door. If the builder finds the expanded list janky,
  say so in the report rather than growing the diff.
- **Open question for t03:** whether the floating button overlaps the last
  card's heart at the bottom of the scroll. Builder decides the layout fix and
  records which they chose.
- **No migration in any of t01–t04.** If a builder believes one is needed, that
  is a BLOCKED — surface it, do not invent schema.

---

## Status log (orchestrator appends after every phase transition)

- 2026-09-21 — plan written from `.scratch/v17/spec.md` (D1/D2/D3 all ruled).
  Four slices, no migration, no new route. t02 first (no deps, cheapest win),
  then t01 (shape), t03 (floating button), t04 (framing). t05 excluded —
  separate batch. Nothing dispatched yet.

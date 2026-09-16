# 02: Places — remove the "Fits my kid's age" filter

**What to build:** Delete the "Fits my kid's age" toggle from the Places page
(`/browse`) and the age filter it drives in `browsePlaces`. The Places page
keeps its radius filter and the rest of the list unchanged. The place detail
page's age LINE (e.g. "Ages 4–8", driven by `placeAgeFitLabel`) is untouched —
only the filter goes away.

**Why:** Founder directive (V11): the filter confused parents — a place with
no age data or a wide range is still a perfectly good gathering spot, and the
toggle made the list feel empty. Discovery stays radius-based.

**Status:** DONE (2026-09-16; gate 818/818 unit (825 − 7 age-filter tests) + 76 passed e2e; commit hash recorded in the coordinator's task-state V11 update)

## Mechanics (pinned)

- `src/lib/places.ts`:
  - Delete `placeFitsKidAges` (line 326-337) entirely. It has exactly one
    production caller: the `browsePlaces` filter (line 460,
    `if (filters.kidAges !== null && !placeFitsKidAges(place, filters.kidAges)) continue`).
    Remove that guard and the `kidAges` field from the `PlaceFilters`
    interface.
  - `browsePlaces`' doc has a numbered filter-step list (line 437 "3. AGE FIT
    (placeFitsKidAges)"); drop that step and renumber. Same for the doc
    reference at line 415.
- `src/lib/types.ts` line 274: the `Place` doc comment says
    "places (places.placeFitsKidAges)" — remove that parenthetical reference.
    `age_min`/`age_max` STAY on the type: the place form still edits them and
    `placeAgeFitLabel` still reads them for the detail page's age line.
- `src/pages/BrowsePage.tsx`:
  - Delete the toggle button (lines 252-267), the `kidAges` state (line 69),
    the `fitsAges` state (line 73), the `listKids` import + effect (line 5),
    and the `kidAges: fitsAges ? kidAges : null` argument in the `browsePlaces`
    call (line 170).
  - `radiusIsTheReason` (line 187-188) currently includes `!fitsAges` so the
    shared radius empty state only claims the radius when the age filter
    wasn't the cause — with the filter gone, radius is the only reason: drop
    the `!fitsAges` clause.
  - Module doc bullet (line 33, "FITS MY KID'S AGE") — delete.
- `src/lib/places.test.ts`: drop the `placeFitsKidAges` import (line 9), the
  whole `describe` block (lines 164-194), the `kidAges: null` field in
  `NO_FILTERS` (line 243), and the browsePlaces age-filter test (~line 284).
- E2E: no spec asserts the toggle (grep: zero hits for "Fits my kid" in
  `e2e/`). The full suite must stay green unmodified except ticket 03's
  places.e2e.ts change (separate ticket).

## Acceptance criteria

- [ ] "Fits my kid's age" toggle is gone from /browse; the filter no longer
      exists in `browsePlaces` (grep `kidAges` in `src/lib/places.ts` → 0
      hits; grep `placeFitsKidAges` across `src/` and `e2e/` → 0 hits).
- [ ] A parent with kids browsing /browse sees the same list as before with
      the toggle OFF (radius behavior unchanged); the radius empty state's
      escapes still render when the radius is the reason.
- [ ] Place detail age line ("Ages 4–8" / `placeAgeFitLabel`) unchanged.
- [ ] `places.test.ts` updated; `npm run build && npm run test` exit 0.

**Migration check:** NONE. `supabase/` untouched (the columns stay; only the
client-side filter is removed).

**Depends on:** nothing. Parallel-safe with 01/03 (different files except
`places.test.ts`/`BrowsePage.tsx` — serialize anyway, one writer).
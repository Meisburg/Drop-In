# V19 ledger — tight maps, feed map, two-parent profiles

Base: 285b712 (V18 shipped). Baseline gate re-verified: npm run verify exit 0 ·
1007/1007 unit (28 files) · lint 0 errors / 62 warnings.

Batch opened from the founder's verbal feedback (2026-09-21). Seven "what exists
today" facts verified against the tree and the live DB BEFORE ruling:
  map frames the radius circle; founder's stored radius_miles = 35 (widest);
  default radius is 5; the FEED HAS NO MAP (V16 t06.3 never built); posts carry
  place_id + free-text place and NO coordinates; "About the parents" is ONE bio
  field; no partner/link concept exists in any of the 22 public tables.
Founder rulings D1-D5 recorded in spec.md §3.

Slice t01: dispatched (base 285b712)
Slice t01: complete — THE FOUNDER'S MAIN ASK, delivered and MEASURED.
  The change is one constant + one call site, which is the point:
  MAP_FOCUS_RADIUS_MILES = 1 (lib/places.ts) now feeds framingCircle's
  `radiusMiles` at BrowsePage, instead of the PICKED radius. The list still runs
  filterPlacesByRadius on the picked radius, untouched.
  MEASURED BEFORE/AFTER on the built bundle, authenticated, at 390px, with the
  founder's real stored radius (35):
    BEFORE: tile zoom 11 (city-wide -- the blob the founder photographed)
    AFTER:  tile zoom 13 (neighbourhood; each level doubles scale, so 4x closer)
  MEASURED THAT THE TWO HALVES ARE NOW INDEPENDENT (the assertion that matters):
    radius 1 mi  -> map r=125px, list max 1 mi
    radius 35 mi -> map r=125px, list max 6 mi
    => the map does not move; the list widens. Plus the honest affordance:
    "224 places outside this mile view — widen the distance below to see more."
A REAL DEFECT WAS FOUND BY THIS SLICE'S OWN TEST, not by review. My first test
  asserted "a search can never widen the frame" and it FAILED, returning 0.5 mi.
  Trace: `focusCenter` returns the MIDPOINT of the matched points, so a search
  matching one place ~7 miles away centred the frame ON THAT PLACE; the extent
  around a single point is zero, so it floored to MIN_FOCUS_RADIUS_MILES (0.5).
  The result was a half-mile circle centred 7 MILES FROM HOME -- the home pin
  off the canvas entirely, which is precisely what D1 forbids. This was
  PRE-EXISTING V17 t04 behaviour that D1 turns into a defect (under the old
  policy the map was allowed to follow a search). FIXED with a far-match guard:
  matches beyond the focus radius keep the frame anchored instead of dragging it.
  NOTE ON THAT BUG'S SHAPE: it would have been invisible in normal use (you only
  see it by searching for somewhere far away) and it is exactly the "search
  breaks the anchor" failure D1 exists to prevent.
RED-GREEN, BOTH DIRECTIONS, twice:
  (a) re-merging the radii (MAP_FOCUS_RADIUS_MILES = 35) -> 6 tests FAIL;
  (b) removing the far-match guard -> 2 tests FAIL. Both restored -> 122 pass.
TWO EXISTING TESTS ENCODED THE SUPERSEDED POLICY AND WERE AMENDED, not deleted:
  * lib/places.test.ts "a single match never yields a zero-extent circle" used a
    point 8.33 mi from home; under D1 that match rightly keeps the home frame.
    Its real invariant (no zero-extent circle) is preserved with a NEARBY match.
  * e2e "an active search frames the map on the matching places (V17 t04)"
    asserted the frame TIGHTENS on a search. Under D1 the map already frames 1
    mile, so there is almost nothing left to tighten -- measured, the circle is
    r=125px before and after. Rewritten to assert the invariant that still
    matters and that a regression WOULD break: the searched frame is never
    WIDER than the neighbourhood view (a leaked 93f313b points-fit blows past it).
  * e2e MARKER_PLACE_NAME moved "Alki Playground - Whales Tail" (6.27 mi from the
    marker's home) -> "Ballard Corners Park" (0.44 mi). The spec was finding NO
    marker because the fixture was outside the neighbourhood the map now draws.
    The behaviour under test is unchanged; the fixture moved into the frame.
  Both spec changes are RULING-DRIVEN and were confirmed with the founder
  (search does not zoom the map; the map does not follow a far search).
Slice t01 gate: npm run verify exit 0 · 1015/1015 unit (28 files) · lint 0
  errors / 62 warnings · places.e2e.ts 14 passed + the new D1 spec 2 passed.

Slice t02: dispatched (base 82c549b)
Slice t02: complete — THE FEED MAP (D2). / now renders a map band above the day
  sections; the day sections themselves are untouched (the map is ADDITIVE).
  Reused PlacesMap (the plan's pinned requirement — the V15.2 map regressions
  were fixed in the shared component, so a parallel one would re-earn them).
  New pure seam `feedMapPins` (lib/places.ts, +8 unit tests): drops posts with
  no resolvable coordinate and COLLAPSES posts sharing an exact coordinate, so
  two sessions at one park are one dot rather than an unclickable pile.
  The frame reuses framingCircle with MAP_FOCUS_RADIUS_MILES, so both maps open
  on the same V19 t01 neighbourhood view.
  The posts' own coordinates were ALREADY on the feed (`place_coords`, stitched
  by listRadiusFeed), so the pins needed NO new read; only the home pin needed
  the zip gazetteer, loaded best-effort (a failure drops the home pin, never the
  map).
  E2E (new spec, 2 tests) seeds its OWN data because the map correctly renders
  NOTHING for a feed of free-text posts — a spec against ambient data would
  prove nothing. It creates a PLACED post and a FREE-TEXT post, asserts the band
  appears with a numeric "N places with drop-ins" label, asserts the free-text
  post is in the FEED (so its absence from the map is a decision, not a missing
  row), then DELETES the placed post and asserts pins drop:
    "[V19 feed map] pins with a placed post: 3; after deleting it: 0;
     label '1 place with drop-ins'"
  That delete-and-observe is the strongest available proof the pins belong to
  the drop-in rather than to the basemap or the home pin. Both posts are
  deleted in a finally block, so the live DB is left as found.
TWO SELF-INFLICTED SPEC BUGS, both caught by running it, both recorded:
  (1) `duration_minutes` is not a column — the schema stores `starts_at` +
      `ends_at` (V13 t03 writes the difference into that pair). PGRST204 named
      it exactly.
  (2) The pin count used `.leaflet-marker-icon`, which counts IMAGE/DOM markers.
      This map uses circleMarkers, which render as SVG <path>. The screenshot
      taken at the failure shows the pin PLAINLY PRESENT on the map with the
      1-mile circle and home pin — the product was right and the assertion was
      wrong. Switched to `path.leaflet-interactive`, the same convention the V13
      A6 marker spec already uses.
Slice t02 gate: npm run verify exit 0 · 1023/1023 unit (28 files) · lint 0
  errors / 62 warnings · places.e2e.ts 16 passed · mobile audit PASS 18/18.

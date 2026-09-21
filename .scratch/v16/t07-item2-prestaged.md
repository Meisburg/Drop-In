# V16 t07 item 2 — PRE-STAGED BRIEF (all three rulings ready)

Written 2026-09-21 (round 16). The founder has not yet ruled among (a)/(b)/(c).
The mechanics below were read from the code THIS round, so dispatch is immediate
once a ruling arrives.

## The defect, restated with the exact competing call

`PlaceMap.tsx` runs TWO effects that both call `fitBounds`, on different triggers:

1. **The marker-group effect** (`:305-312`) — on every `markersKey` change:
   ```ts
   const boundsPoints = entries.map((e) => [e.coords.lat, e.coords.lng])
   if (homePin) boundsPoints.push([homePin.lat, homePin.lng])
   map.fitBounds(L.latLngBounds(boundsPoints), { padding: [28,28], maxZoom: DETAIL_ZOOM })
   ```
   `fitBounds` picks the zoom that fits **ALL** points. `maxZoom: DETAIL_ZOOM`
   (15) only caps how far IN it may go — it does nothing to stop the view zooming
   OUT. With dozens of places across Seattle the fit is a city-wide view and every
   marker collapses into the overlapping blue blob the founder photographed.

2. **The radius-circle effect** (`:327-341`) — on every `circleKey` change:
   ```ts
   map.fitBounds(L.latLngBounds([lat-halfSpan, lng-halfSpan], [lat+halfSpan, lng+halfSpan]),
                 { padding: [16,16] })
   ```
   This is the anchor the founder actually wants, and effect 1 actively fights it.

The two goals documented at `:300-303` genuinely conflict at city scale: *"the pin
can never scroll out of view … and every place on the map is inside the canvas
and tappable."* You cannot have both when the points span 30 miles.

---

## BRIEF (b) — RECOMMENDED: fit the RADIUS CIRCLE, not the points

**Deliverable:** effect 2 becomes the sole framing authority; effect 1 stops
fitting.

**Scope — mostly a DELETION:**
1. `PlaceMap.tsx` — in the marker-group effect, REMOVE the `fitBounds` call and
   the `boundsPoints` construction (`:305-312`). Keep `map.invalidateSize()` and
   the group cleanup. The effect still adds markers; it just no longer moves the
   camera.
2. Ensure the camera is framed when there is NO circle to fit (radiusCircle null)
   — the existing mount path already does `setView(..., homePin ? HOME_PIN_ZOOM :
   anchor === undefined ? 11 : DETAIL_ZOOM)` (`:222-225`), which is the correct
   fallback and needs no change. Verify it still runs.
3. Update the comment at `:300-303`: the invariant is now "the view is framed by
   the search radius; places outside it are legitimately off-canvas" — and say
   why the old both-goals claim was abandoned.
4. **Gate:** unit tests for any pure seam touched (probably none); the real check
   is `e2e/places.e2e.ts` (which asserts marker tap → info → "Start a drop-in")
   and the overview-map spec. Run them targeted. Add a note that a 320px visual
   pass at a 35-mile radius is the taste check.

**Risk to watch:** the V15 t02 spec at `:290-300` exists because a marker became
UNTAPPABLE when the view was wrong. Removing the points-fit could reintroduce
that IF the radius circle is large. Mitigate by confirming the marker-click spec
still passes at the widest radius.

---

## BRIEF (a) — anchor on HOME at a fixed zoom

**Scope:** in the marker-group effect, replace `fitBounds` with
`map.setView([homePin.lat, homePin.lng], HOME_PIN_ZOOM)` (13, already defined at
`:44`) when a home pin exists. Off-screen places are dropped from view.
**Downside to state in the commit:** far places become unreachable without
panning — the V15 t02 "every place tappable" claim is explicitly abandoned.

---

## BRIEF (c) — keep fitting all points (accept the blob)

**Scope:** no code change; record the decision and close the item as
won't-fix-by-choice. The founder should know this keeps the photographed defect.

---

## Why (b) is recommended (unchanged from rounds 6-15)

It satisfies both goals in the case that matters: inside the default 5-mile
radius the circle IS small, so everything in it is on screen and tappable. At 35
miles the circle is the honest frame — "here is everything you asked to see" —
rather than an arbitrary zoom or a blob. And it needs the least new code: the
radius effect already exists; the points-fit is the thing fighting it.

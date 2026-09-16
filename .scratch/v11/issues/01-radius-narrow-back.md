# 01: Radius — "Back to 5 miles" escape

**What to build:** When the parent's radius is above the 5-mile default, the
shared empty-radius state (`RadiusEmptyState`) currently only knows how to
WIDEN (20, 35). Add a "Back to 5 miles" escape so a too-WIDE radius is also
escapable. It renders as a third escape button alongside the widen ones. No
UI change to the component is needed — it already maps over the
`radiusEscapes()` list generically.

**Why:** A parent at 20 mi who wants the tight 5-mile view finds the empty
state is a one-way door — it only offers "wider." Symmetric with the widen
escapes.

**Status:** DONE (2026-09-16; gate 825/825 unit + 76 passed e2e; commit hash recorded in the coordinator's task-state V11 update)

## Mechanics (pinned)

- The pure seam `radiusEscapes(radiusMiles)` in `src/lib/feed.ts` (~line 1762)
  is the single source of the escape list. `RadiusEmptyState.tsx` already
  renders whatever it returns (line 63 `const escapes = radiusEscapes(...)`,
  lines 98-108 map each `escape.label`). The change is ONLY in the seam.
- The seam today builds two escapes, both gated on being WIDER than the
  current radius: `WIDEN_RADIUS_MILES` (20) "Widen to 20 miles",
  `SEE_ALL_RADIUS_MILES` (35) "See everything in Seattle". Add a THIRD
  candidate: `DEFAULT_RADIUS_MILES` (5) with label "Back to 5 miles", included
  ONLY when `radiusMiles > 5`. Return the list ascending by radius (5, 20, 35)
  so narrow-first reads naturally. Reuse the existing constants — do not
  hardcode 5/20/35.
- Component copy (minor): `RadiusEmptyState.tsx` line 106 says
  `busyRadius === escape.radiusMiles ? 'Widening…' : escape.label` and line 84
  says "Could not widen your radius." Both assume widening. Make the busy
  label neutral ("Updating…") and the error copy neutral ("Could not update
  your radius. Try again.") so a NARROW (back to 5) reads correctly.
- Update the pinned unit expectations in `src/lib/feed.test.ts` (the
  `radiusEscapes` block, ~lines 1859-1890).

## Acceptance criteria

- [ ] `radiusEscapes(5)` → [20, 35] (no "Back to 5"); `radiusEscapes(2)` →
      [20, 35]; `radiusEscapes(10)` → [5, 20, 35]; `radiusEscapes(20)` →
      [5, 35]; `radiusEscapes(35)` → [].
- [ ] At radius 20 the empty state shows "Back to 5 miles" + "See everything
      in Seattle" (widen-to-20 is dropped, 20 is not > 20); tapping "Back to 5
      miles" calls `updateHomeZipRadius(..., 5)` and the feed re-renders.
- [ ] Busy label + error line read "update", not "widen" (grep for
      "Widen"/"widening" in `RadiusEmptyState.tsx` → gone).
- [ ] `feed.test.ts` `radiusEscapes` block updated (the old "every escape is
      wider than the radius" invariant must now allow the 5-mile escape — pin
      the new rule); `npm run build && npm run test` exit 0.

**Migration check:** NONE. `supabase/` untouched.

**Depends on:** nothing.
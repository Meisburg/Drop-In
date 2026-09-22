# V19 — neighbourhood feel: tight maps, a feed map, and two-parent profiles

> **Status:** open, 2026-09-21. Founder batch, given verbally.
> **Base:** `285b712` (V18 shipped). Baseline gate: `npm run verify` exit 0 ·
> 1007/1007 unit (28 files) · lint 0 errors / 62 warnings.
> **Build law:** `docs/agents/code-structure.md`. Gate: `npm run verify`.

## 1. The founder's ask, verbatim in intent

> "when I see the map on places or on posts section, I want the map to be zoomed
> in as close as possible by default, showing the less-than-1-mile view. And the
> user's zipcode/address is provided when they onboard, so it's automatically
> showing you drop-ins CLOSEST to you. This is important because it's the value
> added to make this feel like a neighbourhood feel."

> "on the profile section, on 'About the parents', there should be a place for
> up to two parents to have an individual pic and text field to tell people
> about themselves. Additionally, if someone makes a separate profile like the
> wife or the husband, they should be able to link accounts so they both show up
> on the profile."

**The product thesis behind item 1:** the app's differentiator is *neighbourhood*,
not *city*. A map that opens on all of Seattle says "here is a directory". A map
that opens on your own few blocks says "here is what is happening near you."
The zoom level IS the product claim.

## 2. What exists today (verified against the tree and the live DB)

| Fact | Evidence |
|---|---|
| The map frames the **radius circle**, so it opens as wide as the chosen radius | `framingCircle` (`places.ts:803`), `PlaceMap.tsx` radius effect |
| The founder's stored `radius_miles` is **35** — the widest option | live DB read, 2026-09-21 |
| The **default** radius is already 5 miles | `DEFAULT_RADIUS_MILES` |
| **The feed has no map at all** | `PlacesMap` is imported only by `BrowsePage`; V16 t06.3 was never built |
| Posts carry `place_id` and a free-text `place`, **no coordinates** | live `playdates` column read |
| "About the parents" is **one** bio field | `profiles.bio` |
| `profiles` has one `avatar_url` + one `family_photo_url` | live column read |
| **There is no partner/link concept anywhere** | all 22 public tables enumerated; none relates two profiles |

## 3. Founder rulings (2026-09-21) — all three binding

| D | Question | **Ruling** |
|---|---|---|
| **D1** | What does the map do when a wide radius is chosen? | **The map ALWAYS frames tight around home. Radius widens the LIST only.** The home pin is the permanent anchor. |
| **D2** | Build the feed map now? | **Yes** — the same map band, with pins for the actual drop-ins, same tight-zoom behaviour. |
| **D3** | How does linking work? | **Invite by @handle + accept.** One parent enters the other's handle, that parent accepts, both then appear on each other's profile. Unlink is available. |
| **D4** | Where do two parent photos + texts live? | **A `parent_cards` child table** — 1–2 rows per account, each with a photo and text. |
| **D5** | Sequencing | **Map work first** (slice 1–2), then profiles (slice 3–5), so the zoom fix is verified live before a second map and a new subsystem land. |

### Why D1 resolves a long-parked conflict

V16 t07 item 2 was parked for a founder ruling because two goals conflict at city
scale: *"the home pin can never scroll out of view (V15 t02 AC1)"* and *"every
place on the map must be inside the canvas and tappable."* **D1 rules that the
first wins.** Off-screen places are not a defect; they are a consequence of
showing the neighbourhood. This is a **policy change, not a bug fix**, and the
map must not silently re-fit to fit them — that is the failure mode V16 t07
item 2 (`93f313b`) already deleted once.

## 4. Scope

### Slice 1 — the zoom policy (the founder's main ask)

1. The map frames a **fixed tight radius around the home pin**, independent of
   the picked radius. Introduce `MAP_FOCUS_RADIUS_MILES` (≈1, the founder's
   "less than 1 mile" intent) as the single named constant.
2. Choosing 5/20/35 widens **the list** (`filterPlacesByRadius` is unchanged) but
   **not the map frame**.
3. The home pin stays centred and on-screen, always.
4. A search that narrows results still tightens the frame to those results
   (V17 t04's behaviour) — the frame never *widens* past the focus radius.
5. The "places outside the view" case is handled honestly: the map says so,
   rather than silently re-fitting.

### Slice 2 — the feed map (D2)

1. The same map band on `/`, above the day sections.
2. One pin per drop-in that resolves to a place with coordinates.
3. Free-text posts (`place_id IS NULL`) have **no coordinates and no pin** — the
   feed already has an `unplaced` concept to reuse; they must never be invented
   onto the map.
4. Same tight-zoom policy as slice 1.

### Slices 3–5 — two-parent profiles (D3, D4)

3. Migration: `parent_cards` (1–2 per account: name, photo, text, order) and
   `account_links` (invite → accept, with status). RLS: a parent card is
   readable per the existing profile-visibility rules; a link is visible only to
   its two parties; only the owner may write their own cards.
4. Link by @handle: send → the other parent sees a pending invite → accept or
   decline → unlink.
5. `/profile` renders up to two parent cards with photo + text, and shows the
   linked partner.

## 5. Non-goals

- **No geolocation.** The stored `home_zip` is the only location source — the
  V12 t05 invariant, and the founder's own framing ("their zipcode is provided
  when they onboard").
- **No third+ parent slot.** "Up to two" is the ruling.
- **No points-fit re-introduction** (V16 t07 item 2 / `93f313b`).
- **No change to `filterPlacesByRadius`** — the radius still filters the list.
- **No new public surface for children.** Kids stay off the map and out of
  parent cards.
- No changes to posting, RSVP, or messaging.

## 6. Acceptance criteria

1. `npm run verify` exit 0 on the final tree.
2. With `radius_miles = 35` stored, `/browse`'s map opens **tight on the home
   pin**, and the radius selector still changes **how many list rows** appear.
   Both halves asserted — a fix that also stopped filtering the list would be a
   regression the map test alone cannot see.
3. The home pin is inside the map canvas at every radius setting.
4. `/` renders a map with one pin per PLACED drop-in, and **no pin** for a
   free-text drop-in — asserted with a real free-text post.
5. A second parent can be invited by handle, accept, and then appears on both
   profiles; unlink removes them. RLS asserted: a third account cannot read the
   link or the other account's pending invite.
6. Every new `lib/` module ships a sibling `.test.ts` (the build law).
7. Red checks in both directions for each user-visible claim.

## 7. Risks

1. **"Tight map" hides places.** By ruling, accepted — but the UI must SAY so
   rather than look broken. Mitigation: an explicit "N places outside this view"
   affordance.
2. **The feed map could re-shape the feed.** `/` is the most-used screen.
   Mitigation: the map is additive above the existing day sections; the section
   structure is untouched.
3. **Linking is a privacy surface.** Two accounts become mutually visible.
   Mitigation: RLS scoped to the two parties; a link requires BOTH sides to act;
   never auto-visible to anyone else.
4. **Two `parent_cards` vs one `bio`.** The existing `bio` must not be silently
   orphaned or double-rendered. Mitigation: pin the migration's relationship to
   `bio` explicitly in slice 3.
5. **A second map is a second set of Leaflet lifecycle bugs.** The V15.2 map
   regressions (`M0 0` markers, remount-on-conditional-render) are the recorded
   precedent. Mitigation: reuse `PlacesMap` rather than a parallel component.

## 8. Status log

- 2026-09-21 — batch opened from the founder's verbal feedback. Verified all
  seven "what exists today" facts against the tree and the live DB before
  ruling. D1–D5 ruled in two rounds of questions; plan written next.

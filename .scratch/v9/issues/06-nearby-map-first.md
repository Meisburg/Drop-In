# 06: Nearby — map-first, with a list toggle

**What to build:** Her words: *"the nearby section should show like a google map
view initially, but maybe there you could toggle it to list view instead … you
can see all the events like pinned across the map of where you are and then you
can just tap one to see what events are happening near you … it tells you like
when it's going to happen and you can learn more that way and say you're
going."*

A parent deciding on a Saturday morning thinks in places, not in a scroll. Make
the map the default surface and keep the list one tap away.

**Blocked by:** Ticket 05 (one-writer). Independent of it in code, but ordering
keeps the queue honest.

**Status:** ready-for-agent — **pending one human confirmation** (the map
provider; see the judgment call)

- [ ] `/` opens **map-first**: pins for every drop-in within the viewer's radius,
  rendered on a map centred on the **home zip** (never the device's location — no
  GPS, the pinned privacy posture), with the list a **one-tap toggle** and the
  choice remembered in local storage
- [ ] Pin → a **bottom sheet** with the drop-in's title, place, the time window
  (or "this afternoon"), the ages line, "N going" + avatars, **I'm going**, and
  **More info** → the detail page. The sheet is the whole decision: a parent must
  be able to say yes without leaving the map
- [ ] A drop-in whose post has **no coordinates** (free-text place, no `place_id`)
  is **listed but not pinned** — never dropped, never given an invented
  coordinate; the list is therefore the source of truth for "everything near you"
- [ ] Existing behaviour survives: the day sections and the list view render
  exactly what they render today, the empty state keeps the V8/02 escapes, the
  "while you were away" inbox (V8/03) stays above both views, and the map view
  keeps the same radius semantics (nothing about discovery changes — only how it
  is drawn)
- [ ] Offline: map tiles are **not** precached (they are third-party requests and
  would bloat the shell); the LIST view must still work offline exactly as it does
  today, and `node scripts/verify-pwa.mjs` must stay green — that script is the
  regression guard for the service worker
- [ ] Library, pinned unless the human says otherwise: **Leaflet + OpenStreetMap
  tiles** (no API key, no billing account, no per-load cost, no Google ToS on the
  derived data). The tile URL, attribution, and the "no key configured" behaviour
  are all in one module so swapping providers later is one file
- [ ] Pure seams + unit tests: `mapPins(posts)` (posts WITH coordinates → pins;
  the rest → the unplaced list), `mapBounds(pins, viewerZipCoords)` (centred on
  the home zip, zoom chosen so the radius fits), and `unplacedNotice(count)`
- [ ] New e2e `nearby-map.e2e.ts`: the map renders by default (assert the
  container + the pin count matches the placed posts), the toggle switches to the
  list and the choice survives a reload, tapping a pin opens the sheet with the
  right title, and "I'm going" from the sheet writes a ping (REST-verified).
  Tiles themselves are not asserted (a third-party network dependency must never
  be able to fail the suite) — assert our own DOM and data
- [ ] `npm run build && npm run test && npm run test:e2e` exit 0

**Migration check:** **NONE — no schema change.** `places.lat/lng` (0029) and
`playdates.place_id` (0030) already carry everything a pin needs. Diff guard: no
file under `supabase/migrations/` changes, and no new dependency beyond the map
library itself (record it in `package.json` and in this ticket's report).

**JUDGMENT CALL — the provider (recommended: Leaflet + OSM).** Google Maps
would match the words "google map view" literally, but it needs an API key and a
billing account, costs per load at scale, and its terms restrict storing derived
data — for a small non-commercial app that is a standing liability. Leaflet +
OSM is one file, no key, and looks like a map. If the human insists on Google,
the ticket's shape does not change: only the module behind `mapPins` is swapped
and a key must be added to Vercel's env.

**Verify:** `npm run build && npm run test`; `npx playwright test
e2e/nearby-map.e2e.ts`; `node scripts/verify-pwa.mjs <preview-url>` (must stay
green); full suite; live phone pass — open the app, see pins, tap one, say you're
going without leaving the map.

## Comments

# Slice 4 — a map on the area card

You are `orchestrator-builder`. **Read `docs/agents/code-structure.md` before writing anything.**
Worktree: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, branch `Meisburg/onboarding`.
**Read `plan.md` section 6, slice 4** — this brief is a pointer with measurements.

## ⚠️ Read this first: as the plan first wrote it, this slice was impossible

The plan said *"once an address resolves, render `PlacesMap` with `homePin` + `radiusCircle`."*
**Measured, there is no such moment.** The address resolves **only inside `handleAreaFinish`**
(`src/pages/OnboardingPage.tsx:419`; its `onPrimary` is `:790`, and `zipFromAddressQueryBounded` is
called exactly once, at `:441`). On success that handler calls `saveLocation` (`:464`), which flips
`homeZipSet` and renders the run's **finish card in place**. So "once the address resolves" is
precisely the instant the area card stops existing — the parent would never see the map.

**That is why this slice moves the resolution earlier.** Don't treat it as an optional flourish;
it is the slice.

## What is already built (measured — reuse it, do not rebuild it)

- **`leaflet` is already a dependency** (`package.json:31`, `@types/leaflet:39`) with real CSS
  engineering behind it already: `src/index.css:410-511` handles touch targets and popup width, with
  comments explaining why each selector is shaped the way it is (leaflet.css is bundled *after* this
  file, so specificity is deliberate). **Do not add a map dependency.**
- **`PlacesMap`** (`src/components/PlaceMap.tsx:195`) already accepts exactly what this card needs:
  `homePin` (`{lat,lng} | null`), `radiusCircle` (`{center, radiusMiles} | null`), an optional
  `places` array (may be empty), `className`, `testId` (default `'places-map'`), and
  `placeActions` (default `true`). Callers today: `FeedPage.tsx:1297`, `PlacePage.tsx`,
  `NewPlaydatePage.tsx`.
- **Use the LAZY wrapper** (`src/components/PlaceMapLazy.tsx`) the way those three callers do — its
  header comment explains that each wrapper resolves **its own named export**, and getting that
  wrong has caused a real "Element type is invalid" bug before.
- **`shouldRenderPlacesMap`** lives in `src/components/PlacesMapView.tsx` (with `PlacesMapView`
  at `:63`, whose doc notes *at most ONE map is mounted at any time*). **Use it as the render
  condition; do not invent a new one.**
- **The geocode seam is injected already**: `export type AddressLookup = (query: string) =>
  Promise<NominatimResult | null>` (`src/lib/geocode.ts:45`), `geocodeAddress` (`:88`), and the pure
  extractors `zipFromResult` (`:130`) and `coordinatesFromResult` (`:73`). `ADDRESS_LOOKUP_TIMEOUT_MS
  = 10_000` (`:170`).

## The ruled shape

1. **Resolve on blur, debounced**, through the `AddressLookup` seam. **One request must yield both
   answers** — the stored zip *and* the pin's coordinates — via `zipFromResult` +
   `coordinatesFromResult`. Today the page calls `zipFromAddressQueryBounded`, which throws the
   coordinates away; that is the seam change this slice needs.
2. **`handleAreaFinish` reuses the resolved result and never re-geocodes.** Keep its existing
   contract intact: typed ZIP wins; a failed or still-pending lookup still reveals the ZIP fallback
   (`data-testid="area-zip-fallback-note"`) and **never blocks**.
3. **The map appears only once something has resolved**, and the radius `<select>` (`:866-878`)
   redraws it client-side — **a radius change issues no request.**
4. **The pending-state rule (r1's standing invariant) applies:** the early lookup is bounded by
   `ADDRESS_LOOKUP_TIMEOUT_MS`, and **the map must never be the thing that traps a parent.**

## Acceptance criteria (demonstrate each)

1. With a resolved address: a map renders with a home pin **and** a radius circle.
2. Changing the radius redraws the circle **with no new request**.
3. An unresolved or failed lookup still leaves the primary button reachable and the ZIP fallback
   working.
4. **No map-shaped claim is rendered before the address resolves** — i.e. the area card must not
   imply a location it does not have.
5. **Exactly ONE Nominatim request per distinct address** — assert by counting calls into the
   injected `AddressLookup` seam (blur + Finish on the same address must not double-fire).
6. `npm run verify` exits 0.

## Verify

`npm run verify`. **Targeted e2e only:** `e2e/onboarding-resume.e2e.ts` and
`e2e/signup-zip-fallback.e2e.ts` ride this card. If you touch the ZIP fallback's behaviour, say so
loudly — `e2e/no-zip-notice.e2e.ts` is the spec that owns it. Kill listeners **by port**, never
`pkill -f`.

**Two known flakes — re-run once before reporting either:** `scripts/guards/no-bypass-guard` (fails
under parallel load, passes 26/26 isolated) and `e2e/places.e2e.ts:2759`.

## Report format

- **Committed as: `<sha7>`** — or say plainly *"not committed"* and why. An absent field is read as
  evidence, not silence.
- Files changed with `+/-` counts.
- For each acceptance criterion: **the command and its raw output tail.**
- **State explicitly how you moved the resolution earlier** (which event, what debounce, what
  happens on a timeout) and whether `handleAreaFinish` re-geocodes — it must not.
- `npm run verify`: exit code, test-file count, test count, lint counts.
- Anything the plan did not anticipate — **say it rather than quietly fixing it.**

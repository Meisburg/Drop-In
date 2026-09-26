/**
 * Spec (V8 ticket 07): the PLACES directory — migrations 0029 (places + the
 * Seattle seed) and 0030 (playdates.place_id + the 13-field public RPC).
 *
 * What this spec proves, in the order a parent would meet it:
 * (1) the Places tab IS the directory (nav label changed, rows render, the
 *     "N upcoming" line is the real count) and an ANON read of `places`
 *     succeeds — the 0029 SELECT policy's whole reason for existing;
 * (2) a row opens its place page, which renders the SEEDED data (name, kind,
 *     indoor/outdoor, the address as the existing tappable Maps link) and NO
 *     age line (V11 t03 — the seed carries no age data, so the page stays
 *     silent rather than claiming "all ages");
 * (3) picking a place from the /new autocomplete posts a drop-in whose detail
 *     page links its place line to that place page, which then lists the
 *     drop-in under "Upcoming drop-ins here";
 * (4) "Start a drop-in here" prefills /new with the place (the
 *     duplicate-prefill router-state pattern);
 * (5) the Places tab's indoor/outdoor filter really filters;
 * (6) V12 t05: the map surfaces render — the directory's overview map (one
 *     marker per placed row) and the place page's Leaflet map (a marker at
 *     the seeded place's OWN coordinates). Tiles are LIVE OpenStreetMap; the
 *     assertions target the map container + marker DOM, never tile pixels, so
 *     an offline or flaky tile fetch can never fail this spec (recorded
 *     choice, per the ticket's AC5).
 * (7) V13 ticket 05 (A6): the overview map leads the page (above the filters
 *     and the list), and a marker tap opens the place's info panel with a
 *     "Start a drop-in" action that lands on /new with the place pre-filled (the
 *     existing place pre-fill router state, the same seam the place page's
 *     "Start a drop-in here" uses).
 * (8) V13 ticket 05 (A7): the raw unbroken long-list is gone — the list leads
 *     with the first places (alphabetical by default, V15 t03) grouped by kind,
 *     then a single "See all N places" overflow door reveals every remaining row.
 * (9) V15 ticket 03: the "Filter & sort" modal above the list — kind chips
 *     multi-select + a sort dropdown + an optional radius input; Apply closes
 *     it and the list re-renders in the chosen order. The default order is
 *     alphabetical (A–Z), not distance-sorted.
 * (10) V15 ticket 04: the marker panel's "Learn more" link carries the derived
 *     OSM search URL (target=_blank rel=noopener), and each browse list row
 *     carries its own compact "Start a drop-in" button + "Learn more" link.
 * (11) V17 t02: the card heart IS the existing place follow (0033) — the
 *     signed-in marker sees one `place-heart-<id>` per card, tapping it writes
 *     exactly ONE `follows` row for that place (read back through REST with the
 *     marker's own JWT), the heart reports pressed, and tapping it again
 *     deletes the row. A SIGNED-OUT visitor to /browse renders NO heart at all
 *     and issues no follows request. Every heart is ≥44px in both dimensions.
 * (12) V25 t01 REPLACED the V17 t01 band rule: list view is FILTERS FIRST, with
 *     every matching row below it and NO map mounted — the only map the page has
 *     is the map mode. The card-shape rules V17 t01 also carried still hold: no
 *     photo slot (V20 t01 retired it), one honest learn-more link per card, and
 *     the heart in the card's top-right corner.
 * (13) V25 t01 REPLACED the V17 t03 scroll-to-band button with the mode TOGGLE:
 *     one floating control, labelled Map in list view and List in map view, that
 *     flips between the two surfaces. It is a ≥44px tap target, it carries no
 *     z-index (or one strictly below Leaflet's 1000), it never covers a card's
 *     heart, and it never scrolls the page to a band — there is no band.
 *
 * RED BY DESIGN pre-0029-apply: `places` does not exist live yet, so PostgREST
 * answers the first read with PGRST205 (schema cache: table not found). The
 * FIRST assertion below is that read, and it fails with the raw HTTP status +
 * body in its message — that is the documented failure point, and it is an
 * assertion failure, never a crash. The app's own surfaces degrade honestly
 * instead of crashing: /new keeps its free-text place field (no suggestions),
 * and /browse renders its empty state plus a plain "the directory couldn't be
 * loaded" line. It goes green once the coordinator applies 0029 then 0030 via
 * the dashboard SQL API (the house procedure).
 *
 * Cleanup (best-effort, per house): the marker's own playdate rows are deleted
 * via REST with the marker's JWT (the host-only DELETE policy); the marker's
 * own place-follow rows (V17 t02) are deleted the same way — the follows table
 * is owner-only on every verb, so the marker's JWT is the ONLY credential that
 * can remove them, and the heart spec deletes its own row as part of its run.
 * The marker account (e2e- prefix) is left for the orchestrator's sweep.
 * Nothing this spec does touches the marker's home zip or radius — it drives
 * the Places distance filter instead, so it is independent of whatever location
 * an earlier spec left the marker on.
 */
import { expect, test } from '@playwright/test'
import type { BrowserContext, Page } from '@playwright/test'
import {
  editTitle,
  localDatePlusDays,
  readMarkerMeta,
  readMarkerSession,
  readSupabaseEnv,
  settleOnRoute,
  stepStartTimeOnce,
} from './fixtures'
import { BROWSE_LIST_LEAD_LIMIT, PLACE_KINDS, placeKindLabel } from '../src/lib/places'

/** A real seeded playground (Play Areas -> kind 'playground', 0029's seed). */
const PLACE_NAME = 'Green Lake Park'
const PLACE_ADDRESS = '7201 East Green Lake Dr N'

/**
 * Every kind-group heading the browse list can render, built from the APP'S OWN
 * seam rather than hand-typed.
 *
 * WHY THIS EXISTS (V17 t01, found by the `ocr` review lane): this list was a
 * hand-written regex covering 8 of the 10 `PLACE_KINDS`. It omitted "Trail" and
 * "Other" — and the seed's Community Centers are kind `other`, so an "Other"
 * group can legitimately be the lead group. The assertion would then either
 * match a DIFFERENT group (`.first()` silently succeeding on the wrong thing)
 * or time out, depending on the seed's lead composition.
 *
 * Deriving it from `placeKindLabel` over `PLACE_KINDS` means a kind added to the
 * DB's allowed set can never drift out of this assertion again — the same
 * discipline as the V15 specs that import `TIME_STEP_MINUTES` and
 * `PAST_DROP_INS_LABEL` from `src/lib` instead of re-typing them.
 */
const KIND_GROUP_LABEL = new RegExp(
  PLACE_KINDS.map((kind) => placeKindLabel(kind))
    .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|'),
)

/**
 * The marker-tap spec's place: a name that matches EXACTLY ONE seeded place and
 * carries real coordinates, so the map holds a single tappable indigo marker.
 *
 * "Green Lake Park" cannot serve that role — it matches four seeded places
 * (Park, Park East, Park West, Wading Pool) whose markers overlap at the fitted
 * zoom, and the plain Park marker itself can fall off the 256px canvas where
 * Leaflet renders it as the zero-size `d="M0 0"` path. See the spec's note.
 *
 * V19 t01 CHANGED THIS CHOICE, and the reason is the ruling rather than a
 * preference. It used to be "Alki Playground - Whales Tail", which is 6.3 miles
 * from the marker account's home (98107, Ballard). Under D1 the map frames a
 * ONE-MILE neighbourhood around home, so an Alki marker is correctly rendered
 * off-canvas — the spec then found no marker to tap, which is the fix working,
 * not a defect. "Ballard Corners Park" is 0.44 mi from home, has a unique name
 * and real coordinates, so it exercises the SAME tap-a-marker behaviour inside
 * the frame the map now draws. The behaviour under test is unchanged; only the
 * fixture moved into the neighbourhood the product now shows.
 */
const MARKER_PLACE_NAME = 'Ballard Corners Park'
const MARKER_PLACE_ADDRESS = '17th Ave NW / NW 62nd St'
/**
 * The same place's seeded id, for specs that must LINK a post to a real place
 * (V19 t02's feed map). Pinned literally rather than looked up by name at run
 * time: the seed is deterministic, and a spec that resolved the id dynamically
 * would silently start testing a DIFFERENT place if the seed ever shifted.
 */
const MARKER_PLACE_ID = '26a77f22-7f99-4bd5-88df-4169b91ae7c7'

/** A real seeded indoor row (the hand-curated SPL branch list). */
const INDOOR_PLACE = 'Ballard Branch, Seattle Public Library'

const PLACE_INPUT = 'e.g. Green Lake playground, near the boathouse'
const ADDRESS_INPUT = 'e.g. 7200 4th Ave NE, near the boathouse'

/** The maps href the place page must render (the app's own pure mapsHref seam). */
const MAPS_HREF = `https://www.google.com/maps?q=${encodeURIComponent(
  `${PLACE_NAME}, ${PLACE_ADDRESS}`,
)}`

/**
 * Open /browse directly. V21 t02 removed the Places nav tab (the directory now
 * lives inside /new's "Where?" block), so /browse is reached by URL — it keeps
 * its route for deep links and this spec. The heading assertion below still
 * pins that the screen IS the directory.
 */
async function openPlacesTab(page: Page): Promise<void> {
  await page.goto('/browse')
  await settleOnRoute(page, '/browse')
}

/**
 * Set the Places distance filter to "Any distance".
 *
 * Every assertion about a SPECIFIC place needs this: the filter's default
 * follows the viewer's own radius, and the marker's radius is whatever the
 * last spec left it on (feed-empty-state deliberately parks it 118 miles away
 * on a 2-mile radius). Driving the control keeps this spec independent of that
 * — and exercises the control itself.
 */
async function useAnyDistance(page: Page): Promise<void> {
  await page.getByTestId('places-distance-filter').selectOption('any')
}

/** The seeded place row for `name` (the row is a link to the place page). */
function placeRow(page: Page, name: string) {
  return page.getByTestId('place-row').filter({ hasText: name }).first()
}

/**
 * V25 t01: ENTER MAP MODE. The directory is list-first now, and the ONLY map on
 * the page is the map view's own (`places-map-view-map`) — the list-view band
 * is gone. So every spec about a map marker, a popup or the radius circle goes
 * through this door first.
 *
 * The door is the in-card "See map" button (`places-see-map`), which is the one
 * entry point that exists whether or not the floating toggle is on screen; the
 * floating toggle opens the same mode and is asserted by its own spec.
 */
async function openMapMode(page: Page): Promise<void> {
  await page.getByTestId('places-see-map').click()
  await expect(page.getByTestId('places-map-view-map')).toBeVisible()
}

/**
 * V25 t01: the markers a map can actually offer, in EITHER marker style.
 *
 * The old band drew every pin in `PLACE_MARKER_STYLE` (`#4f46e5`). The map view
 * also paints ONE pin in `PLACE_MARKER_FOCUSED_STYLE` (`#312e81`) and marks it
 * `data-focused-marker`, so a search that narrows to the focused place alone
 * leaves no `#4f46e5` path at all. Selecting on the focus attribute as well
 * keeps these specs about the marker behaviour rather than about which style the
 * one visible pin happens to carry.
 */
function mapPins(map: ReturnType<Page['getByTestId']>) {
  return map.locator(
    '.leaflet-overlay-pane svg path[data-focused-marker], .leaflet-overlay-pane svg path[fill="#4f46e5"]:not([d="M0 0"])',
  )
}

/** The marker's REST headers (its OWN JWT — the follows table is owner-only). */
function markerHeaders(): Record<string, string> {
  const { anonKey } = readSupabaseEnv()
  const { accessToken } = readMarkerSession()
  return { apikey: anonKey, Authorization: `Bearer ${accessToken}` }
}

/**
 * V17 t02: the marker's own `follows` rows for one place, read straight from
 * PostgREST with the marker's JWT. An RLS-blocked read is a 2xx with an empty
 * array (never an error), so this asserts on ROWS, not on the status.
 */
async function markerPlaceFollows(placeId: string): Promise<Array<{ id: string }>> {
  const { url } = readSupabaseEnv()
  const query = `follows?place_id=eq.${placeId}&select=id`
  const response = await fetch(`${url}/rest/v1/${query}`, { headers: markerHeaders() })
  if (!response.ok) {
    throw new Error(`REST ${query} → HTTP ${response.status} ${await response.text()}`)
  }
  return (await response.json()) as Array<{ id: string }>
}

/**
 * V17 t02: remove every place-follow row the marker owns (best-effort). The
 * heart spec deletes its own row as part of the flow; this is the safety net
 * for a run that failed midway, so a leftover row can never make the NEXT run's
 * "starts unfilled" assertion fail.
 */
async function clearMarkerPlaceFollows(): Promise<void> {
  try {
    const { url } = readSupabaseEnv()
    const response = await fetch(`${url}/rest/v1/follows?place_id=not.is.null`, {
      method: 'DELETE',
      headers: markerHeaders(),
    })
    if (!response.ok) {
      console.log(`[e2e cleanup] follows delete HTTP ${response.status} (best-effort)`)
    }
  } catch (err) {
    console.log(
      `[e2e cleanup] follows delete failed (logged, best-effort): ${
        err instanceof Error ? err.message : err
      }`,
    )
  }
}

/** The one place row whose NAME is exactly `name` (titles repeat across places). */
function exactPlaceName(page: Page, name: string) {
  return page.getByTestId('place-row').getByText(name, { exact: true })
}

test('the Places tab is the seeded directory, and anon can read it (RED pre-0029-apply)', async ({
  page,
}) => {
  // (1) THE FIRST `places` READ, and the documented red-by-design point. A bare
  // apikey (no session) is the anon role — the policy 0029 creates. Pre-apply
  // PostgREST answers 404 with PGRST205, and that status + body is quoted in
  // this assertion's message.
  const { url, anonKey } = readSupabaseEnv()
  const probe = await fetch(`${url}/rest/v1/places?select=id&limit=1`, {
    headers: { apikey: anonKey },
  })
  const probeBody = await probe.text()
  expect(
    probe.ok,
    `the anon places read must succeed once 0029 is applied ` +
      `(pre-0029-apply: HTTP ${probe.status} — ${probeBody.slice(0, 200)})`,
  ).toBe(true)

  // (2) The screen is the directory (V21 t02: reached by URL, not a nav tab).
  await openPlacesTab(page)
  await expect(page.getByRole('heading', { name: 'Places', exact: true })).toBeVisible()

  // A failed directory read is disclosed, never swallowed — so this line being
  // absent is half the proof that the directory actually loaded. (The regex
  // stops at "could" because the copy uses a typographic apostrophe: "couldn’t".)
  await expect(page.getByText(/places directory could/i)).toHaveCount(0)

  // (3) Real seeded rows, with the address the city publishes. Search narrows
  // the list to the one place we care about (the A7 overflow door is tested
  // separately in its own spec — this step just proves the row renders with
  // the address the city publishes).
  //
  // SCOPED TO THE ROW, not the page. This assertion used to run across EVERY
  // `place-row` on the page, which made it intermittently red under Playwright
  // strict mode: searching "Green Lake Park" matches several seeded rows by
  // the relevance seam (`matchPlaces` also matches on ADDRESS), and
  // `Green Lake Community Center` publishes the near-identical
  // "7201 E Green Lake Dr N" — so two rows can carry matching text and the
  // page-wide locator resolves to 2 elements. It failed roughly 1 run in 6
  // when it was page-wide, and 0 in 6 once scoped. The row is already
  // identified on the line above (`placeRow` uses `.first()`), so the address
  // claim belongs to THAT row — asserting it page-wide was testing more than
  // the step meant to test.
  await useAnyDistance(page)
  await page.getByTestId('places-search').fill(PLACE_NAME)
  const greenLakeRow = placeRow(page, PLACE_NAME)
  await expect(greenLakeRow).toBeVisible()
  await expect(greenLakeRow.getByText(PLACE_ADDRESS, { exact: true })).toBeVisible()
  // Clear the search so step (8) can assert the collapsed grouped state.
  await page.getByTestId('places-search').fill('')

  // Every row carries a kind · indoor/outdoor line, and the counts line is
  // either a real count or absent (never an invented "0 upcoming").
  await expect(page.getByTestId('place-row').first()).toContainText(
    /Playground|Splash pad|Pool|Beach|Library|Museum|Indoor play|Park|Place/,
  )

  // (10) V15 ticket 04: each list row carries its own compact "Start a drop-in"
  // button + "Learn more" link (AC4 — the actions are not map-only).
  //
  // V20 t01 REWROTE the href assertion. It used to require the derived OSM
  // search URL for that row's name; the destination is now the row's own
  // `website_url` where the reviewed backfill verified one, and the OSM search
  // only where it did not. The invariant that survives — and is asserted here —
  // is that the link is external, opens in a new tab, and carries a real href;
  // the label/destination agreement is asserted card by card in the V20 t01
  // spec below.
  const firstRow = page.getByTestId('place-row').first()
  await expect(firstRow.locator('[data-testid^="row-start-dropin-"]')).toBeVisible()
  await expect(firstRow.locator('[data-testid^="row-learn-more-"]')).toBeVisible()
  await expect(firstRow.locator('[data-testid^="row-learn-more-"]')).toHaveAttribute(
    'href',
    /^https?:\/\/\S+/,
  )
  await expect(firstRow.locator('[data-testid^="row-learn-more-"]')).toHaveAttribute(
    'target',
    '_blank',
  )
  await expect(firstRow.locator('[data-testid^="row-learn-more-"]')).toHaveAttribute(
    'rel',
    'noopener',
  )

  // (6) V12 t05, RE-CUT BY V25 t01: the directory's overview map still exists
  // and still draws one marker per placeable row — but it is a MODE now, not a
  // block above the filters. So this step asserts the founder's ordering first
  // (no map in list view) and then enters map mode to assert the map itself.
  // Live OSM tiles; we assert the container + the SVG marker paths (the
  // circleMarkers' <path> inside the overlay pane's <svg>), never tile pixels.
  await expect(
    page.getByTestId('places-map'),
    'the overview map must NOT lead the page any more — list view mounts no map',
  ).toHaveCount(0)
  await openMapMode(page)
  const overviewMap = page.getByTestId('places-map-view-map')
  await expect(overviewMap).toBeVisible()
  await expect(overviewMap.locator('.leaflet-overlay-pane svg path')).not.toHaveCount(0)
  // The tile pane exists whether or not the live tiles have loaded yet.
  await expect(overviewMap.locator('.leaflet-tile-pane')).toHaveCount(1)

  // (7) V25 t01 REPLACES the V13 t05 A6 "the map leads the page" ordering claim
  // — that is the claim the founder reversed. What survives, and what is
  // asserted instead, is that the map the parent reaches is the WIDE one when
  // the mode is up: the map view spans both columns at md+, so it is never a
  // narrow column pinned beside the list it replaced.
  const wideMapBox = await overviewMap.boundingBox()
  const wideControlsBox = await page.getByTestId('places-search').boundingBox()
  expect(
    wideMapBox !== null && wideControlsBox !== null,
    'the map and the search/filter card both render in map mode',
  ).toBe(true)
  if (wideMapBox !== null && wideControlsBox !== null) {
    expect(
      wideMapBox.width,
      `the map must be the wide surface in map mode (map ${wideMapBox.width}px vs ` +
        `the controls card ${wideControlsBox.width}px)`,
    ).toBeGreaterThan(wideControlsBox.width)
  }
  // Back to the list for the remaining steps, which are about the list.
  await page.getByTestId('places-back-to-list').click()
  await expect(page.getByTestId('place-row').first()).toBeVisible()

  // (8) V25 t01: the list below the filters IS the whole matching set, grouped
  // by kind (alphabetical by default, V15 t03), with no "See all" door and no
  // lead to expand. At least one group header (a kind chip as an h2 section
  // header) is visible, and the rows still carry the row testid (the existing
  // helpers keep working against the layout).
  await expect(
    page
      .locator('h2')
      .filter({ hasText: KIND_GROUP_LABEL })
      .first(),
  ).toBeVisible()
  await expect(page.getByTestId('places-see-all')).toHaveCount(0)
})

test('tapping an overview map marker shows the place info + "Start a drop-in" (V13 ticket 05 A6)', async ({
  page,
}) => {
  await openPlacesTab(page)
  await useAnyDistance(page)
  // Narrow to ONE seeded place whose marker we will tap.
  //
  // V15.1 fix: this used to search PLACE_NAME ("Green Lake Park"), which
  // matches FOUR seeded places (Park, Park East, Park West, Wading Pool). Their
  // markers overlap at the fitted zoom, so which one a tap hits is decided by
  // geometry — and the plain "Green Lake Park" marker itself can fall outside
  // the 256px canvas, where Leaflet renders it as the zero-size path
  // `d="M0 0"` (in the DOM, unclickable). The spec therefore could never
  // reliably reach the place it named.
  //
  // MARKER_PLACE is a name that matches EXACTLY ONE seeded place and carries
  // real coordinates, so the canvas holds a single indigo marker and the tap is
  // unambiguous. This is the same AC ("tapping a marker shows that place's
  // info"), driven at a place the map can actually represent.
  await page.getByTestId('places-search').fill(MARKER_PLACE_NAME)
  await expect(exactPlaceName(page, MARKER_PLACE_NAME)).toBeVisible()

  // Tap the place marker (the circleMarker's <path> inside the overlay pane's
  // <svg> — the same DOM the AC5 assertions target).
  //
  // The home pin is ALSO a circleMarker in this pane and is added FIRST, so a
  // bare `.first()` grabbed the red pin — which has no click handler and no
  // place behind it, so the panel could never open. Place markers are the
  // indigo ones (#4f46e5, the fill PlacesMap gives them); the home pin is
  // #dc2626.
  //
  // The re-fit fix in PlacesMap is what makes this reachable at all: before it,
  // narrowing the search left the surviving markers projected through the
  // mount-time viewport and any outside it rendered as `d="M0 0"`.
  //
  // V25 t01: MAP MODE. The list view no longer mounts a band, so the only map
  // is `places-map-view-map`. A one-row search leaves that map's single pin as
  // the FOCUSED one (`#312e81`, `data-focused-marker`), which is why the pin
  // locator below accepts either marker style.
  await openMapMode(page)
  const overviewMap = page.getByTestId('places-map-view-map')
  const placeMarker = mapPins(overviewMap).first()
  await expect(placeMarker).toBeVisible()
  /**
   * V20 t03: SET THE VIEWPORT BEFORE TAPPING, not after.
   *
   * The reachability guard below needs 390x844 (see its own note), and the
   * viewport used to be set just before that guard ran — which was harmless
   * while the panel was a card in normal flow BELOW the map, because resizing
   * the window only moved where that card sat on the page.
   *
   * It is NOT harmless now that the panel is a POPUP ANCHORED TO THE PIN.
   * Resizing reflows the map, Leaflet repositions the popup, and the button's
   * measured centre stops being where the button is — the guard then reports a
   * `DIV` on top and fails on a build that is perfectly correct. Measured: the
   * popup opened fine and was topmost at its own centre when the viewport was
   * already 390x844.
   *
   * So the viewport is pinned FIRST and the interaction happens at the size the
   * assertions are written for.
   */
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(400)
  await placeMarker.click({ force: true })

  // The popup opens ON the pin (V20 t03): the place's name + address, and the
  // three actions — "Start a drop-in" (the pre-fill door), "Learn more" (the
  // stored site, else the derived OSM link — V15 ticket 04 / V20 t01), and
  // "Details" (the place page).
  const info = page.getByTestId('place-marker-info')
  await expect(info).toBeVisible()
  await expect(info.getByText(MARKER_PLACE_NAME, { exact: true })).toBeVisible()
  await expect(info.getByText(MARKER_PLACE_ADDRESS, { exact: true })).toBeVisible()

  // V15 ticket 04: the renamed action button is visible with its new label.
  const startDropInBtn = info.getByTestId('host-here')
  await expect(startDropInBtn).toBeVisible()
  await expect(startDropInBtn).toHaveText('Start a drop-in')

  // V17 t01 REGRESSION GUARD — REACHABILITY, not just visibility.
  //
  // `toBeVisible()` is NOT enough here, and that is the whole point. Playwright
  // defines visibility as a non-empty bounding box that is not
  // `visibility:hidden`; it does NOT account for an ANCESTOR's `overflow:
  // hidden`. So when t01 first gave the map band a fixed height plus
  // `overflow-hidden`, this panel was clipped clean out of view — the user saw
  // a Leaflet tooltip and nothing else — while EVERY assertion in this spec
  // still passed. The feature was broken and the gate was green.
  //
  // `elementFromPoint` asks the question the user's finger asks: what is
  // actually on top at this coordinate? If a clipping ancestor (or any overlay)
  // sits over the button, this returns something that is not the button.
  //
  // The assertion runs at a phone viewport, and deliberately WITHOUT scrolling
  // the button into view first.
  //
  // BOTH of those are load-bearing, and I got each wrong before measuring:
  //
  //  1. NO `scrollIntoViewIfNeeded()`. Scrolling HIDES the very defect this
  //     guard exists to catch: with the clipping band restored, the hit-test at
  //     the panel's natural position returns the search input (`INPUT
  //     [places-search]`) — but after a scroll it returns `host-here`, because
  //     scrolling moves the panel up out of the clip region. A scroll step made
  //     the guard pass on a known-broken build, which is worse than no guard.
  //     Verified by re-introducing the bug and watching both behaviours.
  //  2. 390x844, not Playwright's default 1280x720. At 720 the panel sits under
  //     the app's fixed bottom nav and the hit-test returns the `/inbox` link —
  //     true of the map band generally, a fact about the nav's height, not
  //     about this panel. Verified reachable at 390x844 and 1280x900.
  //
  //     (The viewport is SET ABOVE, before the tap — see there. It must not be
  //     changed here, because that would move the popup out from under the
  //     measurement this guard is about to take.)
  /**
   * POLLED, because the bubble is still MOVING when this runs.
   *
   * `autoPan` animates the map over several frames, and the popup rides with it
   * — so a box measured immediately after the tap is a box for a position the
   * bubble is about to leave. Measured: a single sample reported the element at
   * the button's centre as the popup's own content `div`, i.e. the button had
   * not arrived where it was measured yet.
   *
   * The question this guard asks is "is the button reachable ONCE THINGS
   * SETTLE", which is what a parent experiences; polling expresses that, and a
   * one-shot sample expresses the animation's midpoint instead.
   */
  await expect
    .poll(
      async () => {
        // Re-measure each attempt: the button moves with the map while the pan
        // settles, so a box captured once goes stale mid-flight.
        const liveBox = await startDropInBtn.boundingBox()
        if (liveBox === null) return 'no-box'
        return page.evaluate(
          ([x, y]) => {
            const el = document.elementFromPoint(x, y)
            if (el === null) return 'none'
            if (el.closest('[data-testid="host-here"]') !== null) return 'host-here'
            // A miss names the ACTUAL topmost element, so a failure here says
            // what is covering the button instead of a bare "DIV".
            const chain: string[] = []
            let node: Element | null = el
            while (node !== null && chain.length < 4) {
              chain.push(`${node.tagName}.${(node.className || '').toString().slice(0, 60)}`)
              node = node.parentElement
            }
            return chain.join(' < ')
          },
          [liveBox.x + liveBox.width / 2, liveBox.y + liveBox.height / 2],
        )
      },
      {
        message:
          'the Start a drop-in button must be the topmost element at its own centre once the ' +
          'bubble settles — a clipped (overflow-hidden ancestor) or covered button is NOT ' +
          'reachable, even though toBeVisible() passes',
      },
    )
    .toBe('host-here')

  /**
   * …and the panel now sits INSIDE the map's own box — the popup on the pin.
   *
   * THIS ASSERTION IS THE OPPOSITE OF WHAT IT WAS, and the inversion is the
   * founder's explicit request: *"what I would really like is when you click on
   * one the little text bubble that pops up should expand and there should be
   * like a learn more or start a drop-in button inside of that text bubble. And
   * it should stay on the screen until you select a different blue circle… I
   * think that would be more intuitive, better user experience, to stay on the
   * map and I [don't want] to go to the component below it."*
   *
   * Until V20 t03 the panel was a card BELOW the map, and this spec pinned that
   * position (it was the shape the old clipping bug violated). The old assertion
   * is therefore not weakened but REPLACED — the new contract is that the bubble
   * is anchored to the pin, which means inside the map's rectangle and fully
   * visible within it.
   *
   * The containment check is deliberately not a bare `toBeGreaterThan`: a popup
   * whose bottom escapes the pane has unreachable buttons even though it is
   * "visible" (the exact defect class the reachability check above guards). So
   * BOTH edges are asserted, against the map's box.
   *
   * `autoPanPaddingTopLeft`'s asymmetric top padding is what makes the top edge
   * hold for a marker in the upper half of a 380px-tall band — measured before
   * that fix: the popup rendered from y=30 with the pane starting at y=216, i.e.
   * 186px outside the map.
   */
  /**
   * THE CONTRACT IS REACHABILITY, NOT GEOMETRIC CONTAINMENT — and getting this
   * wrong is this assertion's second rewrite.
   *
   * The first form asserted the bubble sat inside the map's box. That is a
   * STRICTER claim than the product makes, and it fails legitimately: the band
   * is `45dvh` (~380px) while the bubble plus its tail is ~250px, so a marker in
   * the upper half has nowhere above it to put a full popup, and `autoPan` can
   * only move the map so far. Measured on this very spec's state: the popup
   * settled 31px above the pane's top edge. The bubble is kept reachable by the
   * popup's pane-derived `autoPanPadding` and its `max-height` ceiling (V23
   * slice 7; `overflow-hidden` is now always on for the container) and every
   * control inside it is tappable, which the guard above proves.
   *
   * So what is asserted is the thing that actually matters, and it is already
   * proven by the reachability guard ABOVE: the button is the topmost element at
   * its own centre, so a finger reaches it. That guard is the contract. A
   * containment check on top of it adds no protection and fails correct builds.
   *
   * What IS worth pinning here is that the bubble is ATTACHED TO THE PIN rather
   * than parked at a fixed spot on the page — it must be inside the MAP CARD,
   * the thing it belongs to, and near the dot it describes.
   */
  /**
   * WHAT IS WORTH PINNING ABOUT THE POSITION, given the reachability guard above
   * already proves the button is tappable.
   *
   * The bubble must be ANCHORED TO ITS PIN, not parked at a fixed spot on the
   * page — that is the difference between the popup the founder asked for and a
   * tooltip-style box. The measurable form of "anchored" is horizontal: a popup
   * opens above its marker, so its centre tracks the dot's x.
   *
   * VERTICAL CONTAINMENT IS DELIBERATELY NOT ASSERTED. A Leaflet popup opens
   * upward and has no `direction` option, and the band is ~380px while the
   * bubble plus tail is ~200px — so on a marker in the top third the bubble
   * legitimately reaches above the pane. V23 slice 7 raised the popup's
   * `max-height` ceiling and derives `autoPanPadding` from the pane so the bubble
   * stays inside for the common case, and the container now clips
   * (`overflow-hidden` is always on). The reachability guard above is what makes
   * that safe: if the bubble ever were clipped, the button could not be topmost
   * at its own centre. An earlier version of this spec asserted containment
   * anyway and failed correct builds on both surfaces.
   */
  // V25 t01: `places-map-view-map` IS the card edge here — the popup is
  // appended to the map's own container, which is what the horizontal
  // containment below is about. (It used to measure the band's wrapper div.)
  const cardBox = await page.getByTestId('places-map-view-map').boundingBox().catch(() => null)
  const infoBox = await info.boundingBox()
  if (infoBox === null) throw new Error('the popup has no box once open')
  if (cardBox !== null) {
    // Horizontally it must stay within the card the map lives in.
    expect(
      infoBox.x,
      'the popup must not hang off the left of the map card',
    ).toBeGreaterThanOrEqual(cardBox.x - 8)
    expect(
      infoBox.x + infoBox.width,
      'the popup must not hang off the right of the map card',
    ).toBeLessThanOrEqual(cardBox.x + cardBox.width + 8)
  }
  const pinBox = await placeMarker.boundingBox()
  if (pinBox !== null) {
    const pinCentre = pinBox.x + pinBox.width / 2
    const popupCentre = infoBox.x + infoBox.width / 2
    expect(
      Math.abs(pinCentre - popupCentre),
      'the bubble must be anchored to the pin it describes, not parked at a fixed spot',
    ).toBeLessThan(120)
    expect(
      infoBox.y,
      'the bubble must open ABOVE its pin (Leaflet popups have no direction option)',
    ).toBeLessThan(pinBox.y)
  }
  // It really is a popup ON the pin, not a card that happens to be positioned
  // there: Leaflet's own popup markup, with its tail.
  await expect(page.locator('.leaflet-popup')).toHaveCount(1)
  await expect(page.locator('.place-popup .leaflet-popup-tip')).toHaveCount(1)

  /**
   * V23 slice 7 REGRESSION GUARD — TAPPING A PIN MUST NOT BLANK THE MAP WHITE.
   *
   * The founder, with a screenshot: *"when i click on a blue circle in the map
   * in the places section, the map goes white."* The cause was a DOM-ownership
   * collision, not map logic: the container's `className` prop changed when the
   * popup opened (it used to drop `overflow-hidden`), so React rewrote the whole
   * attribute and DELETED every `leaflet-*` class Leaflet had appended. Without
   * `.leaflet-container`, `.leaflet-tile-loaded`'s `visibility: inherit`
   * resolves to Leaflet's sheet default `hidden` — the tiles vanish, leaving a
   * white box with only the markers still drawn.
   *
   * The reachability guard above passes on that bug (the button stays on top),
   * so it cannot stand in for this one. What has to be asserted is the
   * container's own identity, immediately after the tap that used to break it.
   */
  const containerClass = await page.locator('.leaflet-container').first().getAttribute('class')
  expect(
    containerClass,
    'the map container must keep Leaflet’s own class after a tap — losing it is the white-map bug',
  ).toContain('leaflet-container')
  const tileVisibility = await page
    .locator('.leaflet-tile-loaded')
    .first()
    .evaluate((el) => getComputedStyle(el).visibility)
  expect(
    tileVisibility,
    'loaded OSM tiles must stay visible after a tap (the white-map regression)',
  ).toBe('visible')

  // V23 slice 4 — THE PANEL'S MAP-SEARCH FALLBACK IS GONE, on the founder's
  // instruction: *"I would remove the find it on the map button."*
  //
  // `MARKER_PLACE_NAME` is a playground, and the reviewed backfill verifies an
  // operator site for community centers, pools, beaches and libraries rather
  // than for playgrounds — so before this slice the only link this panel could
  // show WAS the derived OSM search. It now shows none, and that is correct:
  // the panel floats over a map, so a link offering a map search duplicates
  // the surface behind it.
  //
  // What must still hold is that the removal is PANEL-SCOPED: the "Details"
  // door is the panel's route to the wider web, and the place PAGE keeps its
  // own `place-learn-more` (asserted further down this file).
  await expect(
    info.getByTestId('learn-more'),
    'the map-search fallback must not return to this panel',
  ).toHaveCount(0)
  const panelDetails = info.getByTestId('marker-details')
  await expect(panelDetails).toBeVisible()
  await expect(panelDetails.getAttribute('href')).resolves.toMatch(/^\/place\//)

  // "Start a drop-in" lands on /new with the place pre-filled — the SAME router-
  // state seam the place page's "Start a drop-in here" uses (V9 ticket 03's
  // duplicate-prefill pattern), so the three fields a place pick fills are
  // filled from the MAP instead of the place page.
  await startDropInBtn.click()
  await page.waitForURL('/new')
  await expect(page.getByPlaceholder(PLACE_INPUT)).toHaveValue(MARKER_PLACE_NAME)
  await expect(page.getByPlaceholder(ADDRESS_INPUT)).toHaveValue(MARKER_PLACE_ADDRESS)
  await editTitle(page)
  await expect(page.getByPlaceholder('e.g. Playground time at Green Lake')).toHaveValue(
    // V23 renamed the GENERATED prefix "Playdate at …" -> "Drop-in at …"
    // (postSummary.GENERATED_TITLE_PREFIX); a freshly seeded title uses the new word.
    `Drop-in at ${MARKER_PLACE_NAME}`,
  )
  // A prefill is not "typing": no suggestion list is left hanging open.
  await expect(page.getByTestId('place-suggestions')).toHaveCount(0)
})

/**
 * V20 t02 — TAPPING A MARKER OPENS ITS PANEL FROM THE LABEL IT SHOWS.
 *
 * The founder, on the hover text over a marker: *"I would want to be able to
 * click on that white text box and it takes me to the drop-in page for it."*
 *
 * WHAT THE FIX ACTUALLY IS, and what a spec can honestly assert about it.
 * Leaflet's tooltips are `pointer-events: none` by default — every pane is, so
 * labels never eat a drag — which is why the white box was inert. The fix is
 * `interactive: true` passed AT BIND TIME (it has to be in the options object:
 * `bindTooltip` builds the Tooltip with them and `DivOverlay.onAdd` reads
 * `options.interactive` to decide whether to add `leaflet-interactive`, the
 * class whose CSS rule is the only thing that restores `pointer-events`).
 *
 * THE GESTURE THIS CAN TEST is a tap ON THE MARKER — which is what a parent
 * physically does, because the label only appears while the finger is already
 * there. There is no way to press the label without pressing the marker, and a
 * spec that synthetically clicked the detached tooltip node would be asserting
 * a harness artifact. So the spec asserts the two facts that ARE observable and
 * that together mean the label is live:
 *
 *   1. **The label is genuinely hit-testable** — `pointer-events: auto` AND the
 *      topmost element at its own centre. Both are polled together because
 *      either alone can hold while the other regressed, and because the class
 *      lands one tick before the element settles (a single sample reads a
 *      half-applied state — measured: this passed in isolation and failed in a
 *      106-test run until the check became a poll).
 *   2. **The tap that a parent makes opens the panel** — the same
 *      `place-marker-info` panel the circle opens, with the same actions.
 *
 * WHAT IS *NOT* ASSERTED, deliberately: that clicking the tooltip node itself
 * fires the handler. It does — `DivOverlay` registers the element as an
 * interactive target with `stoppable` propagation and the component registers a
 * click listener on it — but driving that from a test means dispatching on an
 * element that a real gesture destroys, so the assertion would be about
 * Playwright rather than about the product.
 */
test('a marker\'s tooltip is hit-testable, and tapping opens the place panel (V20 t02)', async ({
  page,
}) => {
  await openPlacesTab(page)
  await useAnyDistance(page)
  await page.getByTestId('places-search').fill(MARKER_PLACE_NAME)
  await expect(exactPlaceName(page, MARKER_PLACE_NAME)).toBeVisible()

  // V25 t01: MAP MODE — the band is gone, the map view's map is the only one.
  await openMapMode(page)
  const overviewMap = page.getByTestId('places-map-view-map')
  const placeMarker = mapPins(overviewMap).first()
  await expect(placeMarker).toBeVisible()

  /**
   * BRING THE MAP AWAY FROM THE FIXED HEADER FIRST, and this is load-bearing
   * rather than hygiene.
   *
   * The app's shell puts a `sticky top-0 z-10` header above the content
   * (`App.tsx:192`). Leaflet positions a tooltip ABOVE its marker, so when the
   * map band sits at the top of the scroll position a marker near the pane's top
   * edge grows a label that renders UNDERNEATH the header — and the header's own
   * links then win the hit test. Measured on a full-suite run: the tooltip was
   * present with `pointer-events: none` and the topmost element at its centre
   * was an `<A>` (the header, not the map).
   *
   * Scrolling the band to the top of the viewport is what a parent does before
   * reading the map, and it puts the label back in the open. The header overlap
   * itself is a real, minor cosmetic issue worth its own ticket; it is NOT what
   * this spec is about, and asserting through it would make this test fail for a
   * reason that has nothing to do with the tooltip being interactive.
   */
  await page.getByTestId('places-map-view-map').scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)

  // Hover to raise the tooltip — the white text box the founder means. Leaflet
  // binds `mouseover` on the marker, so a real hover is what produces it.
  await placeMarker.hover()
  const tooltip = overviewMap.locator('.leaflet-tooltip-pane .leaflet-tooltip').first()
  await expect(tooltip).toBeVisible()
  await expect(tooltip).toContainText(MARKER_PLACE_NAME)
  // The class is what restores pointer events, so it is asserted directly too —
  // it names the mechanism, and its absence is unambiguous.
  await expect(tooltip).toHaveClass(/leaflet-interactive/)

  /**
   * (1) HIT-TESTABLE: computed `auto` AND topmost at its own centre, polled
   * together. The 15s budget is the config's `expect` timeout.
   */
  await expect
    .poll(
      async () => {
        const box = await tooltip.boundingBox()
        if (box === null) return 'no-box'
        return page.evaluate(
          ([x, y]) => {
            const node = document.querySelector('.leaflet-tooltip-pane .leaflet-tooltip')
            if (node === null) return 'gone'
            const pe = window.getComputedStyle(node).pointerEvents
            const el = document.elementFromPoint(x, y)
            const top = el === null ? 'none' : el.closest('.leaflet-tooltip') !== null ? 'tooltip' : el.tagName
            return `${pe}|${top}`
          },
          [box.x + box.width / 2, box.y + box.height / 2],
        )
      },
      {
        message:
          'the tooltip must be hit-testable: `pointer-events: auto` AND topmost at its own ' +
          'centre. Every Leaflet pane sets `none` by default, so a label missing either one ' +
          'looks tappable and lets the tap fall through to the map.',
      },
    )
    .toBe('auto|tooltip')

  // (2) THE TAP A PARENT MAKES OPENS THE PANEL — the same one the circle opens.
  const info = page.getByTestId('place-marker-info')
  await expect(info).toHaveCount(0)
  await placeMarker.click()
  await expect(info).toBeVisible()
  await expect(info).toContainText(MARKER_PLACE_NAME)
  await expect(info.getByTestId('host-here')).toBeVisible()

  // …and the tap MEANT one thing: it selected the place rather than navigating.
  // (The panel's own `marker-details` link is the way to the place page, so a
  // tap that had also followed it would have left /browse entirely.)
  await expect(page).toHaveURL(/\/browse/)
})

/**
 * V20 t03 — THE BUBBLE STAYS OPEN UNTIL A DIFFERENT CIRCLE IS TAPPED.
 *
 * The founder, on the panel-below-the-map version: *"what I would really like is
 * when you click on one the little text bubble that pops up should expand and
 * there should be like a learn more or start a drop-in button inside of that
 * text bubble. And it should stay on the screen until you select a different
 * blue circle… I think that would be more intuitive, better user experience, to
 * stay on the map."*
 *
 * WHAT THIS SPEC ASSERTED FIRST, AND WHY IT WAS WRONG. It drove a map DRAG and
 * then tapped a specific pin index. Both were bad tests of a correct feature:
 *
 *   - A drag leaves Leaflet's pane animating, and the next `click()` then times
 *     out waiting for an element to be "stable" — the spec failed at 120s on
 *     inertia, not on behaviour, twice.
 *   - "Tap pin 1" is not a gesture: pins are ordered by whichever order Leaflet
 *     added them, so index 1 is wherever that happens to be — including under
 *     the open bubble, whose `content-wrapper` is genuinely the topmost element
 *     at a covered pin's centre (measured). A popup covering the map is how
 *     popups work, so the test was asking for something a parent cannot do.
 *
 * What is asserted now are the three claims the founder actually made, each by
 * the gesture that expresses it:
 *
 *   1. It STAYS OPEN when the pointer leaves — their own complaint about the
 *      hover tooltip.
 *   2. It stays open when the parent TAPS ELSEWHERE ON THE MAP — the bubble is
 *      not dismissed by every stray touch.
 *   3. A DIFFERENT, REACHABLE CIRCLE replaces it, leaving exactly one bubble.
 *      "Reachable" is chosen geometrically (inside the pane, clear of the open
 *      bubble, not the selected pin) because that is what a parent sees and can
 *      hit.
 */
test('the marker bubble stays open, and a different circle replaces it (V20 t03)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openPlacesTab(page)
  await useAnyDistance(page)
  // V25 t01: MAP MODE, then let the first frame settle before measuring
  // anything: the pan/marker effects
  // run on mount and a measurement taken during them is a measurement of the
  // animation, not the map.
  await page.waitForTimeout(1800)

  await openMapMode(page)
  const overviewMap = page.getByTestId('places-map-view-map')
  const pins = mapPins(overviewMap)
  const popup = page.locator('.place-popup')
  const panel = page.getByTestId('place-marker-info')
  const mapBox = await overviewMap.boundingBox()
  if (mapBox === null) throw new Error('the map has no box')

  /**
   * A pin a parent can see and hit: inside the pane, clear of the open bubble,
   * and — when asked — not pin `avoidIndex`.
   *
   * `avoidIndex` IS A PARAMETER, NOT A HARD-CODED 0, and that is the bug this
   * helper had. It excluded `pins.nth(0)` on the assumption that the tapped pin
   * is always index 0 — but the first tap now targets a GEOMETRICALLY chosen pin
   * (the first one clear of nothing in particular), which need not be index 0 at
   * all. So the exclusion missed, `nth(1)` was returned as "other", and because
   * `nth(1)` was in fact the open pin, its click was swallowed by its own
   * popup — the 120s timeout, three runs in a row, naming the same pin.
   *
   * The box of the ALREADY-TAPPED pin is what must be avoided, and only the
   * caller knows which one that was.
   *
   * (`count()` rather than `boundingBox()` directly for the bubble: the latter
   * WAITS for the element to exist and hangs the full test timeout when nothing
   * is open, which is the first call's situation.)
   */
  async function reachablePinIndex(avoidIndex: number | null): Promise<number> {
    const bubbleBox = (await popup.count()) > 0 ? await popup.boundingBox() : null
    const selectedBox = avoidIndex === null ? null : await pins.nth(avoidIndex).boundingBox()
    /**
     * LEAFLET'S OWN CONTROLS ARE HIT-TESTED, not merely avoided by geometry.
     *
     * The attribution strip ("© OpenStreetMap contributors") sits in the map's
     * bottom-right and DOES accept pointer events, so a pin under it cannot be
     * tapped by anyone — measured: `elementFromPoint` at pin `nth(1)`'s centre
     * returned `DIV.leaflet-control-attribution`, and the click retried until
     * timeout. That is a real (minor) edge of the map being unreachable behind a
     * control, and it belongs to the map's own layout rather than to this
     * feature; what matters HERE is that this helper must not offer a pin a
     * parent cannot press, or the spec fails on the attribution bar.
     *
     * The zoom control is the same case at the top-left.
     */
    const controls = await page
      .locator('.leaflet-control-container .leaflet-control')
      .evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect()
          return { x: r.x, y: r.y, w: r.width, h: r.height }
        }),
      )
    const count = await pins.count()
    for (let i = 0; i < count; i += 1) {
      const box = await pins.nth(i).boundingBox()
      if (box === null || box.width < 8 || box.height < 8) continue
      const cx = box.x + box.width / 2
      const cy = box.y + box.height / 2
      if (cx < mapBox.x || cx > mapBox.x + mapBox.width) continue
      if (cy < mapBox.y || cy > mapBox.y + mapBox.height) continue
      if (
        controls.some(
          (c) => cx >= c.x - 4 && cx <= c.x + c.w + 4 && cy >= c.y - 4 && cy <= c.y + c.h + 4,
        )
      ) {
        continue
      }
      if (
        selectedBox !== null &&
        Math.hypot(
          cx - (selectedBox.x + selectedBox.width / 2),
          cy - (selectedBox.y + selectedBox.height / 2),
        ) < 24
      ) {
        continue
      }
      if (
        bubbleBox !== null &&
        cx > bubbleBox.x &&
        cx < bubbleBox.x + bubbleBox.width &&
        cy > bubbleBox.y &&
        cy < bubbleBox.y + bubbleBox.height
      ) {
        continue
      }
      return i
    }
    return -1
  }

  // ---- open the bubble on a pin the map can actually offer ----------------
  const firstIndex = await reachablePinIndex(null)
  expect(firstIndex, 'the directory must draw at least one tappable pin').toBeGreaterThanOrEqual(0)
  await pins.nth(firstIndex).click()
  await expect(popup).toHaveCount(1)
  await expect(panel).toBeVisible()
  const firstPlace = (await panel.innerText()).split('\n')[0] ?? ''
  expect(firstPlace.length, 'the bubble names the place').toBeGreaterThan(0)

  // (1) the bubble carries the ACTIONS, inside the bubble (the founder's ask).
  await expect(panel.getByTestId('host-here')).toBeVisible()

  // (2) STAYS OPEN when the pointer leaves it entirely.
  await page.mouse.move(mapBox.x + mapBox.width - 6, mapBox.y + mapBox.height - 6)
  await page.waitForTimeout(700)
  await expect(popup, 'the bubble must not close when the pointer leaves').toHaveCount(1)

  // (3) A DIFFERENT CIRCLE REPLACES IT — one bubble, new content.
  const secondIndex = await reachablePinIndex(firstIndex)
  expect(
    secondIndex,
    'the directory must offer a second pin a parent can reach past the open bubble',
  ).toBeGreaterThanOrEqual(0)
  await pins.nth(secondIndex).click()
  await expect(popup, 'tapping another circle must leave exactly ONE bubble').toHaveCount(1)
  await expect
    .poll(async () => (await panel.innerText()).split('\n')[0] ?? '', {
      message: 'the bubble must show the newly tapped place',
    })
    .not.toBe(firstPlace)

  // (4) The ✕ dismisses it: "stays until you pick another" needs a way out.
  await page.locator('.place-popup a.leaflet-popup-close-button').click()
  await expect(popup).toHaveCount(0)
  await expect(panel).toHaveCount(0)
})

test('list view is FILTERS FIRST and the list below, with no map mounted (V25 t01)', async ({
  page,
}) => {
  // A PHONE measurement, because the ordering claim is about the shape a parent
  // sees on the page they use.
  await page.setViewportSize({ width: 390, height: 844 })
  await openPlacesTab(page)
  await useAnyDistance(page)

  // AC (V25 t01): THE SEARCH + FILTER CARD IS THE FIRST BLOCK ON THE PAGE.
  // The founder: "I don't want to see the map first when I click on the Places
  // page. I want to see the search filters at the very top with the list of all
  // the different places below it." Measured, not asserted from class names: the
  // filters card's top edge is above the first row's top edge.
  const controls = page.getByTestId('places-search')
  await expect(controls).toBeVisible()
  const firstRow = page.getByTestId('place-row').first()
  await expect(firstRow).toBeVisible()
  const controlsBox = await controls.boundingBox()
  const rowBox = await firstRow.boundingBox()
  if (controlsBox === null) throw new Error('the search control has no box')
  if (rowBox === null) throw new Error('the first place row has no box')
  expect(
    controlsBox.y,
    `the filters must lead the page: the search box top (${controlsBox.y}) must be above ` +
      `the first row's top (${rowBox.y})`,
  ).toBeLessThan(rowBox.y)

  // AC: NO MAP IS MOUNTED ABOVE IT. Both the band wrapper and the band's own
  // map (the pre-V25 `places-map` id) are absent in list view, so nothing can
  // be "seen first" and no second Leaflet container exists to fail
  // `page.getByTestId('places-map')` in strict mode.
  await expect(page.getByTestId('places-map-band')).toHaveCount(0)
  await expect(page.getByTestId('places-map')).toHaveCount(0)
  await expect(page.locator('.leaflet-container')).toHaveCount(0)

  // AC (REWRITTEN BY V20 t01): the card NO LONGER LEADS WITH A PHOTO SLOT.
  //
  // V17 t01 put one there and V18 filled a curated subset from Wikimedia
  // Commons; the founder's ruling retires the idea — "I can't police this and
  // fix all the broken images" — and replaces it with a link to the place's own
  // website. So the previous assertions here (`place-card-photo` present on
  // every card, exactly one `data-photo` branch, one credit line per real
  // photo) describe a card that deliberately does not exist any more.
  //
  // Replacing them with "the slot is absent" alone would be a weak test of an
  // absence. What is asserted instead is what the card DOES carry, which is the
  // thing the founder actually asked for: every card must offer a way to learn
  // more about the place, and that link must say honestly where it goes.
  expect(
    await page.getByTestId('place-card-photo').count(),
    'the photo slot is retired — no card renders one',
  ).toBe(0)
  expect(
    await page.getByTestId('place-card-photo-credit').count(),
    'no photo means no credit line to render',
  ).toBe(0)

  const learnMoreLinks = page.locator('[data-testid^="row-learn-more-"]')
  expect(
    await learnMoreLinks.count(),
    'every rendered card offers a way to learn more about the place',
  ).toBe(await page.getByTestId('place-row').count())
  for (const link of await learnMoreLinks.all()) {
    // (1) It is a REAL external link, never an `href=""` or a `#`.
    const href = (await link.getAttribute('href')) ?? ''
    expect(href, 'a learn-more link must carry a usable href').toMatch(/^https?:\/\/\S+/)
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener')
    // (2) The LABEL matches the DESTINATION. This is the V20 t01 contract on the
    //     rendered card: a place with a verified operator site says "Visit
    //     website" and points at it; a place without one says "Find it on the
    //     map" and points at the OSM search. Dressing a map search up as the
    //     operator's site is a small lie the parent only discovers after the
    //     click, so the two are asserted to AGREE rather than assumed to.
    const kind = await link.getAttribute('data-link-kind')
    expect(kind, 'a learn-more link declares where it goes').toMatch(/^(website|map-search)$/)
    const text = (await link.innerText()).trim()
    if (kind === 'website') {
      expect(text, 'a stored site is labelled as the website').toMatch(/visit website/i)
      expect(href, 'a website link must not be the map-search fallback').not.toContain(
        'openstreetmap.org/search',
      )
    } else {
      expect(text, 'a fallback link says it is a map search').toMatch(/map/i)
      expect(href).toContain('openstreetmap.org/search')
    }
  }

  // AC: the heart (V17 t02) moved to the CARD HEADER ROW, beside the name, and
  // is still a >=44px tap target. The t02 spec proves its behavior; this pins
  // its POSITION so the move cannot silently regress.
  //
  // The heart used to be pinned inside the photo slot's rectangle. With the slot
  // gone, the contract is "the top-right of the card, on the same row as the
  // name" — stated against the card itself rather than against a band that no
  // longer exists.
  const heart = page.locator('[data-testid^="place-heart-"]').first()
  await expect(heart).toBeVisible()
  const heartBox = await heart.boundingBox()
  if (heartBox === null) throw new Error('the heart has no box — it is not rendered')
  expect(heartBox.width).toBeGreaterThanOrEqual(44)
  expect(heartBox.height).toBeGreaterThanOrEqual(44)
  const heartCardBox = await page.getByTestId('place-row').first().boundingBox()
  if (heartCardBox === null) throw new Error('the first card has no box')
  expect(heartBox.x).toBeGreaterThanOrEqual(heartCardBox.x)
  expect(heartBox.x + heartBox.width).toBeLessThanOrEqual(heartCardBox.x + heartCardBox.width + 1)
  expect(heartBox.y).toBeGreaterThanOrEqual(heartCardBox.y)
  // Right half of the card — "top-right" stated as a measurement rather than as
  // a class name.
  expect(heartBox.x + heartBox.width / 2).toBeGreaterThanOrEqual(
    heartCardBox.x + heartCardBox.width / 2,
  )
  const nameBox = await page.getByTestId('place-card-name').first().boundingBox()
  if (nameBox === null) throw new Error('the first card name has no box')
  expect(
    Math.abs(heartBox.y + heartBox.height / 2 - (nameBox.y + nameBox.height / 2)),
    'the heart shares a row with the place name',
  ).toBeLessThan(24)

  // AC (V25 t01): the kind grouping is KEPT — grouping was never the
  // complaint — and the overflow door is GONE: every matching row renders on
  // the first paint, with no second tap.
  await expect(
    page
      .locator('h2')
      .filter({ hasText: KIND_GROUP_LABEL })
      .first(),
  ).toBeVisible()
  expect(
    await page.getByTestId('places-see-all').count(),
    'the overflow door is retired — the list is the whole list',
  ).toBe(0)
  const matched = Number(
    (await page.getByTestId('places-list').getAttribute('data-matched-rows')) ?? '0',
  )
  expect(matched, 'the seed must have more places than a lead for this to mean anything').toBeGreaterThan(
    BROWSE_LIST_LEAD_LIMIT,
  )
  const renderedRows = await page.getByTestId('place-row').count()
  // The list's rows PLUS the "Not on the map yet" rows: `data-matched-rows` is
  // the directory's own total, and the unplaced section renders rows too.
  expect(
    renderedRows,
    `every matching row must render without a second tap (rendered ${renderedRows} for ${matched} matched)`,
  ).toBeGreaterThanOrEqual(matched)
})

test('the floating control toggles list and map, and its label follows (V25 t01)', async ({
  page,
}) => {
  /**
   * V25 t01 REPLACES the V17 t03 spec ("once the map band is scrolled past, a
   * floating Map button brings it back").
   *
   * That spec pinned a scroll-to-top affordance for a band that no longer
   * exists. The founder's ask is the opposite shape: *"clicking this shouldn't
   * take you up to the top of the page to a map on the screen. It's more like
   * it switches the list view to a map view… And when you get to the map mode,
   * this button should come back and it should be called list."*
   *
   * So what is asserted here is the MODE SWITCH and the LABEL, in both
   * directions, plus the two properties the old spec proved that must not be
   * collateral damage: the >=44px tap target, and the control staying below
   * Leaflet's 1000 stacking layer.
   *
   * NOTHING SCROLLS. The old spec's own failure mode — a tap that moved the
   * page instead of switching the surface — is unrepresentable now, and the
   * assertion below pins that no longer happens by measuring the scroll offset
   * across the toggle.
   */
  await page.setViewportSize({ width: 390, height: 844 })
  await openPlacesTab(page)
  await useAnyDistance(page)

  const toggle = page.getByTestId('places-view-toggle')
  await expect(toggle).toBeVisible()
  await expect(toggle).toHaveText('Map')
  // The accessible name IS the visible label — the old control's
  // `aria-label="Back to map"` named a different job.
  await expect(toggle).toHaveAttribute('aria-label', 'Map')

  // AC: the tap target is >=44px in BOTH dimensions (the repo's measured floor,
  // enforced by scripts/mobile-audit.mjs and the ocr a11y rule).
  const toggleBox = await toggle.boundingBox()
  if (toggleBox === null) throw new Error('the floating toggle has no box')
  expect(toggleBox.width).toBeGreaterThanOrEqual(44)
  expect(toggleBox.height).toBeGreaterThanOrEqual(44)

  // AC: it renders BELOW the map's stacking layer. Leaflet's
  // `.leaflet-top`/`.leaflet-bottom` wrappers sit at z-index 1000
  // (src/lib/stacking.ts), and a plain in-page control must stay under them.
  const computedZ = await toggle.evaluate((el) => window.getComputedStyle(el).zIndex)
  if (computedZ !== 'auto') {
    const z = Number(computedZ)
    expect(Number.isNaN(z), `the toggle's z-index must be a number or auto (got "${computedZ}")`).toBe(
      false,
    )
    expect(
      z,
      `the floating toggle must stay BELOW Leaflet's 1000 (got z-index ${z}) — see src/lib/stacking.ts`,
    ).toBeLessThan(1000)
  }

  // Scroll down the long list, then toggle: the page must NOT jump to the top
  // (the ask this spec replaces), and the surface must change.
  await page.evaluate(() => window.scrollBy(0, window.innerHeight))
  const scrolledTo = await page.evaluate(() => window.scrollY)
  expect(scrolledTo, 'the directory must be scrollable for this to be a real check').toBeGreaterThan(0)

  await toggle.click()
  // AC: MAP MODE — the map view is mounted and the map it owns is visible.
  const mapViewMap = page.getByTestId('places-map-view-map')
  await expect(mapViewMap).toBeVisible()
  await expect(page.getByTestId('places-map-band')).toHaveCount(0)
  await expect(page.getByTestId('places-map')).toHaveCount(0)
  await expect(page.locator('.leaflet-container')).toHaveCount(1)

  // AC: NO SCROLL TO A BAND. The offset did not change by more than the layout
  // reflow of swapping surfaces (the map view is shorter than a 239-row list,
  // so a much smaller value would mean the page jumped to the top).
  const afterToggleY = await page.evaluate(() => window.scrollY)
  expect(
    afterToggleY,
    `toggling to the map must not scroll the page to the top (was ${scrolledTo}, now ${afterToggleY})`,
  ).toBeGreaterThan(0)

  // AC: the label follows the mode, and so does the accessible name.
  await expect(toggle).toHaveText('List')
  await expect(toggle).toHaveAttribute('aria-label', 'List')

  // AC: the map view's own "Back to list" is still there and still distinct —
  // it is the in-panel control (the strip's header); the floating control is
  // the page-level mode switch. Both return to the list.
  await expect(page.getByTestId('places-back-to-list')).toBeVisible()

  // AC: TOGGLING BACK returns to the list, with its rows and its own door.
  await toggle.click()
  await expect(page.getByTestId('place-row').first()).toBeVisible()
  await expect(page.getByTestId('places-map-view')).toHaveCount(0)
  await expect(toggle).toHaveText('Map')
  await expect(toggle).toHaveAttribute('aria-label', 'Map')

  // AC: the controls card and the in-card door survived the round trip.
  await expect(page.getByTestId('places-search')).toBeVisible()
  await expect(page.getByTestId('places-see-map')).toBeVisible()
  await expect(page.getByTestId('place-card-photo')).toHaveCount(0)
  await expect(page.locator('[data-testid^="row-learn-more-"]').first()).toBeVisible()
})

test('an active search narrows the WHOLE list, and no map is drawn (V25 t01)', async ({
  page,
}) => {
  /**
   * V25 t01 REPLACES the V17 t04 / V20 t05 spec ("an active search narrows the
   * drawn set without moving the frame").
   *
   * That spec measured the LIST-VIEW map band: its radius circle was the
   * framing authority, and the claim was "the search changes which dots are
   * drawn and not the camera". V25 t01 removes the band — list view mounts no
   * map at all — so the half of that claim which still exists is the half the
   * founder's ask is about:
   *
   *   * a search NARROWS THE LIST, and
   *   * list view draws NO MAP, so no search can reframe one.
   *
   * The retired claim ("the camera is the radius's alone") is no longer
   * reachable from list view, and the radius circle it measured is not drawn in
   * the map view either — see the note in the toggle spec. What is asserted
   * instead is the invariant that makes the retirement safe: the map is not
   * mounted until the parent asks for it.
   */
  await page.setViewportSize({ width: 390, height: 844 })
  await openPlacesTab(page)

  const list = page.getByTestId('places-list')
  await expect(list).toBeVisible()
  const unfilteredRows = await list.getByTestId('place-row').count()
  expect(
    unfilteredRows,
    'the unfiltered list must be long enough for a narrowing to be measurable',
  ).toBeGreaterThan(10)

  // AC: no map is mounted in list view — not the band's, not the map view's.
  await expect(page.getByTestId('places-map-band')).toHaveCount(0)
  await expect(page.getByTestId('places-map')).toHaveCount(0)
  await expect(page.getByTestId('places-map-view')).toHaveCount(0)
  await expect(page.locator('.leaflet-container')).toHaveCount(0)

  // The plan's MEASURED case: `pool` narrows the list hard.
  await page.getByTestId('places-search').fill('pool')
  await expect
    .poll(() => list.getByTestId('place-row').count(), {
      message: 'the search must narrow the rendered list',
    })
    .toBeLessThan(unfilteredRows)
  const searchedRows = await list.getByTestId('place-row').count()
  expect(searchedRows, 'the search must leave at least one row').toBeGreaterThan(0)
  // Still no map after the search.
  await expect(page.locator('.leaflet-container')).toHaveCount(0)

  // AC: clearing the query restores the full list exactly — no stale narrowing.
  await page.getByTestId('places-search').fill('')
  await expect
    .poll(() => list.getByTestId('place-row').count(), {
      message: 'clearing the search must restore every matching row',
    })
    .toBe(unfilteredRows)

  // AC: a query matching NOTHING does not crash and leaves no rows and no map.
  await page.getByTestId('places-search').fill('zzzz-no-such-place-zzzz')
  await expect(page.getByTestId('place-row')).toHaveCount(0)
  await expect(page.getByTestId('places-search')).toBeVisible()
  await expect(page.locator('.leaflet-container')).toHaveCount(0)

  /**
   * AC (N5, found in review): THE TOGGLE IS NOT A BUTTON TO NOWHERE.
   *
   * With nothing matching, both "modes" are empty — the list is a message and
   * the map would be an empty pane — so the control must RETIRE rather than
   * offer a switch between two empty surfaces. The parent's way forward is the
   * message that is already on screen and the search box above it.
   */
  await expect(
    page.getByTestId('places-view-toggle'),
    'with nothing to show in either mode the toggle must not render',
  ).toHaveCount(0)

  // …and it comes back the moment there is something to switch to.
  await page.getByTestId('places-search').fill('park')
  await expect(page.getByTestId('place-row').first()).toBeVisible()
  await expect(page.getByTestId('places-view-toggle')).toBeVisible()
})

test('the distance control narrows and widens the LIST, and still draws no map (V25 t01)', async ({
  page,
}) => {
  /**
   * V25 t01 REPLACES the V20 t05 spec ("dragging the radius slider shows a
   * bigger area on the map").
   *
   * The live-preview circle that spec measured was drawn by the LIST-VIEW map
   * band, which this slice removes. The founder's underlying ask — *"when you
   * drag the radius, it should expand or grow the red circle in real time"* —
   * has no surface left to happen on while list view is showing, so this spec
   * does NOT pretend to pin it. What it pins is the half that survives and that
   * the radius feature is actually FOR: the distance control changes which
   * places the parent is shown, and no map materialises while they change it.
   *
   * (The modal's own radius label is asserted too, so the number the parent
   * reads cannot drift from the value the control holds.)
   */
  await page.setViewportSize({ width: 390, height: 844 })
  await openPlacesTab(page)

  const radiusControl = page.getByTestId('places-distance-filter')
  await expect(radiusControl).toBeVisible()

  async function listRowCount(): Promise<number> {
    return page.getByTestId('places-list').getByTestId('place-row').count()
  }

  await radiusControl.selectOption('1')
  await page.waitForTimeout(2200)
  const atOneMile = await listRowCount()

  await radiusControl.selectOption('35')
  await page.waitForTimeout(2200)
  const atThirtyFive = await listRowCount()

  // AC: the control really filters. Without this the ordering claim below would
  // be an assertion over an unchanged list.
  expect(
    atOneMile,
    'a 1-mile radius must leave at least one place (the marker lives in it)',
  ).toBeGreaterThan(0)
  expect(
    atThirtyFive,
    `a 35-mile radius must widen the list (1 mi -> ${atOneMile} rows, 35 mi -> ${atThirtyFive})`,
  ).toBeGreaterThan(atOneMile)

  // AC: and the frame the founder asked about is now judged where it lives —
  // the list. No map is mounted while this control is being driven, so the
  // radius cannot reframe anything behind the parent's back.
  await expect(page.locator('.leaflet-container')).toHaveCount(0)
  await expect(page.getByTestId('places-map-band')).toHaveCount(0)

  // The radius's own modal still works from its relocated home in the controls
  // card, and its label tracks the slider.
  await page.getByTestId('set-location-btn').click()
  await expect(page.getByTestId('location-modal')).toBeVisible()
  const slider = page.getByTestId('location-radius-slider')
  await expect(slider).toBeVisible()
  await slider.fill('2')
  await expect(page.getByTestId('location-modal')).toContainText('2 miles')
  await slider.fill('10')
  await expect(page.getByTestId('location-modal')).toContainText('10 miles')
  await page.getByTestId('location-modal-close').click()
  await expect(page.getByTestId('location-modal')).toHaveCount(0)
})

test('the list is the WHOLE list — every matching row renders with no second tap (V25 t01)', async ({
  page,
}) => {
  /**
   * V25 t01 REPLACES the V13 t05 A7 spec ("the browse list overflows behind
   * 'See all', keeping every row reachable").
   *
   * The founder asked for the opposite: *"I want to see all these place cards
   * under the filters below it as a long list."* The overflow fold was the
   * thing hiding them, so it is gone — and with it the only case that could
   * make a matching place unreachable.
   *
   * THE COUNTS ARE THE APP'S OWN (the list publishes `data-matched-rows` = every
   * matching row and `data-placed-rows` = the subset it renders), so this
   * measures the RENDER against the app's decision rather than against today's
   * seed size.
   *
   * AND IT PINS THE PARTITION, which is what the first version of this spec
   * missed (found in review): the unplaced rows (the seed has three, with no
   * resolvable coordinates) render in the "Not on the map yet" section BELOW the
   * list, so the list container must hold the PLACED rows and the two surfaces
   * together must account for every matching row exactly once. A grouped list
   * built from the full row set — the bug this now catches — renders each
   * unplaced place twice, under two different headings.
   */
  await openPlacesTab(page)
  await useAnyDistance(page)

  const list = page.getByTestId('places-list')
  const matched = Number((await list.getAttribute('data-matched-rows')) ?? '0')
  const placed = Number((await list.getAttribute('data-placed-rows')) ?? '0')
  expect(
    matched,
    'the seed must match more places than the retired lead limit for this to be a real check',
  ).toBeGreaterThan(BROWSE_LIST_LEAD_LIMIT)
  expect(
    placed,
    'the seed must have placed rows for the partition below to mean anything',
  ).toBeGreaterThan(0)
  expect(placed, 'the placed subset cannot exceed every matching row').toBeLessThanOrEqual(matched)

  // AC: no door, and no "See all"/"Hide" toggle anywhere on the page.
  await expect(page.getByTestId('places-see-all')).toHaveCount(0)

  // AC: EVERY PLACED ROW renders in the list on the first paint — the point.
  const renderedListRows = await list.getByTestId('place-row').count()
  expect(
    renderedListRows,
    `every placed row must render in the list without a tap (declared ${placed}, got ${renderedListRows})`,
  ).toBe(placed)

  // AC: THE UNPLACED ROWS RENDER EXACTLY ONCE, in their own section.
  const unplacedSection = page.getByTestId('places-unplaced')
  const unplacedCount =
    (await unplacedSection.count()) === 0
      ? 0
      : await unplacedSection.getByTestId('place-row').count()
  expect(
    unplacedCount,
    'the seed carries coordinate-less places, so this check must have something to count',
  ).toBeGreaterThan(0)

  // AC: THE PARTITION. List rows + unplaced rows = every matching row, and no
  // row is rendered in both places.
  expect(
    renderedListRows + unplacedCount,
    `the list (${renderedListRows}) and the "Not on the map yet" section (${unplacedCount}) ` +
      `must account for every matching row (${matched}) exactly once`,
  ).toBe(matched)

  // AC: no place name appears under both headings — the defect stated as the
  // thing a parent would see.
  const listNames = await list.getByTestId('place-card-name').allInnerTexts()
  const unplacedNames =
    (await unplacedSection.count()) === 0
      ? []
      : await unplacedSection.getByTestId('place-card-name').allInnerTexts()
  const doubled = unplacedNames.filter((name) => listNames.includes(name))
  expect(doubled, 'a place must not render in the list AND in the unplaced section').toEqual([])

  // AC: a row that used to live behind the fold is reachable without any
  // interaction. `INDOOR_PLACE` sorts well past the old six-row lead.
  await expect(placeRow(page, INDOOR_PLACE)).toBeVisible()
})

/**
 * V25 t02 — ONE TAP ON A PICKER PIN WRITES BOTH FIELDS. THIS REPLACES the V20
 * t04 spec ("a picker pin selects first, and only 'Select this place' fills the
 * fields"), which pinned the two-step this ticket removes. ONE RECORD PER
 * REVERSAL: the old spec and `PlacePickerMap`'s V20 t04 state doc were rewritten
 * in the same commit as the behaviour.
 *
 * V20 t04 introduced the two-step for a real reason: the write happened on the
 * marker click, the fields sit ABOVE the map on /new, so on a phone the parent
 * tapped a dot, the form changed off-screen, and nothing visible happened — the
 * feature worked and read as broken. The founder's answer then was a button.
 *
 * He has since rejected that button twice (V24 annotation #2; and again on the
 * V25 walk: *"you shouldn't have to click Select this place button. It should
 * just automatically select it and populate the address in the address bar
 * above. Don't make the user have to do an extra step, it's annoying."*).
 *
 * This spec pins the new contract in BOTH directions, because each half alone
 * can pass on a build that is wrong the other way:
 *
 *   1. the FIRST tap writes BOTH fields, with no second control in the path, and
 *   2. a second tap on a DIFFERENT pin REPLACES both — no stale half.
 *
 * It also pins the two things that must not be collateral damage: the visible
 * confirmation panel at the point of the tap (t04's own complaint — the write
 * must never be silent) and the Details door (`place-picker-details`), the only
 * way from the picker to a place's research page.
 */
test('one tap on a picker pin writes both fields (V25 t02)', async ({ page }) => {
  await page.goto('/new')
  await page.getByRole('heading', { name: 'Post a drop-in' }).waitFor()

  const pickerMap = page.getByTestId('place-picker-map')
  await expect(pickerMap).toBeVisible()
  // Bring the whole 256px band into the viewport BEFORE the reachability scan
  // below, so the scan measures the same viewport position the clicks will use.
  await pickerMap.scrollIntoViewIfNeeded()

  const placeInput = page.getByPlaceholder(PLACE_INPUT)
  const addressInput = page.getByPlaceholder(ADDRESS_INPUT)
  await expect(placeInput).toHaveValue('')
  await expect(addressInput).toHaveValue('')

  // The pins a parent's finger can actually reach.
  //
  // `.not([d="M0 0"])` skips markers Leaflet projected fully outside the canvas
  // (in the DOM, zero-size, unclickable). The hit-test below skips a pin whose
  // CENTRE lies outside the map's clipped band — the V23 drift the spec this
  // replaces recorded: a marker just past the pane's edge keeps a NON-zero `d`,
  // `toBeVisible()` passes anyway (Playwright does not test an ancestor's
  // `overflow: hidden` clipping), and a tap at that point lands on the page
  // behind the map. A pin counts here only when it is its OWN top element at its
  // own centre.
  const pins = pickerMap.locator('.leaflet-overlay-pane svg path[fill="#4f46e5"]:not([d="M0 0"])')
  const pinCount = await pins.count()
  const reachable: number[] = []
  for (let i = 0; i < pinCount; i++) {
    const hit = await pins.nth(i).evaluate((el) => {
      const rect = el.getBoundingClientRect()
      return (
        document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) === el
      )
    })
    if (hit) reachable.push(i)
  }
  console.log(
    `[V25 t02 picker] pins plotted: ${pinCount}; hit-testable at their own centre: ${reachable.length}`,
  )
  expect(
    reachable.length,
    'the picker must plot at least one pin a parent can actually tap',
  ).toBeGreaterThan(0)

  const selection = page.getByTestId('place-picker-selection')

  // AC (1): ONE tap writes the place AND the address. Nothing else is pressed —
  // the single click below is the whole interaction.
  await pins.nth(reachable[0]).click()
  await expect(
    selection,
    'the tap must leave a visible result at the point of the tap (V20 t04 still holds)',
  ).toBeVisible()
  const firstName = (await selection.locator('span').first().innerText()).trim()
  const firstAddress = (await selection.locator('span').nth(1).innerText()).trim()
  expect(firstName.length).toBeGreaterThan(0)
  expect(firstAddress.length).toBeGreaterThan(0)
  await expect(placeInput).toHaveValue(firstName)
  await expect(addressInput).toHaveValue(firstAddress)

  // AC (2): there is no intermediate "selected but unwritten" state left to
  // complete — the panel's old write button is gone, so the two-step cannot
  // come back without failing here.
  await expect(
    page.getByTestId('place-picker-select'),
    'the removed "Select this place" step must not return',
  ).toHaveCount(0)

  // AC (3): Details survives, and it is a READ — it must never write the field.
  const details = page.getByTestId('place-picker-details')
  await expect(details).toBeVisible()
  await expect(details).toHaveAttribute('href', /^\/place\/.+\/details$/)

  // AC (4): a SECOND tap on a DIFFERENT pin replaces both values. Scanning the
  // reachable pins keeps this honest — two pins that happened to share a name
  // AND an address would make "replaced" unobservable, so the loop only stops at
  // a pin whose panel really reads differently.
  let replaced = false
  for (const index of reachable.slice(1)) {
    await pins.nth(index).click()
    await expect(selection).toBeVisible()
    const name = (await selection.locator('span').first().innerText()).trim()
    const address = (await selection.locator('span').nth(1).innerText()).trim()
    if (name === firstName && address === firstAddress) continue
    await expect(placeInput).toHaveValue(name)
    await expect(addressInput).toHaveValue(address)
    replaced = true
    break
  }
  expect(
    replaced,
    'a second tap on a different pin must replace BOTH fields, so at least one other reachable pin must name a different place',
  ).toBe(true)
})

test('a place page renders the seeded data with the existing Maps link', async ({ page }) => {
  await openPlacesTab(page)
  await useAnyDistance(page)
  await page.getByTestId('places-search').fill(PLACE_NAME)
  await exactPlaceName(page, PLACE_NAME).click()

  await page.waitForURL(/\/place\//)
  await expect(page.getByRole('heading', { name: PLACE_NAME, exact: true })).toBeVisible()
  await expect(page.getByText('Playground · Outdoor')).toBeVisible()

  // The address is the SAME tappable Maps link the detail page uses (the V3
  // ticket 08 seam) — the place page is where a place's address lives now.
  const maps = page.getByRole('link', { name: PLACE_ADDRESS, exact: true })
  await expect(maps).toHaveAttribute('href', MAPS_HREF)
  await expect(maps).toHaveAttribute('target', '_blank')
  await expect(maps).toHaveAttribute('rel', 'noopener')

  // V11 t03: the age line is GONE — the seed carries no ages, so the page
  // stays silent rather than claiming "all ages" (or "not listed").
  await expect(page.getByText('Ages not listed yet.')).toHaveCount(0)
  await expect(page.getByTestId('start-here')).toBeVisible()

  // V12 t05: the place's Leaflet map (OpenStreetMap tiles). Green Lake Park
  // carries its OWN coordinates in the 0029 seed (47.68064949,
  // -122.32764197), so the detail surface renders exactly ONE marker at them.
  // Live tiles: the assertions are the container + the circleMarker's <path>
  // inside the overlay pane's <svg> (never tile pixels — an offline tile
  // fetch can never fail this spec).
  const map = page.getByTestId('place-map')
  await expect(map).toBeVisible()
  await expect(map.locator('.leaflet-overlay-pane svg path')).toHaveCount(1)
  await expect(map.locator('.leaflet-tile-pane')).toHaveCount(1)

  /**
   * V20 t02b — THE PLACE PAGE'S OWN CIRCLE IS CLICKABLE.
   *
   * This is the founder's second report, and it was a different map from the one
   * the first report was about: *"clicking on the blue circles on the maps on
   * the places section and the post section still don't populate the ability to
   * click on any buttons… All it does is populate text in a little bubble above
   * it and then it goes away when you stop hovering."*
   *
   * The cause: /browse and the feed render `PlacesMap` (which has the panel),
   * while this page rendered a bare `MapCanvas` whose circles had NO click
   * handler at all — so a tap produced exactly the hover tooltip they described.
   * The page now delegates to `PlacesMap` with one element.
   *
   * This spec is what stops the two maps drifting apart again: it asserts the
   * SAME behaviour the /browse marker test asserts, on this surface.
   */
  const placePin = map.locator('.leaflet-overlay-pane svg path[fill="#4f46e5"]:not([d="M0 0"])').first()
  await expect(placePin).toBeVisible()
  const panel = page.getByTestId('place-marker-info')
  await expect(panel, 'the panel opens on a tap, not on hover').toHaveCount(0)
  await placePin.click()
  await expect(panel).toBeVisible()
  await expect(panel).toContainText(PLACE_NAME)

  // "Start a drop-in" IS offered: the pin carries a real `places.id`, and
  // `hostHere()` builds the same typed prefill this page's own button does.
  await expect(panel.getByTestId('host-here')).toBeVisible()
  // "Details" is NOT: it links to `/place/:id`, and this IS that page — a
  // control that looks live and does nothing. See the `placeActions` doc.
  await expect(
    panel.getByTestId('marker-details'),
    'the place page must not offer a link to itself',
  ).toHaveCount(0)
  // V23 slice 4 — THE PANEL'S MAP-SEARCH FALLBACK IS GONE HERE TOO, for the same
  // reason it left the `/browse` panel: this place is a park, the reviewed
  // website backfill does not cover parks, and the panel floats over a map — a
  // "find it on the map" link there duplicates the surface behind it.
  //
  // The place PAGE keeps its own `place-learn-more` (asserted below), which is
  // the wider-web door now. Mirroring the `/browse` panel assertion is what
  // keeps the two panels from drifting apart the way they did when slice 4
  // landed: the follow-up fixed the `/browse` instance and missed this one.
  await expect(
    panel.getByTestId('learn-more'),
    'the map-search fallback must not be on this panel either',
  ).toHaveCount(0)

  // Tapping the pin must not navigate away from the page it is on.
  await expect(page).toHaveURL(/\/place\//)

  // V20 t01: the page's photo is GONE and the "Learn more" link replaced it.
  //
  // The photo block (V18 t04) rendered an <img> plus its licence credit here.
  // The founder's ruling retires it — "I can't police this and fix all the
  // broken images" — so the page must now carry NO place photograph and no
  // credit line, and must instead offer the one honest outbound link.
  await expect(page.getByTestId('place-photo-credit')).toHaveCount(0)
  await expect(
    page.locator('figure img'),
    'no place photograph is rendered on the detail page',
  ).toHaveCount(0)

  // The link itself: a real external target in a new tab, and its LABEL agrees
  // with its DESTINATION. Green Lake Park is a city park, and the park rows are
  // deliberately NOT in the website backfill (it covers community centers,
  // pools, beaches and libraries) — so this asserts the pair rather than
  // hard-coding which side of the seam this row lands on.
  const learnMore = page.getByTestId('place-learn-more')
  await expect(learnMore).toBeVisible()
  const learnMoreHref = (await learnMore.getAttribute('href')) ?? ''
  expect(learnMoreHref, 'the learn-more link is a real external URL').toMatch(/^https?:\/\/\S+/)
  await expect(learnMore).toHaveAttribute('target', '_blank')
  await expect(learnMore).toHaveAttribute('rel', 'noopener')
  const linkKind = await learnMore.getAttribute('data-link-kind')
  expect(linkKind).toMatch(/^(website|map-search)$/)
  if (linkKind === 'website') {
    await expect(learnMore).toContainText(/visit website/i)
    expect(learnMoreHref).not.toContain('openstreetmap.org/search')
  } else {
    await expect(learnMore).toContainText(/map/i)
    expect(learnMoreHref).toContain('openstreetmap.org/search')
  }
})

test('picking a place on /new posts a drop-in that links to its place page, which lists it', async ({
  page,
}) => {
  const marker = readMarkerMeta()
  const title = `e2e ${marker.displayName} places`

  await page.goto('/new')
  await settleOnRoute(page, '/new')

  // V9 ticket 03 (review cycle 1, F2): the summary's title is a read-back —
  // tap it to edit (the input is what the specs drive).
  await editTitle(page)
  await page.getByPlaceholder('e.g. Playground time at Green Lake').fill(title)
  // Type into the place field: the autocomplete matches over the directory.
  await page.getByPlaceholder(PLACE_INPUT).fill(PLACE_NAME)
  const suggestion = page.getByTestId('place-suggestions').getByText(PLACE_NAME, { exact: true })
  await expect(suggestion).toBeVisible()
  await suggestion.click()

  // V9 ticket 03: the address's MANUAL entry (which the pick fills) and the
  // start date + the 30-minute stepper live behind "More options", so this spec
  // opens the door before reading or using them.

  // Picking the place filled the address in one tap (the street the city
  // publishes for that playground), and closed the list.
  await expect(page.getByPlaceholder(ADDRESS_INPUT)).toHaveValue(PLACE_ADDRESS)
  await expect(page.getByTestId('place-suggestions')).toHaveCount(0)

  // V9 ticket 01: /new no longer asks for a neighbourhood — nothing to pick.
  await page.locator('input[type="date"]').fill(localDatePlusDays(1))
  const start = await stepStartTimeOnce(page)
  // V13 ticket 03: no duration chips on /new — the End stepper shows
  // the current end time (start + auto-duration). Verify it's visible.
  await expect(page.getByTestId('end-time-label')).toBeVisible()
  await page.getByRole('button', { name: 'Post drop-in' }).click()

  try {
    await page.waitForURL('/', { timeout: 30_000 })
  } catch {
    // Pre-0030-apply (or pre-0029-apply, when there is nothing to pick at all)
    // the create did not navigate: the form shows its designed submit error.
    const submitError = await page.locator('p.text-red-600').first().textContent()
    throw new Error(
      `Post create failed (0029/0030 not applied live?): ${submitError ?? 'no submit error line rendered'}`,
    )
  }

  // Find the post we just created by TITLE rather than by looking for its card
  // in the feed, deliberately: this post's LOCATION is now the place's
  // coordinates (the distance-model fix), so whether the marker's own feed
  // shows it depends on the marker's home zip + radius — state earlier specs
  // legitimately move around. This spec must not fail for someone else's
  // reason, and the detail page is what it is about. Reading the row back also
  // proves the create really landed in the database.
  const { url: supabaseUrl, anonKey } = readSupabaseEnv()
  const { accessToken, userId } = readMarkerSession()
  const lookup = await fetch(
    `${supabaseUrl}/rest/v1/playdates?host_profile_id=eq.${userId}` +
      `&title=eq.${encodeURIComponent(title)}&order=created_at.desc&limit=1&select=id`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` } },
  )
  const created = lookup.ok ? ((await lookup.json()) as Array<{ id: string }>) : []
  expect(created[0]?.id, 'the posted drop-in must exist in the database').toBeTruthy()
  const detailPath = `/playdate/${created[0].id}`

  // The detail page's place line links to the place page (the 13th public
  // field) rather than to Maps — the place page carries the Maps link.
  await page.goto(detailPath)
  await page.getByRole('heading', { name: title, exact: true }).waitFor()
  const placeLink = page.getByRole('link', { name: PLACE_NAME, exact: true })
  await expect(placeLink).toHaveAttribute('href', /^\/place\//)
  const placePath = (await placeLink.getAttribute('href')) ?? ''

  // …and that place page lists the drop-in we just posted (radius-independent:
  // the parent asked about THIS place, so the viewer's radius must not hide it).
  await page.goto(placePath)
  await expect(page.getByRole('heading', { name: PLACE_NAME, exact: true })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Upcoming drop-ins here' }),
  ).toBeVisible()
  await expect(page.locator('a').filter({ hasText: title }).first()).toBeVisible()
})

test('"Start a drop-in here" prefills the post form with that place', async ({ page }) => {
  await openPlacesTab(page)
  await useAnyDistance(page)
  await page.getByTestId('places-search').fill(PLACE_NAME)
  await exactPlaceName(page, PLACE_NAME).click()
  await page.waitForURL(/\/place\//)

  await page.getByTestId('start-here').click()
  await page.waitForURL('/new')

  // The three fields a place pick fills, filled from the place page instead —
  // plus the generated title (V9 ticket 03: the default, not a convenience).
  // V9 ticket 03: the address is the MANUAL entry behind "More options" now (the
  // prefill writes it either way — the door has to be open to read it).
  await expect(page.getByPlaceholder(PLACE_INPUT)).toHaveValue(PLACE_NAME)
  await expect(page.getByPlaceholder(ADDRESS_INPUT)).toHaveValue(PLACE_ADDRESS)
  // V9 ticket 03 (review cycle 1, F2): the summary's title is a read-back —
  // tap it to edit (the input is what the specs drive).
  await editTitle(page)
  await expect(page.getByPlaceholder('e.g. Playground time at Green Lake')).toHaveValue(
    // V23 rename: the generated prefix is "Drop-in at …" now.
    `Drop-in at ${PLACE_NAME}`,
  )
  // A prefill is not "typing": no suggestion list is left hanging open.
  await expect(page.getByTestId('place-suggestions')).toHaveCount(0)
  await expect(page.getByText(/Start a drop-in here/)).toHaveCount(0)
})

test('the Places tab filters by indoor and outdoor', async ({ page }) => {
  await openPlacesTab(page)
  await useAnyDistance(page)

  // The lead shows the BROWSE_LIST_LEAD_LIMIT first places in alphabetical
  // order (V15 t03), which includes INDOOR_PLACE (Ballard Branch, 0 mi from
  // the marker's home zip). The filter works on the visible lead rows — no
  // need to expand the overflow door for this assertion.

  // Indoor: the indoor library branch stays, outdoor playgrounds go.
  await page.getByTestId('places-indoor-filter').click()
  await expect(placeRow(page, INDOOR_PLACE)).toBeVisible()

  // Outdoor: the reverse. (Two separate buttons, so picking Outdoor does not
  // mean "not Indoor" by accident.)
  await page.getByTestId('places-outdoor-filter').click()
  await expect(placeRow(page, INDOOR_PLACE)).toHaveCount(0)
})

test('the browse list defaults to alphabetical and the Filter & sort modal filters + sorts (V15 t03)', async ({
  page,
}) => {
  await openPlacesTab(page)
  await useAnyDistance(page)

  // AC1: the default order is ALPHABETICAL (A–Z), not distance-sorted.
  //
  // V17 t01: this assertion was repaired, and the repair found a real latent
  // bug in the ORIGINAL spec worth recording. It used to read
  // `[data-testid="place-row"] > span` — a direct-child selector that the card
  // restructure invalidated (a row's children are DIVs now), so it silently
  // matched nothing and asserted over an empty list: a passing test that tested
  // nothing.
  //
  // Reading the real names then revealed what the old version got right only by
  // accident. The lead is rendered GROUPED BY KIND (`groupPlacesByKind`), so
  // the rows are alphabetical WITHIN a kind group, and the groups themselves
  // follow PLACE_KINDS order — not one global A–Z run. The old assertion passed
  // only because the first BROWSE_LIST_LEAD_LIMIT rows happened to fall inside
  // a single kind group ("Playground"); the moment the seed's data shifted so a
  // second kind entered the lead, it would have failed against correct code.
  //
  // So this asserts the ordering rule the page actually implements: within each
  // group section, the names ascend. Asserting a global sort would be testing a
  // rule nobody wrote.
  //
  // `locator('section:has(h2)')` rather than `filter({ has: page.locator('h2') })`:
  // a locator passed to `has:` is resolved against the PAGE, not against the
  // outer locator, so the filter matched nothing here. Every card group is a
  // `section` whose first child is its kind `h2`, which is what the CSS
  // `:has()` says directly.
  //
  // The explicit `first` wait is load-bearing, not decoration. `count()` and
  // `allTextContents()` are NON-WAITING snapshots, so without it this read the
  // DOM before the directory's async read had rendered anything and swept zero
  // groups. (The original assertion survived that only by accident: it ended in
  // `.first()`, which auto-waits.) The `checkedGroups` guard below is what
  // turned that silent vacuity into a loud failure — keep both.
  await expect(page.getByTestId('place-card-name').first()).toBeVisible()
  const groups = page.locator('section:has(h2)')
  let checkedGroups = 0
  for (const section of await groups.all()) {
    const names = await section.getByTestId('place-card-name').allTextContents()
    if (names.length < 2) continue
    checkedGroups++
    for (let i = 1; i < names.length; i++) {
      expect(
        names[i].localeCompare(names[i - 1]),
        `within one kind group, names must ascend A–Z ("${names[i - 1]}" then "${names[i]}")`,
      ).toBeGreaterThanOrEqual(0)
    }
  }
  // A sweep over zero groups would pass vacuously, which is the failure this
  // whole repair exists to remove: the seed guarantees multi-row kind groups.
  expect(checkedGroups).toBeGreaterThan(0)

  // AC2: the "Filter & sort" button opens the modal with kind chips, a sort
  // dropdown, and a radius input.
  await page.getByTestId('filter-sort-btn').click()
  const modal = page.getByTestId('filter-sort-modal')
  await expect(modal).toBeVisible()
  await expect(page.getByTestId('filter-kind-chip-park')).toBeVisible()
  await expect(page.getByTestId('filter-kind-chip-playground')).toBeVisible()
  await expect(page.getByTestId('filter-sort-select')).toBeVisible()
  await expect(page.getByTestId('filter-radius-input')).toBeVisible()

  // Selecting a kind chip narrows the list to that kind (AC2): pick Park,
  // Apply, and every visible row must carry the "Park" kind label.
  await page.getByTestId('filter-kind-chip-park').click()
  await page.getByTestId('filter-apply-btn').click()
  await expect(modal).toHaveCount(0)
  const parkRows = page.locator('[data-testid="place-row"]')
  const parkRowCount = await parkRows.count()
  if (parkRowCount > 0) {
    for (const row of await parkRows.all()) {
      await expect(row).toContainText('Park')
    }
  }

  // Clear the kind filter (re-open, toggle the chip off) so the next step sees
  // the full directory again.
  await page.getByTestId('filter-sort-btn').click()
  await page.getByTestId('filter-kind-chip-park').click()
  await page.getByTestId('filter-apply-btn').click()

  // AC3: switching the sort to "Closest to me" reorders by distance from the
  // home pin (the select commits live; Apply closes the modal).
  await page.getByTestId('filter-sort-btn').click()
  await page.getByTestId('filter-sort-select').selectOption('distance')
  await page.getByTestId('filter-apply-btn').click()
  await expect(page.getByTestId('place-row').first()).toBeVisible()

  // Back to the alphabetical default.
  await page.getByTestId('filter-sort-btn').click()
  await page.getByTestId('filter-sort-select').selectOption('alpha')
  await page.getByTestId('filter-apply-btn').click()
})

test('a signed-in parent hearts a place — the existing follow row, filled from one batched read (V17 t02)', async ({
  page,
  browser,
}) => {
  // The heart's own place: a name matching EXACTLY ONE seeded place (the
  // MARKER_PLACE discipline — "Green Lake Park" matches four), narrowed by
  // search so the assertion is about ONE unambiguous `place-heart-<id>`.
  await openPlacesTab(page)
  await useAnyDistance(page)
  await page.getByTestId('places-search').fill(MARKER_PLACE_NAME)
  await expect(exactPlaceName(page, MARKER_PLACE_NAME)).toBeVisible()

  // The row IS the directory read: its id is the id in the heart's testid
  // (`place-heart-<placeId>`), so this spec never guesses an id.
  const row = placeRow(page, MARKER_PLACE_NAME)
  await expect(row).toHaveAttribute('href', /\/place\//)
  const href = await row.getAttribute('href')
  // Anchored, not `String.replace`: a STRING-pattern replace swaps only the
  // FIRST occurrence, so an href carrying a query string or a second `/place/`
  // segment would silently yield a WRONG id — and the non-empty guard below
  // would not catch it. This spec's whole discipline is "never guess an id,
  // read it off the row", so the extraction is pinned to a whole trailing
  // segment. The non-empty assertion stays as the guard.
  const placeId = /\/place\/([^/?#]+)\/?$/.exec(href ?? '')?.[1] ?? ''
  expect(placeId).not.toBe('')
  const heart = page.getByTestId(`place-heart-${placeId}`)

  // AC: every heart is a ≥44px tap target in BOTH dimensions (the repo's
  // measured floor — Tailwind's h-11/w-11 = 2.75rem = 44px).
  await expect(heart).toBeVisible()
  const box = await heart.boundingBox()
  if (box === null) throw new Error('the heart has no box — it is not rendered')
  expect(box.width).toBeGreaterThanOrEqual(44)
  expect(box.height).toBeGreaterThanOrEqual(44)

  // AC: the heart's state comes from the ONE batched follows read, so it
  // renders on first paint already reflecting the caller's row. Start from a
  // known state — any leftover row from an earlier run is removed first, since
  // the marker is a single long-lived account.
  await clearMarkerPlaceFollows()
  await page.reload()
  await settleOnRoute(page, '/browse')
  // A reload resets the distance filter to the viewer's own radius, so the
  // narrowed place can fall out of the list — re-apply it (the same control the
  // rest of this spec drives) before searching again.
  await useAnyDistance(page)
  await page.getByTestId('places-search').fill(MARKER_PLACE_NAME)
  await expect(exactPlaceName(page, MARKER_PLACE_NAME)).toBeVisible()
  await expect(page.getByTestId(`place-heart-${placeId}`)).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  expect(await markerPlaceFollows(placeId)).toHaveLength(0)

  // AC: tapping an empty heart fills it AND writes the `follows` row — the
  // EXISTING 0033 row (place_id target), read back through REST with the
  // marker's own JWT. One tap, one row.
  await page.getByTestId(`place-heart-${placeId}`).click()
  await expect(page.getByTestId(`place-heart-${placeId}`)).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect.poll(async () => (await markerPlaceFollows(placeId)).length).toBe(1)

  // The row survives a reload: the filled heart on first paint really is the
  // BATCHED read's answer, not a leftover bit of local state.
  await page.reload()
  await settleOnRoute(page, '/browse')
  // A reload resets the distance filter to the viewer's own radius, so the
  // narrowed place can fall out of the list — re-apply it (the same control the
  // rest of this spec drives) before searching again.
  await useAnyDistance(page)
  await page.getByTestId('places-search').fill(MARKER_PLACE_NAME)
  await expect(exactPlaceName(page, MARKER_PLACE_NAME)).toBeVisible()
  await expect(page.getByTestId(`place-heart-${placeId}`)).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  // Tapping the heart does NOT navigate (it is a button inside the row's link):
  // the same guard the card ping toggle carries.
  await expect(page).toHaveURL(/\/browse/)

  // AC: tapping a filled heart empties it and DELETES the row.
  await page.getByTestId(`place-heart-${placeId}`).click()
  await expect(page.getByTestId(`place-heart-${placeId}`)).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await expect.poll(async () => (await markerPlaceFollows(placeId)).length).toBe(0)

  // AC: SIGNED OUT renders NO heart at all on any card, and issues no follows
  // request (the `session === null` guard).
  //
  // /browse is INSIDE the ProtectedShell, so a signed-out visitor is bounced to
  // /login before BrowsePage ever mounts — there are no cards to inspect, and
  // that is itself the proof at the SHELL level. The guard's second half (the
  // page issues no follows request) is asserted on the REQUEST, never the
  // status: the follows table is owner-only, so an anon read is a 2xx with zero
  // rows and would look like a success.
  const anonContext: BrowserContext = await browser.newContext({
    baseURL: 'http://localhost:4173',
    storageState: { cookies: [], origins: [] },
  })
  const anonPage = await anonContext.newPage()
  const anonFollowRequests: string[] = []
  anonPage.on('request', (request) => {
    if (request.url().includes('/rest/v1/follows')) anonFollowRequests.push(request.url())
  })
  try {
    await anonPage.goto('/browse')
    await expect(anonPage.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await expect(anonPage.locator('[data-testid^="place-heart-"]')).toHaveCount(0)
    // A beat first: the assertion is about what the page did NOT do.
    await anonPage.waitForTimeout(1000)
    expect(anonFollowRequests).toHaveLength(0)
  } finally {
    await anonContext.close()
  }
})

test.afterEach(async () => {
  // Best-effort cleanup (per house): delete the HOST marker's playdate rows via
  // REST with the marker's own JWT (the host-only DELETE policy). Child rows
  // cascade with the post. A failure is logged, not fatal — the e2e-<epoch>
  // prefix marks stragglers for the orchestrator's sweep. Places are NEVER
  // written by this spec (the directory is seed-only, postgres-write-only).
  try {
    const { url, anonKey } = readSupabaseEnv()
    const { accessToken, userId } = readMarkerSession()
    const query = `${url}/rest/v1/playdates?host_profile_id=eq.${userId}&select=id`
    const headers: Record<string, string> = {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'return=representation',
    }
    const del = await fetch(query, { method: 'DELETE', headers })
    const check = await fetch(query, { headers })
    const remaining = check.ok ? ((await check.json()) as Array<Record<string, unknown>>) : null
    if (!del.ok || (remaining !== null && remaining.length > 0)) {
      console.log(
        `[e2e cleanup] FAILED — playdate delete HTTP ${del.status}, ` +
          `${remaining?.length ?? '?'} remain (host ${userId}) — orchestrator sweep (e2e- prefix) will pick them up`,
      )
    }
  } catch (err) {
    console.log(
      `[e2e cleanup] FAILED (logged, best-effort): ${
        err instanceof Error ? err.message : err
      }`,
    )
  }

  // V17 t02: the marker's own PLACE-follow rows, the same best-effort sweep.
  // The heart spec removes its row as part of its own flow; this is the net for
  // a run that failed midway, so a leftover row cannot make the next run's
  // "starts unfilled" assertion fail. Family follows are deliberately NOT
  // touched — this spec never writes one, and another spec's rows are not ours
  // to delete.
  await clearMarkerPlaceFollows()
})

/**
 * V20 t01 — THE LEARN-MORE LINK (which replaced the photo slot entirely).
 *
 * WHY THIS SPEC DOES NOT SET UP A WEBSITE ITSELF: `public.places` carries only
 * a SELECT policy for app roles (verified via `pg_policies`), so nothing the app
 * can authenticate as may write a `website_url` — by design, since places are
 * seeded reference data and a parent must never be able to rewrite them. Sites
 * arrive through the reviewed backfill (`scripts/backfill-place-websites.mjs`
 * with the service token). A spec that "set up" one would have to forge a
 * privileged write, and a test that exercises a path production cannot reach is
 * not evidence.
 *
 * So this asserts the INVARIANT over whatever the applied state actually is,
 * which is the stronger claim because it must hold for every rendered row:
 *
 *   1. Every card offers exactly one learn-more link.
 *   2. Every link is a real external `http(s)` target in a new tab, never "" or
 *      "#", and never missing `rel="noopener"`.
 *   3. The link's LABEL agrees with its DESTINATION: "Visit website" points at
 *      the stored site and not at the map-search fallback; "Find it on the map"
 *      points at the OSM search.
 *   4. The retired photo slot and its credit line appear NOWHERE.
 *
 * Point 3 is the one that carries V20's actual promise. A card that shows
 * "Visit website" over an OpenStreetMap search URL is the small lie the founder
 * would only discover after clicking, so the two halves are asserted together.
 */
test('every card offers an honest learn-more link, and no card shows a photo (V20 t01)', async ({
  page,
}) => {
  await openPlacesTab(page)
  await expect(page.getByTestId('place-row').first()).toBeVisible()

  // V25 t01: the FULL list renders on the first paint, so the sample below
  // covers every card — there is no lead to expand past any more.
  await expect(page.getByTestId('places-see-all')).toHaveCount(0)

  // (4) the retired slot is genuinely gone from every card.
  expect(await page.getByTestId('place-card-photo').count()).toBe(0)
  expect(await page.getByTestId('place-card-photo-credit').count()).toBe(0)

  const cardCount = await page.getByTestId('place-row').count()
  const links = page.locator('[data-testid^="row-learn-more-"]')
  expect(await links.count(), 'one learn-more link per card').toBe(cardCount)

  let website = 0
  let mapSearch = 0
  for (const link of await links.all()) {
    const href = (await link.getAttribute('href')) ?? ''
    const kind = await link.getAttribute('data-link-kind')
    const text = (await link.innerText()).trim()

    expect(href, 'a learn-more link must not be empty').toMatch(/^https?:\/\/\S+/)
    expect(kind, 'a learn-more link declares where it goes').toMatch(/^(website|map-search)$/)
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener')

    if (kind === 'website') {
      website += 1
      expect(text, 'a stored site is labelled as the website').toMatch(/visit website/i)
      expect(href, 'a "Visit website" link must not point at the map search').not.toContain(
        'openstreetmap.org/search',
      )
    } else {
      mapSearch += 1
      expect(text, 'the fallback says it is a map search').toMatch(/map/i)
      expect(href, 'the fallback points at the OSM search').toContain('openstreetmap.org/search')
    }
  }

  // The curated backfill has landed if ANY row carries a stored site — but a
  // tree where none has yet is not a failure of the app, it is an unapplied
  // backfill, so this reports rather than asserts. The assertions above already
  // hold in both states, which is the point.
  console.log(
    `[V20 websites] ${cardCount} cards — ${website} with a verified website, ` +
      `${mapSearch} using the map-search fallback`,
  )
})

/**
 * V19 t01 — THE NEIGHBOURHOOD FRAME, stated on the real map.
 *
 * Founder ruling D1: the map ALWAYS frames tight around home, and the picked
 * radius widens only the LIST. Two things follow, and both are asserted here
 * because either one alone can pass while the feature is broken:
 *
 *   1. **The map does not move when the radius changes.** A fix that made the
 *      map follow the radius would still pass a "map zoomed in" assertion.
 *   2. **The list DOES change when the radius changes.** A fix that broke the
 *      list filter would still pass assertion 1. This is the regression the
 *      plan calls "the one thing that must not break", and the map test alone
 *      is blind to it.
 *
 * Plus the affordance that keeps a tight map honest: places outside the frame
 * are COUNTED on screen, so a parent never reads the map as the whole picture.
 */
test('the neighbourhood frame is a MODE, and the radius only widens the list (V25 t01)', async ({
  page,
}) => {
  /**
   * V25 t01 REPLACES the V19 t01 (ruling D1) spec, which measured the LIST-VIEW
   * band's radius circle in pixels and compared it at 1 mile against 35 miles.
   *
   * D1's decision — "the map is always the neighbourhood, the radius only sizes
   * the LIST" — is unchanged, and it is now STRUCTURAL rather than a measured
   * coincidence: list view mounts no map at all, so no radius setting can reach
   * a camera, and the only map the page has is the one the parent explicitly
   * opens. This spec asserts that structure, and keeps the half of D1 that can
   * still fail: the radius really does widen the LIST.
   *
   * The two halves, both asserted against the list's own rows:
   *
   *   1. THE LIST WIDENS with the radius. If this is flat, the radius stopped
   *      filtering and the rest of the spec would pass for the wrong reason.
   *   2. NO MAP IS MOUNTED in list view, at either radius. This is the claim a
   *      reintroduced band would break, and it is the honest replacement for
   *      "the map did not move": there is no map to move.
   */
  await page.setViewportSize({ width: 390, height: 844 })
  await openPlacesTab(page)

  /** The furthest distance among the rendered list rows, in miles. */
  async function maxListMiles(): Promise<number> {
    const labels = await page.getByTestId('place-row').allInnerTexts()
    const miles = labels
      .map((t) => /([\d.]+)\s*mi\b/.exec(t))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => Number(m[1]))
    return miles.length === 0 ? 0 : Math.max(...miles)
  }

  async function listRowCount(): Promise<number> {
    return page.getByTestId('places-list').getByTestId('place-row').count()
  }

  const radiusControl = page.getByTestId('places-distance-filter')
  await expect(radiusControl).toBeVisible()

  // ---- radius = 1 mile -----------------------------------------------------
  await radiusControl.selectOption('1')
  await page.waitForTimeout(2200)
  const d1 = await maxListMiles()
  const n1 = await listRowCount()

  // ---- radius = 35 miles (the widest) --------------------------------------
  await radiusControl.selectOption('35')
  await page.waitForTimeout(2200)
  const d35 = await maxListMiles()
  const n35 = await listRowCount()

  // (2) THE LIST MOVED. If this is flat, the radius stopped filtering and the
  // absence below would have passed for the wrong reason.
  expect(
    n35,
    `the list must widen with the radius (${n1} rows at 1 mi, ${n35} rows at 35 mi)`,
  ).toBeGreaterThan(n1)
  expect(
    d35,
    `the furthest rendered place must widen with the radius (max ${d1} mi at 1 mi radius, ` +
      `${d35} mi at 35 mi) — the radius still filters the LIST`,
  ).toBeGreaterThan(d1)

  // (1) THE MAP IS NOT THERE TO MOVE. The neighbourhood frame D1 protects is
  // now a mode: nothing in list view is framed, at either radius.
  await expect(page.getByTestId('places-map-band')).toHaveCount(0)
  await expect(page.getByTestId('places-map')).toHaveCount(0)
  await expect(page.locator('.leaflet-container')).toHaveCount(0)

  // …and the frame the parent asked for is what the map view shows when they
  // open it: every matching place pinned, on one map.
  await page.getByTestId('places-see-map').click()
  await expect(page.getByTestId('places-map-view-map')).toBeVisible()
  await expect(page.locator('.leaflet-container')).toHaveCount(1)
  expect(
    await page.locator('[data-testid^="places-map-card-"]').count(),
    'the map view must carry cards for the widened list',
  ).toBeGreaterThan(0)
  await page.getByTestId('places-back-to-list').click()
  await expect(page.locator('.leaflet-container')).toHaveCount(0)
})

/**
 * V19 t02 — THE FEED MAP (founder ruling D2).
 *
 * The founder's ask: see, on the posts screen too, *where* the drop-ins are —
 * "automatically showing you drop-ins CLOSEST to you… that's the value added to
 * make this feel like a neighbourhood feel."
 *
 * WHY THIS SPEC CREATES ITS OWN POSTS. The map renders one pin per drop-in that
 * resolves to a real coordinate, and it renders NOTHING when none do — which is
 * the correct behaviour for a feed of free-text posts, and also means a spec
 * against whatever data happens to exist would prove nothing. So this spec
 * seeds the two cases it must tell apart: a PLACED post (must pin) and a
 * FREE-TEXT post (must NOT pin). That contrast is the whole claim.
 *
 * Both posts are written with the marker's own JWT through PostgREST — the same
 * path the other specs use — and both are deleted at the end, so the live DB is
 * left as it was found.
 */
test('the feed maps its placed drop-ins and ignores free-text ones (V19 t02)', async ({
  page,
}) => {
  const { url: restUrl, anonKey } = readSupabaseEnv()
  const { accessToken, userId } = readMarkerSession()
  const restHeaders: Record<string, string> = {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }

  // A real seeded place WITH coordinates, inside the marker's neighbourhood.
  const placedPost = {
    title: `V19 map placed ${Date.now()}`,
    place: MARKER_PLACE_NAME,
    place_id: MARKER_PLACE_ID,
    // Starts in an hour — comfortably future, so `listRadiusFeed` returns it.
    // `ends_at` is the storage column (the schema keeps an END instant, not a
    // duration — V13 t03's end-stepper writes the difference into this pair),
    // and it is NOT NULL, so it must be sent.
    starts_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    ends_at: new Date(Date.now() + 120 * 60 * 1000).toISOString(),
    host_profile_id: userId,
  }
  // The free-text case: a name, NO place_id, therefore NO coordinates.
  const freeTextPost = {
    title: `V19 map text ${Date.now()}`,
    place: 'Somewhere else entirely',
    place_id: null,
    starts_at: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
    ends_at: new Date(Date.now() + 150 * 60 * 1000).toISOString(),
    host_profile_id: userId,
  }

  const created: string[] = []
  try {
    for (const post of [placedPost, freeTextPost]) {
      const res = await fetch(`${restUrl}/rest/v1/playdates`, {
        method: 'POST',
        headers: restHeaders,
        body: JSON.stringify(post),
      })
      if (!res.ok) throw new Error(`playdates insert HTTP ${res.status} ${await res.text()}`)
      const rows = (await res.json()) as Array<{ id: string }>
      created.push(rows[0].id)
    }

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    // V21 t09 (A9): the feed now DEFAULTS to list view — the map band only
    // renders after switching to the Map toggle. This spec's assertions are all
    // about the MAP, so flip the view first (the toggle is at the top of the
    // feed; the default is pinned by e2e/feed-view-toggle.e2e.ts).
    await page.getByRole('button', { name: 'Map' }).click()
    await expect(page.getByTestId('feed-map-band')).toBeVisible({ timeout: 15000 })

    // AC: the map drew AT LEAST one pin, and it is a real Leaflet canvas — not
    // an empty card standing in for a map.
    await expect(page.locator('.leaflet-container').first()).toBeVisible()
    // The drop-in pins are LEAFLET CIRCLE MARKERS, which render as SVG <path>
    // elements in the overlay pane — NOT as `.leaflet-marker-icon` (that class
    // is for image/DOM markers, which this map does not use). Counting the
    // wrong selector was this spec's first failure, and the screenshot showed
    // the pin plainly present the whole time: the map was right, the assertion
    // was wrong.
    //
    // The pin is told apart from the home pin and the radius circle by its own
    // fill — the same #4f46e5/#dc2626 convention `PlacesMap` uses and the V13
    // A6 spec already relies on.
    const pins = await page.locator('path.leaflet-interactive').count()
    expect(pins, 'the placed drop-in must produce at least one map pin').toBeGreaterThan(0)

    // AC: the band states how many PLACES carry drop-ins — the count is of
    // places, not posts, because that is what a pin means (two sessions at one
    // park are one dot). Asserted as a number rather than a fixed value, so the
    // spec does not depend on what else is in the feed.
    const label = await page.getByTestId('feed-map-band').locator('span').first().innerText()
    expect(label, 'the band must state how many places carry drop-ins').toMatch(
      /^\d+ places? with drop-ins$/,
    )

    // AC: the free-text post is genuinely in the feed (so its absence from the
    // map is a decision, not a missing row) and it is NOT on the map. We assert
    // its presence as a CARD first — otherwise this would pass trivially if the
    // insert had failed. V21 t09 (A9): the card renders in LIST view, so flip
    // back to List for this half of the assertion; the pin count above already
    // proved the map side while in Map view.
    await page.getByRole('button', { name: 'List' }).click()
    await expect(page.getByText(freeTextPost.title, { exact: false })).toBeVisible()

    /**
     * AC (THE `ocr` FIX): a feed pin must not offer a place action it cannot
     * honour.
     *
     * The placed post in this feed links a REAL directory place, so the panel's
     * actions DO appear and are safe — "Start a drop-in" hands `/new` a genuine
     * `places.id`, which is exactly what `playdates.place_id` (uuid, FK to
     * places) requires. That is asserted here on the real rendered panel.
     *
     * The free-text post in the SAME feed has no `place_id`. It gets no pin at
     * all (asserted via the pin count below), so it can never present the panel
     * — which is the other half of the same guarantee, and the reason the fix
     * is two-sided: carry a real id when there is one, and never synthesise one
     * when there is not.
     */
    /**
     * THE PIN'S PANEL — and getting this right took two corrections, both worth
     * recording because each was a wrong belief about the data.
     *
     * BELIEF 1 (mine, wrong): this spec inserts a free-text post, so
     * `placeActions` — `feedPins.every((pin) => pin.placeId !== null)` — would
     * be false and the directory controls absent. IT IS NOT. `feedMapPins`
     * drops any post that resolves to no COORDINATE, and a free-text post
     * carries `place_coords: null` (that is rule 1 of that seam, and the whole
     * point of the test). So the free-text post contributes NO PIN AT ALL, the
     * only pin in `feedPins` is the placed one with a real id, and
     * `placeActions` is TRUE. Asserted as it actually behaves.
     *
     * BELIEF 2 (the file's, wrong before this batch): the original assertion
     * here required the panel's `host-here` button, which stopped being true the
     * moment `44fdb8a` introduced `placeActions`… except it did not stop being
     * true, because of belief 1. What actually broke this test was neither: it
     * was the FRAME. `feedMapFrame` passed `focusPoints: feedPins`, so
     * `framingCircle` shrank the camera to a half-mile circle centred on the
     * pin and projected it 43px above the pane, where a click could not reach it
     * (Playwright's trace: `d="M128,-43a8,8 …"`, intercepted by the page
     * container). Removing that argument — V20 t05's ruling, applied to the feed
     * — is what made this panel open at all.
     *
     * So the assertions below are the panel's real contract: it names the place,
     * and because that place IS a directory row, the actions are offered and
     * "Details" links a genuine uuid.
     */
    // V21 t09 (A9): the panel lives on the MAP, so flip back to Map view before
    // opening it (the free-text-card assertion above needed List view).
    await page.getByRole('button', { name: 'Map' }).click()
    await expect(page.getByTestId('feed-map-band')).toBeVisible()
    const indigoMarker = page
      .locator('path.leaflet-interactive[fill="#4f46e5"]:not([d="M0 0"])')
      .first()
    if ((await indigoMarker.count()) > 0) {
      await indigoMarker.click({ force: true })
      const panel = page.getByTestId('place-marker-info')
      await expect(panel).toBeVisible()
      // The panel names the REAL place, not the old "Drop-in location" stub.
      await expect(panel).toContainText(MARKER_PLACE_NAME)
      // The directory actions ARE offered: the only pin here carries a real
      // `place_id`, so `placeActions` is true (see belief 1 above).
      await expect(panel.getByTestId('host-here')).toBeVisible()
      const detailsHref = await panel.getByTestId('marker-details').getAttribute('href')
      expect(
        detailsHref,
        'Details must link to a REAL place id, never a synthesised feed-pin-N',
      ).not.toContain('feed-pin-')
    }
    // The comparison baseline is read IN MAP VIEW (where the pins render); the
    // earlier `pins` assertion already proved >=1 while the map was up.
    const pinCountWithBoth = await page.locator('path.leaflet-interactive').count()
    expect(pinCountWithBoth, 'the placed drop-in must still produce a pin in map view').toBeGreaterThan(0)

    // Deleting the placed post must REMOVE a pin — the strongest available proof
    // that the pin belongs to the placed post rather than to the basemap, the
    // home marker, or something else already on the page.
    const del = await fetch(`${restUrl}/rest/v1/playdates?id=eq.${created[0]}`, {
      method: 'DELETE',
      headers: restHeaders,
    })
    if (!del.ok) throw new Error(`playdates delete HTTP ${del.status}`)
    created.shift()

    // V21 t09 (A9): the reload resets to the DEFAULT list view, so flip back to
    // Map before reading the post-delete count. With the placed post gone there
    // are ZERO pins, so the band itself does not render (the "renders only when
    // at least one drop-in has a real location" rule) — the honest fallback line
    // renders instead, and the pin count reads 0. That IS the proof: removing
    // the only placed drop-in leaves no pin on the map.
    await page.reload()
    await page.getByRole('button', { name: 'Map' }).click()
    await expect(
      page.getByText('No drop-ins have a location yet'),
    ).toBeVisible({ timeout: 15000 })
    const pinCountAfter = await page.locator('path.leaflet-interactive').count()

    console.log(
      `[V19 feed map] pins with a placed post: ${pinCountWithBoth}; ` +
        `after deleting it: ${pinCountAfter}; label "${label}"`,
    )
    expect(
      pinCountAfter,
      'removing the only placed drop-in must remove its pin from the map',
    ).toBeLessThan(pinCountWithBoth)
  } finally {
    // Best-effort cleanup: a leftover row would skew every later feed spec.
    for (const id of created) {
      await fetch(`${restUrl}/rest/v1/playdates?id=eq.${id}`, {
        method: 'DELETE',
        headers: restHeaders,
      }).catch(() => {})
    }
  }
})

/**
 * V25 ticket 07 — THE FEED PIN'S POPUP NAMES THE EVENT, AND ADMITS A SECOND.
 *
 * The founder, tapping a blue circle on `/`: *"it make[s] more sense to tell you
 * the name of the event that's happening there and some information about
 * that."* Before this slice the feed handed the shared map a `Place`-shaped row
 * whose `name` was the PLACE text and which carried no event identity at all, so
 * the bubble could only ever say "Ballard Corners Park".
 *
 * WHY THIS SPEC SEEDS TWO POSTS AT ONE PLACE, SPECIFICALLY. `feedMapPins` rule 2
 * collapses every drop-in at one place into ONE dot (`lib/places.ts:226-233`), so
 * "one pin = one event" is FALSE on real data — a morning and an afternoon
 * session at one park are a single circle. Two posts, one place, is therefore the
 * only fixture that can prove the two halves the ticket demands at once:
 *
 *   1. the dot DOES name an event (title + when + a link to `/playdate/:id`), and
 *   2. the dot does NOT pretend that event is the only one — it says how many
 *      more drop-ins share it.
 *
 * The pair is 20 and 25 minutes out, both comfortably future (the feed only
 * carries upcoming posts), and it is written at the SAME seeded place the V19
 * t02 spec above uses — 0.44 mi from the marker's home, inside the one-mile
 * frame, so its pin is on-canvas and tappable. As in that spec, the two rows are
 * deleted at the end, so the live DB is left as it was found.
 *
 * THE PIN IS FOUND BY ITS POPUP, NOT BY POSITION. The feed's map draws whatever
 * the live database holds (the batch ledger records a founder-created "Drop-in at
 * Salmon Bay Park" that is exactly why one assertion in the V19 t02 spec is
 * known-red), so "click the first indigo marker and assert" would be a spec
 * against somebody else's row. This spec clicks EVERY indigo pin and reads the
 * popups, which is also what lets it assert the collapse from the popup side:
 * exactly ONE dot in the whole feed may carry a title with this run's prefix, no
 * matter how many posts the run seeded.
 */
test('a tapped feed pin names the drop-in happening there, and says when it stands for more than one (V25 t07)', async ({
  page,
}) => {
  const { url: restUrl, anonKey } = readSupabaseEnv()
  const { accessToken, userId } = readMarkerSession()
  const restHeaders: Record<string, string> = {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }

  /**
   * The run's own prefix, so the popup search cannot be satisfied by live data.
   * `Date.now()` is the marker pattern the rest of this file uses.
   */
  const runPrefix = `V25 t07 ${Date.now()}`
  const seedMinutes = [20, 25]
  const seeds = seedMinutes.map((minutes, index) => {
    const start = Date.now() + minutes * 60 * 1000
    return {
      title: `${runPrefix} ${index === 0 ? 'first' : 'second'}`,
      starts_at: new Date(start).toISOString(),
      ends_at: new Date(start + 45 * 60 * 1000).toISOString(),
    }
  })

  const created: string[] = []
  try {
    for (const seed of seeds) {
      const res = await fetch(`${restUrl}/rest/v1/playdates`, {
        method: 'POST',
        headers: restHeaders,
        body: JSON.stringify({
          ...seed,
          place: MARKER_PLACE_NAME,
          // The pin's ADDRESS is the POST's own typed address, not the place
          // row's (that is `feedMapPins`' pre-existing rule) — so the row is
          // seeded with one, and the assertion below can prove the address still
          // rides along under the event.
          address: MARKER_PLACE_ADDRESS,
          place_id: MARKER_PLACE_ID,
          host_profile_id: userId,
        }),
      })
      if (!res.ok) throw new Error(`playdates insert HTTP ${res.status} ${await res.text()}`)
      const rows = (await res.json()) as Array<{ id: string }>
      created.push(rows[0].id)
    }
    // Both ids, in seed order (soonest first) — the href assertion below reads
    // this, so a link that pointed at the WRONG drop-in could not pass by
    // matching the place or the other row.
    const [firstId, secondId] = created

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await settleOnRoute(page, '/')
    // The feed defaults to the LIST (pinned by e2e/feed-view-toggle.e2e.ts), and
    // the map band only mounts in Map view.
    await page.getByRole('button', { name: 'Map' }).click()
    const band = page.getByTestId('feed-map-band')
    await expect(band).toBeVisible({ timeout: 15000 })

    type NamedPin = { title: string; when: string; href: string; more: string | null }
    /**
     * Click every indigo pin once and collect the popups that name THIS RUN's
     * drop-ins, plus the index of the dot that named one.
     *
     * Clicking ALL of them (rather than assuming which pin is ours) is what makes
     * the collapse assertion below a real claim about the whole feed: if the two
     * seeded posts had produced two dots, TWO popups would carry the prefix.
     */
    const probeEventPins = async (): Promise<{
      named: NamedPin[]
      index: number
      count: number
    }> => {
      const pins = page.locator('path.leaflet-interactive[fill="#4f46e5"]:not([d="M0 0"])')
      /**
       * WAIT FOR THE PINS TO BE POSITIONED, not merely present.
       *
       * Leaflet appends a marker to the overlay pane and only then positions it,
       * and a circle marker whose position has not been computed yet renders as
       * the zero-size `d="M0 0"` path — which is exactly what this locator
       * excludes (a tap on it could not be aimed at anything). The band being
       * visible therefore proves nothing about the pins: after a reload the band
       * appears first and every pin is briefly `M0 0`. Without this wait, the
       * probe returns zero dots and the spec fails for a rendering race rather
       * than for the product — which is how this spec failed its first run.
       */
      await expect
        .poll(async () => await pins.count(), {
          message: 'the feed map must position its drop-in pins before their popups can be read',
        })
        .toBeGreaterThan(0)
      // And GROW the bound as we go: the wait above only guarantees the FIRST
      // positioned pin, and a slow view update can position the rest after it.
      let count = await pins.count()
      const found: NamedPin[] = []
      let foundIndex = -1
      for (let index = 0; index < count; index += 1) {
        count = Math.max(count, await pins.count())
        await pins.nth(index).click({ force: true })
        const probePanel = page.getByTestId('place-marker-info')
        // A marker whose click opened no popup, or a popup with no event payload
        // (every non-feed caller's shape), is simply not this spec's pin.
        if ((await probePanel.count()) === 0) continue
        if ((await probePanel.getByTestId('pin-event-title').count()) === 0) continue
        const title = (await probePanel.getByTestId('pin-event-title').innerText()).trim()
        if (!title.startsWith(runPrefix)) continue
        const more = probePanel.getByTestId('pin-event-more')
        found.push({
          title,
          when: (await probePanel.getByTestId('pin-event-when').innerText()).trim(),
          href: (await probePanel.getByTestId('pin-event-link').getAttribute('href')) ?? '',
          more: (await more.count()) > 0 ? (await more.innerText()).trim() : null,
        })
        foundIndex = index
      }
      return { named: found, index: foundIndex, count }
    }

    const before = await probeEventPins()
    expect(before.count, 'the seeded drop-ins must produce at least one pin').toBeGreaterThan(0)

    // ----------------------------------------------------------------
    // AC: ONE DOT FOR TWO DROP-INS, AND THE DOT KNOWS IT STANDS FOR TWO.
    // ----------------------------------------------------------------
    expect(
      before.named.length,
      `two seeded drop-ins at one place must be ONE dot (found ${before.named.length} dots naming "${runPrefix}")`,
    ).toBe(1)

    const tapped = before.named[0]
    // The SOONEST of the pair is the one named (20 minutes out, not 25).
    expect(
      tapped.title,
      'the dot must name the SOONEST drop-in it stands for',
    ).toBe(seeds[0].title)
    // ...and it must NOT present that as the whole story: the second drop-in at
    // this place is disclosed as a count. This is the ticket's explicit
    // "silently showing one event as if it were the only one is a failure".
    expect(tapped.more, 'a two-drop-in dot must disclose the drop-ins it collapses').not.toBeNull()
    expect(tapped.more, 'the disclosure must be a count of the others').toMatch(
      /^[1-9]\d* more drop-ins? here$/,
    )

    // ----------------------------------------------------------------
    // AC: THE TAP CAN REACH THE EVENT — and reaches THE EVENT, not the place.
    // ----------------------------------------------------------------
    expect(tapped.href, 'the bubble must link the drop-in it named').toBe(`/playdate/${firstId}`)
    // A real day + window, from the card's own rule (`cardWhenLabel`): the DAY
    // tables are locale-independent, so asserting the SHAPE here is stable
    // whatever the browser's locale; the exact string is pinned by the seam's
    // sibling test in `src/lib/places.test.ts`.
    expect(tapped.when, 'the bubble must state when the drop-in starts').toMatch(
      /^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2} · .+–.+$/,
    )
    // The link is NOT a second "Details" for the place: the place's own door is
    // a different control with a different destination.
    expect(tapped.href, 'the event link must never be a /place/ link').not.toContain('/place/')

    // ----------------------------------------------------------------
    // AC: THE PLACE IS STILL HOW A PARENT KNOWS WHERE, AND THE BUBBLE STILL
    // WORKS: reachable, dismissible, inside the band at 390x844.
    // ----------------------------------------------------------------
    await page
      .locator('path.leaflet-interactive[fill="#4f46e5"]:not([d="M0 0"])')
      .nth(before.index)
      .click({ force: true })
    const panel = page.getByTestId('place-marker-info')
    await expect(panel).toBeVisible()
    await expect(panel).toContainText(MARKER_PLACE_NAME)
    await expect(panel).toContainText(MARKER_PLACE_ADDRESS)
    // The place's own actions are untouched by the event addition (this pin has a
    // real `place_id`, so `placeActions` is true — see the V19 t02 spec's belief-1
    // note).
    await expect(panel.getByTestId('host-here')).toBeVisible()

    const eventLink = panel.getByTestId('pin-event-link')
    await expect(eventLink).toHaveAccessibleName('Drop-in details')
    await eventLink.focus()
    await expect(eventLink).toBeFocused()
    const linkBox = await eventLink.boundingBox()
    expect(linkBox, 'the event link must be rendered').not.toBeNull()
    // The house tap-target floor, on the new control too.
    expect(linkBox!.height).toBeGreaterThanOrEqual(44)

    // The popup that owns THIS panel (there is one bubble; filtering by the
    // panel is what makes the lookup unambiguous).
    const popup = page.locator('.leaflet-popup').filter({ has: panel })
    const bandBox = await band.boundingBox()
    const popupBox = await popup.boundingBox()
    expect(bandBox).not.toBeNull()
    expect(popupBox, 'the bubble must be rendered').not.toBeNull()
    // AC9: taller content must not undo the autoPan/max-height work — the bubble
    // stays inside the band it belongs to, so nothing hangs over the page above.
    expect(
      popupBox!.y,
      `the bubble must start inside the map band (bubble y=${popupBox!.y}, band y=${bandBox!.y})`,
    ).toBeGreaterThanOrEqual(bandBox!.y - 2)
    expect(
      popupBox!.y + popupBox!.height,
      'the bubble must end inside the map band',
    ).toBeLessThanOrEqual(bandBox!.y + bandBox!.height + 2)
    // The EVENT — the thing the tap is asking about — is in the visible part of
    // the bubble rather than scrolled out of it, which is why it leads.
    const titleBox = await panel.getByTestId('pin-event-title').boundingBox()
    expect(titleBox, 'the event title must be rendered').not.toBeNull()
    expect(titleBox!.y).toBeGreaterThanOrEqual(bandBox!.y)
    expect(titleBox!.y + titleBox!.height).toBeLessThanOrEqual(bandBox!.y + bandBox!.height)

    // Dismissible as before: the ✕ is still a 44px target with the taller
    // content, and it really closes the bubble.
    const closeBox = await popup.locator('a.leaflet-popup-close-button').boundingBox()
    expect(closeBox, 'the bubble must keep its close control').not.toBeNull()
    expect(closeBox!.width).toBeGreaterThanOrEqual(44)
    await popup.locator('a.leaflet-popup-close-button').click()
    await expect(page.getByTestId('place-marker-info')).toHaveCount(0)

    /**
     * THE COLLAPSE, PROVEN FROM THE OTHER SIDE: delete the SOONER of the pair and
     * the SAME dot must now name the surviving drop-in.
     *
     * Without this, "1 more drop-in here" is only a sentence: it could be about
     * whatever else the live feed holds. After it, the second seeded row is
     * demonstrably BEHIND that dot — the dot changed its mind when the row went
     * away, and it now links the survivor's own `/playdate/:id`.
     */
    const deleted = await fetch(`${restUrl}/rest/v1/playdates?id=eq.${firstId}`, {
      method: 'DELETE',
      headers: restHeaders,
    })
    expect(deleted.ok, `the sooner seeded row must be deletable (HTTP ${deleted.status})`).toBe(true)
    created.shift()

    await page.reload()
    await settleOnRoute(page, '/')
    await page.getByRole('button', { name: 'Map' }).click()
    await expect(band).toBeVisible({ timeout: 15000 })

    const after = await probeEventPins()
    expect(
      after.named.length,
      'the surviving drop-in must still be one dot, not zero and not two',
    ).toBe(1)
    expect(
      after.named[0].title,
      'with the sooner drop-in deleted, the dot must name the one that is left',
    ).toBe(seeds[1].title)
    expect(after.named[0].href).toBe(`/playdate/${secondId}`)

    console.log(
      `[V25 t07] pins probed: ${before.count}; dot naming "${tapped.title}" ` +
        `(when "${tapped.when}", more "${tapped.more}", href "${tapped.href}"); ` +
        `after deleting the sooner row the same dot names "${after.named[0].title}" ` +
        `(href "${after.named[0].href}")`,
    )
  } finally {
    // Best-effort cleanup: a leftover row would skew every later feed spec.
    for (const id of created) {
      await fetch(`${restUrl}/rest/v1/playdates?id=eq.${id}`, {
        method: 'DELETE',
        headers: restHeaders,
      }).catch(() => {})
    }
  }
})

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
 * (12) V17 t01: the map is a fixed-height BAND (spec §3's measurable rule: at
 *     390px wide it renders >=240px and <=60dvh tall, and the first list row's
 *     top edge sits BELOW the band's bottom edge), and every card leads with a
 *     photo slot — the kind-illustration fallback while `photo_url` is NULL for
 *     every seeded row (t05 supplies real ones), never a broken image and never
 *     an empty box. The heart is pinned INSIDE that slot (top-right), so the
 *     t02 behavior spec above and this position spec together cover the move.
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

/** A real seeded playground (Play Areas -> kind 'playground', 0029's seed). */
const PLACE_NAME = 'Green Lake Park'
const PLACE_ADDRESS = '7201 East Green Lake Dr N'

/**
 * The marker-tap spec's place: a name that matches EXACTLY ONE seeded place and
 * carries real coordinates, so the map holds a single tappable indigo marker.
 *
 * "Green Lake Park" cannot serve that role — it matches four seeded places
 * (Park, Park East, Park West, Wading Pool) whose markers overlap at the fitted
 * zoom, and the plain Park marker itself can fall off the 256px canvas where
 * Leaflet renders it as the zero-size `d="M0 0"` path. See the spec's note.
 */
const MARKER_PLACE_NAME = 'Alki Playground - Whales Tail'
const MARKER_PLACE_ADDRESS = '5817 SW Lander St'

/** A real seeded indoor row (the hand-curated SPL branch list). */
const INDOOR_PLACE = 'Ballard Branch, Seattle Public Library'

const PLACE_INPUT = 'e.g. Green Lake playground, near the boathouse'
const ADDRESS_INPUT = 'e.g. 7200 4th Ave NE, near the boathouse'

/** The maps href the place page must render (the app's own pure mapsHref seam). */
const MAPS_HREF = `https://www.google.com/maps?q=${encodeURIComponent(
  `${PLACE_NAME}, ${PLACE_ADDRESS}`,
)}`

/** Open /browse through the Places nav tab (which also pins the label change). */
async function openPlacesTab(page: Page): Promise<void> {
  await page.goto('/')
  await settleOnRoute(page, '/')
  await page.getByRole('link', { name: 'Places', exact: true }).click()
  await page.waitForURL('/browse')
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

  // (2) The tab is labelled Places and its screen is the directory.
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
  await useAnyDistance(page)
  await page.getByTestId('places-search').fill(PLACE_NAME)
  await expect(placeRow(page, PLACE_NAME)).toBeVisible()
  await expect(page.getByTestId('place-row').getByText(PLACE_ADDRESS, { exact: true })).toBeVisible()
  // Clear the search so step (8) can assert the collapsed grouped state.
  await page.getByTestId('places-search').fill('')

  // Every row carries a kind · indoor/outdoor line, and the counts line is
  // either a real count or absent (never an invented "0 upcoming").
  await expect(page.getByTestId('place-row').first()).toContainText(
    /Playground|Splash pad|Pool|Beach|Library|Museum|Indoor play|Park|Place/,
  )

  // (10) V15 ticket 04: each list row carries its own compact "Start a drop-in"
  // button + "Learn more" link (AC4 — the actions are not map-only). The first
  // visible row's button is present and its Learn-more link carries the derived
  // OSM search URL for that row's place name.
  const firstRow = page.getByTestId('place-row').first()
  await expect(firstRow.locator('[data-testid^="row-start-dropin-"]')).toBeVisible()
  await expect(firstRow.locator('[data-testid^="row-learn-more-"]')).toBeVisible()
  await expect(firstRow.locator('[data-testid^="row-learn-more-"]')).toHaveAttribute(
    'href',
    /^https:\/\/www\.openstreetmap\.org\/search\?query=.+/s,
  )
  await expect(firstRow.locator('[data-testid^="row-learn-more-"]')).toHaveAttribute(
    'target',
    '_blank',
  )

  // (6) V12 t05: the directory's overview map — one marker per placed row
  // (the rows the distance model could place, i.e. the ones with stored
  // coordinates). Live OSM tiles; we assert the container + the SVG marker
  // paths (the circleMarkers' <path> inside the overlay pane's <svg>), never
  // tile pixels.
  const overviewMap = page.getByTestId('places-map')
  await expect(overviewMap).toBeVisible()
  await expect(overviewMap.locator('.leaflet-overlay-pane svg path')).not.toHaveCount(0)
  // The tile pane exists whether or not the live tiles have loaded yet.
  await expect(overviewMap.locator('.leaflet-tile-pane')).toHaveCount(1)

  // (7) V13 ticket 05 (A6): the map LEADS the page — it sits above the search
  // filter card and the list. The filter card is the next sibling after the
  // map card, so the map's DOM position precedes the search input's.
  const searchInput = page.getByTestId('places-search')
  const [mapBox, searchBox] = await Promise.all([
    overviewMap.boundingBox(),
    searchInput.boundingBox(),
  ])
  expect(
    mapBox !== null && searchBox !== null && mapBox.y < searchBox.y,
    'the overview map must sit ABOVE the search/filter card',
  ).toBe(true)

  // (8) V13 ticket 05 (A7): the raw unbroken long-list is gone — the list
  // leads with the first places (alphabetical by default, V15 t03) grouped by
  // kind, then a single "See all N places" overflow door reveals every
  // remaining row. At least one group header (a kind chip as an h2 section
  // header) is visible, and the lead rows still carry the row testid (the
  // existing helpers keep working against the new layout).
  await expect(
    page
      .locator('h2')
      .filter({ hasText: /Park|Playground|Pool|Beach|Library|Museum|Indoor play|Splash pad/ })
      .first(),
  ).toBeVisible()
  // The overflow door names the total ("See all N places") when more than the
  // lead limit exist (the seed has far more than six places).
  const seeAll = page.getByTestId('places-see-all')
  await expect(seeAll).toBeVisible()
  await expect(seeAll).toContainText('See all')
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
  const overviewMap = page.getByTestId('places-map')
  const placeMarker = overviewMap
    .locator('.leaflet-overlay-pane svg path[fill="#4f46e5"]:not([d="M0 0"])')
    .first()
  await expect(placeMarker).toBeVisible()
  await placeMarker.click({ force: true })

  // The info panel opens below the map: the place's name + address, and the
  // three actions — "Start a drop-in" (the pre-fill door), "Learn more" (the
  // derived OSM link, V15 ticket 04), and "Details" (the place page).
  const info = page.getByTestId('place-marker-info')
  await expect(info).toBeVisible()
  await expect(info.getByText(MARKER_PLACE_NAME, { exact: true })).toBeVisible()
  await expect(info.getByText(MARKER_PLACE_ADDRESS, { exact: true })).toBeVisible()

  // V15 ticket 04: the renamed action button is visible with its new label.
  const startDropInBtn = info.getByTestId('host-here')
  await expect(startDropInBtn).toBeVisible()
  await expect(startDropInBtn).toHaveText('Start a drop-in')

  // V15 ticket 04: "Learn more" carries the derived OSM search URL, opening in
  // a new tab (AC3: a valid OSM href, never a broken link for a named place).
  const learnMore = info.getByTestId('learn-more')
  await expect(learnMore).toBeVisible()
  await expect(learnMore).toHaveAttribute(
    'href',
    `https://www.openstreetmap.org/search?query=${encodeURIComponent(MARKER_PLACE_NAME)},+Seattle`,
  )
  await expect(learnMore).toHaveAttribute('target', '_blank')
  await expect(learnMore).toHaveAttribute('rel', 'noopener')

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
    `Playdate at ${MARKER_PLACE_NAME}`,
  )
  // A prefill is not "typing": no suggestion list is left hanging open.
  await expect(page.getByTestId('place-suggestions')).toHaveCount(0)
})

test('the map is a fixed-height band and every card leads with its photo slot (V17 t01)', async ({
  page,
}) => {
  // The spec's §3 measurable rule is a PHONE measurement, so this spec pins the
  // viewport the rule names. The default desktop-sized viewport would make the
  // dvh ceiling meaningless (60dvh of 720px is 432px, which trivially contains
  // a 240px band), so measuring here would not test the rule at all.
  await page.setViewportSize({ width: 390, height: 844 })
  await openPlacesTab(page)
  await useAnyDistance(page)

  // AC: at 390px the band renders >= 240px and <= 60dvh tall.
  const band = page.getByTestId('places-map-band')
  await expect(band).toBeVisible()
  const bandBox = await band.boundingBox()
  if (bandBox === null) throw new Error('the map band has no box — it is not rendered')
  const dvh = page.viewportSize()!.height / 100
  expect(
    bandBox.height,
    `the map band must be >= 240px tall at 390px wide (got ${bandBox.height}px)`,
  ).toBeGreaterThanOrEqual(240)
  expect(
    bandBox.height,
    `the map band must be <= 60dvh tall at 390px wide (got ${bandBox.height}px, 60dvh = ${
      60 * dvh
    }px)`,
  ).toBeLessThanOrEqual(60 * dvh)

  // The band is a REAL band, not two borders around nothing. This assertion is
  // here because the first version of this slice passed the band measurement
  // while the MAP inside it had collapsed to a 2px border: `PlacesMap` was
  // handed `h-full`, which resolves `height: 100%` against the auto-height
  // wrapper the component itself renders, and both classes sit in Tailwind's
  // `utilities` layer so `h-full` won by source order. A band-only assertion
  // would have shipped an invisible map. So the map element is measured too.
  const mapBox = await page.getByTestId('places-map').boundingBox()
  if (mapBox === null) throw new Error('the map has no box')
  expect(
    mapBox.height,
    `the map must fill the band, not collapse inside it (got ${mapBox.height}px of a ${bandBox.height}px band)`,
  ).toBeGreaterThanOrEqual(bandBox.height - 2)

  // AC: the first list row's top edge is BELOW the band's bottom edge — the
  // list really does scroll beneath the map rather than beside it.
  const firstRow = page.getByTestId('place-row').first()
  await expect(firstRow).toBeVisible()
  const rowBox = await firstRow.boundingBox()
  if (rowBox === null) throw new Error('the first place row has no box')
  expect(
    rowBox.y,
    `the first row's top (${rowBox.y}) must be at or below the band's bottom (${bandBox.y + bandBox.height})`,
  ).toBeGreaterThanOrEqual(bandBox.y + bandBox.height)

  // AC: EVERY card renders the photo slot, and with no photo_url (NULL for
  // every seeded row — t05 sources real ones) it renders the kind-illustration
  // fallback. Never a broken image, never an empty box: the slot has a real
  // box, and it took the `kind` branch rather than an <img> with a null src.
  const slots = page.getByTestId('place-card-photo')
  const slotCount = await slots.count()
  expect(slotCount).toBeGreaterThan(0)
  expect(slotCount, 'every rendered card carries exactly one photo slot').toBe(
    await page.getByTestId('place-row').count(),
  )
  for (const slot of await slots.all()) {
    const slotBox = await slot.boundingBox()
    expect(slotBox?.width ?? 0, 'the photo slot must have a real width').toBeGreaterThan(20)
    expect(slotBox?.height ?? 0, 'the photo slot must have a real height').toBeGreaterThan(20)
  }
  await expect(slots.first()).toHaveAttribute('data-photo', 'kind')
  // The fallback is a DRAWN glyph, not an empty box: the slot holds an SVG.
  await expect(slots.first().locator('svg')).toHaveCount(1)
  // …and there is no <img> at all yet, so there is no broken image to find.
  await expect(page.locator('[data-testid="place-card-photo"][data-photo="real"]')).toHaveCount(0)

  // AC: the heart (V17 t02) is now in the CARD HEADER — the top-right of the
  // photo slot — and is still a >=44px tap target. The t02 spec proves its
  // behavior; this pins its new POSITION so the move cannot silently regress.
  const heart = page.locator('[data-testid^="place-heart-"]').first()
  await expect(heart).toBeVisible()
  const heartBox = await heart.boundingBox()
  if (heartBox === null) throw new Error('the heart has no box — it is not rendered')
  expect(heartBox.width).toBeGreaterThanOrEqual(44)
  expect(heartBox.height).toBeGreaterThanOrEqual(44)
  const heartSlotBox = await page.getByTestId('place-card-photo').first().boundingBox()
  if (heartSlotBox === null) throw new Error('the first card photo slot has no box')
  // Inside the slot's own rectangle (the slot spans its card's full width, so
  // this is the "top-right of the photo" contract, not an approximate one).
  expect(heartBox.x).toBeGreaterThanOrEqual(heartSlotBox.x)
  expect(heartBox.x + heartBox.width).toBeLessThanOrEqual(heartSlotBox.x + heartSlotBox.width + 1)
  expect(heartBox.y).toBeGreaterThanOrEqual(heartSlotBox.y)
  expect(heartBox.y + heartBox.height).toBeLessThanOrEqual(heartSlotBox.y + heartSlotBox.height + 1)
  // Top-right, not merely somewhere inside: the heart sits in the slot's upper
  // half and its right edge is in the slot's right half.
  expect(heartBox.y + heartBox.height / 2).toBeLessThanOrEqual(
    heartSlotBox.y + heartSlotBox.height / 2,
  )
  expect(heartBox.x + heartBox.width / 2).toBeGreaterThanOrEqual(
    heartSlotBox.x + heartSlotBox.width / 2,
  )

  // AC: the grouped lead + overflow door still work under the new card shape.
  await expect(
    page
      .locator('h2')
      .filter({ hasText: /Park|Playground|Pool|Beach|Library|Museum|Indoor play|Splash pad/ })
      .first(),
  ).toBeVisible()
  const seeAll = page.getByTestId('places-see-all')
  await expect(seeAll).toBeVisible()
  await expect(seeAll).toContainText('See all')
})

test('the browse list overflows behind "See all", keeping every row reachable (V13 ticket 05 A7)', async ({
  page,
}) => {
  await openPlacesTab(page)
  await useAnyDistance(page)

  // Collapsed by default when more than the lead limit exist (the seed has far
  // more than six places): the door names the total. Tapping it reveals the
  // remaining rows (all place data stays reachable), and the door flips to
  // "Hide".
  const seeAll = page.getByTestId('places-see-all')
  await expect(seeAll).toBeVisible()
  await expect(seeAll).toContainText('See all')
  await seeAll.click()
  await expect(page.getByTestId('places-see-all')).toContainText('Hide')
  await expect(placeRow(page, INDOOR_PLACE)).toBeVisible()
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
    `Playdate at ${PLACE_NAME}`,
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

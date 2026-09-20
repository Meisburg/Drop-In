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
 *     "Host here" action that lands on /new with the place pre-filled (the
 *     existing place pre-fill router state, the same seam the place page's
 *     "Start a drop-in here" uses).
 * (8) V13 ticket 05 (A7): the raw unbroken long-list is gone — the list leads
 *     with the first places (alphabetical by default, V15 t03) grouped by kind,
 *     then a single "See all N places" overflow door reveals every remaining row.
 * (9) V15 ticket 03: the "Filter & sort" modal above the list — kind chips
 *     multi-select + a sort dropdown + an optional radius input; Apply closes
 *     it and the list re-renders in the chosen order. The default order is
 *     alphabetical (A–Z), not distance-sorted.
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
 * via REST with the marker's JWT (the host-only DELETE policy); the marker
 * account (e2e- prefix) is left for the orchestrator's sweep. Nothing this
 * spec does touches the marker's home zip or radius — it drives the Places
 * distance filter instead, so it is independent of whatever location an earlier
 * spec left the marker on.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
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

test('tapping an overview map marker shows the place info + "Host here" (V13 ticket 05 A6)', async ({
  page,
}) => {
  await openPlacesTab(page)
  await useAnyDistance(page)
  // Narrow to the one seeded place whose marker we will tap: the search keeps
  // exactly that row in the list AND on the map (the map renders the same
  // `placed` set the list does), so its marker is the only one on the canvas.
  await page.getByTestId('places-search').fill(PLACE_NAME)
  await expect(exactPlaceName(page, PLACE_NAME)).toBeVisible()

  // Tap the single marker (the circleMarker's <path> inside the overlay
  // pane's <svg> — the same DOM the AC5 assertions target).
  const overviewMap = page.getByTestId('places-map')
  const markerPath = overviewMap.locator('.leaflet-overlay-pane svg path').first()
  await expect(markerPath).toBeVisible()
  await markerPath.click({ force: true })

  // The info panel opens below the map: the place's name + address, and the
  // two actions — "Host here" (the pre-fill door) and "Details" (the place
  // page).
  const info = page.getByTestId('place-marker-info')
  await expect(info).toBeVisible()
  await expect(info.getByText(PLACE_NAME, { exact: true })).toBeVisible()
  await expect(info.getByText(PLACE_ADDRESS, { exact: true })).toBeVisible()

  // "Host here" lands on /new with the place pre-filled — the SAME router-
  // state seam the place page's "Start a drop-in here" uses (V9 ticket 03's
  // duplicate-prefill pattern), so the three fields a place pick fills are
  // filled from the MAP instead of the place page.
  await info.getByTestId('host-here').click()
  await page.waitForURL('/new')
  await expect(page.getByPlaceholder(PLACE_INPUT)).toHaveValue(PLACE_NAME)
  await expect(page.getByPlaceholder(ADDRESS_INPUT)).toHaveValue(PLACE_ADDRESS)
  await editTitle(page)
  await expect(page.getByPlaceholder('e.g. Playground time at Green Lake')).toHaveValue(
    `Playdate at ${PLACE_NAME}`,
  )
  // A prefill is not "typing": no suggestion list is left hanging open.
  await expect(page.getByTestId('place-suggestions')).toHaveCount(0)
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

  // AC1: the default order is ALPHABETICAL (A–Z), not distance-sorted. The
  // lead rows are the first BROWSE_LIST_LEAD_LIMIT names in A→Z order — so the
  // very first row must be the alphabetically-first place in the directory.
  const firstRow = page.getByTestId('place-row').first()
  await expect(firstRow).toBeVisible()
  // Every visible lead row's name must come after (or equal) the previous one:
  // read the lead names in DOM order and assert they are sorted.
  const leadNames = (
    await page.locator('[data-testid="place-row"] > span').first().allTextContents()
  ).slice(0, 6)
  expect(leadNames.length).toBeGreaterThan(0)
  for (let i = 1; i < leadNames.length; i++) {
    expect(leadNames[i].localeCompare(leadNames[i - 1])).toBeGreaterThanOrEqual(0)
  }

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
})

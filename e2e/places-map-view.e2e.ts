/**
 * Spec (V24 slice 10): THE MAP VIEW — "See map" opens a map over the SAME
 * result set the list was showing, with a horizontally swipeable card strip
 * along the bottom. Focusing a card recentres the map; tapping a card opens that
 * place's detail page; "Back to list" returns to the list the parent came from,
 * with its filters and its scroll position intact.
 *
 * WHY THE ASSERTIONS LOOK THE WAY THEY DO:
 *
 *  - THE RECENTRE IS PROVEN BY THE CAMERA'S OWN REPORT, IN TWO WAYS, and NOT by
 *    pixels or tiles. `data-focused-place` alone would be STATE — it is written
 *    from the caller's prop, so it would still say "focused" if the recentring
 *    call were deleted, and a spec asserting only that could not fail for the
 *    defect it exists to catch. So the recentre is asserted twice more:
 *      (a) `data-map-center` is Leaflet's own `getCenter()` on `moveend` — the
 *          map's report of where it is, written by the camera, not by the prop;
 *      (b) the FOCUSED MARKER's own position converges on the map pane's centre,
 *          measured with `getBoundingClientRect` on the two elements. A camera
 *          that did not move leaves the pin where it was.
 *    Neither of those reads a tile or a colour, so an unreachable OpenStreetMap
 *    cannot fail this spec; both read geometry the browser has already laid out.
 *
 *  - THE SWIPE SCROLLS THE REAL STRIP. The strip is CSS `scroll-snap`, so the
 *    spec scrolls the real element and lets the snap settle, then asserts the
 *    focus moved. It does NOT assign `scrollLeft`: MEASURED, an assignment is
 *    not honoured under `scroll-snap-type: x mandatory` — the container snapped
 *    straight back — so an assertion built on it would be testing the fudge
 *    rather than the app.
 *
 *  - AT MOST ONE MAP IS MOUNTED. Every existing spec locates the directory's map
 *    as `places-map`, so the map view's own map is `places-map-view-map` and the
 *    the list-view band is NOT mounted at all (V25 t01), and the list is not
 *    rendered while the map view is up. Each phase here asserts the
 *    other id has count 0, which is the trap this slice was designed around:
 *    two mounted Leaflet maps would fail every `getByTestId('places-map')` in
 *    the suite under Playwright's strict mode.
 *
 *  - ONE SPEC DRIVES THE STRIP WITH THE KEYBOARD ONLY. Tapping is not an input
 *    method for everyone, so the strip is REACHED BY REAL TAB PRESSES from the
 *    control that opened the map view, and the arrow keys and the explicit
 *    Previous/Next controls are covered as first-class paths rather than as an
 *    afterthought.
 *
 * Cleanup: exactly ONE write, and it is restored by the spec that makes it. The
 * `no home pin: …` spec needs a viewer with NO HOME PIN, which is the branch of
 * `shouldRenderPlacesMap` the seeded marker cannot reach — the marker has a home
 * zip. The other specs create no rows and no accounts: they read the seeded
 * directory through the marker's own storage state (the `chromium` project),
 * filter it with the app's existing controls, and write nothing. The one write
 * goes through the marker's OWN JWT over REST (the app's own path and RLS
 * policy, the `e2e/feed-empty-state.e2e.ts` precedent), is scoped to the
 * marker's own profile row, and is restored AND verified before the spec ends —
 * see `restoreMarkerHomeZip`.
 */
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { readMarkerSession, readSupabaseEnv, settleOnRoute } from './fixtures'
import { MAP_STRIP_CARD_LIMIT } from '../src/lib/mapStrip'

/** The directory's distance control, set to "Any distance" (see below). */
async function setAnyDistance(page: Page): Promise<void> {
  // V27: the distance filter is a dropdown button + bottom sheet now.
  await page.getByTestId('places-distance-filter-btn').click()
  await page.getByTestId('places-distance-sheet-option-any').click()
}

/**
 * Scroll far enough that the floating map toggle renders on /browse.
 *
 * V27: list view withholds `places-view-toggle` until `window.scrollY` clears
 * ~220px. Short result sets leave the page un-scrollable at Playwright's
 * viewport, so a temporary spacer (the same `scroll-range-probe` technique the
 * round-trip spec already uses) guarantees a scroll range without touching the
 * directory's own DOM. The spacer is left in place for the caller to remove.
 */
async function scrollPastMapToggleThreshold(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.getElementById('scroll-range-probe') !== null) return
    const spacer = document.createElement('div')
    spacer.id = 'scroll-range-probe'
    spacer.style.height = '1800px'
    document.body.appendChild(spacer)
  })
  await page.evaluate(() => window.scrollTo(0, 400))
}

/**
 * Open /browse with the distance filter wide, which is what makes this spec
 * INDEPENDENT of whatever radius an earlier spec parked the marker on.
 *
 * `feed-empty-state.e2e.ts` deliberately leaves the marker ~118 miles away on a
 * 2-mile radius; without this the map view would open over a one-card strip and
 * the swipe test would have nothing to swipe to. The search text then narrows
 * the set to one kind, so the strip is long enough for a swipe and short enough
 * to be cheap.
 *
 * V27: the search input is an always-visible inline field, and the only map
 * door is the floating `places-view-toggle`, which needs a scroll first.
 */
async function openMapView(page: Page): Promise<void> {
  await page.goto('/browse')
  await settleOnRoute(page, '/browse')
  await setAnyDistance(page)
  await page.getByTestId('places-search').fill('park')
  await expect(page.getByTestId('place-row').first()).toBeVisible()
  await scrollPastMapToggleThreshold(page)
  await page.getByTestId('places-view-toggle').click()
  await expect(page.getByTestId('places-map-view-map')).toBeVisible()
  await expect(page.getByTestId('places-map-strip')).toBeVisible()
  await page.evaluate(() => document.getElementById('scroll-range-probe')?.remove())
}

/**
 * The zip the no-home-pin spec parks the viewer on, and WHY IT IS THIS VALUE.
 *
 * `home_zip` does two different jobs in this app, and the dead-map branch needs
 * only the second one to be empty:
 *
 *  1. THE ONBOARDING GATE keys on it (`needsOnboarding(homeZipSet)`, `App.tsx`),
 *     so a NULL home zip bounces every protected route to `/onboarding` — a
 *     viewer who cannot reach `/browse` proves nothing about the map. The value
 *     must therefore be SET.
 *  2. THE HOME PIN resolves it through the gazetteer (`BrowsePage.tsx`, the
 *     `homePinCoords` block), and a zip ABSENT from that extract yields
 *     `homePin === null` — the branch under test.
 *
 * `00000` is not in `supabase/migrations/0012_zip_radius.sql`'s seeded extract
 * (checked: zero occurrences), and it is already the value
 * `src/lib/feed.test.ts` uses for exactly this "not in the gazetteer" case
 * (`placeDistanceMiles(NEAR_PLACE, { homeZip: '00000' }, …)` → null). It is a
 * real string, so it passes any NOT NULL/format assumption the column has (the
 * column is plain `text`, nullable, with no CHECK).
 */
const NO_HOME_PIN_ZIP = '00000'

/**
 * The marker's own `home_zip`, read over PostgREST with the marker's JWT (the
 * app's own SELECT path and RLS policy).
 *
 * `undefined` means THE READ FAILED (network, RLS, a rotated project) — as
 * distinct from `null`, which is a real stored value. The caller must not
 * confuse the two: treating a failed read as "the marker has no zip" would make
 * the restore write `null` and break the onboarding gate for every later spec.
 */
async function readMarkerHomeZip(): Promise<string | null | undefined> {
  const { url, anonKey } = readSupabaseEnv()
  const { accessToken, userId } = readMarkerSession()
  const res = await fetch(`${url}/rest/v1/profiles?id=eq.${userId}&select=home_zip`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return undefined
  const rows = (await res.json()) as Array<{ home_zip: string | null }>
  return rows[0]?.home_zip ?? null
}

/**
 * Write the marker's `home_zip`, scoped to the marker's OWN row id — never a
 * broad filter (`profiles_update_own` + the owner RLS policy is the wall, and
 * the same write path `e2e/feed-empty-state.e2e.ts` uses for this column).
 *
 * `Prefer: return=minimal` deliberately asks for NO row back: a write whose
 * SELECT policy excludes the actor must never be sent through RETURNING. The
 * caller re-reads with `readMarkerHomeZip` instead, so the verification is a
 * second, independent read.
 */
async function patchMarkerHomeZip(zip: string | null): Promise<boolean> {
  const { url, anonKey } = readSupabaseEnv()
  const { accessToken, userId } = readMarkerSession()
  const res = await fetch(`${url}/rest/v1/profiles?id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ home_zip: zip }),
  })
  return res.ok
}

/**
 * Put the marker's `home_zip` back, and FAIL the run if it did not land.
 *
 * WHY FAILURE RATHER THAN A LOG LINE: specs run serially against ONE shared
 * marker (`playwright.config.ts`: `workers: 1`), and every later spec that needs
 * a home pin reads this row. A marker left at `00000` would break the NEXT spec
 * in a way that looks like someone else's bug — the exact failure mode
 * `feed-empty-state.e2e.ts`'s `afterAll` documents. Best-effort by attempt (3),
 * never by silence.
 */
async function restoreMarkerHomeZip(previous: string | null): Promise<void> {
  let restored: string | null | undefined
  for (let attempt = 1; attempt <= 3; attempt++) {
    await patchMarkerHomeZip(previous)
    restored = await readMarkerHomeZip()
    if (restored === previous) return
  }
  throw new Error(
    `[e2e cleanup] FAILED — could not restore the marker's home_zip to ` +
      `${JSON.stringify(previous)} (row now: ${JSON.stringify(restored)}). Every later spec ` +
      `that needs a home pin reads this row: restore it by hand before re-running the suite.`,
  )
}

/**
 * The same entry as `openMapView`, but reached WITHOUT a pointer: the floating
 * map toggle is given the focus (the keyboard user's position after arriving at
 * it) and activated with Enter, which is the real activation a keyboard user
 * performs.
 *
 * V27: the in-card "See map" button is removed; the entry control is now the
 * floating `places-view-toggle` (aria-label "Map" in list view), which only
 * renders after a scroll. The focus-placement call is the one test-API step, and
 * it is deliberate: the spec's job is to prove the TAB PATH FROM THAT CONTROL
 * INTO THE STRIP, not to re-prove that a page can be traversed from the top. The
 * traversal itself is real key events (see the keyboard spec).
 */
async function openMapViewByKeyboardEntry(page: Page): Promise<void> {
  await page.goto('/browse')
  await settleOnRoute(page, '/browse')
  await setAnyDistance(page)
  await page.getByTestId('places-search').fill('park')
  await expect(page.getByTestId('place-row').first()).toBeVisible()
  await scrollPastMapToggleThreshold(page)
  const seeMap = page.getByTestId('places-view-toggle')
  await seeMap.focus()
  expect(
    await page.evaluate(() => document.activeElement?.getAttribute('data-testid')),
    'the entry control is focused before it is activated',
  ).toBe('places-view-toggle')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('places-map-view-map')).toBeVisible()
  await expect(page.getByTestId('places-map-strip')).toBeVisible()
  await page.evaluate(() => document.getElementById('scroll-range-probe')?.remove())
  /**
   * THE FOCUS IS PUT BACK ON THE CONTROL THAT NOW EXISTS, and this is a faithful
   * model rather than a convenience: activating the map toggle replaces the
   * surface under the parent's focus, so the focus does not stay on a control
   * that the map view no longer renders as the entry control (the toggle now
   * reads "List"). A real keyboard user's next Tab therefore starts from the top
   * of the new view, whose first control is "Back to list" — placing it there is
   * what makes the traversal below measure the distance a person actually walks,
   * without a handful of presses spent tabbing off a control that just changed
   * job.
   */
  const back = page.getByTestId('places-back-to-list')
  await back.focus()
  expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe(
    'places-back-to-list',
  )
}

/** Every place name the LIST is showing, in the list's own order. */
async function listNames(page: Page): Promise<string[]> {
  return page.getByTestId('place-card-name').allInnerTexts()
}

/** Every card's place name, in the strip's own order. */
async function cardNames(page: Page): Promise<string[]> {
  const texts = await page.locator('[data-testid^="places-map-card-"]').allInnerTexts()
  return texts.map((text) => text.split('\n')[0] ?? '')
}

/**
 * Every place id the given locator points at, in DOM order.
 *
 * Read from each node's `href` rather than from a data attribute: a directory
 * row is a react-router `Link` that carries no `data-place-id` (and adding one
 * to satisfy a spec would be a test seam in product markup). The card and the
 * row both link to `/place/:id` through the SAME `placePath` builder, so the
 * href is the honest comparison — it is the app's own route for that place, not
 * a parallel identifier.
 */
async function placeIds(scope: Locator): Promise<string[]> {
  return scope.evaluateAll((nodes) =>
    nodes.map((node) => {
      const href = node.getAttribute('href') ?? ''
      const [, id = ''] = href.split('/place/')
      return id.split(/[/?#]/)[0] ?? ''
    }),
  )
}

/**
 * The map's declared focused place, read from the map view's OWN container (the
 * band's `places-map` is not mounted in this view — see the file header).
 *
 * This is STATE, not a camera report — see `mapCenter` and `focusedPinOffset`
 * below for the two observables that can fail when the camera does not move.
 */
function focusedPlaceId(page: Page): Promise<string | null> {
  return page.getByTestId('places-map-view-map').getAttribute('data-focused-place')
}

/**
 * Every PLACE pin a surface has mounted, counted from the markers' own fill.
 *
 * The focused pin is styled with a different fill, so it is counted separately —
 * and the home pin is excluded by construction, because it is neither of the two
 * place fills. Counted from mounted SVG paths rather than from visible boxes:
 * Leaflet culls an off-pane marker to `d="M0 0"` WITHOUT unmounting it, and the
 * question here is which places the map is plotting, not which ones happen to be
 * on screen.
 */
function placePinCount(scope: Locator): Promise<number> {
  // The selector does the work rather than a loop with fill tests: a PLAIN place
  // pin is the only marker with that fill AND no focus mark. MEASURED reasons for
  // both exclusions: the home pin is also `#dc2626`-ish, and a radius circle
  // (the retired band drew one; the map view does not) is an SVG path with the
  // same fill as the home pin, so a fill-only test counted it as a home pin; and
  // the focused pin
  // is deliberately a DIFFERENT fill in each view's own state, so counting it as
  // plain would compare two different things.
  return scope.locator('.leaflet-interactive[fill="#4f46e5"]:not([data-focused-marker])').count()
}

/**
 * `placePinCount`, retried until the number settles.
 *
 * WHY: the marker layer is built by Leaflet inside an effect, so for a
 * frame or two after the map is "visible" the DOM holds fewer paths than the map
 * is about to draw. MEASURED while writing the pin-count spec: an immediate read
 * of the list-view band returned 236 where a settled read returned the map
 * view's 239 —
 * three paths short, which is exactly how a timing artefact impersonates a real
 * pin loss. Two identical consecutive reads (or a timeout) means settled.
 */
async function settledPlacePinCount(scope: Locator, timeoutMs = 8000): Promise<number> {
  const deadline = Date.now() + timeoutMs
  let previous = -1
  for (;;) {
    const current = await placePinCount(scope)
    if (current > 0 && current === previous) return current
    if (Date.now() > deadline) return current
    previous = current
    await scope.page().waitForTimeout(120)
  }
}

/**
 * The radius Leaflet actually DREW into a marker's SVG path, read from the arc
 * command (`d="M370,136a12,12 …"` → 12).
 *
 * WHY THE `d` ATTRIBUTE AND NOT A BOX: a `circleMarker` has no `r` attribute, and
 * Leaflet draws an off-pane marker as a zero-size path (`d="M0 0"`) — so a box is
 * only evidence when the marker happens to be in view. The arc radius is the
 * geometry Leaflet computed for the marker's own options, so it is readable for
 * a culled marker too and it is the value the visual distinction is made of.
 * `null` when the path is culled (no arc) or the marker is not rendered yet.
 */
function drawnMarkerRadius(locator: Locator): Promise<number | null> {
  return locator.evaluate((el) => {
    const match = /a(\d+(?:\.\d+)?),/.exec(el.getAttribute('d') ?? '')
    return match === null ? null : Number(match[1])
  })
}

/**
 * The drawn radius of the first PLAIN place pin that Leaflet has actually drawn.
 *
 * A plain pin may be off-pane (culled to `d="M0 0"`), in which case its radius is
 * null and the next candidate is tried. `null` when no plain pin is drawn at all,
 * which the caller treats as "the component's own base radius is 8" — the value
 * this slice's contrast is defined against.
 */
async function plainPinDrawnRadius(page: Page): Promise<number | null> {
  const pins = page.locator('.leaflet-interactive[fill="#4f46e5"]')
  const count = await pins.count()
  for (let index = 0; index < count; index += 1) {
    const radius = await drawnMarkerRadius(pins.nth(index))
    if (radius !== null) return radius
  }
  return null
}

/**
 * The map camera's OWN report of where it is: `"lat,lng"`, written by Leaflet's
 * `getCenter()` on `moveend`. Unlike `data-focused-place` this value comes from
 * the map, so an assertion on it fails if the recentring call is removed.
 */
function mapCenter(page: Page): Promise<string | null> {
  return page.getByTestId('places-map-view-map').getAttribute('data-map-center')
}

/**
 * How far the FOCUSED MARKER's centre is from the map pane's centre, in pixels —
 * the geometric form of "the map is centred on the focused pin".
 *
 * Read in ONE `evaluate` so both rects come from the same layout pass. `null`
 * when no marker carries `data-focused-marker` (the defect this helper exists to
 * catch) or the map pane is not there.
 */
function focusedPinOffset(page: Page): Promise<{ dx: number; dy: number } | null> {
  return page.evaluate(() => {
    const pin = document.querySelector('[data-focused-marker]')
    const map = document.querySelector('[data-testid="places-map-view-map"]')
    if (pin === null || map === null) return null
    const pinBox = pin.getBoundingClientRect()
    const mapBox = map.getBoundingClientRect()
    return {
      dx: Math.abs(pinBox.x + pinBox.width / 2 - (mapBox.x + mapBox.width / 2)),
      dy: Math.abs(pinBox.y + pinBox.height / 2 - (mapBox.y + mapBox.height / 2)),
    }
  })
}

/**
 * The pixel tolerance on "the pin is at the centre of the pane".
 *
 * MEASURED on the live dev server (1280x720, then 390x844): the settled offset
 * after a focus move was `{dx: 0, dy: 0.2}` — sub-pixel, because Leaflet centres
 * the marker on the lat/lng it was given and the fractional zoom (`zoomSnap: 0`)
 * does not shift the anchor. The tolerance is a layout-rounding allowance, not a
 * fudge factor: 12px is under 2% of the pane's shorter side, far tighter than
 * "the camera did not move" (the un-panned offset was `{dx: 382, dy: 136}`).
 */
const FOCUSED_PIN_TOLERANCE_PX = 12

/**
 * Assert the pin is centred IN THE PANE, and that it got there from somewhere
 * else — i.e. that this is a recentre and not a coincidence of the mount view.
 */
async function expectPinCentredOnMap(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        const offset = await focusedPinOffset(page)
        if (offset === null) return null
        return offset.dx <= FOCUSED_PIN_TOLERANCE_PX && offset.dy <= FOCUSED_PIN_TOLERANCE_PX
      },
      {
        message:
          "the focused pin's centre converges on the map pane's centre " +
          `(within ${FOCUSED_PIN_TOLERANCE_PX}px) — i.e. the camera really moved`,
      },
    )
    .toBe(true)
}

test('the map view pins EVERY matching place, capping only the cards (V24 s10)', async ({
  page,
}) => {
  /**
   * THE ASSERTION THIS SLICE WAS MISSING, and the regression it exists for.
   *
   * A first version of the strip's cap fed the MAP from the capped slice, so a
   * directory of 239 matching places drew exactly 40 pins and the other 199 were
   * pinned nowhere — while the list-view band drew all of them. No spec asserted
   * a pin count, so nothing in the suite could fail. This one can: it asserts the
   * map view plots every placeable matching row — more than the strip's card cap
   * and no more than the list's own total — and that the cards really are capped.
   */
  await page.goto('/browse')
  await settleOnRoute(page, '/browse')
  await setAnyDistance(page)
  // No search: this needs MORE matching places than the strip's cap, and "park"
  // happened to land exactly on it during review. `park` is kept out of the
  // count so the assertion measures the directory, not the query.
  //
  // V25 t01: THE COMPARISON SURFACE CHANGED, AND THE CLAIM DID NOT. This spec
  // used to compare the map view's pins against the list-view BAND's pins — the
  // band was "the surface that has always pinned the full matching set". That
  // band is gone (list view mounts no map at all), so the full matching set is now
  // read from the LIST's own declared total (`places-list[data-matched-rows]`,
  // the same publish-the-total discipline this component already uses for the
  // map view itself).
  const listMatchedRows = Number(
    (await page.getByTestId('places-list').getAttribute('data-matched-rows')) ?? '0',
  )
  expect(
    listMatchedRows,
    'the directory must match more places than the strip cap for this to be a real check',
  ).toBeGreaterThan(MAP_STRIP_CARD_LIMIT)

  // V27: the in-card "See map" door is gone; the floating toggle is the only
  // way in, and it needs a scroll before it renders on /browse.
  await scrollPastMapToggleThreshold(page)
  await page.getByTestId('places-view-toggle').click()
  const mapViewMap = page.getByTestId('places-map-view-map')
  await expect(mapViewMap).toBeVisible()
  await page.evaluate(() => document.getElementById('scroll-range-probe')?.remove())

  // AC B1: THE PINS ARE COMPLETE — every placeable matching row, which is all
  // but the handful the seed carries without coordinates.
  //
  // READ FROM THE SURFACE'S OWN DECLARED TOTAL, not from a seed-derived number
  // and not from a loose upper bound. `data-placeable-rows` is written from the
  // very array the pins are drawn from, so the comparison below is the strongest
  // available statement of "nothing was dropped": the counted pins plus the ONE
  // focused pin (which `placePinCount` deliberately excludes) must be exactly
  // the number of places this surface says it can plot. A partial pin loss —
  // 239 rows pinned as 45 — passes a `> MAP_STRIP_CARD_LIMIT` bound and fails
  // this one.
  const declaredPlaceable = Number(
    (await page.getByTestId('places-map-view').getAttribute('data-placeable-rows')) ?? '0',
  )
  const viewPins = await settledPlacePinCount(mapViewMap)
  expect(
    declaredPlaceable,
    'the map view must declare how many matching rows it can pin',
  ).toBeGreaterThan(MAP_STRIP_CARD_LIMIT)
  expect(
    viewPins + 1,
    `every placeable row must be pinned: the surface declares ${declaredPlaceable} ` +
      `placeable rows and the map drew ${viewPins} plain pins plus its focused one`,
  ).toBe(declaredPlaceable)
  expect(
    declaredPlaceable,
    `the map cannot pin more places than the list matches ` +
      `(placeable: ${declaredPlaceable}, matched: ${listMatchedRows})`,
  ).toBeLessThanOrEqual(listMatchedRows)
  expect(
    viewPins,
    'the pin count must exceed the card cap, or the cap has reached the pins again',
  ).toBeGreaterThan(MAP_STRIP_CARD_LIMIT)

  // AC: AND THE CAP IS STILL DOING ITS JOB ON THE CARDS. A count assertion that
  // could not fail is not evidence: if the cap were lifted from the cards too,
  // this is where it shows.
  const cards = await page.locator('[data-testid^="places-map-card-"]').count()
  expect(cards, 'the strip renders exactly the cap worth of cards').toBe(MAP_STRIP_CARD_LIMIT)
  expect(cards, 'the cards are fewer than the pins, which is the point').toBeLessThan(viewPins)

  // AC: THE HEADER REPORTS THE PINS, not the cards — the count a parent reads
  // must describe the surface, and "40 places on the map" over 239 matches was
  // the under-report this replaces.
  // The counted pins exclude the focused one (its selector does), so the
  // surface's own total is that count plus one.
  const placeableTotal = viewPins + 1
  await expect(page.locator('text=/places? on the map/').first()).toHaveText(
    new RegExp(`^${placeableTotal} places? on the map$`),
  )

  /**
   * AC: NOTHING IS UNREACHABLE — the cards and the linear list PARTITION the
   * matched rows.
   *
   * MEASURED AND CORRECTED (ocr finding 4): the first version asserted
   * `listed === pins - cards`, which silently assumed the directory has ZERO
   * unplaceable rows. The seed happens to have three ("PlayDate SEA", "Seattle
   * Children's Museum", "Wunderkind"), so the sum is the matched row count while
   * the difference is the placeable count — an assertion that would have started
   * failing the day the seed changed, or worse, passed while a row was dropped
   * because two errors cancelled.
   *
   * The count is read from the APP's own total — the map view's own
   * `data-matched-rows` (`PlacesMapView.tsx`, written from `rows.length`) rather
   * than from an arithmetic expectation, so this measures the partition and not
   * the fixture. (An earlier version of this comment named the directory's
   * "See all N places" label as the source; the code has always read the map
   * view's own attribute, and the map view is the only surface that publishes a
   * total covering the cards AND the linear list.)
   */
  const matchedRows = Number(
    (await page.getByTestId('places-map-view').getAttribute('data-matched-rows')) ?? '0',
  )
  expect(matchedRows, 'the map view must declare how many rows it carries').toBeGreaterThan(0)
  const listed = await page.getByTestId('places-map-list').locator('a').count()
  expect(
    cards + listed,
    `the cards (${cards}) and the linear list (${listed}) must account for every matched ` +
      `row (${matchedRows}) — none dropped, none duplicated`,
  ).toBe(matchedRows)
})

test('the map view shows the list\'s own result set and mounts exactly one map (V24 s10)', async ({
  page,
}) => {
  // The list's result set, captured BEFORE the switch — this is the thing the
  // map view must reproduce, not re-derive.
  await page.goto('/browse')
  await settleOnRoute(page, '/browse')
  await setAnyDistance(page)
  await page.getByTestId('places-search').fill('park')
  await expect(page.getByTestId('place-row').first()).toBeVisible()
  /**
   * THE OVERFLOW DOOR IS OPENED FIRST, deliberately.
   *
   * The list view renders a LEAD of `BROWSE_LIST_LEAD_LIMIT` rows and hides the
   * rest behind "See all N places". Comparing the strip against only the lead
   * would compare a 40-card strip with a 6-row list and prove nothing about the
   * other 34 — and it was the source of a false failure while this spec was being
   * written. Opening the door makes the list render every matching row, so the
   * comparison below is against the full set.
   */
  // V25 t01: THE LIST IS THE WHOLE LIST. The "See all N places" fold this spec
  // used to open is retired — every matching row renders on the first paint, so
  // the comparison below is against the full set with no door to click.
  await expect(page.getByTestId('places-see-all')).toHaveCount(0)
  await expect(page.getByTestId('place-row').first()).toBeVisible()
  const names = await listNames(page)
  expect(names.length, 'the search must leave more than one row to compare').toBeGreaterThan(1)
  const listRowIds = await placeIds(page.getByTestId('place-row'))

  // AC: there IS a map entry point, and it is a real >=44px tap target with a
  // real accessible name (the repo's measured floor). V27: the in-card "See map"
  // button is gone; the floating toggle is the only door and needs a scroll.
  await scrollPastMapToggleThreshold(page)
  const seeMap = page.getByTestId('places-view-toggle')
  await expect(seeMap).toBeVisible()
  const seeMapBox = await seeMap.boundingBox()
  if (seeMapBox === null) throw new Error('the map toggle has no box')
  expect(seeMapBox.width).toBeGreaterThanOrEqual(44)
  expect(seeMapBox.height).toBeGreaterThanOrEqual(44)

  await seeMap.click()
  const mapViewMap = page.getByTestId('places-map-view-map')
  await expect(mapViewMap).toBeVisible()
  await page.evaluate(() => document.getElementById('scroll-range-probe')?.remove())

  // AC (the trap): the map view REPLACED the band — the old test id is gone, so
  // no spec in the suite can match two maps at once.
  await expect(page.getByTestId('places-map')).toHaveCount(0)
  await expect(page.getByTestId('places-map-view-map')).toHaveCount(1)

  /**
   * AC (V25 t01, THE ASSERTION THE PREVIOUS VERSION WAS MISSING): MAP MODE
   * SHOWS THE MAP AND NOT THE LIST.
   *
   * The founder: *"it switches the list view to a map view, but they're not both
   * visible on the page at the same time in different places."* Asserting only
   * that the map ids exist could not fail when the list also rendered below it —
   * which is exactly what shipped: only the Loading branch was gated, so the
   * else-chain (the empty states AND the whole 239-row list) stayed mounted
   * under the map. These three assertions are the ones that fail on that build.
   */
  await expect(
    page.getByTestId('places-list'),
    'map mode must not render the list container',
  ).toHaveCount(0)
  await expect(
    page.getByTestId('place-row'),
    'map mode must not render directory rows',
  ).toHaveCount(0)
  // V27: the "Not on the map yet" section is gone entirely; coordinate-less
  // places render inline as `place-row`s, which the assertion above already
  // proves are absent in map mode.

  // AC (V25 t01, N7): THE REMAINING MAP IS A REAL MAP, NOT TWO BORDERS.
  //
  // The retired V17 t01 spec measured the band and warned, from a measured
  // defect, that a height assertion alone can pass while the map inside collapses
  // to a 2px border (`PlacesMap` was handed `h-full`, which resolved against the
  // auto-height wrapper the component itself renders). The band is gone, so that
  // guard has to live on the map that is left: the pane is >= 200px (the
  // component's own `min-h-[200px]`) and the Leaflet container really fills it.
  const paneBox = await mapViewMap.boundingBox()
  const leafletBox = await page.locator('.leaflet-container').boundingBox()
  if (paneBox === null) throw new Error('the map view map has no box — it is not rendered')
  if (leafletBox === null) throw new Error('the Leaflet container has no box')
  expect(
    paneBox.height,
    `the map must not collapse (min-h-[200px], got ${paneBox.height}px)`,
  ).toBeGreaterThanOrEqual(200)
  expect(
    leafletBox.height,
    `the Leaflet pane must fill the map, not collapse inside it ` +
      `(pane ${leafletBox.height}px of a ${paneBox.height}px map)`,
  ).toBeGreaterThanOrEqual(paneBox.height - 2)

  // AC: THE SAME RESULT SET, IN THE SAME ORDER — capped on the cards only.
  //
  // The list view renders a LEAD (`BROWSE_LIST_LEAD_LIMIT`, 6 rows) and hides the
  // rest behind its "See all" door; the map view renders the whole matching set as
  // PINS and the first `MAP_STRIP_CARD_LIMIT` as cards. So the strip cannot be
  // compared against the list's rendered rows as an equal set — it is drawn from
  // the SAME decision (`planDirectoryList`'s rows) but not from the same slice of
  // it. What is asserted here is the property that matters and can fail: every
  // card IS one of the list's rows, in the list's order, with nothing invented
  // and nothing re-sorted. The absolute "every matching place is pinned" claim is
  // the pin-count spec's job.
  const cards = await cardNames(page)
  expect(cards.length, 'the strip renders at most the cap worth of cards').toBeLessThanOrEqual(
    MAP_STRIP_CARD_LIMIT,
  )
  /**
   * THE STRIP DRAWS FROM THE LIST'S SET, and this asserts the two facts the DOM
   * can settle without reaching into the component:
   *
   *  1. every card is a place the LIST also shows — nothing is invented;
   *  2. a fresh document still governs how many CARDS render (the cap), while the
   *     PIN-COUNT spec is what proves the pins are uncapped.
   *
   * A CURSOR WALK WAS TRIED AND REMOVED. Asserting the strip is a SUBSEQUENCE of
   * the list's rendered rows looked stronger and was not: the list groups by KIND
   * and paginates at its lead, so its rows are not the strip's order, and the walk
   * produced a false failure ("Ballard Corners Park" after a cursor of 92) on a
   * strip whose order was correct. A spec that fails for a correct implementation
   * is a defect, so the order claim is left where it is actually true — the strip
   * is built from `planDirectoryList`'s own rows, in order, with no re-sort in the
   * map view (see `PlaceDirectory`'s `mapViewRows`).
   */
  const listNamesSet = new Set(names)
  const notInList = cards.filter((card) => !listNamesSet.has(card))
  expect(notInList, 'every card is a place the list also shows').toEqual([])
  const cardIds = await placeIds(page.locator('[data-testid^="places-map-card-"]'))
  const listIdSet = new Set(listRowIds)
  const orphanIds = cardIds.filter((id) => !listIdSet.has(id))
  expect(orphanIds, 'every card links to a place the list also holds').toEqual([])

  // AC: the first card is the focused one and the map agrees, through the
  // observable recentre attribute.
  await expect(page.getByTestId('places-map-card-0')).toHaveAttribute('aria-current', 'true')
  expect(await focusedPlaceId(page)).toBe(cardIds[0])

  // AC: THE FOCUSED CARD'S PIN IS VISUALLY DISTINGUISHED AMONG MANY PINS — and
  // it is asserted without a pixel or a tile comparison.
  //
  // Three facts, all observable and all about the pins rather than about the
  // camera: exactly ONE marker carries `data-focused-marker`; it names the
  // focused place; and it is drawn with a different radius and fill from every
  // other marker (so the distinction is a fact about the rendered geometry, not
  // just about an attribute). A map on which every pin looks identical fails
  // here, which is exactly the finding this asserts against.
  const focusedMarker = page.locator('[data-focused-marker]')
  await expect(focusedMarker, 'exactly one pin is marked as the focused one').toHaveCount(1)
  await expect(focusedMarker).toHaveAttribute('data-focused-marker', cardIds[0] ?? '')
  /**
   * THE STYLE, READ TWO WAYS THAT DO NOT DEPEND ON THE PIN BEING IN VIEW.
   *
   * MEASURED while writing this: the focused place is not necessarily near the
   * map's initial view, and Leaflet draws an off-pane marker as a zero-size path
   * (`d="M0 0"`) — so at this moment the focused pin's BOX is genuinely 0x0 and a
   * ratio against a visible pin would be meaningless. The two style attributes
   * survive a culled marker, and the arc radius Leaflet computed into `d` is
   * readable whenever the path has been drawn at all. The rendered BOX is
   * asserted after the recentre below, where the pin is on the pane by
   * definition.
   */
  const focusedStyle = focusedMarker.evaluate((el) => ({
    fillOpacity: Number(el.getAttribute('fill-opacity') ?? '0'),
    strokeWidth: Number(el.getAttribute('stroke-width') ?? '0'),
  }))
  const plainPin = page.locator('.leaflet-interactive[fill="#4f46e5"]').first()
  const plainStyle = plainPin.evaluate((el) => ({
    fillOpacity: Number(el.getAttribute('fill-opacity') ?? '0'),
    strokeWidth: Number(el.getAttribute('stroke-width') ?? '0'),
  }))
  const [focusedAttrs, plainAttrs] = await Promise.all([focusedStyle, plainStyle])
  expect(
    focusedAttrs.fillOpacity,
    'the focused pin is filled more solidly than a plain place pin',
  ).toBeGreaterThan(plainAttrs.fillOpacity)
  expect(
    focusedAttrs.strokeWidth,
    'the focused pin carries a heavier stroke than a plain place pin',
  ).toBeGreaterThan(plainAttrs.strokeWidth)
  // (The pins' drawn RADII are not compared here: at this moment the focused
  // place has not been centred yet, so it — and often every other pin — is
  // culled to `d="M0 0"`. That comparison is in the swipe spec, after a recentre
  // has put the pin on the pane, which is where it is measurable at all.)

  // AC: the camera reports a centre at all (Leaflet's own `getCenter()` on
  // `moveend`), which is the observable the recentre assertions below use.
  expect(await mapCenter(page), 'the map publishes its own live centre').toMatch(
    /^-?\d+\.\d+,-?\d+\.\d+$/,
  )

  // AC: a swipe must never be the ONLY way — the explicit controls exist, carry
  // real accessible names, and are >=44px.
  const prev = page.getByTestId('places-map-prev')
  const next = page.getByTestId('places-map-next')
  await expect(prev).toHaveAccessibleName(/previous/i)
  await expect(next).toHaveAccessibleName(/next/i)
  for (const control of [prev, next]) {
    const box = await control.boundingBox()
    if (box === null) throw new Error('a strip control has no box')
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
  }
  // At the first card, "Previous" is honestly disabled rather than a no-op.
  await expect(prev).toBeDisabled()

  // AC: the strip is horizontal snap scrolling and NOT a vertical page hijack.
  const strip = page.getByTestId('places-map-strip')
  const overflowX = await strip.evaluate((el) => getComputedStyle(el).overflowX)
  expect(overflowX, 'the strip scrolls horizontally').toBe('auto')
  const snapType = await strip.evaluate((el) => getComputedStyle(el).scrollSnapType)
  expect(snapType, 'the strip snaps').toContain('x')

  // MEASURED, and the reason this spec never fakes a swipe by assigning
  // `scrollLeft`: under `scroll-snap-type: x mandatory` Chromium clamps and
  // re-snaps the write, so the container settles on a SNAP POINT rather than
  // where the assignment put it. What is asserted is the fact that survives that
  // behaviour and matters: the FOCUS does not move on a programmatic write — the
  // strip only follows the settled geometry — and the page itself is untouched.
  // (The swipe spec drives the strip for real, and is where the focus move is
  // proven.)
  const pageScrollBefore = await page.evaluate(() => window.scrollY)
  await strip.evaluate((el) => {
    el.scrollLeft = el.clientWidth
  })
  await expect(page.getByTestId('places-map-card-0')).toHaveAttribute('aria-current', 'true')
  expect(
    await page.evaluate(() => window.scrollY),
    'a horizontal scroll inside the strip must not move the page',
  ).toBe(pageScrollBefore)
})

test('swiping the strip recentres the map, and a card opens its detail page (V24 s10)', async ({
  page,
}) => {
  await openMapView(page)
  const cardCount = await page.locator('[data-testid^="places-map-card-"]').count()
  expect(cardCount, 'the strip needs a second card to swipe to').toBeGreaterThan(1)
  const cardIds = await placeIds(page.locator('[data-testid^="places-map-card-"]'))

  // Baseline: card 0 is focused and the map says so.
  expect(await focusedPlaceId(page)).toBe(cardIds[0])
  await expect(page.getByTestId('places-map-card-0')).toHaveAttribute('aria-current', 'true')
  // The camera's own report BEFORE the swipe, to compare against afterwards.
  const centreBeforeSwipe = await mapCenter(page)

  // AC: THE SWIPE. The strip really moves, and the focus/map follow it.
  //
  // WHAT THIS DOES, and why it is a scroll of the real element. `scrollIntoView`
  // on the SECOND card is the input the strip is built for — a horizontal
  // scroll-snap scroller — and it is exactly what a thumb's fling resolves to:
  // the browser scrolls the container and the snap points settle on a card. It
  // is used instead of a synthesised touch drag because the app has no gesture
  // code to exercise (the requirement is CSS snap plus a scroll handler), and
  // instead of assigning `scrollLeft` because that write is NOT honoured under
  // `scroll-snap-type: x mandatory` — MEASURED, the container snapped straight
  // back and the strip was left focusing card 0.
  //
  // The focus is then read from the CARD's own `aria-current`, so the swipe is
  // proven to have changed what the strip considers focused rather than merely to
  // have scrolled the box.
  await page
    .getByTestId('places-map-card-1')
    .evaluate((el) => el.scrollIntoView({ behavior: 'instant', inline: 'center', block: 'nearest' }))

  // AC: the focused CARD moved to index 1 — asserted as an attribute, so a
  // mid-scroll position can never pass by accident.
  await expect(page.getByTestId('places-map-card-1')).toHaveAttribute('aria-current', 'true')
  await expect(page.getByTestId('places-map-card-0')).not.toHaveAttribute('aria-current', 'true')

  // AC: the MAP RECENTRED, proven by the observable attribute the slice exists
  // to expose. The polling expectation is deliberate: the scroll handler
  // intentionally coalesces to one animation frame, so the update is a frame
  // after the scroll rather than synchronous with it.
  await expect
    .poll(() => focusedPlaceId(page), {
      message: 'the map recentres on the card the swipe focused',
    })
    .toBe(cardIds[1])

  // AC: AND THE CAMERA ACTUALLY WENT THERE. `data-focused-place` above is the
  // caller's state and would say the same thing with the recentring call
  // deleted, so the recentre is proven twice more, from the map's side:
  //
  //  (a) the CAMERA's report changed — `data-map-center` is Leaflet's own
  //      `getCenter()` on `moveend`, so a camera that did not pan keeps the old
  //      value and this fails;
  //  (b) the FOCUSED PIN's own position converged on the pane's centre, measured
  //      from the two elements' rects. No tile, no colour, no easing timing.
  await expect
    .poll(() => mapCenter(page), {
      message:
        "the camera's own report moves to the focused place — a deleted recentre " +
        'leaves the old centre and fails here',
    })
    .not.toBe(centreBeforeSwipe)
  // AC: AND THE MARK IS NOW ON THE OTHER PIN, ALONE. The uniqueness assertion is
  // repeated here rather than only on first mount: this pass runs AFTER a focus
  // change, which is the moment a stale attribute could survive on the previously
  // focused marker and leave two pins claiming the focus.
  const focusedAfterSwipe = page.locator('[data-focused-marker]')
  await expect(focusedAfterSwipe, 'exactly one pin is focused after the focus moved').toHaveCount(1)
  await expect(focusedAfterSwipe).toHaveAttribute('data-focused-marker', cardIds[1] ?? '')

  // AC: AND IT IS DRAWN BIGGER. The camera has just centred on this pin, so it
  // is on the pane by definition: its rendered box is real AND its path carries
  // the arc Leaflet computed for it. Both are asserted, because they are the two
  // sides of "visually distinguished" — the geometry the browser painted and the
  // geometry Leaflet derived from the component's options.
  const focusedPinNow = page.locator('[data-focused-marker]')
  const focusedRadius = await drawnMarkerRadius(focusedPinNow)
  expect(focusedRadius, 'the focused pin is drawn as a circle, not a culled path').not.toBeNull()
  // The comparison number is a plain pin's OWN drawn radius when one is on the
  // pane; 8 (the component's base radius) is the fallback for a view where every
  // plain pin is culled — see `PlacesMap`'s marker options.
  const plainRadius = (await plainPinDrawnRadius(page)) ?? 8
  expect(
    focusedRadius ?? 0,
    `the focused pin's drawn radius (${String(focusedRadius)}) is larger than a plain pin's (${plainRadius})`,
  ).toBeGreaterThan(plainRadius)
  const focusedBox = await focusedPinNow.boundingBox()
  if (focusedBox === null) throw new Error('the focused pin has no box after the recentre')
  expect(
    Math.max(focusedBox.width, focusedBox.height),
    'the focused pin has a real, non-zero drawn size on the pane',
  ).toBeGreaterThan(0)

  // AC: TAPPING A CARD OPENS THAT PLACE'S DETAIL PAGE. The card is a react-router
  // Link, so this is a real navigation and the URL names the SAME place the card
  // carried — not merely "some place page".
  const focusedCard = page.getByTestId('places-map-card-1')
  const cardNameText = (await focusedCard.innerText()).split('\n')[0] ?? ''
  await focusedCard.click()
  await expect(page).toHaveURL(new RegExp(`/place/${cardIds[1]}$`))
  await expect(page.locator('body')).toContainText(cardNameText)
})

test('the strip is fully operable with the keyboard alone (V24 s10)', async ({ page }) => {
  // The map view is opened WITHOUT a click, because the click would leave the
  // focus on the entry control and this spec is about the tab path INTO the
  // strip. The focus is placed on that same entry control instead, so every
  // press below is a real traversal step rather than a jump.
  await openMapViewByKeyboardEntry(page)
  const cardIds = await placeIds(page.locator('[data-testid^="places-map-card-"]'))
  expect(cardIds.length, 'the keyboard spec needs at least three cards').toBeGreaterThan(2)

  // AC: THE STRIP IS REACHABLE BY REAL TAB PRESSES. A focus placed with a test
  // API would prove only that the element is focusable — every `<a href>` is —
  // and would not prove that a keyboard user can ARRIVE at it. So this walks the
  // real focus order with real key events and fails if it never lands.
  //
  // The walk is bounded (`TAB_LIMIT`) rather than while(true): a strip that
  // became unreachable would otherwise hang the spec instead of failing it. The
  // limit is deliberately tight — MEASURED, card 0 is the seventh stop after
  // "Back to list" (the map's own focusable container and its four Leaflet
  // controls sit in between) — because a loose limit would pass while the strip
  // was technically reachable and practically buried.
  const activeTestId = () =>
    page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null)
  const TAB_LIMIT = 15
  const walked: string[] = []
  let reached = false
  while (walked.length < TAB_LIMIT) {
    await page.keyboard.press('Tab')
    const id = (await activeTestId()) ?? '(no test id)'
    walked.push(id)
    if (id.startsWith('places-map-card-')) {
      reached = true
      break
    }
  }
  expect(
    reached,
    `the strip must be reachable within ${TAB_LIMIT} Tab stops of the map view's first control; ` +
      `walked: ${walked.join(' > ')}`,
  ).toBe(true)
  // AC: THE FIRST CARD IS THE FIRST STOP IN THE STRIP — the traversal cannot
  // skip a card and still pass, and the strip is entered at its beginning.
  expect(await activeTestId(), 'the first card is the first strip stop in tab order').toBe(
    'places-map-card-0',
  )

  // AC: THE CLAMP IS VISIBLE AT THE START. Card 0 is focused (just proven), so
  // "Previous" is honestly DISABLED rather than a control that looks live and
  // does nothing — that is the user-facing half of "nextCardIndex clamps".
  await expect(
    page.getByTestId('places-map-prev'),
    'at the first card there is no earlier card, so Previous is disabled',
  ).toBeDisabled()

  // AC: NO PIN IS A TAB STOP (ocr finding 6). The place pins, the home pin and the
  // radius circle are all reading aids or pointer affordances; a keyboard user
  // reaches places through the cards and the list, not by tabbing through a few
  // hundred SVG paths. `tabindex="-1"` is written on every one of them, so this
  // walks them all rather than sampling.
  //
  // NON-VACUITY FIRST (review fix 4): the list comprehension below is empty for
  // TWO unrelated reasons — every path carries `tabindex="-1"` (correct) or
  // there is no path AT ALL (a broken map, a culled layer, the wrong page). The
  // previous version of this assertion could not tell them apart and passed on
  // an empty page. The count assertion makes the empty page a FAILURE, so the
  // `unstoppable` assertion is now about the tab order and nothing else.
  const leafletPathCount = await page.locator('.leaflet-interactive').count()
  expect(
    leafletPathCount,
    'there must be Leaflet paths on this map, or "no pin is a tab stop" is a ' +
      'statement about an empty page rather than about the pins',
  ).toBeGreaterThan(0)
  const unstoppable = await page.evaluate(() => {
    const paths = Array.from(document.querySelectorAll('.leaflet-interactive'))
    return paths
      .filter((el) => el.getAttribute('tabindex') !== '-1')
      .map((el) => el.getAttribute('fill') ?? el.tagName)
  })
  expect(unstoppable, 'every Leaflet path must be out of the tab order').toEqual([])

  // AC: ArrowRight moves the focus to the next card AND recentres the map.
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('places-map-card-1')).toHaveAttribute('aria-current', 'true')
  expect(
    await page.evaluate(() => document.activeElement?.getAttribute('data-testid')),
    'the DOM focus follows the index, or the next keypress would land elsewhere',
  ).toBe('places-map-card-1')
  await expect
    .poll(() => focusedPlaceId(page), { message: 'ArrowRight recentres the map' })
    .toBe(cardIds[1])
  await expectPinCentredOnMap(page)

  // AC: ArrowRight again, and the map follows without a pointer ever touching the
  // strip.
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('places-map-card-2')).toHaveAttribute('aria-current', 'true')
  await expect
    .poll(() => focusedPlaceId(page), { message: 'a second ArrowRight recentres the map' })
    .toBe(cardIds[2])

  // AC: ArrowLeft goes back, and the map follows in that direction too.
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByTestId('places-map-card-1')).toHaveAttribute('aria-current', 'true')
  await expect
    .poll(() => focusedPlaceId(page), { message: 'ArrowLeft recentres the map back' })
    .toBe(cardIds[1])

  // AC: NEXT/PREVIOUS are the pointer half of the same rule — a swipe is not the
  // only way, and neither is the keyboard.
  await page.getByTestId('places-map-next').click()
  await expect
    .poll(() => focusedPlaceId(page), { message: 'Next recentres the map' })
    .toBe(cardIds[2])
  await page.getByTestId('places-map-prev').click()
  await expect
    .poll(() => focusedPlaceId(page), { message: 'Previous recentres the map' })
    .toBe(cardIds[1])
})

test('"Back to list" restores the same list, its filters and its scroll position (V24 s10)', async ({
  page,
}) => {
  await page.goto('/browse')
  await settleOnRoute(page, '/browse')
  await setAnyDistance(page)
  await page.getByTestId('places-search').fill('park')
  await expect(page.getByTestId('place-row').first()).toBeVisible()
  // Two further, independent directories of state the round trip must survive:
  // the indoor/outdoor toggle and the filter modal's SORT.
  //
  // The sort is chosen deliberately over the date chips: a date window can (and,
  // for `park` + indoor + Tomorrow, does) narrow the set to nothing, which would
  // leave the map view with no card to open its entry control from. Sorting only
  // REORDERS, so the round trip is exercised against a live, non-empty list.
  //
  // V27: the indoor toggle is now the type dropdown's "Indoor" option.
  await page.getByTestId('places-type-filter').click()
  await page.getByTestId('places-type-sheet-option-indoor').click()
  await page.getByTestId('filter-sort-btn').click()
  await page.getByTestId('filter-sort-select').selectOption('newest')
  await page.getByTestId('filter-apply-btn').click()
  // The option carries the state; reopen the sheet to read it.
  await page.getByTestId('places-type-filter').click()
  await expect(page.getByTestId('places-type-sheet-option-indoor')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByTestId('places-type-sheet-close').click()
  await expect(page.getByTestId('place-row').first()).toBeVisible()
  const names = await listNames(page)

  /**
   * A temporary SPACER, and it is what makes the scroll half of this spec
   * deterministic rather than a measure of the harness.
   *
   * MEASURED: the filters above leave only TWO rows on the seeded directory, so
   * on Playwright's 1280x720 viewport the whole page is ~1053px tall. A page
   * that short has no scroll to lose, so "the offset came back" would be
   * vacuously true (0 === 0) and the round trip would have nothing to prove.
   * Widening the set instead would make the spec depend on the seed.
   *
   * The spacer gives the document a scrollRange without touching the
   * directory's own DOM, and it is removed on the way out so nothing leaks into
   * a later assertion in this page.
   */
  await page.evaluate(() => {
    const spacer = document.createElement('div')
    spacer.id = 'scroll-range-probe'
    spacer.style.height = '1800px'
    document.body.appendChild(spacer)
  })
  const seeMap = page.getByTestId('places-view-toggle')
  // V27: the floating toggle only renders once the page is scrolled, and the
  // spacer above guarantees a scroll range. Park the page away from the top so
  // the round trip has a real offset to restore.
  //
  // Scroll FIRST, then wait: the read below must capture the offset the parent
  // left, not a number from inside the same task as the scroll.
  await page.evaluate(() => window.scrollTo(0, 250))
  await expect(seeMap).toBeVisible()
  await page.waitForTimeout(200)
  const savedScroll = await page.evaluate(() => window.scrollY)
  expect(
    savedScroll,
    'the page must be scrolled away from the top for this to be a real check',
  ).toBeGreaterThan(0)

  await seeMap.click()
  await expect(page.getByTestId('places-map-view-map')).toBeVisible()

  // AC: "Back to list" exists, is a real control, and returns to the LIST.
  const back = page.getByTestId('places-back-to-list')
  await expect(back).toBeVisible()
  await expect(back).toHaveAccessibleName(/back to list/i)
  const backBox = await back.boundingBox()
  if (backBox === null) throw new Error('the Back to list control has no box')
  expect(backBox.height).toBeGreaterThanOrEqual(44)
  await back.click()

  // AC: the LIST is back — V25 t01's shape, so the assertion is the list's own
  // rows plus NO map at all (the band that used to come back is gone), and there
  // is still exactly ONE map mounted while the map view is up, because its map
  // is unmounted rather than hidden.
  await expect(page.getByTestId('place-row').first()).toBeVisible()
  await expect(page.getByTestId('places-map-band')).toHaveCount(0)
  await expect(page.getByTestId('places-map')).toHaveCount(0)
  await expect(page.getByTestId('places-map-view-map')).toHaveCount(0)

  // AC: the SCROLL POSITION came back, to the exact offset the parent left, and
  // it is asserted FIRST — before any other control is driven.
  //
  // WHY THE ORDER MATTERS, and it is MEASURED: opening a fixed-position modal
  // (the Filter & sort dialog, asserted further down) scrolls the page, because
  // a closed <dialog>-shaped overlay is only reachable once the browser brings
  // the control that opens it into view. The restore had ALREADY PUT the page
  // back at the right offset; a later assertion then moved it. Checking the
  // restore immediately after the return measures the restore instead of the
  // harness.
  //
  // The poll (not a single sample) is for the other half: the restore runs in an
  // effect after the list re-renders, and it uses the reduced-motion-derived
  // scroll behaviour — smooth by default — so the page arrives over a few frames.
  await expect
    .poll(() => page.evaluate(() => window.scrollY), {
      message: 'the list scroll position is restored on the way back',
    })
    .toBe(savedScroll)

  // AC: THE SAME LIST — same rows, same order.
  expect(await listNames(page)).toEqual(names)

  // AC: the FILTER STATE survived the round trip. Asserted from the CONTROLS,
  // not from the result count: a filter that silently reset could still leave a
  // same-sized list behind, and the control is the state itself.
  // V27: the query is readable from the inline input's value; the type and
  // distance state lives in their sheets, so each is reopened and its option
  // checked.
  await expect(page.getByTestId('places-search')).toHaveValue('park')
  await page.getByTestId('places-type-filter').click()
  await expect(page.getByTestId('places-type-sheet-option-indoor')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByTestId('places-type-sheet-close').click()
  await page.getByTestId('places-distance-filter-btn').click()
  await expect(page.getByTestId('places-distance-sheet-option-any')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByTestId('places-distance-sheet-close').click()
  // The sort lives behind the modal, so it is read from the control that owns it.
  await page.getByTestId('filter-sort-btn').click()
  await expect(page.getByTestId('filter-sort-select')).toHaveValue('newest')
  await page.getByTestId('filter-apply-btn').click()

  // Nothing leaks: the probe spacer leaves with the spec that made it.
  await page.evaluate(() => document.getElementById('scroll-range-probe')?.remove())
})

/**
 * The one thing the four specs above deliberately do NOT assert: that no map
 * node survives while the map view is up. It is asserted in the first spec
 * through its own test id (count 0 for `places-map`), and the trap is about the
 * MAP's id rather than a wrapper — so the absence is checked where the round trip
 * lands rather than duplicated here.
 *
 * V25 t01: list view mounts NO map at all, so `places-map-band` is a count-0
 * assertion wherever the list is showing (see the round-trip spec above).
 */
test('a tapped pin\'s panel survives a focus move (V24 s10)', async ({ page }) => {
  /**
   * THE SPEC THAT WOULD HAVE CAUGHT THE POPUP TEARDOWN.
   *
   * Moving the focus used to REBUILD the marker group, and Leaflet's
   * `LayerGroup.remove()` closes each marker's popup — so a parent who tapped a
   * pin to read about a place and then moved the strip lost the panel they were
   * reading. Nothing in this spec tapped a pin, so nothing could fail. This one
   * does, on the focused pin (which the recentre above guarantees is on the
   * pane), then moves the focus and asserts the panel is still there and still
   * the SAME place.
   */
  await openMapView(page)
  const cardIds = await placeIds(page.locator('[data-testid^="places-map-card-"]'))
  expect(cardIds.length).toBeGreaterThan(1)

  // Move the focus once so the pin is centred and therefore tappable.
  await page.getByTestId('places-map-next').click()
  await expectPinCentredOnMap(page)

  const focusedPin = page.locator('[data-focused-marker]')
  const panel = page.getByTestId('place-marker-info')
  await expect(panel, 'no panel is open before the tap').toHaveCount(0)
  await focusedPin.click()
  await expect(panel, 'tapping a pin opens its panel').toBeVisible()
  const focusedName = (await focusedPin.evaluate((el) => el.getAttribute('data-focused-marker'))) ?? ''
  const panelTextBefore = await panel.innerText()
  expect(
    panelTextBefore.length,
    'the panel has real content (the place the pin belongs to)',
  ).toBeGreaterThan(0)
  expect(focusedName).not.toBe('')

  // AC: THE PANEL IS STILL OPEN AFTER THE FOCUS MOVES, and it is still the panel
  // for the pin that was tapped — not an empty bubble, and not a different place.
  await page.getByTestId('places-map-next').click()
  await expect(panel, 'the tapped pin\'s panel survives a focus move').toBeVisible()
  expect(await panel.innerText()).toBe(panelTextBefore)
  // The focus really did move (otherwise this spec would prove nothing about a
  // focus change at all): the marked pin is now a different place.
  await expect(page.locator('[data-focused-marker]')).not.toHaveAttribute(
    'data-focused-marker',
    focusedName,
  )
})

test('narrowing the map view to zero pins and widening again leaves a live map — a viewer WITH a home pin (V24 s10)', async ({
  page,
}) => {
  /**
   * THE DEAD-MAP DEFECT (ocr HIGH), on the branch a SEEDED VIEWER can reach.
   *
   * THE DEFECT: `PlacesMap`'s Leaflet instance is created by an effect whose
   * dependency list is EMPTY and which skips when there are no markers to draw
   * (`PlaceMap.tsx:346-348`, deps `[]` at `:387`). So an instance attached to a
   * container that has been torn out from under it never gets re-created, and
   * `map.remove()` never runs — the pane stays blank for good after the search is
   * widened again.
   *
   * THE FIX: the map view decides whether to mount a map at all, ABOVE the
   * component that owns the pitfall (`shouldRenderPlacesMap`, `src/lib/mapStrip.ts`),
   * so React unmounts `PlacesMap` — running its cleanup — exactly when there is
   * nothing to draw.
   *
   * WHICH BRANCH THIS SPEC PROVES, MEASURED, and it is the WEAKER of the two:
   * the seeded marker always has a home pin, so shrinking the search to nothing
   * leaves `pins: []` with `homePin !== null` — the case where the guard says
   * KEEP the map, with the home pin as its only content. `shouldRenderPlacesMap`
   * returns `true` on this branch, so this spec is satisfied by the UNFIXED code
   * as well as by the fix: it is a live property of the reachable path, NOT
   * evidence for the guard. The guard's own branch (`0 pins && null home pin`) is
   * proven in a browser by the NEXT spec, `no home pin: …` — which is red when the
   * guard is removed. This one is kept for what it does prove: the zero-pin
   * branch that a normal viewer hits keeps a working camera, and no second
   * Leaflet container leaks.
   */
  await openMapView(page)
  const mapViewMap = page.getByTestId('places-map-view-map')
  await expect(mapViewMap).toBeVisible()
  await expect
    .poll(() => placePinCount(mapViewMap), { message: 'the map view starts with pins' })
    .toBeGreaterThan(0)

  // SHRINK to zero matching rows: the strip empties and the map has no places.
  // V27: the always-visible inline input filters the map live as it is typed.
  await page.getByTestId('places-search').fill('zzzz-no-such-place-at-all-zzzz')
  await expect(page.getByTestId('places-map-list').locator('a')).toHaveCount(0)
  await expect(page.locator('[data-testid^="places-map-card-"]')).toHaveCount(0)
  expect(await placePinCount(mapViewMap), 'no place pins remain').toBe(0)

  // AC (a): THE CAMERA IS STILL LIVE ON THE EMPTIED MAP. A map left pointing at a
  // destroyed div reports no centre at all; this one still reports real
  // coordinates, because the container it lives in was never torn out from under
  // it.
  await expect
    .poll(() => mapCenter(page), { message: 'the emptied map still reports a live camera' })
    .toMatch(/^-?\d+\.\d+,-?\d+\.\d+$/)

  // WIDEN: the search is cleared and the map must be fully working again.
  await page.getByTestId('places-search').fill('park')
  await expect(page.getByTestId('places-map-view-map')).toBeVisible()
  await expect
    .poll(() => placePinCount(page.getByTestId('places-map-view-map')), {
      message: 'pins are drawn again after the widen',
    })
    .toBeGreaterThan(0)
  await expect
    .poll(() => mapCenter(page), { message: 'the widened map reports a live camera' })
    .toMatch(/^-?\d+\.\d+,-?\d+\.\d+$/)

  // AC (b): the strip is populated again and the focus has been re-established.
  await expect(page.locator('[data-testid^="places-map-card-"]').first()).toBeVisible()
  await expect(page.getByTestId('places-map-card-0')).toHaveAttribute('aria-current', 'true')

  // AC (c): NO LEAKED LEAFLET INSTANCE. The emptied map kept its companion alive,
  // so there must still be exactly one Leaflet container inside this one map, and
  // exactly one map container in the document.
  // The map's own container IS the Leaflet container, so the check is that the
  // document holds exactly one of them — no second instance alongside this one.
  expect(
    await page.locator('.leaflet-container').count(),
    'exactly one Leaflet container exists in the document (no leak alongside it)',
  ).toBe(1)
  await expect(page.getByTestId('places-map-view-map')).toHaveCount(1)
})

/**
 * THE MISSING EVIDENCE (fresh-context review of fix 3): the branch of
 * `shouldRenderPlacesMap` that ACTUALLY CHANGES behaviour, proven in a browser.
 *
 * WHY THE PREVIOUS SPEC COULD NOT FAIL FOR THE DEFECT IT NAMED, stated as the
 * reviewer stated it: on the seeded viewer's branch (`pins: []` WITH a home pin)
 * `shouldRenderPlacesMap(0, HOME)` is `true` (`src/lib/mapStrip.ts`), so the fix
 * renders the IDENTICAL element with IDENTICAL props as the unfixed `a35f9cf` —
 * every assertion in that spec is satisfied by the unfixed code too. The branch
 * the guard exists for is the one where the predicate FLIPS: `homePin === null`,
 * where the guard replaces a mounted map with the empty state
 * (`PlacesMapView.tsx`, the `shouldRenderPlacesMap(...) ? … : <p
 * data-testid="places-map-view-empty">` ternary). Until this spec, that branch
 * had no test at all outside `shouldRenderPlacesMap`'s unit test, and
 * `places-map-view-empty` was referenced by nothing in the repo.
 *
 * HOW A HOME-PIN-LESS VIEWER IS REACHED WITHOUT NEW TOOLING, and why the other
 * door was refused:
 *
 *  - The repo has NO component-test toolchain (no jsdom, no
 *    `@testing-library/react`), so `vi.mock('./PlaceMap')` is not available, and
 *    this slice may not add a dependency to get it. A browser spec is the honest
 *    alternative, and it is strictly stronger: it exercises React's real unmount
 *    and `map.remove()`.
 *  - A THROWAWAY SIGNUP with an out-of-extract zip would create an account (a
 *    fixture the sweep has to find) for a two-line state change.
 *  - `home_zip = NULL` is NOT the way, MEASURED IN THE CODE: the app shell's
 *    onboarding gate keys on `homeZipSet` (`src/App.tsx` →
 *    `resolveOnboardingGate`, `src/lib/onboarding.ts`), so a null home zip
 *    bounces `/browse` to `/onboarding` and the viewer never reaches the map.
 *    `BrowsePage.tsx`'s `homePinCoords` has TWO null doors — "unset" and "absent
 *    from the gazetteer" — and only the second one leaves the app usable.
 *
 * So the spec writes an OUT-OF-EXTRACT zip onto the marker's own profile row
 * (`NO_HOME_PIN_ZIP`, the marker's own JWT over REST — the app's write path and
 * RLS policy, the `feed-empty-state.e2e.ts` precedent), restores the previous
 * value in a `finally`, and fails the run if the restore does not land. It is
 * scoped to that one row and to this one spec: `workers: 1` and spec-level
 * ordering mean no other signed-in viewer is looking at the value while it is
 * changed.
 *
 * WHAT IT ASSERTS, in the order the branch changes:
 *  (a) the branch is genuinely the home-pin-less one — the map view is up with
 *      pins and NO red home marker, and exactly one live Leaflet container;
 *  (b) narrowing to zero pins removes BOTH the map's test id AND every
 *      `.leaflet-container`, and renders `places-map-view-empty` — the guard's
 *      reachable effect. (The container count below would ALSO fail on an
 *      unfixed build, because `PlaceMap.tsx`'s early return
 *      `entries.length === 0 && homePin === undefined && homePin === null` is an
 *      unsatisfiable conjunction — so the unfixed map never tears its own
 *      container out. MEASURED in the mutation run: the empty-state assertion
 *      above catches the mutation first, so that is the failure the run reports.)
 *  (c) widening draws pins again in exactly ONE container, with a live camera and
 *      one `[data-focused-marker]` — i.e. the instance really was destroyed and
 *      re-created rather than left pointing at a container that no longer exists.
 *
 * MUTATION-CHECKED (the review asked for exactly this): with
 * `shouldRenderPlacesMap` mutated to `return true` — the guard removed — (b)
 * fails. Paste of both runs is in the fix-round report; the tree is NOT left
 * mutated.
 */
test('no home pin: zero pins render the empty state (no Leaflet container), and widening brings the map back (V24 s10)', async ({
  page,
}) => {
  const previous = await readMarkerHomeZip()
  if (previous === undefined) {
    throw new Error(
      'the marker home_zip could not be read over REST — a restore would be a guess, so the ' +
        'spec stops before writing anything',
    )
  }
  expect(previous, 'the marker must start WITH a home zip, or the restore has no meaning').not.toBeNull()

  try {
    expect(
      await patchMarkerHomeZip(NO_HOME_PIN_ZIP),
      'the out-of-extract home_zip write must land',
    ).toBe(true)
    // Settle the location BEFORE the app loads: a stale profile would make every
    // assertion below describe a race rather than the branch.
    expect(
      await readMarkerHomeZip(),
      'the out-of-extract zip must be stored before the app loads',
    ).toBe(NO_HOME_PIN_ZIP)

    await openMapView(page)
    const mapViewMap = page.getByTestId('places-map-view-map')
    await expect(mapViewMap).toBeVisible()
    await expect
      .poll(() => placePinCount(mapViewMap), { message: 'the map view starts with pins' })
      .toBeGreaterThan(0)

    // (a) THE BRANCH IS REAL. The home pin is the red circle marker (radius 10,
    // `#dc2626`) and the map view passes no radius circle — so a red path here
    // would BE the home pin. Asserted AFTER the pins are drawn, because the home
    // pin and the place pins are built by effects on the same commit: if the
    // place pins are on the map, a home pin would be too, so 0 is the branch and
    // not a slow effect.
    await expect(
      page.locator('.leaflet-interactive[fill="#dc2626"]'),
      'this viewer must genuinely have NO home pin, or the spec is on the wrong branch',
    ).toHaveCount(0)
    // …and the map that must later be destroyed is live and singular now.
    await expect(
      page.locator('.leaflet-container'),
      'exactly one live Leaflet container while there are pins to draw',
    ).toHaveCount(1)

    // (b) SHRINK to zero matching rows. With the guard, this is the moment
    // `shouldRenderPlacesMap(0, null)` goes false and React UNMOUNTS `PlacesMap`.
    // V27: the always-visible inline input filters live as it is typed.
    await page.getByTestId('places-search').fill('zzzz-no-such-place-at-all-zzzz')
    await expect(page.getByTestId('places-map-list').locator('a')).toHaveCount(0)
    await expect(page.locator('[data-testid^="places-map-card-"]')).toHaveCount(0)

    // THE GUARD'S OWN OBSERVABLE: the empty state, which exists ONLY on this
    // branch and is rendered by nothing else in the app.
    await expect(
      page.getByTestId('places-map-view-empty'),
      'with nothing to draw AND no home pin, the map view must render its empty state',
    ).toBeVisible()
    // AND NOTHING LEAFLET SURVIVES IT — asserted as a COUNT, retried, so an
    // instance left attached to a destroyed div (the defect) cannot pass: the
    // unfixed code keeps its container here, which is what this catches.
    await expect(
      page.locator('.leaflet-container'),
      'the empty branch must not leave a Leaflet container behind',
    ).toHaveCount(0)
    await expect(page.getByTestId('places-map-view-map')).toHaveCount(0)

    // (c) WIDEN. The component mounts again, so the once-per-mount creation
    // effect runs again — the half that a killed instance makes impossible.
    await page.getByTestId('places-search').fill('park')
    await expect(page.getByTestId('places-map-view-map')).toBeVisible()
    await expect
      .poll(() => placePinCount(page.getByTestId('places-map-view-map')), {
        message: 'pins are drawn again after the widen',
      })
      .toBeGreaterThan(0)
    await expect(
      page.locator('.leaflet-container'),
      'the widened map is exactly ONE re-created Leaflet container (not a dead one, not two)',
    ).toHaveCount(1)
    await expect
      .poll(() => mapCenter(page), { message: 'the re-created map reports a live camera' })
      .toMatch(/^-?\d+\.\d+,-?\d+\.\d+$/)
    await expect(
      page.locator('[data-focused-marker]'),
      'the re-created map paints the focused pin, so it is drawing and not a blank pane',
    ).toHaveCount(1)
    await expect(page.getByTestId('places-map-card-0')).toHaveAttribute('aria-current', 'true')
  } finally {
    // ALWAYS, including on a failed assertion above: the marker's home zip goes
    // back, and a restore that does not land fails the run loudly rather than
    // silently breaking every later spec that needs a home pin.
    await restoreMarkerHomeZip(previous)
  }
})

test('a second "See map" activation does not disturb the saved list offset (V24 s10)', async ({
  page,
}) => {
  /**
   * THE RE-ENTRANCY DEFECT (ocr MEDIUM). The controls card — and so the "See map"
   * button — stays mounted in the map view, which means it can be activated
   * again. That second activation used to overwrite the saved list offset with
   * the MAP VIEW's `window.scrollY` (a number from a different, shorter
   * document), so the next "Back to list" restored the wrong position.
   *
   * V27: THE PREMISE IS GONE. The in-card "See map" button is removed, and the
   * one floating control renders as "List" in map view and calls `backToList` —
   * it never calls `openMapView` a second time. There is therefore no UI path
   * that reaches the re-entrancy guard any more. The spec is left in place (not
   * deleted) for the day a re-entrant entry point returns, and skipped loudly.
   */
  test.fixme(
    true,
    'V27: in-card "See map" removed; the map view toggle is "List", so the second-activation re-entrancy path no longer exists',
  )
  await page.goto('/browse')
  await settleOnRoute(page, '/browse')
  await setAnyDistance(page)
  await page.getByTestId('places-search').fill('park')
  await expect(page.getByTestId('place-row').first()).toBeVisible()

  // Park the list at a known, non-zero offset (see the scroll-restore spec for
  // why a spacer is needed on this seed).
  await page.evaluate(() => {
    const spacer = document.createElement('div')
    spacer.id = 'scroll-range-probe'
    spacer.style.height = '1800px'
    document.body.appendChild(spacer)
  })
  const seeMap = page.getByTestId('places-see-map')
  await seeMap.scrollIntoViewIfNeeded()
  await page.evaluate(() => window.scrollBy(0, 250))
  await page.waitForTimeout(200)
  const savedBefore = await page.evaluate(() => window.scrollY)
  expect(savedBefore, 'the list must be parked away from the top').toBeGreaterThan(0)

  await seeMap.click()
  await expect(page.getByTestId('places-map-view-map')).toBeVisible()

  /**
   * THE MAP VIEW IS SCROLLED FURTHER DOWN THAN THE LIST CAN GO.
   *
   * This is what makes the corruption DETECTABLE, and it was MEASURED: with the
   * guard removed the spec still passed on the first attempt, because the map
   * view and the list happened to be at the same offset — a corruption that
   * writes the same number is invisible. The map view is the taller document (the
   * strip and the linear list are metres of content below the map), so scrolling
   * it to the bottom and then reading the offset produces a number the LIST
   * cannot reach. The corruption then restores to the list's clamped maximum,
   * which is a different number, and the assertion below fails.
   */
  const listMaxScroll = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  )
  // The probe spacer is GROWN while the map view is up. The list's own height is
  // fixed by the seed, so this is the only way to park the map view at an offset
  // the list cannot reach — and an offset the list cannot reach is what turns the
  // corruption into a visible difference rather than a same-number no-op.
  await page.evaluate(() => {
    const spacer = document.getElementById('scroll-range-probe')
    if (spacer !== null) spacer.style.height = '5000px'
  })
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await page.waitForTimeout(200)
  const mapViewScroll = await page.evaluate(() => window.scrollY)
  expect(
    mapViewScroll - listMaxScroll,
    'the map view must be scrollable WELL past the list for this to be a real check',
  ).toBeGreaterThan(1000)

  /**
   * NOW THE CORRUPTION PATH: with the map view up, activate "See map" AGAIN.
   *
   * The activation is dispatched on the DOM, not clicked, and that is MEASURED
   * rather than convenient: the button lives far above this offset, so a real
   * click would have Playwright scroll it into view first and the page would move
   * for a reason that has nothing to do with the guard. Dispatching the event
   * leaves the offset where the test put it, which is the state the guard has to
   * defend. (The click path itself is covered by every other spec here, which
   * clicks this control normally.)
   */
  const activated = await page.evaluate(() => {
    const button = document.querySelector('[data-testid="places-see-map"]')
    if (button === null) return false
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return true
  })
  expect(activated, 'the See map control must still be mounted in the map view').toBe(true)
  // The guard makes that a no-op, so the view is still the map view...
  await expect(page.getByTestId('places-map-view-map')).toBeVisible()
  // ...and the page did not jump.
  expect(await page.evaluate(() => window.scrollY)).toBe(mapViewScroll)

  // AC: AND THE SAVED OFFSET SURVIVED IT. Without the guard this activation
  // would have written the map view's offset (larger than the list can even
  // reach) over the saved one, and the restore below would land at the list's
  // clamped maximum instead of where the parent left off.
  await page.getByTestId('places-back-to-list').click()
  // V25 t01: the list mounts NO map, so "back to the list" is asserted by the
  // absence of every map rather than by the retired band's id.
  await expect(page.getByTestId('places-map')).toHaveCount(0)
  await expect(page.getByTestId('places-map-view-map')).toHaveCount(0)
  await expect(page.getByTestId('place-row').first()).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => window.scrollY), {
      message: 'the saved offset is the one from the LIST, not from the map view',
    })
    .toBe(savedBefore)

  await page.evaluate(() => document.getElementById('scroll-range-probe')?.remove())
})

test('map mode draws the radius circle, and the radius cannot move the camera (V25 t01)', async ({
  page,
}) => {
  /**
   * V20 t05's live preview, RESTORED ON THE SURFACE THAT IS LEFT — the half that
   * needs no third-party service.
   *
   * That spec measured the list-view band's circle: dragging the radius slider
   * made the red circle grow on the map. V25 t01 removes the band, so the
   * preview has to happen in map mode or not at all. Two claims, each able to
   * fail alone:
   *
   *   1. THE CIRCLE IS DRAWN — the committed-radius frame, on the only map the
   *      page has. Its `d` path is drawn geometry, not an intention.
   *   2. THE CAMERA DOES NOT MOVE. This is the constraint that made threading a
   *      circle into this map dangerous: `PlacesMap`'s circle effect used to
   *      re-pin the camera on every render, and the map view's focused card owns
   *      the view. It now yields when a `focusPlaceId` is passed; without that
   *      yield this assertion fails.
   *
   * The REDRAW half (the slider growing the circle) needs a preview CENTRE, so
   * it lives in the next spec with a stubbed geocoder — the old spec relied on
   * the live Nominatim service being up, which is a flake, not a check.
   */
  await openMapView(page)
  const map = page.getByTestId('places-map-view-map')
  const circle = page.locator('path.leaflet-interactive[stroke="#dc2626"][fill-opacity="0.08"]')

  // The committed-radius circle is drawn on mount.
  await expect(circle, 'map mode must draw the radius circle').toHaveCount(1)
  const dBefore = await circle.getAttribute('d')
  const cameraBefore = await map.getAttribute('data-map-center')
  expect(dBefore, 'the drawn circle must have a path').toMatch(/^M/)
  expect(cameraBefore, 'the map must report its camera').toMatch(/^-?\d/)

  // The shared dialog is reachable from the controls card (it moved out of the
  // retired band's header), and its label tracks the slider.
  // V27: "Set location" is an inline icon button in the controls card; tapping
  // it hands off to the shared modal (the map stays mounted behind it).
  await page.getByTestId('set-location-btn').click()
  await expect(page.getByTestId('location-modal')).toBeVisible()
  const slider = page.getByTestId('location-radius-slider')
  await expect(slider).toBeVisible()
  await slider.fill('10')
  await expect(page.getByTestId('location-modal')).toContainText('10 miles')

  // AC: the circle is a READING AID, never a camera move.
  expect(
    await map.getAttribute('data-map-center'),
    'the radius must not move the camera — the focused card owns the view in map mode',
  ).toBe(cameraBefore)
  await page.getByTestId('location-modal-close').click()
  await expect(page.getByTestId('location-modal')).toHaveCount(0)
})

test('the radius preview REDRAWS the circle in map mode (V25 t01, V20 t05 live preview)', async ({
  page,
}) => {
  /**
   * THE FOUNDER'S LIVE PREVIEW: *"when you drag the radius, it should expand or
   * grow the red circle in real time."*
   *
   * WHERE IT LIVES NOW. The circle is drawn to scale at the current zoom, and it
   * follows the DRAFT radius only when the dialog has a preview CENTRE — the
   * committed frame is what it draws otherwise (`radiusPreviewCircle`,
   * `src/lib/places.ts`). So this spec stubs the geocoder rather than hoping
   * Nominatim answers: the preview needs a resolved address, and a check that
   * depends on a third party being up is a flake, not a check. The stub is a
   * real Street View of the seam — the app's own `geocodeAddress` turns this
   * response into a centre and everything after it is production code.
   */
  await page.route('https://nominatim.openstreetmap.org/search**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      // Green Lake, Seattle — a centre inside the seeded directory.
      body: JSON.stringify([{ lat: '47.6806', lon: '-122.3283' }]),
    })
  })

  await openMapView(page)
  const circle = page.locator('path.leaflet-interactive[stroke="#dc2626"][fill-opacity="0.08"]')
  await expect(circle, 'the committed circle must be drawn first').toHaveCount(1)
  const dCommitted = await circle.getAttribute('d')

  // V27: "Set location" is an inline icon button in the controls card; tapping
  // it hands off to the shared modal (the map stays mounted behind it).
  await page.getByTestId('set-location-btn').click()
  await expect(page.getByTestId('location-modal')).toBeVisible()
  await page.getByTestId('location-address-input').fill('Green Lake Park, Seattle')
  await page.getByTestId('location-see-places-btn').click()

  // The geocoded centre and its radius are now the preview's frame. The dialog
  // STAYS OPEN (`handleGeocode` only resolves the address — the radius slider
  // below is the point of the preview), so the same dialog is dragged next.
  await expect
    .poll(async () => circle.getAttribute('d'), {
      message: 'the geocoded centre must reframe the drawn circle',
    })
    .not.toBe(dCommitted)
  const dSmall = await circle.getAttribute('d')

  const slider = page.getByTestId('location-radius-slider')
  await expect(slider).toBeVisible()
  await slider.fill('10')
  await expect(page.getByTestId('location-modal')).toContainText('10 miles')
  await expect
    .poll(async () => circle.getAttribute('d'), {
      message: 'dragging the radius must redraw the circle in real time',
    })
    .not.toBe(dSmall)
  const dWide = await circle.getAttribute('d')

  // …and back down: the change tracks the RADIUS, not a one-way transition.
  await slider.fill('2')
  await expect(page.getByTestId('location-modal')).toContainText('2 miles')
  await expect.poll(async () => circle.getAttribute('d')).not.toBe(dWide)

  await page.getByTestId('location-modal-close').click()
  await expect(page.getByTestId('location-modal')).toHaveCount(0)
  await page.unroute('https://nominatim.openstreetmap.org/search**')
})

test('the map view leaves no second Leaflet container behind (V24 s10)', async ({ page }) => {
  await openMapView(page)
  const containers = await page.locator('.leaflet-container').count()
  expect(containers, 'exactly one Leaflet instance is live in the map view').toBe(1)
  await page.getByTestId('places-back-to-list').click()
  // V25 t01: back in list view there is NO map at all — the map view's own
  // Leaflet instance is the one that was destroyed.
  await expect(page.getByTestId('places-map')).toHaveCount(0)
  await expect(page.getByTestId('places-map-view-map')).toHaveCount(0)
  expect(
    await page.locator('.leaflet-container').count(),
    'the map view must leave no Leaflet container behind',
  ).toBe(0)
})

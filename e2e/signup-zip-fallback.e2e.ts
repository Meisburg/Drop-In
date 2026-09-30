/**
 * Spec (V28 slice 5): THE AREA CARD — ADDRESS-FIRST, ZIP AS FALLBACK
 * (decision 9).
 *
 * WHAT CHANGED. Before this slice the location step was a bare zip field +
 * radius (V28 slice 3b moved location onto the first run, slice 4a inserted
 * the kids card before it — the photo card slice 4b added and V28 r2 slice
 * 1b deleted, with the photo moving onto the name card in slice 2) — and
 * this spec pinned the now-removed promise that the signup path lands on
 * that step with NO fallback note (the signup-time geocode flag had no
 * producer left). Since
 * slice 5 the step IS the area card (4 of 4): the ADDRESS is the entry, and
 * its bounded Nominatim lookup (lib/geocode's locationFromAddressQueryBounded —
 * the pending-state rule's escape for a required, non-skippable card)
 * decides the card's shape. Two legs, both pinned HERE, because neither was
 * reachable without intercepting the card's Nominatim request:
 *
 * 1. A RESOLVED address (the request answers with a 5-digit postcode the
 *    gazetteer knows, and a house number — the precision rule's proof)
 *    writes the home zip with NO typed zip: the parent never sees the ZIP
 *    field or the fallback note, and the feed is about the resolved zip.
 * 2. AN UNRESOLVED address (the request answers empty) reveals the fallback:
 *    the in-card note (the first-use audit's "we couldn't match your
 *    address" explanation, ticket 02 — now the card's own in-card trigger)
 *    plus the ZIP field, with the parent's address preserved in its field.
 *    The typed zip + radius then finish the card, and the feed is about the
 *    typed zip.
 * 3. V28 slice 4 — THE CARD'S OWN MAP: the address resolves EARLY (on blur,
 *    debounced) through the same single request, so the card shows its pin
 *    + the radius circle while the parent still looks at it. This leg pins
 *    the three things a "no error" assertion cannot: the container is a
 *    live Leaflet map with BOTH overlays painted (not a blank bordered
 *    box), a radius change redraws the circle client-side with NO second
 *    request, and blur + Finish on the same address issue EXACTLY ONE
 *    Nominatim request (counted into the seam's route).
 * 4. V28 slice 4 fix 1 — THE CARD'S MAP SHOWS THE CURRENT ADDRESS'S
 *    RESOLUTION, OR NOTHING. Two legs pin the two faces of that invariant:
 *    a stale settle (an in-flight lookup for a PREVIOUS address) can never
 *    republish its pin over the edited text, and editing an address and
 *    back re-resolves it — a resolved address never leaves the map hidden.
 * V28 slice 6 (plan defect #19): BOTH legs' area-card save now lands on the
 * run's OWN finish card on /onboarding (the re-keyed guard removed the feed
 * bounce) — each leg taps its "Go to your feed" CTA before asserting the
 * feed, and the finish card is itself asserted (testid) on the way.
 *
 * WHY A FRESH CONTEXT. The `chromium` project hands every spec the marker's
 * signed-in storage state, and this spec is about the SIGNED-OUT signup
 * flow: with that state, `/login` correctly redirects to the feed. So both
 * tests open their own signed-out context rather than fighting the
 * inherited one.
 *
 * CLEANUP: this spec creates real accounts through the UI, so there is no
 * owner-scoped row for a spec-local REST delete to reach (the accounts ARE
 * the fixtures). Both are `e2e-`-prefixed, which is exactly the convention
 * the sweep deletes — see docs/agents/e2e-fixture-convention.md, and the
 * fixture-marker guard that keeps this spec inside it.
 */
import { expect, test, type Browser, type Page } from '@playwright/test'
import { readMarkerMeta } from './fixtures'

/** The card's Nominatim request (lib/geocode's searchFirst, one URL shape). */
const NOMINATIM_ROUTE = /https:\/\/nominatim\.openstreetmap\.org\/search\?/
/** The address both legs type — the card's own placeholder, a real street. */
const ADDRESS = '1200 1st Ave S, Seattle'

async function signedOutPage(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({
    baseURL: 'http://localhost:4173',
    storageState: { cookies: [], origins: [] },
  })
  return { page: await context.newPage(), close: () => context.close() }
}

/**
 * Sign up (email + password only), walk the name card, and Skip the kids
 * card. Lands on /onboarding with the AREA card ("4 of 4") next.
 *
 * The name card's Continue button sits OUTSIDE its <form> and is joined to
 * it only by the HTML form attribute (FirstRunCard.tsx) — if that
 * association breaks, the profile row is never created, the cards never
 * render, and this helper hangs at its first wait. That is what makes it
 * the pin for the association. The Skip writes NOTHING (no kid rows — the
 * deterministic no-kids path the 17-spec helper
 * `finishSignup` uses).
 */
async function signUpToAreaCard(
  page: Page,
  options: { name: string; email: string; password: string },
): Promise<void> {
  await page.goto('/login')
  await page.getByRole('button', { name: 'New here? Create an account' }).click()
  await page.locator('input[type="email"]').fill(options.email)
  await page.locator('input[type="password"]').fill(options.password)
  await page.getByRole('button', { name: 'Create account' }).click()

  // Card 2 of 4: the name card. Card 1 sent us here, and the card composes
  // the two halves into the same handle the old signup form produced (the
  // helper splits at the first space, the fixtures' signUpViewer way).
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 })
  const space = options.name.indexOf(' ')
  const first = space === -1 ? options.name : options.name.slice(0, space)
  const last = space === -1 ? '' : options.name.slice(space + 1)
  await page.locator('input[autocomplete="given-name"]').fill(first)
  if (last !== '') await page.locator('input[autocomplete="family-name"]').fill(last)
  await page.getByRole('button', { name: /^Continue/ }).click()

  // Card 3 of 4: the kids card — Skip (writes nothing). (Card 4 was the
  // photo card, which V28 r2 slice 1b deleted; the skip below is the run's
  // only one.) The wait absorbs the profile-load settle beat.
  const skip = page.getByRole('button', { name: 'Skip' })
  await skip.waitFor({ timeout: 30_000 })
  await skip.click()

  // Card 4 of 4: the area card (required — no Skip control on it).
  await page.getByTestId('first-run-area-card').waitFor({ timeout: 30_000 })
}

test('a resolved address writes the home zip with no typed zip (the address-first leg)', async ({
  browser,
}) => {
  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const { page, close } = await signedOutPage(browser)
  try {
    // The card's ONE Nominatim request: answer it RESOLVED — a 5-digit
    // postcode (the marker's seeded zip, so the gazetteer accepts it) plus a
    // house number (the precision rule's proof this is the parent's street,
    // not its city's centre).
    await page.route(NOMINATIM_ROUTE, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            lat: '47.6205',
            lon: '-122.3414',
            address: { postcode: marker.homeZip, house_number: '1200' },
          },
        ]),
      }),
    )

    await signUpToAreaCard(page, {
      name: `e2e-az-${epoch} Marker`,
      email: `e2e-az-${epoch}@gmail.com`,
      password: `e2e-az-pw-${epoch}`,
    })

    // The address is the entry — no ZIP is typed anywhere on this leg.
    await page.getByPlaceholder('e.g. 1200 1st Ave S, Seattle').fill(ADDRESS)
    // The card's primary reads "Finish" (FIRST_RUN_COPY.area); while the
    // lookup is in flight it reads "Checking your address…" and is
    // disabled, so the click auto-waits for the (intercepted, instant)
    // settle, then the save, then the navigation.
    await page.getByRole('button', { name: 'Finish' }).click()

    // The re-keyed save (V28 slice 6, defect #19) renders the run's FINISH
    // CARD on /onboarding, never a feed bounce — tap its CTA to land.
    const finishCard = page.getByTestId('first-run-finish-card')
    await finishCard.waitFor({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Go to your feed' }).click()

    // Straight to discovery — the feed is about the RESOLVED zip.
    await expect(page.getByRole('heading', { name: 'Near you' })).toBeVisible({
      timeout: 30_000,
    })
    expect(new URL(page.url()).pathname).toBe('/')
    await expect(page.getByTestId('feed-location-control')).toContainText(marker.homeZip)
    // The fallback never revealed itself on the resolved leg (V28 slice 7a):
    // the ZIP input and the area-card note live ONLY inside the onboarding
    // card (src/pages/OnboardingPage.tsx), which cannot render on the feed at
    // all — asserting their absence here was structurally guaranteed true, so
    // the two toHaveCount(0) pins were cut and their intent documented here.
  } finally {
    await close()
  }
})

test('an unresolvable address reveals the ZIP fallback (the note + the field, address preserved)', async ({
  browser,
}) => {
  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const { page, close } = await signedOutPage(browser)
  try {
    // The card's ONE Nominatim request: answer it EMPTY — the address does
    // not match a ZIP, so the card reveals its fallback instead of
    // blocking.
    await page.route(NOMINATIM_ROUTE, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '[]',
      }),
    )

    await signUpToAreaCard(page, {
      name: `e2e-au-${epoch} Marker`,
      email: `e2e-au-${epoch}@gmail.com`,
      password: `e2e-au-pw-${epoch}`,
    })

    await page.getByPlaceholder('e.g. 1200 1st Ave S, Seattle').fill(ADDRESS)
    await page.getByRole('button', { name: 'Finish' }).click()

    // THE FALLBACK, REVEALED IN-CARD: the note (the existing first-use
    // audit copy, now the card's own trigger) and the ZIP field — and the
    // address the parent typed is PRESERVED in its field, never lost.
    await expect(page.getByTestId('area-zip-fallback-note')).toBeVisible()
    const zip = page.getByPlaceholder('e.g. 98107')
    await expect(zip).toBeVisible()
    await expect(page.getByPlaceholder('e.g. 1200 1st Ave S, Seattle')).toHaveValue(ADDRESS)

    // No dead end: the typed zip + radius finish the card (landing on the
    // run's finish card — V28 slice 6 — whose CTA lands the parent on the
    // feed, about the TYPED zip, the same value the marker uses).
    await zip.fill(marker.homeZip)
    await page
      .locator('select')
      .first()
      .selectOption({ label: `${marker.radiusMiles} miles` })
    await page.getByRole('button', { name: 'Finish' }).click()
    await page.getByTestId('first-run-finish-card').waitFor({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Go to your feed' }).click()
    await expect(page.getByRole('heading', { name: 'Near you' })).toBeVisible({
      timeout: 30_000,
    })
    expect(new URL(page.url()).pathname).toBe('/')
    await expect(page.getByTestId('feed-location-control')).toContainText(marker.homeZip)
  } finally {
    await close()
  }
})

test(
  'blur + Finish on the same address issues exactly ONE request, and the card shows its pin + radius circle (V28 slice 4)',
  async ({ browser }) => {
    const marker = readMarkerMeta()
    const epoch = Math.floor(Date.now() / 1000)
    const { page, close } = await signedOutPage(browser)
    // The seam's count: EVERY Nominatim request this card's page issues is
    // routed through this handler, so "exactly one per distinct address"
    // is asserted on the number, not on the absence of a duplicate.
    let nominatimCalls = 0
    try {
      await page.route(NOMINATIM_ROUTE, (route) => {
        nominatimCalls++
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              lat: '47.6205',
              lon: '-122.3414',
              address: { postcode: marker.homeZip, house_number: '1200' },
            },
          ]),
        })
      })

      await signUpToAreaCard(page, {
        name: `e2e-av-${epoch} Marker`,
        email: `e2e-av-${epoch}@gmail.com`,
        password: `e2e-av-pw-${epoch}`,
      })

      // No map-shaped claim BEFORE the address resolves: the card holds the
      // address field and nothing map-shaped at all.
      expect(await page.getByTestId('onboarding-area-map').count()).toBe(0)

      const address = page.getByPlaceholder('e.g. 1200 1st Ave S, Seattle')
      await address.fill(ADDRESS)
      // BLUR (not Finish) schedules the early resolution (debounced): the
      // one request yields the pin, and the card draws it with the radius
      // circle the parent is about to choose.
      await address.blur()
      const areaMap = page.getByTestId('onboarding-area-map')
      await expect(areaMap).toBeVisible({ timeout: 30_000 })

      // NON-VACUOUS: the container is a LIVE Leaflet map and BOTH overlays
      // are painted — a blank bordered box also "has no error", so the
      // spec asserts the elements, not the throw's absence. Pin and disc are
      // BOTH red `#dc2626` paths, so each is identified by fill-opacity
      // (pin 0.85, disc 0.08 — the identification places-map-view uses at
      // its lines 1610/1665; there the disc is absent by context, here it is
      // not, so the opacity is what disambiguates).
      await expect(areaMap).toHaveClass(/leaflet-container/)
      const homePin = areaMap.locator('path.leaflet-interactive[fill="#dc2626"][fill-opacity="0.85"]')
      await expect(homePin).toHaveCount(1)
      const radiusCircle = areaMap.locator('path.leaflet-interactive[stroke="#dc2626"][fill-opacity="0.08"]')
      await expect(radiusCircle).toHaveCount(1)
      expect(nominatimCalls).toBe(1)

      // A radius change redraws the circle CLIENT-SIDE (the map's overlay
      // re-key) — a bigger disc, the same camera framing rule — and NO
      // second Nominatim request.
      const before = await radiusCircle.getAttribute('d')
      await page.locator('select').first().selectOption({ label: '1 mile' })
      if (before !== null) {
        await expect(async () => {
          expect(await radiusCircle.getAttribute('d')).not.toBe(before)
        }).toPass({ timeout: 30_000 })
      }
      expect(nominatimCalls).toBe(1)

      // Finish REUSES the settled resolution — the single request stands.
      await page.getByRole('button', { name: 'Finish' }).click()
      await page.getByTestId('first-run-finish-card').waitFor({ timeout: 30_000 })
      expect(nominatimCalls).toBe(1)
      await page.getByRole('button', { name: 'Go to your feed' }).click()
      await expect(page.getByRole('heading', { name: 'Near you' })).toBeVisible({
        timeout: 30_000,
      })
      expect(new URL(page.url()).pathname).toBe('/')
      await expect(page.getByTestId('feed-location-control')).toContainText(marker.homeZip)
    } finally {
      await close()
    }
  },
)

test(
  'a stale settle cannot republish: editing the address hides the map, and the previous address’s late result settles suppressed (V28 slice 4 fix 1)',
  async ({ browser }) => {
    const marker = readMarkerMeta()
    const epoch = Math.floor(Date.now() / 1000)
    const { page, close } = await signedOutPage(browser)
    // THE DEFERRED SETTLE: every Nominatim request this leg issues is HELD —
    // the leg decides when the "late" half of "late" happens, so the stale
    // settle is a controlled event, not a timing hope. Also the seam's
    // count: exactly one request for the one distinct address this leg
    // looked up.
    let nominatimCalls = 0
    const heldRoutes: Array<(body: string) => void> = []
    try {
      await page.route(NOMINATIM_ROUTE, (route) => {
        nominatimCalls++
        heldRoutes.push((body) => {
          void route.fulfill({ status: 200, contentType: 'application/json', body })
        })
      })

      await signUpToAreaCard(page, {
        name: `e2e-as-${epoch} Marker`,
        email: `e2e-as-${epoch}@gmail.com`,
        password: `e2e-as-pw-${epoch}`,
      })

      const address = page.getByPlaceholder('e.g. 1200 1st Ave S, Seattle')
      const A = '1200 1st Ave S, Seattle'
      const B = '4139 1st Ave NE, Seattle'
      await address.fill(A)
      await address.blur()
      // The blur's debounce fires A's single request; it is HELD in the
      // route, so the card is in its pending state with no result yet.
      await expect
        .poll(() => heldRoutes.length, {
          message: "A's lookup request fires from the blur debounce and is held",
        })
        .toBe(1)

      // EDIT TO B: the map hides (A has not settled, so it was never shown —
      // this leg's assertion is what the LATE settle does, not the edit).
      await address.fill(B)

      // A's LATE result arrives (RESOLVED, for A's house number). Pre-fix
      // the ownership guard reads 'A' !== 'A' and republishes A's pin over
      // B's text; post-fix the edit invalidated the slot, so the settle
      // settles suppressed and the card stays map-less about B.
      heldRoutes[0](
        JSON.stringify([
          {
            lat: '47.6205',
            lon: '-122.3414',
            address: { postcode: marker.homeZip, house_number: '1200' },
          },
        ]),
      )
      // Give the settle's promise chain a beat to be PROCESSED (it is
      // synchronous after the in-process fulfill); a suppressed settle
      // changes nothing, so the pin's ABSENCE is what the beat proves.
      await page.waitForTimeout(300)
      await expect(address).toHaveValue(B)
      // THE INVARIANT'S FIRST FACE: B's text, NO map. Pre-fix the map is
      // here, painted with A's pin and radius circle.
      expect(await page.getByTestId('onboarding-area-map').count()).toBe(0)
      expect(nominatimCalls).toBe(1)
      // AND THE CARD IS NOT STUCK: the pending state belongs to the address
      // the field no longer shows, so the primary reads "Finish" and is
      // tappable (the edited address's lookup, if it runs, re-enters the
      // pending state itself). Pre-fix the button is still
      // "Checking your address…" for A — disabled — over B's text.
      await expect(page.getByRole('button', { name: 'Finish' })).toBeEnabled()
    } finally {
      await close()
    }
  },
)

test(
  'editing an address and back re-resolves it: the map reappears for a resolved address (V28 slice 4 fix 1)',
  async ({ browser }) => {
    const marker = readMarkerMeta()
    const epoch = Math.floor(Date.now() / 1000)
    const { page, close } = await signedOutPage(browser)
    // The seam's count: the re-typed address is a DISTINCT address (the edit
    // invalidated the slot), so its blur issues its own single request —
    // two requests for two distinct lookups, never a third.
    let nominatimCalls = 0
    try {
      await page.route(NOMINATIM_ROUTE, (route) => {
        nominatimCalls++
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              lat: '47.6205',
              lon: '-122.3414',
              address: { postcode: marker.homeZip, house_number: '1200' },
            },
          ]),
        })
      })

      await signUpToAreaCard(page, {
        name: `e2e-ar-${epoch} Marker`,
        email: `e2e-ar-${epoch}@gmail.com`,
        password: `e2e-ar-pw-${epoch}`,
      })

      const address = page.getByPlaceholder('e.g. 1200 1st Ave S, Seattle')
      const A = '1200 1st Ave S, Seattle'
      const B = '4139 1st Ave NE, Seattle'
      await address.fill(A)
      await address.blur()
      const areaMap = page.getByTestId('onboarding-area-map')
      await expect(areaMap).toBeVisible({ timeout: 30_000 })
      expect(nominatimCalls).toBe(1)

      // Edit to B: the pin was a claim about A, so the map hides.
      await address.fill(B)
      await expect(areaMap).toHaveCount(0)

      // Edit BACK to A and blur: the same address resolves again. THE
      // INVARIANT'S SECOND FACE — a RESOLVED address never leaves the map
      // hidden. Pre-fix the reuse branch returns A's settled promise without
      // republishing (the edit nulled the coordinates, the slot never
      // noticed), and the map stays hidden forever; post-fix the edit
      // cleared the slot, so the blur issues A's own single fresh request.
      await address.fill(A)
      await address.blur()
      await expect(areaMap).toBeVisible({ timeout: 30_000 })
      expect(nominatimCalls).toBe(2)
    } finally {
      await close()
    }
  },
)
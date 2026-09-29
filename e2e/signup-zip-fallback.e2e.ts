/**
 * Spec (V28 slice 5): THE AREA CARD — ADDRESS-FIRST, ZIP AS FALLBACK
 * (decision 9).
 *
 * WHAT CHANGED. Before this slice the location step was a bare zip field +
 * radius (V28 slice 3b moved location onto the first run, slice 4a/4b
 * inserted the kids and photo cards before it) — and this spec pinned the
 * now-removed promise that the signup path lands on that step with NO
 * fallback note (the signup-time geocode flag had no producer left). Since
 * slice 5 the step IS the area card (5 of 5): the ADDRESS is the entry, and
 * its bounded Nominatim lookup (lib/geocode's zipFromAddressQueryBounded —
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
 * Sign up (email + password only), walk the name card, and Skip the kids and
 * photo cards. Lands on /onboarding with the AREA card ("5 of 5") next.
 *
 * The name card's Continue button sits OUTSIDE its <form> and is joined to
 * it only by the HTML form attribute (FirstRunCard.tsx) — if that
 * association breaks, the profile row is never created, the cards never
 * render, and this helper hangs at its first wait. That is what makes it
 * the pin for the association. The Skips write NOTHING (no kid rows, no
 * avatar — the deterministic no-kids/no-photo path the 17-spec helper
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

  // Card 2 of 5: the name card. Card 1 sent us here, and the card composes
  // the two halves into the same handle the old signup form produced (the
  // helper splits at the first space, the fixtures' signUpViewer way).
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 })
  const space = options.name.indexOf(' ')
  const first = space === -1 ? options.name : options.name.slice(0, space)
  const last = space === -1 ? '' : options.name.slice(space + 1)
  await page.locator('input[autocomplete="given-name"]').fill(first)
  if (last !== '') await page.locator('input[autocomplete="family-name"]').fill(last)
  await page.getByRole('button', { name: /^Continue/ }).click()

  // Card 3 of 5: the kids card — Skip (writes nothing). Card 4 of 5: the
  // photo card — Skip again (the same chrome control re-resolves onto it).
  // Each wait absorbs the profile-load settle beat.
  const skip = page.getByRole('button', { name: 'Skip' })
  await skip.waitFor({ timeout: 30_000 })
  await skip.click()
  await skip.waitFor({ timeout: 30_000 })
  await skip.click()

  // Card 5 of 5: the area card (required — no Skip control on it).
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
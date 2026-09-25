/**
 * Spec (first-use audit, ticket 02): THE ZIP FALLBACK EXPLAINS ITSELF.
 *
 * THE FINDING, in the audit's words: the signup form correctly says the address
 * is used to show nearby drop-ins — and when that address did not resolve to a
 * ZIP, the account was created and the parent was routed to a ZIP screen with
 * nothing explaining why. It read as "enter your location again".
 *
 * THE PRODUCT RULE THIS PINS: account creation stays non-blocking, the address
 * is still the location input, and the ZIP step is what happens when the lookup
 * did not resolve — now saying so.
 *
 * WHY THE NETWORK IS INTERCEPTED RATHER THAN CRAFTING A "BAD" ADDRESS. Waiting
 * on a live geocoder to fail is not a test, it is weather: a flaky Nominatim, a
 * rate limit, or an address that happens to resolve in six months all change
 * the result. Aborting the request makes the unresolved branch EXACTLY the
 * branch the app already handles (the lookup's own "null on ANY failure"
 * contract), so the spec is deterministic and it tests the real code path.
 *
 * WHY A FRESH CONTEXT. The `chromium` project hands every spec the marker's
 * signed-in storage state, and this spec is about the SIGNED-OUT signup flow:
 * with that state, `/login` correctly redirects to the feed. So both tests open
 * their own signed-out context rather than fighting the inherited one.
 *
 * CLEANUP: this spec creates real accounts through the UI, so there is no
 * owner-scoped row for a spec-local REST delete to reach (the accounts ARE the
 * fixtures). Both are `e2e-`-prefixed, which is exactly the convention the sweep
 * deletes — see docs/agents/e2e-fixture-convention.md, and the fixture-marker
 * guard that keeps this spec inside it.
 */
import { expect, test, type Browser, type Page } from '@playwright/test'
import { readMarkerMeta } from './fixtures'

const ADDRESS_INPUT = 'input[autocomplete="street-address"]'

async function signedOutPage(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({
    baseURL: 'http://localhost:4173',
    storageState: { cookies: [], origins: [] },
  })
  return { page: await context.newPage(), close: () => context.close() }
}

async function fillSignupForm(
  page: Page,
  options: { name: string; email: string; password: string; address: string },
): Promise<void> {
  const space = options.name.indexOf(' ')
  await page.goto('/login')
  await page.getByRole('button', { name: 'New here? Create an account' }).click()
  await page.locator('input[autocomplete="given-name"]').fill(options.name.slice(0, space))
  await page.locator('input[autocomplete="family-name"]').fill(options.name.slice(space + 1))
  await page.locator(ADDRESS_INPUT).fill(options.address)
  await page.locator('input[type="email"]').fill(options.email)
  await page.locator('input[type="password"]').fill(options.password)
}

test('an address that resolves to a ZIP sends the new parent straight to a nearby feed', async ({
  browser,
}) => {
  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const { page, close } = await signedOutPage(browser)
  try {
    // The RESOLVED side is mocked too, and for the same reason as the failure
    // side: asserting the happy path against a live third-party geocoder makes
    // this spec a weather report. The mock is a real Nominatim response shape
    // (a street address with a house number and its postcode) so the app's own
    // precision rule is what decides, not the mock's convenience.
    await page.route('**/nominatim.openstreetmap.org/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            lat: '47.6687',
            lon: '-122.3847',
            address: { postcode: marker.homeZip, house_number: '7349' },
          },
        ]),
      }),
    )

    await fillSignupForm(page, {
      name: `e2e-z-${epoch} Marker`,
      email: `e2e-z-${epoch}@gmail.com`,
      password: `e2e-z-pw-${epoch}`,
      address: '7349 15th Ave NW, Seattle, WA 98107',
    })

    await page.getByRole('button', { name: 'Create account' }).click()

    // Straight to discovery: no ZIP screen at all.
    await expect(page.getByRole('heading', { name: 'Near you' })).toBeVisible({ timeout: 30_000 })
    expect(new URL(page.url()).pathname).toBe('/')
    // And no fallback note anywhere — the happy path must not borrow the
    // failure's explanation.
    await expect(page.getByTestId('signup-zip-fallback-note')).toHaveCount(0)
    // The feed is about the address's own neighbourhood (Ballard, 98107 — the
    // marker's ZIP), which is the whole point of deriving it at signup.
    await expect(page.getByTestId('feed-location-control')).toContainText(marker.homeZip)
  } finally {
    await close()
  }
})

test('an address that cannot be matched still creates the account, and the ZIP step says why', async ({
  browser,
}) => {
  const epoch = Math.floor(Date.now() / 1000)
  const { page, close } = await signedOutPage(browser)
  try {
    // Make the lookup fail the way the app already models failure: the request
    // never completes. `searchFirst` returns null on ANY failure by contract.
    await page.route('**/nominatim.openstreetmap.org/**', (route) => route.abort())

    await fillSignupForm(page, {
      name: `e2e-zu-${epoch} Marker`,
      email: `e2e-zu-${epoch}@gmail.com`,
      password: `e2e-zu-pw-${epoch}`,
      address: '7349 15th Ave NW, Seattle, WA 98107',
    })

    await page.getByRole('button', { name: 'Create account' }).click()

    // The account EXISTS — a third-party lookup failure must never block it —
    // and the parent lands on the one location step that is still needed.
    await expect(page.getByRole('heading', { name: 'Set your location' })).toBeVisible({
      timeout: 30_000,
    })

    // THE FINDING, FIXED: the screen explains the transition instead of silently
    // asking for a location that was already given.
    const note = page.getByTestId('signup-zip-fallback-note')
    await expect(note).toBeVisible()
    await expect(note).toContainText('Your account is ready')
    await expect(note).toContainText('ZIP')
    // It keeps the address-privacy promise the signup form made.
    await expect(note).toContainText('private')
    // And it never leaks implementation words at the parent.
    await expect(note).not.toContainText('geocod')
    await expect(note).not.toContainText('home_zip')

    // No dead end: the ZIP field is right there, and the inline validation the
    // page already had still answers a bad ZIP with its own accessible error.
    const zip = page.getByPlaceholder('e.g. 98107')
    await expect(zip).toBeVisible()
    await zip.fill('00000')
    await page.getByRole('button', { name: /^Continue/ }).click()
    await expect(page.getByRole('alert')).toBeVisible()

    // The note is ONE-SHOT: it described this signup, so it must not follow the
    // parent around. A reload is a new visit to the step.
    await page.reload()
    await expect(page.getByTestId('signup-zip-fallback-note')).toHaveCount(0)
  } finally {
    await close()
  }
})

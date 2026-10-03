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
 * 5. V28 slice 4 fix 2 — THE SAME INVARIANT ON THE SAVE PATH: what Finish
 *    WRITES also corresponds to the current field text, or to nothing. The
 *    display face (4) suppresses a stale settle's PUBLISH, but a suppressed
 *    settle still returns its result value to the CALLER — so a Finish tap
 *    inside the debounce window, followed by an edit mid-flight, could save
 *    the OLD address's zip. This leg holds A's request, taps Finish for A,
 *    edits to B, then releases A's answer (a KNOWN zip, distinct from B's):
 *    post-fix the card refuses to consume the stale result — it stays for
 *    B's text, a second Finish writes B's own zip, and the feed is about the
 *    NEW zip, never the old one.
 * 6. V28 slice 4 fix 3 — THE SAME INVARIANT ON THE FALLBACK NOTE, and the
 *    PIN the round exists for: the note ("We couldn't match the address you
 *    entered to a ZIP code") is a direct claim about the field's text, and
 *    it is the third derived claim the card makes that an edit must
 *    invalidate (after the pin and the save). The leg reveals the note for
 *    an unresolvable A, edits to B, and asserts the note is HIDDEN — then
 *    re-blurs B and asserts the note returns RE-DERIVED for B's own text
 *    (clearing it on edit cost nothing: the edited address's own settle
 *    owns the flag again).
 * 7. V28 slice 8d — THE TYPED-ZIP FAMILY, the field's own two claims. (a)
 *    The zip ERROR used to render only inside the note's block, so an
 *    invalid typed zip became INVISIBLE once an address edit hid the note:
 *    Finish silently no-opped. The error now renders outside every hiding
 *    block, and the field stays on screen whenever Finish could write it
 *    (`zipFallbackShown` OR a non-empty `homeZip`). The leg reveals the note,
 *    types an invalid zip, edits to a RESOLVABLE B (so the note cannot
 *    come back), taps Finish, and asserts the alert is VISIBLE with the note
 *    hidden. (b) The zip FIELD is frozen (`disabled` while `saving`) for the
 *    write it started: `typedZip` is captured and saved in the same
 *    synchronous turn, so the only way the write could diverge from the text
 *    was an edit DURING the write. The leg holds the home-zip PATCH, taps
 *    Finish, and asserts the field is disabled until the write lands.
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
import { NOMINATIM_ROUTE, readMarkerMeta } from './fixtures'
// The tour's WORDS and the guard's DERIVATION are both data in
// src/lib/firstRunTour (slice 5). Restating them here meant a legitimate copy
// change needed three edits, and the spec built its OWN copy of the
// withheld-category filter and of the escape one-liner — a second derivation
// that disagreed with the unit test's (fix round 3, finding A) and a third copy
// of the escape (flagged by both lanes). One implementation, two callers. The
// CTA is imported for the same reason: `TOUR_PRIMARY_LABEL` is the identifier
// this batch pinned deliberately, and a literal here restated it (finding D).
// The pin's EXISTENCE is ruled fine — only the restatement changed. The
// literals in e2e/auth.setup.ts and e2e/fixtures.ts stay literals on purpose:
// that is the shared setup whose tripwire is meant to be visible.
// ⚠️ V28 r3-6 (r3-D3): the `TOUR_*` / `withheldCategoryPattern` imports left with
// the tour card's browser pin below. The run no longer renders that card, so a
// browser assertion over its copy would check a screen no parent sees. The copy
// rule itself is UNCHANGED and still enforced by `copy-taxonomy-guard` (in
// `npm run guards`) and `firstRunTour.test.ts`; r3-7 re-homes the browser pin
// when the tooltips put the copy back on a screen.

// NOMINATIM_ROUTE comes from ./fixtures — the one copy (V28 r2 slice 8a fix
// round 1). This file held a byte-identical second copy of the same regex, in a
// slice whose whole argument was anti-duplication.
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
 * deterministic no-kids path the 18-spec helper
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

    // ⚠️ V28 r3-6 (r3-D3): THIS LEG NO LONGER PINS THE TOUR CARD'S COPY.
    //
    // It used to wait for `first-run-finish-card` and assert the rendered tour
    // named no withheld category — the browser half of the copy-taxonomy rule.
    // The run no longer renders that card at all: it lands on the feed. So the
    // assertion would have been checking a screen no parent ever sees, which is
    // the vacuous shape this repo records (D-030).
    //
    // The rule itself is NOT dropped: it still holds over the copy module, and
    // `copy-taxonomy-guard` + `firstRunTour.test.ts` still enforce it. What is
    // removed is a BROWSER pin for a card that is no longer rendered — and r3-7
    // (tooltips) is where the copy meets a screen again, so the browser pin
    // belongs there. `withheldCategoryPattern` and the TOUR_* consts stay
    // imported below until then.
    //
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
    // V28 r3-6 (r3-D3): the run now lands on the feed directly — no ending card,
    // no CTA to tap. The feed's own heading is the assertion.
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
      // V28 r3-6 (r3-D3): straight to the feed, no ending card.
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
      // synchronous after the in-process fulfill). A suppressed settle
      // changes NOTHING — so there is no state to poll instead: a poll
      // of "the pin is absent" is true both BEFORE the settle runs and
      // after it is processed, and cannot tell the two apart. The BEAT is
      // what proves "the late settle was processed and changed nothing."
      // 1000 ms (V28 slice 4 fix 3, C2, ocr): on a slow runner the 300 ms
      // beat let the assertions pass BEFORE the settle ran, letting this
      // leg false-pass against pre-fix code — which is the whole reason it
      // exists. Post-fix the leg cannot flake: a late settle simply leaves
      // the map absent, so the longer beat trades a little runtime for a
      // stronger discriminator.
      await page.waitForTimeout(1000)
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
  "Finish cannot save the OLD address's zip: an edit mid-flight leaves the card for the new text, and the second Finish writes the new zip (V28 slice 4 fix 2)",
  async ({ browser }) => {
    const marker = readMarkerMeta()
    const epoch = Math.floor(Date.now() / 1000)
    const { page, close } = await signedOutPage(browser)
    // THE SPLIT ANSWERS: A's request is HELD (the leg decides when the "late"
    // half of "late" happens — the fix-1 instrument) and answers with a
    // KNOWN zip DISTINCT from B's. 98103 is seeded in the gazetteer
    // (migration 0012), so a stale save would pass the card's own
    // validateHomeZip gate — without the distinct zip, "never the old one"
    // would be unprovable (both addresses would resolve to the same value).
    const A = '1200 1st Ave S, Seattle'
    const B = '4139 1st Ave NE, Seattle'
    const OLD_ZIP = '98103'
    let nominatimCalls = 0
    const heldRoutes: Array<(body: string) => void> = []
    try {
      await page.route(NOMINATIM_ROUTE, (route) => {
        nominatimCalls++
        const q = new URL(route.request().url()).searchParams.get('q')
        if (q === A) {
          heldRoutes.push((body) => {
            void route.fulfill({ status: 200, contentType: 'application/json', body })
          })
          return
        }
        // B's own request (the distinct address's own single request): the
        // NEW zip, answered instantly.
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              lat: '47.6205',
              lon: '-122.3200',
              address: { postcode: marker.homeZip, house_number: '4139' },
            },
          ]),
        })
      })

      await signUpToAreaCard(page, {
        name: `e2e-af-${epoch} Marker`,
        email: `e2e-af-${epoch}@gmail.com`,
        password: `e2e-af-pw-${epoch}`,
      })

      const address = page.getByPlaceholder('e.g. 1200 1st Ave S, Seattle')
      await address.fill(A)
      await address.blur()
      // THE INTERLEAVING: Finish is tapped INSIDE the 500 ms debounce
      // window — the debounce has not fired, so the tap starts A's own
      // lookup (held in the route, no request yet) and awaits it. The
      // button is still "Finish" (the pending state has not entered —
      // that is what makes the tap land where the bug needs it).
      await page.getByRole('button', { name: 'Finish' }).click()

      // Edit to B mid-flight: the focus cancels the pending blur timer, and
      // the edit's slot invalidation suppresses A's (still in-flight) settle
      // from publishing. A's request is now the only one on the wire.
      await address.fill(B)
      await expect
        .poll(() => heldRoutes.length, {
          message: "A's lookup request fires from the Finish tap and is held",
        })
        .toBe(1)

      // Release A's LATE answer: RESOLVED, with a valid KNOWN zip that is
      // NOT the marker's. Pre-fix the Finish continuation consumes it —
      // validateHomeZip passes and the OLD zip is saved while the field
      // shows B; the card swaps to its finish card. Post-fix the
      // point-of-use re-check sees the field moved and refuses to consume:
      // no save, no fallback — the card stays for B's text, usable.
      heldRoutes[0](
        JSON.stringify([
          {
            lat: '47.6188',
            lon: '-122.3250',
            address: { postcode: OLD_ZIP, house_number: '1200' },
          },
        ]),
      )
      // A beat for the settle's promise chain to be processed (synchronous
      // after the in-process fulfill), then the fast discriminator.
      //
      // ⚠️ V28 r3-6 (r3-D3) REPLACED this line's assertion, and the reason matters.
      // It used to be `expect(finishCard).not.toBeVisible()` — "a stale save would
      // have rendered the ending card already". With the ending GONE that check
      // becomes VACUOUSLY TRUE: it would stay green while proving nothing (the
      // D-030 shape — an instrument that matches nothing reads as a clean repo).
      //
      // The meaningful discriminator is the one already on the next line: the
      // parent is STILL ON THE AREA CARD. A stale save would have completed the
      // run and navigated to the feed, so "still on the area card, still holding
      // B" is what actually distinguishes refusal from consumption.
      await page.waitForTimeout(300)
      await expect(
        page.getByTestId('first-run-area-card'),
        'a stale save must NOT have finished the run — the parent stays on the card',
      ).toBeVisible()
      await expect(page.getByTestId('first-run-finish-card')).toHaveCount(0)
      await expect(address).toHaveValue(B)
      expect(nominatimCalls).toBe(1)

      // NO WALL: the card is usable for the new text. A second Finish
      // issues B's OWN single request (the distinct-address rule — two
      // requests for two distinct addresses, never a third) and saves the
      // NEW zip.
      await page.getByRole('button', { name: 'Finish' }).click()
      // V28 r3-6 (r3-D3): straight to the feed, no ending card, no CTA tap.
      // THE DB-LEVEL CLAIM: the feed is about the NEW address's zip — and
      // NEVER the old one (pre-fix the save had already landed on the old
      // zip's finish card, and the feed would be about 98103).
      await expect(page.getByRole('heading', { name: 'Near you' })).toBeVisible({
        timeout: 30_000,
      })
      expect(new URL(page.url()).pathname).toBe('/')
      await expect(page.getByTestId('feed-location-control')).toContainText(marker.homeZip)
      expect(nominatimCalls).toBe(2)
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

test(
  'the ZIP fallback note does not outlive its address: editing the field hides it, and the note returns only re-derived for its own text (V28 slice 4 fix 3)',
  async ({ browser }) => {
    const epoch = Math.floor(Date.now() / 1000)
    const { page, close } = await signedOutPage(browser)
    // The seam's count: one request per distinct address — A (the blur),
    // then B (the final blur). B's fill alone schedules no request.
    let nominatimCalls = 0
    try {
      await page.route(NOMINATIM_ROUTE, (route) => {
        nominatimCalls++
        // Answer EMPTY for every address in this leg: each settle
        // (result.zip === null) is what REVEALS the in-card fallback note.
        void route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      })

      await signUpToAreaCard(page, {
        name: `e2e-ax-${epoch} Marker`,
        email: `e2e-ax-${epoch}@gmail.com`,
        password: `e2e-ax-pw-${epoch}`,
      })

      const address = page.getByPlaceholder('e.g. 1200 1st Ave S, Seattle')
      const note = page.getByTestId('area-zip-fallback-note')
      const A = '1200 1st Ave S, Seattle'
      const B = '4139 1st Ave NE, Seattle'
      await address.fill(A)
      await address.blur()
      // A's early (blur-debounced) lookup settles empty: the card reveals
      // the fallback note — a direct claim about A ("We couldn't match the
      // address YOU ENTERED to a ZIP code").
      await expect(note).toBeVisible({ timeout: 30_000 })
      expect(nominatimCalls).toBe(1)

      // EDIT TO B: the note is a claim about the text, and the text moved,
      // so the card must stop making it (fix 3, C1 — the edit block clears
      // it alongside the pin, the slot, and the pending flag). Pre-fix the
      // note OUTLIVES the edit: nothing on the edit path clears the flag,
      // so it lingers over B's text — indefinitely, because B has not been
      // blurred, so B's own settle (the only thing that re-derives the
      // flag) never runs — and whenever B's pending window opens it
      // CO-RENDERS with "Checking your address…", the card simultaneously
      // saying "we couldn't match this" and "we are checking this".
      await address.fill(B)
      await expect(note).not.toBeVisible()
      await expect(address).toHaveValue(B)
      // GONE FOR GOOD, not mid-repaint: B issued no request (fill does not
      // blur), so no B settle can re-reveal the note. The beat is what
      // proves it — as in leg 4's fix-1 beat: a settle that changes
      // nothing is unobservable by design, and the beat is the proof.
      await page.waitForTimeout(1000)
      await expect(note).not.toBeVisible()
      expect(nominatimCalls).toBe(1)

      // AND THE NOTE IS NOT LOST FOR B: blur B and its own lookup asks
      // B's own question — B also resolves empty here, so the settle
      // RE-DERIVES the note for ITS OWN text (hidden on a resolved zip,
      // re-revealed on an empty answer — the settle leg of
      // ensureAddressLookup). This is the safety the C1 comment states:
      // clearing the note on edit costs nothing, because the edited
      // address's own settle owns the flag again.
      await address.blur()
      await expect(note).toBeVisible({ timeout: 30_000 })
      expect(nominatimCalls).toBe(2)
    } finally {
      await close()
    }
  },
)

test(
  'an invalid typed zip is VISIBLE once the note is gone: editing the address cannot hide the error Finish raises (V28 slice 8d, defect 1)',
  async ({ browser }) => {
    const marker = readMarkerMeta()
    const epoch = Math.floor(Date.now() / 1000)
    const { page, close } = await signedOutPage(browser)
    const A = '1200 1st Ave S, Seattle'
    const B = '4139 1st Ave NE, Seattle'
    try {
      await page.route(NOMINATIM_ROUTE, (route) => {
        const q = new URL(route.request().url()).searchParams.get('q')
        // A is UNRESOLVABLE (empty answer) -> its settle reveals the note.
        // B RESOLVES -> the note stays hidden for B, so the zip error can be
        // seen ONLY from outside the note's block.
        const body =
          q === B
            ? JSON.stringify([
                {
                  lat: '47.6205',
                  lon: '-122.3200',
                  address: { postcode: marker.homeZip, house_number: '4139' },
                },
              ])
            : '[]'
        return route.fulfill({ status: 200, contentType: 'application/json', body })
      })

      await signUpToAreaCard(page, {
        name: `e2e-az-${epoch} Marker`,
        email: `e2e-az-${epoch}@gmail.com`,
        password: `e2e-az-${epoch}`,
      })

      const address = page.getByPlaceholder('e.g. 1200 1st Ave S, Seattle')
      const note = page.getByTestId('area-zip-fallback-note')
      const zip = page.getByPlaceholder('e.g. 98107')
      // errorId('zip') is 'err-zip' (src/lib/a11y.ts) — the alert the card
      // raises for the typed zip.
      const zipAlert = page.locator('#err-zip')

      // Reveal the note for the unresolvable A, then type an INVALID zip (4
      // digits -> "Use a 5-digit zip code."). No error yet: Finish raises it.
      await address.fill(A)
      await address.blur()
      await expect(note).toBeVisible({ timeout: 30_000 })
      await zip.fill('1234')

      // EDIT to a RESOLVABLE B: the note is a claim about the address and is
      // invalidated (fix 3). `homeZip` is NOT invalidated — Finish prefers it
      // over the address's resolution REGARDLESS of note visibility — so the
      // field must stay on screen for the error to land where the parent is
      // looking. Blur B, so its own settle has run before the tap.
      await address.fill(B)
      await expect(note).not.toBeVisible()
      await address.blur()
      await expect(page.getByRole('button', { name: 'Finish' })).toBeEnabled({ timeout: 30_000 })

      // TAP: `handleAreaFinish` validates the typed zip, fails, and sets the
      // error. Pre-fix the alert renders INSIDE the note's block (off screen)
      // and the parent gets no feedback at all.
      await page.getByRole('button', { name: 'Finish' }).click()
      await expect(zipAlert).toBeVisible()
      await expect(zipAlert).toHaveText('Use a 5-digit zip code.')
      await expect(note).not.toBeVisible()
      await expect(zip).toBeVisible()

      // NO WALL: the field is still there to fix, and a valid zip finishes the
      // card (B resolves, so the note never comes back).
      await zip.fill(marker.homeZip)
      await expect(zipAlert).not.toBeVisible()
      await page.getByRole('button', { name: 'Finish' }).click()
      // V28 r3-6 (r3-D3): straight to the feed, no ending card, no CTA tap.
      await expect(page.getByTestId('feed-location-control')).toContainText(marker.homeZip)
    } finally {
      await close()
    }
  },
)

/** The home-zip + radius write (`updateHomeZipRadius`) — the card's save PATCH. */
const PROFILES_ROUTE = /\/rest\/v1\/profiles(\?|$)/

test(
  'the typed zip cannot move while its own save is in flight: the field is frozen for the write it started (V28 slice 8d, defect 2)',
  async ({ browser }) => {
    const marker = readMarkerMeta()
    const epoch = Math.floor(Date.now() / 1000)
    const { page, close } = await signedOutPage(browser)
    // The window the fix closes IS the write, so the write must be HELD for
    // the leg to observe it: the PATCH is paused (and `saving` stays true)
    // until this leg releases it. Two promises make the hold deterministic —
    // one fires when the PATCH arrives, one releases it.
    let markPatchArrived: () => void = () => {}
    let releasePatch: () => void = () => {}
    const patchArrived = new Promise<void>((resolve) => {
      markPatchArrived = resolve
    })
    const patchGate = new Promise<void>((resolve) => {
      releasePatch = resolve
    })
    try {
      await page.route(NOMINATIM_ROUTE, (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
      )
      await page.route(PROFILES_ROUTE, async (route) => {
        if (route.request().method() !== 'PATCH') return route.continue()
        markPatchArrived()
        await patchGate
        return route.continue()
      })

      await signUpToAreaCard(page, {
        name: `e2e-aw-${epoch} Marker`,
        email: `e2e-aw-${epoch}@gmail.com`,
        password: `e2e-aw-${epoch}`,
      })

      const address = page.getByPlaceholder('e.g. 1200 1st Ave S, Seattle')
      const note = page.getByTestId('area-zip-fallback-note')
      const zip = page.getByPlaceholder('e.g. 98107')

      // The note is what reveals the ZIP field; the address never resolves.
      await address.fill('1200 1st Ave S, Seattle')
      await address.blur()
      await expect(note).toBeVisible({ timeout: 30_000 })

      await zip.fill(marker.homeZip)
      // TAP: `handleAreaFinish` reads `homeZip` and, in the SAME turn, starts
      // `saveLocation` -> this PATCH, now HELD. `saving` is true for the whole
      // window, so the field the parent just submitted is FROZEN: it cannot
      // show a value other than the one being written.
      await page.getByRole('button', { name: 'Finish' }).click()
      await patchArrived
      await expect(zip).toBeDisabled()
      await expect(zip).toHaveValue(marker.homeZip)

      // Release: the write lands with the value the field shows, and the card
      // proceeds — the freeze is bounded by the write and re-enabled by the
      // handler's own `finally`, so it is not a wall.
      releasePatch()
      // V28 r3-6 (r3-D3): straight to the feed, no ending card, no CTA tap.
      await expect(page.getByTestId('feed-location-control')).toContainText(marker.homeZip)
    } finally {
      await close()
    }
  },
)

/**
 * V28 r3-5 (r3-D2) — THE NAVIGATION GUARD, pinned against a REAL in-flight save.
 *
 * THE INVARIANT: **navigation is disabled while `saving === true`, and enabled
 * otherwise.**
 *
 * WHY THIS SPEC EXISTS AND WHY IT HOLDS THE WRITE OPEN. A back arrow lets a parent
 * leave a card *while `updateHomeZipRadius` is in flight* — a network write. The
 * defect that produces is the silent one: the write lands, the card the parent
 * navigated to no longer reflects it, and nothing says so. Asserting the control
 * is enabled on an idle card proves nothing about that; the guard only has
 * meaning DURING a save. So the `profiles` PATCH is intercepted and held, which
 * makes `saving === true` an observable, stable state rather than a race the spec
 * would have to win.
 *
 * ⚠️ MUTATION-TESTED, and the mutation is the point: with the `saving` term
 * removed from `goBack`/`goForward` AND from `backDisabled`/`forwardDisabled`,
 * this spec FAILS (the control is enabled mid-write, and the tap moves the card).
 * A pin that cannot fail is not a pin.
 */
test('navigation is disabled during an actual save, and enabled once it settles', async ({
  browser,
}) => {
  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const { page, close } = await signedOutPage(browser)
  try {
    // Answer the card's ONE Nominatim request EMPTY, so the fallback reveals its
    // ZIP field — the typed zip is what makes the area card's primary WRITE
    // (`updateHomeZipRadius`), which is the write this spec holds open. (The
    // address-resolved leg is equally real but geocodes first, which would put a
    // second in-flight request between the tap and the save.)
    await page.route(NOMINATIM_ROUTE, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    )

    // HOLD THE WRITE. `saving` is only observable while `updateHomeZipRadius` is
    // genuinely in flight, so the PATCH is intercepted and held; `release` below
    // lets it land. ⚠️ ONLY the home-zip write is held: `profiles` is also
    // PATCHed by `touchLastSeen` during ordinary app use, and holding that would
    // stall the signup walk before it ever reached this card.
    let release: (() => void) | null = null
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    let patchSeen = false
    await page.route('**/rest/v1/profiles**', async (route) => {
      if (route.request().method() !== 'PATCH') return route.fallback()
      if (!(route.request().postData() ?? '').includes('home_zip')) return route.fallback()
      patchSeen = true
      await held
      return route.fallback()
    })

    await signUpToAreaCard(page, {
      name: `e2e-az-${epoch} Marker`,
      email: `e2e-az-${epoch}@gmail.com`,
      password: `e2e-az-pw-${epoch}`,
    })

    // Walk BACK first, so a FORWARD control exists to check as well — the guard
    // must hold in both directions.
    //
    // ⚠️ The neighbour of `area` is `kids` (FIRST_RUN_CARDS order is
    // account → name → kids → area), NOT `name`: the run reached the area card
    // because this helper SKIPPED the kids card, and `previousCard` reports the
    // ORDER, not the path this parent walked. Asserting the kids card here is
    // correct; asserting the name card was this spec's own bug, caught by running
    // it rather than by reading it.
    const back = page.getByRole('button', { name: 'Back' })
    await expect(back).toBeVisible()
    await back.click()
    await expect(
      page.getByTestId('first-run-kids-card'),
      'the card before area is kids',
    ).toBeVisible()
    const forward = page.getByTestId('first-run-forward')
    await expect(forward, 'a forward control exists after going back').toBeVisible()

    // Return to the AREA card, so the primary tapped below is the one that SAVES.
    await forward.click()
    await expect(page.getByTestId('first-run-area-card')).toBeVisible()

    // Reveal the fallback's ZIP field, then fill it.
    await page.getByPlaceholder('e.g. 1200 1st Ave S, Seattle').fill(ADDRESS)
    await page.getByRole('button', { name: 'Finish' }).click()
    const zip = page.getByPlaceholder('e.g. 98107')
    await expect(zip).toBeVisible()
    await zip.fill(marker.homeZip)

    // --- THE SAVE BEGINS AND IS HELD. ---
    await page.getByRole('button', { name: 'Finish' }).click()
    await expect.poll(() => patchSeen, {
      message: 'the save must actually reach the network, or this spec proves nothing',
    }).toBe(true)

    // ⚠️ THE ASSERTION. Both controls are DISABLED while the write is open.
    await expect(
      page.getByRole('button', { name: 'Back' }),
      'Back must be disabled while a write is in flight',
    ).toBeDisabled()
    // ⚠️ There is NO forward control at this point, BY DESIGN: the forward
    // control exists only to UNDO a back move, and we walked forward before
    // saving. So this asserts its ABSENCE rather than a disabled state — and the
    // disabled half is pinned separately, on the BACK control, which is always
    // present. (A forward control that existed here would be a general "next"
    // duplicating the Finish button's write, which is the defect `goForward`
    // documents refusing.)
    await expect(
      forward,
      'no forward control exists at the derived position — advancing is the card\'s write',
    ).toHaveCount(0)

    // THE HANDLER REFUSES INDEPENDENTLY of the disabled attribute — the visible
    // half is not the guard. `force` bypasses the disabled state to prove the
    // handler itself holds: a disabled button is not a wall, and a keyboard or a
    // future caller reaches the handler directly.
    await page.getByRole('button', { name: 'Back' }).click({ force: true }).catch(() => {})
    await expect(
      page.getByTestId('first-run-area-card'),
      'a forced tap must NOT move the card while the write is in flight',
    ).toBeVisible()

    // --- RELEASE: the write lands, the run finishes, the guard is moot. ---
    release?.()
    // V28 r3-6 (r3-D3): the run now ends on the FEED, so that is where a released
    // save lands — the ending card no longer renders, and the guard this spec
    // pins is about the write, not the destination.
    await expect(page.getByRole('heading', { name: 'Near you' })).toBeVisible({
      timeout: 30_000,
    })
  } finally {
    await close()
  }
})

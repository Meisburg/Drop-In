/**
 * Spec (V21 t09, A9): THE FEED VIEW TOGGLE — list is the default, map is a
 * toggle away, and each view shows exactly its own content.
 *
 * WHAT THIS PROVES, in the order a parent would meet it:
 *  1. FIRST LOAD OF `/` IS LIST: the day sections render, the Map button is
 *     present but NOT pressed, and NO map band / Leaflet canvas exists in the
 *     DOM. This is the founder + wife ruling: "the default for this page should
 *     be list view."
 *  2. TAP MAP: the map band becomes the primary content (a real Leaflet
 *     canvas with at least one pin, from a placed drop-in seeded via REST) and
 *     the day-section cards are GONE (map view does not stack the list under
 *     the map).
 *  3. TAP LIST: back to the day sections; the map band is gone again. The
 *     toggle works both ways, repeatedly.
 *  4. BOTH BUTTONS ARE ≥44px TALL (the house tap-target floor, `min-h-11`),
 *     measured on the rendered elements.
 *  5. RELOAD RESETS TO LIST: no persistence — the choice is page-local state,
 *     so a fresh load always starts on the default (pinned by the code comment
 *     in FeedPage and by this assertion).
 *
 * SEEDING: one placed post (a real directory place with coordinates, inside
 * the marker's neighbourhood) written via REST with the marker's JWT — the
 * same pattern e2e/places.e2e.ts's V19 t02 feed-map test uses — so the map
 * has at least one pin. Cleaned up best-effort in finally.
 */
import { expect, test } from '@playwright/test'
import { readMarkerSession, readSupabaseEnv, settleOnRoute } from './fixtures'

/**
 * The seeded place: 'Ballard Corners Park' — a real row in the live project's
 * `places` table WITH coordinates, ~0.44 mi from the marker's home zip 98107,
 * so it lands inside the marker's radius AND inside the map's focus frame.
 * Same id e2e/places.e2e.ts pins as MARKER_PLACE_ID.
 */
const MARKER_PLACE_ID = '26a77f22-7f99-4bd5-88df-4169b91ae7c7'
const MARKER_PLACE_NAME = 'Ballard Corners Park'

test('the feed defaults to list, toggles to map, and back (V21 t09)', async ({ page }) => {
  const { url: restUrl, anonKey } = readSupabaseEnv()
  const { accessToken, userId } = readMarkerSession()
  const restHeaders: Record<string, string> = {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }

  // One placed post: a real directory place WITH coordinates, so the map has a
  // pin. Starts in an hour (comfortably future, so `listRadiusFeed` returns it);
  // `ends_at` is NOT NULL, so it must be sent.
  const placedPost = {
    title: `V21 toggle placed ${Date.now()}`,
    place: MARKER_PLACE_NAME,
    place_id: MARKER_PLACE_ID,
    starts_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    ends_at: new Date(Date.now() + 120 * 60 * 1000).toISOString(),
    host_profile_id: userId,
  }

  let createdId: string | null = null
  try {
    const res = await fetch(`${restUrl}/rest/v1/playdates`, {
      method: 'POST',
      headers: restHeaders,
      body: JSON.stringify(placedPost),
    })
    if (!res.ok) throw new Error(`playdates insert HTTP ${res.status} ${await res.text()}`)
    const rows = (await res.json()) as Array<{ id: string }>
    createdId = rows[0].id

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await settleOnRoute(page, '/')

    // ------------------------------------------------------------------
    // 1. FIRST LOAD = LIST. The day sections are there, the map is not.
    // ------------------------------------------------------------------
    const listButton = page.getByRole('button', { name: 'List' })
    const mapButton = page.getByRole('button', { name: 'Map' })
    await expect(listButton).toBeVisible()
    await expect(mapButton).toBeVisible()
    // The default is list: List is pressed, Map is not.
    await expect(listButton).toHaveAttribute('aria-pressed', 'true')
    await expect(mapButton).toHaveAttribute('aria-pressed', 'false')
    // No map band, no Leaflet canvas, in the DOM at all.
    await expect(page.getByTestId('feed-map-band')).toHaveCount(0)
    await expect(page.locator('.leaflet-container')).toHaveCount(0)
    // The seeded post renders as a CARD in the day sections.
    await expect(page.getByText(placedPost.title, { exact: false })).toBeVisible()

    // ------------------------------------------------------------------
    // 4. BOTH TOGGLE BUTTONS ARE ≥44px TALL (the house tap-target floor).
    // ------------------------------------------------------------------
    for (const button of [listButton, mapButton]) {
      const box = await button.boundingBox()
      expect(box, 'toggle buttons must be rendered').not.toBeNull()
      expect(box!.height, 'each toggle button must be at least 44px tall').toBeGreaterThanOrEqual(44)
    }

    // ------------------------------------------------------------------
    // 2. TAP MAP → the map band is the primary content; the list is gone.
    // ------------------------------------------------------------------
    await mapButton.click()
    await expect(mapButton).toHaveAttribute('aria-pressed', 'true')
    await expect(listButton).toHaveAttribute('aria-pressed', 'false')
    const band = page.getByTestId('feed-map-band')
    await expect(band).toBeVisible({ timeout: 15000 })
    // A REAL Leaflet canvas with at least one pin (circle markers render as
    // SVG paths in the overlay pane — the same selector the V19 t02 spec uses).
    await expect(page.locator('.leaflet-container').first()).toBeVisible()
    const pins = await page.locator('path.leaflet-interactive').count()
    expect(pins, 'the placed drop-in must produce at least one map pin').toBeGreaterThan(0)
    // The band states how many places carry drop-ins.
    const label = await band.locator('span').first().innerText()
    expect(label).toMatch(/^\d+ places? with drop-ins$/)
    // Map view does NOT stack the list under the map: the card is gone.
    await expect(page.getByText(placedPost.title, { exact: false })).toHaveCount(0)

    // ------------------------------------------------------------------
    // 3. TAP LIST → back to the day sections; the map is gone again.
    // ------------------------------------------------------------------
    await listButton.click()
    await expect(listButton).toHaveAttribute('aria-pressed', 'true')
    await expect(mapButton).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('feed-map-band')).toHaveCount(0)
    await expect(page.locator('.leaflet-container')).toHaveCount(0)
    await expect(page.getByText(placedPost.title, { exact: false })).toBeVisible()

    // ------------------------------------------------------------------
    // 5. RELOAD RESETS TO LIST — no persistence, the default wins every visit.
    // ------------------------------------------------------------------
    await mapButton.click()
    await expect(page.getByTestId('feed-map-band')).toBeVisible()
    await page.reload()
    await settleOnRoute(page, '/')
    await expect(listButton).toHaveAttribute('aria-pressed', 'true')
    await expect(mapButton).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('feed-map-band')).toHaveCount(0)
  } finally {
    // Best-effort cleanup: a leftover row would skew every later feed spec.
    if (createdId !== null) {
      await fetch(`${restUrl}/rest/v1/playdates?id=eq.${createdId}`, {
        method: 'DELETE',
        headers: restHeaders,
      }).catch(() => {})
    }
  }
})
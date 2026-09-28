/**
 * V27 slice 2 — the vibe chips on /new.
 *
 * The RULE is unit-tested at the pure seam (src/lib/vibeChips.test.ts). This
 * spec proves the WIRING the unit test cannot: the row renders under the
 * Details label, one chip per `VIBE_CHIPS` entry, and a tap really rewrites the
 * textarea through `applyVibeChip` — empty → the sentence, the same chip again
 * → unchanged, a second chip → appended on a new line.
 *
 * It also takes the slice's phone pass at 320px, where the AC's two measured
 * constraints live: every chip clears the 44px tap floor and the row wraps with
 * no horizontal overflow.
 *
 * It deliberately does NOT submit: e2e/post-fast.e2e.ts already proves the /new
 * submit path end to end, and a spec that posted would need the marker cleanup
 * those specs carry. Read-only, so it leaves no row behind.
 */
import { expect, test } from '@playwright/test'
import { VIBE_CHIPS } from '../src/lib/vibeChips'
import { settleOnRoute } from './fixtures'

/** The Details textarea's own placeholder (byte-for-byte from the component). */
const DETAILS_PLACEHOLDER = 'Anything parents should know — what to bring, parking, weather plan…'

test('a vibe chip tap turns the optional Details into a sentence', async ({ page }) => {
  // The tightest width the AC names, so this one run covers the phone pass and
  // the write behavior together.
  await page.setViewportSize({ width: 320, height: 812 })
  await page.goto('/new')
  await settleOnRoute(page, '/new')

  // The row is there, with exactly one button per starter.
  await expect(page.getByTestId('vibe-chips')).toBeVisible()
  const chips = page.getByTestId('vibe-chip')
  await expect(chips).toHaveCount(VIBE_CHIPS.length)

  // The phone pass: the row wraps instead of pushing the page sideways, and
  // each chip clears the 44px tap-target floor.
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth)
  for (let i = 0; i < VIBE_CHIPS.length; i++) {
    const box = await chips.nth(i).boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
  }

  const details = page.getByPlaceholder(DETAILS_PLACEHOLDER)

  // An empty field becomes chip 0's sentence.
  await chips.nth(0).click()
  await expect(details).toHaveValue(VIBE_CHIPS[0].text)

  // The same chip again is a no-op — no duplicate sentence.
  await chips.nth(0).click()
  await expect(details).toHaveValue(VIBE_CHIPS[0].text)

  // A second chip appends on a new line.
  await chips.nth(1).click()
  await expect(details).toHaveValue(`${VIBE_CHIPS[0].text}\n${VIBE_CHIPS[1].text}`)
})

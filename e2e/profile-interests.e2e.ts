/**
 * v35-B (`muzjx0we`) — THE PROFILE'S INTERESTS AS EMOJI + TEXT BUBBLES.
 *
 * The founder, verbatim (agentation `muzjx0we-wnkwjy`, anchored on `/profile`):
 *
 *   *"under interests, I would like a bubble with a lot of different different
 *   categories that are represented by text plus a corresponding emoji … if
 *   they're a book lover, it should say 'Book Lover 📕' in a pill ui … if you
 *   see them at a drop-in you have like something to connect on."*
 *
 * WHAT THIS SPEC PINS, and the half of each that could break:
 *
 *   1. ACCEPTANCE (a): a profile that names three categories renders three
 *      bubbles, each carrying its own text. Asserted by COUNT and by TEXT, so a
 *      row that dropped an entry cannot pass on a loose container.
 *   2. ACCEPTANCE (b): a KNOWN category wears its mapped emoji. The expectation
 *      is built from the lib seam (`emojiForInterest`), never a second copy of
 *      the mapping — a spec that restated "☕" would keep passing if the module's
 *      map changed meaning.
 *   3. ACCEPTANCE (c): an UNKNOWN category keeps its text and shows NO emoji.
 *      This is its own assertion, because the defect it guards — a fallback
 *      glyph making a stranger's category look recognised — is invisible to
 *      every other leg here.
 *   4. ACCEPTANCE (d): the row wraps at 390px and never widens the page
 *      (`scrollWidth <= clientWidth + 1`), with each bubble inside the edge.
 *   5. ACCEPTANCE (e): the ORDER is the parent's own, and it is stable across a
 *      reload — no reshuffle between renders.
 *   6. The bubbles are LABELS, not controls: nothing inside the row is a
 *      button, a link or `aria-pressed`.
 *
 * THE INTERESTS ARE SEEDED THROUGH THE APP'S OWN EDITOR (`edit-profile` →
 * `interests-input`, which autosaves), not by a hand-built REST payload: the
 * row this page reads is the row the app wrote. The marker's ORIGINAL interests
 * are snapshotted first and restored in a `finally`, because the live project's
 * marker row is shared by the whole suite.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { emojiForInterest, interestBubbles } from '../src/lib/interestBubbles'
import { settleOnRoute } from './fixtures'

/**
 * A MIX the spec needs: two categories the vocabulary knows and one it cannot.
 * The unknown one is deliberately a plausible parent interest rather than
 * gibberish — "Competitive Napping" is the shape of thing a real family writes,
 * so the leg tests the honest case and not an obviously-broken input.
 */
const KNOWN_BOOK = 'Book Lover' // the founder's own example
const KNOWN_HIKING = 'Hiking'
const UNKNOWN = 'Competitive Napping'
const SEEDED = `${KNOWN_BOOK}, ${KNOWN_HIKING}, ${UNKNOWN}`

/** Every bubble in the row, so a count is always about the row. */
const BUBBLES = '[data-testid="interest-bubble"]'

/** Open /profile and settle past the onboarding-gate race. */
async function openProfile(page: Page): Promise<void> {
  await page.goto('/profile')
  await settleOnRoute(page, '/profile')
  // The read view's own Edit control proves the route stood and the row loaded.
  await expect(page.getByTestId('edit-profile')).toBeVisible({ timeout: 20_000 })
}

/** Write the marker's interests through the app's own editor (autosaved). */
async function seedInterests(page: Page, value: string): Promise<void> {
  await page.goto('/profile')
  await settleOnRoute(page, '/profile')
  await page.getByTestId('edit-profile').click()
  const input = page.getByTestId('interests-input')
  await expect(input).toBeVisible({ timeout: 20_000 })
  await input.fill(value)
  /**
   * ⚠️ THE DEBOUNCE IS THE TRAP HERE (measured, not guessed). The interests
   * field saves on a debounce while the editor is open; clicking Done
   * immediately after `fill` closes the editor BEFORE the write fires, so the
   * row on the read view still shows the OLD value — the spec then fails on a
   * page that is behaving correctly. The wait below is the write's own latency,
   * bounded, and the assertion after Done is what proves it landed.
   */
  await page.waitForTimeout(1200)
  await page.getByTestId('done-editing-profile').click()
  await expect(page.getByTestId('interests-input')).toHaveCount(0)
  // Prove the write landed on the READ view rather than assuming it: an empty
  // seed means "no row", any other value means the row is up with our words.
  if (value.trim() === '') {
    await expect(page.getByTestId('profile-interests')).toHaveCount(0, { timeout: 15_000 })
  } else {
    await expect(page.getByTestId('profile-interests')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('profile-interests')).toContainText(value.split(',')[0].trim())
  }
}

test('each interest renders as its own text bubble, in the parent’s order (V35-B)', async ({
  page,
}) => {
  await seedInterests(page, SEEDED)

  try {
    await openProfile(page)

    // ACCEPTANCE (a): three categories, three bubbles, each with its text.
    const bubbles = page.locator(BUBBLES)
    await expect(bubbles).toHaveCount(3)
    await expect(bubbles.nth(0)).toContainText(KNOWN_BOOK)
    await expect(bubbles.nth(1)).toContainText(KNOWN_HIKING)
    await expect(bubbles.nth(2)).toContainText(UNKNOWN)

    // ACCEPTANCE (e): the order is the parent's, not alphabetical and not
    // sorted. ⚠️ `innerText` puts a newline between the emoji span and the text
    // span (they are separate elements), so the comparison is on the SEQUENCE
    // of texts with whitespace collapsed — not on a joined string, which would
    // be asserting the DOM's whitespace and not the order.
    const rendered = (await bubbles.allInnerTexts()).map((t) =>
      t.replace(/\s+/g, ' ').trim(),
    )
    expect(rendered).toEqual(
      interestBubbles(SEEDED).map((b) => (b.emoji === null ? b.text : `${b.emoji} ${b.text}`)),
    )

    // ACCEPTANCE (b): the KNOWN categories wear their mapped emoji — the
    // expectation comes from the seam, so the two can never drift.
    const bookEmoji = emojiForInterest(KNOWN_BOOK)
    const hikingEmoji = emojiForInterest(KNOWN_HIKING)
    expect(bookEmoji, 'the fixture assumes the vocabulary knows "Book Lover"').not.toBeNull()
    expect(hikingEmoji, 'the fixture assumes the vocabulary knows "Hiking"').not.toBeNull()
    await expect(bubbles.nth(0).getByTestId('interest-bubble-emoji')).toHaveText(bookEmoji!)
    await expect(bubbles.nth(1).getByTestId('interest-bubble-emoji')).toHaveText(hikingEmoji!)

    // ACCEPTANCE (c): the UNKNOWN category keeps its text and shows NO emoji.
    // This is the defect's own leg: a default glyph would light this up.
    expect(
      emojiForInterest(UNKNOWN),
      'the fixture assumes "Competitive Napping" is NOT in the vocabulary',
    ).toBeNull()
    await expect(bubbles.nth(2).getByTestId('interest-bubble-emoji')).toHaveCount(0)
    await expect(bubbles.nth(2)).toHaveText(UNKNOWN)

    // The bubbles are LABELS: nothing in the row is pressable.
    const row = page.getByTestId('profile-interests')
    await expect(row.locator('button')).toHaveCount(0)
    await expect(row.locator('a')).toHaveCount(0)
    await expect(row.locator('input')).toHaveCount(0)
    await expect(row.locator('[aria-pressed]')).toHaveCount(0)
    await expect(bubbles.nth(0)).toHaveJSProperty('tagName', 'LI')
  } finally {
    await seedInterests(page, '')
  }
})

test('the interest bubbles wrap at 390px and never widen the page (V35-B)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await seedInterests(page, SEEDED)

  try {
    await openProfile(page)
    const row = page.getByTestId('profile-interests')
    await expect(row).toHaveCount(1)
    expect(await row.evaluate((node) => getComputedStyle(node).flexWrap)).toBe('wrap')

    // ACCEPTANCE (d): the row wraps rather than widens the document.
    const widths = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }))
    expect(
      widths.scroll,
      `390px must not widen: scrollWidth ${widths.scroll} vs clientWidth ${widths.client}`,
    ).toBeLessThanOrEqual(widths.client + 1)

    // Every bubble stays inside the right edge — one clipped at the edge would
    // keep the document width legal while hiding half a word.
    for (const bubble of await page.locator(BUBBLES).all()) {
      const box = await bubble.boundingBox()
      expect(box, 'each bubble must render a box').not.toBeNull()
      expect(box!.x + box!.width).toBeLessThanOrEqual(391)
    }
  } finally {
    await seedInterests(page, '')
  }
})

test('an unknown interest never gets an emoji — and the row survives a reload (V35-B)', async ({
  page,
}) => {
  // The founder's rule at its sharpest: a profile whose interests are ALL
  // unknown still renders every bubble, emoji-free. The row is never blank and
  // never invents a glyph.
  const onlyUnknown = 'Competitive Napping, Kombucha Brewing'
  await seedInterests(page, onlyUnknown)

  try {
    await openProfile(page)
    const bubbles = page.locator(BUBBLES)
    await expect(bubbles).toHaveCount(2)
    await expect(page.getByTestId('interest-bubble-emoji')).toHaveCount(0)
    await expect(bubbles.nth(0)).toHaveText('Competitive Napping')
    await expect(bubbles.nth(1)).toHaveText('Kombucha Brewing')

    // ACCEPTANCE (e), the stability half: a reload of the SAME data renders the
    // same order. A reshuffle between renders is what this catches. The reload
    // is a plain one (not `openProfile`, which would navigate and lose it).
    const before = await bubbles.allInnerTexts()
    await page.reload()
    await expect(page.getByTestId('profile-interests')).toBeVisible({ timeout: 20_000 })
    expect(await page.locator(BUBBLES).allInnerTexts()).toEqual(before)
  } finally {
    await seedInterests(page, '')
  }
})

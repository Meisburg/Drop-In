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
 * THE INTERESTS ARE SEEDED THROUGH THE APP'S OWN PERSISTENCE PATH: the
 * remove-buttons slice removed the `interests-input` that V32-2 (A6c) had put
 * beside the display name (the founder ruled it redundant with the per-parent
 * interests cards), so the spec now writes `profiles.interests` directly with
 * the marker's OWN session token through PostgREST — the exact RLS-scoped row
 * the app's `updateInterests` seam writes (trimmed value, the row this page
 * reads is the row the app's own seam would write). The marker's ORIGINAL
 * interests are snapshotted first and restored in a `finally`, because the
 * live project's marker row is shared by the whole suite.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { emojiForInterest, interestBubbles } from '../src/lib/interestBubbles'
import { readMarkerSession, readSupabaseEnv, settleOnRoute } from './fixtures'

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

/**
 * Write the marker's `profiles.interests` row through PostgREST with the
 * marker's OWN session token — the same RLS-scoped write the app's
 * `updateInterests` seam performs (the app trims; an empty value clears the
 * field). The read-back from the PATCH's own representation is what proves the
 * write landed: a PATCH that matched zero rows (a stale id) is a silent no-op
 * in the database, so the read-back is what makes it loud. `null` (the column
 * was unset, pre-0022 rows) is written back as `null`, never as `''`.
 */
async function writeInterests(value: string | null): Promise<void> {
  const { url, anonKey } = readSupabaseEnv()
  const { accessToken, userId } = readMarkerSession()
  const headers: Record<string, string> = {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }
  const res = await fetch(
    `${url}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=interests`,
    { method: 'PATCH', headers, body: JSON.stringify({ interests: value }) },
  )
  if (!res.ok) throw new Error(`interests write HTTP ${res.status}: ${await res.text()}`)
  const rows = (await res.json()) as Array<{ interests: string | null }>
  if (rows.length !== 1 || rows[0].interests !== value) {
    throw new Error(
      `interests write did not land: expected ${JSON.stringify(value)}, read back ${JSON.stringify(rows)}`,
    )
  }
}

/** The seed the spec's assertions run against: the app seam's own trim. */
async function seedInterests(value: string): Promise<void> {
  await writeInterests(value.trim())
}

/**
 * The marker's ORIGINAL interests, captured once BEFORE the first seed (the
 * live project's marker row is shared by the whole suite, so each test's
 * `finally` restores exactly this — `null` and `''` kept distinct).
 */
let originalInterests: string | null | undefined

async function captureOriginal(): Promise<string | null> {
  if (originalInterests !== undefined) return originalInterests
  const { url, anonKey } = readSupabaseEnv()
  const { accessToken, userId } = readMarkerSession()
  const res = await fetch(
    `${url}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=interests`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` } },
  )
  if (!res.ok) throw new Error(`interests snapshot HTTP ${res.status}: ${await res.text()}`)
  const rows = (await res.json()) as Array<{ interests: string | null }>
  originalInterests = rows.length === 1 ? (rows[0].interests ?? null) : null
  return originalInterests
}

/** The `finally` restore: put the marker's row back exactly as the suite found it. */
async function restoreInterests(original: string | null): Promise<void> {
  await writeInterests(original)
}

test('each interest renders as its own text bubble, in the parent’s order (V35-B)', async ({
  page,
}) => {
  const original = await captureOriginal()
  await seedInterests(SEEDED)

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
    await restoreInterests(original)
  }
})

test('the interest bubbles wrap at 390px and never widen the page (V35-B)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const original = await captureOriginal()
  await seedInterests(SEEDED)

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
    await restoreInterests(original)
  }
})

test('an unknown interest never gets an emoji — and the row survives a reload (V35-B)', async ({
  page,
}) => {
  // The founder's rule at its sharpest: a profile whose interests are ALL
  // unknown still renders every bubble, emoji-free. The row is never blank and
  // never invents a glyph.
  const onlyUnknown = 'Competitive Napping, Kombucha Brewing'
  const original = await captureOriginal()
  await seedInterests(onlyUnknown)

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
    await restoreInterests(original)
  }
})

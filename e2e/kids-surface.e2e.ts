/**
 * V10 ticket 02 — "Kids you're bringing" surfaces above "More options" for a
 * parent who HAS kids.
 *
 * The ticket's claims, end to end against the live project:
 *
 *  1. THE SURFACED SECTION. With the marker's seeded kids live, /new renders
 *     the "kids-section" ABOVE the disclosure (before "more-options" in the
 *     DOM), with the same chips the disclosure used to hold (accessible names
 *     "Bernie · 6" — kidLabel, V9 t05's optional-name rule), the same
 *     aria-pressed state, and ≥44px targets (min-h-11).
 *  2. THE DISCLOSURE'S HINT TELLS THE TRUTH. With kids surfaced, the hint no
     longer claims "kids" live behind the door (MORE_OPTIONS_HINT_WITHOUT_KIDS);
     the picker is NOT in the body (a field in two places is two tab stops for
     one answer).
 *  3. THE NO-KIDS FORM. With NO kid rows (the marker's kids deleted), /new
     renders NO kids-section, the picker + the "Add kids" empty state stay
     inside the disclosure, and the hint is the no-kids copy (V11 t05 dropped
     "A date," from both hints) — asserted by this spec's second test.
 *  4. THE SUBMIT PATH IS UNCHANGED. Picking a surfaced chip + posting lands
     the playdate_kids rows (the "Kids coming" line on the detail page) — the
     same contract kids-v3 pins through the disclosure.
 *
 * Cleanup mirrors kids-v3.e2e.ts (posts + kids, best-effort, logged).
 */
import { expect, test } from '@playwright/test'
import {
  editTitle,
  localDatePlusDays,
  openMoreOptions,
  readMarkerMeta,
  readMarkerSession,
  readSupabaseEnv,
  settleOnRoute,
} from './fixtures'

const TITLE_PLACEHOLDER = 'e.g. Playground time at Green Lake'
const PLACE_PLACEHOLDER = 'e.g. Green Lake playground, near the boathouse'

/** The marker's kid rows as they stand (id + name + age). */
type MarkerKid = { id: string; first_name: string; age: number }

const KIDS = [
  { first_name: 'Bernie', age: 6 },
  { first_name: 'Lily', age: 4 },
] as const

async function createMarkerKids(): Promise<MarkerKid[]> {
  const { url, anonKey } = readSupabaseEnv()
  const { accessToken, userId } = readMarkerSession()
  const headers: Record<string, string> = {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
  for (const kid of KIDS) {
    const res = await fetch(`${url}/rest/v1/kids`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ profile_id: userId, ...kid }),
    })
    if (!res.ok) {
      throw new Error(`marker kid insert HTTP ${res.status}: ${await res.text()}`)
    }
  }
  const check = await fetch(`${url}/rest/v1/kids?profile_id=eq.${userId}&select=id,first_name,age`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
  })
  if (!check.ok) {
    throw new Error(`marker kid read-back HTTP ${check.status}`)
  }
  const rows = (await check.json()) as MarkerKid[]
  if (rows.length < KIDS.length) {
    throw new Error(`expected ${KIDS.length} marker kid rows, got ${rows.length}`)
  }
  return rows
}

test('with kids, the picker surfaces above the disclosure, the hint swaps, and a selection still lands', async ({
  page,
}) => {
  const marker = readMarkerMeta()
  const title = `e2e ${marker.displayName} kids surface`
  const place = 'E2E Kids Surface lot'
  const kids = await createMarkerKids()

  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/new')
  await settleOnRoute(page, '/new')

  // 1. The surfaced section: visible WITHOUT opening the disclosure, ABOVE it
  //    in the form's flow, holding one chip per kid (the same labels).
  const section = page.getByTestId('kids-section')
  await expect(section).toBeVisible()
  await expect(page.getByText("Kids you're bringing")).toBeVisible()
  for (const kid of kids) {
    const chip = section.getByRole('button', {
      name: `${kid.first_name} · ${kid.age}`,
      exact: true,
    })
    await expect(chip).toBeVisible()
    await expect(chip).toHaveAttribute('aria-pressed', 'false')
  }
  // The empty state ("Add your kids on your profile") is ABSENT — the marker
  // has kids.
  await expect(page.getByText('Add your kids on your profile')).toHaveCount(0)

  // Order: the section renders BEFORE the disclosure toggle in the DOM.
  const domOrder = await page.evaluate(() => {
    const sectionEl = document.querySelector('[data-testid="kids-section"]')
    const toggleEl = document.querySelector('[data-testid="more-options"]')
    if (sectionEl === null || toggleEl === null) return null
    return sectionEl.compareDocumentPosition(toggleEl) & Node.DOCUMENT_POSITION_FOLLOWING
      ? 'section-first'
      : 'toggle-first'
  })
  expect(domOrder).toBe('section-first')

  // 2. The hint tells the truth: no "kids" behind this door now, and no date
  //    (V11 t05 moved the start into the visible "When" section).
  await expect(page.getByText('An address, details, or a weekly repeat.')).toBeVisible()
  await openMoreOptions(page)
  const body = page.getByTestId('more-options-body')
  await expect(body).toBeVisible()
  // The picker is NOT in the body (and not anywhere else a second time).
  await expect(page.getByText("Kids you're bringing")).toHaveCount(1)
  await expect(body.getByText("Kids you're bringing")).toHaveCount(0)

  // 3. Pick both surfaced chips (the submit path unchanged) and post.
  await editTitle(page)
  await page.getByPlaceholder(TITLE_PLACEHOLDER).fill(title)
  await page.getByPlaceholder(PLACE_PLACEHOLDER).fill(place)
  await page.locator('input[type="date"]').fill(localDatePlusDays(1))
  for (const kid of kids) {
    const chip = section.getByRole('button', {
      name: `${kid.first_name} · ${kid.age}`,
      exact: true,
    })
    await chip.click()
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
  }
  await page.getByRole('button', { name: '1h', exact: true }).click()
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')
  const card = page.locator('a').filter({ hasText: title }).first()
  await expect(card).toBeVisible()
  const href = (await card.getAttribute('href')) ?? ''
  if (!href.startsWith('/playdate/')) {
    throw new Error(`the card for "${title}" has no detail href (got "${href}")`)
  }

  // The selection landed: the detail page's "Kids coming" line names both
  // (the host sees names — the 0040 gate).
  const ages = kids.map((kid) => kid.age)
  await page.goto(href)
  await page.getByRole('heading', { name: title, exact: true }).waitFor()
  await expect(page.locator('p').filter({ hasText: 'Kids coming:' })).toHaveText(
    `Kids coming: Ages ${Math.min(...ages)}–${Math.max(...ages)} · ${kids
      .map((kid) => kid.first_name)
      .join(', ')}`,
  )
})

test('with no kids, /new renders today\u2019s form (picker inside the disclosure, no-kids hint)', async ({
  page,
}) => {
  // No kid rows for this context: the marker's kids were deleted by the
  // previous test's cleanup (workers = 1, serial — but this test does not
  // RELY on that order; it only asserts the no-kids render, which holds
  // whether the rows were ever created or just cleaned).
  await page.goto('/new')
  await settleOnRoute(page, '/new')

  // The surfaced section is ABSENT; the disclosure holds the picker + the
  // empty state + the no-kids hint (V11 t05: "A date," dropped from both hints,
  // so this is the no-kids copy, not V9 t03's original).
  await expect(page.getByTestId('kids-section')).toHaveCount(0)
  await expect(page.getByText('An address, kids, details, or a weekly repeat.')).toBeVisible()
  await expect(page.getByText("Kids you're bringing")).toHaveCount(0)
  await openMoreOptions(page)
  await expect(page.getByText("Kids you're bringing")).toBeVisible()
  // Loading vs empty is kids-state-dependent, but a no-rows parent gets the
  // designed empty state (the load resolves to [] for a kidless profile).
  await expect(page.getByText('Add your kids on your profile')).toBeVisible()
})

test.afterEach(async () => {
  // Best-effort cleanup (the kids-v3 pattern): the marker's playdate rows
  // (playdate_kids cascades, 0022) then the marker's kid rows (0011
  // kids_delete_own). A failure is logged, not fatal.
  try {
    const { url, anonKey } = readSupabaseEnv()
    const { accessToken, userId } = readMarkerSession()
    const headers: Record<string, string> = {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'return=representation',
    }
    const postQuery = `${url}/rest/v1/playdates?host_profile_id=eq.${userId}&select=id`
    const postDel = await fetch(postQuery, { method: 'DELETE', headers })
    const kidQuery = `${url}/rest/v1/kids?profile_id=eq.${userId}&select=id`
    const kidDel = await fetch(kidQuery, { method: 'DELETE', headers })
    const kidCheck = await fetch(kidQuery, { headers })
    const kidsRemaining = kidCheck.ok
      ? ((await kidCheck.json()) as Array<Record<string, unknown>>)
      : null
    if (!postDel.ok || (kidsRemaining !== null && kidsRemaining.length > 0)) {
      console.log(
        `[e2e cleanup] FAILED — playdate delete HTTP ${postDel.ok ? 'ok' : postDel.status}, ` +
          `kid delete HTTP ${kidDel.ok ? 'ok' : kidDel.status} (${kidsRemaining?.length ?? '?'} remain) ` +
          `(host ${userId}) — orchestrator sweep will pick them up`,
      )
    } else {
      console.log(`[e2e cleanup] ok — deleted the marker's playdate + kid row(s) (host ${userId})`)
    }
  } catch (err) {
    console.log(
      `[e2e cleanup] FAILED (logged, best-effort): ${err instanceof Error ? err.message : err}`,
    )
  }
})
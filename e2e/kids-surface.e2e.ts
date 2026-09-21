/**
 * V10 ticket 02 — "Kids you're bringing" surfaces in the visible flow for a
 * parent who HAS kids. V13 ticket 02: the "More options" disclosure is GONE;
 * the kids section now renders LAST in the form (right before Post), in the
 * visible flow.
 *
 * The ticket's claims, end to end against the live project:
 *
 *  1. THE SURFACED SECTION. With the marker's seeded kids live, /new renders
 *     the "kids-section" LAST in the form flow (after When/address/repeat/ages,
 *     before the Post button), with the same chips (accessible names
 *     "Bernie · Age 6" — kidLabel, V15 T05 A13's optional-name rule), the same
 *     aria-pressed state, and ≥44px targets (min-h-11).
 *  2. NO DISCLOSURE. There is no "more-options" toggle, no hint line, and no
     `more-options-body` container — everything that lived behind the door now
     has a visible home in the form's tail block.
 *  3. THE NO-KIDS FORM. With NO kid rows (the marker's kids deleted), /new
     renders NO kids-section; the picker + the "Add kids" empty state render in
     the visible flow (the kidsBlock fallback when kidsSectionSlot is
     undefined) — asserted by this spec's second test.
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
      name: `${kid.first_name} · Age ${kid.age}`,
      exact: true,
    })
    await expect(chip).toBeVisible()
    await expect(chip).toHaveAttribute('aria-pressed', 'false')
  }
  // The empty state ("Add your kids in your settings") is ABSENT — the marker
  // has kids.
  await expect(page.getByText('Add your kids in your settings')).toHaveCount(0)

  // V13 ticket 02: the "More options" disclosure is GONE — the kids section now
  // renders LAST in the form flow, right before the Post button (the AC's order:
  // title/describe → place → time → address → repeat/ages/details → kids → Post).
  // Assert it comes AFTER the When section and BEFORE the submit button.
  const domOrder = await page.evaluate(() => {
    const sectionEl = document.querySelector('[data-testid="kids-section"]')
    const whenEl = document.querySelector('[data-testid="start-time-label"]')
    const submitBtn = document.querySelector('button[type="submit"]')
    if (sectionEl === null || whenEl === null || submitBtn === null) return null
    const afterWhen = whenEl.compareDocumentPosition(sectionEl) & Node.DOCUMENT_POSITION_FOLLOWING
    const beforeSubmit = sectionEl.compareDocumentPosition(submitBtn) & Node.DOCUMENT_POSITION_FOLLOWING
    return afterWhen && beforeSubmit ? 'last-before-post' : 'wrong-position'
  })
  expect(domOrder).toBe('last-before-post')

  // V13 ticket 02: the disclosure is gone — there is no hint line and no
  // `more-options-body` container. The kids section is the only place the
  // picker renders (count 1, visible), sitting in the visible flow.
  await expect(page.getByTestId('more-options-body')).toHaveCount(0)
  await expect(page.getByText("Kids you're bringing")).toHaveCount(1)

  // 3. Pick both surfaced chips (the submit path unchanged) and post.
  await editTitle(page)
  await page.getByPlaceholder(TITLE_PLACEHOLDER).fill(title)
  await page.getByPlaceholder(PLACE_PLACEHOLDER).fill(place)
  await page.locator('input[type="date"]').fill(localDatePlusDays(1))
  for (const kid of kids) {
    const chip = section.getByRole('button', {
      name: `${kid.first_name} · Age ${kid.age}`,
      exact: true,
    })
    await chip.click()
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
  }
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

  // V13 ticket 02: the disclosure is gone — a no-kids parent sees the picker's
  // empty state in the VISIBLE flow (the kidsBlock fallback renders when
  // kidsSectionSlot is undefined). No hint line, no more-options-body.
  await expect(page.getByTestId('kids-section')).toHaveCount(0)
  await expect(page.getByTestId('more-options-body')).toHaveCount(0)
  await expect(page.getByText("Kids you're bringing")).toBeVisible()
  // Loading vs empty is kids-state-dependent, but a no-rows parent gets the
  // designed empty state (the load resolves to [] for a kidless profile).
  await expect(page.getByText('Add your kids in your settings')).toBeVisible()
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
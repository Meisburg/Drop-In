/**
 * V10 ticket 03 — "Describe it instead": the sentence prefill on /new.
 *
 * The LLM edge function is MOCKED at the network boundary (page.route — no
 * e2e ever calls a real provider; the ticket pins that). The mock doubles as
 * the privacy assertion surface: the route handler SNAPSHOT's the request
 * body and the spec asserts it carried exactly text/todayIso/timezone — the
 * client's own prefillFetch test pins the same thing, so the pin is held
 * from both ends.
 *
 * The claims:
 *  1. The affordance is COLLAPSED by default (summary-first form is the
 *     primary path) and opens to a sentence box + "Fill the form".
 *  2. A successful prefill writes ONLY the arrived fields through the same
 *     clamp rules (grid time, chip set, title cap), the summary read-back
 *     shows them, the place resolves against the directory when it exactly
 *     matches a name, and the parent still taps Post.
 *  3. The parent's edits AFTER the prefill always win; the generated-title
 *     rule stays armed (an LLM title is not the parent's typed words).
 *  4. A failing call degrades to a quiet inline error; the form is untouched.
 *  5. THE PRIVACY PIN: the request body is exactly { text, todayIso,
 *     timezone } — nothing else crosses, ever.
 */
import { expect, test } from '@playwright/test'
import {
  editTitle,
  openMoreOptions,
  readMarkerMeta,
  readMarkerSession,
  readSupabaseEnv,
  settleOnRoute,
} from './fixtures'

const TITLE_PLACEHOLDER = 'e.g. Playground time at Green Lake'
const PLACE_PLACEHOLDER = 'e.g. Green Lake playground, near the boathouse'
const SENTENCE = 'E2E Describe lot tomorrow 10:00 AM for 2 hours'

test('a sentence fills the form for review, and the body carries only text/todayIso/timezone', async ({
  page,
}) => {
  const marker = readMarkerMeta()
  const title = `e2e ${marker.displayName} prefill post`
  // The prefill's date/time must land in a window the FEED will still show
  // (V9 ticket 04: nothing that has ended stays) — tomorrow at 10:00, so the
  // run's wall clock can never put it in the past (the 23:45 wrap case gives
  // a "tomorrow" that is ≥ today+1 either way).
  const tomorrowIso = (() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  })()

  // The mock: a legal field set (place + date + grid time + chip + details).
  // It records the request body for the privacy assertion.
  const bodies: Array<Record<string, unknown>> = []
  await page.route(/\/functions\/v1\/prefill-playdate/, async (route) => {
    bodies.push(JSON.parse((await route.request().postData()) ?? '{}') as Record<string, unknown>)
    // A beat of latency so the busy state ("Filling…") is observable — the
    // real function is a network round-trip, so this matches reality.
    await new Promise((resolve) => setTimeout(resolve, 300))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        fields: {
          place: 'E2E Describe lot',
          startDate: tomorrowIso,
          startMinutes: 600,
          durationMinutes: 120,
          details: 'Look for the red wagon',
        },
      }),
    })
  })

  await page.goto('/new')
  await settleOnRoute(page, '/new')

  // 1. Collapsed by default; open it.
  await expect(page.getByTestId('describe-input')).toHaveCount(0)
  await page.getByTestId('describe-toggle').click()
  await expect(page.getByTestId('describe-input')).toBeVisible()

  // The button is disabled until there is a sentence.
  const fill = page.getByTestId('describe-fill')
  await expect(fill).toBeDisabled()
  await page.getByTestId('describe-input').fill(SENTENCE)
  await expect(fill).toBeEnabled()
  await fill.click()
  await expect(fill).toHaveText('Filling…')

  // 2. The form filled: the place is in the field, the summary reads the
  //    window back (10:00 AM–12:00 PM), and the details arrived (behind the
  //    disclosure — open it to read the textarea's value).
  await expect(page.getByPlaceholder(PLACE_PLACEHOLDER)).toHaveValue('E2E Describe lot')
  const summaryLines = page.getByTestId('post-summary-line')
  await expect(summaryLines.nth(1)).toHaveText('10:00 AM–12:00 PM')
  await openMoreOptions(page)
  await expect(page.getByPlaceholder('Anything parents should know — what to bring, parking, weather plan…')).toHaveValue(
    'Look for the red wagon',
  )

  // 5. THE PRIVACY PIN — the body carried exactly the three keys.
  expect(bodies).toHaveLength(1)
  const body = bodies[0]
  expect(Object.keys(body)).toHaveLength(3)
  expect(body.text).toBe(SENTENCE)
  expect(body.todayIso).toBe(new Date().toISOString().slice(0, 10))
  expect(typeof body.timezone).toBe('string')
  expect((body.timezone as string).length).toBeGreaterThan(0)

  // 3. The parent's edit after the prefill wins: correct the title, then post.
  await editTitle(page)
  await page.getByPlaceholder(TITLE_PLACEHOLDER).fill(title)
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')
  const card = page.locator('a').filter({ hasText: title }).first()
  await expect(card).toBeVisible()

  // The card's window is the prefilled one (the card's own compact format:
  // "10 AM–12 PM") — the prefill really landed.
  await expect(card).toContainText('10 AM–12 PM')
})

test('a failed prefill degrades to a quiet error and the form is untouched', async ({ page }) => {
  await page.route(/\/functions\/v1\/prefill-playdate/, (route) =>
    route.fulfill({ status: 502, contentType: 'application/json', body: '{"error":"boom"}' }),
  )
  await page.goto('/new')
  await settleOnRoute(page, '/new')
  await page.getByTestId('describe-toggle').click()
  await page.getByTestId('describe-input').fill('anything')
  await page.getByTestId('describe-fill').click()
  await expect(page.getByTestId('describe-error')).toBeVisible()

  // The form is untouched: the place is empty, no validation errors appeared,
  // and Post is still available (the prefill never blocks posting).
  await expect(page.getByPlaceholder(PLACE_PLACEHOLDER)).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Post drop-in' })).toBeEnabled()
})

test.afterEach(async ({ page }) => {
  await page.unrouteAll()
  // Best-effort cleanup (the house pattern): the marker's playdate rows.
  try {
    const { url, anonKey } = readSupabaseEnv()
    const { accessToken, userId } = readMarkerSession()
    const query = `${url}/rest/v1/playdates?host_profile_id=eq.${userId}&select=id`
    const headers: Record<string, string> = {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'return=representation',
    }
    const del = await fetch(query, { method: 'DELETE', headers })
    if (del.ok) {
      console.log('[e2e cleanup] ok — deleted the marker\u2019s playdate row(s)')
    }
  } catch (err) {
    console.log(`[e2e cleanup] FAILED (logged, best-effort): ${err instanceof Error ? err.message : err}`)
  }
})
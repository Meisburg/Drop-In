/**
 * V8 ticket 05 — post edit + delete: fix a plan instead of cancelling it.
 *
 * The ticket's claims, end to end against the live project:
 *  1. The host opens Edit on their own post, finds the form PREFILLED with
 *     what was posted (including the exact start time, through the same
 *     stepper labels), changes the start time + duration, saves, and BOTH
 *     viewer surfaces — the feed card and the detail page — show the new
 *     window (a rendered assertion, not a DB read-back).
 *  2. A save that changes nothing issues NO write at all (asserted on the
 *     network: no PATCH/POST/DELETE to /rest/v1/playdates).
 *  3. Delete asks for confirmation in an in-page dialog that names the real
 *     consequence (the "I'm going"s and the comments go with the post —
 *     going_pings/comments/playdate_kids/ping_kids all cascade from
 *     playdates), and only the confirmed tap deletes: the feed drops it and
 *     the old detail URL renders the existing not-found state.
 *  4. A post that has ALREADY STARTED is still editable — the date/time
 *     fields carry it as stored, no new rule is invented about the past.
 *  5. The edit route is host-only: a signed-out visitor is sent to the
 *     post's detail page (the public surface) and never sees the form.
 *
 * The time expectations come from the app's OWN pure seams (formatTimeLabel,
 * stepTimeMinutes from feed.ts) rather than from arithmetic on the rendered
 * label: the stepper's pinned contract is that a press steps 30 minutes and
 * WRAPS at midnight, so "two presses later" is stepTimeMinutes(start, 60) —
 * a spec that adds 120 to the raw minutes only agrees with the app for part
 * of the clock, which is exactly how the first draft of this file failed at
 * 11:30 PM.
 *
 * Everything the spec writes is created through the app's own UI as the
 * marker (the signed-in storageState), so the assertions are about what a
 * viewer sees. Cleanup mirrors the other specs: a best-effort REST delete of
 * the marker's playdate rows with the marker's own JWT (the host-only DELETE
 * policy is the wall), plus — for the delete case — a REST read proving the
 * row is actually gone. The e2e-<epoch> prefix marks any straggler for the
 * orchestrator's sweep; the database's cascades are what remove the
 * children (nothing is hand-deleted here, client-side or in the spec).
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
// The app's own label + stepper math (feed.ts is pure — its imports are all
// `import type`), so a spec expectation is the rule the form applies, never
// a copy of it (the quick-post.e2e.ts note).
import { formatTimeLabel, stepTimeMinutes, TIME_STEP_MINUTES } from '../src/lib/feed'
import {
  localDatePlusDays,
  readMarkerMeta,
  readMarkerSession,
  readSupabaseEnv,
  settleOnRoute,
  stepStartTimeOnce,
} from './fixtures'

const TITLE_PLACEHOLDER = 'e.g. Playground time at Green Lake'
const PLACE_PLACEHOLDER = 'e.g. Green Lake playground, near the boathouse'
const DETAILS_PLACEHOLDER =
  'Anything parents should know — what to bring, parking, weather plan…'
const PLACE = 'E2E edit lot'

/**
 * Post a drop-in through /new as the marker (the golden-path pattern:
 * steppers + chips, the end computed) and return what the form itself
 * rendered as the start — which is exactly what the edit form must prefill.
 */
async function postMarkerDropIn(
  page: Page,
  title: string,
  startDate: string,
): Promise<{ startLabel: string; startMinutes: number }> {
  const marker = readMarkerMeta()
  await page.goto('/new')
  await settleOnRoute(page, '/new')
  await page.getByPlaceholder(TITLE_PLACEHOLDER).fill(title)
  await page.getByPlaceholder(PLACE_PLACEHOLDER).fill(PLACE)
  await page.locator('select').selectOption({ label: marker.neighborhood })
  await page.locator('input[type="date"]').fill(startDate)
  const start = await stepStartTimeOnce(page)
  await page.getByRole('button', { name: '1h', exact: true }).click()
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')
  return { startLabel: start.startLabel, startMinutes: start.startMinutes }
}

/** The marker's own row for `title`, read back through PostgREST. */
async function findMarkerPlaydateId(title: string): Promise<string> {
  const { url, anonKey } = readSupabaseEnv()
  const { accessToken, userId } = readMarkerSession()
  const res = await fetch(
    `${url}/rest/v1/playdates?host_profile_id=eq.${userId}&select=id,title`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` } },
  )
  const rows = res.ok ? ((await res.json()) as Array<{ id: string; title: string }>) : []
  const row = rows.find((candidate) => candidate.title === title)
  if (row === undefined) {
    throw new Error(`No marker playdate titled "${title}" (HTTP ${res.status})`)
  }
  return row.id
}

/**
 * The feed card's window label drops the minutes at :00 ("4 PM–6 PM") — the
 * DropInCard formatTimeWindow rule. The form's own labels always carry them
 * ("4:00 PM"), so the spec applies that same rule before comparing.
 */
function cardWindow(startLabel: string, endLabel: string): string {
  const drop = (label: string): string => label.replace(':00 ', ' ')
  return `${drop(startLabel)}–${drop(endLabel)}`
}

test('the host fixes the start time — the card and the detail show the new window', async ({
  page,
}) => {
  const marker = readMarkerMeta()
  const title = `e2e ${marker.displayName} edit-time`
  // Two days out: inside the feed's upcoming window whatever the clock says.
  const startDate = localDatePlusDays(2)
  const { startLabel, startMinutes } = await postMarkerDropIn(page, title, startDate)
  const oldEndLabel = formatTimeLabel(startMinutes + 60)
  const details = 'E2E — moved an hour later, bring the blue ball.'

  await page.goto('/')
  const card = page.locator('a').filter({ hasText: title }).first()
  await expect(card).toBeVisible()
  const detailPath = (await card.getAttribute('href')) ?? ''

  // (a) What a viewer sees BEFORE the edit: the posted window, on the detail
  // page (compared against the labels the form itself rendered).
  await page.goto(detailPath)
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  await expect(page.getByText(`${startLabel}–${oldEndLabel}`)).toBeVisible()

  // (b) The host's Edit entry point lives in the "This is your post" panel.
  await expect(page.getByText('This is your post')).toBeVisible()
  await page.getByTestId('edit-post').click()
  await expect(page).toHaveURL(new RegExp(`${detailPath}/edit$`))
  await expect(page.getByRole('heading', { name: 'Edit your drop-in' })).toBeVisible()

  // (c) PREFILLED with the post as stored — title, place, date, the exact
  // start time, the duration chip, the neighborhood.
  await expect(page.getByPlaceholder(TITLE_PLACEHOLDER)).toHaveValue(title)
  await expect(page.getByPlaceholder(PLACE_PLACEHOLDER)).toHaveValue(PLACE)
  await expect(page.locator('input[type="date"]')).toHaveValue(startDate)
  await expect(page.getByTestId('start-time-label')).toHaveText(startLabel)
  await expect(page.getByRole('button', { name: '1h', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.locator('select')).toHaveValue(/.+/)
  await expect(page.getByText(`Ends ${oldEndLabel}`)).toBeVisible()

  // (d) The edit: a typo'd time moved an hour later, and the plan now runs 2h.
  // TWO presses of the pinned 30-minute stepper (the wrap at midnight is the
  // stepper's own rule — stepTimeMinutes is that rule).
  await page.getByRole('button', { name: 'Later start time' }).click()
  await page.getByRole('button', { name: 'Later start time' }).click()
  const newStartMinutes = stepTimeMinutes(startMinutes, 2 * TIME_STEP_MINUTES)
  const newStartLabel = formatTimeLabel(newStartMinutes)
  const newEndLabel = formatTimeLabel(newStartMinutes + 120)
  await expect(page.getByTestId('start-time-label')).toHaveText(newStartLabel)
  await page.getByRole('button', { name: '2h', exact: true }).click()
  await expect(page.getByText(`Ends ${newEndLabel}`)).toBeVisible()
  // A text field rides along (the free-text details), so the round-trip is
  // covered for more than the time controls.
  await page.getByPlaceholder(DETAILS_PLACEHOLDER).fill(details)

  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page).toHaveURL(new RegExp(`${detailPath}$`))

  // (e) The DETAIL page — a viewer's read of the row — shows the new window
  // and the new details…
  await expect(page.getByText(`${newStartLabel}–${newEndLabel}`)).toBeVisible()
  await expect(page.getByText(details)).toBeVisible()
  // …and not the window it used to have.
  await expect(page.getByText(`${startLabel}–${oldEndLabel}`)).toHaveCount(0)

  // (f) The FEED card shows the new window too (a fresh mount re-fetches).
  await settleOnRoute(page, '/')
  const editedCard = page.locator('a').filter({ hasText: title }).first()
  await expect(editedCard).toBeVisible()
  await expect(editedCard).toContainText(cardWindow(newStartLabel, newEndLabel))
  await expect(editedCard).not.toContainText(cardWindow(startLabel, oldEndLabel))

  // (g) The write is durable, not just optimistic: re-opening the edit form
  // prefills the NEW start from the stored row.
  await page.goto(`${detailPath}/edit`)
  await expect(page.getByTestId('start-time-label')).toHaveText(newStartLabel)
})

test('a save that changes nothing writes nothing', async ({ page }) => {
  const marker = readMarkerMeta()
  const title = `e2e ${marker.displayName} edit-noop`
  const { startLabel, startMinutes } = await postMarkerDropIn(page, title, localDatePlusDays(2))

  await page.goto('/')
  const card = page.locator('a').filter({ hasText: title }).first()
  await expect(card).toBeVisible()
  const detailPath = (await card.getAttribute('href')) ?? ''

  await page.goto(`${detailPath}/edit`)
  await expect(page.getByTestId('start-time-label')).toHaveText(startLabel)

  // Record every write the page issues while the no-op save runs. The edit
  // save is a PATCH (supabase-js update) to the playdates table — a no-op
  // must not send one (nor a delete/insert, nor a kids rewrite).
  const writes: string[] = []
  page.on('request', (request) => {
    const method = request.method()
    if (
      (method === 'PATCH' || method === 'POST' || method === 'DELETE') &&
      (request.url().includes('/rest/v1/playdates') ||
        request.url().includes('/rest/v1/playdate_kids'))
    ) {
      writes.push(`${method} ${request.url()}`)
    }
  })

  await page.getByRole('button', { name: 'Save changes' }).click()
  // The host lands back on the post — with nothing written.
  await expect(page).toHaveURL(new RegExp(`${detailPath}$`))
  await expect(page.getByText(`${startLabel}–${formatTimeLabel(startMinutes + 60)}`)).toBeVisible()
  expect(writes).toEqual([])
})

test('delete asks first, names the consequence, then removes it everywhere', async ({ page }) => {
  const marker = readMarkerMeta()
  const title = `e2e ${marker.displayName} edit-delete`
  await postMarkerDropIn(page, title, localDatePlusDays(2))

  const playdateId = await findMarkerPlaydateId(title)
  const detailPath = `/playdate/${playdateId}`
  await page.goto(detailPath)
  await page.getByTestId('delete-post').click()

  // (a) An IN-PAGE confirmation (never window.confirm — Playwright would have
  // no DOM to assert), and it says what actually happens: the going pings and
  // the comments go with the post, because they cascade from it.
  const dialog = page.getByTestId('delete-playdate-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Delete this drop-in?')
  await expect(dialog).toContainText('I’m going')
  await expect(dialog).toContainText('comments')
  await expect(dialog).toContainText('can’t be undone')

  // Cancel is a real out: nothing is deleted.
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()

  // (b) The confirmed delete.
  await page.getByTestId('delete-post').click()
  await page.getByTestId('confirm-delete-playdate').click()
  await expect(page).toHaveURL(/\/$/)

  // (c) The feed no longer lists it.
  await expect(page.getByRole('heading', { name: 'Near you' })).toBeVisible()
  await expect(page.getByRole('heading', { name: title, exact: true })).toHaveCount(0)

  // (d) The old detail URL renders the EXISTING not-found state.
  await page.goto(detailPath)
  await expect(page.getByRole('heading', { name: 'We couldn’t find this drop-in' })).toBeVisible()

  // (e) And the row is really gone (the write landed, not just the render):
  // a REST read with the marker's own JWT returns nothing.
  const { url, anonKey } = readSupabaseEnv()
  const { accessToken } = readMarkerSession()
  const res = await fetch(`${url}/rest/v1/playdates?id=eq.${playdateId}&select=id`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
  })
  expect(res.ok).toBe(true)
  expect((await res.json()) as Array<{ id: string }>).toEqual([])
})

test('a post that already started is still editable', async ({ page }) => {
  const marker = readMarkerMeta()
  const title = `e2e ${marker.displayName} edit-past`
  const pastDate = localDatePlusDays(-1)
  // The form invents no rule about the past: /new accepts yesterday, and the
  // host fixes the plan from the detail page afterwards (late plans are the
  // normal case — the host reaches a past post from /profile's Past list).
  const { startLabel } = await postMarkerDropIn(page, title, pastDate)

  const playdateId = await findMarkerPlaydateId(title)
  const detailPath = `/playdate/${playdateId}`
  await page.goto(`${detailPath}/edit`)

  // The form renders, carrying the stored (past) reality as-is.
  await expect(page.getByRole('heading', { name: 'Edit your drop-in' })).toBeVisible()
  await expect(page.locator('input[type="date"]')).toHaveValue(pastDate)
  await expect(page.getByTestId('start-time-label')).toHaveText(startLabel)

  const newTitle = `${title} (moved)`
  await page.getByPlaceholder(TITLE_PLACEHOLDER).fill(newTitle)
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page).toHaveURL(new RegExp(`${detailPath}$`))
  await expect(page.getByRole('heading', { name: newTitle, exact: true })).toBeVisible()
})

test('a signed-out visitor never reaches the edit form', async ({ page, browser }) => {
  const marker = readMarkerMeta()
  const title = `e2e ${marker.displayName} edit-guard`
  await postMarkerDropIn(page, title, localDatePlusDays(2))
  const detailPath = `/playdate/${await findMarkerPlaydateId(title)}`

  // An explicitly EMPTY storageState: browser.newContext() alone inherits the
  // project's signed-in `use.storageState` (verified in this repo's Playwright
  // version), which would make this whole test a no-op.
  const anonContext = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const anonPage = await anonContext.newPage()
  try {
    await anonPage.goto(`${detailPath}/edit`)
    // The post's public detail surface is where they land (not /login — the
    // edit route is an action on a public post), and there is no form.
    await expect(anonPage.getByRole('heading', { name: title, exact: true })).toBeVisible()
    expect(new URL(anonPage.url()).pathname).toBe(detailPath)
    await expect(anonPage.getByRole('button', { name: 'Save changes' })).toHaveCount(0)
    await expect(anonPage.getByPlaceholder(TITLE_PLACEHOLDER)).toHaveCount(0)
  } finally {
    await anonContext.close()
  }
})

test.afterEach(async () => {
  // Best-effort cleanup (the other specs' pattern): delete the marker's
  // playdate rows via PostgREST with the marker's own JWT (the host-only
  // DELETE policy is the wall; a plain anon delete is an RLS no-op PostgREST
  // reports as 2xx — the logged lesson). A failure is logged, not fatal: the
  // e2e-<epoch> prefix marks the rows for the orchestrator's sweep. Deleting
  // through the DB is also what makes this spec cascade-safe: the children
  // (going_pings, comments, playdate_kids, ping_kids) go with the row.
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
    const deleted = del.ok ? ((await del.json()) as Array<Record<string, unknown>>) : []
    const check = await fetch(query, { headers })
    const remaining = check.ok ? ((await check.json()) as Array<Record<string, unknown>>) : null
    if (!del.ok || (remaining !== null && remaining.length > 0)) {
      console.log(
        `[e2e cleanup] FAILED — delete HTTP ${del.status}, ${deleted.length} row(s) returned, ` +
          `${remaining?.length ?? '?'} remain (marker ${userId}) — orchestrator sweep (e2e- prefix) will pick them up`,
      )
    } else {
      console.log(`[e2e cleanup] ok — deleted ${deleted.length} marker playdate row(s)`)
    }
  } catch (err) {
    console.log(
      `[e2e cleanup] FAILED (logged, best-effort): ${err instanceof Error ? err.message : err}`,
    )
  }
})

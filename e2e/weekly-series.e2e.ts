/**
 * V8 ticket 06 — standing playdates: the weekly series end to end
 * (migration 0028).
 *
 * What this proves, in one run:
 *  1. /new grows a "Repeat weekly" control, OFF by default, which says the
 *     weekday back in words (derived from the chosen start date — never
 *     typed) and creates a SERIES plus this post as its first occurrence.
 *  2. The generator materializes the weeks ahead as REAL playdates rows: the
 *     same weekday, the same wall clock, the same count — checked against the
 *     pure seam (`nextOccurrenceDates`) evaluated from the SERIES' OWN stored
 *     weekday/start_minutes/timezone, so the DB and the client rule are
 *     compared to each other rather than to a hand-written list.
 *  3. In the feed those occurrences are ordinary cards carrying ` · weekly`
 *     as TEXT on the meta line (no new badge), each in its own day section.
 *  4. A VIEWER pings ONE occurrence: that week's going line moves to 1 and
 *     the SIBLING week is untouched — the v1 rule is per occurrence, not a
 *     standing RSVP (the pinned decision).
 *  5. The HOST sees the rule behind the post ("Weekly · every Saturday
 *     10 AM"), the guest list names for that occurrence (the 0025 RPC, which
 *     knows nothing about series), and "Stop repeating" — which flips
 *     `active = false` and deletes NOTHING: every week already posted stands.
 *
 * PRE-APPLY THIS SPEC IS RED BY DESIGN (the documented red point), and it
 * fails at the /new submit: with 0028 unapplied there is no
 * `public.playdate_series` table, so the series create answers PGRST205
 * ("Could not find the table 'public.playdate_series' in the schema cache")
 * and the /new form renders that in its designed error line (data-testid
 * `submit-error`). The spec reports the failure with that line quoted and the
 * page is asserted to still be standing first — a crash would read as a
 * crash, not as an apply gap. Nothing else in the app changes pre-apply:
 * standalone posts never carry the `series_id` key (the pure `seriesIdField`
 * seam), which is why the other 31 e2e specs stay green.
 *
 * Cleanup (best-effort per house, the quick-post/comment-replies pattern):
 * the marker's playdate rows are deleted via REST with the marker's own JWT
 * (the host-only DELETE policy), then the marker's playdate_series rows. The
 * occurrences carry no children except the viewer's one ping, which cascades
 * with the post (0007's ON DELETE CASCADE). The e2e-<epoch> prefix marks any
 * straggler for the orchestrator's sweep.
 */
import { expect, test } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import { formatDayLabel } from '../src/lib/feed'
import {
  SERIES_HORIZON_DAYS,
  everyWeekdayLabel,
  nextOccurrenceDates,
  seriesLineLabel,
  weekdayFromDateIso,
} from '../src/lib/series'
import {
  editTitle,
  localDatePlusDays,
  parseTimeLabel,
  readMarkerMeta,
  readMarkerSession,
  readSupabaseEnv,
  settleOnRoute,
} from './fixtures'

const TITLE_PLACEHOLDER = 'e.g. Playground time at Green Lake'
const PLACE_PLACEHOLDER = 'e.g. Green Lake playground, near the boathouse'
const PLACE = 'E2E weekly lot'

/** A playdates occurrence row as PostgREST returns it. */
interface MarkerPostRow {
  id: string
  starts_at: string
  series_id: string | null
}

/** The series row as PostgREST returns it (the rule, not an event). */
interface MarkerSeriesRow {
  id: string
  weekday: number
  start_minutes: number
  duration_minutes: number
  timezone: string
  active: boolean
}

/** The marker's JWT headers (the REST cleanup/verification pattern). */
function markerHeaders(): Record<string, string> {
  const { anonKey } = readSupabaseEnv()
  const { accessToken } = readMarkerSession()
  return { apikey: anonKey, Authorization: `Bearer ${accessToken}` }
}

/** A PostgREST GET with the marker's own JWT — throws on a non-2xx. */
async function markerSelect<T>(query: string): Promise<T[]> {
  const { url } = readSupabaseEnv()
  const response = await fetch(`${url}/rest/v1/${query}`, { headers: markerHeaders() })
  if (!response.ok) {
    throw new Error(`REST ${query} → HTTP ${response.status} ${await response.text()}`)
  }
  return (await response.json()) as T[]
}

/**
 * A fresh viewer marker: sign up + onboard (zip + radius) in a CLEAN context
 * (the comments/comment-replies viewer pattern — the default context carries
 * the host marker's session). The zip is the MARKER's own, so the post is
 * in-radius; the detail page is reached by direct URL anyway.
 */
async function createOnboardedViewer(
  browser: Browser,
  name: string,
  email: string,
  password: string,
  zip: string,
): Promise<Page> {
  const context = await browser.newContext({
    baseURL: 'http://localhost:4173',
    storageState: { cookies: [], origins: [] },
  })
  const page = await context.newPage()
  await page.goto('/login')
  await page.getByRole('button', { name: 'New here? Create an account' }).click()
  await page.locator('input[autocomplete="nickname"]').fill(name)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByRole('heading', { name: 'Set your location' }).waitFor()
  await page.getByPlaceholder('e.g. 98107').fill(zip)
  await page.locator('select').first().selectOption({ label: '5 miles' })
  await page.getByRole('button', { name: /^Continue/ }).click()
  await page.getByRole('heading', { name: 'Near you' }).waitFor()
  return page
}

/**
 * Submit /new and classify what happened WITHOUT guessing: either the post
 * landed (the feed URL) or the form's designed error line appeared. Both are
 * legitimate outcomes — pre-0028-apply only the second one happens, and it is
 * the documented red point rather than a mystery timeout.
 */
async function submitAndClassify(page: Page): Promise<'posted' | 'error' | 'timeout'> {
  const posted = page
    .waitForURL('/', { timeout: 20_000 })
    .then(() => 'posted' as const)
    .catch(() => 'timeout' as const)
  const errored = page
    .getByTestId('submit-error')
    .waitFor({ state: 'visible', timeout: 20_000 })
    .then(() => 'error' as const)
    .catch(() => 'timeout' as const)
  return Promise.race([posted, errored])
}

test('a weekly series posts its weeks, and each week’s roster is its own', async ({
  page,
  browser,
}) => {
  const marker = readMarkerMeta()
  const { userId } = readMarkerSession()
  const epoch = Math.floor(Date.now() / 1000)
  const title = `e2e weekly ${epoch}`
  // Two days out: comfortably inside the 21-day horizon, and NOT today (the
  // feed's Today section carries the extra badges/rain labels).
  const startDate = localDatePlusDays(2)
  const weekday = weekdayFromDateIso(startDate)
  if (weekday === null) throw new Error(`Not a calendar date: "${startDate}"`)
  const weekdayLabel = everyWeekdayLabel(weekday)
  const viewer = {
    name: `e2e-w-${epoch}`,
    email: `e2e-w-${epoch}@gmail.com`, // gmail.com: the project rejects example.com
    password: `e2e-w-pw-${epoch}`, // in-memory only — never written
  }
  console.log(
    `[e2e weekly-series] markers this run: host ${marker.email} (setup) + ${viewer.email} ` +
      `(viewer — persists by design, orchestrator sweep)`,
  )

  // (1) /new: the control is OFF by default, and turning it on speaks the
  //     weekday derived from the chosen start date.
  await page.goto('/new')
  await settleOnRoute(page, '/new')
  // V9 ticket 03 (review cycle 1, F2): the summary's title is a read-back —
  // tap it to edit (the input is what the specs drive).
  await editTitle(page)
  await page.getByPlaceholder(TITLE_PLACEHOLDER).fill(title)
  await page.getByPlaceholder(PLACE_PLACEHOLDER).fill(PLACE)
  // V9 ticket 01: /new no longer asks for a neighbourhood — nothing to pick.
  // V13 ticket 02: the date + the 30-minute stepper live in the visible "When" section (the disclosure is gone).
  await page.locator('input[type="date"]').fill(startDate)
  // The start time is whatever the form opened with (V8 ticket 01's next
  // 30-minute slot) — read, never assumed; the series stores THIS wall clock.
  const startMinutes = parseTimeLabel(await page.getByTestId('start-time-label').innerText())
  await page.getByRole('button', { name: '1h', exact: true }).click()

  const repeat = page.getByTestId('repeat-weekly')
  await expect(repeat).toHaveAttribute('aria-pressed', 'false')
  await repeat.click()
  await expect(repeat).toHaveAttribute('aria-pressed', 'true')
  // The words come from the pure seam evaluated on the chosen date — the spec
  // asserts the relationship, not a copy of the rule.
  await expect(page.getByTestId('repeat-weekly-label')).toContainText(weekdayLabel)

  // (2) Submit. Pre-0028-apply this lands on the documented RED below: the
  //     series POST is watched so the failure can be reported with the REAL
  //     API class (PGRST205 / 42703) instead of only the form's user-facing
  //     sentence, which is deliberately generic copy ('Try again.').
  const seriesCreateResponse = page
    .waitForResponse(
      (response) =>
        response.url().includes('/rest/v1/playdate_series') &&
        response.request().method() === 'POST',
      { timeout: 20_000 },
    )
    .catch(() => null)
  const beforeSubmit = new Date().toISOString()
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  const outcome = await submitAndClassify(page)
  const afterSubmit = new Date().toISOString()
  const seriesResponse = await seriesCreateResponse
  if (outcome !== 'posted') {
    // The ticket's "never a crash" pin is asserted BEFORE the failure is
    // reported: if the page is broken, this is what fails (and reads like a
    // crash); if the page is fine and only the apply is missing, the report
    // below quotes the real error.
    await expect(page.getByPlaceholder(TITLE_PLACEHOLDER)).toBeVisible()
    const errorLine =
      outcome === 'error'
        ? (await page.getByTestId('submit-error').innerText()).trim()
        : 'no error line appeared — the submit neither posted nor reported'
    let apiEvidence = 'no POST to /rest/v1/playdate_series was observed'
    if (seriesResponse !== null) {
      const body = (await seriesResponse.json().catch(() => null)) as {
        code?: string
        message?: string
      } | null
      apiEvidence =
        `POST /rest/v1/playdate_series → HTTP ${seriesResponse.status()} ` +
        `${body?.code ?? '(no code)'}: ${body?.message ?? '(no message)'}`
    }
    throw new Error(
      'RED-BY-DESIGN pre-apply (migration 0028 not applied): weekly series creation failed at ' +
        `the /new submit — UI: "${errorLine}" | API: ${apiEvidence}. Expected class: PGRST205 ` +
        '(the playdate_series table is not in the schema cache) or 42703 (playdates.series_id ' +
        'does not exist). GREEN as soon as the coordinator applies ' +
        'supabase/migrations/0028_playdate_series.sql.',
    )
  }
  // Post-apply: the series insert answered with a created row (PostgREST 201).
  expect(seriesResponse?.status()).toBe(201)

  // (3) The series row: the wall-clock rule + the device's IANA zone — and
  //     NEVER a UTC instant (which would drift an hour at DST).
  const seriesRows = await markerSelect<MarkerSeriesRow>(
    `playdate_series?host_profile_id=eq.${userId}&title=eq.${encodeURIComponent(title)}` +
      '&select=id,weekday,start_minutes,duration_minutes,timezone,active',
  )
  expect(seriesRows).toHaveLength(1)
  const series = seriesRows[0] as MarkerSeriesRow
  expect(series.weekday).toBe(weekday)
  expect(series.start_minutes).toBe(startMinutes)
  expect(series.duration_minutes).toBe(60)
  expect(series.timezone.length).toBeGreaterThan(0)
  expect(series.active).toBe(true)

  // (4) The occurrences: real playdates rows, every one linked to the series,
  //     and EXACTLY the set the pure seam predicts for the stored rule.
  const postQuery =
    `playdates?host_profile_id=eq.${userId}&title=eq.${encodeURIComponent(title)}` +
    '&select=id,starts_at,series_id&order=starts_at.asc'
  const rows = await markerSelect<MarkerPostRow>(postQuery)
  const occurrences = rows.map((row) => new Date(row.starts_at).toISOString())
  // Either window (the run may cross local midnight between the submit and the
  // server's `now()`): both are the same rule, one day apart at most.
  const predicted = [
    nextOccurrenceDates(weekday, series.start_minutes, series.timezone, beforeSubmit, SERIES_HORIZON_DAYS),
    nextOccurrenceDates(weekday, series.start_minutes, series.timezone, afterSubmit, SERIES_HORIZON_DAYS),
  ]
  expect(predicted).toContainEqual(occurrences)
  expect(rows.length).toBeGreaterThanOrEqual(2)
  for (const row of rows) expect(row.series_id).toBe(series.id)

  // (5) The feed: one card per occurrence, each marked ` · weekly` as TEXT on
  //     the meta line (not a badge), each in its own day section whose header
  //     is that occurrence's local day (the same pure grouping rule).
  await expect(page.getByRole('heading', { name: 'Near you' })).toBeVisible()
  const cards = page.locator('a').filter({ hasText: title })
  await expect(cards).toHaveCount(rows.length)
  for (let i = 0; i < rows.length; i++) {
    await expect(cards.nth(i)).toContainText('· weekly')
  }
  const firstSection = page.locator('section', { hasText: title }).first()
  // textContent, NOT innerText: the section header is styled
  // `uppercase` (a CSS transform), and Playwright's innerText returns the
  // TRANSFORMED text ("SUN, SEP 13") — which would compare against the pure
  // label's own casing ("Sun, Sep 13") and fail on styling, not on the rule
  // being asserted. (Caught by the post-apply live check: this spec was
  // red-by-design before 0028 was applied, so it had never run green.)
  const headerText = ((await firstSection.locator('p').first().textContent()) ?? '').trim()
  const labelNow = new Date().toISOString()
  expect([
    formatDayLabel(rows[0]?.starts_at ?? '', afterSubmit),
    formatDayLabel(rows[0]?.starts_at ?? '', labelNow),
  ]).toContain(headerText)

  // (6) A VIEWER pings ONE week. The ping is per occurrence: that week moves
  //     to 1 going, its sibling week is untouched (no standing RSVP).
  const firstOccurrenceId = rows[0]?.id ?? ''
  const secondOccurrenceId = rows[1]?.id ?? ''
  const viewerPage = await createOnboardedViewer(
    browser,
    viewer.name,
    viewer.email,
    viewer.password,
    marker.homeZip,
  )
  await viewerPage.goto(`/playdate/${firstOccurrenceId}`)
  await viewerPage.getByRole('heading', { name: title, exact: true }).waitFor()
  // The occurrence announces that it repeats — read by every viewer.
  await expect(viewerPage.getByText('· weekly')).toBeVisible()
  await viewerPage.getByRole('button', { name: 'I’m going', exact: true }).click()
  await expect(viewerPage.getByText('1 family going — come say hi')).toBeVisible()

  await viewerPage.goto(`/playdate/${secondOccurrenceId}`)
  await viewerPage.getByRole('heading', { name: title, exact: true }).waitFor()
  await expect(viewerPage.getByText('Be the first — we’d love to see you')).toBeVisible()
  await expect(viewerPage.getByRole('button', { name: 'I’m going', exact: true })).toBeVisible()
  await expect(viewerPage.getByText('1 family going — come say hi')).toHaveCount(0)

  // (7) The HOST: the rule behind the post, that week's roster (the guest
  //     list — untouched by the series work), then "Stop repeating".
  await page.goto(`/playdate/${firstOccurrenceId}`)
  await page.getByRole('heading', { name: title, exact: true }).waitFor()
  await expect(page.getByTestId('series-line')).toHaveText(
    seriesLineLabel(series.weekday, series.start_minutes),
  )
  await expect(page.getByText('1 family going')).toBeVisible()
  await expect(page.getByText(`Going: ${viewer.name}`)).toBeVisible()

  await page.getByTestId('stop-repeating').click()
  await expect(page.getByTestId('series-stopped')).toBeVisible()
  // The DB agrees, and NOTHING was deleted: every week already posted stands
  // (other families have plans on them).
  const seriesAfterStop = await markerSelect<MarkerSeriesRow>(
    `playdate_series?id=eq.${series.id}&select=id,weekday,start_minutes,duration_minutes,timezone,active`,
  )
  expect(seriesAfterStop[0]?.active).toBe(false)
  await expect(page.getByTestId('stop-repeating')).toHaveCount(0)
  const stillPosted = await markerSelect<MarkerPostRow>(postQuery)
  expect(stillPosted).toHaveLength(rows.length)
  await page.goto('/')
  await expect(page.locator('a').filter({ hasText: title })).toHaveCount(rows.length)

  await viewerPage.context().close()
})

test.afterEach(async () => {
  // Best-effort cleanup (per house): the marker's playdates rows first (with
  // the marker's own JWT — the host-only DELETE policy is the wall), then the
  // marker's series rows. Order matters: deleting the series first would only
  // null the posts' series_id (the FK is ON DELETE SET NULL), leaving the
  // posts behind. Pre-apply the series delete 404s (no such table) — logged,
  // not fatal. A failure is logged, not fatal; the e2e- prefix marks rows for
  // the orchestrator's sweep.
  try {
    const { url, anonKey } = readSupabaseEnv()
    const { accessToken, userId } = readMarkerSession()
    const headers: Record<string, string> = {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'return=representation',
    }
    const postQuery = `${url}/rest/v1/playdates?host_profile_id=eq.${userId}&select=id`
    const delPosts = await fetch(postQuery, { method: 'DELETE', headers })
    const posts = delPosts.ok ? ((await delPosts.json()) as unknown[]) : []
    const seriesQuery = `${url}/rest/v1/playdate_series?host_profile_id=eq.${userId}&select=id`
    const delSeries = await fetch(seriesQuery, { method: 'DELETE', headers })
    const series = delSeries.ok ? ((await delSeries.json()) as unknown[]) : []
    const check = await fetch(postQuery, { headers })
    const remaining = check.ok ? ((await check.json()) as unknown[]) : null
    if (!delPosts.ok || (remaining !== null && remaining.length > 0)) {
      console.log(
        `[e2e cleanup] FAILED — playdate delete HTTP ${delPosts.status}, ` +
          `${remaining?.length ?? '?'} remain (host ${userId}) — orchestrator sweep (e2e- prefix) will pick them up`,
      )
    } else {
      console.log(
        `[e2e cleanup] ok — deleted ${posts.length} marker playdate row(s) and ` +
          `${delSeries.ok ? series.length : `FAILED (HTTP ${delSeries.status})`} series row(s) ` +
          `(host ${userId})`,
      )
    }
  } catch (err) {
    console.log(
      `[e2e cleanup] FAILED (logged, best-effort): ${err instanceof Error ? err.message : err}`,
    )
  }
})

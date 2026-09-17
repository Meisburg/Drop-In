/**
 * V8 ticket 02 — the first visit that isn't a dead end (the empty radius).
 *
 * A brand-new parent on the 5-mile default used to land on "Nothing happening
 * near you today — post the first one.", which is wrong twice: the list is
 * today-AND-LATER, and the screen offers no way out of an empty radius. This
 * spec drives the real app on the live project with a marker whose location
 * makes the feed empty BY CONSTRUCTION — zip 98901 (Yakima, in the 0012
 * gazetteer) is ~118 mi from the marker's own posts and from every zip any
 * other spec uses (98107 / 98007), so a 2-mile radius is empty no matter what
 * the live data does.
 *
 * What it asserts is the CONTROLS AND THE COPY, never that posts appear: the
 * live project may legitimately have nothing to show in Seattle, and a spec
 * that demanded content would be testing the seed data, not the empty state.
 * The widening below is asserted through the radius it lands (the copy names
 * the new N; the profiles row really carries it), never through the list
 * growing.
 *
 * CASCADE SAFETY (the pinned requirement): specs run serially against ONE
 * shared marker account, and zip-radius.e2e.ts pins that marker at
 * 98107 / 5 mi. This spec therefore restores `home_zip` + `radius_miles` from
 * e2e/.auth/marker.json afterwards — with its own JWT over REST, the same
 * write path the app uses (the profiles_update_own / 0012 owner policy is the
 * wall) — and FAILS the run if that restore does not land, because a marker
 * left at 98901 would silently break the next spec rather than this one.
 * It creates no rows and no accounts, so there is nothing else to sweep.
 */
import { expect, test } from '@playwright/test'
import { WIDEN_RADIUS_MILES, emptyRadiusCopy } from '../src/lib/feed'
import {
  editTitle,
  localDatePlusDays,
  openMoreOptions,
  readMarkerMeta,
  readMarkerSession,
  readSupabaseEnv,
  settleOnRoute,
} from './fixtures'

/**
 * The location that makes the feed empty: Yakima, ~118 mi from 98107 and
 * ~107 mi from 98007 (the only zips other specs post from) — far outside even
 * the 35-mile maximum, so no live post can reach this viewer.
 */
const FAR_ZIP = '98901'
const FAR_RADIUS = 2

/** The marker's profiles row, as REST returns it (the write's verification). */
interface MarkerLocation {
  home_zip: string | null
  radius_miles: number | null
}

/**
 * Write the marker's location over PostgREST with the marker's own JWT — the
 * app's own write path (profiles.update + the owner RLS policy), just without
 * driving the /settings form. `Prefer: return=minimal` deliberately asks for NO
 * row back: a write whose SELECT policy excludes the actor must never be sent
 * through RETURNING (the 42501 lesson).
 */
async function patchMarkerLocation(zip: string, radiusMiles: number): Promise<boolean> {
  const { url, anonKey } = readSupabaseEnv()
  const { accessToken, userId } = readMarkerSession()
  const res = await fetch(`${url}/rest/v1/profiles?id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ home_zip: zip, radius_miles: radiusMiles }),
  })
  return res.ok
}

/** Read the marker's location back (a plain PostgREST SELECT — not SQL). */
async function readMarkerLocation(): Promise<MarkerLocation | null> {
  const { url, anonKey } = readSupabaseEnv()
  const { accessToken, userId } = readMarkerSession()
  const res = await fetch(
    `${url}/rest/v1/profiles?id=eq.${userId}&select=home_zip,radius_miles`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` } },
  )
  if (!res.ok) return null
  const rows = (await res.json()) as MarkerLocation[]
  return rows[0] ?? null
}

/** The id of the marker's newest post with this title (null before it lands). */
async function readNewestMarkerPostId(title: string): Promise<string | null> {
  const { url, anonKey } = readSupabaseEnv()
  const { accessToken, userId } = readMarkerSession()
  const res = await fetch(
    `${url}/rest/v1/playdates?host_profile_id=eq.${userId}` +
      `&title=eq.${encodeURIComponent(title)}&order=created_at.desc&limit=1&select=id`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` } },
  )
  if (!res.ok) return null
  const rows = (await res.json()) as Array<{ id: string }>
  return rows[0]?.id ?? null
}

// Every test starts from the pinned far location, so a retry (or a re-run of
// one test) is deterministic even though the widen test writes a new radius.
test.beforeEach(async () => {
  const ok = await patchMarkerLocation(FAR_ZIP, FAR_RADIUS)
  const now = ok ? await readMarkerLocation() : null
  // Settle the location BEFORE the app loads: a stale profile would make the
  // assertions below describe a race instead of the empty state.
  expect(now?.home_zip, 'the far-zip setup write must land before the page loads').toBe(FAR_ZIP)
  expect(now?.radius_miles).toBe(FAR_RADIUS)
})

test.afterAll(async () => {
  // Restore the marker to the values e2e/.auth/marker.json pins (98107 / 5 mi)
  // — zip-radius.e2e.ts asserts them, and every other spec's viewer copies the
  // marker's own location. Best-effort by attempt, never by silence: leaving
  // the marker at 98901 breaks the suite in a way that looks like someone
  // else's bug, so a failed restore fails THIS run, loudly.
  const marker = readMarkerMeta()
  let last: MarkerLocation | null = null
  let lastOk = false
  for (let attempt = 1; attempt <= 3; attempt++) {
    lastOk = await patchMarkerLocation(marker.homeZip, marker.radiusMiles)
    last = lastOk ? await readMarkerLocation() : null
    if (last?.home_zip === marker.homeZip && last?.radius_miles === marker.radiusMiles) {
      console.log(
        `[e2e cleanup] ok — marker location restored to ${marker.homeZip} / ${marker.radiusMiles} mi`,
      )
      return
    }
  }
  throw new Error(
    `[e2e cleanup] FAILED — could not restore the marker's location to ${marker.homeZip} / ` +
      `${marker.radiusMiles} mi (write ok: ${lastOk}, row now: ${JSON.stringify(last)}). ` +
      `zip-radius.e2e.ts pins those values: restore the marker's home_zip + radius_miles by hand.`,
  )
})

test('the feed\'s empty state names the real radius, never claims "today", and offers a way out', async ({
  page,
}) => {
  await page.goto('/')
  await settleOnRoute(page, '/')

  const empty = page.getByTestId('empty-radius-state')
  await expect(empty).toBeVisible()

  // The copy quotes the radius the filter actually used (2 mi), so the parent
  // can tell that a bigger radius exists as a concept at all.
  await expect(empty).toContainText(emptyRadiusCopy(FAR_RADIUS))
  // …and it never claims "today": the feed is today AND LATER.
  await expect(empty).not.toContainText(/today/i)

  // The existing CTA stays (the escape hatch is additive, not a replacement).
  await expect(empty.getByRole('link', { name: 'Post a drop-in' })).toBeVisible()

  // The visibility-refresh gate's NEGATIVE half, checked on the wire: a
  // focus/visibility bounce a second after the load must issue NO new feed
  // query (the "no refetch storm on quick app switches" AC). The positive half
  // — a load older than 60 s IS due — is the pure shouldRefreshFeed, unit-
  // tested with that exact boundary; this proves the listener is wired to it.
  let feedQueries = 0
  page.on('request', (request) => {
    if (/\/rest\/v1\/playdates\?/.test(request.url())) feedQueries += 1
  })
  const beforeBounce = feedQueries
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(700)
  expect(feedQueries, 'a fresh load must not be re-fetched by a focus bounce').toBe(beforeBounce)

  // Both escapes are real, tappable controls — not decoration.
  const widen = empty.getByRole('button', { name: 'Widen to 20 miles' })
  const seeAll = empty.getByRole('button', { name: 'See everything in Seattle' })
  await expect(widen).toBeEnabled()
  await expect(seeAll).toBeEnabled()

  // Tapping widen writes through the EXISTING updateHomeZipRadius and re-runs
  // the feed query. Still nothing at 20 mi (118 mi away) — and the state must
  // stay a state, not a second dead end: the copy re-names itself with the new
  // radius, and an escape is still offered.
  await widen.click()
  await expect(empty).toContainText(emptyRadiusCopy(WIDEN_RADIUS_MILES))
  // …and the widen really did re-issue the feed query (which also proves the
  // request counter above observes the app's feed queries — a control for the
  // "no refetch on a bounce" assertion).
  await expect.poll(() => feedQueries).toBeGreaterThan(beforeBounce)
  await expect(empty.getByRole('button', { name: 'See everything in Seattle' })).toBeEnabled()
  // The "Widen to 20 miles" button is gone rather than being a no-op re-write
  // of the radius the viewer is already on.
  await expect(empty.getByRole('button', { name: 'Widen to 20 miles' })).toHaveCount(0)

  // The write really landed on the marker's row (the UI could re-render from
  // its own optimistic state; the profiles row cannot).
  const stored = await readMarkerLocation()
  expect(stored?.radius_miles).toBe(WIDEN_RADIUS_MILES)
  expect(stored?.home_zip).toBe(FAR_ZIP)
})

test('browse shows the same honest empty state (one component, both screens)', async ({ page }) => {
  await page.goto('/browse')
  await settleOnRoute(page, '/browse')

  const empty = page.getByTestId('empty-radius-state')
  await expect(empty).toBeVisible()
  await expect(empty).toContainText(emptyRadiusCopy(FAR_RADIUS))
  await expect(empty).not.toContainText(/today/i)
  await expect(empty.getByRole('button', { name: 'Widen to 20 miles' })).toBeEnabled()
  await expect(empty.getByRole('button', { name: 'See everything in Seattle' })).toBeEnabled()
  await expect(empty.getByRole('link', { name: 'Post a drop-in' })).toBeVisible()
})

/**
 * The ticket's other two ACs are DEGRADED states — unreachable against a
 * healthy live project, which is exactly why they went unnoticed. So the two
 * reads are forced to fail at the network layer (route.abort — a transport
 * failure, the same thing the page's `.catch` handles when a table or a
 * column is missing): a failed going-count read must leave the ping button
 * ENABLED with a retry line, and a failed comment read must be its own
 * "Couldn't load comments." state rather than an absent section. Then the
 * interception is lifted and Retry is tapped, so the recovery path is covered
 * too (a Retry that never recovers is just a nicer dead end).
 *
 * The post is the marker's own (the golden-path UI flow), but the viewer has
 * to be someone else: the ping button is the NON-host surface. The viewer is
 * a fresh `e2e-v-<epoch>` account in its own context — the documented
 * pattern (viewers persist by design and are swept by the orchestrator); the
 * post is deleted below.
 */
test('the detail page\'s failed reads are honest states, and Retry recovers', async ({
  page,
  browser,
}) => {
  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const viewerName = `e2e-v-${epoch}`
  const viewerEmail = `e2e-v-${epoch}@gmail.com` // gmail.com: the project rejects example.com
  const viewerPassword = `e2e-v-pw-${epoch}` // in-memory only — never written, never committed
  const title = `e2e ${marker.displayName} honest states`

  // --- The marker posts through the UI (the golden-path pattern). ---
  await page.goto('/new')
  await settleOnRoute(page, '/new')
  // V9 ticket 03 (review cycle 1, F2): the summary's title is a read-back —
  // tap it to edit (the input is what the specs drive).
  await editTitle(page)
  await page.getByPlaceholder('e.g. Playground time at Green Lake').fill(title)
  await page
    .getByPlaceholder('e.g. Green Lake playground, near the boathouse')
    .fill('E2E honest states lot')
  // V9 ticket 01: /new no longer asks for a neighbourhood — nothing to pick.
  // V9 ticket 03: the date + the 30-minute stepper live behind "More options".
  await openMoreOptions(page)
  await page.locator('input[type="date"]').fill(localDatePlusDays(1))
  await page.getByRole('button', { name: '1h', exact: true }).click()
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')

  // Its id, over REST (the post is far outside the viewer's radius feed, so
  // the detail URL is how the viewer reaches it — the page's own lookup, not
  // the feed's).
  const postId = await readNewestMarkerPostId(title)
  expect(postId, 'the marker\'s post must exist before the viewer opens it').not.toBeNull()

  // --- The viewer: a fresh signed-out context, signed up + onboarded. ---
  const viewerContext = await browser.newContext({
    baseURL: 'http://localhost:4173',
    storageState: { cookies: [], origins: [] },
  })
  const viewerPage = await viewerContext.newPage()
  await viewerPage.goto('/login')
  await viewerPage.getByRole('button', { name: 'New here? Create an account' }).click()
  await viewerPage.locator('input[autocomplete="nickname"]').fill(viewerName)
  await viewerPage.locator('input[type="email"]').fill(viewerEmail)
  await viewerPage.locator('input[type="password"]').fill(viewerPassword)
  await viewerPage.getByRole('button', { name: 'Create account' }).click()
  await viewerPage.getByRole('heading', { name: 'Set your location' }).waitFor()
  await viewerPage.getByPlaceholder('e.g. 98107').fill(marker.homeZip)
  await viewerPage.getByRole('button', { name: /^Continue/ }).click()
  await viewerPage.getByRole('heading', { name: 'Near you' }).waitFor()

  // --- Force both reads to fail, then open the post. ---
  // Every going_pings request this viewer issues is aborted — read and write
  // alike — which is what forces both honest states below.
  await viewerPage.route(/\/rest\/v1\/going_pings/, (route) => route.abort('failed'))
  await viewerPage.route(/\/rest\/v1\/comments/, (route) => route.abort('failed'))
  await viewerPage.goto(`/playdate/${postId}`)

  // The AC: a failed count read does NOT disable the button (the write path
  // never needed the count) …
  await expect(viewerPage.getByRole('button', { name: 'I’m going' })).toBeEnabled()
  // … and the unknown count is reported, with a Retry, where the count line
  // would have been (the old failure was a dead button and silence).
  const countUnknown = viewerPage.getByTestId('going-count-unavailable')
  await expect(countUnknown).toBeVisible()
  // The thread failure is its own state, never "no comments".
  const commentsError = viewerPage.getByTestId('comments-load-error')
  await expect(commentsError).toBeVisible()
  await expect(commentsError).toContainText('Couldn’t load comments.')

  // The write path is genuinely WIRED, not merely undimmed: the tap runs the
  // ping handler and surfaces the handler's own failure — an enabled-but-no-op
  // button would say nothing at all. (The handler's first step is a
  // going_pings read, which this spec has aborted; the failure it reports here
  // IS the proof it ran.)
  await viewerPage.getByRole('button', { name: 'I’m going' }).click()
  await expect(viewerPage.getByText('Could not update your ping. Try again.')).toBeVisible()

  // --- Recovery: lift the failures, tap both Retries. ---
  await viewerPage.unroute(/\/rest\/v1\/going_pings/)
  await viewerPage.unroute(/\/rest\/v1\/comments/)
  await countUnknown.getByRole('button', { name: 'Retry' }).click()
  await expect(countUnknown).toHaveCount(0)
  await expect(viewerPage.getByText('Be the first — we’d love to see you')).toBeVisible()
  await commentsError.getByRole('button', { name: 'Retry' }).click()
  await expect(commentsError).toHaveCount(0)
  await expect(viewerPage.getByRole('heading', { name: 'Comments', exact: true })).toBeVisible()

  // --- REVIEW-ROUND fix, asserted here too: the HOST's line told the same
  // lie ("No pings yet") when the count read failed — a fact the page did not
  // have, on the host's only retention signal. ---
  await page.route(/\/rest\/v1\/going_pings/, (route) => route.abort('failed'))
  await page.goto(`/playdate/${postId}`)
  const hostCountUnknown = page.getByTestId('host-going-count-unavailable')
  await expect(hostCountUnknown).toBeVisible()
  // The lie it replaced — the host's zero-count copy — must NOT be on screen
  // while the count is unknown (this is the assertion that fails on the old
  // code, where a failed read rendered exactly this line).
  await expect(page.getByText('No one has pinged yet')).toHaveCount(0)
  await page.unroute(/\/rest\/v1\/going_pings/)
  await hostCountUnknown.getByRole('button', { name: 'Retry' }).click()
  await expect(hostCountUnknown).toHaveCount(0)
  // A REAL count line is back — the exact number depends on whether the
  // viewer's aborted ping landed, which is not this spec's subject.
  await expect(page.getByText(/^(No one has pinged yet|\d+ famil(y|ies) going)$/)).toBeVisible()

  await viewerContext.close()
  console.log(
    `[e2e markers] viewer ${viewerEmail} persists by design (e2e-v- prefix) — orchestrator sweep`,
  )
})

test.afterEach(async () => {
  // Best-effort cleanup (the golden-path pattern): delete the marker's
  // playdate rows over REST with the marker's own JWT (the host-only DELETE
  // policy is the wall). Cascades take the pings / comments with the post. A
  // failure is logged, not fatal — the e2e-<epoch> prefix marks the stragglers
  // for the sweep.
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
        `[e2e cleanup] FAILED — playdate delete HTTP ${del.status}, ` +
          `${remaining?.length ?? '?'} remain (marker ${userId}) — orchestrator sweep will pick them up`,
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

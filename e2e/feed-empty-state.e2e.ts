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
import { WIDEN_RADIUS_MILES, emptyRadiusCopy, EMPTY_RADIUS_BROWSE_HEADLINE, EMPTY_RADIUS_BROWSE_LABEL } from '../src/lib/feed'
import {
  E2E_BASE_URL,
  editTitle, localDatePlusDays, readMarkerMeta, readMarkerSession,
  readSessionFromBrowserPage, readSupabaseEnv, settleOnRoute, finishSignup,
  signUpViewer,
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

  // V27 slice 1: the feed's empty state now renders the escape buttons again.
  // V16 suppressed them behind a persistent radius picker that V23 removed, so
  // the state had NO widen path of its own — the dead end the bug report names.
  // Mirror the /browse assertions; the feed keeps its post CTA suppressed (the
  // raised nav "+" is the persistent post action), so no "Post a drop-in" link
  // may appear inside this empty state.
  await expect(empty.getByRole('button', { name: 'Widen to 20 miles' })).toBeEnabled()
  await expect(empty.getByRole('button', { name: 'See everything in Seattle' })).toBeEnabled()
  await expect(empty.getByRole('link', { name: 'Post a drop-in' })).toHaveCount(0)

  /* V31 v31-1: THE DOOR, AND WHERE IT SITS. A simulated panel (NOT the
     pre-registered test — see research/first-open-validation/2026-10-05-
     simulated-panel.md) had two of five modelled parents reach for the places
     directory while this state offered them three ways to widen a radius. So
     the directory is now the state's ONE filled control, and it sits above the
     escapes rather than beside them. */
  const headline = empty.getByText(EMPTY_RADIUS_BROWSE_HEADLINE)
  await expect(headline).toBeVisible()
  const door = empty.getByTestId('empty-radius-browse')
  await expect(door).toBeVisible()
  await expect(door).toHaveAttribute('href', '/browse')
  await expect(door).toHaveAccessibleName(EMPTY_RADIUS_BROWSE_LABEL)

  // ORDER, measured rather than eyeballed: headline above the honest count,
  // count above the door, door above the escapes.
  const headlineBox = await headline.boundingBox()
  const countBox = await empty.getByText(emptyRadiusCopy(FAR_RADIUS)).boundingBox()
  const doorBox = await door.boundingBox()
  const escapeBox = await empty
    .getByRole('button', { name: 'Widen to 20 miles' })
    .boundingBox()
  expect(headlineBox!.y).toBeLessThan(countBox!.y)
  expect(countBox!.y).toBeLessThan(doorBox!.y)
  expect(doorBox!.y).toBeLessThan(escapeBox!.y)

  // The 44px tap floor (the mobile audit's rule), and "filled" as a
  // difference rather than a hex: the door's background is neither the
  // escapes' background nor transparent, so it is the state's only filled
  // control. Pinning the palette value would break on a theme change that is
  // not a defect.
  expect(doorBox!.height).toBeGreaterThanOrEqual(44)
  const doorBg = await door.evaluate((el) => getComputedStyle(el).backgroundColor)
  const escapeBg = await empty
    .getByRole('button', { name: 'Widen to 20 miles' })
    .evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(doorBg).not.toBe(escapeBg)
  expect(doorBg).not.toBe('rgba(0, 0, 0, 0)')

  // V23 slice 1: the feed's empty state no longer renders its own "Post a drop-in"
  // link — the action row at the top of the page owns the ONE primary CTA. The
  // way out of an empty radius is now the secondary location control (the button
  // that opens the shared LocationModal), which lives OUTSIDE the empty state, so
  // this assertion moves from inside `empty` to the page-level control.
  await expect(page.getByTestId('feed-location-control')).toBeVisible()

  /* meetup-empty-state (meetup-a62da3b6fca2): THE LOCATION-SEEDED CREATE. The
     feed's empty state offers "Create one here" — the empty ACTION Meetup's
     EmptyOrError carries. It is NOT the "Post a drop-in" link V23 removed: it
     carries the viewer's OWN location (the home zip) through the PlacePrefill
     router state, so the post starts where the parent already is. It renders
     only when a place can be named; this marker has a home zip (98901 by
     pin), so it is present and enabled here. */
  const createHere = empty.getByTestId('empty-radius-create-here')
  await expect(createHere).toBeVisible()
  await expect(createHere).toBeEnabled()
  await expect(createHere).toHaveAccessibleName('Create one here')
  // The 44px tap floor (the mobile audit's rule).
  const createBox = await createHere.boundingBox()
  expect(createBox!.height).toBeGreaterThanOrEqual(44)

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

  // V23 slice 1: the feed's ONE location control (the secondary button in the action
  // row) opens the shared LocationModal. The widen path is driven through that
  // modal: open it, drag the slider to WIDEN_RADIUS_MILES, tap Apply,
  // and assert the copy re-names itself with the new radius.
  const locationControl = page.getByTestId('feed-location-control')
  await expect(locationControl).toBeVisible()
  await locationControl.click()

  const modal = page.getByTestId('location-modal')
  await expect(modal).toBeVisible()

  // Drag the slider to the wider radius. The slider's range is 1–30 (pinned by
  // places.e2e.ts), so WIDEN_RADIUS_MILES (20) is within range.
  const slider = page.getByTestId('location-radius-slider')
  await slider.fill(String(WIDEN_RADIUS_MILES))

  // Tap Apply — the write goes through updateHomeZipRadius + refresh(), and the
  // dialog closes (V28 r3-4: one control does both).
  await page.getByTestId('location-apply-btn').click()
  await expect(page.getByTestId('location-modal')).toHaveCount(0)

  // The empty state's copy must re-name itself with the new radius.
  await expect(empty).toContainText(emptyRadiusCopy(WIDEN_RADIUS_MILES))
  // …and the widen really did re-issue the feed query (which also proves the
  // request counter above observes the app's feed queries — a control for the
  // "no refetch on a bounce" assertion).
  await expect.poll(() => feedQueries).toBeGreaterThan(beforeBounce)

  // The write really landed on the marker's row (the UI could re-render from
  // its own optimistic state; the profiles row cannot).
  const stored = await readMarkerLocation()
  expect(stored?.radius_miles).toBe(WIDEN_RADIUS_MILES)
  expect(stored?.home_zip).toBe(FAR_ZIP)
})

/**
 * V31 v31-1: THE DOOR ACTUALLY GOES SOMEWHERE. The assertion above proves the
 * link exists on the right screen with the right name and position; this one
 * proves the panel's behaviour — the parent who reaches for "what's around"
 * lands on the directory. It is its own test so the state's write path above
 * (which re-renders the same screen) is not entangled with a navigation.
 */
test('the empty feed\'s door opens the places directory', async ({ page }) => {
  await page.goto('/')
  await settleOnRoute(page, '/')

  const door = page.getByTestId('empty-radius-browse')
  await expect(door).toBeVisible()
  await door.click()

  await settleOnRoute(page, '/browse')
  await expect(page).toHaveURL(/\/browse(\?|$)/)
})

/**
 * meetup-empty-state (meetup-a62da3b6fca2): THE LOCATION-SEEDED CREATE ACTUALLY
 * CARRIES THE LOCATION. The assertion above proves the control exists on the
 * right screen; this one proves the behaviour — the parent who taps "Create one
 * here" lands on /new with the viewer's OWN place PREFILLED, so the post starts
 * where they already are. That prefill is the whole difference between this
 * control and the bare "Post a drop-in" link V23 removed, so it is what must be
 * pinned: the place input arrives carrying the home label the seam names, not an
 * empty form. Its own test so the write path above (which re-renders the same
 * screen) is not entangled with a navigation.
 */
test('the empty feed\'s "Create one here" opens the post form seeded with the viewer location', async ({
  page,
}) => {
  await page.goto('/')
  await settleOnRoute(page, '/')

  const createHere = page.getByTestId('empty-radius-create-here')
  await expect(createHere).toBeVisible()
  await createHere.click()

  await settleOnRoute(page, '/new')
  await expect(page).toHaveURL(/\/new(\?|$)/)

  // The prefill landed: the place text field carries the home label the seam
  // wrote (createHerePrefill -> `Home (${homeZip})`), not an empty form. The
  // address input is the same place field the /new form has always used.
  await expect(page.getByPlaceholder('e.g. Green Lake playground, near the boathouse')).toHaveValue(
    `Home (${FAR_ZIP})`,
  )
})

/**
 * V29 v29-6 — THE EMPTY STATE ANSWERS "IS IT WORTH WIDENING?".
 *
 * It used to render an honest line and stop: "Nothing within 5 miles yet." with
 * two escapes and no indication that widening would reveal anything at all. This
 * pins the second line against REAL data on the other side of the radius: a
 * second parent posts from 98007 (Bellevue, ~11.5 mi from the marker's 98107),
 * which is outside 5 miles and inside the 35-mile ceiling the "See everything"
 * escape writes.
 *
 * ⚠️ IT MUST BE A SECOND ACCOUNT, not the marker's own post: V29 v29-7 makes a
 * viewer's OWN active drop-in visible regardless of distance, so a marker-hosted
 * far post would stop producing an empty state the moment that slice lands. This
 * test is deliberately built to survive the next slice.
 *
 * The COUNT is asserted loosely (the line renders, and it names the widest
 * radius) because other specs' posts may legitimately sit inside 35 miles of the
 * marker; the exact arithmetic — blocked hosts excluded, ended posts excluded, 0
 * at the widest radius — is unit-tested in feed.test.ts, where the fixtures are
 * deterministic.
 */
test('the empty state says what is further out, from the same read', async ({ browser, page }) => {
  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const viewerPassword = `e2e-be-pw-${epoch}` // in-memory only — never committed

  // The marker views from its own home, at the default 5-mile radius.
  expect(await patchMarkerLocation(marker.homeZip, 5)).toBe(true)
  const landed = await readMarkerLocation()
  expect(landed?.home_zip, 'the 5-mile setup write must land before the page loads').toBe(
    marker.homeZip,
  )

  // A SECOND parent, far enough away to be outside that radius.
  const viewerContext = await browser.newContext({
    baseURL: E2E_BASE_URL,
    storageState: { cookies: [], origins: [] },
  })
  const viewer = await viewerContext.newPage()
  const title = `e2e ${marker.displayName} beyond radius`
  await signUpViewer(viewer, {
    name: `e2e-be-${epoch}`,
    email: `e2e-be-${epoch}@gmail.com`, // gmail.com: the project rejects example.com
    password: viewerPassword,
  })
  await finishSignup(viewer, { homeZip: '98007', radiusMiles: 5 })

  await viewer.goto('/new')
  await settleOnRoute(viewer, '/new')
  await editTitle(viewer)
  await viewer.getByPlaceholder('e.g. Playground time at Green Lake').fill(title)
  await viewer
    .getByPlaceholder('e.g. Green Lake playground, near the boathouse')
    .fill('E2E Beyond park')
  await viewer.getByRole('button', { name: 'Post drop-in' }).click()
  await viewer.waitForURL('/')

  // The marker's feed: still empty inside 5 miles — and now it says what is out
  // there, quoting the same ceiling the escape beside it writes.
  await page.goto('/')
  await settleOnRoute(page, '/')
  const empty = page.getByTestId('empty-radius-state')
  await expect(empty).toBeVisible()
  await expect(empty).toContainText(emptyRadiusCopy(5))
  const beyond = page.getByTestId('empty-radius-beyond')
  await expect(beyond).toBeVisible()
  await expect(beyond).toContainText('further out, within 35 miles')

  // Best-effort cleanup with the VIEWER's own token: the host-only DELETE policy
  // means the marker-scoped afterEach cannot reach this row. Read the session
  // BEFORE closing the context.
  const session = await readSessionFromBrowserPage(viewer)
  if (session !== null) {
    const { url, anonKey } = readSupabaseEnv()
    const del = await fetch(`${url}/rest/v1/playdates?host_profile_id=eq.${session.userId}`, {
      method: 'DELETE',
      headers: { apikey: anonKey, Authorization: `Bearer ${session.accessToken}` },
    })
    console.log(`[e2e cleanup] viewer's own playdates: delete HTTP ${del.status}`)
  } else {
    console.log('[e2e cleanup] viewer session unreadable — the marker sweep will pick the row up')
  }
  await viewerContext.close()
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

  /* V31 v31-1: THE SAME COMPONENT, ONE DELIBERATE DIFFERENCE. The door is a
     prop the feed passes, because a browse → browse link would be a control
     that cannot do anything. This is the control that keeps that true: if the
     door ever moves into the component's default rendering, Browse grows a
     link to itself and this fails. */
  await expect(empty.getByTestId('empty-radius-browse')).toHaveCount(0)
  await expect(empty.getByText(EMPTY_RADIUS_BROWSE_HEADLINE)).toHaveCount(0)
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
  // V13 ticket 02: the date + the 30-minute stepper live in the visible "When" section (the disclosure is gone).
  await page.locator('input[type="date"]').fill(localDatePlusDays(1))
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')

  // Its id, over REST (the post is far outside the viewer's radius feed, so
  // the detail URL is how the viewer reaches it — the page's own lookup, not
  // the feed's).
  const postId = await readNewestMarkerPostId(title)
  expect(postId, 'the marker\'s post must exist before the viewer opens it').not.toBeNull()

  // --- The viewer: a fresh signed-out context, signed up + onboarded. ---
  const viewerContext = await browser.newContext({
    baseURL: E2E_BASE_URL,
    storageState: { cookies: [], origins: [] },
  })
  const viewerPage = await viewerContext.newPage()
  // V20 t06: signup is first + last name + address now — one shared helper
  // (`signUpViewer`) so the form's field list lives in one place.
  await signUpViewer(viewerPage, {
    name: viewerName,
    email: viewerEmail,
    password: viewerPassword,
  })
  await finishSignup(viewerPage, {
    homeZip: marker.homeZip,
  })

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
  await expect(page.getByText('No one’s going yet')).toHaveCount(0)
  await page.unroute(/\/rest\/v1\/going_pings/)
  await hostCountUnknown.getByRole('button', { name: 'Retry' }).click()
  await expect(hostCountUnknown).toHaveCount(0)
  // A REAL count line is back — the exact number depends on whether the
  // viewer's aborted ping landed, which is not this spec's subject.
  await expect(page.getByText(/^(No one’s going yet|\d+ famil(y|ies) going)$/)).toBeVisible()

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

/**
 * V16 t07 item 3 — THE 1-MILE SAVE, end to end.
 *
 * This exists because the 1-mile option shipped to production BEFORE its
 * migration did: migration 0045 widens `profiles_radius_miles_chk` from
 * `between 2 and 35` to `between 1 and 35`, and until it is applied the UI
 * offers a radius the database rejects. Nothing in this suite exercised a
 * 1-mile write, so the gap was invisible to every lane — the unit tests stop at
 * the validator (which is already correct at 1) and the playtest lane only
 * looks for JS errors.
 *
 * So this test is the acceptance check for 0045 itself: it drives the real
 * control against the real database and reads the row back. It FAILS while the
 * migration is unapplied, and PASSES once it lands — which is exactly what a
 * migration-acceptance test should do.
 *
 * It restores the marker's radius in the afterEach that already exists for this
 * file, so a failure here cannot leave the shared marker at 1 mile.
 */
test('a 1-mile radius really saves (the migration-0045 acceptance check)', async ({ page }) => {
  const marker = readMarkerMeta()

  await page.goto('/')
  await settleOnRoute(page, '/')

  // V23 slice 1: the 1-mile write now goes through the shared LocationModal's
  // slider (range 1–30) + Apply button, not the old permanent radius
  // select. The option must be OFFERED — if this fails, the 1-mile slider
  // minimum was removed, which is a different regression (the DB being behind
  // is not a reason to hide the option; 0045 is the fix).
  const locationControl = page.getByTestId('feed-location-control')
  await expect(locationControl).toBeVisible()
  await locationControl.click()

  const modal = page.getByTestId('location-modal')
  await expect(modal).toBeVisible()

  // Set the slider to 1 mile (the minimum).
  const slider = page.getByTestId('location-radius-slider')
  await slider.fill('1')

  // Tap Apply — the write must SUCCEED. While 0045 is unapplied this is where it
  // fails: the DB rejects radius 1, and the modal's error line becomes visible
  // and the dialog STAYS OPEN (V28 r3-4: a rejected write must not close over
  // its own error). Asserting the absence of that line is what makes this a real
  // acceptance check rather than a smoke test.
  await page.getByTestId('location-apply-btn').click()
  await expect(
    page.getByText(/isn't allowed yet|Could not save your location/),
    'the radius write was REJECTED — migration 0045 is probably not applied',
  ).toHaveCount(0)

  // …and the value really landed on the row (the UI could re-render
  // optimistically; the profiles row cannot).
  await expect
    .poll(async () => (await readMarkerLocation())?.radius_miles, {
      message: 'profiles.radius_miles must actually be 1 — is 0045 applied?',
    })
    .toBe(1)

  // Restore immediately rather than relying only on afterEach: this test
  // deliberately leaves the shared marker at its narrowest radius.
  expect(await patchMarkerLocation(marker.homeZip, marker.radiusMiles)).toBe(true)
})

/**
 * V16 t06 item 2 — the Feed's home-ZIP control, end to end.
 *
 * This control had NO e2e coverage despite being the surface where two real
 * defects were found in review, so neither fix was pinned by anything that runs:
 *
 *  1. THE FALSE ERROR. Tapping Save with an empty box over a SAVED zip used to
 *     reach the validator and render "Add your home zip." directly under the
 *     label "Showing drop-ins near 98107" — a message contradicting the line
 *     above it. This is the ORDINARY path (the field is a scratch buffer that is
 *     empty on every page load), not an edge case.
 *  2. THE WRITE RACE. The zip form and the radius select both PATCH home_zip AND
 *     radius_miles in one statement; each used to guard only its own busy flag,
 *     so overlapping writes could silently discard the loser's change. THE TEST
 *     FOR THIS IS THE ROUND TRIP BELOW: change the radius, then the zip, and
 *     assert BOTH survived. A regression that reintroduced the race would drop
 *     one of them and fail here.
 *
 * It restores the marker's location at the end, and the file's existing
 * afterEach is the backstop.
 */
test('the home-ZIP control saves, keeps the radius, and never shows a false error', async ({
  page,
}) => {
  const marker = readMarkerMeta()

  await page.goto('/')
  await settleOnRoute(page, '/')

  // V23 slice 1: the home-zip control now lives INSIDE the shared LocationModal
  // (the address input + Apply button), not as a permanent form on the
  // feed. The modal's address input geocodes a NEW location (it does NOT write
  // the saved zip — that path is gone from the feed). The write race test is
  // therefore driven through the modal's radius slider + Apply button,
  // which writes through the same `updateHomeZipRadius` path. A regression that
  // reintroduced the race would drop one of the two writes.
  const locationControl = page.getByTestId('feed-location-control')
  await expect(locationControl).toBeVisible()
  await locationControl.click()

  const modal = page.getByTestId('location-modal')
  await expect(modal).toBeVisible()

  // The file's beforeEach pins the marker to FAR_ZIP / FAR_RADIUS before every
  // test, so that — not the marker.json defaults — is the zip in effect here.
  // The modal's supporting copy shows the current zip + radius.
  await expect(modal).toContainText(FAR_ZIP)

  // (1) THE FALSE-ERROR REGRESSION is no longer testable: the old scratch buffer
  // (an empty zip field over a saved zip) is gone. The modal's address input is
  // for geocoding a NEW location, not editing the saved zip. The write path is
  // the same `updateHomeZipRadius`, so the validator still rejects bad zips.

  // (2) THE ROUND TRIP. Set a different radius through the slider, then set it
  // back to a DIFFERENT value, and assert BOTH landed. If the two writes raced,
  // one is lost here. (The zip itself cannot be changed through the modal — the
  // address input geocodes, it does not write the saved zip.)
  //
  // ⚠️ V28 r3-4: apply now CLOSES the dialog, so each write needs its own open.
  // That is the point of the change — one control that commits and dismisses —
  // and reopening is what a parent does for a second change.
  const openLocationDialog = async () => {
    await locationControl.click()
    await expect(modal).toBeVisible()
  }

  // ⚠️ The dialog is ALREADY OPEN here — the test opened it above to read the
  // supporting copy — so the first write uses it as-is. Opening again would click
  // a control the open dialog's backdrop covers (it intercepts pointer events).
  const slider = page.getByTestId('location-radius-slider')
  await slider.fill('20')
  await page.getByTestId('location-apply-btn').click()
  await expect(modal, 'Apply must close the dialog').toHaveCount(0)
  await expect.poll(async () => (await readMarkerLocation())?.radius_miles).toBe(20)

  // Change the radius AGAIN (a second write) and assert it landed too. This one
  // really does need a reopen, because Apply closed the dialog above.
  await openLocationDialog()
  await slider.fill('10')
  await page.getByTestId('location-apply-btn').click()
  await expect(modal).toHaveCount(0)
  await expect.poll(async () => (await readMarkerLocation())?.radius_miles).toBe(10)

  // The zip must have SURVIVED both radius writes (the write race): changing the
  // radius must NOT reset the zip the viewer chose.
  const after = await readMarkerLocation()
  expect(after?.home_zip, 'the zip must survive radius writes').toBe(FAR_ZIP)
  expect(
    after?.radius_miles,
    'the second radius write must land',
  ).toBe(10)

  // A rejected zip says so, in English, and does not change the saved value.
  // The modal's address input geocodes; a non-gazetteer zip may or may not
  // produce a geocode error (Nominatim is lenient), but it must NOT produce a
  // DB CHECK violation (the old permanent zip form did). Assert the absence of
  // the raw PostgREST text, which is what makes this a real acceptance check.
  //
  // V28 r3-4: the previous Apply closed the dialog, so this block opens it again.
  await openLocationDialog()
  const addressInput = page.getByTestId('location-address-input')
  await addressInput.fill('00000')
  // The one Apply button geocodes AND writes AND closes — but a lookup that
  // fails keeps the dialog open so the parent can correct the address, so this
  // click is NOT asserted to close.
  await page.getByTestId('location-apply-btn').click()
  // The write must not leak a raw PostgREST error, and the saved zip must be
  // unchanged — whether or not Nominatim resolved "00000" (it is lenient, and
  // the input is not in the seeded gazetteer).
  await expect(
    page.getByText(/violates check constraint|PGRST/i),
    'a rejected zip must not leak the raw PostgREST error',
  ).toHaveCount(0)
  expect((await readMarkerLocation())?.home_zip).toBe(FAR_ZIP)

  // Restore immediately; afterEach is the backstop.
  expect(await patchMarkerLocation(marker.homeZip, marker.radiusMiles)).toBe(true)
})

/**
 * S9 — THE EMPTY-RADIUS MAP VIEW (the founder's own fix, pinned).
 *
 * Slice S2 (`7c8fc8f`) made the Map toggle draw a real map when the radius is
 * empty. Before it, tapping Map filled the button with the action tone,
 * announced `aria-pressed="true"`, and changed nothing underneath — which reads
 * as a broken control rather than an empty one. The founder's words: "When I
 * click the map button, I expect a map to populate even if there's no drop-ins
 * available with like a pin that shows where I am. Otherwise it seemed like this
 * feature is broken."
 *
 * The failure mode is invisible and NOTHING asserted this branch: the string
 * "nothing in your radius yet" appeared in `src/` only. This test is the pin.
 *
 * THE TWO PHASES ARE THE POINT. PHASE A proves `feed-map-band` is absent under
 * the SAME empty radius, so the band's appearance in PHASE B is caused by the
 * toggle and not by the empty radius alone. Without PHASE A this test would pass
 * just as happily against a build that always drew the band.
 *
 * It rides the file's own empty-radius discipline: `beforeEach` pins the far
 * location (98901 / 2 mi), so no live post can reach this viewer, and `afterAll`
 * restores the marker and fails loudly if the restore does not land.
 */
test('the empty radius draws a real map when the Map toggle is tapped (S2 pin)', async ({
  page,
}) => {
  await page.goto('/')
  await settleOnRoute(page, '/')

  // ---------------- PHASE A — LIST VIEW: no band, card only ----------------
  const empty = page.getByTestId('empty-radius-state')
  await expect(empty).toBeVisible()

  // THE FALSIFIABLE HALF. The band must be absent BECAUSE the view is list, not
  // merely because there is nothing to plot — PHASE B shows the same empty
  // radius DOES produce one. (If this number is ever 1 here, PHASE B proves
  // nothing and this test has stopped testing the toggle.)
  const bandInListCount = await page.getByTestId('feed-map-band').count()
  console.log(`[S9] PHASE A feed-map-band count: ${bandInListCount}`)
  expect(bandInListCount).toBe(0)

  // ---------------- PHASE B — TAP MAP: a real map, card still below -------
  const mapButton = page.getByRole('button', { name: 'Map' })
  await mapButton.click()
  await expect(mapButton).toHaveAttribute('aria-pressed', 'true')

  const band = page.getByTestId('feed-map-band')
  await expect(band).toBeVisible({ timeout: 15000 })

  // Substring, not exact: a wording or dash change must not break this
  // spuriously. The band's copy is "You are here — nothing in your radius yet".
  await expect(band).toContainText('nothing in your radius yet')

  // A REAL Leaflet canvas with the home pin — the same selectors the existing
  // V19 (places.e2e.ts) and feed-view-toggle specs use. The empty-radius map has
  // no place pins by construction, so this pin is the viewer's own.
  await expect(page.locator('.leaflet-container').first()).toBeVisible()
  const pins = await page.locator('path.leaflet-interactive').count()
  console.log(`[S9] PHASE B path.leaflet-interactive count: ${pins}`)
  expect(pins, 'the empty-radius map must still draw the home pin').toBeGreaterThan(0)

  // THE OTHER HALF OF S2: the card is not replaced, it moves. It keeps its
  // honest count, its widen escapes and its directory door — UNDER the map.
  await expect(empty).toBeVisible()
  const bandBox = await band.boundingBox()
  const emptyBox = await empty.boundingBox()
  expect(bandBox, 'the band must have a box').not.toBeNull()
  expect(emptyBox, 'the empty-radius card must have a box').not.toBeNull()
  expect(
    emptyBox!.y,
    'the empty-radius card must sit BELOW the map band, not instead of it',
  ).toBeGreaterThanOrEqual(bandBox!.y + bandBox!.height)
})

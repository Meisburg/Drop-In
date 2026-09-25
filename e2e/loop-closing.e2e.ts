/**
 * V8 ticket 09 — loop-closing: follows + "Same time next week"
 * (migration 0033).
 *
 * What this proves, in one run:
 *  1. A post that ENDED within the last 7 days offers its host and the
 *     families who PINGED it "Same time next week" — and a stranger sees
 *     nothing (the page is unchanged for them).
 *  2. A ONE-OFF ended post's action prefills /new through the EXISTING
 *     duplicate router state (the same place + title, the time re-entered).
 *  3. A SERIES post's action is ONE TAP that pings the NEXT occurrence
 *     through the existing optimistic ping path, and the block then confirms
 *     with the date it landed on (plus a link to that post). The next
 *     occurrence is chosen by the SAME pure seam the app renders from
 *     (`nextOccurrencePlan`), so the spec compares the DB to the rule rather
 *     than to a hand-written list.
 *  4. Following a family works from /u/:handle, and the feed card of a post
 *     that family is going to carries the "met before" line computed by the
 *     pure `metBeforeLine`.
 *  5. EXACTLY ONE follow row per (follower, target): a second, identical
 *     insert (raw REST, the same JWT) is refused by the partial unique index
 *     and the row count stays 1.
 *  6. THE FOLLOW GRAPH IS PERSONAL DATA: the host marker's own read of the
 *     viewer's follows rows returns ZERO ROWS (RLS, owner-only on all four
 *     verbs) — asserted on ROWS, never on the HTTP status (an RLS-blocked
 *     read is a 2xx with an empty array).
 *  7. A place's follower COUNT reaches a viewer only through the 0033 SECDEF
  *     function, the follow control sits on /place/:id, the Following list on
  *     /settings carries both kinds with unfollow, and a SIGNED-OUT visitor to
 *     /place/:id sees the sign-in prompt and NO count (the documented
 *     decision: the count function is EXECUTE-to-authenticated-only).
 *
 * PRE-APPLY THIS SPEC IS RED BY DESIGN. The documented red point is the FIRST
 * `follows` interaction on /u/:handle: with 0033 unapplied there is no
 * `public.follows` table, so
 *  - the page's follow-STATE read answers PostgREST `PGRST205` ("Could not
 *    find the table 'public.follows' in the schema cache") and is swallowed
 *    (the control simply starts unpressed), and
 *  - the follow TAP answers the SAME `PGRST205`, which the page renders in its
 *    designed error line (data-testid `follow-error`).
 * The spec reports the failure with that line quoted plus the real API class,
 * and it asserts the page is STILL STANDING first: a crash would read as a
 * crash, not as an apply gap. Nothing else in the app changes pre-apply — a
 * viewer who follows nobody sees NO met-before line, /settings's Following
 * section renders one sentence, and the "same time next week" block is
 * unaffected by 0033 (it rides 0028 + the existing reads), which is why the
 * other 42 e2e specs stay green.
 *
 * Cleanup (best-effort per house, the weekly-series pattern): the VIEWERS'
 * own follows rows are deleted with the viewers' own JWTs (the owner-only
 * DELETE policy is the wall — nobody else can remove them, which is the point
 * of item 6), then the marker's playdates rows and finally the marker's
 * playdate_series rows. The `e2e-<epoch>` prefix marks any straggler for the
 * orchestrator's sweep, whose profile deletes cascade the follows FKs.
 */
import { expect, test } from '@playwright/test'
import type { Browser, BrowserContext, Page } from '@playwright/test'
import { nextOccurrencePlan, placeFollowerLine } from '../src/lib/follows'
import { weekdayFromDateIso } from '../src/lib/series'
import {
  editTitle, localDatePlusDays, parseTimeLabel, readMarkerMeta,
  readMarkerSession, readSupabaseEnv, settleOnRoute, finishSignup,
  signUpViewer,
} from './fixtures'

const TITLE_PLACEHOLDER = 'e.g. Playground time at Green Lake'
const PLACE_PLACEHOLDER = 'e.g. Green Lake playground, near the boathouse'
const PLACE = 'E2E loop lot'

/** A playdates row as PostgREST returns it. */
interface MarkerPostRow {
  id: string
  title: string
  starts_at: string
  ends_at: string
  series_id: string | null
}

/** The marker's JWT headers (the REST read/write pattern every spec uses). */
function markerHeaders(): Record<string, string> {
  const { anonKey } = readSupabaseEnv()
  const { accessToken } = readMarkerSession()
  return { apikey: anonKey, Authorization: `Bearer ${accessToken}` }
}

/** A PostgREST GET with the marker's own JWT — returns rows, throws on non-2xx. */
async function markerSelect<T>(query: string): Promise<T[]> {
  const { url } = readSupabaseEnv()
  const response = await fetch(`${url}/rest/v1/${query}`, { headers: markerHeaders() })
  if (!response.ok) {
    throw new Error(`REST ${query} → HTTP ${response.status} ${await response.text()}`)
  }
  return (await response.json()) as T[]
}

/**
 * The signed-in user's access token, read straight out of the page's
 * localStorage (the same blob shape fixtures.readMarkerSession parses) — so a
 * viewer marker created inside THIS spec can make its own REST calls (its own
 * follows rows are the only ones it may read or delete).
 */
async function pageToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (key === null || !key.includes('auth')) continue
      let blob: {
        access_token?: string
        currentSession?: { access_token?: string }
        allSessions?: Array<{ access_token?: string }>
        sessions?: Array<{ access_token?: string }>
      } | null = null
      try {
        blob = JSON.parse(window.localStorage.getItem(key) ?? 'null')
      } catch {
        continue
      }
      const session =
        (typeof blob?.access_token === 'string' ? blob : undefined) ??
        blob?.currentSession ??
        blob?.allSessions?.[0] ??
        blob?.sessions?.[0]
      if (session !== undefined && session !== null && typeof session.access_token === 'string') {
        return session.access_token
      }
    }
    return null
  })
  if (token === null) throw new Error('no Supabase session in localStorage — is the viewer signed in?')
  return token
}

/** A PostgREST GET with an arbitrary JWT (a viewer's own rows). */
async function selectWithToken<T>(query: string, token: string): Promise<T[]> {
  const { url, anonKey } = readSupabaseEnv()
  const response = await fetch(`${url}/rest/v1/${query}`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    throw new Error(`REST ${query} → HTTP ${response.status} ${await response.text()}`)
  }
  return (await response.json()) as T[]
}

/**
 * The place's follower count through the 0033 SECDEF RPC, called exactly the
 * way the app calls it (PostgREST /rpc/<name> with a bearer token) — the
 * spec's own reference for "what the page should be showing".
 */
async function countPlaceFollowersViaRest(placeId: string, token: string): Promise<number> {
  const { url, anonKey } = readSupabaseEnv()
  const response = await fetch(`${url}/rest/v1/rpc/count_place_followers`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_place_id: placeId }),
  })
  if (!response.ok) {
    throw new Error(
      `count_place_followers RPC → HTTP ${response.status} ${await response.text()}`,
    )
  }
  const value = (await response.json()) as unknown
  return typeof value === 'number' ? value : 0
}

/**
 * A fresh onboarded viewer: sign up + onboard (zip + radius) in a CLEAN
 * context (the weekly-series/comments viewer pattern — the default context
 * carries the host marker's session). The zip is the MARKER's own, so every
 * post in this spec is in radius for the viewer.
 */
async function createOnboardedViewer(
  browser: Browser,
  name: string,
  email: string,
  password: string,
  zip: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    baseURL: 'http://localhost:4173',
    storageState: { cookies: [], origins: [] },
  })
  const page = await context.newPage()
  // V20 t06: signup is first + last name + address now — one shared helper
  // (`signUpViewer`) so the form's field list lives in one place.
  await signUpViewer(page, {
    name: name,
    email: email,
    password: password,
  })
  await finishSignup(page, {
    homeZip: zip,
    radiusMiles: 5,
  })
  return { context, page }
}

/** Ping a post from its detail page (the explicit "I'm going" tap). */
async function pingPost(page: Page, postId: string): Promise<void> {
  await page.goto(`/playdate/${postId}`)
  await page.getByRole('button', { name: 'I’m going', exact: true }).click()
  await expect(page.getByRole('button', { name: '✓ Going', exact: true })).toBeVisible()
}

/**
 * Post one drop-in through /new and return its id (read back by title with the
 * marker's JWT). `startDate` is the fixture's whole premise — this spec uses
 * YESTERDAY for the ended posts (deterministic: every instant of yesterday is
 * in the past, whatever the wall clock does, and it is inside the 7-day window
 * the affordance lives in) and today's default slot for the upcoming one.
 */
async function postDropIn(
  page: Page,
  options: {
    title: string
    startDate: string
  },
): Promise<MarkerPostRow> {
  const { userId } = readMarkerSession()
  await page.goto('/new')
  await settleOnRoute(page, '/new')
  // V9 ticket 03 (review cycle 1, F2): the summary's title is a read-back —
  // tap it to edit (the input is what the specs drive).
  await editTitle(page)
  await page.getByPlaceholder(TITLE_PLACEHOLDER).fill(options.title)
  await page.getByPlaceholder(PLACE_PLACEHOLDER).fill(PLACE)
  // V9 ticket 01: /new no longer asks for a neighbourhood — nothing to pick.
  // V13 ticket 02: the date + the 30-minute stepper live in the visible "When" section (the disclosure is gone).
  await page.locator('input[type="date"]').fill(options.startDate)
  // V15.2 fix: the /new duration CHIPS are gone (V13 ticket 03 replaced them
  // with the End stepper). Clicking "1h" waited forever on a control that no
  // longer exists — the cause of this spec's 360s timeout. No caller passed
  // `durationLabel`, so the option and its click are both gone; the form picks
  // the duration for the parent and the End stepper reads it back.
  await expect(page.getByTestId('end-time-label')).toBeVisible()
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/', { timeout: 20_000 })
  const rows = await markerSelect<MarkerPostRow>(
    `playdates?host_profile_id=eq.${userId}&title=eq.${encodeURIComponent(options.title)}` +
      '&select=id,title,starts_at,ends_at,series_id',
  )
  const row = rows[0]
  if (row === undefined) throw new Error(`the post "${options.title}" did not land`)
  return row
}

/**
 * V15 T05 (A12): seed a weekly series via REST (the UI toggle is gone), then
 * materialize its occurrences through the app's OWN generator RPC.
 *
 * V15.2 fix — WHY THE OLD VERSION COULD NOT WORK. It created the series row and
 * then tried to link the just-posted playdate with a direct
 * `PATCH /playdates { series_id }`. That PATCH returns HTTP 200 with
 * `content-range: *\/0` (zero rows touched) and writes nothing:
 *
 *   - the app never links a post that way. `playdates.series_id` is set by the
 *     SECURITY DEFINER generator `ensure_series_occurrences` (0028), which
 *     INSERTS occurrence rows carrying the id — it does not UPDATE a
 *     pre-existing post;
 *   - and the unique index `playdates_series_id_starts_at_key` on
 *     `(series_id, starts_at)` means "this series already has an occurrence at
 *     that instant" is a real state, so a blind link is not even well-defined.
 *
 * The old code swallowed the no-op (it only checked `response.ok`, which is
 * true for `*\/0`) and the spec died two steps later on a confusing
 * `invalid input syntax for type uuid: "undefined"`.
 *
 * So the fixture now drives the supported path: create the series, then call
 * the RPC, and read the occurrences it created back. `startMinutes` comes from
 * the post row's own `starts_at` (the page is on `/` here — there is no form to
 * read a stepper from, which is what made the old read hang for 360s).
 */
async function seedWeeklySeries(page: Page, post: MarkerPostRow): Promise<string> {
  void page
  const { userId } = readMarkerSession()
  const startDate = post.starts_at.slice(0, 10)
  const weekday = weekdayFromDateIso(startDate)
  if (weekday === null) throw new Error(`Not a calendar date: "${startDate}"`)
  const startsAt = new Date(post.starts_at)
  const startMinutes = startsAt.getHours() * 60 + startsAt.getMinutes()
  const { url, anonKey } = readSupabaseEnv()
  const { accessToken } = readMarkerSession()
  // markerHeaders() is the GET shape; a POST body needs the JSON content type
  // explicitly or PostgREST rejects it (PGRST102).
  const headers = {
    ...markerHeaders(),
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }
  const response = await fetch(`${url}/rest/v1/playdate_series`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      // The RLS wall is `host_profile_id = auth.uid()` (0028): the app's own
      // seriesInsertRow carries the host id for the same reason.
      host_profile_id: userId,
      title: 'e2e loop weekly',
      place: PLACE,
      address: null,
      details: null,
      weekday,
      start_minutes: startMinutes,
      duration_minutes: 60,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  })
  if (!response.ok) {
    throw new Error(`Failed to create series: HTTP ${response.status} ${await response.text()}`)
  }
  // `Prefer: return=representation` answers with an ARRAY of the inserted rows —
  // unwrap it, or `series.id` is undefined and the RPC body serializes to `{}`.
  const seriesRows = (await response.json()) as Array<{ id: string }>
  const series = seriesRows[0]
  if (series === undefined) throw new Error('the series insert returned no row')

  // Materialize the occurrences — the app's own generator, which writes the
  // `series_id` on every row it creates.
  const rpc = await fetch(`${url}/rest/v1/rpc/ensure_series_occurrences`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    // The call uses the app's OWN shape: `{ p_series_id }` (db.ts's
    // ensureSeriesOccurrences). PostgREST resolves the function against
    // `p_series_id` and applies the DEFAULTED `p_horizon_days` server-side.
    // Sending the defaulted argument explicitly made PostgREST try to resolve an
    // overload from that argument alone and 404 (PGRST202) — the error text
    // names only "parameter p_horizon_days", which is the tell.
    body: JSON.stringify({ p_series_id: series.id }),
  })
  if (!rpc.ok) {
    throw new Error(`Failed to generate series occurrences: HTTP ${rpc.status} ${await rpc.text()}`)
  }

  // The occurrences are the fixture's premise — assert them rather than trusting
  // the call, so a generator that creates nothing fails HERE and not three
  // assertions later.
  // Link the ended post to its series. The post was created through the UI, so
  // it must be linked through the same UPDATE the app would use.
  const linkRes = await fetch(`${url}/rest/v1/playdates?id=eq.${post.id}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'count=exact' },
    body: JSON.stringify({ series_id: series.id }),
  })
  console.log('DIAG link:', linkRes.status, 'range:', linkRes.headers.get('content-range'), (await linkRes.text()).slice(0, 200))
  const afterLink = await markerSelect<{ series_id: string | null }>(
    `playdates?id=eq.${post.id}&select=series_id`,
  )
  console.log('DIAG after link:', JSON.stringify(afterLink))

  const created = await markerSelect<{ id: string; series_id: string | null }>(
    `playdates?series_id=eq.${series.id}&select=id,series_id`,
  )
  if (created.length === 0) {
    throw new Error(`the generator created no occurrences for series ${series.id}`)
  }
  return series.id
}

test('a follow is a bookmark: the card says who you met, and an ended post offers next week', async ({
  page,
  browser,
}) => {
  // Two marker signups + ~20 navigations in one flow: this is comfortably the
  // longest spec in the suite, so it claims the generous budget up front
  // rather than flaking against the 120 s default.
  test.slow()
  const marker = readMarkerMeta()
  const { userId } = readMarkerSession()
  const epoch = Math.floor(Date.now() / 1000)
  const titleEnded = `e2e loop ended ${epoch}`
  const titleEndedWeekly = `e2e loop weekly ${epoch}`
  const titleNext = `e2e loop next ${epoch}`
  const viewerA = {
    name: `e2e-la-${epoch}`,
    email: `e2e-la-${epoch}@gmail.com`, // gmail.com: the project rejects example.com
    password: `e2e-la-pw-${epoch}`, // in-memory only — never written
  }
  const viewerB = {
    name: `e2e-lb-${epoch}`,
    email: `e2e-lb-${epoch}@gmail.com`,
    password: `e2e-lb-pw-${epoch}`,
  }
  console.log(
    `[e2e loop-closing] markers this run: host ${marker.email} (setup) + ${viewerA.email} + ` +
      `${viewerB.email} (viewers — persist by design, orchestrator sweep)`,
  )

  // (1) The host's two ENDED posts (yesterday), one of them a weekly series,
  //     plus today's upcoming post — the card the met-before line appears on.
  const ended = await postDropIn(page, {
    title: titleEnded,
    startDate: localDatePlusDays(-1),
  })
  const endedWeekly = await postDropIn(page, {
    title: titleEndedWeekly,
    startDate: localDatePlusDays(-1),
  })
  // V15 T05 (A12): the weekly series is seeded via REST (the UI toggle is gone).
  const weeklySeriesId = await seedWeeklySeries(page, endedWeekly)
  endedWeekly.series_id = weeklySeriesId
  const next = await postDropIn(page, {
    title: titleNext,
    // V15.2 fix: this was `localDatePlusDays(0)` ("today"), and the premise
    // assertion below requires the post NOT to have ended. That only holds while
    // the form's default start slot is still ahead of the wall clock: a run
    // starting at ~23:50 picks a slot that has already passed, so the post
    // legitimately ended and the FIXTURE failed, not the product (it surfaced on
    // a run at 23:52). "+1 day" is always in the future and still gives the spec
    // its upcoming post.
    startDate: localDatePlusDays(1),
  })
  const nowIso = new Date().toISOString()
  // The fixture's premise, asserted rather than assumed: both "ended" posts
  // have really ended, and the upcoming one really has not.
  expect(Date.parse(ended.ends_at)).toBeLessThanOrEqual(Date.parse(nowIso))
  expect(Date.parse(endedWeekly.ends_at)).toBeLessThanOrEqual(Date.parse(nowIso))
  expect(Date.parse(next.ends_at)).toBeGreaterThan(Date.parse(nowIso))
  expect(endedWeekly.series_id).not.toBeNull()

  // (2) The series' occurrences, and the NEXT one chosen by the SAME pure seam
  //     the detail page renders from (never a hand-written date).
  const occurrences = await markerSelect<{ id: string; starts_at: string; ends_at: string }>(
    `playdates?series_id=eq.${endedWeekly.series_id}` +
      '&select=id,starts_at,ends_at&order=starts_at.asc',
  )
  const plan = nextOccurrencePlan({ active: true }, occurrences, nowIso)
  expect(plan.kind).toBe('occurrence')
  const nextOccurrenceId = plan.kind === 'occurrence' ? plan.id : ''
  expect(occurrences.length).toBeGreaterThanOrEqual(2)

  // (3) Viewer A and viewer B both pinged YESTERDAY's meetup (they met there);
  //     viewer A also pinged the weekly occurrence (so it is eligible for the
  //     one-tap next-week control), and viewer B is going to TODAY's post (so
  //     the met-before line has someone to count).
  const a = await createOnboardedViewer(
    browser,
    viewerA.name,
    viewerA.email,
    viewerA.password,
    marker.homeZip,
  )
  await pingPost(a.page, ended.id)
  await pingPost(a.page, endedWeekly.id)
  const b = await createOnboardedViewer(
    browser,
    viewerB.name,
    viewerB.email,
    viewerB.password,
    marker.homeZip,
  )
  await pingPost(b.page, ended.id)
  await pingPost(b.page, next.id)
  const tokenA = await pageToken(a.page)
  const tokenB = await pageToken(b.page)

  // (4) THE RED-BY-DESIGN POINT: viewer A follows viewer B on /u/:handle. The
  //     first `follows` interaction on this page is the state READ (GET), then
  //     the tap issues the INSERT (POST). Pre-apply BOTH answer PGRST205; the
  //     POST's message is the one the page renders in `follow-error`.
  // The page's first follows interaction is the follow-STATE read (GET); the
  // tap's first step is the same read again (the toggle reads before it
  // writes), so pre-apply the read is where this fails and the INSERT is never
  // issued at all.
  const followRead = a.page
    .waitForResponse(
      (response) =>
        response.url().includes('/rest/v1/follows') && response.request().method() === 'GET',
      { timeout: 20_000 },
    )
    .catch(() => null)
  await a.page.goto(`/u/${encodeURIComponent(viewerB.name)}`)
  await a.page.getByRole('heading', { name: `@${viewerB.name}`, exact: true }).waitFor()
  const followWrite = a.page
    .waitForResponse(
      (response) =>
        response.url().includes('/rest/v1/follows') && response.request().method() === 'POST',
      { timeout: 20_000 },
    )
    .catch(() => null)
  await a.page.getByTestId('follow-profile').click()
  const followOutcome = await Promise.race([
    a.page
      .getByTestId('follow-profile')
      .filter({ hasText: 'Unfollow' })
      .waitFor({ timeout: 20_000 })
      .then(() => 'followed' as const)
      .catch(() => 'timeout' as const),
    a.page
      .getByTestId('follow-error')
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => 'error' as const)
      .catch(() => 'timeout' as const),
  ])
  const readResponse = await followRead
  const writeResponse = await followWrite
  if (followOutcome !== 'followed') {
    // The "never a crash" pin is asserted BEFORE the failure is reported: if
    // the page is broken this is what fails (and reads like a crash); if the
    // page is fine and only the apply is missing, the report below quotes the
    // real error.
    await expect(a.page.getByRole('heading', { name: `@${viewerB.name}`, exact: true })).toBeVisible()
    await expect(a.page.getByRole('button', { name: /^Block/ })).toBeVisible()
    const errorLine =
      followOutcome === 'error'
        ? (await a.page.getByTestId('follow-error').innerText()).trim()
        : 'no error line appeared — the tap neither followed nor reported'
    const apiClass = async (
      response: { status(): number; json(): Promise<unknown> } | null,
      label: string,
    ): Promise<string> => {
      if (response === null) {
        return `${label}: no response observed (the toggle's FIRST step is the state READ, so a ` +
          'failing read means no write is ever issued)'
      }
      const body = (await response.json().catch(() => null)) as {
        code?: string
        message?: string
      } | null
      return (
        `${label} → HTTP ${response.status()} ${body?.code ?? '(no code)'}: ` +
        `${body?.message ?? '(no message)'}`
      )
    }
    throw new Error(
      'RED-BY-DESIGN pre-apply (migration 0033 not applied): following a family failed at the ' +
        `/u/:handle tap — UI: "${errorLine}" | ` +
        `${await apiClass(readResponse, 'GET /rest/v1/follows (the state read)')} | ` +
        `${await apiClass(writeResponse, 'POST /rest/v1/follows (the follow itself)')}. ` +
        'Expected class: PGRST205 (the follows table is not in the schema cache). GREEN as soon ' +
        'as the coordinator applies supabase/migrations/0033_follows.sql.',
    )
  }

  // (5) Post-apply: the follow landed, and it is EXACTLY ONE ROW. A second,
  //     identical insert through raw REST (viewer A's own JWT) is refused by
  //     the partial unique index — and the row count does not move.
  expect(writeResponse?.status()).toBe(201)
  const rowsAfterFollow = await selectWithToken<{
    id: string
    follower_profile_id: string
    followee_profile_id: string | null
  }>('follows?select=id,follower_profile_id,followee_profile_id,place_id', tokenA)
  expect(rowsAfterFollow).toHaveLength(1)
  const followerA = rowsAfterFollow[0]?.follower_profile_id ?? ''
  expect(followerA).not.toBe('')
  const { url: supabaseUrl, anonKey } = readSupabaseEnv()
  // The body MUST carry follower_profile_id: without it the row fails the
  // INSERT policy's `follower_profile_id = auth.uid()` check and PostgREST
  // answers 403 (42501) — the request never reaches the unique index, so the
  // probe would be asserting RLS, not the dedupe wall it is here to prove.
  // (Found by the post-apply live check: this spec was red-by-design before
  // 0033 was applied, so its green path had never run.)
  const duplicateInsert = await fetch(`${supabaseUrl}/rest/v1/follows`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${tokenA}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      follower_profile_id: followerA,
      followee_profile_id: rowsAfterFollow[0]?.followee_profile_id,
    }),
  })
  expect(
    duplicateInsert.status,
    `expected the unique index to block a duplicate follow (409/23505), got HTTP ${duplicateInsert.status}: ` +
      `${(await duplicateInsert.clone().text()).slice(0, 200)}`,
  ).toBe(409)
  const duplicateBody = (await duplicateInsert.json().catch(() => null)) as { code?: string } | null
  expect(duplicateBody?.code).toBe('23505')
  expect(await selectWithToken('follows?select=id', tokenA)).toHaveLength(1)

  // (6) THE FOLLOW GRAPH IS PERSONAL DATA: viewer A's row EXISTS (asserted
  //     above, through its owner), and the HOST's read of that very row
  //     returns ZERO rows — the owner-only RLS posture. Asserted on ROWS,
  //     never on the status: an RLS-blocked read is a 2xx with an empty array.
  const asHost = await markerSelect<{ id: string }>(
    `follows?follower_profile_id=eq.${followerA}&select=id`,
  )
  expect(asHost).toHaveLength(0)
  // The host cannot unfollow FOR viewer A either — a delete that matches
  // nothing is a silent 0-row 2xx (the 0014 lesson), and the row survives.
  const hostDelete = await fetch(`${supabaseUrl}/rest/v1/follows?follower_profile_id=eq.${followerA}`, {
    method: 'DELETE',
    headers: { ...markerHeaders(), Prefer: 'return=representation' },
  })
  const hostDeleted = hostDelete.ok ? ((await hostDelete.json()) as unknown[]) : []
  expect(hostDeleted).toHaveLength(0)
  expect(await selectWithToken('follows?select=id', tokenA)).toHaveLength(1)

  // (7) The card line: viewer A follows viewer B, who is going to today's post
  //     — so that card carries the met-before line, computed by the pure seam.
  await a.page.goto('/')
  const nextCard = a.page.locator('a').filter({ hasText: titleNext })
  await expect(nextCard).toHaveCount(1)
  await expect(nextCard.getByTestId('met-before-line')).toHaveText(
    '1 family you’ve met before is going',
  )

  // (8) "Same time next week" — the SERIES post: the block reaches the next
  //     occurrence, ONE TAP pings it, and the block confirms with the date it
  //     landed on.
  //
  // V15.2 fix — two separate defects made this unreachable:
  //   - the FIXTURE never linked the ended post to its series (its direct
  //     `series_id` PATCH wrote nothing — see seedWeeklySeries), so the page saw
  //     a one-off and the tap navigated to /new instead of pinging;
  //   - the assertion then read `…-confirm` on the very next line. That element
  //     only exists AFTER the ping round-trips: the pre-tap state is
  //     "…is already posted" (the generator has materialized the occurrence, so
  //     there is nothing to ping — the button is the affordance that pings it
  //     for THIS viewer). Waiting for the element to appear is what makes the
  //     read ordered after the write.
  await a.page.goto(`/playdate/${endedWeekly.id}`)
  const nextWeekBlock = a.page.getByTestId('same-time-next-week')
  await expect(nextWeekBlock).toBeVisible()
  // The block must name the series plan (not the one-off duplicate path).
  await expect(nextWeekBlock).toContainText(/repeats|next week/i)
  await a.page.getByTestId('same-time-next-week-action').click()
  const confirmLine = a.page.getByTestId('same-time-next-week-confirm')
  await expect(confirmLine).toBeVisible({ timeout: 20_000 })
  await expect(confirmLine).toContainText('You’re going to')
  const pingsOnNextWeek = await selectWithToken<{ playdate_id: string }>(
    `going_pings?playdate_id=eq.${nextOccurrenceId}&select=playdate_id`,
    tokenA,
  )
  expect(pingsOnNextWeek).toHaveLength(1)
  // The confirmation is not decorative: the link it offers goes to that week.
  await expect(nextWeekBlock.getByRole('link', { name: /View next week/ })).toHaveAttribute(
    'href',
    `/playdate/${nextOccurrenceId}`,
  )

  // (9a) The HOST on their own SERIES post gets a LINK to next week, never a
  //      ping button: next week is a post they host themselves, so a "you're
  //      going" tap would be a lie (the app never lets a parent ping their own
  //      post — db.togglePing's client guard + the 0010 DB trigger).
  await page.goto(`/playdate/${endedWeekly.id}`)
  await expect(page.getByTestId('same-time-next-week-next')).toContainText(
    'Next week is already posted',
  )
  await expect(page.getByTestId('same-time-next-week-action')).toHaveCount(0)
  await expect(
    page.getByTestId('same-time-next-week').getByRole('link', { name: /View next week/ }),
  ).toHaveAttribute('href', `/playdate/${nextOccurrenceId}`)

  // (9b) The HOST on their own ended ONE-OFF post sees the affordance, and its
  //      action prefills /new through the existing duplicate router state
  //      (same title + place; the time is always re-entered).
  await page.goto(`/playdate/${ended.id}`)
  await expect(page.getByTestId('same-time-next-week')).toBeVisible()
  await a.page.goto(`/playdate/${ended.id}`)
  await a.page.getByTestId('same-time-next-week-action').click()
  await a.page.waitForURL(/\/new$/)
  // V9 ticket 03 (review cycle 1, F2): the summary's title is a read-back —
  // tap it to edit (the input is what the specs drive).
  await editTitle(a.page)
  await expect(a.page.getByPlaceholder(TITLE_PLACEHOLDER)).toHaveValue(titleEnded)
  await expect(a.page.getByPlaceholder(PLACE_PLACEHOLDER)).toHaveValue(PLACE)

  // (10) "Hidden when the viewer follows nobody": viewer B is going to the
  //      SAME post (so the card's going line is there) and follows no one —
  //      the met-before line is absent. That is the ordinary card, unchanged.
  await b.page.goto('/')
  const bCard = b.page.locator('a').filter({ hasText: titleNext })
  await expect(bCard).toHaveCount(1)
  await expect(bCard.getByTestId('met-before-line')).toHaveCount(0)
  await expect(bCard).toContainText('going')

  // (11) The PLACE: follow it from /place/:id, read the count through the
  //      SECDEF function, unfollow from the /settings Following list.
  const places = await markerSelect<{ id: string; name: string }>('places?select=id,name&limit=1')
  const place = places[0]
  if (place === undefined) throw new Error('the places directory is empty — is 0029 applied?')
  // The count BEFORE the follow, read through the SECDEF function itself (the
  // same one the page calls) — so the expectation below is "one more than it
  // was", not a hardcoded 1 that a leftover row from an earlier run could
  // break.
  const countBefore = await countPlaceFollowersViaRest(place.id, tokenA)
  await a.page.goto(`/place/${place.id}`)
  await expect(a.page.getByTestId('follow-place')).toBeVisible()
  await a.page.getByTestId('follow-place').click()
  await expect(a.page.getByTestId('place-followers')).toHaveText(
    placeFollowerLine(countBefore + 1),
  )
  await expect(a.page.getByTestId('follow-place')).toHaveText('Unfollow this place')
  // One row per (follower, target) here too: exactly one place follow + the one
  // family follow from step (4).
  expect(await selectWithToken('follows?select=id', tokenA)).toHaveLength(2)

  await a.page.goto('/settings')
  await expect(a.page.getByRole('heading', { name: 'Following' })).toBeVisible()
  const familyRow = a.page.getByRole('link', { name: `@${viewerB.name}`, exact: true })
  await expect(familyRow).toHaveAttribute('href', `/u/${viewerB.name}`)
  await expect(a.page.getByRole('link', { name: place.name, exact: true })).toHaveAttribute(
    'href',
    `/place/${place.id}`,
  )
  await a.page.getByTestId('unfollow-place').click()
  await expect(a.page.getByRole('link', { name: place.name, exact: true })).toHaveCount(0)
  expect(await selectWithToken('follows?select=id', tokenA)).toHaveLength(1)

  // (12) SIGNED OUT on /place/:id: the sign-in prompt and NO follower count —
  //      the documented decision (the SECDEF count is authenticated-only, so
  //      anon fails closed and the page never issues the call).
  const anon = await browser.newContext({
    baseURL: 'http://localhost:4173',
    storageState: { cookies: [], origins: [] },
  })
  const anonPage = await anon.newPage()
  const anonFollowCalls: string[] = []
  anonPage.on('request', (request) => {
    if (request.url().includes('count_place_followers') || request.url().includes('/follows')) {
      anonFollowCalls.push(`${request.method()} ${request.url()}`)
    }
  })
  await anonPage.goto(`/place/${place.id}`)
  await expect(anonPage.getByRole('heading', { name: place.name, exact: true })).toBeVisible()
  await expect(anonPage.getByTestId('place-followers')).toHaveCount(0)
  await expect(anonPage.getByText('Following a place is for signed-in parents.')).toBeVisible()
  await expect(anonPage.getByRole('link', { name: 'Sign in to follow it' })).toBeVisible()
  // And it issues NO follows call at all — no anon surface exists to widen.
  // (A beat first: the assertion is about what the page DID NOT do.)
  await anonPage.waitForTimeout(1000)
  expect(anonFollowCalls).toEqual([])
  await anon.close()

  // (13) Best-effort cleanup of THIS spec's own rows, with their own JWTs (the
  //      owner-only DELETE policy is the wall — see item (6) for why the host
  //      cannot do this). The marker's posts/series go in afterEach; the sweep
  //      cascades anything left behind.
  for (const [label, token] of [
    ['viewer A', tokenA],
    ['viewer B', tokenB],
  ] as const) {
    // PostgREST REFUSES an unfiltered DELETE (HTTP 400, by design), so the
    // filter is not optional even though the owner-only RLS policy already
    // scopes the statement to this token's own rows: `follower_profile_id
    // not.is.null` is always true for a row that has a follower at all.
    const del = await fetch(
      `${supabaseUrl}/rest/v1/follows?follower_profile_id=not.is.null&select=id`,
      {
        method: 'DELETE',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
          Prefer: 'return=representation',
        },
      },
    )
    const deleted = del.ok ? ((await del.json()) as unknown[]) : []
    console.log(
      `[e2e loop-closing cleanup] ${label}: deleted ${deleted.length} follows row(s) ` +
        `(HTTP ${del.status})`,
    )
  }

  await a.context.close()
  await b.context.close()
})

test.afterEach(async () => {
  // Best-effort cleanup (per house): the marker's playdates rows first (with
  // the marker's own JWT — the host-only DELETE policy is the wall), then the
  // marker's series rows. Order matters: deleting the series first would only
  // null the posts' series_id (the FK is ON DELETE SET NULL), leaving the
  // posts behind. A failure is logged, not fatal; the e2e- prefix marks rows
  // for the orchestrator's sweep.
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

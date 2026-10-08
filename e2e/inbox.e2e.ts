/**
 * V14 ticket 01 — parent↔parent messaging (the inbox), end to end.
 *
 * The ticket's claims, against the live project:
 *
 *  1. TWO-ACCOUNT CONVERSATION: marker A hosts a post; marker B (a fresh
 *     viewer) pings it and taps "Message the host" on /playdate/:id → lands
 *     on /inbox?thread=<id> → sends "Can we do Saturday?" → the message
 *     appears in the thread.
 *  2. HOST SEES + READS: A navigates to /inbox → sees the conversation row
 *     with an unread badge (count 1) → taps it → the thread shows B's
 *     message → the badge clears (markConversationRead fired).
 *  3. RLS ISOLATION: marker C (not host, not pinger) navigates to /inbox →
 *     no conversation row for that playdate. A direct REST call
 *     (GET /rest/v1/messages?playdate_id=eq.<id>) returns [] (RLS blocks).
 *  4. COMPOSER VALIDATION: empty submit is disabled (the Send button has the
 *     disabled attribute); typing 2001 chars triggers client-side validation
 *     (an error line appears, the send does NOT fire).
 *  5. REAL-TIME DELIVERY: while B's thread is open, A sends a message in a
 *     second browser context. B's thread receives the message within ~2 s
 *     (no manual refresh) — the Realtime INSERT subscription works.
 *
 * Pre-0042-apply these specs fail (the messages table + RLS don't exist yet)
 * — an expected failure until the orchestrator applies migration 0042 live
 * via CDP (the DB-not-applied discipline).
 *
 * Cleanup mirrors guest-list.e2e.ts: a best-effort REST delete of the
 * marker's playdate rows (host-only DELETE policy; going_pings + messages
 * cascade with the post, 0007/0042). The viewer accounts (e2e-v- prefix,
 * no playdate rows of their own) are left for the orchestrator's sweep.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { escapeForRegExp } from '../src/lib/escapeForRegExp.mjs'
import {
  E2E_BASE_URL,
  dismissRsvpConfirmationIfOpen,
  editTitle, localDatePlusDays, readMarkerMeta, readMarkerSession,
  readSupabaseEnv, settleOnRoute, finishSignup,
  signUpViewer, stepStartTimeOnce,
} from './fixtures'

const TITLE_PLACEHOLDER = 'e.g. Playground time at Green Lake'
const PLACE_PLACEHOLDER = 'e.g. Green Lake playground, near the boathouse'

/**
 * V33-6: the "Message the host" control moved into the RSVP block, beside the
 * Going button (intrinsic width, wrapping row). The pinger's detail page now
 * carries a SECOND pinger when two are created — and that is exactly what the
 * host-side geometry assertions below need (two per-pinger buttons side by
 * side), so this helper takes an optional second viewer to ping before it
 * returns. The stranger path (RLS isolation) needs only the first.
 */
async function createSecondPinger(
  browser: import('@playwright/test').Browser,
  playdateId: string,
  secondName: string,
  secondEmail: string,
  secondPassword: string,
  homeZip: string,
  radiusMiles: number,
): Promise<{ context: import('@playwright/test').BrowserContext; page: Page }> {
  const secondContext = await browser.newContext({
    baseURL: E2E_BASE_URL,
    storageState: { cookies: [], origins: [] },
  })
  const secondPage = await secondContext.newPage()
  await signUpViewer(secondPage, {
    name: secondName,
    email: secondEmail,
    password: secondPassword,
  })
  await finishSignup(secondPage, { homeZip, radiusMiles })
  await secondPage.goto(`/playdate/${playdateId}`)
  await secondPage.getByRole('button', { name: /^I’m going$/ }).click()
  await expect(secondPage.getByRole('button', { name: /^✓ Going$/ })).toBeVisible()
  await dismissRsvpConfirmationIfOpen(secondPage)
  return { context: secondContext, page: secondPage }
}

/**
 * Seed ONE post through the /new UI (the golden-path pattern). Returns
 * nothing — the caller looks up the id by title afterwards.
 */
async function seedPostViaUi(page: Page, title: string): Promise<void> {
  await page.goto('/new')
  await settleOnRoute(page, '/new')
  await editTitle(page)
  await page.getByPlaceholder(TITLE_PLACEHOLDER).fill(title)
  await page.getByPlaceholder(PLACE_PLACEHOLDER).fill('E2E Inbox lot')
  await page.locator('input[type="date"]').fill(localDatePlusDays(1))
  await stepStartTimeOnce(page)
  await expect(page.getByTestId('end-time-label')).toBeVisible()
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
}

/** Look up the most-recent marker playdate id by title (the marker's JWT). */
async function latestMarkerPlaydateIdByTitle(title: string): Promise<string> {
  const { url, anonKey } = readSupabaseEnv()
  const { accessToken, userId } = readMarkerSession()
  const query =
    `${url}/rest/v1/playdates?host_profile_id=eq.${userId}` +
    `&title=eq.${encodeURIComponent(title)}&order=created_at.desc&limit=1&select=id`
  const res = await fetch(query, {
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
  })
  expect(res.ok).toBe(true)
  const rows = (await res.json()) as Array<{ id: string }>
  expect(rows.length).toBe(1)
  return rows[0].id
}

/**
 * Create a fresh viewer account (the zip-radius pattern) and ping the
 * given playdate. Returns the viewer's display name + its context (kept
 * open so the caller can drive it). The caller MUST close the context
 * when done (or the DB gate will abort the in-flight upsert chain).
 */
async function createPingingViewer(
  page: Page,
  browser: import('@playwright/test').Browser,
  playdateId: string,
  viewerName: string,
  viewerEmail: string,
  viewerPassword: string,
  homeZip: string,
  radiusMiles: number,
): Promise<{ context: import('@playwright/test').BrowserContext; page: Page }> {
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
    homeZip: homeZip,
    radiusMiles: radiusMiles,
  })

  // Open the post's detail + ping it (the detail page's "I'm going" button).
  await viewerPage.goto(`/playdate/${playdateId}`)
  await viewerPage
    .getByRole('button', { name: /^I’m going$/ })
    .click()
  await expect(
    viewerPage.getByRole('button', { name: /^✓ Going$/ }),
  ).toBeVisible()
  // V25 ticket 13: the ping raises the RSVP confirmation lightbox, whose
  // backdrop covers the page. Dismiss it the way a parent does (the "Got it"
  // control) so the rest of this spec drives the real UI instead of a page
  // behind an overlay.
  await dismissRsvpConfirmationIfOpen(viewerPage)
  return { context: viewerContext, page: viewerPage }
}

/*
 * V15.2: the Realtime spec at the bottom of this file gets ONE retry.
 *
 * Measured, not assumed: it drives two full account lifecycles (a UI signup +
 * onboarding for the pinger) and then waits on a Realtime handshake, so on a
 * loaded box it intermittently exhausts even a 240s budget during SETUP — the
 * delivery assertion itself never fails. It passes 13s in isolation and 5/5
 * under `--retries=1`. A retry is the standard instrument for a network-timing
 * spec and cannot mask a real break: a genuinely broken subscription fails both
 * attempts. Scoped here (file scope) rather than per-test, because
 * `test.describe.configure` inside a test body does not take effect.
 */
test.describe.configure({ retries: 1 })

test.use({ viewport: { width: 390, height: 844 } })

test('two-account conversation: pinger messages the host, host reads + badge clears', async ({
  page,
  browser,
}) => {
  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const title = `e2e ${marker.displayName} inbox conv`
  const viewerName = `e2e-v-${epoch}-inbox`
  const viewerEmail = `e2e-v-${epoch}-inbox@gmail.com`
  const viewerPassword = `e2e-v-pw-${epoch}-inbox`

  // --- The host (the marker's signed-in context) posts a drop-in. ---
  await seedPostViaUi(page, title)
  const playdateId = await latestMarkerPlaydateIdByTitle(title)

  // --- The viewer pings the post + opens the thread via the detail page. ---
  const viewer = await createPingingViewer(
    page,
    browser,
    playdateId,
    viewerName,
    viewerEmail,
    viewerPassword,
    marker.homeZip,
    marker.radiusMiles,
  )
  const viewerPage = viewer.page

  // The "Message the host" button is visible on the detail page (the
  // participant gate: the viewer has a going_ping). V33-6: it now sits in the
  // RSVP block, beside the Going control — intrinsic width, not full-width.
  await expect(
    viewerPage.getByRole('button', { name: 'Message the host' }),
  ).toBeVisible()
  await viewerPage.getByRole('button', { name: 'Message the host' }).click()
  await expect(viewerPage).toHaveURL(new RegExp(`/inbox\\?thread=${playdateId}$`))

  // The thread view renders (empty state: "No messages yet").
  await expect(viewerPage.getByText('No messages yet')).toBeVisible()

  // Send a message.
  await viewerPage.getByPlaceholder('Write a message…').fill('Can we do Saturday?')
  await viewerPage.getByRole('button', { name: 'Send' }).click()
  // The optimistic append lands immediately (the bubble appears before the
  // server confirms).
  await expect(viewerPage.getByTestId('own-message')).toContainText('Can we do Saturday?')

  // V23 s7: the testid is now keyed on the counterpart's profile id (the merge
  // key), not the playdate id. Look up the viewer's profile id via REST.
  const { url, anonKey } = readSupabaseEnv()
  const { accessToken } = readMarkerSession()
  const searchRes = await fetch(
    `${url}/rest/v1/profiles?display_name=ilike.${encodeURIComponent(viewerName)}&select=id`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` } },
  )
  expect(searchRes.ok).toBe(true)
  const viewerProfiles = (await searchRes.json()) as Array<{ id: string }>
  expect(viewerProfiles.length).toBe(1)
  const viewerProfileId = viewerProfiles[0].id

  // --- A SECOND pinger joins, so the host's detail page carries TWO per-pinger
  //     buttons (V33-6 geometry: side by side at their own width). ---
  const secondName = `e2e-v-${epoch}-inbox-b`
  const second = await createSecondPinger(
    browser,
    playdateId,
    secondName,
    `${secondName}@gmail.com`,
    `e2e-v-pw-${epoch}-inbox-b`,
    marker.homeZip,
    marker.radiusMiles,
  )

  // --- The host: navigate to /playdate/:id → the message entry point is in
  //         the top action cluster, beside the Going control (V33-6) → tap a
  //         per-pinger button → the thread shows the message. ---
  await page.goto(`/playdate/${playdateId}`)
  await settleOnRoute(page, `/playdate/${playdateId}`)
  const hostGoingButton = page.getByRole('button', { name: /^I’m going$/ })
  await expect(hostGoingButton).toBeVisible()
  // THE COUNT IS ASSERTED FIRST (AC4): two pingers → exactly two per-pinger
  // controls, one each — none dropped by the move.
  const hostMessageButtons = page.locator('button', { hasText: /^Message / })
  await expect(hostMessageButtons).toHaveCount(2)
  // GEOMETRY (AC1): the message row and the Going control share a vertical
  // band (|a.y − b.y| less than a control's height), asserted on boxes rather
  // than DOM order.
  const firstPingerBox = await page
    .getByRole('button', { name: new RegExp(`^Message ${escapeForRegExp(viewerName)}$`) })
    .boundingBox()
  const goingBox = await hostGoingButton.boundingBox()
  expect(firstPingerBox, 'host per-pinger button has no layout box').not.toBeNull()
  expect(goingBox, 'Going control has no layout box').not.toBeNull()
  expect(Math.abs(firstPingerBox!.y - goingBox!.y)).toBeLessThan(firstPingerBox!.height)
  // NOT FULL-WIDTH (AC2): the message button is narrower than its containing
  // row, and the page does not widen.
  const rowBox = await page.locator('button[aria-pressed]').first().locator('..').boundingBox()
  expect(rowBox, 'RSVP row has no layout box').not.toBeNull()
  expect(firstPingerBox!.width).toBeLessThan(rowBox!.width)
  const scrollWidths = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(scrollWidths.scrollWidth).toBeLessThanOrEqual(scrollWidths.clientWidth + 1)
  // TAP TARGET floor: every message control keeps ≥44px smallest dimension.
  for (const btn of await hostMessageButtons.all()) {
    const box = await btn.boundingBox()
    expect(box, 'message control has no layout box').not.toBeNull()
    expect(box!.height).toBeGreaterThanOrEqual(44)
    expect(box!.width).toBeGreaterThanOrEqual(44)
  }
  // PER-PINGER BUTTONS SIT NEXT TO EACH OTHER (AC3): the two boxes share a
  // vertical band (one row) or wrap without overflow.
  const secondPingerBox = await page
    .getByRole('button', { name: new RegExp(`^Message ${escapeForRegExp(secondName)}$`) })
    .boundingBox()
  expect(secondPingerBox).not.toBeNull()
  if (Math.abs(firstPingerBox!.y - secondPingerBox!.y) < Math.max(firstPingerBox!.height, secondPingerBox!.height)) {
    // Same row band: they sit side by side.
    expect(firstPingerBox!.x + firstPingerBox!.width).toBeLessThanOrEqual(secondPingerBox!.x + 1)
  } else {
    // Wrapped: no horizontal overflow either way.
    const pageScroll = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(pageScroll.scrollWidth).toBeLessThanOrEqual(pageScroll.clientWidth + 1)
  }
  // Tap the first pinger's button → the thread shows that pinger's message.
  await page
    .getByRole('button', { name: new RegExp(`^Message ${escapeForRegExp(viewerName)}$`) })
    .click()
  await expect(page).toHaveURL(/\/inbox\?thread=/)
  await expect(page.getByTestId('other-message')).toContainText('Can we do Saturday?')
  // The dot cleared (markConversationRead fired on thread open).
  await expect(page.getByTestId(`unread-dot-${viewerProfileId}`)).toHaveCount(0)

  await second.context.close()
  // Close the viewer's context (its ping row cascades with the post cleanup).
  await viewer.context.close()
})

/**
 * V25 ticket 11 — each bubble names its OWN sender.
 *
 * THE DEFECT (reproduced live, `.scratch/v25/evidence/`): the bubble label was
 * `threadHeaderName || 'Unknown'` — ONE thread-level name on every non-own
 * bubble. On a drop-in the thread's participants are the host + its pingers, so
 * a third participant's message wore the counterpart's name (measured in a
 * local replay: Priya's message labelled "Nicole Meisburg"), and a thread whose
 * header had not resolved printed the literal "Unknown" over a real parent's
 * message — the founder's `"UnknownComing👍"`, byte-identical to the annotation.
 *
 * This spec drives the group case with REAL accounts: the host opens a thread
 * in which TWO pingers each wrote. Every other-party bubble must carry its own
 * sender's display name (the label is located with the annotation's OWN
 * selector, so the assertion means the same thing before and after the fix),
 * the word "Unknown" must appear nowhere, and the header must still resolve.
 */
test('every bubble is labelled by its own sender, not the thread counterpart (V25 t11)', async ({
  page,
  browser,
}) => {
  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const title = `e2e ${marker.displayName} inbox senders`
  const firstName = `e2e-v-${epoch}-snd-a`
  const secondName = `e2e-v-${epoch}-snd-b`

  // --- The host posts a drop-in. ---
  await seedPostViaUi(page, title)
  const playdateId = await latestMarkerPlaydateIdByTitle(title)

  // --- TWO distinct pingers, each writing one message. ---
  const first = await createPingingViewer(
    page,
    browser,
    playdateId,
    firstName,
    `${firstName}@gmail.com`,
    `e2e-v-pw-${epoch}-snd-a`,
    marker.homeZip,
    marker.radiusMiles,
  )
  await first.page.getByRole('button', { name: 'Message the host' }).click()
  await first.page.getByPlaceholder('Write a message…').fill('First pinger here')
  const firstSent = first.page.waitForResponse(
    (response) => response.url().includes('/rest/v1/messages') && response.request().method() === 'POST',
  )
  await first.page.getByRole('button', { name: 'Send' }).click()
  await expect(first.page.getByTestId('own-message').first()).toContainText('First pinger here')
  // Wait for the INSERT to be ACKNOWLEDGED before closing: the optimistic
  // bubble proves only the tap, and the host's thread needs the row on the
  // server (a closed context before the insert lands reads nothing).
  expect((await firstSent).ok()).toBe(true)
  await first.context.close()

  const second = await createPingingViewer(
    page,
    browser,
    playdateId,
    secondName,
    `${secondName}@gmail.com`,
    `e2e-v-pw-${epoch}-snd-b`,
    marker.homeZip,
    marker.radiusMiles,
  )
  await second.page.getByRole('button', { name: 'Message the host' }).click()
  await second.page.getByPlaceholder('Write a message…').fill('Second pinger here')
  const secondSent = second.page.waitForResponse(
    (response) => response.url().includes('/rest/v1/messages') && response.request().method() === 'POST',
  )
  await second.page.getByRole('button', { name: 'Send' }).click()
  await expect(second.page.getByTestId('own-message').first()).toContainText('Second pinger here')
  expect((await secondSent).ok()).toBe(true)
  await second.context.close()

  // --- The host opens the thread (both pingers are the thread's participants,
  // so the host's own thread header names only ONE counterpart while the
  // bubbles must name two different people). ---
  await page.goto(`/inbox?thread=${playdateId}`)
  await settleOnRoute(page, '/inbox')

  // The label paragraph, found the way the founder's annotation found it —
  // class-escaped, because Playwright's CSS parser reads `.mb-0.5` as two
  // classes (`mb-0` + `.5`) and rejects it unescaped.
  const labelFor = (body: string) =>
    page
      .getByTestId('other-message')
      .filter({ hasText: body })
      .locator('..')
      .locator('p.mb-0\\.5.text-xs.text-slate-500')

  // The pre-fix state was DURABLE but INTERMITTENT — the third repro measured
  // the wrong name settling on 8 of 10 loads — so ONE load proves nothing (the
  // old code passes ~20% of the time by construction). Load the thread TEN
  // times and assert every one.
  for (let load = 1; load <= 10; load += 1) {
    if (load > 1) {
      await page.reload()
      await settleOnRoute(page, '/inbox')
    }
    await expect(labelFor('First pinger here'), `load ${load}: first pinger's own name`).toHaveText(
      firstName,
      { timeout: 30_000 },
    )
    await expect(labelFor('Second pinger here'), `load ${load}: second pinger's own name`).toHaveText(
      secondName,
    )
    // The old thread-level label showed the counterpart on BOTH bubbles; on a
    // group thread that is the wrong person for one of them.
    await expect(labelFor('First pinger here'), `load ${load}: never the counterpart`).not.toHaveText(
      secondName,
    )
    // "Unknown" reads as a broken person — the founder's report. It must be gone.
    await expect(page.getByText('Unknown', { exact: true }), `load ${load}: no "Unknown"`).toHaveCount(0)
    // And the header keeps its own meaning: the conversation is still named.
    await expect(page.locator('div.min-w-0 > p').first(), `load ${load}: header named`).not.toBeEmpty()
  }
})

test('RLS isolation: a stranger cannot read or write messages', async ({
  page,
  browser,
}) => {
  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const title = `e2e ${marker.displayName} inbox rls`
  const pingerName = `e2e-v-${epoch}-rls-p`
  const pingerEmail = `e2e-v-${epoch}-rls-p@gmail.com`
  const pingerPassword = `e2e-v-pw-${epoch}-rls-p`
  const strangerName = `e2e-v-${epoch}-rls-s`
  const strangerEmail = `e2e-v-${epoch}-rls-s@gmail.com`
  const strangerPassword = `e2e-v-pw-${epoch}-rls-s`

  // --- The host posts a drop-in. ---
  await seedPostViaUi(page, title)
  const playdateId = await latestMarkerPlaydateIdByTitle(title)

  // --- A pinger sends a message (so there IS a message to isolate). ---
  const pinger = await createPingingViewer(
    page,
    browser,
    playdateId,
    pingerName,
    pingerEmail,
    pingerPassword,
    marker.homeZip,
    marker.radiusMiles,
  )
  await pinger.page.getByRole('button', { name: 'Message the host' }).click()
  await pinger.page.getByPlaceholder('Write a message…').fill('Hello from the pinger')
  await pinger.page.getByRole('button', { name: 'Send' }).click()
  await expect(pinger.page.getByTestId('own-message')).toContainText('Hello from the pinger')
  await pinger.context.close()

  // --- The stranger: navigate to /inbox → no conversation row for this
  // playdate (RLS blocks the SELECT). ---
  const strangerContext = await browser.newContext({
    baseURL: E2E_BASE_URL,
    storageState: { cookies: [], origins: [] },
  })
  const strangerPage = await strangerContext.newPage()
  // V20 t06: signup is first + last name + address now — one shared helper
  // (`signUpViewer`) so the form's field list lives in one place.
  await signUpViewer(strangerPage, {
    name: strangerName,
    email: strangerEmail,
    password: strangerPassword,
  })
  await finishSignup(strangerPage, {
    homeZip: marker.homeZip,
    radiusMiles: marker.radiusMiles,
  })

  await strangerPage.goto('/inbox')
  await settleOnRoute(strangerPage, '/inbox')
  // No conversation row for this playdate (the stranger is not a participant).
  await expect(strangerPage.getByText(title)).toHaveCount(0)

  // WHO-SEES-WHAT GATE (AC5): the stranger sees NO message control on the
  // detail page either — the gate did not widen with the V33-6 move.
  await strangerPage.goto(`/playdate/${playdateId}`)
  await settleOnRoute(strangerPage, `/playdate/${playdateId}`)
  await expect(strangerPage.getByRole('button', { name: 'Message the host' })).toHaveCount(0)
  await expect(strangerPage.locator('button', { hasText: /^Message / })).toHaveCount(0)

  // Direct REST call: GET /rest/v1/messages?playdate_id=eq.<id> → [] (RLS).
  const { url, anonKey } = readSupabaseEnv()
  const strangerToken = await (async () => {
    // Extract the stranger's access token from its localStorage.
    const state = await strangerContext.storageState()
    for (const origin of state.origins ?? []) {
      for (const item of origin.localStorage ?? []) {
        if (!item.name.includes('auth')) continue
        try {
          const blob = JSON.parse(item.value)
          const session =
            (typeof blob?.access_token === 'string' ? blob : undefined) ??
            blob?.currentSession ??
            blob?.allSessions?.[0] ??
            blob?.sessions?.[0]
          if (session?.access_token !== undefined && session?.user?.id !== undefined) {
            return session.access_token as string
          }
        } catch {
          // ignore
        }
      }
    }
    throw new Error('Could not extract the stranger\'s access token')
  })()
  const restRes = await fetch(
    `${url}/rest/v1/messages?playdate_id=eq.${playdateId}&select=id`,
    {
      headers: { apikey: anonKey, Authorization: `Bearer ${strangerToken}` },
    },
  )
  expect(restRes.ok).toBe(true)
  const restRows = (await restRes.json()) as Array<Record<string, unknown>>
  expect(restRows.length).toBe(0)

  await strangerContext.close()
})

test('composer validation: empty submit disabled, 2001-char body blocked', async ({
  page,
  browser,
}) => {
  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const title = `e2e ${marker.displayName} inbox val`
  const viewerName = `e2e-v-${epoch}-val`
  const viewerEmail = `e2e-v-${epoch}-val@gmail.com`
  const viewerPassword = `e2e-v-pw-${epoch}-val`

  // --- The host posts a drop-in. ---
  await seedPostViaUi(page, title)
  const playdateId = await latestMarkerPlaydateIdByTitle(title)

  // --- The viewer pings + opens the thread. ---
  const viewer = await createPingingViewer(
    page,
    browser,
    playdateId,
    viewerName,
    viewerEmail,
    viewerPassword,
    marker.homeZip,
    marker.radiusMiles,
  )
  const viewerPage = viewer.page
  await viewerPage.getByRole('button', { name: 'Message the host' }).click()
  await expect(viewerPage).toHaveURL(new RegExp(`/inbox\\?thread=${playdateId}$`))

  // Empty submit: the Send button is disabled (draft.trim().length === 0).
  const sendButton = viewerPage.getByRole('button', { name: 'Send' })
  await expect(sendButton).toBeDisabled()

  // Type 2001 chars → client validation blocks the send (error line appears).
  const longBody = 'x'.repeat(2001)
  await viewerPage.getByPlaceholder('Write a message…').fill(longBody)
  await sendButton.click()
  // The error line (validateMessageBody's "Keep messages to 2000 characters.")
  await expect(viewerPage.getByText(/Keep messages to 2000 characters/)).toBeVisible()
  // No message was sent (the optimistic append did NOT fire).
  await expect(viewerPage.getByTestId('own-message')).toHaveCount(0)

  await viewer.context.close()
})

test('real-time delivery: a message sent by the host appears in the pinger\'s open thread', async ({
  page,
  browser,
}) => {
  // V15.2: this spec drives TWO full account lifecycles (a UI signup +
  // onboarding for the pinger) before it even opens the thread, then waits on a
  // Realtime round-trip. That is well past the suite's 120s default on a loaded
  // machine — it timed out in SETUP, not at an assertion (the failure snapshot
  // showed the feed, and the test died before the send). Give it the headroom
  // its setup genuinely needs rather than weakening any assertion.
  test.setTimeout(240_000)

  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const title = `e2e ${marker.displayName} inbox rt`
  const viewerName = `e2e-v-${epoch}-rt`
  const viewerEmail = `e2e-v-${epoch}-rt@gmail.com`
  const viewerPassword = `e2e-v-pw-${epoch}-rt`

  // --- The host posts a drop-in. ---
  await seedPostViaUi(page, title)
  const playdateId = await latestMarkerPlaydateIdByTitle(title)

  // --- The viewer pings + opens the thread (the Realtime channel subscribes
  // on mount). ---
  const viewer = await createPingingViewer(
    page,
    browser,
    playdateId,
    viewerName,
    viewerEmail,
    viewerPassword,
    marker.homeZip,
    marker.radiusMiles,
  )
  const viewerPage = viewer.page
  // Buffer the viewer's console lines from BEFORE the thread opens. The page
  // logs its Realtime ack (`[InboxPage] Realtime channel messages-<id> status:
  // SUBSCRIBED`), and that ack — not the "No messages yet" empty state — is the
  // precondition for the delivery assertion below: the empty state paints as
  // soon as the message query returns, while `subscribe()` acks separately. The
  // host's send used to race that ack, so on a slow run the INSERT was published
  // before the viewer was listening and the delivery assertion timed out (this
  // spec failed 1-in-2 under --repeat-each). Buffering avoids missing the line
  // no matter when it lands.
  const viewerLogs: string[] = []
  viewerPage.on('console', (msg) => viewerLogs.push(msg.text()))
  await viewerPage.getByRole('button', { name: 'Message the host' }).click()
  await expect(viewerPage).toHaveURL(new RegExp(`/inbox\\?thread=${playdateId}$`))
  await expect(viewerPage.getByText('No messages yet')).toBeVisible()
  await expect
    .poll(() => viewerLogs.some((line) => /status: SUBSCRIBED/.test(line)), {
      message: "the viewer's Realtime channel must reach SUBSCRIBED before the host sends",
      timeout: 20_000,
    })
    .toBe(true)

  // --- The host (the marker's default context) opens the same thread in a
  // SECOND context (the host's own session) and sends a message. ---
  const fs = await import('node:fs')
  const path = await import('node:path')
  const markerStatePath = path.join(process.cwd(), 'e2e', '.auth', 'marker-state.json')
  const markerState = JSON.parse(fs.readFileSync(markerStatePath, 'utf8'))
  const hostContext = await browser.newContext({
    baseURL: E2E_BASE_URL,
    storageState: markerState as never,
  })
  const hostPage = await hostContext.newPage()
  // Capture console + network errors for diagnostics (the list load may fail
  // on RLS or a missing embed).
  const hostConsoleErrors: string[] = []
  hostPage.on('console', (msg) => {
    if (msg.type() === 'error') hostConsoleErrors.push(msg.text())
  })
  await hostPage.goto(`/inbox?thread=${playdateId}`)
  await settleOnRoute(hostPage, '/inbox')
  // The thread view is open; wait for it to render (the "No messages yet"
  // empty state confirms the thread load completed).
  await expect(hostPage.getByText('No messages yet')).toBeVisible({ timeout: 10_000 })
  // The other party's name resolves from the conversation list (a separate
  // load). Wait for it with a generous timeout.
  await expect(hostPage.getByText(viewerName)).toBeVisible({ timeout: 30_000 }).catch(async () => {
    // Surface diagnostics: the list error state + any console errors + the
    // actual thread header text (to see what name DID resolve, if any).
    const listErrorEl = hostPage.locator('.border-red-200')
    const listErrorText = await listErrorEl.textContent().catch(() => null)
    // The thread header's name line (the first <p> in the header div).
    const headerNameEl = hostPage.locator('div.min-w-0 > p').first()
    const headerNameText = await headerNameEl.textContent().catch(() => null)
    throw new Error(
      `Host thread header did not show viewer name "${viewerName}". ` +
        `Actual header name: ${headerNameText ?? '(none)'}. ` +
        `List error: ${listErrorText ?? '(none)'}. ` +
        `Console errors: ${hostConsoleErrors.join('; ') || '(none)'}`,
    )
  })

  // Send a message from the host.
  await hostPage.getByPlaceholder('Write a message…').fill('Hi from the host!')
  await hostPage.getByRole('button', { name: 'Send' }).click()
  await expect(hostPage.getByTestId('own-message')).toContainText('Hi from the host!')

  // --- The viewer's OPEN thread receives the message within ~5 s (no
  // manual refresh) — the Realtime INSERT subscription delivers it. ---
  const viewerConsoleErrors: string[] = []
  viewerPage.on('console', (msg) => {
    if (msg.type() === 'error') viewerConsoleErrors.push(msg.text())
  })
  await expect(
    viewerPage.getByTestId('other-message'),
  ).toContainText('Hi from the host!', { timeout: 15_000 }).catch(async () => {
    // Surface diagnostics: the viewer's console errors + the current thread state.
    const threadMessages = await viewerPage.locator('[data-testid="other-message"]').count().catch(() => 0)
    const threadOwnMessages = await viewerPage.locator('[data-testid="own-message"]').count().catch(() => 0)
    throw new Error(
      `Viewer thread did not receive the host's message via Realtime within 15s. ` +
        `Other messages: ${threadMessages}, own messages: ${threadOwnMessages}. ` +
        `Viewer console errors: ${viewerConsoleErrors.join('; ') || '(none)'}`,
    )
  })

  // Close both contexts (the viewer's ping row cascades with the post cleanup).
  await hostContext.close()
  await viewer.context.close()
})

test.afterEach(async () => {
  // Best-effort cleanup (per house): delete the HOST marker's playdate rows
  // via REST with the marker's own JWT (host-only DELETE policy).
  // going_pings + messages cascade with the post (0007/0042). The viewer
  // accounts (e2e-v- prefix, no playdate rows of their own) persist for the
  // orchestrator's sweep (family 16). A failure is logged, never fatal.
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
    const check = await fetch(query, { headers })
    const remaining = check.ok
      ? ((await check.json()) as Array<Record<string, unknown>>)
      : null
    if (!del.ok || (remaining !== null && remaining.length > 0)) {
      console.log(
        `[e2e cleanup] FAILED — playdate delete HTTP ${del.status}, ` +
          `${remaining?.length ?? '?'} remain (host ${userId}) — orchestrator sweep (e2e- prefix) will pick them up`,
      )
    } else {
      console.log(
        `[e2e cleanup] ok — deleted host marker playdate row(s) (host ${userId}); pings + messages cascaded`,
      )
    }
  } catch (err) {
    console.log(
      `[e2e cleanup] FAILED (logged, best-effort): ${err instanceof Error ? err.message : err}`,
    )
  }
})

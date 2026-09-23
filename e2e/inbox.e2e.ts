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
import {
  editTitle, localDatePlusDays, readMarkerMeta, readMarkerSession,
  readSupabaseEnv, settleOnRoute, signUpViewer, stepStartTimeOnce,
} from './fixtures'

const TITLE_PLACEHOLDER = 'e.g. Playground time at Green Lake'
const PLACE_PLACEHOLDER = 'e.g. Green Lake playground, near the boathouse'

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
    baseURL: 'http://localhost:4173',
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
  await viewerPage.getByRole('heading', { name: 'Set your location' }).waitFor()
  await viewerPage.getByPlaceholder('e.g. 98107').fill(homeZip)
  await viewerPage
    .locator('select')
    .first()
    .selectOption({ label: `${radiusMiles} miles` })
  await viewerPage.getByRole('button', { name: /^Continue/ }).click()
  await viewerPage.getByRole('heading', { name: 'Near you' }).waitFor()

  // Open the post's detail + ping it (the detail page's "I'm going" button).
  await viewerPage.goto(`/playdate/${playdateId}`)
  await viewerPage
    .getByRole('button', { name: /^I’m going$/ })
    .click()
  await expect(
    viewerPage.getByRole('button', { name: /^✓ Going$/ }),
  ).toBeVisible()
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
  // participant gate: the viewer has a going_ping).
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

  // --- The host: navigate to /inbox → see the conversation row with an
  // unread dot + badge (count 1) → tap it → the thread shows the message → the
  // dot clears (markConversationRead fired). ---
  await page.goto('/inbox')
  await settleOnRoute(page, '/inbox')
  const conversationRow = page.getByRole('button').filter({ hasText: viewerName })
  await expect(conversationRow).toBeVisible()
  // The unread dot + badge (count 1) are visible.
  await expect(page.getByTestId(`unread-dot-${viewerProfileId}`)).toBeVisible()
  await expect(page.getByTestId(`unread-badge-${viewerProfileId}`)).toHaveText('1')

  // Tap the conversation → the thread view shows the message.
  await conversationRow.click()
  await expect(page).toHaveURL(/\/inbox\?thread=/)
  await expect(page.getByTestId('other-message')).toContainText('Can we do Saturday?')

  // The dot cleared (markConversationRead fired on thread open).
  await expect(page.getByTestId(`unread-dot-${viewerProfileId}`)).toHaveCount(0)

  // Close the viewer's context (its ping row cascades with the post cleanup).
  await viewer.context.close()
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
    baseURL: 'http://localhost:4173',
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
  await strangerPage.getByRole('heading', { name: 'Set your location' }).waitFor()
  await strangerPage.getByPlaceholder('e.g. 98107').fill(marker.homeZip)
  await strangerPage
    .locator('select')
    .first()
    .selectOption({ label: `${marker.radiusMiles} miles` })
  await strangerPage.getByRole('button', { name: /^Continue/ }).click()
  await strangerPage.getByRole('heading', { name: 'Near you' }).waitFor()

  await strangerPage.goto('/inbox')
  await settleOnRoute(strangerPage, '/inbox')
  // No conversation row for this playdate (the stranger is not a participant).
  await expect(strangerPage.getByText(title)).toHaveCount(0)

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
    baseURL: 'http://localhost:4173',
    storageState: markerState as { cookies: unknown[]; origins: unknown[] },
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
    { timeout: 15_000 },
  ).toContainText('Hi from the host!').catch(async () => {
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
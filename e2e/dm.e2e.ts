/**
 * V15 ticket 01 — free-form DMs (migration 0043), end to end.
 *
 * The ticket's claims, against the live project:
 *
 *  1. NEW MESSAGE BUTTON: /inbox shows a "+ New message" button. Tapping it
 *     opens the user-search picker. Typing a name searches profiles by
 *     display_name (ILIKE). Selecting a result opens /inbox?dm=<profileId>.
 *  2. DM THREAD: the thread view renders with the other party's name in the
 *     header. Sending a message (playdate_id = NULL) appears as an own-message
 *     bubble immediately (optimistic append).
 *  3. DM CONVERSATION CARD: after sending, navigating back to /inbox shows a
 *     free-form conversation card for the other party (not a playdate-scoped
 *     row). Tapping it re-opens the DM thread.
 *  4. RLS ISOLATION: a stranger who is NOT the sender or recipient cannot
 *     read the DM via REST (GET /rest/v1/messages?playdate_id=is.null returns
 *     [] for them — RLS blocks).
 *
 * Pre-0043-apply these specs fail (message_recipients + message_reactions
 * tables don't exist yet) — an expected failure until the orchestrator
 * applies migration 0043 live via CDP.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  readMarkerMeta, readMarkerSession, readSupabaseEnv, settleOnRoute,
  signUpViewer,
} from './fixtures'

test('new message: search a parent, open DM thread, send a message', async ({
  page,
  browser,
}) => {
  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const viewerName = `e2e-v-${epoch}-dm`
  const viewerEmail = `e2e-v-${epoch}-dm@gmail.com`
  const viewerPassword = `e2e-v-pw-${epoch}-dm`

  // --- Create a fresh viewer account (the one we'll DM). ---
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
  await viewerPage.getByPlaceholder('e.g. 98107').fill(marker.homeZip)
  await viewerPage
    .locator('select')
    .first()
    .selectOption({ label: `${marker.radiusMiles} miles` })
  await viewerPage.getByRole('button', { name: /^Continue/ }).click()
  await viewerPage.getByRole('heading', { name: 'Near you' }).waitFor()

  // Look up the viewer's profile id via REST (the marker's JWT can see all
  // profiles — the search seam uses ILIKE on display_name).
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

  // --- The marker (host) navigates to /inbox → taps "New message". ---
  await page.goto('/inbox')
  await settleOnRoute(page, '/inbox')
  await expect(page.getByTestId('new-message-button')).toBeVisible()
  await page.getByTestId('new-message-button').click()

  // Type the viewer's name → the search results appear.
  await page.getByTestId('dm-search-input').fill(viewerName)
  await expect(page.getByTestId(`dm-result-${viewerProfileId}`)).toBeVisible({ timeout: 5_000 })

  // Tap the result → the DM thread opens.
  await page.getByTestId(`dm-result-${viewerProfileId}`).click()
  await expect(page).toHaveURL(new RegExp(`/inbox\\?dm=${viewerProfileId}$`))

  // The thread view renders (empty state: "No messages yet").
  await expect(page.getByText('No messages yet')).toBeVisible()

  // Send a message.
  await page.getByPlaceholder('Write a message…').fill('Hey! Want to play this weekend?')
  // V15 fix: wait for the send's own POST to be answered before navigating.
  // The optimistic bubble appears on the same frame as the tap, so asserting
  // the bubble alone does NOT prove the write committed — and the /inbox
  // reload below queries the server. Racing that gap left the conversation
  // card missing (the row was still in flight), which read as a UI bug.
  const sendSettled = page.waitForResponse(
    (res) =>
      res.url().includes('/rest/v1/messages') &&
      res.request().method() === 'POST' &&
      res.status() < 400,
  )
  await page.getByRole('button', { name: 'Send' }).click()
  await sendSettled
  await expect(page.getByTestId('own-message')).toContainText('Hey! Want to play this weekend?')

  // Navigate back to /inbox → the free-form conversation card appears.
  await page.goto('/inbox')
  await settleOnRoute(page, '/inbox')
  const dmCard = page.getByTestId(`dm-conversation-${viewerProfileId}`)
  await expect(dmCard).toBeVisible()
  await expect(dmCard).toContainText(viewerName)

  // Tap the card → re-opens the DM thread.
  await dmCard.click()
  await expect(page).toHaveURL(new RegExp(`/inbox\\?dm=${viewerProfileId}$`))
  await expect(page.getByTestId('own-message')).toContainText('Hey! Want to play this weekend?')

  await viewerContext.close()
})

/**
 * V16 t05 — the OTHER door into a DM: the "Message" button on a family's
 * public page (/u/:handle).
 *
 * The two tests above both enter the inbox via /inbox's own "New message"
 * search. That left the profile-page entry point entirely uncovered, even though
 * it is the one a parent uses after looking at a family ("About the parents" ->
 * Message). t05 verified this button already existed and deliberately left it
 * alone; nothing pinned that it still works, so a change to UserPage's action
 * row could have stranded it silently.
 *
 * The button is visitor-only by design: the action row is gated
 * `isOwnProfile ? null : ...`, so it must NOT appear on your own page. Both
 * halves are asserted here.
 */
test('the Message button on a family page opens the DM thread (and is absent on your own)', async ({
  page,
  browser,
}) => {
  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const viewerName = `e2e-v-${epoch}-dm-profile`
  const viewerEmail = `e2e-v-${epoch}-dm-profile@gmail.com`
  const viewerPassword = `e2e-v-pw-${epoch}-dm-profile`

  // --- Create the family whose page we will visit. ---
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
  await viewerPage.getByPlaceholder('e.g. 98107').fill(marker.homeZip)
  await viewerPage
    .locator('select')
    .first()
    .selectOption({ label: `${marker.radiusMiles} miles` })
  await viewerPage.getByRole('button', { name: /^Continue/ }).click()
  await viewerPage.getByRole('heading', { name: 'Near you' }).waitFor()

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

  // --- The marker visits that family's public page. ---
  await page.goto(`/u/${encodeURIComponent(viewerName)}`)
  await settleOnRoute(page, `/u/${encodeURIComponent(viewerName)}`)

  const messageButton = page.getByTestId('message-profile')
  await expect(messageButton).toBeVisible()
  await messageButton.click()

  // It lands on the DM thread for THAT family — the deep link the inbox owns.
  await expect(page).toHaveURL(new RegExp(`/inbox\\?dm=${viewerProfileId}$`))
  await expect(page.getByText('No messages yet')).toBeVisible()

  // --- The button must NOT appear on your OWN page (you cannot message
  // yourself): the action row is gated on isOwnProfile. ---
  await page.goto(`/u/${encodeURIComponent(marker.displayName)}`)
  await settleOnRoute(page, `/u/${encodeURIComponent(marker.displayName)}`)
  await expect(
    page.getByTestId('message-profile'),
    'the Message button must be absent on your own page',
  ).toHaveCount(0)
})

test('RLS isolation: a stranger cannot read a free-form DM', async ({
  page,
  browser,
}) => {
  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const viewerName = `e2e-v-${epoch}-dm-rls`
  const viewerEmail = `e2e-v-${epoch}-dm-rls@gmail.com`
  const viewerPassword = `e2e-v-pw-${epoch}-dm-rls`
  const strangerName = `e2e-v-${epoch}-dm-stranger`
  const strangerEmail = `e2e-v-${epoch}-dm-stranger@gmail.com`
  const strangerPassword = `e2e-v-pw-${epoch}-dm-stranger`

  // --- Create the viewer (DM target). ---
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
  await viewerPage.getByPlaceholder('e.g. 98107').fill(marker.homeZip)
  await viewerPage
    .locator('select')
    .first()
    .selectOption({ label: `${marker.radiusMiles} miles` })
  await viewerPage.getByRole('button', { name: /^Continue/ }).click()
  await viewerPage.getByRole('heading', { name: 'Near you' }).waitFor()

  // Look up the viewer's profile id.
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

  // --- The marker sends a DM to the viewer. ---
  await page.goto(`/inbox?dm=${viewerProfileId}`)
  await settleOnRoute(page, '/inbox')
  await expect(page.getByText('No messages yet')).toBeVisible()
  await page.getByPlaceholder('Write a message…').fill('Secret DM content')
  // V15 fix: same send-race guard as the spec above — the RLS assertion below
  // is meaningless if the write has not committed yet.
  const sendSettled = page.waitForResponse(
    (res) =>
      res.url().includes('/rest/v1/messages') &&
      res.request().method() === 'POST' &&
      res.status() < 400,
  )
  await page.getByRole('button', { name: 'Send' }).click()
  await sendSettled
  await expect(page.getByTestId('own-message')).toContainText('Secret DM content')

  // --- The stranger: create an account, then try to read the DM via REST. ---
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

  // Extract the stranger's access token.
  const strangerToken = await (async () => {
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

  // REST: GET /rest/v1/messages?playdate_id=is.null → [] (RLS blocks the
  // stranger from reading any free-form DM they're not a participant in).
  const restRes = await fetch(`${url}/rest/v1/messages?playdate_id=is.null&select=id,body`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${strangerToken}` },
  })
  expect(restRes.ok).toBe(true)
  const restRows = (await restRes.json()) as Array<Record<string, unknown>>
  // The stranger should NOT see the DM (they're not a recipient).
  const secretRows = restRows.filter((row) => row.body === 'Secret DM content')
  expect(secretRows.length).toBe(0)

  await strangerContext.close()
  await viewerContext.close()
})

test.afterEach(async () => {
  // Best-effort cleanup: delete the marker's free-form DM messages via REST.
  // (The message_recipients rows cascade with the messages.)
  try {
    const { url, anonKey } = readSupabaseEnv()
    const { accessToken, userId } = readMarkerSession()
    const query = `${url}/rest/v1/messages?sender_id=eq.${userId}&playdate_id=is.null&select=id`
    const res = await fetch(query, {
      headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
    })
    if (res.ok) {
      const rows = (await res.json()) as Array<{ id: string }>
      for (const row of rows) {
        await fetch(`${url}/rest/v1/messages?id=eq.${row.id}`, {
          method: 'DELETE',
          headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
        })
      }
      console.log(`[e2e dm cleanup] deleted ${rows.length} free-form message(s)`)
    }
  } catch (err) {
    console.log(
      `[e2e dm cleanup] FAILED (logged, best-effort): ${err instanceof Error ? err.message : err}`,
    )
  }
})
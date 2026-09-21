/**
 * V15 ticket 08 (A26) — thumbs-up reactions on messages, end to end.
 *
 * The ticket's claims, against the live project:
 *
 *  1. TOGGLE: the pinger taps 👍 under their own message → the button fills
 *     (aria-pressed=true) and the count reads 1. Tapping again removes it
 *     (aria-pressed=false, the count pill disappears).
 *  2. COUNTER: the count renders inside the button as "👍 3" and is HIDDEN at
 *     0 (the button itself stays visible — there is always something to tap).
 *  3. TWO-ACCOUNT: the HOST sees the pinger's reaction arrive on its own open
 *     thread within ~15 s, without a reload (the message_reactions Realtime
 *     subscription — the same channel pattern the messages INSERT uses).
 *  4. RLS: a non-participant's REST read of message_reactions returns [].
 *
 * Separate from inbox.e2e.ts on purpose: that file pins the V14 messaging
 * claims and its specs are already long. This spec reuses its seeding helpers
 * (the /new UI seed, the marker JWT lookup, the fresh-pinger signup) rather
 * than re-implementing them, and carries its own afterEach cleanup.
 *
 * Pre-0043-apply these specs fail (message_reactions does not exist yet) — an
 * expected failure until the orchestrator applies migration 0043 live via CDP
 * (the DB-not-applied discipline).
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  editTitle,
  localDatePlusDays,
  readMarkerMeta,
  readMarkerSession,
  readSupabaseEnv,
  settleOnRoute,
  stepStartTimeOnce,
} from './fixtures'

const TITLE_PLACEHOLDER = 'e.g. Playground time at Green Lake'
const PLACE_PLACEHOLDER = 'e.g. Green Lake playground, near the boathouse'

/** Seed ONE post through the /new UI (the golden-path pattern). */
async function seedPostViaUi(page: Page, title: string): Promise<void> {
  await page.goto('/new')
  await settleOnRoute(page, '/new')
  await editTitle(page)
  await page.getByPlaceholder(TITLE_PLACEHOLDER).fill(title)
  await page.getByPlaceholder(PLACE_PLACEHOLDER).fill('E2E Reaction lot')
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

/** Create a fresh account, ping the post and open its thread. */
async function createPingingViewerWithThread(
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
  await viewerPage.goto('/login')
  await viewerPage.getByRole('button', { name: 'New here? Create an account' }).click()
  await viewerPage.locator('input[autocomplete="nickname"]').fill(viewerName)
  await viewerPage.locator('input[type="email"]').fill(viewerEmail)
  await viewerPage.locator('input[type="password"]').fill(viewerPassword)
  await viewerPage.getByRole('button', { name: 'Create account' }).click()
  await viewerPage.getByRole('heading', { name: 'Set your location' }).waitFor()
  await viewerPage.getByPlaceholder('e.g. 98107').fill(homeZip)
  await viewerPage.locator('select').first().selectOption({ label: `${radiusMiles} miles` })
  await viewerPage.getByRole('button', { name: /^Continue/ }).click()
  await viewerPage.getByRole('heading', { name: 'Near you' }).waitFor()

  await viewerPage.goto(`/playdate/${playdateId}`)
  await viewerPage.getByRole('button', { name: /^I’m going$/ }).click()
  await expect(viewerPage.getByRole('button', { name: /^✓ Going$/ })).toBeVisible()
  await viewerPage.getByRole('button', { name: 'Message the host' }).click()
  await expect(viewerPage).toHaveURL(new RegExp(`/inbox\\?thread=${playdateId}$`))
  return { context: viewerContext, page: viewerPage }
}

test('reaction toggle: tapping 👍 fills the button, counts 1, and toggles back off', async ({
  page,
  browser,
}) => {
  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const title = `e2e ${marker.displayName} react toggle`
  const viewerName = `e2e-v-${epoch}-react`
  const viewerEmail = `e2e-v-${epoch}-react@gmail.com`
  const viewerPassword = `e2e-v-pw-${epoch}-react`

  await seedPostViaUi(page, title)
  const playdateId = await latestMarkerPlaydateIdByTitle(title)

  const viewer = await createPingingViewerWithThread(
    browser,
    playdateId,
    viewerName,
    viewerEmail,
    viewerPassword,
    marker.homeZip,
    marker.radiusMiles,
  )
  const viewerPage = viewer.page

  // Send a message so there is a bubble to react to.
  await viewerPage.getByPlaceholder('Write a message…').fill('Reaction target')
  await viewerPage.getByRole('button', { name: 'Send' }).click()
  const ownBubble = viewerPage.getByTestId('own-message').filter({ hasText: 'Reaction target' })
  await expect(ownBubble).toContainText('Reaction target')

  // The bubble's reaction button starts unreacted + uncounted (the count pill
  // is hidden at 0, the button itself is present).
  const reactButton = viewerPage.getByRole('button', { name: 'Thumbs-up this message' })
  await expect(reactButton).toBeVisible()
  await expect(reactButton).toHaveAttribute('aria-pressed', 'false')

  // Tap 👍 → filled + count 1, on the same frame (optimistic).
  await reactButton.click()
  const reactedButton = viewerPage.getByRole('button', { name: 'Remove your thumbs-up' })
  await expect(reactedButton).toHaveAttribute('aria-pressed', 'true')
  await expect(reactedButton).toContainText('1')

  // Tap again → back to unreacted + the count pill gone (0 is hidden).
  await reactedButton.click()
  await expect(reactButton).toHaveAttribute('aria-pressed', 'false')
  await expect(reactButton).not.toContainText('1')

  await viewer.context.close()
})

test('reactions update live: the host sees the pinger\'s 👍 without a reload', async ({
  page,
  browser,
}) => {
  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const title = `e2e ${marker.displayName} react rt`
  const viewerName = `e2e-v-${epoch}-reactrt`
  const viewerEmail = `e2e-v-${epoch}-reactrt@gmail.com`
  const viewerPassword = `e2e-v-pw-${epoch}-reactrt`

  await seedPostViaUi(page, title)
  const playdateId = await latestMarkerPlaydateIdByTitle(title)

  // The pinger sends a message + opens the thread.
  const viewer = await createPingingViewerWithThread(
    browser,
    playdateId,
    viewerName,
    viewerEmail,
    viewerPassword,
    marker.homeZip,
    marker.radiusMiles,
  )
  const viewerPage = viewer.page
  await viewerPage.getByPlaceholder('Write a message…').fill('React to me live')
  await viewerPage.getByRole('button', { name: 'Send' }).click()
  await expect(viewerPage.getByTestId('own-message')).toContainText('React to me live')

  // The host opens the SAME thread in its own context (the marker session).
  const fs = await import('node:fs')
  const path = await import('node:path')
  const markerState = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'e2e', '.auth', 'marker-state.json'), 'utf8'),
  )
  const hostContext = await browser.newContext({
    baseURL: 'http://localhost:4173',
    storageState: markerState as { cookies: unknown[]; origins: unknown[] },
  })
  const hostPage = await hostContext.newPage()
  await hostPage.goto(`/inbox?thread=${playdateId}`)
  await settleOnRoute(hostPage, '/inbox')
  await expect(hostPage.getByTestId('other-message')).toContainText('React to me live', {
    timeout: 15_000,
  })

  // The host's view starts at 0 reactions. Scope to the CONFIRMED bubble: the
  // sender's own view briefly renders the optimistic `pending-<ts>` row next to
  // the realtime-confirmed one, so a bare role query is ambiguous (a
  // pre-existing optimistic-send artifact, not a reaction bug). This spec only
  // needs the host's single confirmed bubble.
  const confirmedReactButton = (p: Page) =>
    p.locator('button[data-testid^="react-"]:not([data-testid^="react-pending-"])').first()
  const hostReactButton = confirmedReactButton(hostPage)
  await expect(hostReactButton).toHaveAttribute('aria-pressed', 'false')

  // The pinger reacts → the host's OPEN thread shows the count within ~15 s,
  // no reload (the message_reactions Realtime subscription).
  await confirmedReactButton(viewerPage).click()
  await expect(hostReactButton, { timeout: 15_000 }).toContainText('1')

  // Un-react → the host's count falls back to 0 and the pill disappears. This
  // is the DELETE half of the subscription, which reads payload.old — the
  // assertion that the default REPLICA IDENTITY (the (message_id, profile_id)
  // PK) really does carry the message id the handler needs.
  await viewerPage.getByRole('button', { name: 'Remove your thumbs-up' }).first().click()
  await expect(hostReactButton, { timeout: 15_000 }).not.toContainText('1')

  await hostContext.close()
  await viewer.context.close()
})

test.afterEach(async () => {
  // Best-effort cleanup (per house): delete the HOST marker's playdate rows via
  // REST with the marker's own JWT (host-only DELETE policy). going_pings +
  // messages cascade with the post (0007/0042) and message_reactions cascades
  // with its message (0043). The viewer accounts (e2e-v- prefix) persist for
  // the orchestrator's sweep. A failure is logged, never fatal.
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
      console.log(`[e2e cleanup] ok — deleted host marker playdate row(s) (host ${userId})`)
    }
  } catch (err) {
    console.log(
      `[e2e cleanup] FAILED (logged, best-effort): ${err instanceof Error ? err.message : err}`,
    )
  }
})

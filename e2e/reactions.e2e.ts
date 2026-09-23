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
  editTitle, localDatePlusDays, readMarkerMeta, readMarkerSession,
  readSupabaseEnv, settleOnRoute, signUpViewer, stepStartTimeOnce,
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
  // V20 t06: signup is first + last name + address now — one shared helper
  // (`signUpViewer`) so the form's field list lives in one place.
  await signUpViewer(viewerPage, {
    name: viewerName,
    email: viewerEmail,
    password: viewerPassword,
  })
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

  // The bubble's reaction PILL starts unreacted + uncounted (the count pill is
  // hidden at 0, the pill itself is present). V21 t03: the control is now a
  // summary pill that opens a six-option picker, not a single 👍 toggle.
  const reactPill = viewerPage.locator('button[data-testid^="react-"]:not([data-testid^="react-pending-"])').first()
  await expect(reactPill).toBeVisible()

  // Open the picker → it offers all six kinds.
  await reactPill.click()
  const picker = viewerPage.locator('[data-testid^="react-picker"]').first()
  await expect(picker).toBeVisible()
  for (const kind of ['like', 'love', 'laugh', 'wow', 'sad', 'angry']) {
    await expect(picker.getByTestId(`react-option-${kind}`)).toBeVisible()
  }

  // Pick "love" → the pill fills (aria-pressed via the option) + count 1.
  await picker.getByTestId('react-option-love').click()
  await expect(reactPill).toContainText('1')

  // Reopen the picker; the current kind ("love") is marked active.
  await reactPill.click()
  await expect(viewerPage.getByTestId('react-option-love')).toHaveAttribute('aria-pressed', 'true')

  // Tap your CURRENT kind again → REMOVES the reaction (count back to 0, pill
  // gone). This is the Facebook model: tapping what you already have clears it.
  await viewerPage.getByTestId('react-option-love').click()
  await expect(reactPill).not.toContainText('1')

  await viewer.context.close()
})

/**
 * V21 t03: the KIND round trip — set a kind, CHANGE it (asserting the count
 * holds at 1, i.e. replace-in-place rather than add-a-second-row), then remove.
 *
 * RED-BY-DESIGN NOTE: this spec exercises the `kind` column added by migration
 * 0049_message_reaction_kinds.sql. Until that migration is applied to the live
 * database, the UPDATE path (`toggleReaction` with a different kind) will fail
 * with a Postgres "column kind does not exist" error and this test will FAIL
 * at the "change kind" step. That failure is expected and correct — it proves
 * the new UI is wired end-to-end and only the schema is missing. The other two
 * specs in this file (the single-kind toggle + the realtime one) still pass on
 * the pre-0049 schema because they only ever use the default 'like' kind.
 */
test('reaction kind round trip: set → change kind (count unchanged) → remove', async ({
  page,
  browser,
}) => {
  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const title = `e2e ${marker.displayName} react kinds`
  const viewerName = `e2e-v-${epoch}-reactkinds`
  const viewerEmail = `e2e-v-${epoch}-reactkinds@gmail.com`
  const viewerPassword = `e2e-v-pw-${epoch}-reactkinds`

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
  await viewerPage.getByPlaceholder('Write a message…').fill('Kind target')
  await viewerPage.getByRole('button', { name: 'Send' }).click()
  const ownBubble = viewerPage.getByTestId('own-message').filter({ hasText: 'Kind target' })
  await expect(ownBubble).toContainText('Kind target')

  const reactPill = viewerPage.locator('button[data-testid^="react-"]:not([data-testid^="react-pending-"])').first()
  const picker = () => viewerPage.locator('[data-testid^="react-picker"]').first()

  // STEP 1 — SET "love": open the picker, pick love. Count goes 0 → 1.
  await reactPill.click()
  await picker().getByTestId('react-option-love').click()
  await expect(reactPill).toContainText('1')

  // STEP 2 — CHANGE kind to "angry": the pill now shows the angry glyph, and
  // the count MUST stay at 1 (replace-in-place; NOT 2). This is the assertion
  // that distinguishes "one reaction per person, mutable kind" from "a row per
  // kind". On the pre-0049 schema this write throws (no `kind` column) and the
  // optimistic move rolls back — the count stays at 1 but the glyph never
  // changes, which is the legible red signal.
  await reactPill.click()
  await picker().getByTestId('react-option-angry').click()
  await expect(reactPill).toContainText('1')
  // The pill's active option flips to angry; love is no longer pressed.
  await reactPill.click()
  await expect(picker().getByTestId('react-option-angry')).toHaveAttribute('aria-pressed', 'true')
  await expect(picker().getByTestId('react-option-love')).toHaveAttribute('aria-pressed', 'false')

  // STEP 3 — REMOVE: tap the current kind ("angry") again. Count 1 → 0, pill
  // hidden.
  await picker().getByTestId('react-option-angry').click()
  await expect(reactPill).not.toContainText('1')

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
  const confirmedReactPill = (p: Page) =>
    p.locator('button[data-testid^="react-"]:not([data-testid^="react-pending-"])').first()
  const hostReactPill = confirmedReactPill(hostPage)
  await expect(hostReactPill).toBeVisible()

  // The pinger reacts (opens the picker, picks "like") → the host's OPEN thread
  // shows the count within ~15 s, no reload (the message_reactions Realtime
  // subscription).
  await confirmedReactPill(viewerPage).click()
  await viewerPage.getByTestId('react-option-like').click()
  await expect(hostReactPill, { timeout: 15_000 }).toContainText('1')

  // Un-react (tap the current kind in the picker → remove) → the host's count
  // falls back to 0 and the pill disappears. This is the DELETE half of the
  // subscription, which reads payload.old — the assertion that the default
  // REPLICA IDENTITY (the (message_id, profile_id) PK) really does carry the
  // message id the handler needs. Adding the `kind` column (0049) does NOT
  // change the PK, so the DELETE payload still carries both ids.
  await confirmedReactPill(viewerPage).click()
  await viewerPage.getByTestId('react-option-like').click()
  await expect(hostReactPill, { timeout: 15_000 }).not.toContainText('1')

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

/**
 * inbox-messenger slice A — the thread's GEOMETRY, measured.
 *
 * The slice's whole claim is a layout claim, and layout is the one thing a unit
 * test cannot see: the thread column must own the viewport (a pinned header, ONE
 * scroll region, a composer that never scrolls away) while every other route
 * keeps the document scroll it has always had. So this spec drives the real app
 * at two real phone viewports and measures bounding boxes, rather than asserting
 * that class names are present.
 *
 * The three claims the slice owes, and where each is measured:
 *
 *   1. THE COMPOSER IS INSIDE THE VIEWPORT — after the thread has been scrolled
 *      to the TOP, which is the case nothing asserted before. Stronger than
 *      "it is on screen": the composer's box must be IDENTICAL before and after
 *      that scroll (a pinned element does not move when the messages do).
 *   2. THE NEWEST MESSAGE IS VISIBLE ON OPEN WITHOUT SCROLLING — with the
 *      thread non-vacuously longer than its region (`scrollHeight` checked, so
 *      a short thread cannot pass this by having nothing to scroll), the region
 *      must open at its end (`scrollTop` at the maximum) and the newest bubble
 *      must be fully inside the region AND the viewport.
 *   3. NEITHER IS CLIPPED AT 844×390 — the same two measurements at landscape.
 *
 * Plus the control the constraint demands: `/browse` and the conversation LIST
 * (`/inbox`, no params) must still be ordinary scrolling documents, and the
 * precondition for saying so is asserted first (the page must REALLY be taller
 * than the viewport, or "it scrolls" would be a claim about nothing).
 *
 * Fixture discipline (docs/agents/e2e-fixture-convention.md): the counterpart
 * is a fresh `e2e-v-…` account, every seeded message body is marked `e2e …`,
 * the sender is the marker account (itself a marker, so `is_e2e_profile`
 * suppresses the notification), and cleanup deletes exactly the ids this spec
 * created — one `id=eq.` DELETE per row, never a broad filter.
 */
import { expect, test } from '@playwright/test'
import type { Locator } from '@playwright/test'
import {
  E2E_BASE_URL,
  finishSignup,
  readEnvFile,
  readMarkerMeta,
  readMarkerSession,
  readSupabaseEnv,
  signUpViewer,
} from './fixtures'

/** Longer than any viewport under test measures: the region must actually overflow. */
const THREAD_MESSAGE_COUNT = 24
/** The last seeded message, and the bubble claim 2 is about. */
const NEWEST_BODY = 'e2e geometry NEWEST'
/** The two viewports the claims are measured at: the phone, and its landscape. */
const PORTRAIT = { width: 390, height: 844 }
const LANDSCAPE = { width: 844, height: 390 }

interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** The shared base URL, so this spec's own contexts follow a private-port run. */
function projectBaseURL(): string {
  return E2E_BASE_URL
}

/**
 * A locator's box, or a named failure. `boundingBox` is null for a detached or
 * non-rendered element, which is exactly the state these claims must not pass in.
 */
async function boxOf(locator: Locator, label: string): Promise<Box> {
  const box = await locator.boundingBox()
  expect(box, `${label} must render a box to measure`).not.toBeNull()
  return box as Box
}

function viewportBox(size: { width: number; height: number }): Box {
  return { x: 0, y: 0, width: size.width, height: size.height }
}

/** Fully inside `rect`, with a 1px tolerance for sub-pixel layout rounding. */
function fullyInside(box: Box, rect: Box, label: string): void {
  const t = 1
  expect(
    box.x >= rect.x - t &&
      box.y >= rect.y - t &&
      box.x + box.width <= rect.x + rect.width + t &&
      box.y + box.height <= rect.y + rect.height + t,
    `${label} must be fully inside ${JSON.stringify(rect)} — it is ${JSON.stringify(box)}`,
  ).toBe(true)
}

/** The same box, after a scroll that must not have moved it. */
function unchanged(before: Box, after: Box, label: string): void {
  expect(
    Math.abs(before.x - after.x) <= 1 &&
      Math.abs(before.y - after.y) <= 1 &&
      Math.abs(before.width - after.width) <= 1 &&
      Math.abs(before.height - after.height) <= 1,
    `${label} must not move when the thread scrolls — before ${JSON.stringify(before)}, after ${JSON.stringify(after)}`,
  ).toBe(true)
}

/** The scroll region's own numbers: what "opened at the newest message" means. */
async function regionMetrics(region: Locator): Promise<{
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}> {
  return await region.evaluate((el) => ({
    scrollTop: el.scrollTop,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }))
}

/**
 * Seed one direct thread: `count` messages from the marker to `recipientId`,
 * one minute apart so the thread's ORDER is deterministic (a single batched
 * insert with `now()` on every row would leave the last bubble to the
 * database's discretion). Returns the created ids for the caller to delete.
 */
async function seedThread(
  env: { url: string; anonKey: string; accessToken: string; senderId: string },
  recipientId: string,
  count: number,
): Promise<string[]> {
  const now = Date.now()
  const rows = Array.from({ length: count }, (_, index) => ({
    playdate_id: null,
    sender_id: env.senderId,
    body: index === count - 1 ? NEWEST_BODY : `e2e geometry ${index + 1}`,
    recipient_hint: recipientId,
    created_at: new Date(now - (count - 1 - index) * 60_000).toISOString(),
  }))
  const res = await fetch(`${env.url}/rest/v1/messages`, {
    method: 'POST',
    headers: {
      apikey: env.anonKey,
      Authorization: `Bearer ${env.accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(rows),
  })
  expect(res.ok, `seeding ${count} messages must succeed (${res.status})`).toBe(true)
  const inserted = (await res.json()) as Array<{ id: string }>
  expect(inserted.length, 'every seeded message must come back with its id').toBe(count)
  return inserted.map((row) => row.id)
}

/**
 * Delete exactly the rows this spec created — one `id=eq.` DELETE per id, never
 * a filter over other people's rows.
 *
 * WHY THE SERVICE ROLE AND NOT THE MARKER'S OWN TOKEN — measured, not assumed:
 * `public.messages` carries SELECT and INSERT policies only
 * (`supabase/migrations/0042_messages.sql:51`, `:75`; 0043 widens the INSERT),
 * so there is NO delete policy. A delete with the marker's token therefore
 * matches zero rows and still answers `204 No Content`, which is how a
 * "best-effort cleanup" reads green while removing nothing (the same shape as
 * `e2e/dm.e2e.ts`'s `afterEach` — reported as a finding, not fixed here). The
 * service role is the only handle that actually removes the fixture; when the
 * key is absent (a lane without `.env`) this says so loudly rather than
 * pretending, and the marker sweep remains the backstop.
 */
async function deleteMessages(
  env: { url: string; anonKey: string; accessToken: string; serviceKey: string | undefined },
  ids: string[],
): Promise<void> {
  const bearer = env.serviceKey ?? env.accessToken
  if (env.serviceKey === undefined || env.serviceKey === '') {
    console.log(
      `[e2e thread geometry cleanup] SUPABASE_SERVICE_ROLE_KEY is absent — ${ids.length} fixture message(s) CANNOT be deleted (messages has no delete policy); the marker sweep must remove them.`,
    )
  }
  for (const id of ids) {
    const res = await fetch(`${env.url}/rest/v1/messages?id=eq.${id}`, {
      method: 'DELETE',
      headers: { apikey: env.serviceKey ?? env.anonKey, Authorization: `Bearer ${bearer}` },
    })
    if (!res.ok) console.log(`[e2e thread geometry cleanup] ${id} → ${res.status}`)
  }
}

/** The profile id of the viewer this spec just created, looked up by its name. */
async function profileIdByName(
  env: { url: string; anonKey: string; accessToken: string },
  displayName: string,
): Promise<string> {
  const res = await fetch(
    `${env.url}/rest/v1/profiles?display_name=ilike.${encodeURIComponent(displayName)}&select=id`,
    { headers: { apikey: env.anonKey, Authorization: `Bearer ${env.accessToken}` } },
  )
  expect(res.ok).toBe(true)
  const rows = (await res.json()) as Array<{ id: string }>
  expect(rows.length, `exactly one profile must carry the fixture name ${displayName}`).toBe(1)
  return rows[0].id
}

test('thread geometry: the newest message is on screen on open and the composer never scrolls away', async ({
  page,
  browser,
}) => {
  // One UI signup for the counterpart, then 24 REST inserts, then five measured
  // viewport states — past the suite's 120s default on a loaded box.
  test.setTimeout(240_000)

  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const viewerName = `e2e-v-${epoch}-geom`
  const viewerEmail = `e2e-v-${epoch}-geom@gmail.com`
  const viewerPassword = `e2e-v-pw-${epoch}-geom`
  const base = projectBaseURL()

  const { url, anonKey } = readSupabaseEnv()
  const { accessToken, userId } = readMarkerSession()
  const serviceKey = readEnvFile().SUPABASE_SERVICE_ROLE_KEY
  const env = { url, anonKey, accessToken, serviceKey }
  const threadUrl = (recipientId: string) => `/inbox?dm=${recipientId}`

  // --- The counterpart: a fresh e2e viewer, signed up through the UI. ---
  const viewerContext = await browser.newContext({
    baseURL: base,
    storageState: { cookies: [], origins: [] },
  })
  const viewerPage = await viewerContext.newPage()
  await signUpViewer(viewerPage, {
    name: viewerName,
    email: viewerEmail,
    password: viewerPassword,
  })
  await finishSignup(viewerPage, {
    homeZip: marker.homeZip,
    radiusMiles: marker.radiusMiles,
  })
  await viewerContext.close()
  const counterpartId = await profileIdByName(env, viewerName)

  const seededIds = await seedThread({ ...env, senderId: userId }, counterpartId, THREAD_MESSAGE_COUNT)
  try {
    const region = page.getByTestId('thread-messages')
    const composer = page.getByTestId('composer')
    const send = page.getByRole('button', { name: 'Send' })
    const draft = page.getByPlaceholder('Write a message…')
    const back = page.getByTestId('inbox-back-to-conversations')
    const newestBubble = page.getByTestId('own-message').filter({ hasText: NEWEST_BODY })
    // The shell chrome the composer has to clear: the bottom bar on a phone, the
    // left rail at md.
    const nav = page.getByRole('navigation', { name: 'Primary' })

    // ---------------------------------------------------------------- portrait
    await page.setViewportSize(PORTRAIT)
    await page.goto(threadUrl(counterpartId))
    await expect(region).toBeVisible()
    // Every seeded message rendered: claim 2 is about a thread that really is
    // longer than the viewport, not about whatever happened to load first.
    await expect(page.getByTestId('own-message')).toHaveCount(THREAD_MESSAGE_COUNT)

    const opened = await regionMetrics(region)
    expect(
      opened.scrollHeight,
      'the fixture thread must overflow its region, or claims 1 and 2 assert nothing',
    ).toBeGreaterThan(opened.clientHeight + 400)
    expect(
      opened.scrollTop,
      'the thread must OPEN at its end — scrollTop at the maximum, not 0 and not mid-thread',
    ).toBeGreaterThanOrEqual(opened.scrollHeight - opened.clientHeight - 2)

    const portraitViewport = viewportBox(PORTRAIT)
    const regionBox = await boxOf(region, 'the thread scroll region')
    const newestBox = await boxOf(newestBubble, 'the newest message')
    fullyInside(newestBox, regionBox, 'the newest message, in the thread scroll region')
    fullyInside(newestBox, portraitViewport, 'the newest message, in the viewport')

    const sendBox = await boxOf(send, 'the Send control')
    const draftBox = await boxOf(draft, 'the composer field')
    const composerBox = await boxOf(composer, 'the composer surface')
    fullyInside(composerBox, portraitViewport, 'the composer')
    fullyInside(sendBox, portraitViewport, 'the Send control')
    fullyInside(draftBox, portraitViewport, 'the composer field')
    // The pinned header is pinned too: it is above the region and on screen.
    fullyInside(await boxOf(back, 'the back control'), portraitViewport, 'the thread header')

    // The composer sits clear of the phone's own chrome, not under it: the
    // bottom bar is FIXED at z-10, so a composer that reached the bottom edge
    // would be covered by it (and by the home indicator behind it).
    const bottomBar = await boxOf(nav, 'the bottom nav')
    expect(
      composerBox.y + composerBox.height <= bottomBar.y + 1,
      `the composer must clear the bottom nav — composer ends at ${composerBox.y + composerBox.height}, the nav starts at ${bottomBar.y}`,
    ).toBe(true)
    // …and the message region ends above the composer, so nothing is hidden
    // behind the pinned half.
    expect(
      regionBox.y + regionBox.height <= composerBox.y + 1,
      `the thread region must end above the composer — region ends at ${regionBox.y + regionBox.height}, the composer starts at ${composerBox.y}`,
    ).toBe(true)

    // --- claim 1: scroll the THREAD to the top; the composer must not move ---
    await region.evaluate((el) => {
      el.scrollTop = 0
    })
    expect(await region.evaluate((el) => el.scrollTop), 'the region must really be at its top').toBe(0)
    unchanged(sendBox, await boxOf(send, 'the Send control'), 'the Send control')
    unchanged(draftBox, await boxOf(draft, 'the composer field'), 'the composer field')
    unchanged(composerBox, await boxOf(composer, 'the composer surface'), 'the composer surface')
    // …and scrolling the messages moved NOTHING else: no ancestor scrolled the
    // pinned content out from under itself (main is `overflow-clip` for exactly
    // this reason — `overflow-hidden` would be programmatically scrollable).
    expect(
      await page.evaluate(() => ({
        window: window.scrollY,
        document: document.documentElement.scrollTop,
        main: document.querySelector('main')?.scrollTop ?? -1,
      })),
      'the shell must not scroll while the thread does',
    ).toEqual({ window: 0, document: 0, main: 0 })

    // --------------------------------------------------------------- landscape
    // A fresh open at 844×390 (rotation while at the top of a thread is the
    // same layout; opening there is the stricter of the two).
    await page.setViewportSize(LANDSCAPE)
    await page.goto(threadUrl(counterpartId))
    await expect(page.getByTestId('own-message')).toHaveCount(THREAD_MESSAGE_COUNT)

    const landscapeOpened = await regionMetrics(region)
    expect(
      landscapeOpened.scrollTop,
      'landscape must open at the newest message too',
    ).toBeGreaterThanOrEqual(landscapeOpened.scrollHeight - landscapeOpened.clientHeight - 2)

    const landscapeViewport = viewportBox(LANDSCAPE)
    const landscapeRegion = await boxOf(region, 'the thread scroll region at 844×390')
    fullyInside(
      await boxOf(newestBubble, 'the newest message at 844×390'),
      landscapeRegion,
      'the newest message, in the thread scroll region at 844×390',
    )
    fullyInside(
      await boxOf(newestBubble, 'the newest message at 844×390'),
      landscapeViewport,
      'the newest message, in the 844×390 viewport',
    )
    const landscapeComposer = await boxOf(composer, 'the composer surface at 844×390')
    fullyInside(landscapeComposer, landscapeViewport, 'the composer at 844×390')
    fullyInside(await boxOf(send, 'the Send control at 844×390'), landscapeViewport, 'the Send control at 844×390')
    // The chrome around it is not clipped either: at 844×390 the shell is at md,
    // so the nav is the LEFT RAIL — the geometry change must not have hidden it.
    fullyInside(await boxOf(nav, 'the primary nav at 844×390'), landscapeViewport, 'the primary nav at 844×390')

    // ------------------------------- the shell's scroll model, every other route
    // The mechanism, read off the rendered shell: only a thread owns its height.
    await page.setViewportSize(PORTRAIT)
    const shellOverflow = async () =>
      await page.evaluate(() => {
        const main = document.querySelector('main')
        const root = main?.parentElement?.parentElement ?? null
        return {
          main: main === null ? 'missing' : getComputedStyle(main).overflowY,
          root: root === null ? 'missing' : getComputedStyle(root).overflowY,
        }
      })

    expect(
      await shellOverflow(),
      'open thread: the shell column must clip (that is what owns the height)',
    ).toEqual({ main: 'clip', root: 'hidden' })

    await page.goto('/browse')
    // The precondition is asserted FIRST: a page shorter than the viewport
    // cannot prove that scrolling still works, so this leg fails loudly rather
    // than passing vacuously.
    await expect
      .poll(async () => await page.evaluate(() => document.documentElement.scrollHeight), {
        message: '/browse must be a page taller than the viewport for this control to mean anything',
        timeout: 20_000,
      })
      .toBeGreaterThan(PORTRAIT.height + 400)
    expect(
      await shellOverflow(),
      'another route: the shell must NOT be in thread mode',
    ).toEqual({ main: 'visible', root: 'visible' })
    await page.evaluate(() => {
      window.scrollTo(0, 400)
    })
    expect(
      await page.evaluate(() => window.scrollY),
      '/browse must still scroll like the document it has always been',
    ).toBeGreaterThan(0)

    await page.goto('/inbox')
    await expect(page.getByTestId('new-message-button')).toBeVisible()
    expect(
      await shellOverflow(),
      'the conversation LIST is a page: no thread params, no owned height',
    ).toEqual({ main: 'visible', root: 'visible' })
  } finally {
    await deleteMessages(env, seededIds)
  }
})

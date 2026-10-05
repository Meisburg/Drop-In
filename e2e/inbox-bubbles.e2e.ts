/**
 * inbox-messenger slice B — the thread's BUBBLES, its TIME, and its empty
 * state, measured on rendered pixels.
 *
 * The slice's acceptance criteria are layout claims about the DOM — "two
 * consecutive messages from one sender share a group; a message from the other
 * person flips sides; a day change renders a separator; no bubble is
 * `rounded-full`" — and the `delight` tells are claims about fills, sizes and
 * the absence of a frame. A unit test cannot see any of them, so this spec
 * drives the real app and reads computed styles and boxes.
 *
 * WHY THIS SPEC OWNS ITS OWN FIXTURE. `e2e/inbox-thread-geometry.e2e.ts`
 * (slice A) already seeds a DM thread by REST and is the pattern reused here:
 * a fresh `e2e-v-…` counterpart signed up through the UI, messages inserted
 * with the marker's token, ONE `id=eq.` DELETE per created row. What it does
 * NOT carry is the two-sender, two-day shape this slice is about, so the rows
 * are seeded here rather than by stretching slice A's fixture.
 *
 * FIXTURE DISCIPLINE (docs/agents/e2e-fixture-convention.md): every body is
 * marked `e2e bubbles …`, the account is an `e2e-v-` signup, and cleanup
 * deletes exactly the ids this spec created (the service role, because
 * `public.messages` carries no DELETE policy — the reason is written down in
 * the geometry spec's `deleteMessages`). Left behind deliberately: the viewer
 * ACCOUNT, which the marker sweep removes by its email prefix.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  finishSignup,
  readEnvFile,
  readMarkerMeta,
  readMarkerSession,
  readSessionFromBrowserPage,
  readSupabaseEnv,
  settleOnRoute,
  signUpViewer,
} from './fixtures'

interface RestEnv {
  url: string
  anonKey: string
  serviceKey: string | undefined
}

/** The playwright config's own baseURL, so this spec follows a private-port run. */
function projectBaseURL(): string {
  const use = test.info().project.use as { baseURL?: string }
  return use.baseURL ?? 'http://localhost:4173'
}

/** Insert ONE free-form message, as `senderToken`'s owner, at a chosen instant. */
async function insertMessage(
  env: RestEnv,
  senderToken: string,
  senderId: string,
  recipientHint: string,
  body: string,
  createdAt: string,
): Promise<string> {
  const res = await fetch(`${env.url}/rest/v1/messages`, {
    method: 'POST',
    headers: {
      apikey: env.anonKey,
      Authorization: `Bearer ${senderToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify([
      {
        playdate_id: null,
        sender_id: senderId,
        body,
        // The AFTER INSERT trigger (0043/0044) turns this hint into the two
        // message_recipients rows that make the thread readable by both sides.
        recipient_hint: recipientHint,
        created_at: createdAt,
      },
    ]),
  })
  expect(res.ok, `seeding "${body}" must succeed (${res.status})`).toBe(true)
  const rows = (await res.json()) as Array<{ id: string }>
  expect(rows.length, 'every seeded message must come back with its id').toBe(1)
  return rows[0].id
}

/** Delete exactly the rows this spec created — never a filter over other rows. */
async function deleteMessages(env: RestEnv, ids: string[]): Promise<void> {
  if (env.serviceKey === undefined || env.serviceKey === '') {
    console.log(
      `[e2e bubbles cleanup] SUPABASE_SERVICE_ROLE_KEY is absent — ${ids.length} fixture message(s) CANNOT be deleted (messages has no delete policy); the marker sweep must remove them.`,
    )
    return
  }
  for (const id of ids) {
    const res = await fetch(`${env.url}/rest/v1/messages?id=eq.${id}`, {
      method: 'DELETE',
      headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}` },
    })
    if (!res.ok) {
      console.log(`[e2e bubbles cleanup] ${id} → ${res.status} (the sweep is the backstop)`)
    }
  }
}

/** A local instant N days back at a chosen hour, as ISO — the fixture's clock. */
function localInstant(daysBack: number, hour: number, minute: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysBack)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

/** Read rows from the fixture's own REST seams, as a given caller. */
async function restGet<T>(env: RestEnv, token: string, path: string): Promise<T[]> {
  const res = await fetch(`${env.url}/rest/v1/${path}`, {
    headers: { apikey: env.anonKey, Authorization: `Bearer ${token}` },
  })
  expect(res.ok, `GET ${path} must succeed (${res.status})`).toBe(true)
  return (await res.json()) as T[]
}

/**
 * Seed ONE drop-in, host = the token's owner. Only the columns 0005/0030 make
 * NOT NULL are sent: a title (marked, per the fixture convention), the place's
 * free-text name, its directory row, a neighborhood, and the window.
 */
async function insertPlaydate(
  env: RestEnv,
  token: string,
  hostId: string,
  row: { title: string; placeName: string; placeId: string; neighborhoodId: string; startsAt: string; endsAt: string },
): Promise<string> {
  const res = await fetch(`${env.url}/rest/v1/playdates`, {
    method: 'POST',
    headers: {
      apikey: env.anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify([
      {
        host_profile_id: hostId,
        title: row.title,
        place: row.placeName,
        place_id: row.placeId,
        neighborhood_id: row.neighborhoodId,
        starts_at: row.startsAt,
        ends_at: row.endsAt,
      },
    ]),
  })
  expect(res.ok, `seeding the fixture drop-in must succeed (${res.status})`).toBe(true)
  const rows = (await res.json()) as Array<{ id: string }>
  expect(rows.length).toBe(1)
  return rows[0].id
}

/** Record a ping — the row that makes the pinger a participant of the thread. */
async function insertPing(
  env: RestEnv,
  token: string,
  playdateId: string,
  profileId: string,
): Promise<void> {
  const res = await fetch(`${env.url}/rest/v1/going_pings`, {
    method: 'POST',
    headers: {
      apikey: env.anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify([{ playdate_id: playdateId, profile_id: profileId }]),
  })
  expect(res.ok, `seeding the fixture ping must succeed (${res.status})`).toBe(true)
}

/**
 * One computed-style read, so the assertions state what they measure.
 */
async function styleOf(
  page: Page,
  testId: string,
): Promise<{ bg: string; color: string; border: string; radius: string; fontSize: string }> {
  return await page.getByTestId(testId).first().evaluate((el) => {
    const style = getComputedStyle(el)
    return {
      bg: style.backgroundColor,
      color: style.color,
      border: style.borderTopWidth,
      radius: style.borderTopLeftRadius,
      fontSize: style.fontSize,
    }
  })
}

test('thread bubbles: sides, grouping, per-group time, day separators and no panel', async ({
  page,
  browser,
}) => {
  // A UI signup for the counterpart, then six REST inserts, then the assertions.
  test.setTimeout(240_000)

  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const viewerName = `e2e-v-${epoch}-bubbles`
  const viewerEmail = `e2e-v-${epoch}-bubbles@gmail.com`
  const viewerPassword = `e2e-v-pw-${epoch}-bubbles`

  const { url, anonKey } = readSupabaseEnv()
  const { accessToken: markerToken, userId: markerId } = readMarkerSession()
  const env: RestEnv = { url, anonKey, serviceKey: readEnvFile().SUPABASE_SERVICE_ROLE_KEY }
  const threadUrl = (recipientId: string) => `/inbox?dm=${recipientId}`

  // --- The counterpart: a fresh e2e viewer, signed up through the UI. -------
  const viewerContext = await browser.newContext({
    baseURL: projectBaseURL(),
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
  // The viewer's OWN session (token + profile id) — the spec needs both sides
  // to speak, and the id is the thread's `?dm=` target.
  const viewerSession = await readSessionFromBrowserPage(viewerPage)
  expect(viewerSession, 'the viewer must have a session after onboarding').not.toBeNull()
  const viewerId = (viewerSession as { userId: string }).userId
  const viewerToken = (viewerSession as { accessToken: string }).accessToken
  await viewerContext.close()

  const region = page.getByTestId('thread-messages')
  const createdIds: string[] = []
  // The seeded drop-in (its ping cascades with it). Declared here so a failure
  // anywhere after the insert still removes it.
  let playdateId: string | null = null
  try {
    // ---------------------------------------------------------------- empty
    // A brand-new thread with NO messages: the slice's empty state, and the
    // proof that the conversation is no longer a framed panel inside a page.
    await page.goto(threadUrl(viewerId))
    await settleOnRoute(page, '/inbox')
    await expect(page.getByText('No messages yet')).toBeVisible()
    await expect(page.getByText('Say hi below — this is where your conversation starts.')).toBeVisible()
    const emptyRegion = await region.evaluate((el) => {
      const style = getComputedStyle(el)
      return {
        border: style.borderTopWidth,
        radius: style.borderTopLeftRadius,
        // The scroll region must still be the ONLY scroller in the thread.
        overflowY: style.overflowY,
      }
    })
    // Tell 1: `min-h-40 rounded-xl border bg-slate-50 p-4` is gone — no frame.
    expect(emptyRegion.border, 'the thread region must carry no border').toBe('0px')
    expect(emptyRegion.radius, 'the thread region must carry no panel radius').toBe('0px')
    expect(emptyRegion.overflowY).toBe('auto')

    // ---------------------------------------------------------------- seeded
    // Yesterday: two from the other party, then one from the viewer of this
    // thread (the marker). Today: three from the marker. So the expected shape
    // is three groups — [other, other], [own], [own, own, own] — across two
    // days, and the group boundaries are sender AND day.
    const y1 = await insertMessage(env, viewerToken, viewerId, markerId, 'e2e bubbles y1', localInstant(1, 10, 0))
    const y2 = await insertMessage(env, viewerToken, viewerId, markerId, 'e2e bubbles y2', localInstant(1, 10, 1))
    const y3 = await insertMessage(env, markerToken, markerId, viewerId, 'e2e bubbles y3', localInstant(1, 10, 2))
    const t1 = await insertMessage(env, markerToken, markerId, viewerId, 'e2e bubbles t1', localInstant(0, 9, 0))
    const t2 = await insertMessage(env, markerToken, markerId, viewerId, 'e2e bubbles t2', localInstant(0, 9, 1))
    const t3 = await insertMessage(env, markerToken, markerId, viewerId, 'e2e bubbles t3', localInstant(0, 9, 2))
    createdIds.push(y1, y2, y3, t1, t2, t3)

    await page.goto(threadUrl(viewerId))
    await settleOnRoute(page, '/inbox')
    const own = page.getByTestId('own-message')
    const other = page.getByTestId('other-message')
    await expect(own).toHaveCount(4)
    await expect(other).toHaveCount(2)

    // ------------------------------------------------- day separators (2)
    const separators = page.locator('[data-testid^="day-separator-"]')
    await expect(separators).toHaveCount(2)
    expect(await separators.allTextContents()).toEqual(['Yesterday', 'Today'])
    const dayKeys = await separators.evaluateAll((els) =>
      els.map((el) => (el.getAttribute('data-testid') ?? '').replace('day-separator-', '')),
    )
    // The hook is the app's own local day key (YYYY-MM-DD), and the two days
    // really are different days.
    for (const key of dayKeys) expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(dayKeys[0]).not.toBe(dayKeys[1])

    // ------------------------------------- grouping: one label per group
    // Six bubbles, three groups → exactly three sender labels. Before this
    // slice every bubble was labelled, so this count would have been six.
    await expect(page.locator('p.mb-0\\.5.text-xs.text-slate-500')).toHaveCount(3)

    // ------------------------- time once per group, on the group's LAST bubble
    await expect(page.locator('[data-testid^="message-time-"]')).toHaveCount(3)
    await expect(page.getByTestId(`message-time-${y2}`)).toBeVisible()
    await expect(page.getByTestId(`message-time-${y1}`)).toHaveCount(0)
    await expect(page.getByTestId(`message-time-${t3}`)).toBeVisible()
    await expect(page.getByTestId(`message-time-${t1}`)).toHaveCount(0)
    await expect(page.getByTestId(`message-time-${t2}`)).toHaveCount(0)
    // Tell 3: the time is the QUIETEST text in the thread — 14px (`text-xs`),
    // the same tier as the sender label and two tiers below the 18px bubble
    // body it used to out-shout at 17px, in the 4.89:1 meta tone.
    const timeStyle = await styleOf(page, `message-time-${t3}`)
    expect(timeStyle.fontSize).toBe('14px')
    expect(timeStyle.color).toBe('rgb(102, 115, 122)')
    const ownStyle = await styleOf(page, 'own-message')
    expect(ownStyle.fontSize).toBe('18px')
    expect(Number.parseFloat(timeStyle.fontSize)).toBeLessThan(Number.parseFloat(ownStyle.fontSize))

    // ---------------------------------------------- sides and fills (tell 2)
    const regionBox = await region.boundingBox()
    const ownBox = await own.first().boundingBox()
    const otherBox = await other.first().boundingBox()
    expect(regionBox, 'the region must render a box').not.toBeNull()
    expect(ownBox, 'an own bubble must render a box').not.toBeNull()
    expect(otherBox, 'an other bubble must render a box').not.toBeNull()
    const right = (box: { x: number; width: number }) => box.x + box.width
    // The viewer's own bubble sits flush to the region's RIGHT edge…
    expect(Math.abs(right(ownBox as { x: number; width: number }) - right(regionBox as { x: number; width: number }))).toBeLessThanOrEqual(1)
    // …and the other party's sits flush to its LEFT edge: the sides are flipped.
    expect(Math.abs((otherBox as { x: number }).x - (regionBox as { x: number }).x)).toBeLessThanOrEqual(1)
    expect(right(ownBox as { x: number; width: number })).toBeGreaterThan(right(otherBox as { x: number; width: number }))
    // Own = the action tone under white text; theirs = the warm fill, no border.
    expect(ownStyle.bg).toBe('rgb(200, 65, 28)')
    expect(ownStyle.color).toBe('rgb(255, 255, 255)')
    const otherStyle = await styleOf(page, 'other-message')
    expect(otherStyle.bg).toBe('rgb(251, 247, 244)')
    expect(otherStyle.border).toBe('0px')

    // ------------------------------------------------ no bubble is a pill
    const radii = await page
      .locator('[data-testid="own-message"], [data-testid="other-message"]')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).borderTopLeftRadius))
    expect(radii).toHaveLength(6)
    for (const radius of radii) {
      expect(radius, 'a message body is rounded-xl, never rounded-full').toBe('12px')
      expect(radius).not.toBe('9999px')
    }

    // ------------------------------------- the reaction control is DRAWN
    // Tell 4: an inline SVG in the app's one icon family, not a unicode emoji.
    const reactPill = page.locator('button[data-testid^="react-"]').first()
    await expect(reactPill).toBeVisible()
    await expect(reactPill.locator('svg')).toHaveCount(1)
    await expect(reactPill.locator('svg path')).not.toHaveAttribute('d', '')
    await expect(reactPill).not.toContainText('👍')
    // …and the picker's six options are drawn too, one icon each.
    await reactPill.click()
    const picker = page.locator('[data-testid^="react-picker-"]').first()
    await expect(picker).toBeVisible()
    for (const kind of ['like', 'love', 'laugh', 'wow', 'sad', 'angry']) {
      await expect(picker.getByTestId(`react-option-${kind}`).locator('svg')).toHaveCount(1)
    }
    await reactPill.click()

    // ------------------------------------------------------- header (tell 5)
    // A DM thread's header is the NAME and nothing else: the generated
    // "Drop-in at <place>" title line (which repeated the context line) is gone
    // from BOTH branches, and a DM has no drop-in context anyway.
    const dmHeader = page.locator('div.min-w-0 > p')
    await expect(dmHeader).toHaveCount(1)
    await expect(dmHeader.first()).toHaveText(viewerName)

    // ------------------------------------- a playdate thread's header + face
    // Tell 5's other branch, and tell 1's face. A drop-in thread named by a
    // person, with ONE line of context under the name and no third line: the
    // generated title would have been the line that repeated the place name the
    // context line ends with. Zero messages, so the empty state renders too —
    // and here the counterpart IS named (the pinger the fallback read resolves),
    // which is the only case that draws the face.
    const [neighborhood] = await restGet<{ id: string }>(
      env,
      markerToken,
      'neighborhoods?select=id&limit=1',
    )
    const [place] = await restGet<{ id: string; name: string }>(
      env,
      markerToken,
      'places?select=id,name&limit=1',
    )
    expect(neighborhood?.id, 'the seeded directory must expose a neighborhood').toBeTruthy()
    expect(place?.id, 'the seeded directory must expose a place').toBeTruthy()
    playdateId = await insertPlaydate(env, markerToken, markerId, {
      title: `e2e ${marker.displayName} bubbles thread`,
      placeName: place.name,
      placeId: place.id,
      neighborhoodId: neighborhood.id,
      startsAt: localInstant(0, 20, 0),
      endsAt: localInstant(0, 21, 0),
    })
    await insertPing(env, viewerToken, playdateId, viewerId)

    await page.goto(`/inbox?thread=${playdateId}`)
    await settleOnRoute(page, '/inbox')
    await expect(page.getByText('No messages yet')).toBeVisible()
    const playdateHeader = page.locator('div.min-w-0 > p')
    // Exactly TWO lines: the name, then the one context line.
    await expect(playdateHeader).toHaveCount(2)
    await expect(playdateHeader.nth(0)).toHaveText(viewerName)
    await expect(page.getByTestId('inbox-thread-context')).toContainText(place.name)
    await expect(
      page.getByText(`Drop-in at ${place.name}`, { exact: true }),
      'the generated title line must not be repeated in the header',
    ).toHaveCount(0)
    // The empty state's face: HostAvatar's initial circle (this parent has no
    // photo), inside the same quiet invitation.
    const emptyState = page
      .getByText('Say hi below — this is where your conversation starts.')
      .locator('..')
    await expect(emptyState.locator('span[aria-hidden]')).toHaveCount(1)
    await expect(emptyState.locator('span[aria-hidden]')).toHaveText(
      viewerName.charAt(0).toUpperCase(),
    )
  } finally {
    await deleteMessages(env, createdIds)
    if (playdateId !== null) {
      // Host-only DELETE policy (0005); the fixture ping cascades with the post.
      const res = await fetch(`${env.url}/rest/v1/playdates?id=eq.${playdateId}`, {
        method: 'DELETE',
        headers: { apikey: env.anonKey, Authorization: `Bearer ${markerToken}` },
      })
      if (!res.ok) console.log(`[e2e bubbles cleanup] playdate ${playdateId} → ${res.status}`)
    }
  }
})

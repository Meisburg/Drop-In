/**
 * V33-12 — the counterpart's face, immediately left of their name (inbox).
 *
 * The founder's ruling: "when you see the name of a person that you're
 * messaging, you should see their profile picture in like a circle to the left
 * of their name." So this spec proves, by GEOMETRY (bounding boxes, not DOM
 * order), that the avatar box sits LEFT OF and vertically aligned with the
 * name box — in the thread header AND in the composer's recipient line — and
 * that a photo-less parent renders the primitive's own initial circle, never a
 * broken image. It also asserts what the slice must NOT do: no new
 * last-active/presence line anywhere (the activity-line count is unchanged
 * from today), and no per-bubble avatars (the bubble rows are untouched).
 *
 * Fixture discipline (docs/agents/e2e-fixture-convention.md): the counterpart
 * is a fresh `e2e-v-…` account signed up through the UI (no photo → the
 * initial-circle placeholder is the case under test), every seeded message
 * body is marked `e2e …`, and cleanup deletes exactly the ids this spec
 * created.
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
  settleOnRoute,
  signUpViewer,
} from './fixtures'

interface RestEnv {
  url: string
  anonKey: string
  serviceKey: string | undefined
}

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

async function boxOf(locator: Locator, label: string): Promise<Box> {
  const box = await locator.boundingBox()
  expect(box, `${label} must render a box to measure`).not.toBeNull()
  return box as Box
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
      `[e2e v33-12 cleanup] SUPABASE_SERVICE_ROLE_KEY is absent — ${ids.length} fixture message(s) CANNOT be deleted; the marker sweep must remove them.`,
    )
    return
  }
  for (const id of ids) {
    const res = await fetch(`${env.url}/rest/v1/messages?id=eq.${id}`, {
      method: 'DELETE',
      headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}` },
    })
    if (!res.ok) console.log(`[e2e v33-12 cleanup] ${id} → ${res.status}`)
  }
}

/** A local instant N days back at a chosen hour, as ISO. */
function localInstant(daysBack: number, hour: number, minute: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysBack)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

test('v33-12: the counterpart\'s avatar sits left of their name in the header and composer', async ({
  page,
  browser,
}) => {
  // A UI signup for the counterpart, then two REST inserts, then the geometry.
  test.setTimeout(240_000)

  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const viewerName = `e2e-v-${epoch}-avatar`
  const viewerEmail = `e2e-v-${epoch}-avatar@gmail.com`
  const viewerPassword = `e2e-v-pw-${epoch}-avatar`

  const { url, anonKey } = readSupabaseEnv()
  const { accessToken: markerToken, userId: markerId } = readMarkerSession()
  const env: RestEnv = { url, anonKey, serviceKey: readEnvFile().SUPABASE_SERVICE_ROLE_KEY }
  const threadUrl = (recipientId: string) => `/inbox?dm=${recipientId}`

  // --- The counterpart: a fresh e2e viewer, NO photo (the placeholder case). ---
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
  const { readSessionFromBrowserPage } = await import('./fixtures')
  const viewerSession = await readSessionFromBrowserPage(viewerPage)
  expect(viewerSession, 'the viewer must have a session after onboarding').not.toBeNull()
  const viewerId = (viewerSession as { userId: string }).userId
  const viewerToken = (viewerSession as { accessToken: string }).accessToken
  await viewerContext.close()

  const createdIds: string[] = []
  try {
    // Seed one message each way, so the thread has bubbles (the "no per-bubble
    // avatar" claim needs real bubble rows to be unchanged against).
    createdIds.push(
      await insertMessage(env, viewerToken, viewerId, markerId, 'e2e avatar y1', localInstant(0, 9, 0)),
      await insertMessage(env, markerToken, markerId, viewerId, 'e2e avatar t1', localInstant(0, 9, 1)),
    )

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(threadUrl(viewerId))
    await settleOnRoute(page, '/inbox')
    await expect(page.getByTestId('own-message')).toHaveCount(1)
    await expect(page.getByTestId('other-message')).toHaveCount(1)

    // ------------------------------------------------------- header geometry
    // The header's name paragraph: the first <p> inside the header block.
    const headerName = page.locator('div.min-w-0 > p').first()
    await expect(headerName).toHaveText(viewerName)
    const nameBox = await boxOf(headerName, 'the header name')

    // The header's avatar: the rounded-full circle that is a SIBLING of the
    // name block, inside the same header row.
    const headerRow = headerName.locator('..').locator('..')
    const headerAvatar = headerRow.locator('span.rounded-full').first()
    await expect(headerAvatar).toBeVisible()
    const avatarBox = await boxOf(headerAvatar, 'the header avatar')

    // AC1: the avatar's box is LEFT OF the name's box…
    expect(
      avatarBox.x + avatarBox.width,
      `the avatar must end before the name starts — avatar ends at ${avatarBox.x + avatarBox.width}, the name starts at ${nameBox.x}`,
    ).toBeLessThanOrEqual(nameBox.x + 1)
    // …and is VERTICALLY ALIGNED with it (their centers share a band within
    // half an avatar-height, i.e. they sit on the same line).
    const avatarMidY = avatarBox.y + avatarBox.height / 2
    const nameMidY = nameBox.y + nameBox.height / 2
    expect(
      Math.abs(avatarMidY - nameMidY),
      `the avatar and the name must share a vertical band — avatar center ${avatarMidY}, name center ${nameMidY}`,
    ).toBeLessThanOrEqual(avatarBox.height / 2 + 2)

    // AC3: a photo-less parent renders the primitive's INITIAL CIRCLE, not a
    // broken image. The placeholder is HostAvatar's span (rounded-full,
    // indigo tones) carrying the name's first letter — never an <img>.
    expect(
      await headerAvatar.evaluate((el) => el.tagName),
      'a photo-less counterpart must render the initial circle, not an img',
    ).toBe('SPAN')
    expect(await headerAvatar.textContent()).toBe(viewerName.charAt(0).toUpperCase())
    // No broken-image glyph anywhere in the header.
    await expect(headerRow.locator('img[alt=""]')).toHaveCount(0)

    // --------------------------------------------------- composer recipient
    // AC2: the composer region shows the recipient's face beside their name
    // the same way — the small avatar, left of the recipient name line.
    const composer = page.getByTestId('composer')
    const composerRecipientName = composer.locator('p.truncate.text-xs').first()
    await expect(composerRecipientName).toHaveText(viewerName)
    const recipientNameBox = await boxOf(composerRecipientName, 'the composer recipient name')
    const composerAvatar = composer.locator('span.rounded-full').first()
    await expect(composerAvatar).toBeVisible()
    const composerAvatarBox = await boxOf(composerAvatar, 'the composer avatar')
    expect(
      composerAvatarBox.x + composerAvatarBox.width,
      'the composer avatar must sit left of the recipient name',
    ).toBeLessThanOrEqual(recipientNameBox.x + 1)
    const composerAvatarMidY = composerAvatarBox.y + composerAvatarBox.height / 2
    const recipientNameMidY = recipientNameBox.y + recipientNameBox.height / 2
    expect(Math.abs(composerAvatarMidY - recipientNameMidY)).toBeLessThanOrEqual(
      composerAvatarBox.height / 2 + 2,
    )

    // ------------------------------------------- AC4: no presence line added
    // The honest activity line ("Active today") is a LIST-row feature keyed on
    // last_seen_at; the thread view (header, messages, composer) carries none.
    // Assert its count in the open thread is zero — unchanged from today, where
    // the thread rendered no such line either.
    await expect(page.locator('[data-testid^="inbox-activity-"]')).toHaveCount(0)
    // And the words the app refuses to claim are nowhere in the thread.
    await expect(page.getByText(/active now|online/i)).toHaveCount(0)

    // ------------------------------------------ AC5: no per-bubble avatars
    // Every bubble row still carries exactly its own content: the optional
    // sender-label paragraph, the body, and the reaction/time strip. The claim
    // is that NO AVATAR was added inside a bubble. ⚠️ It must NOT be asserted as
    // "no span.rounded-full": every bubble's reaction pill is itself a
    // `rounded-full` span (reactionButtonClasses), so that selector counts
    // reaction controls, not faces, and would fail on a correct page. Assert
    // against the avatar testids this slice added instead — the precise claim.
    const region = page.getByTestId('thread-messages')
    await expect(region.getByTestId('thread-header-avatar')).toHaveCount(0)
    await expect(region.getByTestId('composer-recipient-avatar')).toHaveCount(0)
    await expect(region.locator('img')).toHaveCount(0)
    // The existing bubble shape is intact: two bodies, each with its reaction
    // control (the specs that own those shapes pass untouched elsewhere too).
    await expect(page.getByTestId('own-message')).toHaveCount(1)
    await expect(page.getByTestId('other-message')).toHaveCount(1)
  } finally {
    await deleteMessages(env, createdIds)
  }
})

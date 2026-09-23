/**
 * Spec (V9 ticket 10): a child's first name is not public property.
 *
 * WHAT IT WALKS (the ticket's e2e AC, plus the coupling and the copy's
 * substrate). The host marker creates TWO named kids (ages 3 and 6 → the
 * derived `ages 3–6`) and posts a drop-in with them picked through the real
 * /new UI.
 *   1. THE HOST sees both names on the detail page's "Kids coming" line
 *      ("Ages 3–6 · Anna …, Zed …") — the same line, the same page.
 *   2. A PINGER (a fresh `e2e-v-*` account that pinged that drop-in through
 *      the card's going toggle, gated on the going_pings row landing) sees the
 *      SAME names on the SAME page.
 *   3. A STRANGER (a second fresh `e2e-v-*` account, same zip + radius, which
 *      never pinged anything) sees the post, its ages line, and NO kid name —
 *      on the page and over the wire.
 *   4. The stranger's own FEED CARD still reads `ages 3–6` — THE COUPLING V9
 *      ticket 05 warned about: the derived range used to come from a batched
 *      `playdate_kids` ⋈ `kids.age` read under the very policy migration 0040
 *      narrows, and that read is best-effort by contract, so a naive narrowing
 *      would have blanked this line in silence (no error, no warning, nothing).
 *   5. A direct REST read as the stranger returns NOTHING for that family's
 *      `kids` and for the post's `playdate_kids` rows (names, ages AND the
 *      kid-photo `avatar_url` — the same row, so the same gate), while the
 *      OWNER's own read still returns their rows (the positive control that
 *      makes the empty answers evidence rather than a broken table).
 *   6. Push payloads, the ICS export and the signed-out surface carry no kid
 *      name (asserted, not assumed).
 *   7. THE FORGED ATTACH (review cycle 1, F2): the gate reads attachment rows
 *      as its input, so the spec now also proves the INSERT policies refuse an
 *      attachment naming a kid the caller does NOT own — through both tables —
 *      and that the legitimate write (a pinger attaching their OWN kid) still
 *      lands. See the F2 block at the end of the test.
 *
 * ============================ THE PIVOT ============================
 * 0040 IS APPLIED, so there is NO DOCUMENTED RED ANY MORE: everything in this
 * file must be green. The paragraph below is the record of what this spec was
 * built to catch, kept because it is the reason each assertion is shaped the
 * way it is.
 *
 * THE ASSERTIONS THAT WERE RED UNTIL 0040 WAS APPLIED were the STRANGER's, in
 * both halves, and only those:
 *   (a) `await expect(strangerLine).toHaveText('Kids coming: Ages 3–6')` —
 *       pre-0040 the line read `Kids coming: Ages 3–6 · Anna …, Zed …`,
 *       because the detail page's read ran straight at `playdate_kids` (no
 *       host/pinger check anywhere) and both tables were `using (true)` for
 *       `authenticated`; and
 *   (b) `expect(await strangerKidsRead.json()).toEqual([])` (and the same for
 *       `playdate_kids`) — pre-0040 that read answered with the family's real
 *       rows.
 * Those two are still `expect.soft` (and the F2 block is too) so that BOTH
 * halves of a failing pair report in one run instead of the first one hiding
 * the second. Soft failures still FAIL the test — nothing here is skippable.
 * Every other assertion in this file was green before and after the migration:
 * the host's and the pinger's halves, the stranger's feed card, the stranger's
 * /u/:handle section, the owner's own read, the anon fail-closed reads and the
 * push/ICS checks. A failure is a real assertion failure with the received
 * text quoted — never a crash, never a bare timeout.
 *
 * WHY THE NEGATIVE IS NOT VACUOUS (and why the order below is deliberate): the
 * same page is opened by three different viewers, and the HOST's and the
 * PINGER's assertions require the very names the stranger's assertion forbids —
 * asserted BEFORE the stranger's, on the same URL, after the stranger's page
 * is proven to have rendered (the heading, the ages line and the going count
 * are all asserted present). A `toHaveCount(0)` that would also pass on a
 * broken page is not evidence, so the page's own content is pinned first.
 *
 * HOW THE GATE ITSELF IS PROVEN, rather than its side effects: the detail
 * page's names now come from the gated SECURITY DEFINER `get_playdate_kids`
 * (host / going / moderator — 0026's gate), so the host's and the pinger's
 * reads of it are asserted positively, and the stranger's is asserted to be
 * EMPTY — three different answers to one function. The table reads underneath
 * are asserted separately, because closing the tables is the other half of the
 * AC (a client that stops showing a name while the rows stay readable is not a
 * fix).
 *
 * Cleanup (best-effort per house, the feed-ages / kids-v3 pattern): the
 * marker's playdate rows and kid rows are deleted over REST with the MARKER's
 * own JWT (the host-only and owner-only DELETE policies) — `playdate_kids`
 * rows cascade from both FKs (0022), and the pinger's `going_pings` /
 * `ping_kids` rows cascade with the post and are ALSO deleted with the
 * PINGER's own JWT as a belt-and-braces check. The PINGER's OWN kid (created
 * for the F2 probe) is deleted with the pinger's own JWT too, and the F2 probe
 * rows are deleted the moment they are asserted, so a failing run cannot leave
 * a forged attachment behind. The `e2e-v-*` test ACCOUNTS are left for the
 * coordinator's sweep (the sweep owns `email like 'e2e-%'`); no rows are.
 * Every failure is logged, never fatal.
 */
import { expect, test } from '@playwright/test'
import type { Browser, BrowserContext, Page } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'
// The two payload builders the "no kid name crosses" AC names: the ICS export
// the detail page hands a parent, and the push copy the sender ships. They are
// PURE, so the spec can call the real production builders rather than a copy.
import { buildIcs } from '../src/lib/ics'
import { NOTIFICATION_KINDS, buildNotificationPayload } from '../src/lib/push'
import {
  editTitle, localDatePlusDays, readMarkerMeta, readMarkerSession,
  readSupabaseEnv, settleOnRoute, signUpViewer, stepStartTimeOnce,
} from './fixtures'

const PLACE = 'E2E Names lot'

/** The marker's two kids: names that differ alphabetically (the line's order) and ages 3 / 6 (the derived `Ages 3–6`). */
function kidsFor(epoch: number): Array<{ first_name: string; age: number }> {
  return [
    { first_name: `Anna ${epoch}`, age: 3 },
    { first_name: `Zed ${epoch}`, age: 6 },
  ]
}

interface Viewer {
  context: BrowserContext
  page: Page
  /** The viewer's own session (read out of its storageState) — the REST probes. */
  userId: string
  accessToken: string
}

/**
 * Sign up + onboard a fresh viewer (the while-away / ticket-04 pattern): a
 * separate signed-out context, the real /login signup flow, then the location
 * step with the MARKER's zip and radius so the marker's post is in this
 * viewer's radius feed.
 *
 * The session is read back from a temp storageState file (readMarkerSession is
 * the house parser) because the stranger's REST assertions have to be issued
 * as the STRANGER — that is the whole point of the pivot: a client-side
 * absence is not a proof of a closed table.
 */
async function signUpAndOnboard(
  browser: Browser,
  input: {
    name: string
    email: string
    password: string
    homeZip: string
    radiusMiles: number
  },
): Promise<Viewer> {
  const context = await browser.newContext({
    baseURL: 'http://localhost:4173',
    storageState: { cookies: [], origins: [] },
  })
  const page = await context.newPage()
  // V20 t06: signup is first + last name + address now — one shared helper
  // (`signUpViewer`) so the form's field list lives in one place.
  await signUpViewer(page, {
    name: input.name,
    email: input.email,
    password: input.password,
  })

  await page.getByRole('heading', { name: 'Set your location' }).waitFor()
  await page.getByPlaceholder('e.g. 98107').fill(input.homeZip)
  await page
    .locator('select')
    .first()
    .selectOption({ label: `${input.radiusMiles} miles` })
  await page.getByRole('button', { name: /^Continue/ }).click()
  await page.getByRole('heading', { name: 'Near you' }).waitFor()

  const statePath = path.join(os.tmpdir(), `dropin-e2e-${input.name}.json`)
  await context.storageState({ path: statePath })
  const session = readMarkerSession(statePath)
  return { context, page, userId: session.userId, accessToken: session.accessToken }
}

/** One card on a feed, found by its title (the golden-path pattern). */
function cardFor(page: Page, title: string) {
  return page.locator('a').filter({ hasText: title }).first()
}

/**
 * POST one read-only RPC and hand back its status + raw body.
 *
 * THE PRESENCE OF THE FUNCTION IS ASSERTED HARD (review cycle 1, F3). This
 * helper used to treat PostgREST's PGRST202 / 404 as a documented
 * not-yet-applied state and skip the probes built on it — which meant that if
 * `get_playdate_kids` were missing, dropped or misnamed AFTER 0040, the one
 * spec that proves the gate would stay green while the client quietly ran its
 * (now deleted) legacy read. 0040 is applied, so an absent function is a
 * FAILURE, not a state: anon and a signed-in caller must both be able to reach
 * it, and anything but 200 is reported with the wire body attached.
 */
async function callRpc(
  url: string,
  fn: string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<{ status: number; raw: string }> {
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const raw = await res.text()
  if (res.status !== 200) {
    throw new Error(
      `the RPC ${fn} answered HTTP ${res.status} (expected 200 — migration 0040 is applied, so an ` +
        `absent/unreachable function is a FAILURE here, not a skippable state; the client has no ` +
        `fallback path any more): ${raw}`,
    )
  }
  return { status: res.status, raw }
}

/** The detail page's "Kids coming" line (the one line this whole spec is about). */
function kidsLine(page: Page) {
  return page.locator('p').filter({ hasText: 'Kids coming:' })
}

/** Post one drop-in through the real /new UI, with the marker's two kids picked. */
async function postWithKids(page: Page, title: string, labels: string[]): Promise<string> {
  await page.goto('/new')
  await settleOnRoute(page, '/new')
  await editTitle(page)
  await page.getByPlaceholder('e.g. Playground time at Green Lake').fill(title)
  await page.getByPlaceholder('e.g. Green Lake playground, near the boathouse').fill(PLACE)
  await page.locator('input[type="date"]').fill(localDatePlusDays(1))
  const start = await stepStartTimeOnce(page)
  // V13 ticket 03: no duration chips on /new — the End stepper shows
  // the current end time (start + auto-duration). Verify it's visible.
  await expect(page.getByTestId('end-time-label')).toBeVisible()
  for (const label of labels) {
    const chip = page.getByRole('button', { name: label, exact: true })
    await chip.click()
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
  }
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/', { timeout: 30_000 })
  const card = cardFor(page, title)
  await expect(card).toBeVisible()
  const href = (await card.getAttribute('href')) ?? ''
  if (!href.startsWith('/playdate/')) {
    throw new Error(`the card for "${title}" has no detail href (got "${href}")`)
  }
  return href
}

/**
 * The marker's kid rows created for this run (the /new chips need them live),
 * returned WITH their ids — the forged-attach probe (F2) needs a real kid uuid.
 */
async function createMarkerKids(
  kids: Array<{ first_name: string; age: number }>,
): Promise<Array<{ id: string; first_name: string; age: number }>> {
  const { url, anonKey } = readSupabaseEnv()
  const { accessToken, userId } = readMarkerSession()
  const headers: Record<string, string> = {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
  // Self-cleaning first (the feed-ages F10 lesson): a kid left behind by another
  // broken run would otherwise make this run's line assertions ambiguous.
  const clear = await fetch(`${url}/rest/v1/kids?profile_id=eq.${userId}`, {
    method: 'DELETE',
    headers,
  })
  if (!clear.ok) {
    throw new Error(`could not clear the marker's kids HTTP ${clear.status}: ${await clear.text()}`)
  }
  for (const kid of kids) {
    const res = await fetch(`${url}/rest/v1/kids`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ profile_id: userId, ...kid }),
    })
    if (!res.ok) {
      throw new Error(`marker kid (${kid.first_name}) insert HTTP ${res.status}: ${await res.text()}`)
    }
  }
  const read = await fetch(
    `${url}/rest/v1/kids?profile_id=eq.${userId}&select=id,first_name,age&order=age`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` } },
  )
  if (!read.ok) throw new Error(`marker kid read-back HTTP ${read.status}: ${await read.text()}`)
  const rows = (await read.json()) as Array<{ id: string; first_name: string; age: number }>
  for (const kid of kids) {
    if (!rows.some((row) => row.first_name === kid.first_name && row.age === kid.age)) {
      throw new Error(
        `the marker's own kid (${kid.first_name}) is missing after the insert — rows: ${JSON.stringify(rows)}`,
      )
    }
  }
  return rows
}

/** The viewers this run created, so afterEach can clean up after a mid-test failure. */
const created: {
  pinger: Viewer | null
  stranger: Viewer | null
  /** The pinger's own kid (the forged-attach victim) — deleted with the pinger's JWT. */
  pingerKidId: string | null
} = {
  pinger: null,
  stranger: null,
  pingerKidId: null,
}

test('a kid’s name reaches the host and a pinger — and never a signed-in stranger', async ({
  page,
  browser,
}) => {
  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const title = `e2e t10 kids ${epoch}`
  const kids = kidsFor(epoch)
  const [anna, zed] = kids
  const names = kids.map((kid) => kid.first_name)
  // The line as the HOST and the PINGER must read it, and as the STRANGER must
  // NOT: ages first (ticket 05), names last (ticket 10's gate).
  const agesOnly = 'Kids coming: Ages 3–6'
  const withNames = `${agesOnly} · ${anna.first_name}, ${zed.first_name}`

  const { url, anonKey } = readSupabaseEnv()
  const markerSession = readMarkerSession()
  const markerHeaders: Record<string, string> = {
    apikey: anonKey,
    Authorization: `Bearer ${markerSession.accessToken}`,
  }

  // --- 0. The marker's two kids + the post, all through the real paths. ---
  const markerKids = await createMarkerKids(kids)
  const annaId = markerKids.find((row) => row.first_name === anna.first_name)?.id ?? ''
  if (annaId === '') throw new Error('the marker kid read-back lost the id (the F2 probe needs it)')
  const detailPath = await postWithKids(
    page,
    title,
    kids.map((kid) => `${kid.first_name} · Age ${kid.age}`),
  )
  const postId = detailPath.slice('/playdate/'.length)

  // --- 1. THE HOST (the marker's own signed-in context). The names must be
  //     there — this is half of what makes the stranger's absence meaningful.
  //     The card is asserted first: the ages line is the coupling (step 4 for
  //     the stranger; here it is the host's own card, the ticket's "a live card
  //     still shows ages 3–6"). ---
  await expect(cardFor(page, title).getByTestId('card-age-range')).toHaveText('ages 3–6')
  await page.goto(detailPath)
  await page.getByRole('heading', { name: title, exact: true }).waitFor()
  await expect(kidsLine(page)).toHaveText(withNames)

  // --- 1b. THE HOST-SIDE READS SURVIVE THE TIGHTENING (T4, the other half of
  //     the 0014 lesson). /edit's prefill reads this post's `playdate_kids` rows
  //     AS THE HOST (db.listPlaydateKidIds — the same narrowed table), so both
  //     chips must come back PRESSED: if the new policy excluded the host, the
  //     picker would render EMPTY here and the post's selection would vanish on
  //     the next save (a silent 2xx-everything failure, which is the failure
  //     mode this ticket hunts). Then the save round-trips the selection and the
  //     detail line still names both kids. Green before AND after 0040 — the
  //     host clause is in the policy, so this is the proof it is there. ---
  await page.goto(`${detailPath}/edit`)
  await expect(page.getByText("Kids you're bringing")).toBeVisible()
  for (const kid of kids) {
    await expect(
      page.getByRole('button', { name: `${kid.first_name} · Age ${kid.age}`, exact: true }),
    ).toHaveAttribute('aria-pressed', 'true')
  }
  await page.getByRole('button', { name: 'Save changes' }).click()
  await page.waitForURL(new RegExp(`${detailPath}$`), { timeout: 30_000 })
  await page.getByRole('heading', { name: title, exact: true }).waitFor()
  await expect(kidsLine(page)).toHaveText(withNames)

  // --- 2. THE PINGER: a fresh account that says it's going (through the card's
  //     own toggle), then reads the SAME page. The ping is REST-gated so the
  //     read cannot beat the write (the while-away pattern) — without it this
  //     half would be a race, not evidence. ---
  const pinger = await signUpAndOnboard(browser, {
    name: `e2e-v-${epoch}p`,
    email: `e2e-v-${epoch}p@gmail.com`,
    password: `e2e-v-pw-${epoch}p`,
    homeZip: marker.homeZip,
    radiusMiles: marker.radiusMiles,
  })
  created.pinger = pinger
  // The PINGER'S OWN kid, created through the real owner-scoped policy
  // (kids_insert_own: profile_id = auth.uid()). It is the FORGED-ATTACH probe's
  // victim: a kid that lives in another family and is attached to nothing of the
  // marker's. Nothing selects it (the "who's coming with you" picker writes only
  // on an explicit save tap), so this costs the ping flow nothing.
  const pingerKidRes = await fetch(`${url}/rest/v1/kids`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${pinger.accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ profile_id: pinger.userId, first_name: `Pip ${epoch}`, age: 5 }),
  })
  if (!pingerKidRes.ok) {
    throw new Error(`the pinger's own kid insert HTTP ${pingerKidRes.status}: ${await pingerKidRes.text()}`)
  }
  const [pingerKid] = (await pingerKidRes.json()) as Array<{ id: string; first_name: string }>
  created.pingerKidId = pingerKid.id
  const pingerCard = cardFor(pinger.page, title)
  await expect(pingerCard).toBeVisible()
  await pingerCard.getByRole('button', { name: /^Say we’re going to/ }).click()
  await expect(
    pingerCard.getByRole('button', { name: /^Going — tap to take it back$/ }),
  ).toBeVisible()
  await expect
    .poll(
      async () => {
        const res = await fetch(
          `${url}/rest/v1/going_pings?playdate_id=eq.${postId}&select=profile_id`,
          { headers: markerHeaders },
        )
        if (!res.ok) throw new Error(`going_pings poll HTTP ${res.status}`)
        return ((await res.json()) as unknown[]).length
      },
      { timeout: 10_000 },
    )
    .toBeGreaterThanOrEqual(1)
  await pinger.page.goto(detailPath)
  await pinger.page.getByRole('heading', { name: title, exact: true }).waitFor()
  await expect(kidsLine(pinger.page)).toHaveText(withNames)

  // --- 3. THE STRANGER: a second fresh account, same radius, no ping. ---
  const stranger = await signUpAndOnboard(browser, {
    name: `e2e-v-${epoch}x`,
    email: `e2e-v-${epoch}x@gmail.com`,
    password: `e2e-v-pw-${epoch}x`,
    homeZip: marker.homeZip,
    radiusMiles: marker.radiusMiles,
  })
  created.stranger = stranger
  const strangerHeaders: Record<string, string> = {
    apikey: anonKey,
    Authorization: `Bearer ${stranger.accessToken}`,
  }

  // 3a. THE COUPLING, on the stranger's OWN read path: their card still reads
  //     `ages 3–6` — the derived range survives the tightening because it now
  //     comes from the ages-only SECURITY DEFINER function rather than from the
  //     narrowed table. This is the assertion that would catch the silent
  //     blanking ticket 05 recorded, and it is GREEN before AND after 0040.
  const strangerCard = cardFor(stranger.page, title)
  await expect(strangerCard).toBeVisible()
  await expect(strangerCard.getByTestId('card-age-range')).toHaveText('ages 3–6')
  for (const name of names) {
    await expect(strangerCard).not.toContainText(name)
  }

  // 3b. /u/:handle — the accepted cost, in the UI. The kids section renders in
  //     the SELF view alone (the policy is per KID, so a viewer who pinged one
  //     drop-in would otherwise be handed a partial list of children, which
  //     reads as the whole family). Green before AND after 0040: the client
  //     gate is this ticket's half, the policy is the other.
  await stranger.page.goto(`/u/${encodeURIComponent(marker.displayName)}`)
  await expect(stranger.page.getByRole('heading', { name: `@${marker.displayName}` })).toBeVisible()
  await expect(stranger.page.getByRole('heading', { name: 'Kids', exact: true })).toHaveCount(0)
  for (const name of names) {
    await expect(stranger.page.locator('body')).not.toContainText(name)
  }

  // 3c. THE PAGE RENDERS — pinned BEFORE the negative, so "no kid name" can
  //     never be explained by an empty or broken page: the post, its ages line
  //     and the going section are all there.
  await stranger.page.goto(detailPath)
  await expect(stranger.page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  await expect(kidsLine(stranger.page)).toBeVisible()
  await expect(stranger.page.getByText(PLACE)).toBeVisible()

  // --- 4. Push + ICS + the signed-out surface: no kid name crosses any of
  //     them. Green before AND after 0040 (they are structural), asserted here
  //     because the AC says "asserted, not assumed". ---
  const postRes = await fetch(
    `${url}/rest/v1/playdates?id=eq.${postId}` +
      `&select=title,place,starts_at,ends_at,age_hint,details`,
    { headers: markerHeaders },
  )
  if (!postRes.ok) throw new Error(`post read HTTP ${postRes.status}: ${await postRes.text()}`)
  const [postRow] = (await postRes.json()) as Array<{
    title: string
    place: string
    starts_at: string
    ends_at: string
    age_hint: string | null
    details: string | null
  }>
  const ics = buildIcs(postRow)
  // The positive control first: an empty string would satisfy every absence
  // assertion below for the wrong reason.
  expect(ics).toContain(`SUMMARY:${title}`)
  for (const name of names) expect(ics).not.toContain(name)

  for (const kind of NOTIFICATION_KINDS) {
    const payload = buildNotificationPayload({
      kind,
      playdateId: postId,
      postTitle: title,
      actorName: 'A parent',
      goingCount: 1,
    })
    // Exactly three keys, and the title is real (the same non-vacuity rule).
    expect(Object.keys(payload).sort()).toEqual(['body', 'title', 'url'])
    expect(payload.title.length).toBeGreaterThan(0)
    for (const name of names) expect(JSON.stringify(payload)).not.toContain(name)
  }

  const anonHeaders: Record<string, string> = { apikey: anonKey }
  const anonKids = await fetch(`${url}/rest/v1/kids?select=id,first_name,age,avatar_url`, {
    headers: anonHeaders,
  })
  expect(anonKids.status).toBe(200)
  expect(await anonKids.json()).toEqual([])
  const anonPlaydateKids = await fetch(`${url}/rest/v1/playdate_kids?select=id,kid_id`, {
    headers: anonHeaders,
  })
  expect(anonPlaydateKids.status).toBe(200)
  expect(await anonPlaydateKids.json()).toEqual([])
  const anonPublic = await fetch(`${url}/rest/v1/rpc/get_public_playdate`, {
    method: 'POST',
    headers: { ...anonHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_id: postId }),
  })
  expect(anonPublic.status).toBe(200)
  const anonRaw = await anonPublic.text()
  expect(JSON.parse(anonRaw).title).toBe(title)
  for (const name of names) expect(anonRaw).not.toContain(name)

  // --- 5. THE OWNER'S OWN READ STILL WORKS (the 0014 interaction and the other
  //     positive control): the owner clause is IN the new policy, so the owner
  //     keeps reading the very rows the stranger must not see. Green before and
  //     after 0040. ---
  const ownerKids = await fetch(
    `${url}/rest/v1/kids?profile_id=eq.${markerSession.userId}&select=first_name,age&order=age`,
    { headers: markerHeaders },
  )
  expect(ownerKids.status).toBe(200)
  expect(await ownerKids.json()).toEqual([
    { first_name: anna.first_name, age: anna.age },
    { first_name: zed.first_name, age: zed.age },
  ])

  // ================== THE PIVOT (RED until 0040 is applied) ==================
  // The two halves below are SOFT assertions ON PURPOSE, and this is the only
  // place in the file that uses them: pre-0040 BOTH are false for the same
  // reason (the tables are `using (true)` for authenticated), and a hard
  // assertion would abort after the first one — hiding the table-level half of
  // the evidence behind the page-level half. Soft failures still FAIL the test
  // (Playwright reports them at the end), so this makes the pre-apply red
  // COMPLETE rather than quieter.
  //
  // 6a. The stranger's detail line: the ages and NO NAME. Pre-0040 this line
  //     reads "... · Anna …, Zed …" — the detail page's read had no host/pinger
  //     check at all and `playdate_kids` / `kids` were both `using (true)`, so
  //     naming a stranger's child took one signed-in request.
  await expect.soft(kidsLine(stranger.page)).toHaveText(agesOnly)
  for (const name of names) {
    await expect.soft(stranger.page.locator('body')).not.toContainText(name)
  }

  // 6b. And the same fact at the level that actually matters — the TABLES. A
  //     client that stops rendering a name while the rows stay readable is not
  //     a fix, so the stranger's own JWT reads the family's `kids` rows (names,
  //     ages AND the kid-photo avatar_url — one row, one gate) and that post's
  //     `playdate_kids` rows, and both must be EMPTY.
  //     NON-VACUITY: these two empty answers cannot mean "the rows are gone" —
  //     the host's and the pinger's lines above (both carrying the names) and
  //     the OWNER's own read directly above (exactly these two kids, by name
  //     and age) prove the rows exist at the moment the stranger's read answers
  //     empty. Together the four reads are one fact: same rows, different
  //     viewers.
  const strangerKidsRead = await fetch(
    `${url}/rest/v1/kids?profile_id=eq.${markerSession.userId}` +
      `&select=id,first_name,age,avatar_url`,
    { headers: strangerHeaders },
  )
  expect.soft(strangerKidsRead.status).toBe(200)
  expect.soft(await strangerKidsRead.json()).toEqual([])
  const strangerAttachRead = await fetch(
    `${url}/rest/v1/playdate_kids?playdate_id=eq.${postId}&select=id,kid_id`,
    { headers: strangerHeaders },
  )
  expect.soft(strangerAttachRead.status).toBe(200)
  expect.soft(await strangerAttachRead.json()).toEqual([])

  // 6c. The gated function's own three answers, asserted directly: empty for the
  //     stranger, named for the host and the pinger — one function, three
  //     viewers, which is what proves the GATE rather than a coincidence.
  //     HARD, not skipped (F3): 0040 is applied, so the function's presence is
  //     part of the contract, and callRpc throws on anything but 200.
  const strangerNames = await callRpc(url, 'get_playdate_kids', { p_id: postId }, strangerHeaders)
  expect(strangerNames.status).toBe(200)
  expect(JSON.parse(strangerNames.raw)).toEqual([])
  const hostNames = await callRpc(url, 'get_playdate_kids', { p_id: postId }, markerHeaders)
  const pingerNames = await callRpc(
    url,
    'get_playdate_kids',
    { p_id: postId },
    { apikey: anonKey, Authorization: `Bearer ${pinger.accessToken}` },
  )
  const firstNameOf = (payload: string) =>
    (JSON.parse(payload) as Array<{ first_name: string }>).map((row) => row.first_name).sort()
  expect(firstNameOf(hostNames.raw)).toEqual([...names].sort())
  expect(firstNameOf(pingerNames.raw)).toEqual([...names].sort())

  // 6d. The ages-only derivation, asserted for its PAYLOAD: one row for the
  //     post, two integers, and no name, no kid id and no avatar_url anywhere
  //     in the answer (the AC's "ages only" — and the reason the stranger's
  //     card can still read `ages 3–6` without the rows).
  const ages = await callRpc(url, 'kid_ages_for', { p_ids: [postId] }, strangerHeaders)
  expect(ages.status).toBe(200)
  expect(JSON.parse(ages.raw)).toEqual([
    { playdate_id: postId, age_min: anna.age, age_max: zed.age },
  ])
  for (const forbidden of [...names, 'first_name', 'kid_id', 'avatar_url']) {
    expect(ages.raw).not.toContain(forbidden)
  }

  // ============== F2: THE FORGED ATTACH (review cycle 1) ==============
  // The gate this spec proves reads ATTACHMENT rows as its input, so an
  // unguarded INSERT into either attachment table is a bypass. Before the
  // amendment, `playdate_kids_insert_host` (0022) checked only that the caller
  // hosted the post and `ping_kids_insert_own` (0026) only that the row was the
  // caller's own — neither asked whose KID was being attached. So a parent who
  // held ONE kid uuid could attach that child to their own post or ping, and
  // clause (b)/(c) of the new SELECT policy would then be true for them: they
  // could read the child's whole row (including the two columns
  // `get_playdate_kids` withholds), and a forged ping row additionally puts the
  // child's name + age in front of that post's host and every pinger through
  // 0026's SECDEF `get_kids_going`.
  //
  // The uuid is how cheap this was: pre-0040 ANY signed-in account could read
  // every kid row in the project in one request (the live probe in this
  // ticket's report), so enumeration was never the hard part. Here we know the
  // id because we created the kid — the same knowledge the forge needs.
  //
  // SOFT, and the only other soft block in this file: pre-amendment BOTH forges
  // SUCCEED, and a hard assertion would stop at the first one — hiding the
  // second table's half of the evidence. Soft failures still fail the test.
  const forgedPlaydateKids = await fetch(`${url}/rest/v1/playdate_kids`, {
    method: 'POST',
    headers: { ...markerHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ playdate_id: postId, kid_id: pingerKid.id }),
  })
  const forgedPlaydateKidsBody = await forgedPlaydateKids.text()
  // No `Prefer: return=representation` on purpose (the 0014 lesson): a 2xx here
  // must mean THE ROW WAS WRITTEN, not that a read-back happened to pass.
  expect.soft(
    forgedPlaydateKids.ok,
    `forge A (the HOST attaching another family's kid ${pingerKid.first_name} to their own post) ` +
      `answered HTTP ${forgedPlaydateKids.status} ${forgedPlaydateKidsBody} — it must be REFUSED ` +
      `(42501: the insert policy requires the kid to be the caller's own)`,
  ).toBe(false)
  const forgeABody = JSON.parse(forgedPlaydateKidsBody || '{}') as { code?: string }
  if (!forgedPlaydateKids.ok) expect.soft(forgeABody.code).toBe('42501')

  // THE CONSEQUENCE, which is what the forge is FOR: the forging host reading
  // the victim's whole row. Before the fix this answers with the family's real
  // kid; after it, nothing — the attachment never existed.
  const forgerReadsVictim = await fetch(
    `${url}/rest/v1/kids?id=eq.${pingerKid.id}&select=id,first_name,age,avatar_url,likes`,
    { headers: markerHeaders },
  )
  expect.soft(forgerReadsVictim.status).toBe(200)
  expect
    .soft(await forgerReadsVictim.json())
    .toEqual([])

  const forgedPingKids = await fetch(`${url}/rest/v1/ping_kids`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${pinger.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      playdate_id: postId,
      profile_id: pinger.userId,
      kid_id: annaId,
    }),
  })
  const forgedPingKidsBody = await forgedPingKids.text()
  expect.soft(
    forgedPingKids.ok,
    `forge B (a PINGER attaching the host's kid ${anna.first_name} to their own ping) answered ` +
      `HTTP ${forgedPingKids.status} ${forgedPingKidsBody} — it must be REFUSED (42501: the insert ` +
      `policy requires the kid to be the caller's own)`,
  ).toBe(false)
  if (!forgedPingKids.ok) {
    expect.soft((JSON.parse(forgedPingKidsBody || '{}') as { code?: string }).code).toBe('42501')
  }

  // The second-order leak, asserted where it escapes the gate entirely: 0026's
  // SECDEF `get_kids_going` reads the attachment rows and never consults any
  // policy, so a landed forged ping row would name the victim to the host and
  // to every pinger. With the forge refused, the pinger's ping carries no kids.
  const kidsGoing = await callRpc(
    url,
    'get_kids_going',
    { p_id: postId },
    { apikey: anonKey, Authorization: `Bearer ${pinger.accessToken}` },
  )
  expect.soft(kidsGoing.status).toBe(200)
  expect.soft(JSON.parse(kidsGoing.raw)).toEqual([])

  // THE NON-VACUITY CONTROL for the amendment: the clause refuses a FORGED
  // attach, not attaching at all. The pinger attaching their OWN kid to their
  // OWN ping is the app's real "who's coming with you" write and must still
  // land — so the tightened policy is proven to be a narrowing, not a wall.
  const legitPingKid = await fetch(`${url}/rest/v1/ping_kids`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${pinger.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      playdate_id: postId,
      profile_id: pinger.userId,
      kid_id: pingerKid.id,
    }),
  })
  expect(
    legitPingKid.ok,
    `the pinger attaching their OWN kid failed with HTTP ${legitPingKid.status} ` +
      `${await legitPingKid.text()} — the ownership clause must narrow the policy, not block it`,
  ).toBe(true)
  const afterLegit = await callRpc(
    url,
    'get_kids_going',
    { p_id: postId },
    { apikey: anonKey, Authorization: `Bearer ${pinger.accessToken}` },
  )
  // CONTAINS, not "equals exactly one": if the forge above LANDED (which is the
  // pre-amendment state this round is measuring) this answer legitimately holds
  // the victim's name too, and that fact is already asserted exactly by the
  // `toEqual([])` above — a second hard equality here would fail for the same
  // reason twice and hide which of the two was the control.
  expect(
    (JSON.parse(afterLegit.raw) as Array<{ first_name: string }>).map((row) => row.first_name),
  ).toContain(pingerKid.first_name)

  // Best-effort clean-up of the probe rows THE MOMENT they are asserted, so a
  // pre-amendment run cannot leave a forged attachment behind for the rest of
  // the suite (both also cascade with the post; this is belt and braces, and it
  // is logged rather than trusted).
  for (const [table, headers, filter] of [
    ['ping_kids', { apikey: anonKey, Authorization: `Bearer ${pinger.accessToken}` }, `playdate_id=eq.${postId}`],
    ['playdate_kids', markerHeaders, `playdate_id=eq.${postId}&kid_id=eq.${pingerKid.id}`],
  ] as Array<[string, Record<string, string>, string]>) {
    const res = await fetch(`${url}/rest/v1/${table}?${filter}`, {
      method: 'DELETE',
      headers: { ...headers, Prefer: 'return=representation' },
    })
    const removed = res.ok ? ((await res.json()) as unknown[]).length : 'n/a'
    console.log(`[e2e kid-names-privacy] F2 probe clean-up: ${table} → HTTP ${res.status} (${removed} row(s))`)
  }
  // (The pinger's own KID row stays until afterEach: it is this run's data and
  // it is deleted with the pinger's own JWT, logged, best-effort.)
  //
  // The viewer records are deliberately NOT cleared here (review cycle 1: doing
  // that made afterEach's viewer clean-up a no-op — it skips a `null` viewer —
  // and a `Pip` kid row survived a run because of it. `context.close()` twice is
  // harmless, so the records live until afterEach has used their tokens.)
  await pinger.context.close()
  await stranger.context.close()
})

test.afterEach(async () => {
  // Best-effort cleanup (the house pattern), in this order:
  //  1. the marker's playdate rows, with the MARKER's JWT (the host-only DELETE
  //     policy) — the playdate_kids rows (including a forged one, if the F2 probe
  //     landed pre-amendment) and the pinger's going_pings / ping_kids rows all
  //     cascade from the 0022 / 0026 FKs;
  //  2. the marker's kid rows (the 0011 kids_delete_own policy);
  //  3. the PINGER's own kid row (the F2 probe's victim — kids_delete_own, the
  //     pinger's own JWT) and the PINGER's own ping/going rows (a no-op after
  //     step 1 — kept because instruction is explicit and a cascade is not
  //     something a spec should leave to trust).
  // The `e2e-v-*` ACCOUNTS persist for the coordinator's sweep (the sweep owns
  // `email like 'e2e-%'`); nothing else does. Every failure is logged, never
  // fatal.
  try {
    const { url, anonKey } = readSupabaseEnv()
    const { accessToken, userId } = readMarkerSession()
    const headers: Record<string, string> = {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'return=representation',
    }
    const postQuery = `${url}/rest/v1/playdates?host_profile_id=eq.${userId}&select=id`
    const postDel = await fetch(postQuery, { method: 'DELETE', headers })
    const postCheck = await fetch(postQuery, { headers })
    const postsRemaining = postCheck.ok
      ? ((await postCheck.json()) as Array<Record<string, unknown>>)
      : null
    const kidQuery = `${url}/rest/v1/kids?profile_id=eq.${userId}&select=id`
    const kidDel = await fetch(kidQuery, { method: 'DELETE', headers })
    const kidCheck = await fetch(kidQuery, { headers })
    const kidsRemaining = kidCheck.ok
      ? ((await kidCheck.json()) as Array<Record<string, unknown>>)
      : null
    let viewerRows = 0
    let pingerKidRows = 0
    for (const viewer of [created.pinger, created.stranger]) {
      if (viewer === null) continue
      const viewerHeaders: Record<string, string> = {
        apikey: anonKey,
        Authorization: `Bearer ${viewer.accessToken}`,
        Prefer: 'return=representation',
      }
      if (viewer === created.pinger && created.pingerKidId !== null) {
        const kidRes = await fetch(
          `${url}/rest/v1/kids?id=eq.${created.pingerKidId}&profile_id=eq.${viewer.userId}`,
          { method: 'DELETE', headers: viewerHeaders },
        )
        const deleted = kidRes.ok ? ((await kidRes.json()) as unknown[]).length : -1
        // VERIFIED, not trusted (the 0014 lesson: a refused RLS delete is a
        // silent 2xx with 0 rows — which is exactly how a `Pip` row survived one
        // run of this spec before this check existed).
        const kidCheckRes = await fetch(`${url}/rest/v1/kids?id=eq.${created.pingerKidId}`, {
          headers: viewerHeaders,
        })
        const kidLeft = kidCheckRes.ok ? ((await kidCheckRes.json()) as unknown[]).length : -1
        pingerKidRows = deleted
        if (deleted < 1 || kidLeft !== 0) {
          console.log(
            `[e2e cleanup] the pinger's own kid (${created.pingerKidId}) was NOT removed — ` +
              `DELETE HTTP ${kidRes.status} returned ${deleted} row(s), and ${kidLeft} row(s) are ` +
              `still visible to the pinger`,
          )
        }
      }
      for (const table of ['ping_kids', 'going_pings']) {
        const res = await fetch(`${url}/rest/v1/${table}?profile_id=eq.${viewer.userId}`, {
          method: 'DELETE',
          headers: viewerHeaders,
        })
        if (res.ok) viewerRows += ((await res.json()) as unknown[]).length
      }
      await viewer.context.close()
    }
    created.pinger = null
    created.stranger = null
    created.pingerKidId = null
    if (!postDel.ok || (postsRemaining?.length ?? 0) > 0 || !kidDel.ok || (kidsRemaining?.length ?? 0) > 0) {
      console.log(
        `[e2e cleanup] FAILED — playdate delete HTTP ${postDel.ok ? 'ok' : postDel.status} ` +
          `(${postsRemaining?.length ?? '?'} remain), kid delete HTTP ${kidDel.ok ? 'ok' : kidDel.status} ` +
          `(${kidsRemaining?.length ?? '?'} remain) (host ${userId}) — the orchestrator sweep ` +
          `(e2e- prefix) will pick them up`,
      )
    } else {
      console.log(
        `[e2e cleanup] ok — deleted the marker's playdate + kid row(s) (host ${userId}) and the ` +
          `pinger's own kid (${pingerKidRows} row); playdate_kids cascaded with the post; the viewer ` +
          `ping/going rows are gone (${viewerRows} row(s) removed with the viewers' own JWTs)`,
      )
    }
  } catch (err) {
    console.log(
      `[e2e cleanup] FAILED (logged, best-effort): ${
        err instanceof Error ? err.message : err
      } — the orchestrator sweep (e2e- prefix) will pick stragglers up`,
    )
  }
})

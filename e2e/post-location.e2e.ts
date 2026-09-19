/**
 * V9 ticket 01 — POST: location first, and the neighbourhood stops being a
 * question.
 *
 * The ticket's claims, end to end against the live project:
 *  1. A drop-in is postable with a PLACE AND NOTHING ELSE. The insert carries
 *     no `neighborhood_id` at all, and the column accepts that (migration
 *     0035) — this is the first test, and it is the documented RED BY DESIGN
 *     point before 0035 is applied.
 *  2. /new leads with the place picker: it is the form's FIRST field, it is
 *     labelled "Where? — pick a place", and it carries a visible "Browse
 *     places" affordance. The neighbourhood SELECT IS GONE from the page —
 *     gone, not optional.
 *  3. Typing `@` at the start of the field is an alias for the picker (the
 *     browse list opens), and typing still filters the seeded directory.
 *  4. Picking a place fills place + address in ONE tap, and the post that
 *     lands carries `place_id` with `neighborhood_id` null.
 *  5. "Somewhere else" keeps working: free text, no place link, no
 *     neighbourhood — and when the parent ALSO types an address, the detail
 *     page's place line is still the tappable Google Maps link (V3 ticket 08's
 *     seam, which this ticket must not break).
 *  6. The SIGNED-OUT view of such a post still renders it (the re-created
 *     get_public_playdate RPC LEFT-joins the neighbourhood, so a null label is
 *     a missing label, not a "not found"). Guarded PERMANENTLY, twice: a
 *     picked-place post (place_id set) and a free-text one (no place_id) are
 *     both read in a fresh session-less context, asserting the post renders and
 *     the "We couldn't find this drop-in" state does NOT — which is exactly what
 *     an INNER join in 0035's function would produce.
 *  7. A neighbourhood a "Recent places" chip remembers cannot survive a place
 *     pick (review cycle 1, F1): the chip's real id, invisible on this page, is
 *     REPLACED by the picked place's own answer, which for every seeded place is
 *     none.
 *  8. The "Recent places" chips still work on the SEEDED path (F4): the chip for
 *     a just-created directory-place post fills place + address again.
 *
 * RED BY DESIGN pre-0035: `playdates.neighborhood_id` is still NOT NULL, so the
 * insert 400s with
 *   23502: null value in column "neighborhood_id" ... violates not-null constraint
 * The FIRST test below is that insert over PostgREST with the marker's own JWT
 * — the same payload the form sends — and its assertion message quotes the raw
 * HTTP status and body. The later tests drive the real form, and their failure
 * path quotes the designed submit-error line the page renders instead of
 * hanging on a navigation timeout: a clean, documented failure at every point,
 * never a crash. It goes green once the coordinator applies 0035
 * (scripts/apply-migration.mjs supabase/migrations/0035_*.sql).
 *
 * Cleanup mirrors golden-path.e2e.ts / quick-post.e2e.ts: best-effort REST
 * delete of the marker's playdate rows with the marker's own JWT (the host-only
 * DELETE policy is the wall; a plain anon delete is an RLS no-op PostgREST
 * reports as 2xx — the logged lesson). The e2e-<epoch> prefix marks any
 * straggler for the orchestrator's sweep.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { computeEndIso, computeStartIso, formatTimeWindow, mapsHref } from '../src/lib/feed'
import {
  BROWSE_PLACES_LABEL,
  PLACE_BROWSE_LIMIT,
  PLACE_PICKER_LABEL,
} from '../src/lib/places'
import {
  editTitle,
  localDatePlusDays,
  readMarkerMeta,
  readMarkerSession,
  readSupabaseEnv,
  settleOnRoute,
} from './fixtures'

const TITLE_PLACEHOLDER = 'e.g. Playground time at Green Lake'
const PLACE_PLACEHOLDER = 'e.g. Green Lake playground, near the boathouse'
const ADDRESS_PLACEHOLDER = 'e.g. 7200 4th Ave NE, near the boathouse'

/** A real seeded playground (0029's seed), with the street the city publishes. */
const PLACE_NAME = 'Green Lake Park'
const PLACE_ADDRESS = '7201 East Green Lake Dr N'

/** The exact 400 body's shape, pre-0035 (asserted only through its message). */
const NOT_NULL_HINT = 'violates not-null constraint'

/** One marker post row, read back through PostgREST with the marker's JWT. */
interface MarkerRow {
  id: string
  place: string
  place_id: string | null
  neighborhood_id: string | null
  address: string | null
  title: string
  /** The instants the card's meta-line window is computed from. */
  starts_at: string
  ends_at: string
}

/**
 * Collapse every whitespace run — including the NARROW NO-BREAK SPACE some ICU
 * builds put before "AM"/"PM" — to one plain space. The card's window label is
 * locale-formatted with `toLocaleTimeString`, and the page renders in Chromium
 * while this spec computes in Node: comparing raw strings would make the exact
 * assertion below fail for a reason that has nothing to do with the ticket.
 */
function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function markerHeaders(): Record<string, string> {
  const { anonKey } = readSupabaseEnv()
  const { accessToken } = readMarkerSession()
  return {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
}

/**
 * The DELETE needs `return=representation` to answer with the rows it removed —
 * without it the response body is empty and the cleanup's row count (and its
 * "did it really work" check) silently degrades to "Unexpected end of JSON
 * input" in the log.
 */
function cleanupHeaders(): Record<string, string> {
  return { ...markerHeaders(), Prefer: 'return=representation' }
}

/** The marker's row for `title` (newest first), or null when it does not exist. */
async function readMarkerPost(title: string): Promise<MarkerRow | null> {
  const { url } = readSupabaseEnv()
  const { userId } = readMarkerSession()
  const query =
    `${url}/rest/v1/playdates?host_profile_id=eq.${userId}` +
    `&title=eq.${encodeURIComponent(title)}&order=created_at.desc&limit=1` +
    `&select=id,title,place,place_id,neighborhood_id,address,starts_at,ends_at`
  const res = await fetch(query, { headers: markerHeaders() })
  const rows = res.ok ? ((await res.json()) as MarkerRow[]) : []
  return rows[0] ?? null
}

/**
 * Submit the form and settle on the feed — or fail with the page's own error
 * line quoted.
 *
 * The timeout here is the documented-red discipline, not impatience: pre-0035
 * the create 400s, the page renders `data-testid="submit-error"`, and NOTHING
 * navigates. Waiting the full 30 s and then reporting "Timeout" would hide the
 * actual failure; this reports the database's words instead.
 */
async function submitAndLandOnFeed(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  try {
    await page.waitForURL('/', { timeout: 30_000 })
  } catch {
    const errorLine =
      (await page.getByTestId('submit-error').textContent().catch(() => null)) ??
      (await page
        .locator('p.text-red-600')
        .first()
        .textContent()
        .catch(() => null))
    throw new Error(
      `Post create failed (is 0035 applied live? pre-0035 the insert has no ` +
        `neighbourhood and the NOT NULL column rejects it — ${NOT_NULL_HINT}): ` +
        `${errorLine ?? 'no submit-error line rendered'}`,
    )
  }
}

test('a post with NO neighbourhood inserts — the documented pre-0035 red', async () => {
  // THE FIRST INSERT, and the documented failure point of this spec: exactly
  // the payload /new sends now (feed.neighborhoodIdField omits the key when no
  // neighbourhood was chosen). Pre-0035 PostgREST answers 400 and the body
  // carries the 23502 — quoted in this assertion's message.
  const { url } = readSupabaseEnv()
  const { userId } = readMarkerSession()
  const title = `e2e ${readMarkerMeta().displayName} location probe`
  const startsAt = new Date(Date.now() + 86_400_000)
  const endsAt = new Date(startsAt.getTime() + 60 * 60_000)

  const res = await fetch(`${url}/rest/v1/playdates`, {
    method: 'POST',
    headers: { ...markerHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({
      host_profile_id: userId,
      title,
      place: 'E2E location probe lot',
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      // NO neighborhood_id key: this is the point of the test.
    }),
  })
  const body = await res.text()
  expect(
    res.ok,
    `a playdate with no neighborhood_id must insert once 0035 is applied ` +
      `(pre-0035: HTTP ${res.status} — ${body.slice(0, 400)})`,
  ).toBe(true)

  // And the column really is NULL on the row that landed (not an empty string,
  // not a default) — read back with the marker's own JWT.
  const created = JSON.parse(body) as Array<{ id: string; neighborhood_id: string | null }>
  expect(created[0]?.neighborhood_id ?? null).toBeNull()
})

test('/new leads with the place picker and never asks for a neighbourhood', async ({ page }) => {
  await page.goto('/new')
  await settleOnRoute(page, '/new')

  // (1) The place picker is the form's FIRST field — V9 ticket 01's AC, kept
  //     literally (review cycle 1, F2, see the note below).
  //
  // The retrying assertion comes FIRST (review cycle 1, F6): `settleOnRoute`
  // guarantees the ROUTE, not that the form has painted, and a bare
  // non-retrying `expect(fieldOrder[0])` would fail on a slow first paint for a
  // reason that has nothing to do with this ticket.
  await expect(page.getByPlaceholder(PLACE_PLACEHOLDER)).toBeVisible()
  const formFieldOrder = (): Promise<string[]> =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll('form input, form textarea, form select')).map(
        (el) => (el as HTMLInputElement).placeholder ?? el.getAttribute('type') ?? '',
      ),
    )
  const fieldOrder = await formFieldOrder()
  // The place picker is the FIRST input. V11 ticket 05: the start date now sits
  // in the visible "When" section (no longer behind the disclosure), so the
  // collapsed form has exactly two inputs — the place picker, then the start
  // date. The title on the summary is still a READ-BACK (a <p> and a button), it
  // becomes the input only when tapped, and the address, the stepper and the
  // repeat toggle are behind the disclosure. ("''" is the date input: a date
  // input carries no placeholder, so the helper's `placeholder ?? type` read
  // yields the empty string.) This is ticket 01's "the affordance is
  // unmistakable" AC, and it is exactly what an always-open title input at the
  // top of the form would have inverted (it would also have been the form's
  // first tab stop).
  expect(fieldOrder[0]).toBe(PLACE_PLACEHOLDER)
  expect(fieldOrder).toEqual([PLACE_PLACEHOLDER, ''])

  // …and the title is STILL a form field, one tap away in the summary — the line
  // the parent taps to change it (V9 ticket 03's AC). The old assertion here
  // (`expect(fieldOrder).toContain(TITLE_PLACEHOLDER)`) is kept, one step later:
  // it is the same claim about the same field, read in the state where that
  // field exists at all.
  await editTitle(page)
  const fieldOrderEditing = await formFieldOrder()
  expect(fieldOrderEditing).toContain(TITLE_PLACEHOLDER)
  // Editing the title puts its input at the top of the summary — i.e. first in
  // DOM order — which is exactly why ticket 01's AC is pinned on the COLLAPSED
  // page above: that is the page /new OPENS as, and the page the parent meets.
  // V11 ticket 05: the start date is in the visible "When" section. V12 t02:
  // the duration is read back there too (picked for the parent from the start
  // slot; the override chips live in the visible flow (V13 t02: disclosure gone) — but the read-back is
  // not an input, so the input order is unchanged: title → place → date.
  expect(fieldOrderEditing).toEqual([TITLE_PLACEHOLDER, PLACE_PLACEHOLDER, ''])

  // (2) Labelled so the affordance is unmistakable, with the visible Browse
  //     places button beside it.
  await expect(page.getByText(PLACE_PICKER_LABEL, { exact: true })).toBeVisible()
  const browse = page.getByTestId('browse-places')
  await expect(browse).toBeVisible()
  await expect(browse).toHaveText(BROWSE_PLACES_LABEL)

  // (3) THE NEIGHBOURHOOD IS GONE from this page — no select, no question.
  //     The exact-string checks pin the labelled FIELD (its <span> says
  //     "Neighborhood"); the empty option's copy is checked separately.
  await expect(page.locator('select')).toHaveCount(0)
  await expect(page.getByText('Neighborhood', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Pick a neighborhood…')).toHaveCount(0)

  // (4) The Browse button really browses: it opens the directory A→Z (the
  //     seeded rows plus the always-last "Somewhere else"), and closes again.
  await browse.click()
  await expect(browse).toHaveAttribute('aria-expanded', 'true')
  const suggestionRows = page.getByTestId('place-suggestions').locator('button')
  // PLACE_BROWSE_LIMIT directory rows + the "Somewhere else" escape hatch.
  await expect(suggestionRows).toHaveCount(PLACE_BROWSE_LIMIT + 1)
  await expect(page.getByTestId('place-somewhere-else')).toBeVisible()
  await browse.click()
  await expect(browse).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByTestId('place-suggestions')).toHaveCount(0)
})

test('typing @ opens the picker, and picking a place fills place + address in one tap', async ({
  page,
  browser,
}) => {
  const marker = readMarkerMeta()
  const title = `e2e ${marker.displayName} picked place`

  await page.goto('/new')
  await settleOnRoute(page, '/new')

  const placeInput = page.getByPlaceholder(PLACE_PLACEHOLDER)
  const addressInput = page.getByPlaceholder(ADDRESS_PLACEHOLDER)

  // The `@` alias: a bare @ is an alias for the PICKER (the directory opens),
  // not for an empty list — the list is the same one the Browse button opens.
  await placeInput.fill('@')
  await expect(page.getByTestId('place-suggestions')).toBeVisible()
  await expect(page.getByTestId('place-suggestions').locator('button')).toHaveCount(
    PLACE_BROWSE_LIMIT + 1,
  )

  // …and typing after the alias still FILTERS the 239 seeded places, on the
  // query with the alias stripped.
  await placeInput.fill(`@${PLACE_NAME}`)
  const suggestion = page.getByTestId('place-suggestions').getByText(PLACE_NAME, { exact: true })
  await expect(suggestion).toBeVisible()
  await suggestion.click()

  // ONE tap: the place AND its published address. The neighbourhood question is
  // not asked, and there is no field to answer it in.
  //
  // V13 ticket 02: the address is a VISIBLE field in the form's tail block (the
  // pick is what fills it), so the door is opened to read the value the pick
  // wrote. The assertion is unchanged.
  await expect(placeInput).toHaveValue(PLACE_NAME)
  await expect(addressInput).toHaveValue(PLACE_ADDRESS)
  await expect(page.getByTestId('place-suggestions')).toHaveCount(0)
  await expect(page.locator('select')).toHaveCount(0)

  // A title is seeded from the place (V8 ticket 01's rule, now the DEFAULT —
  // V9 ticket 03) — so the post is postable without touching anything else.
  // V9 ticket 03 (review cycle 1, F2): the summary's title is a read-back —
  // tap it to edit (the input is what the specs drive).
  await editTitle(page)
  await expect(page.getByPlaceholder(TITLE_PLACEHOLDER)).toHaveValue(`Playdate at ${PLACE_NAME}`)
  await page.getByPlaceholder(TITLE_PLACEHOLDER).fill(title)
  // V13 ticket 02: the start date lives in the visible "When" section.
  await page.locator('input[type="date"]').fill(localDatePlusDays(1))
  await page.getByRole('button', { name: '1h', exact: true }).click()

  await submitAndLandOnFeed(page)

  // The row in the database: the picked place's id, its address, and NO
  // neighbourhood — the state 0035 makes legal.
  const row = await readMarkerPost(title)
  expect(row, 'the posted drop-in must exist in the database').not.toBeNull()
  expect(row?.place_id, 'a picked place carries its place_id (V8 ticket 07)').toBeTruthy()
  expect(row?.neighborhood_id ?? null).toBeNull()
  expect(row?.address).toBe(PLACE_ADDRESS)

  // The card in the feed: the place on its own line, then the WINDOW ALONE on
  // the meta line — no neighbourhood label, and above all no dangling
  // separator. Pinned as the exact expected text rather than "no double
  // separator" (review cycle 1, F3): the plausible wrong implementations are a
  // LEADING " · 6:00 PM–7:00 PM" (blank neighbourhood) or "null · 6:00 PM…"
  // (a literal null), and neither contains two adjacent separators. The window
  // comes from feed.formatTimeWindow — the very function the card renders —
  // compared with whitespace collapsed (see collapseSpaces).
  const card = page.locator('a').filter({ hasText: title }).first()
  await expect(card).toBeVisible()
  await expect(card).toContainText(PLACE_NAME)
  await expect(card).not.toContainText('null')
  const windowLabel = collapseSpaces(formatTimeWindow(row?.starts_at ?? '', row?.ends_at ?? ''))
  // The meta line is the card's second <p>: the first is the place. Assert that
  // shape explicitly, so a structural change fails loudly instead of silently
  // testing the wrong element.
  const metaLine = card.locator('p').nth(1)
  await expect(metaLine).toContainText('–')
  const metaText = collapseSpaces(await metaLine.innerText())
  expect(
    // Either the window alone, or the window followed by the card's own
    // suffixes (` · weekly`, ` · N mi` — neither applies to a plain new post,
    // but the assertion must not depend on that).
    metaText === windowLabel || metaText.startsWith(`${windowLabel} · `),
    `the card meta line must be the window${windowLabel === '' ? '' : ` "${windowLabel}"`} with no ` +
      `neighbourhood label in front of it (got "${metaText}")`,
  ).toBe(true)

  // The DETAIL page's place line, host view: exactly the place, and nothing
  // appended. The same exact-text guard as the card's meta line — the AC's
  // "never an empty neighbourhood label" on the page that renders the place and
  // the window separately (`place · window`).
  await page.goto(`/playdate/${row?.id ?? ''}`)
  const detailPlaceLink = page.getByRole('link', { name: PLACE_NAME, exact: true })
  await expect(detailPlaceLink).toBeVisible()
  await expect(page.locator('p').filter({ has: detailPlaceLink })).toHaveText(PLACE_NAME)

  // The "Recent places" chips on the SEEDED-PLACE path (V8 ticket 01's memory,
  // kept by this ticket — review cycle 1, F4: quick-post.e2e.ts covers the
  // FREE-TEXT path only, so this is the picked path it does not reach). The post
  // just created was at a directory place, so a FRESH /new mount must offer it
  // back; one tap fills the place and its address, the remembered text resolves
  // to the directory row (places.resolvePlaceByName), and the picker stays shut.
  await page.goto('/new')
  await settleOnRoute(page, '/new')
  const chip = page.getByRole('button', { name: PLACE_NAME, exact: true })
  await expect(chip).toBeVisible()
  await chip.click()
  // V13 ticket 02: the address the pick fills is readable in the visible flow.
  await expect(page.getByPlaceholder(PLACE_PLACEHOLDER)).toHaveValue(PLACE_NAME)
  await expect(page.getByPlaceholder(ADDRESS_PLACEHOLDER)).toHaveValue(PLACE_ADDRESS)
  await expect(page.getByTestId('place-suggestions')).toHaveCount(0)
  // V9 ticket 03 (review cycle 1, F2): the summary's title is a read-back —
  // tap it to edit (the input is what the specs drive).
  await editTitle(page)
  await expect(page.getByPlaceholder(TITLE_PLACEHOLDER)).toHaveValue(`Playdate at ${PLACE_NAME}`)

  // THE SIGNED-OUT VIEW (T4 of the ticket, migration 0035's second half). The
  // anon path is NOT the embeds above — it is the SECURITY DEFINER
  // get_public_playdate RPC, whose old INNER join made a NULL-neighbourhood post
  // return NULL, i.e. "not found" for a post that plainly exists. A fresh
  // signed-out context is the only way to read it as anon sees it, and this
  // block is a PERMANENT REGRESSION GUARD, not a probe: re-adding `join` instead
  // of `left join` to 0035's function makes the two assertions below fail.
  const anonContext = await browser.newContext({
    baseURL: 'http://localhost:4173',
    storageState: { cookies: [], origins: [] },
  })
  const anonPage = await anonContext.newPage()
  await anonPage.goto(`/playdate/${row?.id ?? ''}`)
  // The post RENDERS for a visitor with no session: its title and its place.
  await expect(anonPage.getByRole('heading', { name: title, exact: true })).toBeVisible()
  // …and specifically NOT the not-found state, which is exactly what an INNER
  // join produced for this row (the RPC answered NULL → the page settles
  // not-found → "We couldn't find this drop-in" for a post that exists). The
  // regex is apostrophe-agnostic on purpose: the copy uses a typographic one.
  await expect(anonPage.getByRole('heading', { name: /find this drop-in/i })).toHaveCount(0)
  // The guard above is only worth having if it CAN fail, so it is proved
  // sensitive here rather than assumed: a post the RPC genuinely cannot answer
  // for (an id that does not exist → the function's `not found` branch → NULL)
  // renders exactly that heading. Same context, same session-less reader.
  await anonPage.goto('/playdate/00000000-0000-4000-8000-000000000000')
  await expect(anonPage.getByRole('heading', { name: /find this drop-in/i })).toBeVisible()
  await anonPage.goto(`/playdate/${row?.id ?? ''}`)
  await expect(anonPage.getByRole('heading', { name: title, exact: true })).toBeVisible()
  // The place line renders, still linked to the place page (the 13th public
  // field crossed to anon), with no neighbourhood label appended — and the
  // string "null" appears nowhere.
  await expect(anonPage.getByRole('link', { name: PLACE_NAME, exact: true })).toBeVisible()
  await expect(anonPage.getByText('null')).toHaveCount(0)
  await anonContext.close()
})

test('"Somewhere else" still posts free text — and its address is still the Maps link', async ({
  page,
  browser,
}) => {
  const marker = readMarkerMeta()
  const title = `e2e ${marker.displayName} somewhere else`
  const place = 'E2E somewhere-else lot'
  const address = '1234 E2E Ave NE'

  await page.goto('/new')
  await settleOnRoute(page, '/new')

  // The directory is never a wall (V8 ticket 07, kept): type a place it does
  // not know, then take "Somewhere else" from the open list.
  await page.getByPlaceholder(PLACE_PLACEHOLDER).fill(place)
  await expect(page.getByTestId('place-suggestions')).toBeVisible()
  await page.getByTestId('place-somewhere-else').click()
  await expect(page.getByTestId('place-suggestions')).toHaveCount(0)

  // The typed text survives the escape hatch, untouched.
  await expect(page.getByPlaceholder(PLACE_PLACEHOLDER)).toHaveValue(place)
  // V9 ticket 03 (review cycle 1, F2): the summary's title is a read-back —
  // tap it to edit (the input is what the specs drive).
  await editTitle(page)
  await page.getByPlaceholder(TITLE_PLACEHOLDER).fill(title)
  // V9 ticket 03: the address's manual entry and the start date are both behind
  // V13 ticket 02: the address is a visible field (this post's whole point is a typed address).
  await page.getByPlaceholder(ADDRESS_PLACEHOLDER).fill(address)
  await page.locator('input[type="date"]').fill(localDatePlusDays(1))
  await page.getByRole('button', { name: '1h', exact: true }).click()

  await submitAndLandOnFeed(page)

  const row = await readMarkerPost(title)
  expect(row, 'the free-text post must exist in the database').not.toBeNull()
  expect(row?.place_id ?? null).toBeNull()
  expect(row?.neighborhood_id ?? null).toBeNull()

  // The card shows the free-text place (and the window), no empty label.
  const card = page.locator('a').filter({ hasText: title }).first()
  await expect(card).toBeVisible()
  await expect(card).toContainText(place)
  await expect(card).not.toContainText('null')

  // T10: the DETAIL page's place line is still the tappable Google Maps link
  // (V3 ticket 08 / migration 0021) — the seam this ticket must not break. A
  // free-text post has no place page to link to, so this is the Maps link.
  const href = mapsHref(place, address)
  expect(href, 'the pure mapsHref seam must resolve a typed place+address').not.toBeNull()
  await page.goto(`/playdate/${row?.id ?? ''}`)
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  const maps = page.getByRole('link', { name: place, exact: true })
  await expect(maps).toHaveAttribute('href', href ?? '')
  await expect(maps).toHaveAttribute('target', '_blank')
  // The place LINE is exactly the place and nothing else (review cycle 1, F3 —
  // this replaced `getByText('Neighborhood') → 0`, which could not fail: the old
  // label was a neighbourhood NAME like "Green Lake", never the word
  // "Neighborhood", and a non-exact substring match would have matched
  // "Neighborhoods" too). `toHaveText` is an exact comparison after whitespace
  // normalization, so appending " · <anything>" — the empty-label bug this
  // ticket is about — fails here.
  const placeLine = page.locator('p').filter({ has: maps })
  await expect(placeLine).toHaveText(place)

  // The SECOND signed-out shape (the anon RPC again, different row): a post with
  // no neighbourhood AND no place_id, which is the whole existing free-text
  // corpus plus everything this version posts. Same permanent guard as the
  // picked-place case above — the INNER join answered NULL here too, so a
  // logged-out visitor got "not found" for a post that exists — and this is
  // also where the public view's Maps link (0021's field) still has to work.
  const anonContext = await browser.newContext({
    baseURL: 'http://localhost:4173',
    storageState: { cookies: [], origins: [] },
  })
  const anonPage = await anonContext.newPage()
  await anonPage.goto(`/playdate/${row?.id ?? ''}`)
  await expect(anonPage.getByRole('heading', { name: title, exact: true })).toBeVisible()
  await expect(anonPage.getByRole('heading', { name: /find this drop-in/i })).toHaveCount(0)
  await expect(anonPage.getByRole('link', { name: place, exact: true })).toHaveAttribute(
    'href',
    href ?? '',
  )
  await expect(anonPage.getByText('null')).toHaveCount(0)
  await anonContext.close()
})

test('a remembered neighbourhood cannot survive a place pick (review cycle 1, F1)', async ({
  page,
}) => {
  // THE SEQUENCE THE REVIEWER FOUND. A "Recent places" chip (V8 ticket 01)
  // writes the remembered post's neighbourhood into the form; /new renders NO
  // neighbourhood field, so that id is INVISIBLE to the parent. Picking a
  // directory place afterwards used to inherit it (`?? prev.neighborhoodId`),
  // and since every seeded place has a NULL neighbourhood the fallback always
  // fired — so the new post silently carried the OLD place's neighbourhood.
  // The fixture therefore has to be a post WITH a real neighbourhood, which /new
  // can no longer produce: it is seeded over REST (the polish.e2e.ts pattern),
  // on the pinned 30-minute grid so /edit-style validation never enters it.
  const marker = readMarkerMeta()
  const stalePlace = 'E2E stale chip lot'
  const title = `e2e ${marker.displayName} stale neighbourhood`
  const { url } = readSupabaseEnv()
  const { userId } = readMarkerSession()
  const hoodRes = await fetch(`${url}/rest/v1/neighborhoods?select=id&limit=1`, {
    headers: markerHeaders(),
  })
  const hoods = (await hoodRes.json()) as Array<{ id: string }>
  expect(hoods[0]?.id, `the neighborhoods seed must be readable (HTTP ${hoodRes.status})`).toBeTruthy()
  const startDate = localDatePlusDays(3)
  const seeded = await fetch(`${url}/rest/v1/playdates`, {
    method: 'POST',
    headers: { ...markerHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({
      host_profile_id: userId,
      // The stale id the chip will put into the form.
      neighborhood_id: hoods[0].id,
      title: `e2e ${marker.displayName} stale seed`,
      place: stalePlace,
      starts_at: computeStartIso(startDate, 10 * 60),
      ends_at: computeEndIso(startDate, 10 * 60, 60),
    }),
  })
  expect(seeded.ok, `the stale fixture must insert (HTTP ${seeded.status})`).toBe(true)

  await page.goto('/new')
  await settleOnRoute(page, '/new')

  // (1) The chip fills place + address, and with it the form holds a REAL
  //     neighbourhood id that this page does not render.
  const chip = page.getByRole('button', { name: stalePlace, exact: true })
  await expect(chip).toBeVisible()
  await chip.click()
  await expect(page.getByPlaceholder(PLACE_PLACEHOLDER)).toHaveValue(stalePlace)
  await expect(page.locator('select')).toHaveCount(0)

  // (2) Now PICK a directory place — whose own neighbourhood is NULL.
  const placeInput = page.getByPlaceholder(PLACE_PLACEHOLDER)
  await placeInput.fill(PLACE_NAME)
  const suggestion = page.getByTestId('place-suggestions').getByText(PLACE_NAME, { exact: true })
  await expect(suggestion).toBeVisible()
  await suggestion.click()
  await expect(placeInput).toHaveValue(PLACE_NAME)

  // V9 ticket 03 (review cycle 1, F2): the summary's title is a read-back —
  // tap it to edit (the input is what the specs drive).
  await editTitle(page)
  await page.getByPlaceholder(TITLE_PLACEHOLDER).fill(title)
  // V9 ticket 03: the start date lives behind "More options".
  await page.locator('input[type="date"]').fill(localDatePlusDays(1))
  await page.getByRole('button', { name: '1h', exact: true }).click()
  await submitAndLandOnFeed(page)

  // (3) The post carries the PICKED place and NO neighbourhood: the chip's id
  //     is gone, not inherited. (Post-0035 the column is nullable, so "wrong"
  //     here means the stale uuid — which this assertion names.)
  const row = await readMarkerPost(title)
  expect(row, 'the posted drop-in must exist in the database').not.toBeNull()
  expect(row?.place).toBe(PLACE_NAME)
  expect(row?.place_id, 'the picked place carries its id').toBeTruthy()
  expect(row?.neighborhood_id ?? null).toBeNull()
  expect(row?.neighborhood_id ?? null).not.toBe(hoods[0].id)
})

test.afterEach(async () => {
  // Best-effort cleanup (the golden-path pattern): delete the marker's
  // playdate rows via PostgREST with the marker's own JWT (the host-only
  // DELETE policy requires it). A failure is logged, not fatal — the
  // e2e-<epoch> prefix marks the rows for the sweep.
  try {
    const { url } = readSupabaseEnv()
    const { userId } = readMarkerSession()
    const query = `${url}/rest/v1/playdates?host_profile_id=eq.${userId}&select=id`
    const del = await fetch(query, { method: 'DELETE', headers: cleanupHeaders() })
    const deleted = del.ok ? ((await del.json()) as Array<Record<string, unknown>>) : []
    const check = await fetch(query, { headers: markerHeaders() })
    const remaining = check.ok ? ((await check.json()) as Array<Record<string, unknown>>) : null
    if (!del.ok || (remaining !== null && remaining.length > 0)) {
      console.log(
        `[e2e cleanup] FAILED — delete HTTP ${del.status}, ${deleted.length} row(s) returned, ` +
          `${remaining?.length ?? '?'} remain (marker ${userId}) — orchestrator sweep (e2e- prefix) will pick them up`,
      )
    } else {
      console.log(`[e2e cleanup] ok — deleted ${deleted.length} marker playdate row(s)`)
    }
  } catch (err) {
    console.log(
      `[e2e cleanup] FAILED (logged, best-effort): ${err instanceof Error ? err.message : err}`,
    )
  }
})

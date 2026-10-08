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
import { cardWhenLabel, computeEndIso, computeStartIso, formatTimeWindow, mapsHref } from '../src/lib/feed'
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
  E2E_BASE_URL,
} from './fixtures'

const TITLE_PLACEHOLDER = 'e.g. Playground time at Green Lake'
const PLACE_PLACEHOLDER = 'e.g. Green Lake playground, near the boathouse'
const ADDRESS_PLACEHOLDER = 'e.g. 7200 4th Ave NE, near the boathouse'
/** V13 ticket 02: the details field is in the VISIBLE flow, so the input-order
 * assertions below see it (it used to be behind the removed disclosure). */
const DETAILS_PLACEHOLDER =
  'Anything parents should know — what to bring, parking, weather plan…'

/** A real seeded playground (0029's seed), with the street the city publishes. */
// V32 v32-4: this is deliberately the place with the WIKIMEDIA-hosted photo and
// a real credit, not the sibling "Green Lake Park" row. That sibling's photo_url
// points at seattle.gov, which Chrome refuses with `net::ERR_BLOCKED_BY_ORB` —
// the banner then correctly falls back to the illustration, so a photo
// assertion against it could never pass. Naming a loadable row is what makes the
// banner assertions below REAL rather than an assertion that the fallback works.
const PLACE_NAME = 'Green Lake Park (West)'
const PLACE_ADDRESS = '7312 W Green Lake Drive N'

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
 * V32 v32-4: the picked place's photo columns, read from the anon-readable
 * `places` table (the same table and policy the app itself reads for the public
 * surface). The spec asserts the RENDERED src against this read rather than
 * against a hard-coded Commons URL: a URL that changes upstream must not turn
 * this spec red, and a hard-coded one would silently stop proving anything if
 * the row were re-imported.
 *
 * V32-4F (F5): ONE helper selecting all three columns. It was two (plus a third
 * inline fetch in the unreviewed test) issuing separate single-column requests
 * for the same row; selecting them together removes the round-trips and makes
 * the photo/credit/state triple atomically consistent — a row cannot be
 * observed mid-update with, say, a new url and a stale attribution.
 */
async function readPlacePhotoFields(placeId: string): Promise<{
  photo_url: string | null
  photo_attribution: string | null
  photo_review_state: string | null
} | null> {
  const { url, anonKey } = readSupabaseEnv()
  const res = await fetch(
    `${url}/rest/v1/places?id=eq.${placeId}&select=photo_url,photo_attribution,photo_review_state`,
    { headers: { apikey: anonKey } },
  )
  const rows = res.ok
    ? ((await res.json()) as Array<{
        photo_url: string | null
        photo_attribution: string | null
        photo_review_state: string | null
      }>)
    : []
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
  // The place picker is the FIRST input, and the address sits DIRECTLY under it.
  //
  // V13 ticket 02 removed the "More options" disclosure: the address, the
  // stepper and the details field are now in the VISIBLE flow, so the collapsed
  // form is place → address → date → details, not the two inputs this assertion
  // used to expect ("the address ... behind the disclosure" is no longer true —
  // that stale expectation is why this spec failed). V15.1 then moved the
  // address UP to sit immediately under the place field, because the pick is
  // what fills it: the two must read as one question.
  // The title on the summary is still a READ-BACK (a <p> and a button), it
  // becomes an input only when tapped. ("''" is the date input: a date input
  // carries no placeholder, so the helper's `placeholder ?? type` read yields
  // the empty string.) This is ticket 01's "the affordance is unmistakable" AC,
  // and it is exactly what an always-open title input at the top of the form
  // would have inverted (it would also have been the form's first tab stop).
  expect(fieldOrder[0]).toBe(PLACE_PLACEHOLDER)
  expect(fieldOrder).toEqual([
    PLACE_PLACEHOLDER,
    ADDRESS_PLACEHOLDER,
    '',
    DETAILS_PLACEHOLDER,
  ])

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
  // V13 ticket 02: the disclosure is gone, so the visible flow is title → place
  // → address → date → details. The duration read-back is not an input, so it
  // does not appear here.
  expect(fieldOrderEditing).toEqual([
    TITLE_PLACEHOLDER,
    PLACE_PLACEHOLDER,
    ADDRESS_PLACEHOLDER,
    '',
    DETAILS_PLACEHOLDER,
  ])

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

  // (4) The Browse button really browses — V23 slice 3 CHANGED WHERE IT BROWSES.
  //
  // WHAT CHANGED AND WHY THE OLD ASSERTION WAS WRONG (not merely inconvenient).
  // This block used to click the button and expect the INLINE suggestion list
  // (`place-suggestions`) to open with `PLACE_BROWSE_LIMIT + 1` rows. The
  // founder's feedback asked for exactly the opposite:
  //
  //   "browse places (Clicking this doesn't actually allow you to see the whole
  //    list. And even if you could populate it all here, it would be out of
  //    control. So maybe what you want to do instead is lightbox a list that you
  //    could scroll through.)"
  //
  // So the button now opens the scrollable `place-directory-sheet` — the SAME
  // component /browse renders — and the inline list is reachable only by TYPING
  // (the fast path, guarded by the spec below and by
  // `place-directory-in-new.e2e.ts`'s regression test). Asserting the old
  // inline behaviour here would pin the bug the founder reported.
  //
  // What is still asserted is the thing this test is actually about: the button
  // browses something real, announces its state, and closes again.
  await browse.click()
  await expect(browse).toHaveAttribute('aria-expanded', 'true')
  const sheet = page.getByTestId('place-directory-sheet')
  await expect(sheet).toBeVisible()
  // The directory really is in there: the inline search field and at least one row.
  await expect(sheet.getByTestId('places-search')).toBeVisible()
  expect(await page.getByTestId('place-row').count()).toBeGreaterThan(0)
  // Escape is the sheet's own dismissal (V23 slice 3); the button's
  // aria-expanded must follow it back to false.
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await expect(browse).toHaveAttribute('aria-expanded', 'false')
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
  // V23 rename: the generated prefix is "Drop-in at …" now, not "Playdate at …".
  await expect(page.getByPlaceholder(TITLE_PLACEHOLDER)).toHaveValue(`Drop-in at ${PLACE_NAME}`)
  await page.getByPlaceholder(TITLE_PLACEHOLDER).fill(title)
  // V13 ticket 02: the start date lives in the visible "When" section.
  await page.locator('input[type="date"]').fill(localDatePlusDays(1))

  await submitAndLandOnFeed(page)

  // The row in the database: the picked place's id, its address, and NO
  // neighbourhood — the state 0035 makes legal.
  const row = await readMarkerPost(title)
  expect(row, 'the posted drop-in must exist in the database').not.toBeNull()
  expect(row?.place_id, 'a picked place carries its place_id (V8 ticket 07)').toBeTruthy()
  expect(row?.neighborhood_id ?? null).toBeNull()
  expect(row?.address).toBe(PLACE_ADDRESS)

  // The card in the feed: the place on its own line, then the WHEN line — the
  // day and the WINDOW ALONE, no neighbourhood label in front of it, and above
  // all no dangling separator. Pinned as the exact expected text rather than "no
  // double separator" (review cycle 1, F3): the plausible wrong implementations
  // are a LEADING " · 6:00 PM–7:00 PM" (blank neighbourhood) or "null · 6:00 PM…"
  // (a literal null), and neither contains two adjacent separators. Both halves
  // come from the app's own seams — feed.cardWhenLabel over the day wording and
  // feed.formatTimeWindow — compared with whitespace collapsed (collapseSpaces),
  // so this asserts the function the card actually renders.
  const card = page.locator('a').filter({ hasText: title }).first()
  await expect(card).toBeVisible()
  await expect(card).toContainText(PLACE_NAME)
  // V27 slice 3: the place trust line — the picked directory place's kind and
  // indoor/outdoor ("Playground · Outdoor"), stated without a tap. This is the
  // spec that actually POSTS through the picker, so the card on `/` is where
  // the line is proved to render.
  await expect(card.getByTestId('card-place-trust')).toBeVisible()
  await expect(card.getByTestId('card-place-trust')).toContainText('·')
  await expect(card).not.toContainText('null')

  // V32 v32-4 (A7/A9): the card's photo banner LEADS the card and is
  // FULL-BLEED — the img's left edge equals the card box's left edge within
  // 1px. A photo inset by the body anchor's `p-4` reads as a framed thumbnail,
  // which is the regression this geometry assertion exists to catch.
  //
  // The card for a JUST-POSTED row renders optimistically from the create's
  // response — which carries no embed — and is then REPLACED by the feed's own
  // refetch, which does carry `place_ref`. So the banner can be missing for a
  // moment while that swap lands. Assert on a page-level locator scoped to the
  // card, which re-resolves on every retry, rather than on a node captured
  // before the swap.
  const placeFields = await readPlacePhotoFields((row?.place_id ?? '').trim())
  expect(placeFields?.photo_url, 'the picked place must carry a photo to prove the banner').toBeTruthy()
  const expectedPhotoUrl = placeFields!.photo_url!
  const cardPhoto = page
    .getByTestId('dropin-card')
    .filter({ hasText: title })
    .getByTestId('dropin-card-photo')
  await expect(cardPhoto).toHaveCount(1, { timeout: 20_000 })
  await expect(cardPhoto).toHaveAttribute('src', expectedPhotoUrl)
  await expect(cardPhoto).toHaveAttribute('alt', '')
  const cardBox = await page
    .getByTestId('dropin-card')
    .filter({ hasText: title })
    .boundingBox()
  const cardPhotoBox = await cardPhoto.boundingBox()
  expect(cardBox, 'the card must have a box').not.toBeNull()
  expect(cardPhotoBox, 'the card banner must have a box').not.toBeNull()
  // Full-bleed means flush with the card's CONTENT box: the box paints a 1px
  // border on each side, so the img is exactly 2px narrower than the border
  // box and starts 1px inside it. The tolerance covers the border, not slop —
  // the regression this catches is the body anchor's `p-4` (16px), which the
  // banner cancels with `-mx-4`.
  expect(
    Math.abs(cardPhotoBox!.x - cardBox!.x),
    `the card banner must be full-bleed to the card edge (card x ${cardBox!.x}, photo x ${cardPhotoBox!.x})`,
  ).toBeLessThanOrEqual(2)
  expect(
    Math.abs(cardPhotoBox!.width - cardBox!.width),
    `the card banner must span the card's width (card w ${cardBox!.width}, photo w ${cardPhotoBox!.width})`,
  ).toBeLessThanOrEqual(2)
  // …and it sits above the card's TITLE.
  const cardTitleBox = await card.getByRole('heading', { level: 3 }).boundingBox()
  expect(cardTitleBox, 'the card title must have a box').not.toBeNull()
  expect(
    cardPhotoBox!.y + cardPhotoBox!.height,
    'the card photo must sit ABOVE the card title',
  ).toBeLessThanOrEqual(cardTitleBox!.y)
  const windowLabel = collapseSpaces(formatTimeWindow(row?.starts_at ?? '', row?.ends_at ?? ''))
  // V25 ticket 05: the when line is its own `card-when` element now — read by
  // testid, never by a `p` index (the window moved out of the quiet meta line,
  // and a positional read silently tests the wrong element; it did exactly that
  // once in this file's history).
  const whenLine = card.getByTestId('card-when')
  await expect(whenLine).toContainText('–')
  const whenText = collapseSpaces(await whenLine.innerText())
  expect(
    whenText,
    `the card's when line must be the day and the window${windowLabel === '' ? '' : ` "${windowLabel}"`} with no ` +
      `neighbourhood label in front of it (got "${whenText}")`,
  ).toBe(collapseSpaces(cardWhenLabel(row?.starts_at ?? '', row?.ends_at ?? '')))
  // The QUIET line (V25 ticket 05) renders only when the post has a
  // neighbourhood or a distance, and then it must START with that fact: never
  // the removed window's leading separator and never a literal null.
  const metaLine = card.getByTestId('card-meta')
  if ((await metaLine.count()) > 0) {
    const metaText = collapseSpaces(await metaLine.innerText())
    expect(
      metaText.startsWith('· ') || metaText.startsWith('null'),
      `the card's quiet meta line must not begin with a separator or "null" (got "${metaText}")`,
    ).toBe(false)
    // …and the window is NOT still in it (the "moved the line but left a copy"
    // regression, which is exactly what a `p`-index read would have missed).
    await expect(metaLine).not.toContainText('–')
  }

  // The DETAIL page's place line, host view: exactly the place, and nothing
  // appended. The same exact-text guard as the card's when line above — the AC's
  // "never an empty neighbourhood label" on the page that renders the place and
  // the window separately (`place · window`).
  await page.goto(`/playdate/${row?.id ?? ''}`)

  // ---------------------------------------------------------------------
  // V32 v32-4 (A7/A9): THE PLACE PHOTO LEADS, ON ALL THREE SURFACES.
  //
  // The picked place is "Green Lake Park (West)"
  // (place_id c0d21bea-8808-4187-8216-66a7336bd237): `confirmed`, with a
  // Wikimedia-hosted photo_url AND a real attribution ("Len Williams /
  // CC BY-SA 2.0"). So this run exercises the confirmed branch AND the
  // CREDIT-PRESENT branch — the attribution overlay must render, and the
  // assertion below reads the stored attribution rather than assuming it.
  //
  // The credit-ABSENT branch is pinned separately, by its own test at the end
  // of this file (a confirmed, attribution-less place), rather than being
  // claimed here. V32-4F (F4) corrected this block: it previously named the
  // sibling "Green Lake Park" row AND claimed the credit-null branch, while the
  // assertion under it required a credit — a comment contradicting its own
  // assertion.
  // ---------------------------------------------------------------------
  const detailPhoto = page.getByTestId('detail-place-photo')
  await expect(detailPhoto).toHaveCount(1)
  await expect(detailPhoto).toHaveAttribute('src', expectedPhotoUrl)
  // `alt=""` — the place name is the adjacent text, so a filled alt would say
  // it twice to a screen reader; a missing alt is the rule.json defect.
  await expect(detailPhoto).toHaveAttribute('alt', '')
  // THE PHOTO IS ABOVE THE HEADING, by geometry rather than DOM order: the
  // img's bottom edge sits above the h1's top edge.
  const detailPhotoBox = await detailPhoto.boundingBox()
  const detailH1Box = await page.getByRole('heading', { level: 1, name: title }).boundingBox()
  expect(detailPhotoBox, 'the detail banner must have a box').not.toBeNull()
  expect(detailH1Box, 'the detail h1 must have a box').not.toBeNull()
  expect(
    detailPhotoBox!.y + detailPhotoBox!.height,
    'the place photo must sit ABOVE the h1 on the signed-in detail page',
  ).toBeLessThanOrEqual(detailH1Box!.y)
  // The credit DOES render for this row (it carries an attribution), as the
  // overlay on the picture — licence compliance travels with the image.
  // F5: the SAME read supplies the credit, so the url and the attribution are
  // observed together.
  const placeCredit = placeFields!.photo_attribution
  expect(placeCredit, 'the picked place must carry a credit to prove the overlay').toBeTruthy()
  await expect(
    page.locator('span').filter({ hasText: placeCredit! }),
  ).toBeVisible()

  const detailPlaceLink = page.getByRole('link', { name: PLACE_NAME, exact: true })
  await expect(detailPlaceLink).toBeVisible()
  // V33-4: the place's own facts line (kind + indoor/outdoor) now renders under
  // the name, so the paragraph's text is no longer just the place name. The
  // facts come from `placeTrustLine` — the SAME seam the card uses — which for
  // this seeded place yields "Park · Outdoor". Assert on the testid rather than
  // a positional `p` read, because the trust line is its own element now.
  const detailPlaceTrust = page.getByTestId('detail-place-trust')
  await expect(detailPlaceTrust).toBeVisible()
  await expect(detailPlaceTrust).toContainText('·')
  // The name link still lives in the paragraph above it; assert the link is
  // visible and the trust line is present, without pinning the paragraph's
  // exact text (which would couple the spec to the trust line's wording).

  // The remembered place on the SEEDED-PLACE path (V8 ticket 01's memory).
  //
  // HISTORY (this assertion was stale and is why the spec failed): the block
  // used to drive a "Recent places" CHIP for the place just posted. V13 ticket
  // 02 deliberately removed that chip row when it rebuilt the /new form, so the
  // button no longer exists and the assertion could never pass again. V8 ticket
  // 01's MEMORY itself is intact — the remembered place still resolves to the
  // directory row (places.resolvePlaceByName) and is reachable from a fresh
  // /new mount through the picker, which is the affordance the form ships. The
  // assertions below therefore pin BOTH halves: the removed chips stay gone,
  // and the place is still reachable and still fills place + address in one tap.
  await page.goto('/new')
  await settleOnRoute(page, '/new')
  const placeInputAgain = page.getByPlaceholder(PLACE_PLACEHOLDER)
  // No chip row: V13 ticket 02 removed the "Recent places" chips, and the
  // removed affordance must not come back by accident.
  await expect(page.getByRole('button', { name: PLACE_NAME, exact: true })).toHaveCount(0)
  // The place is still reachable from a fresh /new mount — through the picker,
  // which is the affordance the rebuilt form actually ships (the previous
  // assertion drove the removed chip button, which is why this spec failed).
  await placeInputAgain.fill(`@${PLACE_NAME}`)
  const remembered = page.getByTestId('place-suggestions').getByText(PLACE_NAME, { exact: true })
  await expect(remembered).toBeVisible()
  await remembered.click()
  // V13 ticket 02: the address the pick fills is readable in the visible flow.
  await expect(page.getByPlaceholder(PLACE_PLACEHOLDER)).toHaveValue(PLACE_NAME)
  await expect(page.getByPlaceholder(ADDRESS_PLACEHOLDER)).toHaveValue(PLACE_ADDRESS)
  await expect(page.getByTestId('place-suggestions')).toHaveCount(0)
  // V9 ticket 03 (review cycle 1, F2): the summary's title is a read-back —
  // tap it to edit (the input is what the specs drive).
  await editTitle(page)
  // V23 rename: the generated prefix is "Drop-in at …" now, not "Playdate at …".
  await expect(page.getByPlaceholder(TITLE_PLACEHOLDER)).toHaveValue(`Drop-in at ${PLACE_NAME}`)

  // THE SIGNED-OUT VIEW (T4 of the ticket, migration 0035's second half). The
  // anon path is NOT the embeds above — it is the SECURITY DEFINER
  // get_public_playdate RPC, whose old INNER join made a NULL-neighbourhood post
  // return NULL, i.e. "not found" for a post that plainly exists. A fresh
  // signed-out context is the only way to read it as anon sees it, and this
  // block is a PERMANENT REGRESSION GUARD, not a probe: re-adding `join` instead
  // of `left join` to 0035's function makes the two assertions below fail.
  const anonContext = await browser.newContext({
    baseURL: E2E_BASE_URL,
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

  // V32 v32-4 (A7/A9) — THE SIGNED-OUT SURFACE. The public payload crosses
  // `place_id` as a bare id (no place columns reach anon); the client reads the
  // anon-readable `places` row itself off `loadPlacesOrEmpty`. Same photo, same
  // rule, same geometry — a visitor with no session sees the place picture
  // above the heading exactly as a signed-in parent does.
  const publicPhoto = anonPage.getByTestId('public-place-photo')
  await expect(publicPhoto).toHaveCount(1)
  await expect(publicPhoto).toHaveAttribute('src', expectedPhotoUrl)
  await expect(publicPhoto).toHaveAttribute('alt', '')
  const publicPhotoBox = await publicPhoto.boundingBox()
  const publicH1Box = await anonPage.getByRole('heading', { level: 1, name: title }).boundingBox()
  expect(publicPhotoBox, 'the public banner must have a box').not.toBeNull()
  expect(publicH1Box, 'the public h1 must have a box').not.toBeNull()
  expect(
    publicPhotoBox!.y + publicPhotoBox!.height,
    'the place photo must sit ABOVE the h1 on the signed-out page',
  ).toBeLessThanOrEqual(publicH1Box!.y)
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

  // V33-4: a free-text post (no `place_id`) renders NO facts line at all — no
  // placeholder, no dangling separator. The trust line's testid must be absent.
  await expect(page.getByTestId('detail-place-trust')).toHaveCount(0)

  // The SECOND signed-out shape (the anon RPC again, different row): a post with
  // no neighbourhood AND no place_id, which is the whole existing free-text
  // corpus plus everything this version posts. Same permanent guard as the
  // picked-place case above — the INNER join answered NULL here too, so a
  // logged-out visitor got "not found" for a post that exists — and this is
  // also where the public view's Maps link (0021's field) still has to work.
  const anonContext = await browser.newContext({
    baseURL: E2E_BASE_URL,
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
  // THE SEQUENCE THE REVIEWER FOUND, re-pointed at a control that still exists.
  //
  // The original fixture drove a "Recent places" chip (V8 ticket 01) to write a
  // remembered post's neighbourhood into the form. V13 ticket 02 removed that
  // chip row, so the chip is gone — but the BUG IT EXPOSED is not: /new renders
  // no neighbourhood field (showNeighborhood = false), yet a neighbourhood id
  // can still ride `values.neighborhoodId` from a prefill. Picking a directory
  // place afterwards must REPLACE it (with NULL), never inherit it — every
  // seeded place has a NULL neighbourhood, so an inheriting fallback silently
  // stamps the OLD place's neighbourhood onto the new post.
  //
  // The DUPLICATE path is the surviving carrier of that hidden value: /new's
  // "Duplicate a previous drop-in" control clones a past post INCLUDING its
  // neighborhood_id (NewPlaydatePage applyLastPost), and /new still renders no
  // field for it.
  // So the sequence is: duplicate a post that carries a real neighbourhood, then
  // pick a directory place, then post — and assert the pick won.
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
      // The stale id the duplicate will carry into the form.
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

  // (1) Duplicate the seeded post: the form now holds a REAL neighbourhood id
  //     that this page does not render (there is no field for it at all).
  // The picker row is labelled by title + day (not the place), so it is matched
  // on the seeded TITLE.
  const seedTitle = `e2e ${marker.displayName} stale seed`
  await page.getByTestId('dup-duplicate').click()
  const seededRow = page.getByTestId('post-again').filter({ hasText: seedTitle })
  await expect(seededRow).toBeVisible()
  await seededRow.click()
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

/**
 * V32 v32-4 (A7/A9) — THE MODERATION BOUNDARY, ON A REAL ROW.
 *
 * The acceptance criterion is that an `unreviewed` photo renders the per-kind
 * illustration and NEVER the picture. The brief measured that this branch had
 * ZERO live playdates, so an assertion here could have passed vacuously (no row
 * → no img → "the img is absent" trivially true). This takes the brief's option
 * (a): the marker POSTS a drop-in at a genuinely unreviewed place through the
 * real `/new` path, so the branch is exercised on a real row rather than argued.
 *
 * The place is Bayview-Kinnear Park (c2baa3a0-e2a7-4d8f-8fa7-0b59a562a5fe): it
 * is `unreviewed` and it DOES carry a Wikimedia photo_url, so the ONLY reason
 * the picture is absent is the moderation rule — if `placePhotoVisibleTo` ever
 * stopped withholding unreviewed photos, this test would render the img and go
 * red. That is the mutation sensitivity, established by the row's own state.
 */
test('an UNREVIEWED place photo is withheld from a parent — the illustration renders instead', async ({
  page,
}) => {
  const marker = readMarkerMeta()
  const title = `e2e ${marker.displayName} unreviewed place`
  const UNREVIEWED_NAME = 'Bayview-Kinnear Park'

  await page.goto('/new')
  await settleOnRoute(page, '/new')
  await editTitle(page)
  await page.getByPlaceholder(TITLE_PLACEHOLDER).fill(title)
  await page.getByPlaceholder(PLACE_PLACEHOLDER).fill(`@${UNREVIEWED_NAME}`)
  const suggestion = page
    .getByTestId('place-suggestions')
    .getByText(UNREVIEWED_NAME, { exact: true })
  await expect(suggestion).toBeVisible()
  await suggestion.click()
  await page.locator('input[type="date"]').fill(localDatePlusDays(1))
  await submitAndLandOnFeed(page)

  const row = await readMarkerPost(title)
  expect(row?.place_id, 'the unreviewed place must be linked to the post').toBeTruthy()

  // THE ROW'S OWN STATE IS THE PREMISE: it is unreviewed AND it has a photo.
  // If either half were false, the assertions below would prove nothing.
  // F5 (V32-4F): read through the shared helper — one request, all three
  // columns — instead of a third inline single-purpose fetch for the same row.
  const state = await readPlacePhotoFields((row?.place_id ?? '').trim())
  expect(
    state?.photo_review_state,
    'the premise: this place must still be unreviewed for the boundary to be exercised',
  ).toBe('unreviewed')
  expect(state?.photo_url, 'the premise: the withheld photo must actually exist').toBeTruthy()

  // THE BOUNDARY: illustration yes, picture no.
  const card = page.getByTestId('dropin-card').filter({ hasText: title })
  await expect(card).toBeVisible()
  await expect(
    card.getByTestId('dropin-card-photo'),
    'an unreviewed photo must NEVER reach a parent',
  ).toHaveCount(0)
  await expect(card.locator('svg').first()).toBeVisible()
  await expect(card).not.toContainText('null')
})

/**
 * V32 v32-4 (A7/A9), F4: THE CREDIT-ABSENT BRANCH, PINNED ON A REAL ROW.
 *
 * V32-4F (F4) found the three-surface test CLAIMING this branch while its own
 * assertion required a credit. Rather than delete the claim, the branch gets its
 * own proof: "12th Ave Square Park" (55bc933f-22c1-4b30-acda-de32fb1a3b96) is
 * `confirmed` WITH a photo_url and NO attribution, so the picture must render
 * and the overlay must NOT — a picture shown without a licence line is a
 * compliance failure, and a credit invented for a picture that has none is a
 * lie about who made it.
 */
test('a confirmed photo with NO attribution renders the picture and no credit overlay', async ({
  page,
}) => {
  const marker = readMarkerMeta()
  const title = `e2e ${marker.displayName} no-credit place`
  const NO_CREDIT_NAME = '12th Ave Square Park'

  await page.goto('/new')
  await settleOnRoute(page, '/new')
  await editTitle(page)
  await page.getByPlaceholder(TITLE_PLACEHOLDER).fill(title)
  await page.getByPlaceholder(PLACE_PLACEHOLDER).fill(`@${NO_CREDIT_NAME}`)
  const suggestion = page
    .getByTestId('place-suggestions')
    .getByText(NO_CREDIT_NAME, { exact: true })
  await expect(suggestion).toBeVisible()
  await suggestion.click()
  await page.locator('input[type="date"]').fill(localDatePlusDays(1))
  await submitAndLandOnFeed(page)

  const row = await readMarkerPost(title)
  expect(row?.place_id, 'the picked place must be linked to the post').toBeTruthy()

  // THE PREMISE, read from the row itself: confirmed + a url + NO attribution.
  const fields = await readPlacePhotoFields((row?.place_id ?? '').trim())
  expect(fields?.photo_review_state, 'the premise: the photo must be confirmed').toBe('confirmed')
  expect(fields?.photo_url, 'the premise: the photo must exist').toBeTruthy()
  expect(fields?.photo_attribution, 'the premise: this row has no attribution').toBeNull()

  const card = page.getByTestId('dropin-card').filter({ hasText: title })
  await expect(card).toBeVisible()
  const cardPhoto = card.getByTestId('dropin-card-photo')
  // The PICTURE renders…
  await expect(cardPhoto).toHaveCount(1, { timeout: 20_000 })
  await expect(cardPhoto).toHaveAttribute('src', fields!.photo_url!)
  // …and NO credit overlay does. The overlay is the only `span` inside the
  // banner slot, so its absence is asserted structurally rather than by
  // guessing at licence strings.
  await expect(cardPhoto.locator('xpath=..').locator('span')).toHaveCount(0)
})

/**
 * V32-4F (F1) — A PUBLIC BANNER CANNOT BELONG TO THE PREVIOUS POST.
 *
 * `/playdate/:id` is ONE route element, so React Router REUSES the component
 * instance across a param-only change: the load effect re-runs, but any state it
 * does not explicitly clear survives. `publicPlace` was only ever SET, so a
 * signed-out visitor who opened post A (which names a place) and then navigated
 * to post B rendered B's page with A's place row still in state — A's photo
 * above B's title, on a share-link surface.
 *
 * THE REPRO MUST BE A REAL SPA NAVIGATION. `page.goto` would REMOUNT the route
 * and pass without the fix, proving nothing, so the hop below drives the app's
 * own history client-side instead. Post B names a DIFFERENT place with a
 * different photo, so a leak is directly observable as A's url on B's page.
 */
test('a signed-out post change never reuses the previous post’s place photo (V32-4F F1)', async ({
  page,
  browser,
}) => {
  const marker = readMarkerMeta()
  const titleA = `e2e ${marker.displayName} f1 place A`
  const titleB = `e2e ${marker.displayName} f1 place B`
  const PLACE_A = 'Atlantic Street Park'
  const PLACE_B = 'Ballard Commons Park'

  /** Post a FREE-TEXT drop-in (no directory place, so no `place_id`). */
  const postFreeText = async (title: string): Promise<string> => {
    await page.goto('/new')
    await settleOnRoute(page, '/new')
    await editTitle(page)
    await page.getByPlaceholder(TITLE_PLACEHOLDER).fill(title)
    // A plain typed place — never picked from the directory, so `place_id`
    // stays absent (the `placeIdField` discipline in db.ts).
    await page.getByPlaceholder(PLACE_PLACEHOLDER).fill('E2E F1 free text spot')
    await page.locator('input[type="date"]').fill(localDatePlusDays(1))
    await submitAndLandOnFeed(page)
    const posted = await readMarkerPost(title)
    expect(posted?.id, `the post "${title}" must exist`).toBeTruthy()
    expect(posted?.place_id ?? null, 'the free-text post must carry NO place_id').toBeNull()
    return posted!.id!
  }

  // Posting needs a session, so both posts are created as the MARKER through
  // `page` (the signed-in default context). The public half then uses a FRESH
  // signed-out context — the only way to read the page as anon sees it.
  const postAt = async (title: string, place: string): Promise<string> => {
    await page.goto('/new')
    await settleOnRoute(page, '/new')
    await editTitle(page)
    await page.getByPlaceholder(TITLE_PLACEHOLDER).fill(title)
    await page.getByPlaceholder(PLACE_PLACEHOLDER).fill(`@${place}`)
    const suggestion = page.getByTestId('place-suggestions').getByText(place, { exact: true })
    await expect(suggestion).toBeVisible()
    await suggestion.click()
    await page.locator('input[type="date"]').fill(localDatePlusDays(1))
    await submitAndLandOnFeed(page)
    const posted = await readMarkerPost(title)
    expect(posted?.id, `the post "${title}" must exist`).toBeTruthy()
    return posted!.id!
  }

  const idA = await postAt(titleA, PLACE_A)
  // Post B NAMES NO PLACE AT ALL. That is the shape that exposes the leak: B's
  // load never calls `setPublicPlace`, so A's row is the only thing the banner
  // could possibly render. (Against a B that names a place, the fresh write
  // overwrites the stale one and the leak is invisible — which is exactly how
  // the first version of this test passed under mutation.)
  const idB = await postFreeText(titleB)

  const ctx = await browser.newContext({
    baseURL: E2E_BASE_URL,
    storageState: { cookies: [], origins: [] },
  })
  const anonPage = await ctx.newPage()

  // Both rows must genuinely carry DIFFERENT photo urls, or a leak would be
  // invisible and this test would pass while proving nothing.
  const rowA = await readMarkerPost(titleA)
  const fieldsA = await readPlacePhotoFields((rowA?.place_id ?? '').trim())
  expect(fieldsA?.photo_url, 'post A must have a photo').toBeTruthy()
  expect(fieldsA?.photo_review_state, 'post A’s photo must be confirmed').toBe('confirmed')

  // Open A as a signed-out visitor and confirm A's picture is showing.
  await anonPage.goto(`/playdate/${idA}`)
  const photoA = anonPage.getByTestId('public-place-photo')
  await expect(photoA).toHaveCount(1, { timeout: 20_000 })
  await expect(photoA).toHaveAttribute('src', fieldsA!.photo_url!)

  // THE HOP: a client-side param change, no page load. `page.goto` here would
  // remount the route and the leak would be laundered away.
  await anonPage.evaluate((b) => {
    window.history.pushState({}, '', `/playdate/${b}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, idB)

  // WATCH THE TRANSITION, not only the settled page. The leak is A's photo
  // rendering on B while B's own load is in flight — the stale state is visible
  // IMMEDIATELY (the effect has not cleared it yet), so a poll that only looks
  // after B settles can miss it entirely. This samples continuously across the
  // whole hop and fails if A's url is EVER painted on B.
  const leakedUrl = fieldsA!.photo_url!
  let everLeaked = false
  // SAMPLE THE WHOLE WINDOW, not just the settled page: the stale frame lives
  // between the navigation and B's own data arriving, so a loop that stops once
  // B's heading appears stops exactly too early. It runs the full 15s (or until
  // a leak is seen), sampling every 50ms.
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const stale = await anonPage
      .locator(`img[src="${leakedUrl}"]`)
      .count()
      .catch(() => 0)
    if (stale > 0) {
      everLeaked = true
      break
    }
    await anonPage.waitForTimeout(50)
  }
  expect(
    everLeaked,
    'post A’s photo must NEVER be painted on post B, not even for one frame',
  ).toBe(false)

  // …and B, which names no place, settles with no banner at all.
  await expect(anonPage.getByTestId('public-place-photo-slot')).toHaveCount(0)

  await ctx.close()
})

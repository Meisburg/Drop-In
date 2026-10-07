/**
 * reviews-inline — WHAT PARENTS SAY ON THE PLACE PAGE, AND THE LIGHTBOXED
 * COMPOSE MODAL.
 *
 * WHY THIS SPEC EXISTS AT ALL, measured before the slice: `grep -rln
 * 'place-more-details\|place-rating-line\|review-form\|place-comment'
 * e2e/*.e2e.ts` returned NOTHING. The reviews wall, the review form and the
 * place-comment thread had no browser coverage anywhere, which is how the
 * feature reached a handover with the founder having to ask for it by hand. So
 * this file is not extra reassurance on top of an existing spec; it is the
 * first and only coverage of these surfaces.
 *
 * WHAT IT PINS, and the founder's words behind each half:
 *
 *   1. `/place/:id` renders `place-reviews` — the aggregate rating line plus up
 *      to three review bodies — and the zero case is an honest sentence with NO
 *      rows. His annotation on the old link: *"wouldn't you see what parents
 *      say about this place and they're rating right here?"*
 *   2. ONE compose button (`place-review-compose-btn`), carrying exactly the
 *      label the pure `reviewComposeLabel` seam returns for the viewer's state,
 *      at the 44px tap floor. *"And then you have the option to click on
 *      something to leave a review"*.
 *   3. It opens a real dialog (`place-review-modal`, `role="dialog"`, Escape
 *      closes) whose body holds the EXISTING `review-form` — asserted with
 *      `toHaveCount(1)` so the old inline copy is gone, not duplicated.
 *      *"I think that review should be like a modal that gets light boxed in
 *      where you just leave the review"*.
 *   4. Saving closes the modal and the new row appears inline with no reload
 *      (the form's `onSaved`, read back from the database).
 *   5. Three parents' reviews render three rows, newest first.
 *   6. `/place/:id/details` KEEPS the research surface — the rating line, the
 *      review form, the comment thread, hours and the web search — and the
 *      place page's door to it now names what that page ADDS instead of
 *      promising what is inline.
 *   7. The signed-out door stays shut. `/place/:id` is NOT login-walled — it is
 *      a public route (`isPublicPlacePath`, V8 ticket 07), which the brief's
 *      criterion 6 gets wrong — so the property that matters is pinned instead:
 *      a signed-out visitor reaches the page and gets the page's own sign-in
 *      prompt for this section, with NO aggregate, NO row, NO compose control
 *      and NO form. The V24 read-surface ruling covers a signed-in parent
 *      seeing other parents' words; an ANON read would be a different product
 *      decision and a migration, and neither is in scope.
 *
 * THE LIVE-DATA DISCIPLINE (docs/agents/e2e-fixture-convention.md). This suite
 * runs against the LIVE Supabase project, so every row this spec writes is
 * removed by this spec: reviews and comments are deleted through the author's
 * OWN JWT, with the PostgREST filter scoped to the row's own owner columns
 * (`place_id` + `author_profile_id`) — never a `like`/`in` sweep. The extra
 * reviewers are ordinary `e2e-` marker accounts, so the orchestrator's sweep
 * covers anything a killed run leaves behind.
 *
 * The place is read by NAME (`readPlaceByName`) rather than a hardcoded uuid,
 * and its review set is claimed in a pre-flight: this spec OWNS the reviews on
 * that place for the duration of the run. A third-party review there fails
 * loudly, by name, because the alternative — silently asserting the wrong
 * product state — is the failure mode a review spec must never have.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  E2E_BASE_URL,
  finishSignup,
  readMarkerMeta,
  readMarkerSession,
  readPlaceByName,
  readSessionFromBrowserPage,
  readSupabaseEnv,
  settleOnRoute,
  signUpViewer,
} from './fixtures'
// The pure seams, imported rather than re-spelled: the spec asserts the label
// the app decided, not a second copy of the decision (the repo's one-copy rule)
// — `fixtures.ts` already imports from `src/lib/` for the same reason.
import { reviewComposeLabel } from '../src/lib/reviews'

/** A seeded playground with hours, chosen because it carries NO reviews. */
const PLACE_NAME = 'Alki Playground'

/** The row shape this spec reads back (only the columns cleanup keys on). */
interface ReviewRow {
  author_profile_id: string
  score: number
  body: string | null
}

/** The signed-in parent's own PostgREST headers (no service role, no secrets). */
async function authHeaders(accessToken: string): Promise<Record<string, string>> {
  const { anonKey } = readSupabaseEnv()
  return { apikey: anonKey, Authorization: `Bearer ${accessToken}` }
}

/** Every review on the place, as the signed-in parent's own JWT can read it. */
async function readPlaceReviews(placeId: string, accessToken: string): Promise<ReviewRow[]> {
  const { url } = readSupabaseEnv()
  const res = await fetch(
    `${url}/rest/v1/reviews?place_id=eq.${placeId}&select=author_profile_id,score,body`,
    { headers: await authHeaders(accessToken) },
  )
  if (!res.ok) {
    throw new Error(`reading the place's reviews failed: HTTP ${res.status} ${await res.text()}`)
  }
  return (await res.json()) as ReviewRow[]
}

/**
 * Withdraw ONE parent's own review of this place.
 *
 * The filter is the row's own owner columns — `place_id` AND
 * `author_profile_id` — so this DELETE can only ever reach a row that parent
 * wrote on this place (0052's `reviews_delete_author` policy enforces the same
 * boundary in the database).
 */
async function deleteOwnReview(
  placeId: string,
  authorProfileId: string,
  accessToken: string,
): Promise<void> {
  const { url } = readSupabaseEnv()
  const headers = { ...(await authHeaders(accessToken)), Prefer: 'return=representation' }
  const query = `${url}/rest/v1/reviews?place_id=eq.${placeId}&author_profile_id=eq.${authorProfileId}`
  const res = await fetch(query, { method: 'DELETE', headers })
  if (!res.ok) {
    throw new Error(`withdrawing the review failed: HTTP ${res.status} ${await res.text()}`)
  }
}

/** Remove ONE parent's own comment on this place (the same owner-scoped filter). */
async function deleteOwnPlaceComment(
  placeId: string,
  authorProfileId: string,
  accessToken: string,
): Promise<void> {
  const { url } = readSupabaseEnv()
  const headers = { ...(await authHeaders(accessToken)), Prefer: 'return=representation' }
  const query = `${url}/rest/v1/place_comments?place_id=eq.${placeId}&author_profile_id=eq.${authorProfileId}`
  const res = await fetch(query, { method: 'DELETE', headers })
  if (!res.ok) {
    throw new Error(`withdrawing the comment failed: HTTP ${res.status} ${await res.text()}`)
  }
}

/**
 * CLAIM THE PLACE'S REVIEWS FOR THIS RUN, the way the photo specs snapshot and
 * restore their row: remove anything a killed earlier run left behind, then
 * prove the set is empty — and fail by name if a REAL parent has reviewed it,
 * because "the place has no reviews" is this spec's fixture assumption and the
 * place has to be re-picked rather than asserted around.
 */
async function claimEmptyReviewSet(
  placeId: string,
  accessToken: string,
  markerUserId: string,
): Promise<void> {
  const before = await readPlaceReviews(placeId, accessToken)
  const foreign = before.filter((row) => row.author_profile_id !== markerUserId)
  if (foreign.length > 0) {
    throw new Error(
      `${PLACE_NAME} now carries ${foreign.length} review(s) by other parents — this spec's ` +
        'fixture assumes an unreviewed place; pick another seeded place for PLACE_NAME',
    )
  }
  if (before.length > 0) await deleteOwnReview(placeId, markerUserId, accessToken)
  expect(
    await readPlaceReviews(placeId, accessToken),
    'the pre-flight must leave the place with no reviews',
  ).toEqual([])
}

/** Open the place page and wait for the inline block (its own read settled). */
async function openPlacePage(page: Page, placeId: string): Promise<void> {
  await page.goto(`/place/${placeId}`)
  await expect(page.getByTestId('place-reviews')).toBeVisible()
  // The compose control renders whatever the review read did, so waiting for it
  // is the block's "settled" signal rather than a race on the rows.
  await expect(page.getByTestId('place-review-compose-btn')).toBeVisible()
}

/** Open the compose modal, assert it is the ONLY review form, and fill it. */
async function composeReview(page: Page, stars: number, body: string): Promise<void> {
  await page.getByTestId('place-review-compose-btn').click()
  const modal = page.getByTestId('place-review-modal')
  await expect(modal).toBeVisible()
  await expect(modal).toHaveAttribute('role', 'dialog')
  // THE DUPLICATE PIN: the modal body holds the existing form, and the page has
  // no second copy of it (the old inline mount is gone).
  await expect(page.getByTestId('review-form')).toHaveCount(1)
  await expect(page.getByTestId('review-star-group')).toHaveCount(1)

  // THE STAR IS A LABEL CHIP, TAPPED THE WAY A PARENT TAPS IT. The radio itself
  // is `sr-only` (a 1px clipped input), which is exactly what a screen reader
  // and a thumb disagree about: `locator.check()` targets the 1px input and
  // retries its hit-target check forever (measured — both compose tests hung on
  // it), while a tap on the 44px chip is the real interaction and toggles the
  // radio through the label. The checked state is then asserted on the radio,
  // so the control's real state is what the test believes.
  await page.locator(`label:has(input[type="radio"][value="${stars}"])`).first().click()
  const radio = page.getByRole('radio', {
    name: `${stars} star${stars === 1 ? '' : 's'}`,
  })
  await expect(radio).toBeChecked()

  await page.getByTestId('review-comment-input').fill(body)
  await page.getByTestId('review-submit').click()
  // Saving closes the modal (the form's onSaved) and the page re-reads its own
  // rows, so the assertion after this is about the INLINE block, not the modal.
  await expect(page.getByTestId('place-review-modal')).toHaveCount(0)
}

test('the place page shows what parents say, and its zero case is honest (reviews-inline)', async ({
  page,
}) => {
  const { accessToken, userId } = readMarkerSession()
  const place = await readPlaceByName(PLACE_NAME)
  await claimEmptyReviewSet(place.id, accessToken, userId)

  try {
    await openPlacePage(page, place.id)

    // --- THE ZERO CASE: an honest sentence and NO rows (count 0, not an empty
    // container standing in for one). ---
    await expect(page.getByTestId('place-reviews-empty')).toBeVisible()
    await expect(page.getByTestId('place-reviews-empty')).toContainText(
      `No one has reviewed ${PLACE_NAME} yet.`,
    )
    await expect(page.locator('[data-testid^="place-review-row-"]')).toHaveCount(0)

    // --- ONE COMPOSE BUTTON, with the label the PURE SEAM returns, at 44px. ---
    const compose = page.getByTestId('place-review-compose-btn')
    await expect(compose).toHaveCount(1)
    await expect(compose).toHaveText(reviewComposeLabel(false))
    const box = await compose.boundingBox()
    expect(box, 'the compose control must render a box').not.toBeNull()
    expect(box!.height, 'the 44px tap floor').toBeGreaterThanOrEqual(44)

    // --- AND NO FORM UNTIL IT IS OPENED: the place page's only review-form
    // lives inside the modal. ---
    await expect(page.getByTestId('review-form')).toHaveCount(0)

    // --- THE LIGHTBOX: a real dialog holding that one form, Escape closes. ---
    await compose.click()
    const modal = page.getByTestId('place-review-modal')
    await expect(modal).toBeVisible()
    await expect(modal).toHaveAttribute('role', 'dialog')
    await expect(page.getByTestId('review-form')).toHaveCount(1)
    await expect(modal.getByTestId('place-review-modal-close')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('place-review-modal')).toHaveCount(0)
    await expect(page.getByTestId('review-form')).toHaveCount(0)
  } finally {
    // Nothing was written, but the claim is idempotent and restores the place
    // to the state the next test asserts on.
    await deleteOwnReview(place.id, userId, accessToken)
  }
  expect(await readPlaceReviews(place.id, accessToken)).toEqual([])
})

test('composing from the modal lands the review inline and flips the label (reviews-inline)', async ({
  page,
}) => {
  const { accessToken, userId } = readMarkerSession()
  const place = await readPlaceByName(PLACE_NAME)
  await claimEmptyReviewSet(place.id, accessToken, userId)

  const body = `e2e review ${Date.now()} — shaded benches and a fence.`
  try {
    await openPlacePage(page, place.id)
    await composeReview(page, 5, body)

    // --- THE INLINE ROW, from the database, with no reload. ---
    const row = page.getByTestId(`place-review-row-${userId}`)
    await expect(row).toBeVisible()
    await expect(row).toContainText(body)
    await expect(row).toContainText('5 stars')

    // --- THE AGGREGATE, from the 0052 RPC (never averaged in the browser). ---
    const rating = page.getByTestId('place-rating-line')
    await expect(rating).toBeVisible()
    await expect(rating).toContainText('5.0')
    await expect(rating).toContainText('1 review')

    // --- AND THE BUTTON NOW OFFERS THE EDIT, from the same pure seam. ---
    await expect(page.getByTestId('place-review-compose-btn')).toHaveText(
      reviewComposeLabel(true),
    )
    // The block shows a row, so the empty sentence is gone.
    await expect(page.getByTestId('place-reviews-empty')).toHaveCount(0)
  } finally {
    await deleteOwnReview(place.id, userId, accessToken)
  }
  expect(await readPlaceReviews(place.id, accessToken)).toEqual([])
})

test('three parents leave three reviews, and the place page shows three rows (reviews-inline)', async ({
  browser,
  page,
}) => {
  test.setTimeout(300_000)
  const { accessToken, userId } = readMarkerSession()
  const marker = readMarkerMeta()
  const place = await readPlaceByName(PLACE_NAME)
  await claimEmptyReviewSet(place.id, accessToken, userId)

  const epoch = Math.floor(Date.now() / 1000)
  const stamp = `${epoch}-${Math.floor(Math.random() * 1e6)}`
  const viewers: Array<{ context: Awaited<ReturnType<typeof browser.newContext>>; token: string; id: string; body: string }> = []

  try {
    // --- TWO OTHER PARENTS, each through the app's own signup walk (the
    // sanctioned way this suite creates an account: an `e2e-` address the
    // sweep can remove), each posting a review through the modal. ---
    for (const [index, stars] of [4, 3].entries()) {
      const label = `e2e-v-rev-${stamp}-${index}`
      const context = await browser.newContext({
        baseURL: E2E_BASE_URL,
        storageState: { cookies: [], origins: [] },
      })
      const viewerPage = await context.newPage()
      await signUpViewer(viewerPage, {
        name: label,
        email: `${label}@gmail.com`,
        password: `e2e-rev-pw-${stamp}-${index}`,
      })
      await finishSignup(viewerPage, { homeZip: marker.homeZip, radiusMiles: 5 })
      const session = await readSessionFromBrowserPage(viewerPage)
      expect(session, `viewer ${index} must hold a session after onboarding`).not.toBeNull()

      const body = `e2e review ${stamp} from ${label} — ${stars} stars from the modal.`
      await openPlacePage(viewerPage, place.id)
      await composeReview(viewerPage, stars, body)
      await expect(viewerPage.getByTestId(`place-review-row-${session!.userId}`)).toBeVisible()

      viewers.push({ context, token: session!.accessToken, id: session!.userId, body })
    }

    // --- AND THE MARKER'S OWN, so the block has three to choose from. ---
    const markerBody = `e2e review ${stamp} from the marker — the third row.`
    await openPlacePage(page, place.id)
    await composeReview(page, 5, markerBody)

    // --- THREE ROWS, newest first (the marker's is last written → first). ---
    const rows = page.locator('[data-testid^="place-review-row-"]')
    await expect(rows).toHaveCount(3)
    await expect(rows.first()).toContainText(markerBody)
    for (const viewer of viewers) {
      await expect(page.getByTestId(`place-review-row-${viewer.id}`)).toContainText(viewer.body)
    }

    // The aggregate counts all three (the RPC, not the row list).
    await expect(page.getByTestId('place-rating-line')).toContainText('3 reviews')
    await expect(page.getByTestId('place-reviews-empty')).toHaveCount(0)
  } finally {
    // Every row this spec wrote, removed by its OWN author — the marker's with
    // the marker's JWT, each viewer's with theirs.
    await deleteOwnReview(place.id, userId, accessToken)
    for (const viewer of viewers) {
      await deleteOwnReview(place.id, viewer.id, viewer.token)
      await viewer.context.close()
    }
  }
  expect(await readPlaceReviews(place.id, accessToken)).toEqual([])
})

test('the research page keeps the wall, hours and the web search — and the door stops promising the summary (reviews-inline)', async ({
  page,
}) => {
  const { accessToken, userId } = readMarkerSession()
  const place = await readPlaceByName(PLACE_NAME)
  await claimEmptyReviewSet(place.id, accessToken, userId)

  const comment = `e2e place comment ${Date.now()} — the lot fills by ten.`
  try {
    // --- THE DOOR. It still exists, still points at the research page, and now
    // names what that page ADDS instead of repeating the inline block. ---
    await openPlacePage(page, place.id)
    const door = page.getByTestId('place-more-details')
    await expect(door).toBeVisible()
    await expect(door).toHaveAttribute('href', `/place/${place.id}/details`)
    await expect(door).toHaveText('All reviews and comments →')
    // The lie is gone: the old label promised what is now inline.
    await expect(page.getByText('What parents say about this place →')).toHaveCount(0)

    // --- THE RESEARCH PAGE, whose surface this slice must not break. ---
    await door.click()
    await expect(page).toHaveURL(new RegExp(`/place/${place.id}/details$`))
    await expect(page.getByTestId('details-back-to-place')).toBeVisible()
    // The full wall's own pieces: the aggregate line, the review form and the
    // comment thread all still render HERE.
    await expect(page.getByTestId('place-rating-line')).toBeVisible()
    await expect(page.getByTestId('review-form')).toHaveCount(1)
    await expect(page.getByTestId('place-web-search')).toBeVisible()
    await expect(page.getByTestId('details-hours')).toBeVisible()
    await expect(page.getByTestId('place-comment-count')).toBeVisible()

    // --- POST ONE COMMENT AND SEE IT ON THE WALL (cleaned up below). ---
    await page.getByTestId('place-comment-input').fill(comment)
    await page.getByTestId('place-comment-submit').click()
    const posted = page.getByTestId('place-comment')
    await expect(posted).toHaveCount(1)
    await expect(posted).toContainText(comment)
  } finally {
    await deleteOwnPlaceComment(place.id, userId, accessToken)
    await deleteOwnReview(place.id, userId, accessToken)
  }

  // The comment really is gone (a reload re-reads the wall).
  await page.reload()
  await expect(page.getByTestId('place-comment')).toHaveCount(0)
})

test('a signed-out visitor gets no review surface at all (reviews-inline)', async ({
  browser,
}) => {
  const place = await readPlaceByName(PLACE_NAME)
  const context = await browser.newContext({
    baseURL: E2E_BASE_URL,
    storageState: { cookies: [], origins: [] },
  })
  try {
    const anonPage = await context.newPage()
    await anonPage.goto(`/place/${place.id}`)

    // ⚠️ THE SPEC'S CRITERION 6 SAYS "still redirects to /login", AND THAT IS
    // NOT WHAT THIS APP DOES — measured here: `/place/:id` is a PUBLIC route
    // (`isPublicPlacePath` in src/lib/auth.ts, V8 ticket 07), so a signed-out
    // visitor reaches the page and reads the place's own public columns. The
    // criterion's PREMISE is wrong, so its assertion is not weakened but
    // corrected: what must hold — and what this slice could actually break — is
    // that the review surface adds NO anon exposure. The section renders, and
    // inside it a signed-out visitor gets the page's own sign-in prompt, never
    // an aggregate, a row, a compose control or a form.
    await expect(anonPage.getByTestId('place-reviews')).toBeVisible()
    await expect(anonPage.getByTestId('place-reviews')).toContainText(
      'Reviews are for signed-in parents.',
    )
    await expect(anonPage.getByTestId('place-rating-line')).toHaveCount(0)
    await expect(anonPage.getByTestId('place-reviews-empty')).toHaveCount(0)
    await expect(anonPage.locator('[data-testid^="place-review-row-"]')).toHaveCount(0)
    await expect(anonPage.getByTestId('place-review-compose-btn')).toHaveCount(0)
    await expect(anonPage.getByTestId('review-form')).toHaveCount(0)
    await expect(anonPage.getByTestId('place-review-modal')).toHaveCount(0)
  } finally {
    await context.close()
  }
})

/**
 * V32 v32-9 (A10) — THE PLACE'S RATING ON A DROP-IN PAGE.
 *
 * Q1 ruled: the stars rate the PLACE, not the drop-in. The drop-in detail page
 * mounts the same `PlaceRatingLine` the place page uses, beside the place it
 * describes.
 *
 * THE CRUX IS THE ABSENT CASE. `PlaceRatingLine` renders its zero case as an
 * INVITATION — "Be the first to rate {place}." — which is right on a place page
 * (where a parent can actually write one) and is noise on a drop-in page. So an
 * unrated place must render NOTHING there: not a zero, not an empty star row,
 * and not that invitation. `hasPlaceRating` (lib/reviews) is the threshold, and
 * the second test below is what proves it is wired.
 */
test('a drop-in page shows the PLACE’s rating when it has one (V32-9 A10)', async ({ page }) => {
  const { url: restUrl, anonKey } = readSupabaseEnv()
  const { accessToken } = readMarkerSession()
  const headers = { apikey: anonKey, Authorization: `Bearer ${accessToken}` }

  // FIND a place that genuinely has reviews AND has a post, rather than pinning a
  // seeded id: the review set is live data another spec may have just cleared.
  const reviewsRes = await fetch(`${restUrl}/rest/v1/reviews?select=place_id`, { headers })
  const reviewRows = reviewsRes.ok ? ((await reviewsRes.json()) as Array<{ place_id: string }>) : []
  const ratedPlaceIds = [...new Set(reviewRows.map((r) => r.place_id))]
  expect(ratedPlaceIds.length, 'the live project must hold at least one reviewed place').toBeGreaterThan(0)

  const postRes = await fetch(
    `${restUrl}/rest/v1/playdates?place_id=in.(${ratedPlaceIds.join(',')})&select=id,place,place_id&limit=1`,
    { headers },
  )
  const posts = postRes.ok
    ? ((await postRes.json()) as Array<{ id: string; place: string; place_id: string }>)
    : []
  expect(posts.length, 'a reviewed place must have a drop-in to open').toBeGreaterThan(0)
  const post = posts[0]

  // The summary the page will read, so the rendered line is asserted against the
  // SAME numbers rather than a guess.
  const sumRes = await fetch(`${restUrl}/rest/v1/rpc/review_summary`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_place_id: post.place_id }),
  })
  const summaryRow = (await sumRes.json()) as Array<{ review_count: number; display_average: string | null }>
  const summary = summaryRow[0]
  console.log(
    `[V32-9] rated place ${post.place_id} "${post.place}" count=${summary.review_count} avg=${summary.display_average}`,
  )

  await page.goto(`/playdate/${post.id}`)
  await settleOnRoute(page, `/playdate/${post.id}`)
  const line = page.getByTestId('place-rating-line')
  // V32-9 (STEP 4): the testid now appears on a FOURTH surface, so its count is
  // pinned HERE deliberately rather than left to collide with a future
  // `toHaveCount(1)` elsewhere. Measured on this build: the drop-in detail page
  // renders EXACTLY ONE, `/browse` renders one per RATED row (4 on a 117-row
  // directory — most places have no rating at all), and `/place/:id` plus
  // `/place/:id/details` render one each.
  await expect(line).toHaveCount(1, { timeout: 20_000 })
  await expect(page.getByTestId('place-rating-line')).toHaveCount(1)
  // The rendered line states the real numbers.
  await expect(line).toContainText(`${Number(summary.display_average).toFixed(1)} out of 5`)
  await expect(line).toContainText(
    `${summary.review_count} ${summary.review_count === 1 ? 'review' : 'reviews'}`,
  )
  // And it sits with the place it describes: inside the place paragraph's block,
  // below the h1 (NOT above it — that is the photo banner's slot).
  const lineBox = await line.boundingBox()
  const h1Box = await page.getByRole('heading', { level: 1 }).boundingBox()
  expect(lineBox, 'the rating line must have a box').not.toBeNull()
  expect(h1Box, 'the h1 must have a box').not.toBeNull()
  expect(
    lineBox!.y,
    'the rating belongs in the place block BELOW the heading',
  ).toBeGreaterThanOrEqual(h1Box!.y + h1Box!.height)
})

test('an UNRATED place renders NOTHING on a drop-in page — no zero, no invitation (V32-9 A10)', async ({
  page,
}) => {
  const { url: restUrl, anonKey } = readSupabaseEnv()
  const { accessToken } = readMarkerSession()
  const headers = { apikey: anonKey, Authorization: `Bearer ${accessToken}` }

  // A post whose place has no reviews at all.
  const res = await fetch(
    `${restUrl}/rest/v1/playdates?place_id=not.is.null&select=id,place,place_id&limit=40`,
    { headers },
  )
  const posts = res.ok ? ((await res.json()) as Array<{ id: string; place: string; place_id: string }>) : []
  let unrated: (typeof posts)[number] | null = null
  for (const p of posts) {
    const s = await fetch(`${restUrl}/rest/v1/rpc/review_summary`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_place_id: p.place_id }),
    })
    const rows = (await s.json()) as Array<{ review_count: number }>
    if ((rows[0]?.review_count ?? 0) === 0) {
      unrated = p
      break
    }
  }
  expect(unrated, 'the live project must hold an unreviewed place with a post').not.toBeNull()
  console.log(`[V32-9] unrated place ${unrated!.place_id} "${unrated!.place}"`)

  await page.goto(`/playdate/${unrated!.id}`)

  // ⚠️ WAIT FOR THE PAGE TO SETTLE BEFORE ASSERTING ABSENCE. A blank page
  // satisfies every `toHaveCount(0)` below for the wrong reason — that is the
  // vacuous-pass class this repo names, and it happened here: the first version
  // of this test asserted absence against a page whose `h1` had not painted, so
  // it passed even with the predicate mutated to always-true. The h1 is the
  // gate, then the place paragraph, and only then the rating assertions.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(unrated!.place, { exact: false }).first()).toBeVisible()

  // THE CRUX: absent, and specifically NOT the zero-case invitation.
  await expect(page.getByTestId('place-rating-line')).toHaveCount(0)
  await expect(page.getByText('Be the first to rate', { exact: false })).toHaveCount(0)
  await expect(page.getByText('0.0 out of 5', { exact: false })).toHaveCount(0)
  await expect(page.getByText('0 reviews', { exact: false })).toHaveCount(0)
  // The page still rendered (a guard against asserting absence on a broken page).
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('a signed-out visitor sees no rating line AND issues no review_summary request (V32-9 A10)', async ({
  browser,
}) => {
  const { url: restUrl, anonKey } = readSupabaseEnv()
  const { accessToken } = readMarkerSession()
  const headers = { apikey: anonKey, Authorization: `Bearer ${accessToken}` }

  const res = await fetch(`${restUrl}/rest/v1/playdates?place_id=not.is.null&select=id&limit=1`, { headers })
  const posts = res.ok ? ((await res.json()) as Array<{ id: string }>) : []
  expect(posts.length, 'a public drop-in must exist to open').toBeGreaterThan(0)

  const context = await browser.newContext({
    baseURL: E2E_BASE_URL,
    storageState: { cookies: [], origins: [] },
  })
  const anonPage = await context.newPage()
  try {
    // BOTH halves in one test, because EITHER alone passes for the wrong reason:
    // a page that renders no line by accident still leaks the request, and a page
    // that hides the line but calls the RPC has still widened the read.
    const rpcCalls: string[] = []
    anonPage.on('request', (r) => {
      if (r.url().includes('review_summary')) rpcCalls.push(r.url())
    })
    await anonPage.goto(`/playdate/${posts[0].id}`)
    await expect(anonPage.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 })
    // Give a late read a chance to appear before asserting it did not.
    await anonPage.waitForTimeout(2000)

    expect(rpcCalls, 'a signed-out page must NOT issue the review_summary read').toEqual([])
    await expect(anonPage.getByTestId('place-rating-line')).toHaveCount(0)
    await expect(anonPage.getByText('Be the first to rate', { exact: false })).toHaveCount(0)
  } finally {
    await context.close()
  }
})

test('a FAILED summary read renders nothing — never a 0.0 (V32-9 A10)', async ({ page }) => {
  const { url: restUrl, anonKey } = readSupabaseEnv()
  const { accessToken } = readMarkerSession()
  const headers = { apikey: anonKey, Authorization: `Bearer ${accessToken}` }

  const reviewsRes = await fetch(`${restUrl}/rest/v1/reviews?select=place_id`, { headers })
  const reviewRows = reviewsRes.ok ? ((await reviewsRes.json()) as Array<{ place_id: string }>) : []
  const ratedPlaceIds = [...new Set(reviewRows.map((r) => r.place_id))]
  const postRes = await fetch(
    `${restUrl}/rest/v1/playdates?place_id=in.(${ratedPlaceIds.join(',')})&select=id&limit=1`,
    { headers },
  )
  const posts = postRes.ok ? ((await postRes.json()) as Array<{ id: string }>) : []
  expect(posts.length).toBeGreaterThan(0)

  // Abort the RPC. The page must swallow the failure into "no line" — the same
  // direction an unrated place takes — rather than drawing a 0.0, which would
  // read as "this place is terrible".
  await page.route('**/rest/v1/rpc/review_summary', (route) => route.abort())
  await page.goto(`/playdate/${posts[0].id}`)
  await settleOnRoute(page, `/playdate/${posts[0].id}`)
  await page.waitForTimeout(2500)

  await expect(page.getByTestId('place-rating-line')).toHaveCount(0)
  await expect(page.getByText('0.0 out of 5', { exact: false })).toHaveCount(0)
  // The page itself survived the failed decoration read.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

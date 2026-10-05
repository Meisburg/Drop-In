/**
 * V28 slice 7b — the no-zip honesty pin at the browser level (plan Slice 7:
 * "a no-zip parent is pinned at the browser level").
 *
 * WHAT IT PINS. Slice 2b removed the app-wide onboarding wall, so a SETTLED
 * no-zip parent (profile loaded, `home_zip` null) now reaches every route. For
 * that parent the feed query returns an empty list by construction
 * (`src/lib/db.ts` listRadiusFeed: `if (viewer.homeZip === null) return []`),
 * and Browse's directory has no placed rows (every `placeDistanceMiles` is
 * null), so BOTH callers used to render the radius empty state — the LIE:
 * "Nothing within N miles yet.", whose escapes were all inert (there is no
 * zip to widen FROM). Slice 2c closed it with one early return inside
 * `RadiusEmptyState` (src/components/RadiusEmptyState.tsx) that renders the
 * shared `LocationRequiredNotice` for the settled no-zip case, so every
 * caller is fixed by construction: FeedPage and Browse (PlaceDirectory via
 * `radiusReason`). Unit tests only cover `.ts`, and 2c's own specs ran with
 * a zip present — so this spec is the regression guard for that early
 * return: it asserts the NOTICE, not the lie, on BOTH callers, because
 * Browse is the caller that was nearly missed.
 *
 * HOW THE VIEWER BECOMES ZIP-LESS. The interview's AREA card is REQUIRED, so
 * walking it to the end always sets a zip. Instead this spec signs the
 * viewer up and completes the NAME card only (the card that creates the
 * profile row, which never touches `home_zip`) and stops BEFORE the kids and
 * area cards — the walk ends one hop after the name card, because V28 r2
 * slice 1b deleted the photo card that used to sit between them — a parent who
 * abandons after their name is exactly the settled
 * no-zip state, reached through the product's own flow rather than a lab-only
 * REST null. (A REST `home_zip: null` PATCH of an onboarded profile would
 * reach the same state; stopping the walk is simpler and one less live
 * write.)
 *
 * THE SETTLE BEAT: `signUpViewer` ends the moment the name card's Continue is
 * tapped — the `createProfile` insert is still in flight, and navigating away
 * mid-write leaves the viewer with NO profile row at all (the feed then sits
 * at its `profile === null` "Loading…" forever, because a row-less user is
 * not the no-zip state the slice designs for). So the spec waits for the
 * KIDS card's Skip control before navigating: that control renders only once
 * the name card has settled (`profile !== null` — the name card is the branch
 * that shows while `profile === null`), the same settle discipline
 * `finishSignup`'s first hop uses. Skipping is NOT tapped: the viewer stays
 * at the kids card, one hop before the required area card.
 *
 * FIXTURE CONVENTION (docs/agents/e2e-fixture-convention.md): the account
 * carries the `e2e-` prefix (`e2e-nz-<epoch>@gmail.com` — nz = no-zip), so
 * the batch-end sweep (scripts/sweep-e2e-markers.mjs) deletes it and the
 * profile row it owns cascades. The spec creates no drop-ins, so there is
 * nothing titled to mark and no REST DELETE to scope — the account marker is
 * the whole cleanup story.
 */
import { expect, test } from '@playwright/test'
import { settleOnRoute, signUpViewer } from './fixtures'

test('a no-zip parent sees the location notice on the feed AND on browse, never the radius empty state', async ({
  browser,
}) => {
  const epoch = Math.floor(Date.now() / 1000)
  const viewerEmail = `e2e-nz-${epoch}@gmail.com` // gmail.com: the project rejects example.com
  const viewerPassword = `e2e-nz-pw-${epoch}` // in-memory only — never written, never committed

  // The viewer: a fresh signed-out context (the marker's context is a
  // different person — it has a zip by construction, which is the state this
  // spec must NOT have).
  const viewerContext = await browser.newContext({
    baseURL: E2E_BASE_URL,
    storageState: { cookies: [], origins: [] },
  })
  const viewerPage = await viewerContext.newPage()

  // Zip-less by stopping the walk: signup + name card only. The name card's
  // Continue creates the profile row (home_zip stays null) and lands on the
  // kids card; the spec does not walk further.
  await signUpViewer(viewerPage, {
    name: `e2e-nz-${epoch}`,
    email: viewerEmail,
    password: viewerPassword,
  })

  // The settle beat (see the doc block): the kids card's Skip control only
  // renders once the name card's createProfile + refresh have settled, so its
  // visibility is the proof the profile row EXISTS. Do not tap it — tapping
  // skips the kids card; the viewer must stop here, one hop before the
  // required area card.
  await expect(viewerPage.getByRole('button', { name: 'Skip' })).toBeVisible({
    timeout: 30_000,
  })

  // Since slice 2b no route bounces a no-zip parent, the feed is reachable
  // directly.

  // --- THE FEED: the notice, not the lie. ---
  await viewerPage.goto('/')
  await settleOnRoute(viewerPage, '/')

  const feedNotice = viewerPage.getByTestId('location-required-notice')
  await expect(feedNotice).toBeVisible()
  await expect(feedNotice).toContainText('Set your home location first')
  // The lie (the `empty-radius-state` block and its "Nothing within N miles
  // yet." copy, which exists only inside it) must be GONE from the feed —
  // this is the assertion that fails on the pre-2c code.
  await expect(viewerPage.getByTestId('empty-radius-state')).toHaveCount(0)

  // The notice's control is LIVE (the lie's escapes were inert): "Set
  // location" goes to the onboarding area card, the one place that can fix
  // the state.
  await feedNotice.getByRole('link', { name: 'Set location' }).click()
  await expect(viewerPage).toHaveURL('/onboarding')

  // --- BROWSE: the second caller 2c nearly missed. ---
  await viewerPage.goto('/browse')
  await settleOnRoute(viewerPage, '/browse')

  const browseNotice = viewerPage.getByTestId('location-required-notice')
  await expect(browseNotice).toBeVisible()
  await expect(browseNotice).toContainText('Set your home location first')
  // Same pin on the second caller: no radius empty state under the notice.
  await expect(viewerPage.getByTestId('empty-radius-state')).toHaveCount(0)

  await viewerContext.close()
  console.log(
    `[e2e markers] viewer ${viewerEmail} persists by design (e2e-nz- prefix) — orchestrator sweep`,
  )
})

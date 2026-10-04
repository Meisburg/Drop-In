/**
 * Spec (V3 ticket 07): the card's going circles.
 *
 * The host marker posts a drop-in; a second deterministic marker (viewer,
 * `e2e-v-<epoch>` prefix, a fresh signed-out context — the zip-radius
 * pattern) pings it via the card's "going" check toggle (ticket 06's
 * optimistic write path — the round-trip upserts the going_pings row; the
 * 0010 self-ping trigger allows it, the viewer is not the host). The
 * host's OWN feed card then shows the going line (the ticket pin: own
 * posts keep the line, the host sees who's coming — unlike the ping
 * toggle, which is hidden there): the pinger's circle, then "1 going". V25
 * ticket 06 flipped that order — the circles LEAD and the count follows — and
 * this spec asserts the ORDER on the rendered geometry, because it is the
 * change a regression would silently undo. The ticket also took the overlap to
 * HALF the 24px face (`-ml-3` = 12px, was `-ml-2` = 8px); that overlap only
 * exists from the SECOND circle on and this fixture has exactly ONE pinger, so
 * NOTHING here can measure it — the stagger is pinned by the source in
 * `src/components/DropInCard.tsx` and by no automated assertion. The viewer has
 * no avatar → the fallback-initial circle (the display name's
 * first char, upper — "E" for e2e-v-<epoch>; names never surface on
 * cards, the guest list stays on the detail page per ticket 05). One
 * pinger: the "+N" overflow chip is absent (it appears only past the
 * 3-circle cap).
 *
 * Before the host reload the spec waits on the DB: it polls REST
 * going_pings (the broad authenticated SELECT, 0007; the marker's own
 * JWT) until the ping row is visible — the feed's pings fetch is one-shot
 * per load and the product intentionally has no live refresh after a
 * toggle (the parked ticket-07 observation), so a reload that beats the
 * viewer's upsert chain would see an empty feed.
 *
 * Pre-0020-apply this spec is RED by design: listPingsForPosts selects
 * going_pings.created_at (migration 0020), which 42703s on the missing
 * column and the feed page degrades to no going lines (never a crash).
 * It goes green once the orchestrator/verifier applies 0020 live via the
 * dashboard SQL API (the V3.4 evidence step) — the same discipline as
 * host-status.e2e.ts was pre-0016-apply.
 *
 * Cleanup (best-effort per house): the host marker's playdate rows are
 * deleted via REST with the marker's own JWT (host-only DELETE policy);
 * going_pings.playdate_id is ON DELETE CASCADE (0007), so the viewer's
 * ping row goes with the post. The viewer account (e2e-v- prefix, no
 * playdate rows of its own) is left for the orchestrator's sweep (the
 * zip-radius pattern).
 */
import { expect, test } from '@playwright/test'
import {
  editTitle, localDatePlusDays, readMarkerMeta, readMarkerSession,
  readSupabaseEnv, settleOnRoute, finishSignup,
  signUpViewer, stepStartTimeOnce,
} from './fixtures'

test('a pinger\'s circle shows on the host\'s own card ("1 going" + initial, no "+N")', async ({
  page,
  browser,
}) => {
  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const viewerName = `e2e-v-${epoch}`
  const viewerEmail = `e2e-v-${epoch}@gmail.com` // gmail.com: the project rejects example.com
  const viewerPassword = `e2e-v-pw-${epoch}` // in-memory only — never written, never committed
  const title = `e2e ${marker.displayName} going lot`

  // --- The host (the marker's signed-in context) posts a drop-in. ---
  await page.goto('/new')
  await settleOnRoute(page, '/new')
  // V9 ticket 03 (review cycle 1, F2): the summary's title is a read-back —
  // tap it to edit (the input is what the specs drive).
  await editTitle(page)
  await page.getByPlaceholder('e.g. Playground time at Green Lake').fill(title)
  await page
    .getByPlaceholder('e.g. Green Lake playground, near the boathouse')
    .fill('E2E going lot')
  // V9 ticket 01: /new no longer asks for a neighbourhood — nothing to pick.
  // V13 ticket 02: the date + the 30-minute stepper live in the visible "When" section (the disclosure is gone).
  await page.locator('input[type="date"]').fill(localDatePlusDays(1))
  const start = await stepStartTimeOnce(page)
  // V13 ticket 03: no duration chips on /new — the End stepper shows
  // the current end time (start + auto-duration). Verify it's visible.
  await expect(page.getByTestId('end-time-label')).toBeVisible()
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')

  // No pings yet: the host's own card renders NO going line (count 0 →
  // the line is hidden — "0 going" is not a state). The anchored regex
  // matches the going line's "N going" label only (the card's title also
  // contains the word "going" — an unanchored match would hit the h3).
  const hostCard = page.locator('a').filter({ hasText: title }).first()
  await expect(hostCard).toBeVisible()
  await expect(hostCard.getByText(/^\d+ going$/)).toHaveCount(0)

  // --- The viewer: a second deterministic marker in a FRESH signed-out
  // context (the default context carries the host marker's session). The
  // clean storageState overrides the project's merged marker state. Same
  // home zip as the host (the post sits at the host's zip — distance 0,
  // inside any radius), so the post is in the viewer's radius feed. ---
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

  // The viewer's location step (the same REST write a real user gets).
  await finishSignup(viewerPage, {
    homeZip: marker.homeZip,
    radiusMiles: marker.radiusMiles,
  })

  // The viewer pings the host's post via the card's "going" check toggle
  // (the active state = the write round-tripped; the optimistic flip is
  // authoritative here because there is no concurrent toggle).
  const viewerCard = viewerPage.locator('a').filter({ hasText: title }).first()
  await expect(viewerCard).toBeVisible()
  await viewerCard.getByRole('button', { name: /^Say we’re going to/ }).click()
  await expect(
    viewerCard.getByRole('button', { name: /^Going — tap to take it back$/ }),
  ).toBeVisible()

  // --- Deterministic gate: wait for the ping row to LAND before the host
  // reload. The card's optimistic flip (the assertion above) resolves
  // before the viewer's 4-call upsert chain commits, and the host reload
  // below re-runs the feed's ONE-SHOT pings fetch (no live refresh after
  // a toggle — the product behavior, parked ticket-07 observation). A
  // reload that beats the upsert sees an empty feed and the "1 going"
  // assertion misses its window. Poll REST going_pings (the broad
  // authenticated SELECT, 0007) with the marker's own JWT (the same
  // extraction the cleanup below uses) until the row is visible.
  const { url: restUrl, anonKey } = readSupabaseEnv()
  const { accessToken, userId } = readMarkerSession()
  const restHeaders: Record<string, string> = {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
  }
  await expect
    .poll(
      async () => {
        // This run's post (newest first — a leftover post from a failed
        // cleanup can't answer the poll with a stale ping row).
        const postQuery =
          `${restUrl}/rest/v1/playdates?host_profile_id=eq.${userId}` +
          `&title=eq.${encodeURIComponent(title)}&order=created_at.desc&limit=1&select=id`
        const postRes = await fetch(postQuery, { headers: restHeaders })
        if (!postRes.ok) throw new Error(`playdates lookup HTTP ${postRes.status}`)
        const posts = (await postRes.json()) as Array<{ id: string }>
        if (posts.length === 0) return 0
        const pingQuery = `${restUrl}/rest/v1/going_pings?playdate_id=eq.${posts[0].id}&select=profile_id`
        const pingRes = await fetch(pingQuery, { headers: restHeaders })
        if (!pingRes.ok) throw new Error(`going_pings poll HTTP ${pingRes.status}`)
        const pings = (await pingRes.json()) as Array<Record<string, unknown>>
        return pings.length
      },
      { timeout: 10_000 },
    )
    .toBeGreaterThanOrEqual(1)

  // --- The host's feed: the host's OWN post keeps the going line. The
  // viewer has no avatar → the fallback-initial circle (the display
  // name's first char, upper — "E" for e2e-v-<epoch>; the only
  // span.bg-slate-200 in the card is that circle). ---
  await page.reload()
  // TODO(V27 slice 4, the going line's age BAND): this spec's pinger pings the
  // post WITHOUT a kid, so there is no `ping_kids` row and the card has no
  // aggregate band to assert — the going line reads "1 going", never
  // "1 going · 1 kid (age N)". MISSING FIXTURE: a pinger who attaches a
  // `ping_kids` row to their `going_pings` row (a kid owned by the pinger, the
  // 0026/0040 policy), which would let this spec assert the 0056 band on the
  // host's card. Not invented here on purpose (the fixture is a real change to
  // the spec's write path, not a line). WORKSPACE BLOCKER: no live credentials
  // and no e2e/.auth marker in this workspace, so the band cannot be exercised
  // end-to-end; the unit seam (feed.goingCountsLabel / buildGoingLine) and the
  // db helper's mocked-client test pin it instead.
  // TODO(V27 slice 5, the host's common-ground line): `card-host-common` is the
  // "You follow this host" line the pure `feed.hostCommonGroundLine` builds. It
  // names ONLY the follow edge — the host's kids' ages already ride the card's
  // `card-age-range` line, so this seam never repeats them. This spec's viewer
  // does NOT follow the host, so the line is absent here and nothing below can
  // assert it. MISSING FIXTURE: a viewer that FOLLOWS the host (a `follows` row
  // from the viewer to the host — the 0033 edge) so the host's post renders
  // `card-host-common` reading "You follow this host". That follow write is a
  // real change to this spec's write path, not a line, so it is deliberately not
  // invented here. WORKSPACE BLOCKER: no live credentials and no e2e/.auth
  // marker in this workspace, so the line cannot be exercised end-to-end; the
  // pure seam (feed.hostCommonGroundLine) is unit-tested instead.
  await expect(hostCard.getByText('1 going', { exact: true })).toBeVisible()
  await expect(hostCard.locator('span.bg-slate-200')).toHaveText('E')
  // One pinger: no "+N" overflow chip (the chip only appears past the
  // 3-circle cap — buildGoingLine's overflow math, unit-tested).
  await expect(hostCard.getByText(/^\+\d+$/)).toHaveCount(0)

  // V25 ticket 06: the CIRCLES lead and the count follows — the row reads
  // "◍ 1 going", never the old "1 going ◍". Pinned on the RENDERED geometry
  // (not on a class name, which is what the ordering is made of): the
  // fallback circle's left edge sits left of the "1 going" label. Both halves
  // matter — an x comparison alone would also pass if the two were stacked
  // vertically, so the SAME ROW is pinned by their vertical centres agreeing.
  // This is non-vacuous: the pre-ticket order (label first) fails the x check.
  const goingCircleBox = await hostCard.locator('span.bg-slate-200').boundingBox()
  const goingLabelBox = await hostCard
    .getByText('1 going', { exact: true })
    .boundingBox()
  if (goingCircleBox === null || goingLabelBox === null) {
    throw new Error('the going row did not render a measurable circle AND label')
  }
  expect(goingCircleBox.x).toBeLessThan(goingLabelBox.x)
  const circleMidY = goingCircleBox.y + goingCircleBox.height / 2
  const labelMidY = goingLabelBox.y + goingLabelBox.height / 2
  expect(Math.abs(circleMidY - labelMidY)).toBeLessThan(4)

  // --- V29 v29-2: the SAME going line must render on the host's own PROFILE
  // card. That surface used to assert "No one's going yet" about a post it had
  // never queried — the defect two independent external reviewers hit, and the
  // one this slice fixes. Both directions are pinned, and both are scoped to the
  // card: the count must be there AND the absence sentence must not (a page-wide
  // absence check would be vacuous the moment another post legitimately has no
  // pings). ---
  await page.goto('/profile')
  const profileCard = page.locator('a').filter({ hasText: title }).first()
  await expect(profileCard).toBeVisible()
  await expect(profileCard.getByText('1 going', { exact: true })).toBeVisible()
  await expect(profileCard.getByText('No one’s going yet')).toHaveCount(0)

  await viewerContext.close()
})

test.afterEach(async () => {
  // Best-effort cleanup (per house): delete the HOST marker's playdate
  // rows via REST with the marker's own JWT (host-only DELETE policy).
  // going_pings.playdate_id is ON DELETE CASCADE (0007), so the pinger's
  // row is removed with the post. The viewer account (e2e-v- prefix, no
  // playdate rows) is left for the orchestrator's sweep. A failure is
  // logged, not fatal.
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
    const remaining = check.ok ? ((await check.json()) as Array<Record<string, unknown>>) : null
    if (!del.ok || (remaining !== null && remaining.length > 0)) {
      console.log(
        `[e2e cleanup] FAILED — playdate delete HTTP ${del.status}, ` +
          `${remaining?.length ?? '?'} remain (host ${userId}) — orchestrator sweep (e2e- prefix) will pick them up`,
      )
    } else {
      console.log(
        `[e2e cleanup] ok — deleted host marker playdate row(s) (host ${userId}); the pinger's going_pings row cascaded with the post`,
      )
    }
  } catch (err) {
    console.log(
      `[e2e cleanup] FAILED (logged, best-effort): ${
        err instanceof Error ? err.message : err
      } — orchestrator sweep (e2e- prefix) will pick stragglers up`,
    )
  }
})

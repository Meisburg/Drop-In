/**
 * Spec (V3 slice 10, ticket 05): the detail page's named guest list.
 *
 * Progressive disclosure (the founder-approved spec,
 * .scratch/guest-list/spec.md): the host sees "Going: <names>" (the
 * pingers' display names), a pinger sees "You, <others>" ("You" takes
 * the first slot — their own name dropped from the RPC list, up to 2
 * others), a stranger sees NOTHING (their count line stays unchanged —
 * the zero-pressure surface). The host marker posts a drop-in; pre-ping
 * the detail page shows no guest list at all (count 0 → the block is
 * hidden — "Going:" with nothing after is not a state; green pre- AND
 * post-apply, since 0 pings hides the block either way). Two fresh
 * viewer accounts (the zip-radius pattern — a fresh signed-out context
 * each, the marker's home zip + radius so the post is in their feed)
 * ping the post via the card's "going" check toggle. Each viewer's
 * context stays open until the DB gate confirms its ping row (the
 * card-circles pattern — the context close would abort the in-flight
 * upsert chain, so the close only happens once the row is committed
 * and visible via REST), then the host reloads (the feed's pings fetch
 * is one-shot per load — no live refresh after a toggle, the product
 * behavior) and reopens the post: the detail page's guest-list block
 * (below the ping section, above the comment thread) shows
 * "Going: <name1>, <name2>" — both names, order = ping created_at (the
 * assertion allows either).
 *
 * Pre-0025-apply this spec is RED by design (the 0021/0022/0023/0024
 * pattern): the 0025 get_guest_list RPC (SECDEF, EXECUTE
 * authenticated-only) 404s on the live project, db.fetchGuestList's
 * catch keeps guestNames null, the block stays hidden, and the page
 * never crashes (the DB-not-applied discipline). The failure lands
 * EXACTLY at the "Going:" assertion below, never earlier — every step
 * before it (the post, the two pings, the poll gate, the empty-state
 * pin) is green pre- AND post-apply. It goes green once the
 * orchestrator applies 0025 live via CDP after the trust review (the
 * e2e gate then exits 0 alongside the build + unit suites).
 *
 * Cleanup (best-effort per house): the host marker's playdate rows are
 * deleted via REST with the marker's own JWT (host-only DELETE policy);
 * going_pings.playdate_id is ON DELETE CASCADE (0007), so both
 * pingers' rows go with the post. The two viewer accounts
 * (e2e-v-<epoch>-1/-2, no playdate rows of their own) persist for the
 * orchestrator's sweep (the zip-radius pattern — family 16).
 */
import { expect, test } from '@playwright/test'
import {
  editTitle, localDatePlusDays, readMarkerMeta, readMarkerSession,
  readSupabaseEnv, settleOnRoute, finishSignup,
  signUpViewer, stepStartTimeOnce,
} from './fixtures'

test('the host sees the named guest list on a post with 2 pings', async ({
  page,
  browser,
}) => {
  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const title = `e2e ${marker.displayName} guest lot`
  const viewers = [1, 2].map((n) => ({
    name: `e2e-v-${epoch}-${n}`,
    email: `e2e-v-${epoch}-${n}@gmail.com`, // gmail.com: the project rejects example.com
    password: `e2e-v-pw-${epoch}-${n}`, // in-memory only — never written, never committed
  }))

  // --- The host (the marker's signed-in context) posts a drop-in. ---
  await page.goto('/new')
  await settleOnRoute(page, '/new')
  // V9 ticket 03 (review cycle 1, F2): the summary's title is a read-back —
  // tap it to edit (the input is what the specs drive).
  await editTitle(page)
  await page.getByPlaceholder('e.g. Playground time at Green Lake').fill(title)
  await page
    .getByPlaceholder('e.g. Green Lake playground, near the boathouse')
    .fill('E2E guest lot')
  // V9 ticket 01: /new no longer asks for a neighbourhood — nothing to pick.
  // V13 ticket 02: the date + the 30-minute stepper live in the visible "When" section (the disclosure is gone).
  await page.locator('input[type="date"]').fill(localDatePlusDays(1))
  const start = await stepStartTimeOnce(page)
  // V13 ticket 03: no duration chips on /new — the End stepper shows
  // the current end time (start + auto-duration). Verify it's visible.
  await expect(page.getByTestId('end-time-label')).toBeVisible()
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')

  // --- Pre-ping: open the post's detail. No guest list yet (count 0 →
  // the block is hidden — the AC pin; green pre- AND post-apply, 0
  // pings hides the block either way). Back to the feed afterwards. ---
  const hostCard = page.locator('a').filter({ hasText: title }).first()
  await expect(hostCard).toBeVisible()
  await hostCard.click()
  await page.waitForURL(/\/playdate\//)
  await expect(page.locator('p', { hasText: /^Going: / })).toHaveCount(0)
  await page.goto('/')

  // --- The viewers: two fresh signed-out contexts (the default context
  // carries the host marker's session; the clean storageState overrides
  // the project's merged marker state — the zip-radius pattern). Same
  // home zip as the host (the post sits at the host's zip — distance 0,
  // inside any radius), so the post is in each viewer's radius feed.
  // Each pings via the card's "going" check toggle; the DB gate then
  // confirms the ping row is committed BEFORE the context closes
  // (closing earlier would abort the in-flight upsert chain — the
  // card-circles pattern: the close only happens once the row lands).
  const { url: restUrl, anonKey } = readSupabaseEnv()
  const { accessToken, userId } = readMarkerSession()
  const restHeaders: Record<string, string> = {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
  }
  // The gate's predicate: this run's post's ping count (the post is
  // looked up by title, newest first — a leftover post from a failed
  // cleanup can't answer with a stale ping row; the broad authenticated
  // SELECT, 0007, with the marker's own JWT).
  const pingCountForPost = async (): Promise<number> => {
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
  }

  for (let i = 0; i < viewers.length; i++) {
    const viewer = viewers[i]
    const viewerContext = await browser.newContext({
      baseURL: 'http://localhost:4173',
      storageState: { cookies: [], origins: [] },
    })
    const viewerPage = await viewerContext.newPage()
    // V20 t06: signup is first + last name + address now — one shared helper
    // (`signUpViewer`) so the form's field list lives in one place.
    await signUpViewer(viewerPage, {
      name: viewer.name,
      email: viewer.email,
      password: viewer.password,
    })

    // The viewer's location step (the same REST write a real user gets).
    await finishSignup(viewerPage, {
      homeZip: marker.homeZip,
      radiusMiles: marker.radiusMiles,
    })

    // The viewer pings the host's post via the card's "going" check
    // toggle (the active state = the write round-tripped).
    const viewerCard = viewerPage.locator('a').filter({ hasText: title }).first()
    await expect(viewerCard).toBeVisible()
    await viewerCard.getByRole('button', { name: /^Say we’re going to/ }).click()
    await expect(
      viewerCard.getByRole('button', { name: /^Going — tap to take it back$/ }),
    ).toBeVisible()

    // The DB gate (deterministic — the card's optimistic flip resolves
    // before the viewer's upsert chain commits): wait for THIS viewer's
    // ping row to LAND (the count reaches i+1 — only this viewer can
    // have pinged so far) before the context closes.
    await expect.poll(pingCountForPost, { timeout: 10_000 }).toBe(i + 1)
    await viewerContext.close()
  }

  // --- The host: the reload re-runs the one-shot fetches; reopen the
  // post — the detail page's guest-list block (the 0025 RPC, below the
  // ping section) shows BOTH names (order = ping created_at — either
  // order is accepted). BOTH ping rows are already committed (the DB
  // gates above ran while each viewer's context was still open). THIS
  // is the red point pre-0025-apply: the RPC 404s, the catch keeps
  // guestNames null, the block stays hidden — the failure lands exactly
  // here, never a crash.
  await page.reload()
  await hostCard.click()
  await page.waitForURL(/\/playdate\//)
  const guestLine = page.locator('p', { hasText: /^Going: / })
  await expect(guestLine).toHaveText(
    new RegExp(
      `^Going: (?:${viewers[0].name}, ${viewers[1].name}|${viewers[1].name}, ${viewers[0].name})$`,
    ),
  )
})

test.afterEach(async () => {
  // Best-effort cleanup (per house): delete the HOST marker's playdate
  // rows via REST with the marker's own JWT (host-only DELETE policy).
  // going_pings.playdate_id is ON DELETE CASCADE (0007), so the
  // pingers' rows are removed with the post. The viewer accounts
  // (e2e-v- prefix, no playdate rows) are left for the orchestrator's
  // sweep (family 16). A failure is logged, never fatal.
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
        `[e2e cleanup] ok — deleted host marker playdate row(s) (host ${userId}); the pingers' going_pings rows cascaded with the post`,
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

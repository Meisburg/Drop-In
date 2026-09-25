/**
 * Spec (V3 ticket 09): the "kids you're bringing" picker + the detail
 * page's "Kids coming" line.
 *
 * The marker (the setup spec's signed-in state) gets two kids via REST —
 * the 0011 kids table's real columns (profile_id + first_name + age; the
 * 0022 optional kids.likes rides on the second kid, the ticket's
 * conversation-starter pin): Bernie (6) and Lily (4, likes
 * "dinosaurs"). The /new UI: the "Kids you're bringing (optional)"
 * section (the old "Best for ages" field, REPLACED by ticket 09 — the
 * playdates.age_hint DB column stays, just unused in the UI) shows one
 * chip per kid (name + age). The empty state ("Add your kids in your
 * settings" + the /settings "Add kids" link) renders only when the marker
 * has NO kids, so with kids present the spec pins its ABSENCE. Selecting
 * the chips + posting lands the selection in the 0022 playdate_kids
 * table (replace-on-duplicate, right after the post create — db.
 * linkKidsToPlaydate) and shows on the detail page as the "Kids coming"
 * line below the ping section, AGES-FIRST since V9 ticket 05:
 * "Ages 4–6 · Bernie, Lily" — the range over the kids' ages first (the
 * fact a parent is deciding on), then the names, NAME-ordered
 * (db.listPlaydateKidNames sorts, the pure feed.kidsComingLine joins in
 * input order) — and NO image element on
 * that line: the kid-photo pin, a kid photo renders only in the profile
 * kids list, never on the event line). The line is a SIGNED-IN surface
 * only (the ticket pin): the signed-out public view stays the 12-field
 * get_public_playdate with no kids fetch (this spec drives the marker's
 * signed-in view — the public-view exclusion is the 0022 header + the
 * detail page's authenticated-only fetch, not a third context here).
 *
* Pre-0022-apply this spec is RED by design: the playdate_kids table
 * does not exist live, so linkKidsToPlaydate's delete 404s with
 * PGRST205 (PostgREST's schema-cache form of the undefined-table error —
 * the 42P01 the ticket pin names) and the /new submit path surfaces
 * its error AFTER the post stands (createPlaydate succeeds — playdates
 * has been live since 0005 — the failure lands at the post-create/LINK
 * step, never a crash; the form's designed submit error line, the
 * address-maps pattern). The second kid's insert (kids.likes, a 0022
 * column) 42703s on write pre-apply (the kids.likes / kids.avatar_url +
 * profiles.interests columns are all missing live): that write is
 * best-effort (logged, not fatal) — the spec's assertions target the
 * "Kids coming" line text over the kids that DO stand, and the line
 * renders once 0022 is live. GREEN = 0022 applied (the V3.6 live-check
 * line: npm run test:e2e 16/16 incl. setup + kids-v3 + the SQL-API
 * column probe).
 *
 * Cleanup (best-effort per house, the address-maps pattern): the
 * marker's playdate rows are deleted via REST with the marker's own JWT
 * (host-only DELETE policy) — the playdate_kids rows cascade with the
 * post (0022's playdate_id FK ON DELETE CASCADE; pre-apply the table is
 * absent, the delete just removes the standing post) — and the marker's
 * kid rows are deleted (0011's kids_delete_own; their playdate_kids rows
 * cascade via the 0022 kid_id FK). The marker account (e2e- prefix) is
 * left for the orchestrator's sweep.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  editTitle,
  localDatePlusDays,
  readMarkerMeta,
  readMarkerSession,
  readSupabaseEnv,
  settleOnRoute,
  stepStartTimeOnce,
} from './fixtures'

const PLACE = 'E2E Kids lot'

/** The marker's two kids (the 0011 base columns; 0022's optional likes on the second). */
const KIDS = [
  { first_name: 'Bernie', age: 6 },
  { first_name: 'Lily', age: 4, likes: 'dinosaurs' },
] as const

/** A kid row as it stands live (the 0011 columns; 0022's are optional). */
type MarkerKid = { id: string; first_name: string; age: number }

/**
 * Create the marker's two kid rows via REST (the marker's own JWT — the
 * 0011 kids_insert_own policy: profile_id = auth.uid()), then read back
 * the marker's kid rows AS THEY STAND (name-ordered — the line's
 * order). Pre-0022-apply the second insert (the 0022 kids.likes column)
 * 42703s and is logged, not fatal: 1 row stands (Bernie), 2 after the
 * apply.
 */
async function createMarkerKids(): Promise<MarkerKid[]> {
  const { url, anonKey } = readSupabaseEnv()
  const { accessToken, userId } = readMarkerSession()
  const headers: Record<string, string> = {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
  // Kid 1: the 0011 base columns only (profile_id + first_name + age) —
  // live since 0011, so this insert always succeeds.
  const bernie = await fetch(`${url}/rest/v1/kids`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ profile_id: userId, ...KIDS[0] }),
  })
  if (!bernie.ok) {
    throw new Error(`marker kid (Bernie, the 0011 base columns) insert HTTP ${bernie.status}: ${await bernie.text()}`)
  }
  // Kid 2: carries a 0022 column (kids.likes). Pre-0022-apply this
  // 42703s (the column is missing live) — the documented RED-by-design
  // write; logged, NOT fatal (the spec proceeds over the kids that
  // stand; the post-create/link step below is the fatal RED point).
  const lily = await fetch(`${url}/rest/v1/kids`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ profile_id: userId, ...KIDS[1] }),
  })
  if (!lily.ok) {
    console.log(
      `[e2e kids-v3] marker kid (Lily, the 0022 kids.likes write) insert HTTP ${lily.status} — ` +
        `pre-0022-apply RED by design (the column 42703s live); proceeding with the kids that stand`,
    )
  }
  // Read back the marker's kid rows as they stand (name-ordered — the
  // detail line's order, db.listPlaydateKidNames).
  const check = await fetch(
    `${url}/rest/v1/kids?profile_id=eq.${userId}&select=id,first_name,age&order=first_name`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` } },
  )
  if (!check.ok) {
    throw new Error(`marker kid read-back HTTP ${check.status}: ${await check.text()}`)
  }
  const rows = (await check.json()) as MarkerKid[]
  if (rows.length === 0) {
    throw new Error('no marker kid rows stand (the 0011 kids table must be live)')
  }
  return rows
}

/**
 * Post a drop-in THROUGH the /new UI (the golden-path pattern) with the
 * "Kids you're bringing" picker selected, as the marker (the signed-in
 * default context), then return the feed card's detail href — a real
 * /playdate/:id.
 *
 * Pre-0022-apply the failure lands HERE, at the post-create/link step
 * (below): createPlaydate succeeds (the post stands) but
 * linkKidsToPlaydate's delete 404s with PGRST205 (the playdate_kids
 * table is undefined live — the DB-level 42P01 the ticket pin names,
 * surfaced by PostgREST as the schema-cache miss) — the form settles its
 * designed submit error, never a crash.
 */
async function postMarkerDropInWithKids(
  page: Page,
  title: string,
  kids: MarkerKid[],
): Promise<string> {
  await page.goto('/new')
  // A cold load can lose the route to the onboarding-gate race — settle
  // on /new via the app's own navigation once the SPA state is warm.
  await settleOnRoute(page, '/new')
  // V9 ticket 03 (review cycle 1, F2): the summary's title is a read-back —
  // tap it to edit (the input is what the specs drive).
  await editTitle(page)
  await page.getByPlaceholder('e.g. Playground time at Green Lake').fill(title)
  await page
    .getByPlaceholder('e.g. Green Lake playground, near the boathouse')
    .fill(PLACE)
  // V9 ticket 01: /new no longer asks for a neighbourhood — nothing to pick.
  // V13 ticket 02: the date + the 30-minute stepper live in the visible "When" section (the disclosure is gone).
  await page.locator('input[type="date"]').fill(localDatePlusDays(1))
  const start = await stepStartTimeOnce(page)
  // V13 ticket 03: no duration chips on /new — the End stepper shows
  // the current end time (start + auto-duration). Verify it's visible.
  await expect(page.getByTestId('end-time-label')).toBeVisible()

  // The "Kids you're bringing (optional)" picker (the old "Best for ages"
  // section, REPLACED by ticket 09): the marker has kids (the REST
  // creates above) -> the section shows one chip per kid (name + age)
  // and the empty state ("Add your kids in your settings" + the /settings
  // "Add kids" link) is ABSENT (the pin: it renders only when the
  // marker has no kids).
  await expect(page.getByText('Kids you\'re bringing')).toBeVisible()
  await expect(page.getByText('Add your kids in your settings')).toHaveCount(0)
  for (const kid of kids) {
    await page.getByRole('button', { name: `${kid.first_name} · Age ${kid.age}`, exact: true }).click()
  }

  await page.getByRole('button', { name: 'Post drop-in' }).click()
  try {
    await page.waitForURL('/', { timeout: 30_000 })
  } catch {
    // The create did not navigate: it failed. Pre-0022-apply this is the
    // documented RED-by-design (the playdate_kids link 404s with PGRST205 —
    // the table is undefined live; the post stands) — the form shows its
    // designed submit error; surface it, never a crash.
    const submitError = await page.locator('p.text-red-600').first().textContent()
    throw new Error(
      `Post create/link failed (pre-0022-apply RED by design — the playdate_kids ` +
        `link 404s PGRST205, the post stands): ${submitError ?? 'no submit error line rendered'}`,
    )
  }
  const card = page.locator('a').filter({ hasText: title }).first()
  await expect(card).toBeVisible()
  const href = (await card.getAttribute('href')) ?? ''
  if (!href.startsWith('/playdate/')) {
    throw new Error(`The feed card for "${title}" has no detail href (got "${href}")`)
  }
  return href
}

test('the /new kids picker lands a selection that shows as the "Kids coming" line on the detail page', async ({
  page,
}) => {
  const marker = readMarkerMeta()
  const title = `e2e ${marker.displayName} kids`
  const kids = await createMarkerKids()
  const detailPath = await postMarkerDropInWithKids(page, title, kids)

  // The detail page (the marker's signed-in view): the "Kids coming"
  // line below the ping section — AGES first, then the names, NAME-ordered
  // (db.listPlaydateKidNames sorts; the pure feed.kidsComingLine joins in
  // input order).
  //
  // THE ONE EXISTING ASSERTION V9 TICKET 05 CHANGES, quoted before and after.
  // It used to be (e2e/kids-v3.e2e.ts, V3 ticket 09):
  //
  //   const expectedLine = kids.map((kid) => `${kid.first_name} · ${kid.age}`).join(', ')
  //   const line = page.locator('p').filter({ hasText: 'Kids coming:' })
  //   await expect(line).toHaveText(`Kids coming: ${expectedLine}`)
  //
  // i.e. "Kids coming: Bernie · Age 6, Lily · Age 4" — the per-kid name·age pairs. The
  // ticket re-pins the line itself: "the detail page's 'Kids coming' line is
  // demoted from names-first to AGES-first ('Ages 3–6 · Bernie, Lily' — names
  // last)". So the expectation BELOW is the new rule over the same kids (4 and
  // 6 → "Ages 4–6"), and nothing else about this assertion moved: the locator,
  // the label and the kids that must appear are unchanged.
  await page.goto(detailPath)
  await page.getByRole('heading', { name: title, exact: true }).waitFor()

  const ages = kids.map((kid) => kid.age)
  const expectedLine =
    `Ages ${Math.min(...ages)}–${Math.max(...ages)} · ` +
    kids.map((kid) => kid.first_name).join(', ')
  const line = page.locator('p').filter({ hasText: 'Kids coming:' })
  await expect(line).toHaveText(`Kids coming: ${expectedLine}`)

  // The kid-photo pin: the line's card carries NO image element (a kid
  // photo renders only in the profile kids list, never on the event
  // line — the no-photos pin, the 0022 header). Anchor on the block's own
  // data-testid: the design pass de-carded this section, so the old
  // div.rounded-xl anchor silently matched nothing (the V23 drift class).
  const card = page.getByTestId('kids-coming-line')
  await expect(card).toHaveCount(1)
  await expect(card.locator('img, picture, [role="img"]')).toHaveCount(0)
})

test.afterEach(async () => {
  // Best-effort cleanup (the house pattern): (1) the marker's playdate
  // rows are deleted via REST with the marker's own JWT (host-only
  // DELETE policy) — the playdate_kids rows cascade with the post
  // (0022's playdate_id FK ON DELETE CASCADE; pre-apply the table is
  // absent, the delete just removes the standing post) — and (2) the
  // marker's kid rows are deleted (0011's kids_delete_own; their
  // playdate_kids rows cascade via the 0022 kid_id FK). A failure is
  // logged, not fatal. The marker account (e2e- prefix) is left for the
  // orchestrator's sweep. (Pre-0022-apply the post stands but the link
  // never ran, so there are 0 playdate_kids rows.)
  try {
    const { url, anonKey } = readSupabaseEnv()
    const { accessToken, userId } = readMarkerSession()
    const headers: Record<string, string> = {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'return=representation',
    }
    // (1) The marker's posts (the playdate_kids rows cascade).
    const postQuery = `${url}/rest/v1/playdates?host_profile_id=eq.${userId}&select=id`
    const postDel = await fetch(postQuery, { method: 'DELETE', headers })
    const postCheck = await fetch(postQuery, { headers })
    const postsRemaining = postCheck.ok
      ? ((await postCheck.json()) as Array<Record<string, unknown>>)
      : null
    // (2) The marker's kid rows (their playdate_kids rows cascade).
    const kidQuery = `${url}/rest/v1/kids?profile_id=eq.${userId}&select=id`
    const kidDel = await fetch(kidQuery, { method: 'DELETE', headers })
    const kidCheck = await fetch(kidQuery, { headers })
    const kidsRemaining = kidCheck.ok
      ? ((await kidCheck.json()) as Array<Record<string, unknown>>)
      : null
    const postsBad = !postDel.ok || (postsRemaining !== null && postsRemaining.length > 0)
    const kidsBad = !kidDel.ok || (kidsRemaining !== null && kidsRemaining.length > 0)
    if (postsBad || kidsBad) {
      console.log(
        `[e2e cleanup] FAILED — playdate delete HTTP ${postDel.ok ? 'ok' : postDel.status} ` +
          `(${postsRemaining?.length ?? '?'} remain), kid delete HTTP ${kidDel.ok ? 'ok' : kidDel.status} ` +
          `(${kidsRemaining?.length ?? '?'} remain) (host ${userId}) — orchestrator sweep (e2e- prefix) will pick them up`,
      )
    } else {
      console.log(
        `[e2e cleanup] ok — deleted the marker's playdate + kid row(s) (host ${userId}); ` +
          `playdate_kids rows cascaded with the post (0022)`,
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

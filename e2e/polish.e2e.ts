/**
 * Spec (V8 ticket 10 — the polish batch): the round-trips, end to end.
 *
 * (a) KID EDIT ROUND-TRIP: the marker's kid row is edited IN PLACE (first name
 *     + age) on /settings, autosaves as it is edited (V12 t01 — no save
 *     control on the page any more), and the new name + age render on
 *     /u/<handle>. This is the ticket's "instead of
 *     Remove + re-add": the row keeps its id, so its photo and its "who's
 *     coming" rows survive an edit (the DB-level check below proves the id is
 *     the same row, not a replacement).
 *
 * (b) MODERATOR UNHIDE ROUND-TRIP: a moderator hides a comment and then
 *     UNHIDES it — the button V2 never shipped (Hide rendered only when not
 *     already hidden, so a mis-tap was permanent from the UI). The mod flag is
 *     flipped through the dashboard SQL API (scripts/apply-migration.mjs, the
 *     repo's documented live path — a marker JWT CANNOT set it: 0011's
 *     self-elevation trigger rejects the write, and the dashboard path runs
 *     with auth.uid() IS NULL, which the trigger passes through), verified,
 *     and REVERTED in a finally + afterEach. If that path is unavailable (no
 *     CDP Chrome on :9222, a stale dashboard session) this test SKIPS with the
 *     reason instead of failing — the gate must not depend on the operator's
 *     browser.
 *
 * (c) AUTOSAVE PERSISTENCE: typing on /settings saves itself (V12 t01 — the
 *     unsaved-changes guard is gone), and leaving the page mid-edit loses
 *     nothing: the in-app link goes straight through and the write lands on
 *     its own. (Writes the marker's bio; the afterEach nulls it back.)
 *
 * (d) SHARE FAILURE IS VISIBLE: with the share sheet rejecting and the
 *     clipboard blocked, Share says "Couldn’t copy the link." and hands over a
 *     selectable URL. Forced through addInitScript, data-free beyond one post.
 *
 * Cleanup (best-effort per house, the e2e-<epoch> marker prefix so the
 * orchestrator's sweep picks stragglers up): the marker's playdate rows are
 * deleted via REST with the marker's own JWT (host-only DELETE policy; comments
 * + ping rows cascade), the marker's kid rows are deleted (0011
 * kids_delete_own), the marker's bio is nulled (V12 t01 — test (c) writes it
 * now), and the moderator flag is put back to false.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  readMarkerMeta,
  readMarkerSession,
  readSupabaseEnv,
  runLiveSql,
  settleOnRoute,
} from './fixtures'

/** The kid's edited values — the round-trip's whole point. */
const KID_AGE_BEFORE = 6
const KID_AGE_AFTER = 8

/** The marker's REST context: URL, anon key, the marker's own JWT + id. */
function markerRest(): { url: string; headers: Record<string, string>; userId: string } {
  const { url, anonKey } = readSupabaseEnv()
  const { accessToken, userId } = readMarkerSession()
  return {
    url,
    userId,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  }
}

/**
 * Read a REST response as JSON, failing loudly with the status + body on a
 * non-2xx. (The body is read ONCE — an `expect(res.ok, await res.text())`
 * message reads it before the assertion, which then cannot parse it.)
 */
async function restJson<T>(label: string, res: Response): Promise<T> {
  if (!res.ok) {
    throw new Error(`${label} — HTTP ${res.status}: ${await res.text()}`)
  }
  return (await res.json()) as T
}

/** Create one kid row for the marker through the real 0011 policy (REST). */
async function createMarkerKid(firstName: string, age: number): Promise<string> {
  const { url, headers, userId } = markerRest()
  const res = await fetch(`${url}/rest/v1/kids`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({ profile_id: userId, first_name: firstName, age }),
  })
  const rows = await restJson<Array<{ id: string }>>('marker kid insert', res)
  return rows[0].id
}

/** Read one kid row back (the marker's own JWT — the 0011 SELECT policy). */
async function readKid(kidId: string): Promise<{ id: string; first_name: string; age: number }> {
  const { url, headers } = markerRest()
  const res = await fetch(`${url}/rest/v1/kids?id=eq.${kidId}&select=id,first_name,age`, {
    headers,
  })
  const rows = await restJson<Array<{ id: string; first_name: string; age: number }>>(
    'marker kid read',
    res,
  )
  return rows[0]
}

/** Create one drop-in for the marker via REST (the 0005 host-insert policy). */
async function createMarkerPlaydate(title: string): Promise<string> {
  const { url, headers, userId } = markerRest()
  const neighborhood = await fetch(`${url}/rest/v1/neighborhoods?select=id&limit=1`, { headers })
  const hoods = await restJson<Array<{ id: string }>>('neighborhood read', neighborhood)
  const starts = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const ends = new Date(starts.getTime() + 60 * 60 * 1000)
  const res = await fetch(`${url}/rest/v1/playdates`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({
      host_profile_id: userId,
      neighborhood_id: hoods[0].id,
      title,
      place: 'E2E polish lot',
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
    }),
  })
  const rows = await restJson<Array<{ id: string }>>('marker playdate insert', res)
  return rows[0].id
}

/** One comment row's hidden_at (the marker's own JWT — 0013/0014 SELECT policy). */
async function readCommentHiddenAt(commentId: string): Promise<string | null> {
  const { url, headers } = markerRest()
  const res = await fetch(`${url}/rest/v1/comments?id=eq.${commentId}&select=id,hidden_at`, {
    headers,
  })
  const rows = await restJson<Array<{ hidden_at: string | null }>>('comment read', res)
  return rows[0]?.hidden_at ?? null
}

/** The marker's comment on a post, by body (its id, for the DB-level probes). */
async function findCommentId(playdateId: string, body: string): Promise<string> {
  const { url, headers } = markerRest()
  const res = await fetch(
    `${url}/rest/v1/comments?playdate_id=eq.${playdateId}&select=id,body`,
    { headers },
  )
  const rows = await restJson<Array<{ id: string; body: string }>>('comment list', res)
  const row = rows.find((candidate) => candidate.body === body)
  if (row === undefined) throw new Error(`no comment matching "${body}" on ${playdateId}`)
  return row.id
}

/** Flip the marker's moderator flag through the live SQL path; returns the raw result. */
function setMarkerModerator(userId: string, enabled: boolean) {
  return runLiveSql(`update public.profiles set moderators = ${enabled} where id = '${userId}'`)
}

/** The flag's value straight from the DB (the probe that proves the flip landed). */
function readModeratorFlag(userId: string) {
  return runLiveSql(`select id, moderators from public.profiles where id = '${userId}'`)
}

test('(a) a kid row edited in place (name + age) autosaves and shows on /u/:handle', async ({
  page,
}) => {
  const marker = readMarkerMeta()
  const before = `E2E KidA ${marker.displayName}`
  const after = `E2E KidB ${marker.displayName}`
  const kidId = await createMarkerKid(before, KID_AGE_BEFORE)

  await page.goto('/profile')
  await settleOnRoute(page, '/profile')

  const row = page.getByTestId('kid-row').first()
  await expect(row.getByTestId('kid-name')).toHaveValue(before)
  await expect(row.getByTestId('kid-age')).toHaveValue(String(KID_AGE_BEFORE))

  // Edit IN PLACE: name + age, no Remove + re-add anywhere in the flow.
  await row.getByTestId('kid-name').fill(after)
  await row.getByTestId('kid-age').fill(String(KID_AGE_AFTER))

  // V12 t01: no save control on the page any more (and no "You have unsaved
  // changes" line) — the row autosaves as it is edited. Wait for the always-on
  // indicator to settle on "Saved." before probing the DB.
  await expect(page.getByTestId('profile-save-note')).toHaveText('Saved.')

  // The write landed on the SAME row (the in-place pin: no delete + insert, so
  // the row's identity and its "who's coming" rows survive the edit). This used
  // to say "the kid's photo ... survive[s] the edit" too; V9 ticket 11 removed
  // kid photos entirely, so the row-identity pin is what remains — and it is
  // what this assertion always actually proved.
  const stored = await readKid(kidId)
  expect(stored).toEqual({ id: kidId, first_name: after, age: KID_AGE_AFTER })

  // Remove asks first and names the consequence ("off every drop-in you listed
  // them as coming to" — 0022 + 0026 are ON DELETE CASCADE). Cancel really
  // cancels: nothing is deleted.
  await row.getByTestId('kid-remove').click()
  const removeDialog = page.getByTestId('remove-kid-dialog')
  await expect(removeDialog).toBeVisible()
  await expect(removeDialog).toContainText(`Remove ${after}?`)
  await expect(removeDialog).toContainText('off every drop-in')
  await removeDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(removeDialog).toHaveCount(0)
  await expect(row.getByTestId('kid-name')).toHaveValue(after)
  expect((await readKid(kidId)).id).toBe(kidId)

  // And the public face renders it.
  await page.goto(`/u/${encodeURIComponent(marker.displayName)}`)
  await expect(page.getByText(`${after} · ${KID_AGE_AFTER}`, { exact: true })).toBeVisible()
  await expect(page.getByText(`${before} · ${KID_AGE_BEFORE}`, { exact: true })).toHaveCount(0)
})

test('(b) a moderator unhides a hidden comment (the mod flag flipped by the live SQL path, then reverted)', async ({
  page,
}) => {
  const marker = readMarkerMeta()
  const session = readMarkerSession()
  const epoch = Math.floor(Date.now() / 1000)
  const commentBody = `e2e unhide ${epoch} — hidden then unhidden`

  // THE MOD FLAG: not settable by a marker JWT (0011's trigger), so it rides
  // the dashboard SQL path. Unavailable path → SKIP with the reason, never a
  // false failure for the operator's browser.
  const flip = setMarkerModerator(session.userId, true)
  if (!flip.ok) {
    test.skip(true, `live SQL path unavailable (${flip.output.split('\n').slice(-1)[0]})`)
    return
  }
  try {
    // The flip is verified, not assumed.
    const probe = readModeratorFlag(session.userId)
    expect(probe.ok).toBe(true)
    expect(probe.output).toContain('true')

    const playdateId = await createMarkerPlaydate(`e2e polish mod ${epoch}`)
    await page.goto(`/playdate/${playdateId}`)
    await page.getByRole('heading', { name: `e2e polish mod ${epoch}`, exact: true }).waitFor()

    // The marker's own comment, through the composer.
    await page.locator('#comment-composer').fill(commentBody)
    await page.getByRole('button', { name: 'Comment' }).click()
    const commentRow = page.locator('li', { hasText: commentBody }).first()
    await expect(commentRow).toBeVisible()

    // A FRESH load so the profile's moderator flag (flipped above) is in the
    // session state the page reads for planCommentAction.
    await page.goto(`/playdate/${playdateId}`)
    await page.getByRole('heading', { name: `e2e polish mod ${epoch}`, exact: true }).waitFor()
    const commentId = await findCommentId(playdateId, commentBody)
    expect(await readCommentHiddenAt(commentId)).toBeNull()

    // HIDE (the shipped moderator op — one tap, it is reversible).
    const rowAfterReload = page.locator('li', { hasText: commentBody }).first()
    await rowAfterReload.getByRole('button', { name: 'Hide', exact: true }).click()
    await expect(rowAfterReload.getByText('Hidden by moderator')).toBeVisible()
    // The DB-level proof that the hide actually wrote (not just a chip).
    await expect
      .poll(async () => await readCommentHiddenAt(commentId), {
        message: 'hidden_at must be set after the moderator hide',
      })
      .not.toBeNull()

    // UNHIDE — the button V2 did not have.
    const unhide = rowAfterReload.getByTestId('unhide-comment')
    await expect(unhide).toBeVisible()
    await unhide.click()
    await expect(rowAfterReload.getByText('Hidden by moderator')).toHaveCount(0)
    // ...and the row is VISIBLE again, not merely re-chipped: the moderator
    // branch of the SELECT policy would still return a hidden row, so the chip
    // going away is the client's own state. The DB probe is the real proof.
    await expect
      .poll(async () => await readCommentHiddenAt(commentId), {
        message: 'hidden_at must be NULL again after Unhide (0009/0013 any-column moderator UPDATE)',
      })
      .toBeNull()

    // A reload re-reads the row under the SELECT policy: still visible.
    await page.goto(`/playdate/${playdateId}`)
    await page.getByRole('heading', { name: `e2e polish mod ${epoch}`, exact: true }).waitFor()
    await expect(page.locator('li', { hasText: commentBody }).first()).toBeVisible()
    await expect(page.getByText('Hidden by moderator')).toHaveCount(0)
  } finally {
    // The flag goes back whatever happened (afterEach repeats it defensively).
    setMarkerModerator(session.userId, false)
  }
})

test('(c) typing on /profile saves itself — leaving the page loses nothing', async ({ page }) => {
  await page.goto('/profile')
  await settleOnRoute(page, '/profile')

  // V12 t01: the unsaved-changes guard is gone. The typed text autosaves on
  // its own (the debounce settles, the always-on indicator says so), and the
  // in-app link goes straight through with no "leave without saving?" dialog.
  // (Writes the marker's bio; the afterEach nulls it back.)
  // V13 ticket 01: the bio editor moved from /settings to /profile.
  const bio = page.getByPlaceholder('Who’s in your family, and what are you into? (optional)')
  const typed = `e2e autosaved ${Math.floor(Date.now() / 1000)}`
  await bio.fill(typed)
  await expect(page.getByTestId('profile-save-note')).toHaveText('Saved.')

  // The in-app link goes through: no dialog at all, straight to / (Nearby).
  const nearby = page.getByRole('link', { name: 'Nearby', exact: true })
  await nearby.click()
  await expect(page.getByTestId('unsaved-changes-dialog')).toHaveCount(0)
  await page.waitForURL('/')
  await expect(page.getByRole('heading', { name: 'Near you' })).toBeVisible()

  // And the write persisted: a re-open of /profile re-seeds from the saved
  // profile, so the typed text is still there (nothing was lost by the
  // mid-edit navigation).
  await page.goto('/profile')
  await settleOnRoute(page, '/profile')
  await expect(
    page.getByPlaceholder('Who’s in your family, and what are you into? (optional)'),
  ).toHaveValue(typed)
})

test('(d) a dismissed share sheet plus a failed copy says so, with the URL to select', async ({
  page,
}) => {
  const epoch = Math.floor(Date.now() / 1000)
  const title = `e2e polish share ${epoch}`
  const playdateId = await createMarkerPlaydate(title)

  // Force the two-step failure: the share sheet rejects (a dismissal) and the
  // clipboard fallback is dead in both of its legs.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async () => {
        throw new Error('share sheet dismissed')
      },
    })
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('clipboard denied')
        },
      },
    })
    document.execCommand = () => false
  })

  await page.goto(`/playdate/${playdateId}`)
  await page.getByRole('heading', { name: title, exact: true }).waitFor()

  await page.getByRole('button', { name: 'Share', exact: true }).click()

  const failure = page.getByTestId('share-copy-error')
  await expect(failure).toBeVisible()
  await expect(failure).toContainText('Couldn’t copy the link')
  const urlField = page.getByTestId('share-url-fallback')
  await expect(urlField).toHaveValue(new RegExp(`/playdate/${playdateId}$`))
  // Selectable: focusing it selects the whole URL, so the failed automatic
  // copy costs two taps rather than a dead end.
  await urlField.click()
  const selected = await urlField.evaluate((element) => {
    const input = element as HTMLInputElement
    return input.value.slice(input.selectionStart ?? 0, input.selectionEnd ?? 0)
  })
  expect(selected).toBe(await urlField.inputValue())
})

test('(e) the 5-kid cap says why the add fields went dead', async ({ page }) => {
  const marker = readMarkerMeta()
  // Five kid rows through the real policy — the cap is app-enforced (not a DB
  // constraint), which is exactly why the app owes the parent a sentence.
  for (let index = 0; index < 5; index += 1) {
    await createMarkerKid(`E2E Cap${index}`, 5 + index)
  }

  await page.goto('/profile')
  await settleOnRoute(page, '/profile')

  const cap = page.getByTestId('kids-cap')
  await expect(cap).toBeVisible()
  await expect(cap).toContainText('5 kids')
  await expect(cap).toContainText('Remove one')
  // ...and the fields it explains really are the ones that go dead.
  await expect(page.getByPlaceholder('First name')).toBeDisabled()
  await expect(page.getByPlaceholder('Age')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Add kid', exact: true })).toBeDisabled()
  expect(marker.homeZip).toBe('98107') // (the marker's own state, unchanged here)
})

test.afterEach(async () => {
  // Best-effort cleanup (per house): the marker's playdate rows (comments and
  // ping rows cascade), the marker's kid rows, and the moderator flag back to
  // false. Logged, never fatal.
  try {
    const { url, headers, userId } = markerRest()
    const postQuery = `${url}/rest/v1/playdates?host_profile_id=eq.${userId}&select=id`
    await fetch(postQuery, { method: 'DELETE', headers: { ...headers, Prefer: 'return=representation' } })
    const kidQuery = `${url}/rest/v1/kids?profile_id=eq.${userId}&select=id`
    await fetch(kidQuery, { method: 'DELETE', headers: { ...headers, Prefer: 'return=representation' } })
    // V12 t01: test (c) writes the marker's bio now — null it back so the
    // e2e- prefix sweep (and the next run's seed) starts clean.
    await fetch(`${url}/rest/v1/profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ bio: null }),
    })
    const postCheck = await fetch(postQuery, { headers })
    const kidCheck = await fetch(kidQuery, { headers })
    const posts = postCheck.ok ? ((await postCheck.json()) as unknown[]) : null
    const kids = kidCheck.ok ? ((await kidCheck.json()) as unknown[]) : null
    console.log(
      `[e2e cleanup] polish — ${posts?.length ?? '?'} marker post(s), ${kids?.length ?? '?'} marker kid row(s) remain`,
    )
    setMarkerModerator(userId, false)
  } catch (err) {
    console.log(
      `[e2e cleanup] polish FAILED (logged, best-effort): ${
        err instanceof Error ? err.message : err
      } — orchestrator sweep (e2e- prefix) will pick stragglers up`,
    )
  }
})

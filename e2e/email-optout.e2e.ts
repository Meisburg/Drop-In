/**
 * The /settings EMAIL opt-out (migration 0053) — the RENDERED control, end to
 * end against the live column.
 *
 * WHAT THIS PROVES, AND WHY E2E IS THE ONLY LANE FOR IT. The pure half of this
 * feature — `decideEmailOptoutControl` (src/lib/emailOptout.ts) — has unit
 * tests, and that is exactly why the gap was easy to miss: this repo has ZERO
 * vitest component tests (nothing matches `src/components/*.test.tsx`), so
 * NOTHING between "the decision function returns `checked: true`" and "a parent
 * sees a checked box on /settings" is proven anywhere. A regression that
 * dropped the `checked` binding, unlabelled the checkbox, wrote the preference
 * only to React state and never to the database, or inverted the polarity in
 * the one place the component translates it (`handleEmailOptoutChange`) would
 * ship green through the unit suite. So this spec drives the real control in a
 * real browser against the REAL `public.profiles.email_optout` column (0053 is
 * applied live), mirroring the sibling push kind-toggles, which already have
 * this coverage (e2e/push-subscribe.e2e.ts, "every notification kind has a
 * labelled toggle, and toggling is reflected").
 *
 * THE POLARITY, RESTATED IN THE ARTEFACT THAT CAN BE READ WITHOUT OPENING THE
 * MIGRATION (0053's header, src/lib/emailOptout.ts and src/lib/db.ts all say it
 * too): `email_optout` is an OPT-OUT — `false` means email is ALLOWED (the NOT
 * NULL default) and `true` means the parent asked us to stop. The checkbox is
 * the POSITIVE statement ("Email me about my drop-ins"), so the default renders
 * CHECKED and unchecking writes `true`. Getting this backwards silently
 * unsubscribes families, which is why this spec asserts the WIRE BODY of each
 * write (`email_optout: true` on uncheck, `false` on re-check) and then reads
 * the column back — a client that consistently inverted BOTH the read and the
 * write would pass a UI-only round trip while unsubscribing everybody.
 *
 * WHY THE RELOAD IS MANDATORY. A checkbox that flips in place proves only that
 * React state changed. The failure this spec exists to catch is the write that
 * never reached Postgres (or reached it with the wrong value). Every write is
 * therefore followed by a full `page.reload()` and a fresh read of the column;
 * the asserted state is the PERSISTED state, in both directions.
 *
 * CLEANUP, AND WHY IT IS NOT OPTIONAL HERE. The marker account is a real
 * account, and `email_optout: true` on it means "stop emailing this family".
 * The last step re-checks the toggle, reloads, and asserts CHECKED again — a
 * run that cannot prove the restore FAILS rather than exiting quietly opted
 * out. On top of that the spec is IDEMPOTENT: it NORMALISES the toggle to
 * checked before asserting the default, so a previous failed run (which may
 * have stopped mid-way with the column `true`) does not make every later run
 * red for the wrong reason. A best-effort REST restore with the marker's own
 * JWT in `afterAll` is the net for a failure between those two points — it
 * logs its outcome and never masks the test result.
 */
import { expect, test, type Locator, type Page } from '@playwright/test'
import { readMarkerSession, readSupabaseEnv, settleOnRoute } from './fixtures'

const SETTINGS_ROUTE = '/settings'

/**
 * The email toggle, once the FIRST read has settled.
 *
 * `decideEmailOptoutControl` renders the control DISABLED while that read is in
 * flight, so this waits for the CLICKABLE state rather than for mere visibility
 * — otherwise a spec could read a pre-read default and call it the stored
 * value. Used after a cold load and after every reload.
 */
async function settleToggle(page: Page): Promise<Locator> {
  const toggle = page.getByTestId('email-optout-toggle')
  await expect(toggle).toBeVisible()
  await expect(toggle).toBeEnabled()
  return toggle
}

/** Cold-load /settings and wait until the email control is interactive. */
async function openSettings(page: Page): Promise<void> {
  await page.goto(SETTINGS_ROUTE)
  await settleOnRoute(page, SETTINGS_ROUTE)
  await expect(page.getByTestId('email-optout')).toBeVisible()
  await settleToggle(page)
}

/**
 * Prove the READ actually came back.
 *
 * This is not decoration: a FAILED read renders the same default-on, checked
 * state (decideEmailOptoutControl rule c — it must never show "email is off" on
 * an unreadable column) and says so in the note plus the error line. Without
 * this assertion, a missing column would make "the default is on" pass for
 * exactly the wrong reason — a green test over a broken read.
 */
async function expectReadSucceeded(page: Page): Promise<void> {
  await expect(page.getByTestId('email-optout-note')).toHaveCount(0)
  await expect(page.getByTestId('email-optout-error')).toHaveCount(0)
}

/**
 * Flip the toggle and WAIT FOR THE WRITE, not just the pixel.
 *
 * The PATCH to `profiles` is the thing under test, so the response is awaited,
 * its status asserted, and its BODY returned — the caller pins the column value
 * that went over the wire (`email_optout` is the negation of the checkbox, see
 * the file header). If the write never happens this rejects on the
 * `waitForResponse` timeout, which is the honest failure for a client-only
 * state change.
 *
 * ONE CLICK, THEN WAIT — deliberately not `locator.check()` / `.uncheck()`. This
 * input is CONTROLLED: React re-renders it back to the stored value until the
 * write resolves, so immediately after a correct click the DOM still reads the
 * OLD state. Playwright's `check()` verifies the state once, right after its
 * click, and throws "Clicking the checkbox did not change its state" on that
 * transient — for a control that is working exactly as designed. So the click
 * is issued once and the settle is asserted below (`toBeChecked` /
 * `not.toBeChecked` retry until the write lands), next to the PATCH response
 * and the error line. Nothing is relaxed: the same states are asserted, just
 * against the settled write rather than against a mid-flight frame.
 */
async function writeToggle(
  page: Page,
  checked: boolean,
): Promise<{ status: number; optoutOnWire: unknown }> {
  const toggle = page.getByTestId('email-optout-toggle')
  await expect(toggle).toBeEnabled()
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/rest/v1/profiles') && r.request().method() === 'PATCH',
    ),
    toggle.click(),
  ])
  expect(response.status(), `the profiles PATCH must succeed (HTTP ${response.status()})`).toBeLessThan(
    300,
  )
  const body = JSON.parse(response.request().postData() ?? '{}') as { email_optout?: unknown }
  // The in-flight write is over: the control re-enables, states no failure, and
  // renders the value it just sent.
  await expect(toggle).toBeEnabled()
  await expect(page.getByTestId('email-optout-error')).toHaveCount(0)
  if (checked) await expect(toggle).toBeChecked()
  else await expect(toggle).not.toBeChecked()
  return { status: response.status(), optoutOnWire: body.email_optout }
}

/**
 * Read the LIVE column with the marker's own JWT — the same REST path the
 * suite's cleanups use (fixtures.readSupabaseEnv + readMarkerSession).
 *
 * `expect.poll`: this project has measured an immediate read-after-write
 * missing a just-written row (see the note above `savePushSubscription` in
 * src/lib/db.ts and push-subscribe's poll), so the spec retries. The APP does
 * not depend on that read — it renders what it sent — so this is the spec's own
 * patience, not permission to be sloppy: the final polled value is asserted.
 */
async function expectLiveColumn(expected: boolean): Promise<void> {
  const { url, anonKey } = readSupabaseEnv()
  const { accessToken, userId } = readMarkerSession()
  await expect
    .poll(
      async () => {
        const res = await fetch(`${url}/rest/v1/profiles?id=eq.${userId}&select=email_optout`, {
          headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
        })
        if (!res.ok) {
          throw new Error(
            `reading profiles.email_optout answered HTTP ${res.status} for the marker's own id`,
          )
        }
        const rows = (await res.json()) as Array<{ email_optout?: unknown }>
        return rows[0]?.email_optout
      },
      { message: `profiles.email_optout must be ${expected} in the live database`, timeout: 15_000 },
    )
    .toBe(expected)
}

test('the email opt-out is visible, labelled, and defaults to on', async ({ page }) => {
  await openSettings(page)

  const block = page.getByTestId('email-optout')
  await expect(block).toBeVisible()
  await expect(block.getByRole('heading', { name: 'Email' })).toBeVisible()

  const toggle = await settleToggle(page)
  // Non-empty VISIBLE label text — an unlabelled checkbox is unusable, and the
  // sibling push-kind test asserts it the same way (the `label[for=…]` there,
  // the wrapping `<label>` this control uses here).
  const label = page.locator('label:has([data-testid="email-optout-toggle"])')
  await expect(label).not.toBeEmpty()
  await expect(toggle).toHaveAccessibleName(/Email me about my drop-ins/)

  // NORMALISE FIRST (idempotency): the marker account persists between runs, so
  // force the default before asserting it. Without this, a previous failed run
  // leaves the column `true` and every later run starts red for the wrong
  // reason. The write is verified like every other one (see writeToggle).
  if (!(await toggle.isChecked())) {
    await writeToggle(page, true)
  }

  await expectReadSucceeded(page)
  // DEFAULT IS ON: `email_optout = false` means email is ALLOWED, so a freshly
  // defaulted profile renders CHECKED. Do not invert this — the inverted
  // assertion would enshrine the silent-unsubscribe bug the column header warns
  // about.
  await expect(toggle).toBeChecked()
  await expectLiveColumn(false)
})

test('unchecking reaches the live column, survives a reload, and re-checking restores the default', async ({
  page,
}) => {
  await openSettings(page)
  const toggle = await settleToggle(page)

  // NORMALISE FIRST — see test 1. This spec owns the round trip, so it may not
  // assume the state a previous run (or the other test) left behind.
  if (!(await toggle.isChecked())) {
    await writeToggle(page, true)
  }
  await expectReadSucceeded(page)
  await expect(toggle).toBeChecked()
  await expectLiveColumn(false)

  // ---- OFF -----------------------------------------------------------------
  const off = await writeToggle(page, false)
  expect(off.optoutOnWire, 'unchecking must write email_optout = true (the opt-out)').toBe(true)
  await expect(toggle).not.toBeChecked()
  // The column really moved — the app's own state is not the evidence.
  await expectLiveColumn(true)

  // ---- RELOAD: the only proof the value reached the database ---------------
  await page.reload()
  await settleOnRoute(page, SETTINGS_ROUTE)
  await expect(page.getByTestId('email-optout')).toBeVisible()
  const afterReload = await settleToggle(page)
  await expectReadSucceeded(page)
  await expect(
    afterReload,
    'a client-only state change would come back CHECKED after the reload',
  ).not.toBeChecked()

  // ---- RESTORE (not optional — the marker is a real account) ---------------
  const on = await writeToggle(page, true)
  expect(on.optoutOnWire, 're-checking must write email_optout = false (email allowed)').toBe(false)
  await expect(toggle).toBeChecked()
  await expectLiveColumn(false)

  await page.reload()
  await settleOnRoute(page, SETTINGS_ROUTE)
  await expect(page.getByTestId('email-optout')).toBeVisible()
  const restored = await settleToggle(page)
  await expectReadSucceeded(page)
  await expect(
    restored,
    'the marker account must be left in the default (email allowed) state',
  ).toBeChecked()
})

/**
 * The net, for a failure that lands between "unchecked" and "re-checked": put
 * the marker account back in the default state with its own JWT. Best-effort by
 * house rule — it logs and never changes a test result (a hard crash is the
 * `e2e-` sweep's problem, not this block's).
 */
test.afterAll(async () => {
  try {
    const { url, anonKey } = readSupabaseEnv()
    const { accessToken, userId } = readMarkerSession()
    const res = await fetch(`${url}/rest/v1/profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ email_optout: false }),
    })
    console.log(
      res.ok
        ? '[e2e cleanup] ok — marker profile reset to email_optout=false (email allowed)'
        : `[e2e cleanup] FAILED (best-effort): PATCH HTTP ${res.status} ${await res.text()}`,
    )
  } catch (err) {
    console.log(
      `[e2e cleanup] FAILED (logged, best-effort): ${err instanceof Error ? err.message : err}`,
    )
  }
})

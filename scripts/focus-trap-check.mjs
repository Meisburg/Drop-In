/**
 * Focus-trap DOM check (V22 slice 5; SIGNED-IN run added 2026-10-06) — proves
 * the trap TRAPS, on a surface this lane can actually reach.
 *
 * WHY THIS LANE WAS REBUILT (launch audit `docs/audits/launch-audit-2026-10-05.md`,
 * finding F3, third bullet). As committed, this script SKIPped in BOTH of the
 * states it was run in: without a drop-in id it printed
 *   `SKIP — no drop-in id supplied.`
 * and with one — but no credentials — it printed
 *   `SKIP — no Report control found on this page (signed out?).`
 * ...and exited 0. A SKIP reads like a pass in a summary, so the report dialog's
 * Tab trap was NOT measured by this lane as it ran, and the one lane written for
 * it reported green. That is the failure class this repo keeps paying for, and
 * the trap is a real defect class here (the editor's ModalShell trapped Tab while
 * the crop dialog was open; see `shouldYieldToNestedDialog` in
 * `src/lib/focusTrap.ts`).
 *
 * WHAT IT NOW MEASURES. The lane loads the marker's own signed-in session from
 * `e2e/.auth/marker-state.json` (the storageState `e2e/auth.setup.ts` writes, the
 * same mechanism `scripts/profile-order-check.mjs` and
 * `scripts/signed-in-audit.mjs` use — NOT a second session mechanism), picks a
 * drop-in detail page it can reach, opens the ReportDialog and drives it with
 * real Tab presses:
 *   1. the dialog opened and focus starts INSIDE it;
 *   2. the dialog has >= 2 focusable controls (so "Tab never escapes" cannot be
 *      vacuously true of a one-control dialog);
 *   3. 12 forward Tabs never leave the dialog;
 *   4. 6 Shift+Tabs never leave the dialog;
 *   5. Tab from the LAST control WRAPS to the first, and Shift+Tab from the FIRST
 *      wraps to the last — the edge behaviour the trap exists for, asserted at
 *      both edges rather than only "it stayed inside";
 *   6. Escape closes the dialog.
 *
 * ⚠️ THE ORIGIN TRAP, AND WHY THIS LANE MUST FAIL LOUDLY. A Playwright
 * `storageState` restores `localStorage` **PER ORIGIN**. The stored marker state
 * was written at `http://localhost:4191`; pointed at any other port the restore
 * does not happen, the app renders SIGNED OUT, the Report control never mounts,
 * and a lane that SKIPs (or times out) there reports a pass on a page it never
 * saw. So every "cannot see" path in this lane now exits non-zero and names the
 * cause and the remedy — missing state file, an origin that does not match
 * `E2E_BASE_URL`, a session that did not sign in, or a detail page with no
 * Report control. Exit 2 means NOT MEASURED; exit 1 means the trap was measured
 * and is wrong.
 *
 * THE ORDER OF THE TWO PROOFS IS DELIBERATE. The file's origin is checked first
 * (that is the trap above), and the session is then proven by the RUN, not by the
 * file: `supabase-js` rotates an expired access token from the stored refresh
 * token, so an `exp` in the past proves nothing about whether the run works. The
 * browser proves the restore (a live auth-token after load, not `/login`), and
 * the first authenticated REST read proves the token — a PostgREST 401 there is
 * reported as an expired marker, not as "no playdate is visible". The REST calls
 * that discover or create the fixture therefore use the token the BROWSER holds
 * after load, the same reason `scripts/profile-order-check.mjs` reads its
 * credentials out of the page.
 *
 * WHERE THE SURFACE COMES FROM. The marker account has no posts of its own, so
 * the lane does not assume one: it takes an explicit id if one is given, else
 * asks PostgREST for a playdate the marker can read, else CREATES a minimal
 * fixture post and deletes it on the way out — the seed/restore discipline
 * `scripts/profile-order-check.mjs` uses, so the lane can measure on an empty
 * database instead of skipping. The write path is the fallback, not the norm.
 *
 * WHAT IT STILL CANNOT MEASURE, stated plainly:
 *   - the OTHER `useFocusTrap` call sites: `ModalShell.tsx` (and its two
 *     consumers), `DeletePlaydateDialog.tsx`, `LocationModal.tsx` and
 *     `NewPlaydatePage.tsx`. `CropPhotoDialog` does not use the trap at all, and
 *     the nested-dialog yield rule (`shouldYieldToNestedDialog`) is exercised by
 *     none of them here;
 *   - the signed-out surfaces: the Report control only exists in the
 *     authenticated drop-in view, which is why this lane needs a session;
 *   - focus RESTORE, which is measured but NOT gated. The dialog's opener does
 *     not get focus back: `ReportDialog` focuses its first control in an effect
 *     declared before `useFocusTrap`, so the trap captures an in-dialog control
 *     and skips the restore on unmount, leaving `document.activeElement` on
 *     `<body>`. That is a DOCUMENTED, tracked separate defect
 *     (`src/components/FocusTrap.tsx:10-30`, "Tracked as its own follow-up
 *     ticket"), so the lane prints it on every run and does not fail on it — a
 *     permanently-red lane is a lane nobody reads. When that ticket lands,
 *     promote the printed line to a `check()`.
 *
 * Usage: node scripts/focus-trap-check.mjs [baseURL] [playdateId] [--state=<path>]
 *   `E2E_BASE_URL` wins over a positional baseURL (same precedence as the e2e
 *   specs). Both the positional base and the id are optional: with no id the
 *   lane discovers or creates one (see above).
 *   Needs a running server: `npm run build && npx vite preview --port 4191
 *   --strictPort`, and a marker session minted ON THAT PORT.
 *   `--state=<path>` (or `FOCUS_TRAP_STATE`) points at a different session file;
 *   `--state=/tmp/absent.json` is the documented way to prove the loud failure
 *   without touching the real marker.
 *
 * Remedy when the session is missing or was minted for another origin:
 *   E2E_BASE_URL=<base> npx playwright test e2e/auth.setup.ts e2e/zip-radius.e2e.ts
 *
 * Exits 0 only when the trap was reached AND the trap checks passed.
 */
import { chromium } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'

// Flags are anything starting with `--`; the positionals keep the old
// `[baseURL] [playdateId]` shapes, so an existing invocation still means what it
// did. `--state=...` selects a different session file.
const ARGS = process.argv.slice(2)
const STATE_ARG = ARGS.find((a) => a.startsWith('--state='))
const POSITIONAL = ARGS.filter((a) => !a.startsWith('--'))
const BASE = process.env.E2E_BASE_URL ?? POSITIONAL[0] ?? 'http://localhost:4173'
const DETAIL_ID = POSITIONAL[1]
const STATE =
  process.env.FOCUS_TRAP_STATE ??
  (STATE_ARG ? STATE_ARG.slice('--state='.length) : null) ??
  new URL('../e2e/.auth/marker-state.json', import.meta.url).pathname
const REMEDY = `mint the marker on this port: E2E_BASE_URL=${BASE} npx playwright test e2e/auth.setup.ts e2e/zip-radius.e2e.ts`
const failures = []

/**
 * NOT MEASURED, and deliberately not a SKIP. Thrown by every state in which this
 * lane has no surface to measure — the exact states the old version exited 0
 * from. Thrown rather than exited so the fixture teardown in `main()` still runs
 * on the way out; the top level prints it and exits 2.
 */
class NotMeasured extends Error {}

function notMeasured(reason, detailLines = []) {
  throw new NotMeasured(`${reason}\n${detailLines.map((l) => `  ${l}`).join('\n')}`)
}

function check(label, ok, detail) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(label)
}

/** The repo .env (gitignored), read the same way the sibling lanes read it. */
function readSupabaseEnv() {
  const env = {}
  for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
    if (!line.includes('=') || line.trimStart().startsWith('#')) continue
    const i = line.indexOf('=')
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return { url: env.VITE_SUPABASE_URL, anonKey: env.VITE_SUPABASE_ANON_KEY }
}

/**
 * The session the BROWSER currently holds, read out of the page: the access token
 * it will actually send, and the user id in it. Read from `localStorage` rather
 * than from the state file because supabase-js rotates an expired token on load
 * (see the header). Accepts both persisted blob shapes, like the sibling lane.
 */
function markerCredentials(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.includes('auth-token'))
    if (key === undefined) return null
    const raw = JSON.parse(localStorage.getItem(key))
    return {
      jwt: raw.access_token ?? raw.session?.access_token ?? null,
      userId: raw.user?.id ?? raw.session?.user?.id ?? null,
    }
  })
}

/** A playdate the marker can read, via its own JWT (RLS decides visibility). */
async function findVisiblePlaydate(env, jwt) {
  const res = await fetch(
    `${env.url}/rest/v1/playdates?select=id,title&order=starts_at.desc&limit=1`,
    { headers: { apikey: env.anonKey, Authorization: `Bearer ${jwt}` } },
  )
  if (!res.ok) return { id: null, error: `HTTP ${res.status} — ${(await res.text()).slice(0, 120)}` }
  const rows = await res.json()
  return { id: rows[0]?.id ?? null, error: null }
}

/**
 * The fallback surface: a minimal future post hosted by the marker, inserted
 * with the marker's own JWT and deleted in the teardown. The Report control
 * renders on the host's own post too (measured 2026-10-06), so this is a valid
 * surface for the dialog. A failure here is reported as NOT MEASURED, never as a
 * trap defect.
 */
async function createFixturePlaydate(env, jwt, userId) {
  const res = await fetch(`${env.url}/rest/v1/playdates`, {
    method: 'POST',
    headers: {
      apikey: env.anonKey,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      title: 'focus-trap-check fixture (deleted on exit)',
      place: 'Fixture Park',
      starts_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      ends_at: new Date(Date.now() + 120 * 60 * 1000).toISOString(),
      host_profile_id: userId,
    }),
  })
  if (!res.ok) return { id: null, error: `HTTP ${res.status} — ${(await res.text()).slice(0, 120)}` }
  const rows = await res.json()
  return { id: rows[0]?.id ?? null, error: null }
}

/** DELETE the fixture this run created. Returns false when the delete failed. */
async function deleteFixturePlaydate(env, jwt, id) {
  try {
    const res = await fetch(`${env.url}/rest/v1/playdates?id=eq.${id}`, {
      method: 'DELETE',
      headers: { apikey: env.anonKey, Authorization: `Bearer ${jwt}` },
    })
    return res.ok
  } catch {
    return false
  }
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

async function main() {
  // FIRST LINE, before anything is launched or measured: say which app this run
  // is about to measure. A silent target is how a lane measures a sibling
  // checkout's build and reports it as a defect in this tree.
  console.log(`focus-trap-check against ${BASE}`)

  // --- 1. The session FILE, and the origin it belongs to. -------------------
  if (!existsSync(STATE)) {
    notMeasured(`no marker session at ${STATE}.`, [
      '⚠️  A Playwright storageState restores localStorage PER ORIGIN: the file must',
      '    have been minted at the origin this run measures, or the app renders SIGNED OUT.',
    ])
  }
  let saved
  try {
    saved = JSON.parse(readFileSync(STATE, 'utf8'))
  } catch (error) {
    notMeasured(`${STATE} is not readable JSON (${String(error).slice(0, 80)}).`)
  }
  const origins = (saved.origins ?? []).map((o) => o.origin)
  const baseOrigin = new URL(BASE).origin
  if (!origins.includes(baseOrigin)) {
    notMeasured(
      `the stored session is scoped to ${JSON.stringify(origins)} but this run is against ${baseOrigin}.`,
      [
        '⚠️  Playwright restores localStorage PER ORIGIN, so nothing is restored here:',
        '    the app renders SIGNED OUT, the Report control never mounts, and this lane',
        '    has no dialog to measure. This is the origin trap, not a product defect.',
        `    (the session file is ${STATE})`,
      ],
    )
  }
  const hasBlob = (saved.origins ?? []).some((o) =>
    (o.localStorage ?? []).some((item) => item.name.includes('auth-token')),
  )
  if (!hasBlob) {
    notMeasured(`no Supabase session found in ${STATE}.`, [
      'The file exists and its origin matches, but it carries no auth-token blob.',
    ])
  }

  // A REST call is only needed when the surface has to be discovered or created;
  // say so now rather than launching a browser to find out.
  const needsRest = DETAIL_ID === undefined
  const env = needsRest ? readSupabaseEnv() : null
  if (needsRest && (env.url === undefined || env.anonKey === undefined)) {
    notMeasured(
      'no drop-in id was supplied and .env carries no Supabase URL/anon key, so none can be discovered.',
    )
  }

  // --- 2. Prove the SESSION in the browser, then pick the surface. ----------
  const browser = await chromium.launch({ headless: true, args: ['--headless=new'] })
  let fixtureId = null
  let jwt = null
  try {
    const context = await browser.newContext({
      storageState: saved,
      viewport: { width: 390, height: 844 },
    })
    const page = await context.newPage()

    /**
     * Everything read inside the page, in one round trip: whether the dialog is
     * open, whether focus is inside it, its focusable controls in DOM order, and
     * where focus sits in that order. The control list mirrors `getFocusable()`
     * in `FocusTrap.tsx`, so "the last control" here is the last control the trap
     * itself sees. Null-safe on a closed dialog: a missing dialog must FAIL the
     * checks below, not throw past them.
     */
    const dialogState = () =>
      page.evaluate((selector) => {
        const dlg = document.querySelector('[role="dialog"]')
        if (dlg === null) return { open: false, controls: [], index: -1, inside: false, tag: null }
        const controls = [...dlg.querySelectorAll(selector)].filter(
          (el) => el.offsetParent !== null && !el.hidden,
        )
        const active = document.activeElement
        return {
          open: true,
          controls: controls.map(
            (el) =>
              `${el.tagName.toLowerCase()}${el.getAttribute('data-testid') ? `[${el.getAttribute('data-testid')}]` : ''}:${(el.textContent ?? '').trim().slice(0, 14)}`,
          ),
          index: controls.indexOf(active),
          inside: dlg.contains(active),
          tag: active?.tagName?.toLowerCase() ?? null,
        }
      }, FOCUSABLE)

    /** Focus the first (or last) control of the dialog. */
    const focusControl = (fromEnd) =>
      page.evaluate(
        ({ sel, back }) => {
          const dlg = document.querySelector('[role="dialog"]')
          if (dlg === null) return
          const controls = [...dlg.querySelectorAll(sel)].filter(
            (el) => el.offsetParent !== null && !el.hidden,
          )
          if (controls.length === 0) return
          controls[back ? controls.length - 1 : 0].focus()
        },
        { sel: FOCUSABLE, back: fromEnd },
      )

    // Prove the session really signed this origin in, rather than trusting the
    // file. supabase-js drops the stored session when it cannot refresh it, so a
    // dead token shows up here as an absent key — not as a mystery timeout later.
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 45_000 }).catch(() => {})
    const signedIn = await page
      .waitForFunction(
        () =>
          Object.keys(localStorage).some((k) => k.includes('auth-token')) &&
          !location.pathname.startsWith('/login'),
        { timeout: 15_000 },
      )
      .then(() => true)
      .catch(() => false)
    if (!signedIn) {
      notMeasured(`the marker session at ${STATE} did not sign this run in at ${baseOrigin}.`, [
        'Its localStorage was restored (the origin matches) but no Supabase auth-token',
        'is present after load — the stored access token lives 3600 s and cannot be',
        'refreshed, so this is an EXPIRED marker, not a product defect.',
      ])
    }

    let surfaceId = DETAIL_ID ?? null
    let surfaceHow = DETAIL_ID ? 'explicit id' : null
    if (surfaceId === null) {
      const creds = await markerCredentials(page)
      jwt = creds?.jwt ?? null
      if (jwt === null || creds?.userId == null) {
        notMeasured(`the browser holds no readable Supabase session after loading ${BASE}/.`)
      }
      const found = await findVisiblePlaydate(env, jwt)
      // A 401 here is the token, not the data: the browser restored the session
      // blob but PostgREST rejected the JWT it carries. Reporting that as "no
      // playdate is visible" would name the wrong cause.
      if (found.error !== null && found.error.includes('HTTP 401')) {
        notMeasured(
          `the marker session at ${STATE} is not usable at ${baseOrigin} (PostgREST rejected its token).`,
          [
            found.error,
            'The stored access token lives 3600 s and this one could not be refreshed,',
            'so this is an EXPIRED marker, not a product defect — re-mint it and re-run.',
          ],
        )
      }
      if (found.id !== null) {
        surfaceId = found.id
        surfaceHow = 'discovered (a playdate the marker can read)'
      } else {
        const made = await createFixturePlaydate(env, jwt, creds.userId)
        if (made.id === null) {
          notMeasured(
            `no playdate is visible to the marker and the fixture insert failed (${made.error}).`,
            found.error === null ? [] : [`discovery also failed: ${found.error}`],
          )
        }
        surfaceId = made.id
        fixtureId = made.id
        surfaceHow = 'fixture (created for this run, deleted on exit)'
      }
    }

    console.log('')
    console.log(`surface: /playdate/${surfaceId} (${surfaceHow})`)
    if (fixtureId !== null) console.log('  the fixture is deleted in this run’s teardown')

    await page.goto(`${BASE}/playdate/${surfaceId}`, { waitUntil: 'networkidle', timeout: 45_000 })
    await page
      .waitForFunction(() => document.getElementById('boot-splash') === null, { timeout: 5000 })
      .catch(() => {})
    await page.waitForTimeout(600)

    // Open the report dialog and remember the trigger. A missing control is NOT a
    // skip any more: signed in, on a real drop-in, there IS one, and if there is
    // not, this lane has measured nothing.
    const trigger = page.getByRole('button', { name: /^report$/i }).first()
    if ((await trigger.count()) === 0) {
      notMeasured(
        `signed in at ${baseOrigin}, /playdate/${surfaceId} has no Report control.`,
        [
          'The session is live and the page loaded, so this is the surface, not the',
          'session: measure a drop-in the marker can see, or pass one explicitly.',
        ],
      )
    }
    await trigger.evaluate((el) => el.setAttribute('data-focus-trap-trigger', '1'))
    await trigger.click()
    await page.waitForTimeout(600)

    console.log('')
    const opened = await dialogState()
    check('dialog opened', opened.open === true)
    check('focus starts inside the dialog', opened.inside === true, `focus on <${opened.tag}>`)
    console.log(`  dialog controls (DOM order): ${JSON.stringify(opened.controls)}`)
    check(
      'the dialog has >= 2 focusable controls (a trap over one control proves nothing)',
      opened.controls.length >= 2,
      `${opened.controls.length} control(s)`,
    )

    // Tab more times than there are controls; focus must never leave.
    let escaped = null
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab')
      const s = await dialogState()
      if (!s.inside) {
        escaped = `after Tab #${i + 1}: <${s.tag}>`
        break
      }
    }
    check('12 forward Tabs never leave the dialog', escaped === null, escaped ?? undefined)

    // Shift+Tab must also stay inside.
    let backEscaped = null
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Shift+Tab')
      const s = await dialogState()
      if (!s.inside) {
        backEscaped = `after Shift+Tab #${i + 1}: <${s.tag}>`
        break
      }
    }
    check('6 Shift+Tabs never leave the dialog', backEscaped === null, backEscaped ?? undefined)

    // THE EDGES: staying inside is not enough — the trap must WRAP. This is the
    // half the old lane left to its docblock (the header claimed "wrap to the
    // first control" while the code only asserted "never left"): a browser that
    // simply refused to move would have passed the loops above.
    await focusControl(true)
    await page.keyboard.press('Tab')
    const wrapped = await dialogState()
    check(
      'Tab from the LAST control wraps to the first',
      wrapped.inside === true && wrapped.index === 0,
      `focus index ${wrapped.index} of ${opened.controls.length}`,
    )

    await focusControl(false)
    await page.keyboard.press('Shift+Tab')
    const wrappedBack = await dialogState()
    check(
      'Shift+Tab from the FIRST control wraps to the last',
      wrappedBack.inside === true && wrappedBack.index === opened.controls.length - 1,
      `focus index ${wrappedBack.index} of ${opened.controls.length}`,
    )

    // Escape closes, and (measured, not gated) where focus lands.
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)
    const after = await page.evaluate(() => ({
      dialogGone: document.querySelector('[role="dialog"]') === null,
      onTrigger: document.activeElement?.getAttribute?.('data-focus-trap-trigger') === '1',
      onBody: document.activeElement === document.body,
      tag: document.activeElement?.tagName?.toLowerCase() ?? null,
    }))
    check('Escape closes the dialog', after.dialogGone === true)
    // MEASURED, NOT GATED: see the docblock. The restore is a documented separate
    // defect (FocusTrap.tsx:10-30); this line makes it visible on every run and
    // says what to do when it is fixed.
    if (after.onTrigger) {
      console.log(
        '  GAP CLOSED focus restore on close — focus DOES return to the trigger; ' +
          'src/components/FocusTrap.tsx:10-30 is fixed, so promote this line to a check()',
      )
    } else {
      console.log(
        `  KNOWN GAP focus restore on close — focus fell to <${after.tag}>${after.onBody ? ' (body)' : ''}; ` +
          'tracked separately in src/components/FocusTrap.tsx:10-30, measured here and not gated',
      )
    }
  } finally {
    if (fixtureId !== null) {
      const removed = await deleteFixturePlaydate(env, jwt, fixtureId)
      console.log(
        removed
          ? `\nremoved: fixture playdate ${fixtureId}`
          : `\n  WARNING: fixture cleanup FAILED — delete playdate ${fixtureId} by hand.`,
      )
    }
    await browser.close()
  }

  if (failures.length > 0) {
    console.log(`\nFAIL — ${failures.length} check(s) failed`)
    return 1
  }
  console.log('\nPASS — the dialog traps Tab at both edges and closes on Escape')
  return 0
}

let code
try {
  code = await main()
} catch (error) {
  if (!(error instanceof NotMeasured)) throw error
  console.log(`\nNOT MEASURED — ${error.message}`)
  console.log(`  ${REMEDY}`)
  console.log('  Exit 2, deliberately: this lane measured NOTHING, and that is not a pass.')
  process.exit(2)
}
process.exit(code)

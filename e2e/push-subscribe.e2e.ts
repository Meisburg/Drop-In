/**
 * V8 ticket 08 — web push, end to end.
 *
 * WHAT THIS SPEC CAN AND CANNOT PROVE, stated up front because the difference
 * is a reporting obligation of the ticket:
 *
 *  * IN SCOPE (and asserted here): the client half — that a cold load never
 *    asks for permission, that the app is genuinely in its SUPPORTED state
 *    before anything is clicked, that granting permission registers a
 *    `push_subscriptions` row, that turning notifications off and on again is a
 *    real round trip (off deletes the row, on brings it back), that a denial
 *    registers NOTHING and points at the in-app fallback instead, that a saved
 *    ping arms the prompt (which never appears on a cold load), and that a
 *    denial after that action surfaces the note the AC pins.
 *  * OUT OF SCOPE, and not testable from here: THE SERVER-SIDE SEND. A real
 *    push needs VAPID keys, the deployed `send-push` function and a real push
 *    service, all of which are human-owned console steps (docs/push-setup.md).
 *    The documented live check is a marker pass: trigger a ping, then confirm
 *    the `notification_log` row flips `sent_at` non-null and that the unique
 *    key prevents a second send.
 *
 * `PushManager` and `Notification` are STUBBED via `page.addInitScript`, so no
 * real push service is contacted. The stub is installed before any app script
 * runs — which is also how the "no prompt on a cold load" assertion is able to
 * count permission requests, rather than inferring them from missing UI.
 *
 * THE STUB USED TO BREAK SILENTLY (fix round, finding I): the spec clicked a
 * button that the unsupported/off state may not have rendered and then reported
 * the mystery "no row". So `installPushStub` now (a) installs itself
 * defensively, redefining `window.Notification` / `window.PushManager` /
 * `ServiceWorkerRegistration.prototype.pushManager` with a fallback path, (b)
 * records whether its own install completed (`__pushStub.installed`), and (c)
 * `expectPushSupported()` asserts the PAGE's view — `'PushManager' in window`,
 * `typeof Notification`, `'serviceWorker' in navigator`, the stub present and
 * reported installed — BEFORE any click. A future stub breakage now fails with
 * that sentence instead of "no row".
 *
 * MIGRATIONS 0031/0032 ARE APPLIED LIVE (2026-09-12), so these tables are real
 * and a `404`/`PGRST205` here means something else is wrong (the read helper
 * says so in its failure message).
 *
 * THE ROW ASSERTIONS RETRY (`expect.poll`): an immediate read-after-write on
 * this project was measured missing a just-written row and seeing it a few
 * hundred milliseconds later, so asserting once, instantly, would be flaky for
 * reasons that have nothing to do with the app. The app's own write does NOT
 * depend on that read (it uses RETURNING — see `savePushSubscriptionWithClient`).
 *
 * Cleanup mirrors quick-post.e2e.ts: best-effort REST deletes with the marker's
 * own JWT (both tables are owner-scoped, so only that token can). The
 * `e2e-<epoch>` marker prefix marks any straggler for the orchestrator's sweep.
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import {
  editTitle,
  localDatePlusDays,
  readMarkerMeta,
  readMarkerSession,
  readSupabaseEnv,
  settleOnRoute,
  stepStartTimeOnce,
} from './fixtures'

const TITLE_PLACEHOLDER = 'e.g. Playground time at Green Lake'
const PLACE_PLACEHOLDER = 'e.g. Green Lake playground, near the boathouse'

interface PushStubState {
  permission: 'granted' | 'denied'
  requests: number
  subscribes: number
  unsubscribes: number
  /** Did the stub's own install complete? (finding I: it must be asserted.) */
  installed: boolean
  /** Set when an install step threw — the honest reason `installed` is false. */
  installError?: string
}

/** The stub's own key for its persisted counters (see installPushStub). */
const STUB_STORAGE_KEY = 'dropin.e2e.push-stub'

/**
 * Install the fake `PushManager` / `Notification` before the app boots.
 *
 *  * `Notification.permission` reads 'default' until `requestPermission()` is
 *    called — the same shape as a real first visit, which is what makes
 *    "grant" and "deny" separate runs rather than a pre-set environment.
 *  * `subscribe()` returns a fake subscription whose endpoint is unique to the
 *    run, so the row assertion can prove THIS device registered.
 *  * THE COUNTERS SURVIVE NAVIGATION, through localStorage: `addInitScript`
 *    runs again on every new document, so an in-page counter used to reset on
 *    `page.reload()` and the "it never asks twice" assertion compared a fresh
 *    zero against the previous document's one (finding I). Persisting them also
 *    makes a reload behave like a real browser, where the permission answer is
 *    remembered. The app's own localStorage is untouched (a distinct key).
 *  * Every install step is wrapped, and `installed` records the outcome instead
 *    of throwing into the void: an init script that dies halfway leaves the app
 *    reading REAL browser APIs, which is exactly the silent breakage this
 *    replaces.
 */
async function installPushStub(
  page: Page,
  options: { permission: 'granted' | 'denied'; endpoint: string },
): Promise<void> {
  await page.addInitScript(
    (config: { permission: 'granted' | 'denied'; endpoint: string; storageKey: string }) => {
      let restored: Partial<PushStubState> = {}
      try {
        const raw = window.localStorage.getItem(config.storageKey)
        if (raw !== null) restored = JSON.parse(raw) as Partial<PushStubState>
      } catch {
        restored = {}
      }

      const state: PushStubState = {
        permission: config.permission,
        requests: restored.requests ?? 0,
        subscribes: restored.subscribes ?? 0,
        unsubscribes: restored.unsubscribes ?? 0,
        installed: false,
      }
      ;(window as unknown as { __pushStub: PushStubState }).__pushStub = state

      const persist = () => {
        try {
          window.localStorage.setItem(
            config.storageKey,
            JSON.stringify({
              permission: state.permission,
              requests: state.requests,
              subscribes: state.subscribes,
              unsubscribes: state.unsubscribes,
              installed: state.installed,
            }),
          )
        } catch {
          // A storage that refuses writes only costs the cross-navigation
          // counters; the in-page ones still work.
        }
      }
      persist()

      class FakePushSubscription {
        endpoint: string
        expirationTime = null
        constructor(endpoint: string) {
          this.endpoint = endpoint
        }
        toJSON() {
          return {
            endpoint: this.endpoint,
            expirationTime: null,
            keys: { p256dh: 'e2e-fake-p256dh', auth: 'e2e-fake-auth' },
          }
        }
        async unsubscribe() {
          state.unsubscribes += 1
          persist()
          return true
        }
      }

      const pushManager = {
        async getSubscription() {
          return null
        },
        async subscribe() {
          state.subscribes += 1
          persist()
          return new FakePushSubscription(config.endpoint)
        },
        async permissionState() {
          return state.permission
        },
      }

      /** Define a property where WebIDL actually allows it — a non-configurable
       *  own property would otherwise throw and abort the whole init script. */
      const define = (target: object, key: string, descriptor: PropertyDescriptor) => {
        const existing = Object.getOwnPropertyDescriptor(target, key)
        if (existing !== undefined && existing.configurable === false) {
          // Not configurable: overwrite through assignment where that is
          // allowed, and report it loudly otherwise.
          if (existing.writable === true && 'value' in descriptor) {
            ;(target as Record<string, unknown>)[key] = descriptor.value
            return
          }
          throw new Error(`${key} is not configurable and cannot be replaced`)
        }
        Object.defineProperty(target, key, descriptor)
      }

      try {
        define(ServiceWorkerRegistration.prototype, 'pushManager', {
          configurable: true,
          get: () => pushManager,
        })
        // Feature detection is `'PushManager' in window`, so the constructor has
        // to exist even though the app never news one up.
        define(window, 'PushManager', {
          configurable: true,
          writable: true,
          value: class PushManager {},
        })

        const FakeNotification = function () {
          /* never constructed by the app */
        } as unknown as { permission: string; requestPermission: () => Promise<string> }
        define(FakeNotification, 'permission', {
          configurable: true,
          get: () => (state.requests > 0 ? state.permission : 'default'),
        })
        FakeNotification.requestPermission = async () => {
          state.requests += 1
          persist()
          return state.permission
        }
        define(window, 'Notification', {
          configurable: true,
          writable: true,
          value: FakeNotification,
        })

        state.installed = true
      } catch (error) {
        state.installed = false
        state.installError = error instanceof Error ? error.message : String(error)
      }
      persist()
    },
    { permission: options.permission, endpoint: options.endpoint, storageKey: STUB_STORAGE_KEY },
  )
}

async function stubState(page: Page): Promise<PushStubState> {
  return page.evaluate(
    () => (window as unknown as { __pushStub: PushStubState }).__pushStub,
  )
}

/**
 * Assert the PAGE can actually do web push, before anything is clicked.
 *
 * This is the fix-round finding I guard: every failure this spec can produce
 * (no row, no prompt) is a consequence of the app being in some other state, and
 * "no row" says nothing about why. These assertions name the state instead.
 */
async function expectPushSupported(page: Page): Promise<void> {
  const facts = await page.evaluate(() => ({
    stub: (window as unknown as { __pushStub?: PushStubState }).__pushStub ?? null,
    pushManagerInWindow: 'PushManager' in window,
    notification: typeof Notification,
    serviceWorker: 'serviceWorker' in navigator,
    isSecureContext: window.isSecureContext,
  }))

  expect(
    facts.stub,
    'the push stub did not run at all — addInitScript never executed in this document',
  ).not.toBeNull()
  expect(
    facts.stub?.installed,
    `the push stub failed to install (${facts.stub?.installError ?? 'no reason recorded'}) — ` +
      'the app is talking to REAL browser APIs, so every push assertion below is meaningless',
  ).toBe(true)
  expect(
    { pushManagerInWindow: facts.pushManagerInWindow, notification: facts.notification, serviceWorker: facts.serviceWorker },
    'the app cannot support web push in this browser context, so it will never offer the opt-in ' +
      `(isSecureContext=${facts.isSecureContext})`,
  ).toEqual({ pushManagerInWindow: true, notification: 'function', serviceWorker: true })
}

/** This profile's registered endpoints, read over PostgREST with the marker's
 *  own JWT. Retries: an immediate read-after-write on this project can miss a
 *  row it has just written (see the file header). */
async function expectRegistered(
  request: APIRequestContext,
  profileId: string,
  endpoint: string,
): Promise<void> {
  await expect
    .poll(async () => (await registeredEndpoints(request, profileId)).includes(endpoint), {
      message: `expected ${endpoint} to be registered for profile ${profileId}`,
      timeout: 15_000,
    })
    .toBe(true)
}

/** …and the absence, for the opt-out and the denied cases (retried for the same
 *  reason: a read issued right after a delete can still see the row). */
async function expectNotRegistered(
  request: APIRequestContext,
  profileId: string,
  endpoint: string,
): Promise<void> {
  await expect
    .poll(async () => (await registeredEndpoints(request, profileId)).includes(endpoint), {
      message: `${endpoint} must NOT be registered for profile ${profileId}`,
      timeout: 15_000,
    })
    .toBe(false)
}

async function registeredEndpoints(
  request: APIRequestContext,
  profileId: string,
): Promise<string[]> {
  const { url, anonKey } = readSupabaseEnv()
  const { accessToken } = readMarkerSession()
  const response = await request.get(
    `${url}/rest/v1/push_subscriptions?select=endpoint&profile_id=eq.${profileId}`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` } },
  )
  const body = await response.text()
  expect(
    response.status(),
    `push_subscriptions read failed (HTTP ${response.status()}: ${body.slice(0, 240)}) — ` +
      'migrations 0031/0032 are APPLIED LIVE, so a 404/PGRST205 here is not the expected ' +
      'pre-apply red: check the project ref in .env and the table names',
  ).toBe(200)
  return (JSON.parse(body) as Array<{ endpoint: string }>).map((row) => row.endpoint)
}

/**
 * Post one drop-in through the /new UI as the marker (the while-away spec's
 * helper) so a SECOND account has something to ping.
 */
async function postDropIn(page: Page, title: string, place: string): Promise<void> {
  await page.goto('/new')
  await settleOnRoute(page, '/new')
  // V9 ticket 03 (review cycle 1, F2): the summary's title is a read-back —
  // tap it to edit (the input is what the specs drive).
  await editTitle(page)
  await page.getByPlaceholder(TITLE_PLACEHOLDER).fill(title)
  await page.getByPlaceholder(PLACE_PLACEHOLDER).fill(place)
  // V9 ticket 01: /new no longer asks for a neighbourhood — nothing to pick.
  // V13 ticket 02: the date + the 30-minute stepper live in the visible "When" section (the disclosure is gone).
  await page.locator('input[type="date"]').fill(localDatePlusDays(1))
  const start = await stepStartTimeOnce(page)
  // V13 ticket 03: no duration chips on /new — the End stepper shows
  // the current end time (start + auto-duration). Verify it's visible.
  await expect(page.getByTestId('end-time-label')).toBeVisible()
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')
}

test('a cold load never asks for permission', async ({ page }) => {
  await installPushStub(page, { permission: 'granted', endpoint: 'https://push.example.test/e2e-cold' })

  await page.goto('/')
  await settleOnRoute(page, '/')

  // The app is genuinely up (this is the feed, not an error view) …
  await expect(page.getByRole('link', { name: 'Nearby', exact: true })).toBeVisible()
  // … and it never asked. The counter is the strong assertion: a prompt that
  // rendered and unmounted would still have called requestPermission.
  await expect(page.getByTestId('push-optin-prompt')).toHaveCount(0)
  expect((await stubState(page)).requests).toBe(0)
})

test('granting permission registers a push subscription row, and turning off is reversible', async ({
  page,
}) => {
  const marker = readMarkerMeta()
  const { userId } = readMarkerSession()
  const endpoint = `https://push.example.test/e2e-${Date.now()}`

  await installPushStub(page, { permission: 'granted', endpoint })

  await page.goto('/settings')
  await settleOnRoute(page, '/settings')

  const section = page.getByTestId('notifications-section')
  await expect(section).toBeVisible()
  // THE STUB AND THE BROWSER FIRST: a future stub breakage must fail here, with
  // the page's own facts, not three assertions later with "no row".
  await expectPushSupported(page)
  // The floating post-action prompt is /settings's suppressed surface — the
  // section's own button is the control here.
  await expect(page.getByTestId('push-optin-prompt')).toHaveCount(0)
  await expect(page.getByTestId('push-status')).toContainText('Notifications are off')

  await page.getByTestId('push-turn-on').click()

  // The UI first (it is the app's own report of the write it just made) …
  await expect(page.getByTestId('push-status')).toContainText('Notifications are on')
  await expect(page.getByTestId('push-notice')).toContainText('Notifications are on')
  // … then the row, which must agree. The app is never allowed to say "on"
  // without one.
  await expectRegistered(page.request, userId, endpoint)
  expect((await stubState(page)).subscribes).toBe(1)

  // The recent-alerts fallback renders regardless (it is the honest fallback
  // for a parent who denies permission, and it works with any permission).
  await expect(page.getByTestId('push-recent')).toBeVisible()

  // Turning off deletes the row again — the opt-out IS the row's absence.
  await page.getByTestId('push-turn-off').click()
  await expect(page.getByTestId('push-status')).toContainText('Notifications are off')
  await expectNotRegistered(page.request, userId, endpoint)

  // THE ROUND TRIP (fix-round finding A): "Turn off" remembers the 'dismissed'
  // decision while the BROWSER still reports permission 'granted', and the
  // opt-in control used to be gated on the prompt rule — which short-circuits on
  // both, so the section promised "you can turn them back on here any time" with
  // no button anywhere. A COLD LOAD is the state a parent actually returns to,
  // so that is where the button has to be.
  await page.reload()
  await settleOnRoute(page, '/settings')
  await expect(page.getByTestId('push-status')).toContainText('Notifications are off')
  await expect(page.getByTestId('push-turn-on')).toBeVisible()

  await page.getByTestId('push-turn-on').click()
  await expect(page.getByTestId('push-status')).toContainText('Notifications are on')
  await expectRegistered(page.request, userId, endpoint)
  expect((await stubState(page)).subscribes).toBe(2)

  expect(marker.displayName).not.toBe('')
})

test('a denied permission registers nothing and points at the feed inbox', async ({ page }) => {
  const { userId } = readMarkerSession()
  const endpoint = `https://push.example.test/e2e-denied-${Date.now()}`

  await installPushStub(page, { permission: 'denied', endpoint })

  await page.goto('/settings')
  await settleOnRoute(page, '/settings')
  await expectPushSupported(page)

  await page.getByTestId('push-turn-on').click()

  // The honest fallback, not silence: the "while you were away" inbox that
  // already exists on the feed (ticket 03).
  const fallback = page.getByTestId('push-fallback-note')
  await expect(fallback).toBeVisible()
  await expect(fallback).toContainText('While you were away')

  // Nothing was registered, and the permission request is never made again.
  await expectNotRegistered(page.request, userId, endpoint)
  await expect(page.getByTestId('push-turn-on')).toHaveCount(0)

  // The reload assertion is NAVIGATION-SAFE (fix-round finding I): the stub's
  // counters persist in localStorage, so `requests` is a running total across
  // documents instead of resetting to zero on the new one. It also now reads
  // 'denied' from the first render, like a real browser that remembers.
  const before = (await stubState(page)).requests
  await page.reload()
  await settleOnRoute(page, '/settings')
  await expect(page.getByTestId('push-fallback-note')).toBeVisible()
  expect((await stubState(page)).requests).toBe(before)
  expect((await stubState(page)).permission).toBe('denied')
  expect(
    await page.evaluate(() => window.localStorage.getItem('dropin.push.decision')),
  ).toBe('denied')
})

test('the prompt follows a real action, and "Not now" is answered with the inbox note', async ({
  page,
}) => {
  const marker = readMarkerMeta()
  const title = `e2e ${marker.displayName} push prompt`
  const place = 'E2E push prompt park'

  await installPushStub(page, {
    permission: 'granted',
    endpoint: `https://push.example.test/e2e-armed-${Date.now()}`,
  })

  // A meaningful action: create a post through the UI. This is the ONLY thing
  // that may make the prompt legal.
  await page.goto('/new')
  await settleOnRoute(page, '/new')
  await expect(page.getByTestId('push-optin-prompt')).toHaveCount(0)
  // V9 ticket 03 (review cycle 1, F2): the summary's title is a read-back —
  // tap it to edit (the input is what the specs drive).
  await editTitle(page)
  await page.getByPlaceholder(TITLE_PLACEHOLDER).fill(title)
  await page.getByPlaceholder(PLACE_PLACEHOLDER).fill(place)
  // V9 ticket 01: /new no longer asks for a neighbourhood — nothing to pick.
  // V13 ticket 03: no duration chips on /new — the auto-duration is already set.
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')

  // The one-line reason, then the decision.
  const prompt = page.getByTestId('push-optin-prompt')
  await expect(prompt).toBeVisible()
  await expect(prompt).toContainText('heads-up')

  await page.getByTestId('push-optin-not-now').click()
  await expect(prompt).toHaveCount(0)

  // Finding F: the "not now" answer surfaces the pinned fallback sentence HERE
  // (it used to exist only on the /profile push control, pre-V11-t06), and says
  // it once — the trigger stands
  // down, so it does not trail the parent around the app.
  const note = page.getByTestId('push-optin-note')
  await expect(note).toBeVisible()
  await expect(note).toContainText('While you were away')
  await page.getByTestId('push-optin-note-dismiss').click()
  await expect(note).toHaveCount(0)

  // Remembered: a reload does not ask again.
  await page.reload()
  await settleOnRoute(page, '/')
  await expect(page.getByTestId('push-optin-prompt')).toHaveCount(0)
  expect((await stubState(page)).requests).toBe(0)
})

test('a saved ping arms the prompt, and denying it surfaces the inbox note', async ({
  page,
  browser,
}) => {
  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const viewerName = `e2e-p-${epoch}`
  const viewerEmail = `e2e-p-${epoch}@gmail.com` // gmail.com: the project rejects example.com
  const viewerPassword = `e2e-p-pw-${epoch}` // in-memory only — never written, never committed
  const title = `e2e ${marker.displayName} push ping lot`
  const endpoint = `https://push.example.test/e2e-ping-${Date.now()}`

  // --- 1. The marker HOSTS a drop-in (nobody can ping their own post). ---
  await postDropIn(page, title, 'E2E push ping lot')

  // --- 2. A SECOND account, signed in with the push stub installed, is the one
  // whose ping must arm the prompt: the arm sites are on the pinger's device. ---
  const viewerContext = await browser.newContext({
    baseURL: 'http://localhost:4173',
    storageState: { cookies: [], origins: [] },
  })
  const viewer = await viewerContext.newPage()
  await installPushStub(viewer, { permission: 'denied', endpoint })

  await viewer.goto('/login')
  await viewer.getByRole('button', { name: 'New here? Create an account' }).click()
  await viewer.locator('input[autocomplete="nickname"]').fill(viewerName)
  await viewer.locator('input[type="email"]').fill(viewerEmail)
  await viewer.locator('input[type="password"]').fill(viewerPassword)
  await viewer.getByRole('button', { name: 'Create account' }).click()

  await viewer.getByRole('heading', { name: 'Set your location' }).waitFor()
  await viewer.getByPlaceholder('e.g. 98107').fill(marker.homeZip)
  await viewer.locator('select').first().selectOption({ label: `${marker.radiusMiles} miles` })
  await viewer.getByRole('button', { name: /^Continue/ }).click()
  await viewer.getByRole('heading', { name: 'Near you' }).waitFor()
  await expectPushSupported(viewer)

  const card = viewer.locator('a').filter({ hasText: title }).first()
  await expect(card).toBeVisible()
  // A cold load of the feed never asks (the pin), even with a post on screen.
  await expect(viewer.getByTestId('push-optin-prompt')).toHaveCount(0)

  // --- 3. THE ACTION: a ping saved from the card. It DOES NOT NAVIGATE, which
  // is why the prompt used to appear only after a created post (finding B). ---
  await card.getByRole('button', { name: /^Say we’re going to/ }).click()
  await expect(card.getByRole('button', { name: /^Going — tap to take it back$/ })).toBeVisible()

  const prompt = viewer.getByTestId('push-optin-prompt')
  await expect(prompt).toBeVisible()
  await expect(prompt).toContainText('heads-up')

  // --- 4. Denying it is answered with the note, not silence (finding F), and
  // registers NOTHING on this device. ---
  await viewer.getByTestId('push-optin-turn-on').click()
  await expect(prompt).toHaveCount(0)
  const note = viewer.getByTestId('push-optin-note')
  await expect(note).toBeVisible()
  await expect(note).toContainText('While you were away')
  expect((await stubState(viewer)).subscribes).toBe(0)
  expect(await viewer.evaluate(() => window.localStorage.getItem('dropin.push.decision'))).toBe(
    'denied',
  )

  await viewerContext.close()
})

test.afterEach(async () => {
  // Best-effort cleanup (the quick-post / golden-path pattern): delete the
  // marker's own rows via PostgREST with the marker's JWT.
  try {
    const { url, anonKey } = readSupabaseEnv()
    const { accessToken, userId } = readMarkerSession()
    const headers: Record<string, string> = {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'return=representation',
    }

    const subs = await fetch(
      `${url}/rest/v1/push_subscriptions?profile_id=eq.${userId}&select=endpoint`,
      { method: 'DELETE', headers },
    )
    if (!subs.ok) {
      console.log(
        `[e2e cleanup] push_subscriptions delete HTTP ${subs.status} — a marker subscription row ` +
          'may be left behind (the e2e- prefix sweep will pick it up)',
      )
    }

    const playdateQuery = `${url}/rest/v1/playdates?host_profile_id=eq.${userId}&select=id`
    const del = await fetch(playdateQuery, { method: 'DELETE', headers })
    const remaining = await fetch(playdateQuery, { headers })
    const left = remaining.ok ? ((await remaining.json()) as unknown[]) : null
    if (!del.ok || (left !== null && left.length > 0)) {
      console.log(
        `[e2e cleanup] FAILED — delete HTTP ${del.status}, ${left?.length ?? '?'} marker playdate ` +
          `row(s) remain (marker ${userId}) — the e2e- prefix sweep will pick them up`,
      )
    } else {
      console.log('[e2e cleanup] ok — marker playdate + subscription rows swept')
    }
  } catch (err) {
    console.log(
      `[e2e cleanup] FAILED (logged, best-effort): ${err instanceof Error ? err.message : err}`,
    )
  }
})

/**
 * V16 t01 — the per-kind notification toggles, and the heading that labels them.
 *
 * This closes a gap t01 opened. That slice relabelled the "What to tell me
 * about" paragraph into an `<h2>` ("Choose what you get notified about") plus a
 * helper line, on the founder's decision that the five toggles already EXISTED
 * and the real problem was finding them. But nothing in the suite asserted the
 * toggles at all: the only test that touches `notifications-section` drives the
 * device-level turn-on/off control, so a regression that dropped a kind, or
 * unlabelled them, would have shipped silently.
 *
 * Asserted here:
 *  - every NOTIFICATION_KIND renders a checkbox, by its own testid;
 *  - each is labelled with the kind's `copy.label` (the founder-facing name,
 *    e.g. "Someone joins your drop-in") — the label is the whole point of the
 *    discoverability fix;
 *  - all five start CHECKED (unmuted), the documented default;
 *  - toggling one off is reflected in the control (the UI is the app's own
 *    report of the state it holds).
 *
 * The muted set lives in localStorage + a Cache Storage mirror for the service
 * worker, NOT a table — so this asserts the control's own state rather than a
 * row, and the cleanup clears the key so no later run inherits a muted kind.
 */
test('every notification kind has a labelled toggle, and toggling is reflected', async ({
  page,
}) => {
  const kinds = [
    'ping_received',
    'new_comment',
    'starting_soon',
    'cancelled',
    'ended',
  ] as const

  await page.goto('/settings')
  await settleOnRoute(page, '/settings')

  const prefs = page.getByTestId('push-kind-prefs')
  await expect(prefs).toBeVisible()
  // The discoverability heading t01 added — the thing that made these findable.
  await expect(prefs.getByRole('heading', { name: 'Choose what you get notified about' })).toBeVisible()

  for (const kind of kinds) {
    const box = page.getByTestId(`push-pref-${kind}`)
    await expect(box, `${kind} must render a toggle`).toBeVisible()
    // Visible, non-empty label text — an unlabelled checkbox is unusable.
    const label = page.locator(`label[for="push-pref-${kind}"]`)
    await expect(label).not.toBeEmpty()
    // Default is ON (not muted).
    await expect(box).toBeChecked()
  }

  // Toggle one off; the control reports it. (No row to read: prefs are
  // client-side by design.)
  const first = page.getByTestId(`push-pref-${kinds[0]}`)
  await first.uncheck()
  await expect(first).not.toBeChecked()

  // Toggling back keeps the default state so a re-run starts clean.
  await first.check()
  await expect(first).toBeChecked()
})

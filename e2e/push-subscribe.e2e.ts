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
 *  * ALSO IN SCOPE since V25 ticket 15, and TWO points since V29 removed the
 *    signup arm: the drop-in just posted and the RSVP just given — each offered
 *    at most once, a "Not now" at one of them NOT cancelling the others, the
 *    going-to-an-event reason naming comments and cancellations, and the
 *    detail-page deferral ending on the next non-detail visit instead of
 *    swallowing the point. (The account-just-created point is GONE; the spec
 *    below asserts its absence rather than its behaviour.)
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
  dismissRsvpConfirmationIfOpen,
  editTitle, localDatePlusDays, readMarkerMeta, readMarkerSession,
  readSupabaseEnv, settleOnRoute, finishSignup,
  signUpViewer, stepStartTimeOnce,
} from './fixtures'

const TITLE_PLACEHOLDER = 'e.g. Playground time at Green Lake'
const PLACE_PLACEHOLDER = 'e.g. Green Lake playground, near the boathouse'

interface PushStubState {
  permission: 'granted' | 'denied'
  requests: number
  subscribes: number
  unsubscribes: number
  /**
   * How many times `subscribe()` was called WITHOUT a VAPID key, and therefore
   * REFUSED (V28 r3-2). A non-zero count against a build that has no key is the
   * defect made visible; a non-zero count against a build that HAS one means the
   * key never reached the client.
   */
  keylessSubscribeAttempts: number
  /**
   * The document's `navigator.userActivation.isActive` AT THE MOMENT
   * `requestPermission()` was called (V25 ticket 15). The ticket's hard
   * constraint is that a browser grants push only on a user gesture, so this is
   * the fact that proves every request this app makes came from one. `null` when
   * the browser exposes no `navigator.userActivation` at all.
   */
  requestActivation: boolean | null
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
        keylessSubscribeAttempts: restored.keylessSubscribeAttempts ?? 0,
        requestActivation: restored.requestActivation ?? null,
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
              keylessSubscribeAttempts: state.keylessSubscribeAttempts,
              requestActivation: state.requestActivation,
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
        /**
         * ⚠️ THIS STUB MUST REFUSE A KEYLESS SUBSCRIBE (V28 r3-2).
         *
         * It used to accept ANY options and return a fake subscription — so a
         * build with no VAPID key "succeeded" in every test while a real Chrome
         * refused it outright with `Registration failed - missing
         * applicationServerKey, and gcm_sender_id not found in manifest`. That
         * is exactly why 2067 green tests shipped a broken notification opt-in:
         * the stub modelled a browser more permissive than any real one.
         *
         * The refusal is modelled on Chromium's, and it is a REJECTION rather
         * than a silent success, because the defect was the app recording a
         * success that never happened.
         */
        async subscribe(options?: { applicationServerKey?: unknown }) {
          if (options?.applicationServerKey === undefined) {
            state.keylessSubscribeAttempts += 1
            persist()
            throw new DOMException(
              'Registration failed - missing applicationServerKey, and gcm_sender_id not found in manifest',
              'InvalidStateError',
            )
          }
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
          // V25 ticket 15: what the browser sees at the instant the app asks.
          state.requestActivation =
            typeof navigator !== 'undefined' && 'userActivation' in navigator
              ? navigator.userActivation.isActive
              : null
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
  await expect(page.getByRole('link', { name: 'Drop Ins', exact: true })).toBeVisible()
  // … and it never asked. The counter is the strong assertion: a prompt that
  // rendered and unmounted would still have called requestPermission.
  await expect(page.getByTestId('push-optin-prompt')).toHaveCount(0)
  expect((await stubState(page)).requests).toBe(0)
})

/**
 * V29 (2026-10-04) — SIGNUP IS NOT A TRIGGER POINT.
 *
 * This test used to assert the opposite: that the first surface after Create
 * account drew the opt-in card (V25 ticket 15's trigger point 1). The founder
 * removed that point, because a completed signup has produced nothing to be
 * notified ABOUT and the card landed on the first feed paint of an app the
 * parent had never seen work — over an empty feed. The two remaining points are
 * a created post and a saved "I'm going".
 *
 * WHAT THIS PINS: the first surface behind setup is CLEAR — no card, no note, no
 * permission request — and nothing was recorded as offered, so no point was
 * spent on the parent's behalf. A reload is silent for the same reason, and the
 * global decision is untouched, so the post ask is still legal afterwards.
 */
test('finishing signup earns no notification ask — the first surface behind setup stays clear', async ({
  browser,
}) => {
  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const viewerName = `e2e-s-${epoch}`
  const viewerEmail = `e2e-s-${epoch}@gmail.com` // gmail.com: the project rejects example.com
  const viewerPassword = `e2e-s-pw-${epoch}` // in-memory only — never written, never committed

  const viewerContext = await browser.newContext({
    baseURL: 'http://localhost:4173',
    storageState: { cookies: [], origins: [] },
  })
  const viewer = await viewerContext.newPage()
  // 'denied' so that if one of the assertions below ever stops holding, the
  // failure cannot ALSO leave a subscription row behind for a viewer account no
  // cleanup can reach (the afterEach sweeps with the MARKER's owner-scoped JWT).
  await installPushStub(viewer, {
    permission: 'denied',
    endpoint: `https://push.example.test/e2e-signup-${Date.now()}`,
  })

  await signUpViewer(viewer, { name: viewerName, email: viewerEmail, password: viewerPassword })
  await finishSignup(viewer, { homeZip: marker.homeZip, radiusMiles: marker.radiusMiles })

  // The whole claim: the first surface behind setup is clear. No card, no note,
  // and the browser was never asked anything.
  await expect(viewer.getByTestId('push-optin-prompt')).toHaveCount(0)
  await expect(viewer.getByTestId('push-optin-note')).toHaveCount(0)
  expect((await stubState(viewer)).requests).toBe(0)
  // NOTHING WAS SPENT. A point is recorded as offered the moment its card is
  // drawn; no card here means the record stays empty, so the post ask below is
  // untouched by having signed up.
  expect(await viewer.evaluate(() => window.localStorage.getItem('dropin.push.offered'))).toBe(null)
  // And the global decision is not written either — that is the /settings
  // off-switch's job alone.
  expect(await viewer.evaluate(() => window.localStorage.getItem('dropin.push.decision'))).toBe(
    null,
  )

  // THE RELOAD: no card, no note, and still no permission request.
  await viewer.reload()
  await settleOnRoute(viewer, '/')
  await expect(viewer.getByTestId('push-optin-prompt')).toHaveCount(0)
  await expect(viewer.getByTestId('push-optin-note')).toHaveCount(0)
  expect((await stubState(viewer)).requests).toBe(0)

  await viewerContext.close()
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

  // AND A SECOND POST IS SILENT TOO (V25 ticket 15): the point is "after a first
  // post", offered at most once. The "Not now" above deliberately did NOT write
  // the global 'dismissed' decision, so this silence is the per-point rule doing
  // the work rather than a global stop that would also kill the going ask.
  await page.goto('/new')
  await settleOnRoute(page, '/new')
  await editTitle(page)
  await page.getByPlaceholder(TITLE_PLACEHOLDER).fill(`${title} again`)
  await page.getByPlaceholder(PLACE_PLACEHOLDER).fill(place)
  await page.getByRole('button', { name: 'Post drop-in' }).click()
  await page.waitForURL('/')
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

  // V20 t06: signup is first + last name + address now — one shared helper
  // (`signUpViewer`) so the form's field list lives in one place.
  await signUpViewer(viewer, {
    name: viewerName,
    email: viewerEmail,
    password: viewerPassword,
  })

  await finishSignup(viewer, {
    homeZip: marker.homeZip,
    radiusMiles: marker.radiusMiles,
  })
  await expectPushSupported(viewer)

  // V29: signup no longer draws a card, so the feed is already silent WITHOUT
  // the test answering anything first — a stronger baseline than the old "spend
  // the signup point": anything that appears below came from the ping itself.
  await expect(viewer.getByTestId('push-optin-prompt')).toHaveCount(0)
  await expect(viewer.getByTestId('push-optin-note')).toHaveCount(0)

  const card = viewer.locator('a').filter({ hasText: title }).first()
  await expect(card).toBeVisible()

  // --- 3. THE ACTION: a ping saved from the card. It DOES NOT NAVIGATE, which
  // is why the prompt used to appear only after a created post (finding B). ---
  await card.getByRole('button', { name: /^Say we’re going to/ }).click()
  await expect(card.getByRole('button', { name: /^Going — tap to take it back$/ })).toBeVisible()

  const prompt = viewer.getByTestId('push-optin-prompt')
  await expect(prompt).toBeVisible()
  await expect(prompt).toContainText('heads-up')
  // V25 ticket 15, TRIGGER POINT 3: saying you are going is its own moment, and
  // the reason names what they get for it — the founder's "updates on the event,
  // like comments or if it gets cancelled or whatever".
  await expect(prompt).toContainText('comments')
  await expect(prompt).toContainText('cancelled')

  // --- 4. Denying it is answered with the note, not silence (finding F), and
  // registers NOTHING on this device. ---
  await viewer.getByTestId('push-optin-turn-on').click()
  await expect(prompt).toHaveCount(0)
  const note = viewer.getByTestId('push-optin-note')
  await expect(note).toBeVisible()
  await expect(note).toContainText('While you were away')
  expect((await stubState(viewer)).subscribes).toBe(0)
  // THE GESTURE (V25 ticket 15): the one permission request this card makes
  // happened while the document was ACTIVATED. A browser only honours a push
  // prompt then, and this is the fact that pins it — the card's own button is
  // the gesture, so nothing here depends on the Create-account tap's activation
  // surviving the signup awaits.
  expect((await stubState(viewer)).requestActivation).toBe(true)
  expect(await viewer.evaluate(() => window.localStorage.getItem('dropin.push.decision'))).toBe(
    'denied',
  )

  await viewerContext.close()
})

/**
 * FIRST-USE AUDIT (ticket 03): THE RSVP CONFIRMATION OWNS ITS MOMENT.
 *
 * The audit found the opt-in prompt landing in the same instant as the RSVP
 * confirmation on a drop-in's detail page. The page had just done its job —
 * "✓ Going", the count, "You" — and a notification card competed with it.
 *
 * TWO CLAIMS, and the second is why this cannot be a blanket delay:
 *   1. nothing notification-shaped appears beside the confirmation; and
 *   2. the trigger SURVIVES the deferral — the next NON-DETAIL visit offers it.
 * A blanket "never prompt after a ping" passes (1) and silently swallows the
 * action, which is the outcome the audit did not ask for (and, until V25 ticket
 * 15, was what the code actually did: the route the action happened on decided
 * the deferral on its own, so the point was deferred on every route forever).
 *
 * THE STUB'S PERMISSION IS 'granted' BUT NO REQUEST IS EVER MADE — and that is
 * what makes both claims measurable. The stub reports `default` until
 * `requestPermission()` is called (see `installPushStub`), so the decision seam
 * is live rather than short-circuited by "already granted": if the trigger were
 * washed away on the detail page, step 6 would find nothing, and if the prompt
 * were rendering on the detail page, step 4 would see it. Never tapping "Turn on
 * notifications" also means no subscription row is written for a viewer account
 * the marker's owner-scoped cleanup cannot reach. The note path itself stays
 * covered by `a saved ping arms the prompt, and denying it surfaces the inbox
 * note`.
 */
test('a ping from a drop-in detail page defers the notification prompt off the RSVP confirmation', async ({
  page,
  browser,
}) => {
  const marker = readMarkerMeta()
  const epoch = Math.floor(Date.now() / 1000)
  const viewerName = `e2e-d-${epoch}`
  const viewerEmail = `e2e-d-${epoch}@gmail.com` // gmail.com: the project rejects example.com
  const viewerPassword = `e2e-d-pw-${epoch}` // in-memory only — never written, never committed
  const title = `e2e ${marker.displayName} rsvp priority lot`

  // --- 1. The marker hosts a drop-in; the viewer needs something to RSVP to. ---
  await postDropIn(page, title, 'E2E rsvp priority lot')

  // --- 2. The viewer, on the DETAIL page. ---
  const viewerContext = await browser.newContext({
    baseURL: 'http://localhost:4173',
    storageState: { cookies: [], origins: [] },
  })
  const viewer = await viewerContext.newPage()
  await installPushStub(viewer, {
    permission: 'granted',
    endpoint: `https://push.example.test/e2e-d-${epoch}`,
  })
  await signUpViewer(viewer, {
    name: viewerName,
    email: viewerEmail,
    password: viewerPassword,
  })
  await finishSignup(viewer, {
    homeZip: marker.homeZip,
    radiusMiles: marker.radiusMiles,
  })
  await expectPushSupported(viewer)

  // V29: signup no longer draws a card, so this baseline needs no setup — the
  // tab is already silent when the RSVP below happens, which is exactly what
  // makes any prompt seen later attributable to the RSVP.
  await expect(viewer.getByTestId('push-optin-prompt')).toHaveCount(0)
  await expect(viewer.getByTestId('push-optin-note')).toHaveCount(0)

  const href = await viewer
    .locator('a')
    .filter({ hasText: title })
    .first()
    .getAttribute('href')
  expect(href).toMatch(/^\/playdate\//)
  await viewer.goto(href ?? '/')
  await expect(viewer.getByRole('heading', { name: title })).toBeVisible()

  // The baseline: a full load of the detail page never asks (the cold-load pin),
  // nothing has RSVP'd yet, and since V29 there is no signup point to have been
  // answered — so any prompt seen later in this test must be caused by the RSVP
  // below. (The old comment here claimed "the signup point was answered above",
  // which V29 removed; this baseline needs no setup.)
  await expect(viewer.getByTestId('push-optin-prompt')).toHaveCount(0)

  // --- 3. THE ACTION: the detail page's own RSVP control. Its label is a
  //         TOGGLE state ("I'm going" ⇄ "✓ Going"), so the stable hook is the
  //         accessible name pattern plus aria-pressed, not an exact string. ---
  const goingButton = viewer
    .getByRole('button', { name: /(i’m going|✓ going|tap to confirm)/i })
    .first()
  await expect(goingButton).toBeVisible()
  await goingButton.click()

  // The confirmation landed: this is the moment the prompt must not touch. The
  // pressed state IS the confirmation, and it is what the audit watched change.
  await expect(goingButton).toHaveAttribute('aria-pressed', 'true')

  // --- 4. THE CLAIM: nothing notification-shaped on this screen, and nothing
  //         was registered behind the parent's back.
  //
  //         V25 ticket 13 put the RSVP confirmation LIGHTBOX on this same
  //         moment, and it makes this claim stronger rather than weaker: the
  //         assertions below run with that dialog OPEN, so "no prompt" is now
  //         also "no prompt on top of a real modal". It is dismissed with the
  //         same control a parent uses before step 5 navigates on. ---
  expect(new URL(viewer.url()).pathname).toMatch(/^\/playdate\//)
  await expect(viewer.getByTestId('push-optin-prompt')).toHaveCount(0)
  await expect(viewer.getByTestId('push-optin-note')).toHaveCount(0)
  expect((await stubState(viewer)).subscribes).toBe(0)
  // The lightbox really IS up at this point (otherwise the two lines above
  // would be asserting against a page that had nothing on it at all).
  await expect(viewer.getByTestId('rsvp-confirmation')).toHaveCount(1)
  await dismissRsvpConfirmationIfOpen(viewer)

  // --- 5. THE TRIGGER SURVIVED: the next non-detail visit still carries it. ---
  await settleOnRoute(viewer, '/')
  expect(await viewer.evaluate(() => window.sessionStorage.getItem('dropin.push.trigger'))).toBe(
    'ping_saved',
  )
  // The armed origin is the detail route this ping came from — the fact the
  // deferral is decided on.
  expect(
    await viewer.evaluate(() => window.sessionStorage.getItem('dropin.push.trigger.origin')),
  ).toMatch(/^\/playdate\//)
  expect((await stubState(viewer)).subscribes).toBe(0)

  // --- 6. THE DEFERRAL IS A WAIT, NOT A SWALLOW (V25 ticket 15). At HEAD the
  //         route the action happened on decided this on its own, so a ping from
  //         a detail page was deferred on EVERY route and the going-to-an-event
  //         offer never happened at all. Here it is: offered on the first
  //         non-detail surface, with the founder's reason. ---
  const deferred = viewer.getByTestId('push-optin-prompt')
  await expect(deferred).toBeVisible()
  await expect(deferred).toContainText('comments')
  await expect(deferred).toContainText('cancelled')
  // Nothing was registered behind the parent's back: the card is an offer, and
  // this spec never accepts it.
  expect((await stubState(viewer)).subscribes).toBe(0)
  expect((await stubState(viewer)).requests).toBe(0)

  // Offered once: a reload of the feed is silent.
  await viewer.reload()
  await settleOnRoute(viewer, '/')
  await expect(viewer.getByTestId('push-optin-prompt')).toHaveCount(0)
  expect((await stubState(viewer)).requests).toBe(0)

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
 * about" paragraph into a heading ("Choose what you get notified about") plus a
 * helper line, on the founder's decision that the toggles already EXISTED
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
 *  - all six start CHECKED (unmuted), the documented default;
 *  - toggling one off is reflected in the control (the UI is the app's own
 *    report of the state it holds).
 *
 * THE LIST BELOW IS A SEVENTH HAND-MAINTAINED TWIN of the same
 * `notification_log.kind` constraint (see plan.md's Interfaces inventory).
 * `NotificationsSection` maps `NOTIFICATION_KINDS`, so a kind added there
 * renders a toggle that this spec would silently not cover — which is exactly
 * what happened when `review_due` (migration 0055) joined the list: the sixth
 * checkbox rendered unasserted until review caught it. A NEW KIND MUST BE
 * APPENDED HERE TOO, or this file becomes a lie.
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
    'review_due',
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

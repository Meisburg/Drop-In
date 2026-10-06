/**
 * The app's NATIVE-PUSH registration seam (slice 2b: Android/FCM).
 *
 * WHAT THIS FILE IS. The native twin of `src/lib/push.ts` + `pushClient.ts`,
 * with the two halves kept apart in ONE file on purpose: the RULES here are
 * pure and injected (so vitest pins them without a browser), and the only
 * browser-touching part is `registerForNativePush`, which loads the Capacitor
 * plugin lazily. Nothing above that function imports Capacitor, so the spec can
 * import this module under plain Node — the same `npm:`-free boundary that made
 * `_shared/smtp.ts` testable in the email slice.
 *
 * ⚠️ THE PERMISSION FLOW COMES FIRST (the parent brief's trap #1). On Android
 * 13+ (`targetSdk 33+`) `register()` called before the permission is granted
 * hands back a token that can never produce a visible alert: the send succeeds,
 * the OS drops it, and the parent believes notifications are on. So the order
 * this file enforces is `checkPermissions()` → (maybe) `requestPermissions()` →
 * `register()`, and the spec asserts the ORDER, not just the outcomes.
 *
 * ⚠️ A NATIVE TOKEN IS NOT A VAPID SUBSCRIPTION (trap #2). No `endpoint`, no
 * `p256dh`/`auth`, no service worker: this writes ONE `device_tokens` row whose
 * upsert key is the token itself (`DEVICE_TOKEN_CONFLICT_KEY`). The web path in
 * `pushClient.ts` is untouched and the two coexist — do not "unify" them.
 *
 * WHAT IS DELIBERATELY NOT HERE: the concrete `device_tokens` write. The build
 * law says a `lib/` module takes its client as a PARAMETER, so the persistence
 * is the injected `saveToken` seam and the caller owns the Supabase client
 * (the `togglePingWithClient` pattern). `deviceTokenRow` builds the exact row
 * an `upsert(row, { onConflict: DEVICE_TOKEN_CONFLICT_KEY })` writes.
 */
import type { NativePushPlatform } from '../../supabase/functions/_shared/nativePush.ts'

/**
 * The permission states the Capacitor plugin reports for `receive`. Declared as
 * a wide string on the seam because an unknown state must be handled rather
 * than crash: an unreadable state is `prompt`-like, never `granted`.
 */
export type NativePermissionState = 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale'

export interface NativePushPermission {
  receive: string
}

/** The listener handle `addListener` resolves to (Capacitor 5+). */
export interface NativePushListener {
  remove(): Promise<void> | void
}

/**
 * The slice of `@capacitor/push-notifications` this module uses — declared
 * structurally rather than imported, so a fake can satisfy it and no Capacitor
 * code has to load in the test lane. The real plugin object IS assignable to
 * this (see `registerForNativePush`).
 */
export interface NativePushPlugin {
  checkPermissions(): Promise<NativePushPermission>
  requestPermissions(): Promise<NativePushPermission>
  register(): Promise<void>
  addListener(
    event: 'registration',
    handler: (token: { value: string }) => void,
  ): Promise<NativePushListener>
  addListener(
    event: 'registrationError',
    handler: (error: { error: string }) => void,
  ): Promise<NativePushListener>
}

/**
 * The sentence shown to a parent who denied the OS permission. It names the one
 * real route back (the OS settings), because a button that re-asks is a silent
 * no-op — the browser/OS will not show the dialog twice.
 */
export const NATIVE_PUSH_DENIED_REASON =
  'Notifications are turned off for Drop In on this device. Turn them on for Drop In in your phone’s settings, then reopen the app.'

/** The sentence for a build running outside the Android/iOS shell (the web app). */
export const NATIVE_PUSH_WEB_REASON =
  'Native notifications are only available in the installed app.'

/** Why an empty `Token.value` is refused rather than stored. */
export const NATIVE_PUSH_EMPTY_TOKEN_REASON =
  'the notification plugin reported an empty registration token, so there is nothing to send to'

// ─────────────────────────────────────────────────────────────────────────────
// The decision (pure).
// ─────────────────────────────────────────────────────────────────────────────

export type NativePushRegistrationPlan =
  | { action: 'register' }
  | { action: 'request' }
  | { action: 'blocked'; reason: string }

/**
 * What to do about ONE permission reading, as a pure function.
 *
 *  1. `granted`              → register. Nothing to ask for.
 *  2. `denied`               → blocked. Registering anyway is the trap: the OS
 *                              has already said no, so the token is useless.
 *  3. `prompt` /
 *     `prompt-with-rationale` → request. THIS is the Android 13+ path.
 *  4. anything else (unknown) → request. Asking is harmless when the OS has
 *                              already granted (it returns `granted` without a
 *                              dialog) and it is the only way to learn a state
 *                              we could not read. Never `register` on a state
 *                              we do not understand.
 *
 * The caller re-plans with the answer to `requestPermissions()` — see
 * `registerNativePushToken` — so "request" is never a terminal decision.
 */
export function planNativePushRegistration(permission: string): NativePushRegistrationPlan {
  if (permission === 'granted') return { action: 'register' }
  if (permission === 'denied') return { action: 'blocked', reason: NATIVE_PUSH_DENIED_REASON }
  return { action: 'request' }
}

// ─────────────────────────────────────────────────────────────────────────────
// The row (pure).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * THE UPSERT KEY, named once. The provider hands the same token back for the
 * same install, so the token is the natural key (migration 0065 pin b) and
 * re-registering must UPDATE the row — refreshing `last_seen_at` — rather than
 * insert a second one for the same phone.
 */
export const DEVICE_TOKEN_CONFLICT_KEY = 'token'

export interface DeviceTokenRow {
  profile_id: string
  platform: NativePushPlatform
  token: string
  app_version: string | null
  last_seen_at: string
}

/**
 * The exact row the client upserts — or `null` when there is no usable token.
 * Pure and total: `now` is injected, so the spec pins the `last_seen_at`
 * refresh instead of measuring the clock.
 *
 * A blank token yields `null` rather than a row: `token` is `not null unique`
 * in the table, and a whitespace string would satisfy the constraint while
 * being unsendable — a row that looks alive and can never be delivered to.
 */
export function deviceTokenRow(input: {
  profileId: string
  token: string
  platform: NativePushPlatform
  appVersion?: string | null
  now?: Date
}): DeviceTokenRow | null {
  const token = (input.token ?? '').trim()
  if (token === '') return null

  const appVersion = (input.appVersion ?? '').trim()
  return {
    profile_id: input.profileId,
    platform: input.platform,
    token,
    app_version: appVersion === '' ? null : appVersion,
    last_seen_at: (input.now ?? new Date()).toISOString(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The registration (rules pure, dependencies injected).
// ─────────────────────────────────────────────────────────────────────────────

export type NativePushRegistrationOutcome =
  | { status: 'registered'; token: string }
  | { status: 'blocked'; reason: string }
  | { status: 'unsupported'; reason: string }
  | { status: 'error'; reason: string }

export interface NativePushRegistrationDeps {
  plugin: NativePushPlugin
  platform: NativePushPlatform
  profileId: string
  appVersion?: string | null
  /** The persistence seam: the caller runs the `device_tokens` upsert. */
  saveToken(row: DeviceTokenRow): Promise<void>
  /** The app version to record; injected so the spec pins the row. */
  now?: () => Date
}

/** The narrow, non-throwing error text a thrown plugin error becomes. */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message.trim()
  if (typeof error === 'string') return error.trim()
  try {
    return String(error).trim()
  } catch {
    return ''
  }
}

interface Deferred<T> {
  promise: Promise<T>
  resolve(value: T): void
}

/**
 * A promise resolved from outside — the shape an event listener needs, since
 * the token arrives on the plugin's `registration` event rather than from
 * `register()`'s own return value. There is deliberately no `reject`: neither
 * event is an exception, and every failure is an OUTCOME this function returns
 * (see `registerNativePushToken`).
 */
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

/**
 * Register this install and persist its token. Resolves on EVERY path — it
 * never throws into a click handler, the way the web `enablePush` path does not:
 *
 *  1. read the permission, and RE-READ it after asking (the Android 13+ order);
 *  2. attach the two listeners BEFORE `register()`, because the token can arrive
 *     the instant `register()` resolves and a listener attached afterwards can
 *     miss it;
 *  3. build the row, save it, and hand the token back;
 *  4. always remove the two listeners it added, on every exit path, so repeated
 *     launches do not pile up handlers inside the plugin.
 *
 * A blocked/denied outcome is NOT an error: it is a parent's answer, and the
 * caller shows the reason. An `error` outcome is something that went wrong.
 */
export async function registerNativePushToken(
  deps: NativePushRegistrationDeps,
): Promise<NativePushRegistrationOutcome> {
  let permission: string
  try {
    const checked = await deps.plugin.checkPermissions()
    permission = typeof checked?.receive === 'string' ? checked.receive : ''
  } catch (error) {
    return { status: 'error', reason: describeError(error) || 'could not read the notification permission' }
  }

  let plan = planNativePushRegistration(permission)

  if (plan.action === 'request') {
    try {
      const asked = await deps.plugin.requestPermissions()
      // The SECOND reading is the one that decides — never the first.
      permission = typeof asked?.receive === 'string' ? asked.receive : ''
    } catch (error) {
      return { status: 'error', reason: describeError(error) || 'could not ask for the notification permission' }
    }
    plan = planNativePushRegistration(permission)
  }

  if (plan.action === 'blocked') return { status: 'blocked', reason: plan.reason }

  // The listeners come first (step 2). Both are awaited so each is registered
  // before `register()` is called.
  const registration = deferred<{ value: string }>()
  const failure = deferred<{ error: string }>()
  let registrationListener: NativePushListener | undefined
  let errorListener: NativePushListener | undefined

  try {
    registrationListener = await deps.plugin.addListener('registration', (token) => {
      registration.resolve(token)
    })
    errorListener = await deps.plugin.addListener('registrationError', (error) => {
      failure.resolve(error)
    })

    await deps.plugin.register()

    // Whichever arrives first wins; the other simply never settles.
    const settled = await Promise.race([
      registration.promise.then((token) => ({ kind: 'token' as const, token })),
      failure.promise.then((error) => ({ kind: 'error' as const, error })),
    ])

    if (settled.kind === 'error') {
      const detail = (settled.error?.error ?? '').trim()
      return {
        status: 'error',
        reason: detail === '' ? 'the notification plugin reported a registration error' : detail,
      }
    }

    const row = deviceTokenRow({
      profileId: deps.profileId,
      token: settled.token?.value ?? '',
      platform: deps.platform,
      appVersion: deps.appVersion,
      now: deps.now?.(),
    })
    if (row === null) return { status: 'error', reason: NATIVE_PUSH_EMPTY_TOKEN_REASON }

    await deps.saveToken(row)
    return { status: 'registered', token: row.token }
  } catch (error) {
    return { status: 'error', reason: describeError(error) || 'native push registration failed' }
  } finally {
    // Step 4. A removal failure must never change the outcome — by now the
    // token is saved (or the reason is decided), and a stuck teardown is not a
    // verdict on the registration.
    for (const listener of [registrationListener, errorListener]) {
      try {
        await listener?.remove?.()
      } catch {
        // Deliberately swallowed: see above.
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The wiring — the ONLY part that touches Capacitor.
// ─────────────────────────────────────────────────────────────────────────────

export interface RegisterForNativePushInput {
  profileId: string
  appVersion?: string | null
  saveToken(row: DeviceTokenRow): Promise<void>
}

/**
 * The real registration, wired to the real plugin. It is the app's entry point;
 * the RULES above are what the spec pins.
 *
 * THE PLUGIN IS LOADED LAZILY, and that is not a micro-optimisation: a
 * top-level `@capacitor/...` import would drag a browser-only module into every
 * vitest run of this file (and into the web bundle's first paint) for a code
 * path only an installed app ever reaches.
 *
 * A non-native platform is `unsupported`, with the honest sentence — the web
 * app has its own, working, VAPID path and must not be sent down this one.
 */
export async function registerForNativePush(
  input: RegisterForNativePushInput,
): Promise<NativePushRegistrationOutcome> {
  try {
    const [{ Capacitor }, { PushNotifications }] = await Promise.all([
      import('@capacitor/core'),
      import('@capacitor/push-notifications'),
    ])

    const platform = Capacitor.getPlatform()
    if (platform !== 'android' && platform !== 'ios') {
      return { status: 'unsupported', reason: NATIVE_PUSH_WEB_REASON }
    }

    return await registerNativePushToken({
      plugin: PushNotifications,
      platform,
      profileId: input.profileId,
      appVersion: input.appVersion,
      saveToken: input.saveToken,
    })
  } catch (error) {
    return {
      status: 'error',
      reason: describeError(error) || 'the notification plugin could not be loaded',
    }
  }
}

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
 *
 * THE OPT-OUT IS THE SAME SHAPE (`disableNativePush`, injected `deleteTokens`),
 * and `nativePushShellPlatform` is the one question a caller asks before drawing
 * the native control at all — slice 2b built and tested this seam but nothing in
 * the app called it, so a `device_tokens` row could never be written; that gap is
 * what 2b-ii closed.
 */
import type { NativePushPlatform } from '../../supabase/functions/_shared/nativePush.ts'
// The classifier the notice frames: a failure cause is a developer string until
// `settingsErrorMessage` has replaced it with the caller's plain sentence.
import { settingsErrorMessage } from './settingsError'

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
 * The two platforms a native shell reports and the provider send can address
 * (migration 0065 pin c: `platform` is a CHECK, not free text).
 */
export type NativePushShellPlatform = 'android' | 'ios'

/**
 * A Capacitor platform string as a shell platform, or `null` outside a shell.
 * Pure and total, so the mapping is written ONCE: both the runtime edge
 * (`nativePushShellPlatform`) and `registerForNativePush` go through it rather
 * than each testing for 'android'/'ios' on its own.
 *
 * `null` is the honest answer for 'web' AND for the `''` a shell that never
 * initialised reports — an unreadable platform is a browser, never an
 * assumption of native.
 */
export function nativePlatformOf(platform: string): NativePushShellPlatform | null {
  return platform === 'android' || platform === 'ios' ? platform : null
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

/**
 * The sentence for a permission that is STILL not granted after we asked (a
 * dialog dismissed without an answer, or a state we could not read). Registering
 * anyway is trap #1: on Android 13+ it returns a token that can never produce a
 * visible alert, and the parent believes notifications are on. So this is a
 * blocked outcome, not a registration.
 */
export const NATIVE_PUSH_UNCONFIRMED_PERMISSION_REASON =
  'Drop In could not confirm that notifications are allowed on this device, so it did not register. Allow notifications for Drop In in your phone’s settings, then reopen the app.'

/** Why an empty `Token.value` is refused rather than stored. */
export const NATIVE_PUSH_EMPTY_TOKEN_REASON =
  'the notification plugin reported an empty registration token, so there is nothing to send to'

/**
 * The cause shown when the registration failed with nothing readable to quote —
 * and the FALLBACK the caller's copy uses in place of a database-shaped reason.
 * It lives here, next to the seam that produces the failure, so the half that
 * knows the cause and the half that writes the sentence cannot drift apart.
 */
export const NATIVE_PUSH_REGISTRATION_FAILED_REASON = 'native push registration failed'

/** The same, for the opt-out (see `disableNativePush`). */
export const NATIVE_PUSH_OPT_OUT_FAILED_REASON = 'could not remove this device’s registration'

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
 * `registerNativePushToken` — and a SECOND `request` after the ask is a BLOCKED
 * outcome there: the OS was given the chance to grant and did not, so
 * registering now would only store a token nothing can show. `request` is a
 * request to ASK, never a licence to register.
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

/**
 * What a registration resolved to.
 *
 * ⚠️ THE COPY / CAUSE SPLIT IS THE POINT, and fix round 2 corrected the reason
 * written here first. `blocked` and `unsupported` carry `reason`: WRITTEN COPY
 * (the `NATIVE_PUSH_*_REASON` consts) that the caller renders as the sentence.
 * `error` carries `cause`: the RAW thrown value — a PostgREST message, an RLS
 * `permission denied`, a Capacitor bridge rejection — which must be classified
 * by `src/lib/settingsError.ts` before a parent sees it. Two different contracts,
 * so they are two different FIELD NAMES: a field called `cause` cannot be
 * interpolated into a sentence by accident the way a second `reason` could, and
 * that is the whole of the protection. (The earlier comment claimed a wrapped
 * `Error` was what made classification work. It is not: `settingsErrorMessage`
 * classifies a BARE STRING fine — measured, and pinned by settingsError.test.ts.
 * What the wrap actually cost was worse: `String(obj)` of a rejected plain object
 * produced `'[object Object]'`, which the classifier reads as a HUMAN sentence.
 * So the raw value is passed through instead.)
 */
export type NativePushRegistrationOutcome =
  | { status: 'registered'; token: string }
  | { status: 'blocked'; reason: string }
  | { status: 'unsupported'; reason: string }
  | { status: 'error'; cause: unknown }

export interface NativePushRegistrationDeps {
  plugin: NativePushPlugin
  platform: NativePushPlatform
  profileId: string
  /**
   * The build's version string, recorded in `device_tokens.app_version` so a
   * human can tell "the new build registers, the old one does not" apart.
   */
  appVersion?: string | null
  /** The persistence seam: the caller runs the `device_tokens` upsert. */
  saveToken(row: DeviceTokenRow): Promise<void>
  /** The clock, injected so the spec pins `last_seen_at` instead of reading it. */
  now?: () => Date
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
    // The RAW thrown value, not a stringified copy of it: Capacitor's bridge
    // rejects with a plain object, and `settingsErrorMessage` reads `.message`
    // off one. `String(obj)` would hand the classifier '[object Object]', which
    // it treats as a human sentence and shows to a parent.
    return { status: 'error', cause: error }
  }

  let plan = planNativePushRegistration(permission)

  if (plan.action === 'request') {
    try {
      const asked = await deps.plugin.requestPermissions()
      // The SECOND reading is the one that decides — never the first.
      permission = typeof asked?.receive === 'string' ? asked.receive : ''
    } catch (error) {
      return { status: 'error', cause: error }
    }
    plan = planNativePushRegistration(permission)
  }

  if (plan.action === 'blocked') return { status: 'blocked', reason: plan.reason }

  // Still asking AFTER the ask: the OS did not grant (a dismissed dialog, or a
  // state we could not read). This is the trap-#1 guard, and it is checked on
  // the SECOND plan on purpose — the first reading is allowed to be `prompt`.
  // Registering here would store a token that can never produce a visible
  // alert while the parent believes notifications are on, which is exactly the
  // outcome this module exists to prevent.
  if (plan.action === 'request') {
    return { status: 'blocked', reason: NATIVE_PUSH_UNCONFIRMED_PERMISSION_REASON }
  }

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
      // The plugin's own sentence, deliberately EXTRACTED rather than passed as
      // the raw event: the event is `{ error: string }`, and the classifier reads
      // `message`/`details`/`code`, so the object would classify to the caller's
      // fallback and the one useful detail would be lost. A bare string is
      // classified on its own (settingsError.test.ts pins that).
      return {
        status: 'error',
        cause: detail === '' ? 'the notification plugin reported a registration error' : detail,
      }
    }

    const row = deviceTokenRow({
      profileId: deps.profileId,
      token: settled.token?.value ?? '',
      platform: deps.platform,
      appVersion: deps.appVersion,
      now: deps.now?.(),
    })
    if (row === null) {
      return { status: 'error', cause: NATIVE_PUSH_EMPTY_TOKEN_REASON }
    }

    await deps.saveToken(row)
    return { status: 'registered', token: row.token }
  } catch (error) {
    return { status: 'error', cause: error }
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

    const platform = nativePlatformOf(Capacitor.getPlatform())
    if (platform === null) {
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
      cause: error,
    }
  }
}

/**
 * Which shell this build is running in, or `null` in a browser.
 *
 * The runtime edge for `nativePlatformOf`, and the ONE question a caller asks
 * before rendering the native control: the web opt-in is gated on
 * `pushSupported()`, which is FALSE inside the shell (the Capacitor WebView has
 * no `PushManager`), so without this the native path would have no button to be
 * reached from — the whole defect slice 2b-ii exists to close.
 *
 * The plugin is loaded lazily for the same reason `registerForNativePush` loads
 * it that way, and a Capacitor that throws or is absent is a BROWSER: this never
 * rejects, so a caller can `await` it in a mount effect without a `catch`.
 */
export async function nativePushShellPlatform(): Promise<NativePushShellPlatform | null> {
  try {
    const { Capacitor } = await import('@capacitor/core')
    return nativePlatformOf(Capacitor.getPlatform())
  } catch {
    return null
  }
}

export type NativePushOptOutOutcome =
  | { status: 'removed' }
  | { status: 'unsupported'; reason: string }
  | { status: 'error'; cause: unknown }

export interface DisableNativePushInput {
  /**
   * The shell the caller detected (`nativePushShellPlatform`), injected so the
   * opt-out is pinned without loading Capacitor in the test lane.
   */
  platform: NativePushShellPlatform | null
  /**
   * The persistence seam: the caller runs the `device_tokens` DELETE. Migration
   * 0065's pin, verbatim — "Turn off notifications" IS the row's absence, and
   * nothing else in the app can stand in for it: a toggle that leaves the row
   * behind keeps the parent reachable after they said stop.
   */
  deleteTokens(): Promise<void>
}

/**
 * The opt-out, the twin of `registerForNativePush`. Resolves on every path and
 * never throws into a click handler:
 *
 *  * a browser is `unsupported` — the web "Turn off" owns that path;
 *  * a failed delete is `error`, so the caller can say so instead of reporting
 *    "off" over a row that is still there.
 *
 * An `error`'s `cause` is the RAW thrown value, unclassified: turning it into
 * parent-facing copy is the caller's job, and `nativePushFailureNotice` below is
 * the caller's half of it. The fallback copy is exported from here, so the side
 * that produces the failure and the side that writes the sentence cannot drift.
 *
 * It deletes EVERY `device_tokens` row of this profile (the caller's delete is
 * profile-scoped, the `deletePushSubscriptionsForProfile` shape) rather than
 * one scoped to a token: the token the plugin hands back today is not
 * necessarily the row in the table, and a delete that removes nothing while the
 * UI claims "off" is the worst version of this control.
 */
export async function disableNativePush(
  input: DisableNativePushInput,
): Promise<NativePushOptOutOutcome> {
  if (input.platform === null) return { status: 'unsupported', reason: NATIVE_PUSH_WEB_REASON }

  try {
    await input.deleteTokens()
    return { status: 'removed' }
  } catch (error) {
    return { status: 'error', cause: error }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The notice (pure) — the sentence a FAILED attempt shows a parent.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The arms of the two outcome unions that are not a success. Structurally
 * identical for registration and opt-out, which is what lets one notice builder
 * serve both.
 */
export type NativePushFailureOutcome =
  | { status: 'blocked'; reason: string }
  | { status: 'unsupported'; reason: string }
  | { status: 'error'; cause: unknown }

/** The FRAME and the fallback for each native action, named once. */
const NATIVE_PUSH_FAILURE_COPY = {
  // The TURN-OFF frame matches its web sentence in NotificationsSection —
  // `Couldn't turn notifications off (…)`, apostrophe and all
  // (NotificationsSection.tsx:413) — so for THAT action a parent reads the same
  // shape whichever channel failed.
  //
  // TURN-ON DOES NOT MATCH, and this comment claimed it did until slice 2b-iii's
  // fix round 3: the web path says `Couldn't finish turning on notifications (…)`
  // (pushClient.ts:541) while this one says `Couldn't turn on notifications`. The
  // mismatch is RECORDED here, not corrected — that slice is a copy-honesty fix
  // and parent-facing wording is not its call.
  'turn-on': {
    frame: "Couldn't turn on notifications",
    fallback: NATIVE_PUSH_REGISTRATION_FAILED_REASON,
  },
  'turn-off': {
    frame: "Couldn't turn notifications off",
    fallback: NATIVE_PUSH_OPT_OUT_FAILED_REASON,
  },
} as const

/**
 * The sentence a parent reads when a native attempt did NOT turn notifications
 * on (or off). Pure and total, so the component renders it and decides nothing —
 * and so the FRAME is pinned by a test instead of by a reviewer's eye.
 *
 * ⚠️ THE FRAME IS LOAD-BEARING, and fix round 2 caught its absence: rendering the
 * classifier's return value alone shows a bare lowercase fragment — `native push
 * registration failed` — which names neither what failed nor that nothing
 * changed. `blocked`/`unsupported` already carry full sentences, so they are
 * returned untouched (the denied one names the way back to the phone's settings);
 * only an `error` is framed and classified.
 */
export function nativePushFailureNotice(
  action: keyof typeof NATIVE_PUSH_FAILURE_COPY,
  outcome: NativePushFailureOutcome,
): string {
  const { frame, fallback } = NATIVE_PUSH_FAILURE_COPY[action]
  if (outcome.status === 'error') {
    return `${frame} (${settingsErrorMessage(outcome.cause, fallback)}).`
  }
  return outcome.reason
}

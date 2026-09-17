/**
 * Web push, the pure half (V8 ticket 08).
 *
 * Everything browser-shaped lives behind an injected fact (a user-agent
 * string, a permission string, a Storage-like object) so it can be unit
 * tested in Node — no component in the app sniffs a user agent, and no
 * component decides whether to prompt. The browser-touching half is
 * `src/lib/pushClient.ts`; the service worker (`src/sw.ts`) imports the
 * dedupe key and the mute rules from here.
 *
 * The payload/copy rules themselves live in the one module the deployed
 * `send-push` function also imports — `supabase/functions/_shared/pushCopy.ts`
 * — and are re-exported below so `src/lib/push.test.ts` exercises exactly the
 * code the sender runs.
 */
import {
  NOTIFICATION_KINDS,
  type NotificationDedupeInput,
  type NotificationKind,
  type NotificationPayload,
  type NotificationPayloadInput,
  buildNotificationPayload,
  dedupeNotifications,
  familiesGoingLabel,
  isNotificationKind,
  notificationDedupeKey,
  notificationUrl,
} from '../../supabase/functions/_shared/pushCopy.ts'

export {
  NOTIFICATION_KINDS,
  buildNotificationPayload,
  dedupeNotifications,
  familiesGoingLabel,
  isNotificationKind,
  notificationDedupeKey,
  notificationUrl,
}
export type {
  NotificationDedupeInput,
  NotificationKind,
  NotificationPayload,
  NotificationPayloadInput,
}

// ---------------------------------------------------------------------------
// What the app calls the four kinds (the /profile toggle rows).
//
// Derived from the same NOTIFICATION_KINDS list as the payload builder, so the
// UI cannot drift into describing a kind that no producer can create.
// ---------------------------------------------------------------------------

/** The one-line description of a kind, and an honest example of when it fires. */
export interface NotificationKindCopy {
  label: string
  when: string
}

export const NOTIFICATION_KIND_COPY: Record<NotificationKind, NotificationKindCopy> = {
  ping_received: {
    label: 'Someone joins your drop-in',
    when: 'A family taps "I\'m going" on a post you made.',
  },
  new_comment: {
    label: 'New comments',
    when: 'Someone comments on your post, or replies to your comment.',
  },
  starting_soon: {
    label: 'Starting soon',
    when: 'A drop-in you joined starts within the hour.',
  },
  cancelled: {
    label: 'Cancelled',
    when: 'A host cancels or deletes a drop-in you joined — before you drive out.',
  },
}

// ---------------------------------------------------------------------------
// Device facts (pure detection — the only place in the app that reads a
// user-agent string, and it reads it as an argument).
// ---------------------------------------------------------------------------

export interface DeviceFacts {
  userAgent: string
  /** navigator.platform (still the only way to spot iPadOS 13+ Safari). */
  platform?: string | null
  /** navigator.maxTouchPoints. */
  maxTouchPoints?: number | null
}

/**
 * iPhone / iPad / iPod, including iPadOS 13+, which reports a DESKTOP Mac
 * user-agent ("Macintosh; Intel Mac OS X") and can only be told apart from a
 * real Mac by its touch points. Getting this wrong both ways is bad: a real
 * Mac misread as an iPad shows an "add to Home Screen" card that cannot work,
 * and an iPad misread as a Mac hides the one instruction iOS push actually
 * depends on.
 */
export function isIosDevice(facts: DeviceFacts): boolean {
  const ua = facts.userAgent ?? ''
  if (/iPad|iPhone|iPod/.test(ua)) return true
  const touches = facts.maxTouchPoints ?? 0
  if (touches <= 1) return false
  return (facts.platform ?? '') === 'MacIntel' || /Macintosh/.test(ua)
}

/**
 * An iOS **in-app browser** — a share link opened inside Instagram, Facebook,
 * Slack, Messenger, TikTok and friends. Those are WKWebViews: the app's own
 * browser chrome, no Share menu of its own, and no way to add anything to the
 * Home Screen.
 *
 * THE SEAM: Safari always puts a `Safari/<version>` token in its user-agent and
 * a WKWebView never does. That single absence is what separates "iOS Safari"
 * from "an app that happens to be on iOS", which the named-shell list alone
 * cannot do (Instagram's UA carries no `CriOS`/`FxiOS`/`GSA` token either).
 * This app ships share links, so a webview is a realistic way for a parent to
 * arrive — and the wrong reading is expensive in both directions: a webview
 * told to use a Share menu it does not have is stuck, and a webview read as
 * Safari would be offered an install that cannot happen.
 */
export function isIosWebview(facts: DeviceFacts): boolean {
  if (!isIosDevice(facts)) return false
  return !/Safari\/[\d.]+/.test(facts.userAgent ?? '')
}

/**
 * iOS **Safari** specifically. Every other iOS browser is a WebKit shell with
 * a different name (CriOS / FxiOS / EdgiOS / OPiOS / GSA / DuckDuckGo) and none
 * of them can add a PWA to the Home Screen at all — so the iOS card is shown
 * for Safari only, and a non-Safari iOS browser gets the "open this in Safari"
 * sentence instead of instructions that would dead-end. A webview is excluded
 * for the same reason (see isIosWebview), with its own sentence.
 */
export function isIosSafari(facts: DeviceFacts): boolean {
  if (!isIosDevice(facts)) return false
  if (/(CriOS|FxiOS|EdgiOS|OPiOS|GSA|DuckDuckGo)/.test(facts.userAgent ?? '')) return false
  return !isIosWebview(facts)
}

/**
 * Already running as the installed app — either the legacy
 * `navigator.standalone` (iOS) or the standard `display-mode: standalone`
 * media query. Both are injected so this stays a pure function.
 */
export function isStandalone(displayModeStandalone: boolean, navigatorStandalone: boolean): boolean {
  return displayModeStandalone || navigatorStandalone
}

/** Where (if anywhere) an install affordance belongs. */
export type InstallSurface = 'android-install-button' | 'ios-install-card' | 'none'

/**
 * The install affordance to show, in strict precedence order: an installed app
 * needs nothing; iOS Safari needs INSTRUCTIONS (there is no
 * `beforeinstallprompt` on iOS at all, so the card is the only route); Android
 * and desktop Chromium hand us a real deferred prompt, which becomes a real
 * button. Anything else (desktop Safari, Firefox) gets nothing — offering an
 * install we cannot perform would be noise.
 *
 * iOS is decided ENTIRELY by the platform: every non-Safari iOS browser and
 * every in-app webview gets nothing, even if a `hasInstallPrompt` somehow
 * arrived (nothing on iOS fires one). The fix-round finding E was this seam
 * handing a webview an instruction card for a menu it does not have.
 */
export function installSurface(
  facts: DeviceFacts & { standalone: boolean; hasInstallPrompt: boolean },
): InstallSurface {
  if (facts.standalone) return 'none'
  if (isIosDevice(facts)) return isIosSafari(facts) ? 'ios-install-card' : 'none'
  if (facts.hasInstallPrompt) return 'android-install-button'
  return 'none'
}

/** The honest reason the iOS card exists (the ticket's wording, kept literal). */
export const IOS_INSTALL_REASON =
  'On iPhone and iPad, notifications only arrive in the installed app: tap Share, then "Add to Home Screen", and turn them on there.'

export const IOS_SAFARI_ONLY_REASON =
  'On iPhone and iPad, only Safari can add Drop In to your Home Screen — open this page in Safari to install it.'

/**
 * The webview sentence. A parent who opened a share link inside another app
 * cannot install OR receive push from there, but they are NOT stuck: opening
 * the same link in Safari is a real, one-tap escape. That is the difference
 * between this and the Safari-only sentence above (which is about a browser the
 * parent chose).
 */
export const IOS_WEBVIEW_REASON =
  'You opened this from inside another app, where Drop In cannot be installed or send notifications. Open this link in Safari to turn them on.'

export interface PushOptInGate {
  allowed: boolean
  /** Why not, in one honest sentence — null when allowed. */
  reason: string | null
}

/**
 * Whether the opt-in may be offered at all, and why not when it may not.
 * On iOS this is the whole point of the install affordance: web push is
 * delivered ONLY to an installed PWA, so offering "turn on notifications" in a
 * Safari tab would produce a permission grant that never yields a single
 * notification — the worst outcome, because the parent believes they are
 * covered.
 *
 * The refusal is a sentence, never a dead end: each reason names the one thing
 * the parent can do about it (install the app, open Safari, or leave the app's
 * in-app browser).
 */
export function pushOptInGate(facts: DeviceFacts & { standalone: boolean }): PushOptInGate {
  if (!isIosDevice(facts)) return { allowed: true, reason: null }
  if (isIosWebview(facts)) return { allowed: false, reason: IOS_WEBVIEW_REASON }
  if (!isIosSafari(facts)) return { allowed: false, reason: IOS_SAFARI_ONLY_REASON }
  if (!facts.standalone) return { allowed: false, reason: IOS_INSTALL_REASON }
  return { allowed: true, reason: null }
}

// ---------------------------------------------------------------------------
// The permission-decision memory + the prompt rule.
//
// Two separate stored facts, with two different lifetimes, and conflating them
// is the bug this section exists to prevent:
//
//  * the DECISION (localStorage, permanent) — what this parent answered. A
//    denial is remembered FOREVER and never re-prompted: the browser will not
//    show the prompt again anyway, so re-asking only produces a silent no-op
//    that looks like a broken button.
//  * the TRIGGER (sessionStorage, this tab only) — the meaningful action that
//    just happened ("you posted", "you pinged"). It is what makes the prompt
//    legal: with no trigger, `ask` is false, which is the "never on cold load"
//    pin.
// ---------------------------------------------------------------------------

export type PermissionDecision = 'unknown' | 'granted' | 'denied' | 'dismissed'

/** What the browser reports (`Notification.permission`, plus our own 'unsupported'). */
export type BrowserPermission = 'default' | 'granted' | 'denied' | 'unsupported'

/** The two meaningful actions the ticket allows a prompt to follow. */
export type PushPromptTrigger = 'post_created' | 'ping_saved'

export const PUSH_DECISION_KEY = 'dropin.push.decision'
export const PUSH_TRIGGER_KEY = 'dropin.push.trigger'
export const PUSH_PREFS_KEY = 'dropin.push.muted'

/** The minimum surface of localStorage/sessionStorage this module needs. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** An unknown/garbage stored value reads as 'unknown' — never as a decision. */
export function parsePermissionDecision(raw: string | null | undefined): PermissionDecision {
  return raw === 'granted' || raw === 'denied' || raw === 'dismissed' ? raw : 'unknown'
}

export function serializePermissionDecision(decision: PermissionDecision): string {
  return decision
}

export function readPermissionDecision(storage: StorageLike | null): PermissionDecision {
  if (storage === null) return 'unknown'
  try {
    return parsePermissionDecision(storage.getItem(PUSH_DECISION_KEY))
  } catch {
    return 'unknown'
  }
}

export function rememberPermissionDecision(
  storage: StorageLike | null,
  decision: PermissionDecision,
): void {
  if (storage === null) return
  try {
    storage.setItem(PUSH_DECISION_KEY, serializePermissionDecision(decision))
  } catch {
    // A storage that refuses writes (private mode, quota) means the decision
    // is not remembered — the prompt may then reappear, which is a cosmetic
    // regression, never a broken flow. Never throw into a click handler.
  }
}

/** Mark that a meaningful action just happened (sessionStorage: this tab). */
export function armPushPrompt(storage: StorageLike | null, trigger: PushPromptTrigger): void {
  if (storage === null) return
  try {
    storage.setItem(PUSH_TRIGGER_KEY, trigger)
  } catch {
    // See rememberPermissionDecision.
  }
}

export function readArmedTrigger(storage: StorageLike | null): PushPromptTrigger | null {
  if (storage === null) return null
  try {
    const raw = storage.getItem(PUSH_TRIGGER_KEY)
    return raw === 'post_created' || raw === 'ping_saved' ? raw : null
  } catch {
    return null
  }
}

export function clearArmedTrigger(storage: StorageLike | null): void {
  if (storage === null) return
  try {
    storage.removeItem(PUSH_TRIGGER_KEY)
  } catch {
    // See rememberPermissionDecision.
  }
}

export const PUSH_PROMPT_REASON =
  'Get a heads-up when someone joins your drop-in, when it starts, or if it gets cancelled.'

/**
 * The pointer shown instead of a prompt, for a parent the app will never ask
 * again — the "while you were away" inbox that already exists on the feed
 * (ticket 03). This is the honest fallback: saying nothing at all would leave
 * a parent believing notifications are simply broken.
 */
export const WHILE_AWAY_POINTER =
  'While you were away: pings and cancellations also show up in the "While you were away" card at the top of your feed.'

export const DENIED_POINTER = `${WHILE_AWAY_POINTER} To change this, use your browser's site settings for Drop In.`

export const DISMISSED_POINTER = `Not now — you can turn notifications on any time from your settings. ${WHILE_AWAY_POINTER}`

export const UNSUPPORTED_POINTER = `This browser can't show notifications. ${WHILE_AWAY_POINTER}`

export interface PermissionPromptInput {
  /** What we remembered from a previous answer. */
  decision: PermissionDecision
  /** What the browser reports right now. */
  permission: BrowserPermission
  /** The meaningful action that just happened, or null (a cold load). */
  trigger: PushPromptTrigger | null
  /** Whether the app is running installed (see pushOptInGate). */
  gate: PushOptInGate
}

export interface PermissionPromptDecision {
  /** Whether the prompt may be shown. */
  ask: boolean
  /** The one-line reason shown WITH the prompt (null when we are not asking). */
  reason: string | null
  /** The fallback sentence shown INSTEAD of a prompt (null when we are asking). */
  note: string | null
}

/**
 * The single decision point for "may we ask this parent right now?" — one pure
 * function so the rule is testable rather than smeared across components.
 *
 * Order matters, and each step is a pinned requirement:
 *  1. unsupported browser  → never ask; point at the inbox.
 *  2. already granted      → never ask (there is nothing to grant).
 *  3. the gate says no     → never ask; the reason already explains itself
 *                            (iOS before install: granting would be a lie).
 *  4. denied (browser or remembered) → never ask again; point at the inbox.
 *  5. dismissed            → never ask again; point at the profile control.
 *  6. no meaningful action → never ask: THE COLD-LOAD PIN.
 *  7. otherwise            → ask, with the one-line reason.
 */
export function decidePermissionPrompt(input: PermissionPromptInput): PermissionPromptDecision {
  const no = (note: string | null): PermissionPromptDecision => ({ ask: false, reason: null, note })

  if (input.permission === 'unsupported') return no(UNSUPPORTED_POINTER)
  if (input.permission === 'granted' || input.decision === 'granted') return no(null)
  if (!input.gate.allowed) return no(input.gate.reason)
  if (input.permission === 'denied' || input.decision === 'denied') return no(DENIED_POINTER)
  if (input.decision === 'dismissed') return no(DISMISSED_POINTER)
  if (input.trigger === null) return no(null)

  return { ask: true, reason: PUSH_PROMPT_REASON, note: null }
}

/** `Notification.permission` (or the absence of `Notification`) → our shape. */
export function browserPermissionOf(value: string | null | undefined): BrowserPermission {
  return value === 'granted' || value === 'denied' || value === 'default' ? value : 'unsupported'
}

// ---------------------------------------------------------------------------
// The /profile opt-in CONTROL — deliberately NOT the prompt rule above.
//
// These are two different questions and conflating them is a real bug, which is
// why they are two functions with two names:
//
//  * decidePermissionPrompt answers "may we INTERRUPT this parent with a
//    prompt?" — one shot, after a meaningful action, never twice, and once
//    permission is granted there is nothing left to ask for.
//  * decideOptInControl answers "should this parent SEE the button that turns
//    notifications on or off?" — a permanent control they can change their mind
//    with. The section's own copy promises "You can turn them back on here any
//    time", so this control must appear whenever the device is genuinely not
//    registered, no matter what the prompt rule thinks.
//
// The bug this seam exists to prevent: gating the control on the prompt rule
// made the opt-in ONE-WAY. "Turn off" remembers 'dismissed' (so the floating
// prompt never nags) while leaving `Notification.permission === 'granted'`, and
// the prompt rule short-circuits on both — so the section rendered "You can
// turn them back on here any time" with no button anywhere. The same dead end
// caught a parent who re-granted permission in the browser's own settings
// (granted + zero rows).
// ---------------------------------------------------------------------------

/**
 * Whether this device is actually registered for push, as far as the app can
 * tell: 'registered' only when the `push_subscriptions` read SUCCEEDED and
 * returned a row for this profile. An unknown read ('unknown') must never be
 * treated as "registered" (that would claim "on" without a row) nor as "not
 * registered" in a way that hides the failure — the section reports the read
 * failure in its own sentence.
 */
export type OptInRegistration = 'registered' | 'none' | 'unknown'

export interface OptInControlInput {
  /** What the browser reports right now. */
  permission: BrowserPermission
  /** What we remembered from a previous answer. */
  decision: PermissionDecision
  /** Whether the opt-in is possible on this device at all (see pushOptInGate). */
  gate: PushOptInGate
  /** Whether a `push_subscriptions` row exists for this profile/device. */
  registration: OptInRegistration
}

export interface OptInControlDecision {
  /** Whether the "Turn on notifications" button is drawn. */
  offer: boolean
  /** The one-line reason shown WITH the button (null when not offering). */
  reason: string | null
  /** The sentence shown INSTEAD of the button (null when offering, or when
   *  there is nothing honest to say — a registered device needs no note). */
  note: string | null
}

/**
 * Order matters here too:
 *  1. a browser that cannot do notifications → no button, point at the inbox.
 *  2. already registered        → no button (the section renders the "on"
 *                                 state, with its "Turn off" control).
 *  3. the gate says no          → no button; the reason says what to do.
 *  4. denied (browser or ours)  → no button: the browser will not show the
 *                                 prompt again, so a button here would be a
 *                                 silent no-op. The note names the one real
 *                                 route back (the browser's site settings).
 *  5. otherwise                 → OFFER. Includes the 'dismissed' decision
 *                                 (that IS what "Turn off" writes) and a
 *                                 permission already granted with no row.
 */
export function decideOptInControl(input: OptInControlInput): OptInControlDecision {
  const no = (note: string | null): OptInControlDecision => ({ offer: false, reason: null, note })

  if (input.permission === 'unsupported') return no(UNSUPPORTED_POINTER)
  if (input.registration === 'registered') return no(null)
  if (!input.gate.allowed) return no(input.gate.reason)
  if (input.permission === 'denied' || input.decision === 'denied') return no(DENIED_POINTER)
  return { offer: true, reason: PUSH_PROMPT_REASON, note: null }
}

// ---------------------------------------------------------------------------
// Per-kind mutes.
//
// Stored locally and enforced by the SERVICE WORKER (see src/sw.ts): a muted
// kind is still delivered over the wire and dropped on the device, so the
// parent never sees it. Gating the sender per kind would need a third table
// (profile × kind) and 0031/0032 are the only migrations this ticket may add —
// the accepted residual is written down in 0032's header.
// ---------------------------------------------------------------------------

export interface PushPrefs {
  muted: NotificationKind[]
}

export const DEFAULT_PUSH_PREFS: PushPrefs = { muted: [] }

/** A garbage or absent value reads as "nothing muted" — fail OPEN, so a
 *  storage problem can never silently swallow a cancellation. */
export function parsePushPrefs(raw: string | null | undefined): PushPrefs {
  if (raw === null || raw === undefined || raw === '') return DEFAULT_PUSH_PREFS
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_PUSH_PREFS
    const muted = (parsed as { muted?: unknown }).muted
    if (!Array.isArray(muted)) return DEFAULT_PUSH_PREFS
    return { muted: NOTIFICATION_KINDS.filter((kind) => muted.includes(kind)) }
  } catch {
    return DEFAULT_PUSH_PREFS
  }
}

export function serializePushPrefs(prefs: PushPrefs): string {
  return JSON.stringify({ muted: prefs.muted })
}

export function isKindMuted(prefs: PushPrefs, kind: NotificationKind): boolean {
  return prefs.muted.includes(kind)
}

export function setKindMuted(prefs: PushPrefs, kind: NotificationKind, muted: boolean): PushPrefs {
  const next = new Set(prefs.muted)
  if (muted) next.add(kind)
  else next.delete(kind)
  return { muted: NOTIFICATION_KINDS.filter((candidate) => next.has(candidate)) }
}

/**
 * The service worker cannot read localStorage, so the client also publishes
 * the prefs as a tiny JSON response in this Cache Storage bucket and the SW
 * reads it inside its `push` handler. Both ends import these two constants —
 * a rename cannot desynchronise them.
 */
export const PUSH_PREFS_CACHE = 'dropin-push-prefs'
export const PUSH_PREFS_CACHE_URL = '/push-prefs.json'

/**
 * The messages the app posts TO the service worker. Declared here (not in
 * `src/sw.ts`) so both sides type against ONE definition while the app build
 * never has to typecheck the worker's `webworker` lib.
 *
 * `push-armed` used to live here and was never sent by anything — the armed
 * trigger is a sessionStorage fact the app reads itself (see
 * `armPushPrompt`). Removed rather than left as a second, imaginary channel.
 */
export type ServiceWorkerMessage = { type: 'push-prefs-changed'; prefs: PushPrefs }

/** The new subscription's JSON, narrowed to the two fields the row needs. */
export interface RotatedSubscription {
  endpoint?: string
  keys?: Record<string, string>
}

/**
 * The one message the service worker posts BACK to the app: the browser rotated
 * this device's subscription behind our back (`pushsubscriptionchange`, see
 * src/sw.ts). The worker cannot write `push_subscriptions` itself — the table
 * is owner-only and the worker has no session — so it hands the new endpoint to
 * an open window, which writes the row under the parent's own JWT.
 *
 * Without a client listening for this, the rotation was silent: the sender
 * would keep posting to the dead endpoint, the push service would answer 410,
 * and the sender would PRUNE the row — leaving an opted-in parent with no row
 * and no pushes, permanently. `startPushSubscriptionRepair()`
 * (src/lib/pushClient.ts) is the listener, and it also covers the no-window-open
 * case by re-registering on app open.
 */
export interface RotatedSubscriptionMessage {
  type: 'push-subscription-changed'
  subscription: RotatedSubscription | null
}

/** Everything either end of the channel can send. */
export type ServiceWorkerInboundMessage = ServiceWorkerMessage | RotatedSubscriptionMessage

/**
 * A VAPID public key (base64url, unpadded) as the `applicationServerKey` bytes
 * `pushManager.subscribe` wants. Pure and unit-tested because getting this
 * wrong produces a subscription the push service refuses with an opaque error.
 */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

/** How many log rows the /profile fallback list shows. */
export const RECENT_NOTIFICATIONS_LIMIT = 5

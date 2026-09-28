/**
 * Web push, the browser-touching half (V8 ticket 08).
 *
 * Everything in this file talks to `navigator`/`localStorage`/`caches` and is
 * therefore NOT unit-tested — the RULES it applies all live in `src/lib/push.ts`
 * as pure functions with a vitest spec, and this file only wires them to the
 * browser. Keep it that way: if a decision appears below (should we ask? is
 * this iOS? which kind is muted?), it belongs in push.ts instead.
 *
 * The three flows:
 *   enablePush()                  the ONE opt-in path, used by both the /settings
 *                                 button and the post-action prompt.
 *   disablePush()                 "Turn off": delete the rows, unsubscribe the
 *                                 browser, and remember not to ask again.
 *   startPushSubscriptionRepair() the self-healing repair on app open: the
 *                                 `pushsubscriptionchange` listener plus
 *                                 refreshPushSubscription() (see src/sw.ts).
 */
import {
  DENIED_POINTER,
  DISMISSED_POINTER,
  PUSH_PREFS_CACHE,
  PUSH_PREFS_CACHE_URL,
  PUSH_PREFS_KEY,
  armPushPrompt,
  armPushPromptOrigin,
  browserPermissionOf,
  base64UrlToBytes,
  clearArmedTrigger,
  installSurface,
  isKindMuted,
  isStandalone,
  migrateLegacyDecisionOnce,
  parsePushPrefs,
  pushOptInGate,
  readArmedOrigin,
  readArmedTrigger,
  readOfferedTriggers,
  readPermissionDecision,
  rememberPermissionDecision,
  rememberTriggerOffered,
  serializePushPrefs,
  setKindMuted,
  setQuietHours,
  type BrowserPermission,
  type DeviceFacts,
  type InstallSurface,
  type NotificationKind,
  type PermissionDecision,
  type PushPrefs,
  type PushPromptTrigger,
  type QuietHours,
  type RotatedSubscriptionMessage,
  type ServiceWorkerMessage,
  type StorageLike,
} from './push'
import {
  deletePushSubscriptionsForProfile,
  savePushSubscription,
} from './db'

/** The non-standard install event (Chromium only; not in lib.dom). */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// ---------------------------------------------------------------------------
// Storage, defensively. Private mode and hardened privacy settings make both
// storages throw on ACCESS (not just on write), so every read goes through
// these two.
// ---------------------------------------------------------------------------

export function localStore(): StorageLike | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function sessionStore(): StorageLike | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Device facts — read once, here, and passed to the pure seams.
// ---------------------------------------------------------------------------

export function deviceFacts(): DeviceFacts {
  return {
    userAgent: navigator.userAgent ?? '',
    platform: navigator.platform ?? '',
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
  }
}

export function runningStandalone(): boolean {
  let displayMode = false
  try {
    displayMode = window.matchMedia('(display-mode: standalone)').matches
  } catch {
    displayMode = false
  }
  const navigatorStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return isStandalone(displayMode, navigatorStandalone)
}

/** True when this browser can do web push at all (feature detect, no sniffing). */
export function pushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof Notification !== 'undefined' &&
    typeof window !== 'undefined' &&
    'PushManager' in window
  )
}

export function currentPermission(): BrowserPermission {
  if (!pushSupported()) return 'unsupported'
  return browserPermissionOf(Notification.permission)
}

/** The deployment's VAPID public key, baked at build time (see docs/push-setup.md). */
export function vapidPublicKey(): string {
  return (import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '') as string
}

// ---------------------------------------------------------------------------
// The deferred install prompt (Android / desktop Chromium).
//
// Captured once, at module start (main.tsx calls captureInstallPrompt()) —
// the event can fire before any component mounts, so a listener inside a
// component would miss it.
// ---------------------------------------------------------------------------

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null
const installListeners = new Set<() => void>()

/**
 * Whether the app is allowed to TAKE the browser's own install banner away.
 *
 * `preventDefault()` on `beforeinstallprompt` is a trade: the browser's banner
 * stops appearing and our own button becomes the only way to install. That is
 * the right trade on the authed surface, where `/settings` → Notifications
 * really does render "Add Drop In to your Home Screen" (backed by the deferred
 * event). It is the wrong trade on the PUBLIC surface — a signed-out visitor
 * reading a shared drop-in link had the banner suppressed with no button
 * anywhere to replace it. So the interception is gated here, on whether the
 * app currently has a session, and the listener stays registered either way
 * (the event fires once per document load, so a listener added later would
 * simply miss it).
 */
let installCaptureEnabled = false

/** Called by the shell: an authed session may intercept, a signed-out visitor may not. */
export function setInstallCaptureEnabled(enabled: boolean): void {
  installCaptureEnabled = enabled
}

export function captureInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Not signed in (or the shell has not settled): leave the browser's own
    // install affordance alone rather than suppressing it for nothing.
    if (!installCaptureEnabled) return
    // Suppressing the default is what turns the banner into a deferred prompt
    // our own button can fire — without it Chromium shows its own mini-infobar
    // and the event is gone.
    event.preventDefault()
    deferredInstallPrompt = event as BeforeInstallPromptEvent
    for (const listener of installListeners) listener()
  })
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null
    for (const listener of installListeners) listener()
  })
}

export function subscribeInstallPrompt(listener: () => void): () => void {
  installListeners.add(listener)
  return () => installListeners.delete(listener)
}

export function hasDeferredInstallPrompt(): boolean {
  return deferredInstallPrompt !== null
}

/** Fire the deferred prompt; returns what the user chose (or null if it is
 *  gone — it is single-use). */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | null> {
  const event = deferredInstallPrompt
  if (event === null) return null
  deferredInstallPrompt = null
  try {
    await event.prompt()
    return (await event.userChoice).outcome
  } catch {
    return null
  }
}

/** Which install affordance belongs on /settings right now. */
export function currentInstallSurface(): InstallSurface {
  return installSurface({
    ...deviceFacts(),
    standalone: runningStandalone(),
    hasInstallPrompt: hasDeferredInstallPrompt(),
  })
}

/**
 * The iOS card is dismissible and shown ONCE (the ticket's pin): a parent who
 * has read "Share → Add to Home Screen" should never be told twice. Stored
 * locally next to the permission decision, with the same fail-safe reads — an
 * unreadable storage shows the card again (harmless) rather than throwing.
 */
export const IOS_CARD_DISMISSED_KEY = 'dropin.push.ios-card'

export function iosInstallCardDismissed(): boolean {
  const store = localStore()
  if (store === null) return false
  try {
    return store.getItem(IOS_CARD_DISMISSED_KEY) === 'dismissed'
  } catch {
    return false
  }
}

export function dismissIosInstallCard(): void {
  const store = localStore()
  if (store === null) return
  try {
    store.setItem(IOS_CARD_DISMISSED_KEY, 'dismissed')
  } catch {
    // Not remembered: the card shows once more. Cosmetic, never broken.
  }
}

// ---------------------------------------------------------------------------
// Per-kind prefs: localStorage for the UI, plus a cached JSON copy the service
// worker can read (it cannot see localStorage), mirrored through Cache Storage
// and a postMessage for good measure.
// ---------------------------------------------------------------------------

export function readPushPrefs(): PushPrefs {
  const store = localStore()
  if (store === null) return parsePushPrefs(null)
  try {
    return parsePushPrefs(store.getItem(PUSH_PREFS_KEY))
  } catch {
    return parsePushPrefs(null)
  }
}

export async function writePushPrefs(prefs: PushPrefs): Promise<void> {
  const store = localStore()
  if (store !== null) {
    try {
      store.setItem(PUSH_PREFS_KEY, serializePushPrefs(prefs))
    } catch {
      // A read-only storage means the mute is not remembered. Nothing to do.
    }
  }
  // The cache entry is what the SW actually reads in its `push` handler.
  try {
    const cache = await caches.open(PUSH_PREFS_CACHE)
    await cache.put(
      PUSH_PREFS_CACHE_URL,
      new Response(serializePushPrefs(prefs), {
        headers: { 'content-type': 'application/json' },
      }),
    )
  } catch {
    // Cache Storage unavailable (or unavailable right now) — the SW falls back
    // to "nothing muted" (fail OPEN), so nothing is silently swallowed.
  }
  await messageServiceWorker({ type: 'push-prefs-changed', prefs })
}

export function toggleKindMuted(kind: NotificationKind): PushPrefs {
  const current = readPushPrefs()
  const next = setKindMuted(current, kind, !isKindMuted(current, kind))
  void writePushPrefs(next)
  return next
}

/** Persist a new quiet-hours window (same storage + SW mirror as the mutes). */
export function saveQuietHours(quiet: QuietHours): PushPrefs {
  const next = setQuietHours(readPushPrefs(), quiet)
  void writePushPrefs(next)
  return next
}

async function messageServiceWorker(message: ServiceWorkerMessage): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.ready
    registration.active?.postMessage(message)
  } catch {
    // No active worker yet: the cache write above is what the SW reads.
  }
}

// ---------------------------------------------------------------------------
// The armed trigger (see src/lib/push.ts for why it is separate from the
// decision).
//
// The trigger is a sessionStorage fact, but it is WRITTEN by a page's event
// handler and READ by the prompt in the shell — a different part of the tree
// (the prompt sits outside <Outlet/>), and the page does not always navigate
// afterwards (a ping saved from a feed card never does). A storage write is
// invisible to React, so the write also publishes to this in-process listener
// set: that is the prompt's observation path, and it is what makes a saved ping
// show the prompt at all rather than only a created post (which navigates).
// ---------------------------------------------------------------------------

const armListeners = new Set<() => void>()

/** Watch for a meaningful action being recorded (returns an unsubscribe). */
export function subscribePushArmed(listener: () => void): () => void {
  armListeners.add(listener)
  return () => {
    armListeners.delete(listener)
  }
}

function notifyArmed(): void {
  for (const listener of armListeners) {
    try {
      listener()
    } catch {
      // A broken listener must never break the write the parent just made.
    }
  }
}

/**
 * Arm the prompt for a meaningful action, recording WHERE it happened (first-use
 * audit, ticket 03). `originPath` defaults to the live location so every arm site
 * records the fact without each page having to pass it; `PushOptInPrompt` uses it
 * to keep the prompt off a drop-in's detail page, where the RSVP confirmation is
 * the moment the parent just earned.
 */
export function armPushPromptForAction(trigger: PushPromptTrigger, originPath?: string): void {
  const origin =
    originPath ?? (typeof window === 'undefined' ? null : window.location.pathname)
  armPushPrompt(sessionStore(), trigger)
  if (origin !== null) armPushPromptOrigin(sessionStore(), origin)
  notifyArmed()
}

export function armedPushTrigger(): PushPromptTrigger | null {
  return readArmedTrigger(sessionStore())
}

/**
 * The trigger points already OFFERED to this parent (localStorage, permanent —
 * see the offered-set section in src/lib/push.ts). Read by the prompt as one of
 * the facts the pure decision seam judges.
 */
export function offeredPushPoints(): PushPromptTrigger[] {
  return readOfferedTriggers(localStore())
}

/**
 * Record that this point has been put in front of the parent. Written the
 * moment the card is drawn (the point IS offered then) — deliberately WITHOUT
 * notifying the prompt's own listeners: the card that is up must not unmount
 * itself. The next fact re-read sees it and stops asking.
 */
export function markPushPointOffered(trigger: PushPromptTrigger): void {
  rememberTriggerOffered(localStore(), trigger)
}

/** The route the still-armed action happened on, or null when unknown. */
export function armedPushOrigin(): string | null {
  return readArmedOrigin(sessionStore())
}

/**
 * "Not now": remember that THIS point has been offered — for this point only
 * (V25 ticket 15's re-ask rule). A parent who says not-now at signup is still
 * asked after their first post and again when they say they are going.
 *
 * TWO THINGS IT DELIBERATELY DOES NOT DO:
 *
 *  * It does NOT write the 'dismissed' decision. That value is now the GLOBAL
 *    answer — "Turn off notifications" in /settings (see disablePush) — and a
 *    global dismissal here is exactly what made a not-now at one point cancel
 *    every later point. The per-point fact lives in the offered set instead.
 *    (Fix round, finding 1: the /settings off-switch is now the ONLY writer of
 *    'dismissed'. A dismissed OS dialog no longer writes it either — see
 *    enablePush — and a legacy value from the pre-ticket-15 prompt is reset once
 *    by migrateLegacyDecisionOnce, so this comment is true rather than intended.)
 *  * It does NOT leave the armed trigger standing. The point is spent, so the
 *    action that armed it has been consumed; the prompt's note (the pinned
 *    "you can turn them on any time from your settings …" sentence) is held by
 *    the caller for this render rather than derived from the stored trigger.
 */
export function dismissPushPrompt(trigger: PushPromptTrigger): void {
  markPushPointOffered(trigger)
  clearArmedTrigger(sessionStore())
  notifyArmed()
}

/**
 * Stand the trigger down WITHOUT remembering a decision — used by the prompt
 * after it has said its fallback sentence instead of asking. The parent's
 * answer (denied / dismissed) is already remembered by then; this only stops
 * the sentence from following them around for the rest of the tab session.
 * Deliberately does not notify: the caller is the listener.
 */
export function clearArmedPushPrompt(): void {
  clearArmedTrigger(sessionStore())
}

/** The gate (iOS needs the installed app) for the CURRENT device. */
export function currentOptInGate() {
  return pushOptInGate({ ...deviceFacts(), standalone: runningStandalone() })
}

/**
 * The browser half of `decidePermissionPrompt`: read the decision, running the
 * one-time legacy migration first (V25 ticket 15, fix round) so a parent who
 * dismissed the OLD prompt (a legacy 'dismissed') is not silently locked out of
 * the three-moment feature. Every decision read in the browser goes through
 * here (the prompt component, the /settings control, and the repair path), so
 * the migration runs once before the first real read.
 */
export function currentDecision(): PermissionDecision {
  migrateLegacyDecisionOnce(localStore())
  return readPermissionDecision(localStore())
}

// ---------------------------------------------------------------------------
// The three flows.
// ---------------------------------------------------------------------------

export type PushEnableResult =
  | { ok: true; endpoint: string }
  | { ok: false; reason: 'unsupported' | 'denied' | 'dismissed' | 'error'; message: string }

function describeError(error: unknown): string {
  if (error instanceof Error && error.message !== '') return error.message
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { message?: unknown; code?: unknown }
    if (typeof candidate.message === 'string' && candidate.message !== '') return candidate.message
    if (typeof candidate.code === 'string' && candidate.code !== '') return candidate.code
  }
  return 'unknown error'
}

/**
 * The ONE opt-in path: ask the browser, subscribe, and write the row.
 *
 * Both entry points use it — the /settings "Turn on notifications" button and
 * the post-action prompt — because "how do we turn this on" must have exactly
 * one implementation. Permission is requested FIRST so a denial costs nothing
 * else; the row is written LAST so the UI can never claim "on" without a row
 * (which is precisely the state the pre-apply red e2e spec pins).
 *
 * A denial is REMEMBERED ('denied'), so the prompt never nags. A dismissed
 * dialog is NOT remembered (fix round, finding 1): the parent merely closed the
 * OS box, and remembering that as 'dismissed' would silence the three-moment
 * feature forever — 'dismissed' is written only by the /settings off-switch
 * (disablePush, below).
 */
export async function enablePush(): Promise<PushEnableResult> {
  if (!pushSupported()) {
    return {
      ok: false,
      reason: 'unsupported',
      message: 'This browser cannot show notifications. The feed\'s "While you were away" card still covers you.',
    }
  }

  let permission: NotificationPermission
  try {
    permission = await Notification.requestPermission()
  } catch (error) {
    return { ok: false, reason: 'error', message: `The browser refused the request (${describeError(error)}).` }
  }

  if (permission === 'denied') {
    rememberPermissionDecision(localStore(), 'denied')
    return { ok: false, reason: 'denied', message: DENIED_POINTER }
  }
  if (permission !== 'granted') {
    // A DISMISSED DIALOG IS NOT REMEMBERED (fix round, finding 1). The parent
    // merely closed the OS box; remembering it as 'dismissed' would silence the
    // three-moment feature forever. 'dismissed' is written only by the
    // /settings off-switch (disablePush, below) — nothing is remembered here.
    return { ok: false, reason: 'dismissed', message: DISMISSED_POINTER }
  }

  rememberPermissionDecision(localStore(), 'granted')

  try {
    const registration = await navigator.serviceWorker.ready
    const existing = await registration.pushManager.getSubscription()
    const key = vapidPublicKey()
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        // Without a configured VAPID key we still subscribe: the protocol
        // allows it, so the opt-in is recorded and starts working the moment
        // the human-owned sender exists (docs/push-setup.md). With a key the
        // subscription is bound to it — the stronger posture.
        ...(key === '' ? {} : { applicationServerKey: base64UrlToBytes(key) }),
      }))

    const json = subscription.toJSON()
    await writeSubscriptionRow(json)
    const endpoint = json.endpoint ?? ''

    clearArmedTrigger(sessionStore())
    return { ok: true, endpoint }
  } catch (error) {
    return {
      ok: false,
      reason: 'error',
      message: `Couldn't finish turning on notifications (${describeError(error)}).`,
    }
  }
}

/**
 * "Turn off notifications": delete this profile's rows, then drop the browser
 * subscription. Rows first — the DB is what actually stops the pushes, and if
 * the unsubscribe then fails we are still genuinely off. The decision becomes
 * 'dismissed' so the post-action prompt does not immediately offer to undo it.
 *
 * 'dismissed' is about the PROMPT, not about the control: /settings's opt-in
 * button is gated on the real registration (see decideOptInControl), so
 * "Turn off" stays reversible — which is what its own copy promises.
 */
export async function disablePush(): Promise<void> {
  await deletePushSubscriptionsForProfile()
  rememberPermissionDecision(localStore(), 'dismissed')
  clearArmedTrigger(sessionStore())
  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (subscription !== null) await subscription.unsubscribe()
  } catch {
    // The row is gone, which is the part that matters.
  }
}

/**
 * Write the row for a subscription the app already holds — the one tail shared
 * by `enablePush` and both repair paths, so every write of
 * `push_subscriptions` goes through `savePushSubscription`'s own-row check
 * (a RETURNING read of what the statement actually wrote, src/lib/db.ts) rather
 * than one path trusting itself.
 *
 * Throws on a subscription with no endpoint (the browser handed us something
 * unsendable) and on a failed write; callers decide whether that is an error
 * the parent should see (the opt-in) or a repair that will simply retry (the
 * rotation paths).
 */
async function writeSubscriptionRow(json: {
  endpoint?: string
  keys?: Record<string, string>
}): Promise<void> {
  const endpoint = json.endpoint
  if (endpoint === undefined || endpoint === '') {
    throw new Error('The browser returned a subscription with no endpoint')
  }
  await savePushSubscription({
    endpoint,
    p256dh: json.keys?.p256dh ?? null,
    auth: json.keys?.auth ?? null,
    userAgent: navigator.userAgent ?? null,
  })
}

/**
 * The gate shared by both repair paths: push must work, the BROWSER must still
 * be granting, and this parent must not have turned notifications off.
 *
 * `'dismissed'` is exactly what "Turn off" remembers, so it blocks the repair
 * (never resurrect a device the parent switched off, even if the browser kept
 * the subscription because `unsubscribe()` failed). `'unknown'` does NOT block
 * it: a parent whose localStorage was cleared still has a granted permission
 * and a live subscription, and the row they own is what makes the sender able
 * to reach them. It never CREATES a subscription in any case — both callers
 * require one the browser already holds.
 */
function mayRepair(): boolean {
  if (!pushSupported()) return false
  if (Notification.permission !== 'granted') return false
  const decision = currentDecision()
  return decision !== 'dismissed' && decision !== 'denied'
}

/**
 * On app open: if this parent is opted in AND the browser still holds a
 * subscription, re-write the row. This is the repair path for a subscription
 * the browser rotated while no tab was open — `last_seen_at` also tells a human
 * which devices are genuinely alive.
 */
export async function refreshPushSubscription(): Promise<boolean> {
  if (!mayRepair()) return false

  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (subscription === null) return false
    await writeSubscriptionRow(subscription.toJSON())
    return true
  } catch {
    return false
  }
}

/**
 * The client half of `pushsubscriptionchange` (see RotatedSubscriptionMessage
 * in src/lib/push.ts): the worker hands us the NEW subscription it just made
 * and we persist it under the parent's own JWT. This is the repair that makes
 * the rotation self-healing while a tab IS open.
 */
async function handleRotatedSubscription(message: RotatedSubscriptionMessage): Promise<boolean> {
  if (!mayRepair()) return false
  if (message.subscription === null) return false
  try {
    await writeSubscriptionRow(message.subscription)
    return true
  } catch {
    // The row for the new endpoint could not be written (offline, RLS, or the
    // endpoint belongs to another profile on this device):
    // `refreshPushSubscription` on the next app open is the retry.
    return false
  }
}

/**
 * Start watching for a rotation and repair this device once, now. Called by the
 * authed shell on every app open (`src/App.tsx`); returns an unsubscribe.
 *
 * Without this the rotation was silent and terminal: the sender kept posting to
 * the dead endpoint, the push service answered 410, and the sender pruned the
 * row — leaving an opted-in parent with no row and no pushes, with nothing in
 * the app that would ever notice.
 */
export function startPushSubscriptionRepair(): () => void {
  const onMessage = (event: MessageEvent) => {
    const message = event.data as RotatedSubscriptionMessage | null
    if (message === null || typeof message !== 'object') return
    if (message.type !== 'push-subscription-changed') return
    void handleRotatedSubscription(message).catch(() => false)
  }

  try {
    navigator.serviceWorker?.addEventListener('message', onMessage)
  } catch {
    // No service worker container (an insecure origin): nothing to listen to.
  }

  // The no-window-open case: the rotation happened while the app was closed, so
  // there is no message to receive — re-register instead.
  void refreshPushSubscription().catch(() => false)

  return () => {
    try {
      navigator.serviceWorker?.removeEventListener('message', onMessage)
    } catch {
      // See above.
    }
  }
}

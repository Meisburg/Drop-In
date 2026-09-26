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
// What the app calls the five kinds (the /settings toggle rows).
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
  ended: {
    label: 'Ended',
    when: 'A host ends a drop-in you joined early — before you drive out.',
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

/**
 * The three meaningful moments a prompt may follow (V25 ticket 15 — the
 * founder's three trigger points, in his order): the account they just
 * created, the drop-in they just posted, and the RSVP they just gave.
 */
export type PushPromptTrigger = 'signup' | 'post_created' | 'ping_saved'

export const PUSH_PROMPT_TRIGGERS: readonly PushPromptTrigger[] = [
  'signup',
  'post_created',
  'ping_saved',
]

export function isPushPromptTrigger(value: unknown): value is PushPromptTrigger {
  return value === 'signup' || value === 'post_created' || value === 'ping_saved'
}

export const PUSH_DECISION_KEY = 'dropin.push.decision'
export const PUSH_TRIGGER_KEY = 'dropin.push.trigger'
/**
 * WHERE the armed action happened (sessionStorage, this tab). A separate key
 * from the trigger so the trigger's own contract — and every reader of it — is
 * unchanged: this one only ever ADDS a fact (the RSVP-priority deferral), and a
 * missing value reads as "unknown origin", which preserves the old behavior.
 */
export const PUSH_TRIGGER_ORIGIN_KEY = 'dropin.push.trigger.origin'
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
    return isPushPromptTrigger(raw) ? raw : null
  } catch {
    return null
  }
}

/**
 * Record the route the meaningful action happened on. Kept SEPARATE from the
 * trigger so a storage that refuses this write still leaves the prompt fully
 * working (it simply cannot defer) — the deferral is an improvement, never a
 * dependency.
 */
export function armPushPromptOrigin(storage: StorageLike | null, pathname: string): void {
  if (storage === null) return
  try {
    storage.setItem(PUSH_TRIGGER_ORIGIN_KEY, pathname)
  } catch {
    // See rememberPermissionDecision.
  }
}

export function readArmedOrigin(storage: StorageLike | null): string | null {
  if (storage === null) return null
  try {
    const raw = storage.getItem(PUSH_TRIGGER_ORIGIN_KEY)
    return raw === null || raw === '' ? null : raw
  } catch {
    return null
  }
}

export function clearArmedTrigger(storage: StorageLike | null): void {
  if (storage === null) return
  try {
    storage.removeItem(PUSH_TRIGGER_KEY)
    storage.removeItem(PUSH_TRIGGER_ORIGIN_KEY)
  } catch {
    // See rememberPermissionDecision.
  }
}

// ---------------------------------------------------------------------------
// WHICH POINTS HAVE ALREADY BEEN OFFERED (localStorage, permanent).
//
// The ticket's re-ask rule, stored as one fact per trigger point: "A decline at
// a trigger point is remembered for THAT trigger point only — 'Not now' at
// signup does not cancel the after-first-post ask or the going-to-an-event ask.
// Each point is offered at most once."
//
// It is a SEPARATE key from the decision on purpose, and conflating the two is
// the bug this section exists to prevent:
//
//  * PUSH_DECISION_KEY is the parent's ANSWER ('denied' / 'dismissed' /
//    'granted'). 'dismissed' is written by "Turn off notifications" in
//    /settings, and that answer IS global — a parent who switched notifications
//    off in Settings has said no to all of it, not to one card.
//  * PUSH_OFFERED_KEY is which of the three MOMENTS have been put in front of
//    them. A point in this set is never offered again; a point outside it still
//    is, even after a "Not now" somewhere else.
// ---------------------------------------------------------------------------

export const PUSH_OFFERED_KEY = 'dropin.push.offered'

/** A missing or garbage value reads as "no point offered yet". */
export function parseOfferedTriggers(raw: string | null | undefined): PushPromptTrigger[] {
  if (raw === null || raw === undefined || raw === '') return []
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(isPushPromptTrigger)
}

/** Always in the founder's order, without duplicates — the one canonical form. */
export function serializeOfferedTriggers(triggers: readonly PushPromptTrigger[]): string {
  return PUSH_PROMPT_TRIGGERS.filter((trigger) => triggers.includes(trigger)).join(',')
}

/** The same list with one more point on it. Pure, so the merge is testable. */
export function addOfferedTrigger(
  offered: readonly PushPromptTrigger[],
  trigger: PushPromptTrigger,
): PushPromptTrigger[] {
  return PUSH_PROMPT_TRIGGERS.filter(
    (candidate) => candidate === trigger || offered.includes(candidate),
  )
}

export function readOfferedTriggers(storage: StorageLike | null): PushPromptTrigger[] {
  if (storage === null) return []
  try {
    return parseOfferedTriggers(storage.getItem(PUSH_OFFERED_KEY))
  } catch {
    return []
  }
}

export function rememberTriggerOffered(
  storage: StorageLike | null,
  trigger: PushPromptTrigger,
): void {
  if (storage === null) return
  try {
    // Read-then-merge-then-write, so the whole set survives: writing only the
    // new point would erase the points offered earlier in this parent's life.
    const next = addOfferedTrigger(readOfferedTriggers(storage), trigger)
    storage.setItem(PUSH_OFFERED_KEY, serializeOfferedTriggers(next))
  } catch {
    // See rememberPermissionDecision: an unwritable storage means the point may
    // be offered once more, which is cosmetic — never a broken flow.
  }
}

/** Whether this point is already spent (null trigger = a cold load, never). */
export function hasOfferedTrigger(
  offered: readonly PushPromptTrigger[],
  trigger: PushPromptTrigger | null,
): boolean {
  return trigger !== null && offered.includes(trigger)
}

export const PUSH_PROMPT_REASON =
  'Get a heads-up when someone joins your drop-in, when it starts, or if it gets cancelled.'

/**
 * The reason shown with the going-to-an-event prompt (V25 ticket 15, trigger 3),
 * in the founder's own terms: asking when a parent saves a "going" is asking so
 * "you could get updates on the event, like comments or if it gets cancelled or
 * whatever." The sentence names both things they actually get.
 */
export const PING_PROMPT_REASON =
  'You’re going — turn these on and we’ll tell you about new comments, or if it gets cancelled.'

/**
 * The one-line reason shown WITH the prompt for a given point. Pure and total,
 * so a new trigger point cannot ship without a sentence.
 */
export function promptReasonFor(trigger: PushPromptTrigger): string {
  return trigger === 'ping_saved' ? PING_PROMPT_REASON : PUSH_PROMPT_REASON
}

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
  /**
   * The route the meaningful action happened ON, when it is known (the first-use
   * audit's deferral, ticket 03). A ping saved on a drop-in's detail page must
   * not have the prompt land on top of the RSVP confirmation the parent just
   * earned; it waits until the parent is somewhere else. Missing/unknown origin
   * keeps today's behavior — never silently drop a legitimate prompt.
   */
  origin?: string | null
  /**
   * The route the prompt would appear on RIGHT NOW (the live pathname). The
   * deferral above is about the RSVP confirmation's screen, not about the
   * action: it holds while the parent is still on a drop-in's detail page, and
   * the next non-detail visit asks instead. Missing reads as "still there",
   * which is the conservative direction for a deferral.
   */
  currentPath?: string | null
  /**
   * The points already put in front of this parent (see readOfferedTriggers).
   * Absent reads as "none offered yet" — today's behavior — so a caller that has
   * not been taught the per-point memory cannot silence a point by omission.
   */
  offered?: readonly PushPromptTrigger[]
  /** Whether the app is running installed (see pushOptInGate). */
  gate: PushOptInGate
}

/**
 * Whether a route is a drop-in's DETAIL page — the one surface whose immediate
 * confirmation (`✓ Going`, the count, "You") a notification prompt must not
 * compete with. `/playdate/:id/edit` is a different surface (the host's form)
 * and is deliberately NOT included.
 */
export function isPlaydateDetailPath(pathname: string | null | undefined): boolean {
  if (typeof pathname !== 'string') return false
  return /^\/playdate\/[^/]+\/?$/.test(pathname)
}

/**
 * The routes the prompt never occupies at all (V25 ticket 15).
 *
 *  * `/settings` — the control's own home. The Notifications section IS the
 *    durable switch; a floating opt-in card there would be two controls for one
 *    answer (this is where the suppression has always lived).
 *  * `/onboarding` — a setup flow the app itself navigates out of. A point is
 *    SPENT the moment it is offered (see the offered set below), so a card drawn
 *    on the location step would be spent by the app's own "Continue" tap before
 *    the parent could answer it. The ticket's own fallback for trigger point 1
 *    is "the first signed-in surface": onboarding is a step, not that surface,
 *    and the feed immediately behind it is.
 *  * `/new` — the composer, for the same reason. The post point is ARMED while
 *    the form is submitting and the app then navigates to the feed by itself, so
 *    a card drawn over the composer would be spent before the parent ever read
 *    it (found by this slice's browser lane: the feed showed no card at all).
 *    The moment the ticket names is "after a first post", and the feed behind
 *    the composer is where that moment lives.
 */
export function isPromptSuppressedPath(pathname: string | null | undefined): boolean {
  return pathname === '/settings' || pathname === '/onboarding' || pathname === '/new'
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
 * Whether the RSVP-priority deferral applies RIGHT NOW.
 *
 * True when the meaningful action happened on a drop-in's detail page AND the
 * parent has not left a detail page since. The deferral is not a blanket "never"
 * and not a delay: the confirmation's own screen stays clear, and the first
 * non-detail surface is where the point is offered.
 *
 * (At HEAD this was decided on the origin alone, so a ping saved from a detail
 * page was deferred on EVERY route — including the next feed visit — which
 * contradicted the comment on the branch and swallowed the point the ticket
 * exists to offer. The `currentPath` half is what makes the claim true.)
 */
export function isRsvpDeferredAt(
  origin: string | null | undefined,
  currentPath: string | null | undefined,
): boolean {
  if (!isPlaydateDetailPath(origin)) return false
  if (currentPath === null || currentPath === undefined) return true
  return isPlaydateDetailPath(currentPath)
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
 *                            THIS ONE IS GLOBAL and permanent: the browser will
 *                            not show its prompt again, so re-asking is a
 *                            silent no-op that looks broken.
 *  5. no meaningful action → never ask: THE COLD-LOAD PIN.
 *  6. the surface owns it → never ask, and say nothing: /settings is the
 *                            control's own home and /onboarding is a setup flow
 *                            the app navigates out of (see
 *                            isPromptSuppressedPath).
 *  7. this point is spent  → never ask again AND say nothing: the point has
 *                            already been put in front of this parent (each is
 *                            offered at most once), so /settings → Notifications
 *                            is the only door back. Silence, not the fallback
 *                            sentence, so the sentence cannot loop.
 *  8. 'dismissed'          → never ask; point at the profile control. This is
 *                            the GLOBAL answer ("Turn off notifications" in
 *                            /settings, or a not-now remembered before this
 *                            ticket), and it is why a "Not now" on a CARD does
 *                            not write it — see dismissPushPrompt.
 *  9. saved on a drop-in's DETAIL page, still on one → never ask HERE (the
 *                            RSVP-priority deferral): the next non-detail visit
 *                            asks instead.
 * 10. otherwise            → ask, with the reason this point earns.
 */
export function decidePermissionPrompt(input: PermissionPromptInput): PermissionPromptDecision {
  const no = (note: string | null): PermissionPromptDecision => ({ ask: false, reason: null, note })

  if (input.permission === 'unsupported') return no(UNSUPPORTED_POINTER)
  if (input.permission === 'granted' || input.decision === 'granted') return no(null)
  if (!input.gate.allowed) return no(input.gate.reason)
  if (input.permission === 'denied' || input.decision === 'denied') return no(DENIED_POINTER)
  if (input.trigger === null) return no(null)
  if (isPromptSuppressedPath(input.currentPath)) return no(null)
  if (hasOfferedTrigger(input.offered ?? [], input.trigger)) return no(null)
  if (input.decision === 'dismissed') return no(DISMISSED_POINTER)
  // Step 9. Silence here, not a note: the note would be the interruption the
  // deferral exists to remove. The trigger stays armed, so the next non-detail
  // visit asks (or shows the pointer the parent's answer deserves).
  if (isRsvpDeferredAt(input.origin, input.currentPath)) return no(null)

  return { ask: true, reason: promptReasonFor(input.trigger), note: null }
}

/** `Notification.permission` (or the absence of `Notification`) → our shape. */
export function browserPermissionOf(value: string | null | undefined): BrowserPermission {
  return value === 'granted' || value === 'denied' || value === 'default' ? value : 'unsupported'
}

// ---------------------------------------------------------------------------
// The /settings opt-in CONTROL — deliberately NOT the prompt rule above.
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

/** How many log rows the /settings fallback list shows. */
export const RECENT_NOTIFICATIONS_LIMIT = 5

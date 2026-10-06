/**
 * The /settings Notifications section's copy, SPLIT BY CHANNEL (slice 2b-iii).
 *
 * WHY THIS MODULE EXISTS. Every sentence below is a claim about WHAT THE
 * CONTROLS DO, and the two channels do not do the same thing:
 *
 *  - WEB PUSH is delivered to the service worker, and the service worker
 *    enforces both controls before it shows anything (`src/sw.ts:141-143`:
 *    `isKindMuted` then `shouldSuppressForQuietHours`). So in a browser every
 *    word here is true, and it must not change.
 *  - A NATIVE (FCM) alert is rendered by the OPERATING SYSTEM. Our service
 *    worker does not run in the shell at all — Capacitor's WebView has no
 *    `PushManager`, the sender addresses a `device_tokens` row, and the OS draws
 *    the alert. Nothing on this device filters it, so both controls currently
 *    DO NOTHING there while the browser's copy promised they did.
 *
 * THE DIRECTION THAT MATTERS: a parent who relies on the Quiet hours sentence
 * can be woken at 6am by an app that told them they would not be. That is the
 * whole reason this split exists, and it is why the native strings say what is
 * true instead of what the feature intends.
 *
 * THE FOUNDER'S RULING (2026-10-06): fix the COPY now, decide the FEATURE later.
 * Honouring mutes natively needs a preferences table the sender consults — a
 * real slice of its own. Nothing here changes what a control DOES; the controls
 * keep working exactly as before, and this module only changes what we CLAIM.
 *
 * WHY A MODULE AND NOT TWO TERNARIES IN THE COMPONENT: the build law
 * (`docs/agents/code-structure.md`) puts a rule — "which channel is this, and
 * what is true there" — in `src/lib/` as a pure function, so the words are
 * reviewable in one place and pinned by a sibling test rather than by a
 * reviewer's eye. The component calls `notificationSectionCopy(native)` once and
 * renders it.
 *
 * TERMINOLOGY: "browser alerts" vs "app alerts", the plain distinction the
 * native-channel docs already draw ("the app, not the browser",
 * `docs/push-setup.md` §6). No new vocabulary is invented here.
 */

/** The three sentences this section shows about what its controls do. */
export interface NotificationSectionCopy {
  /** Under the per-kind mute list. */
  muteNote: string
  /** Under the Quiet hours heading. */
  quietHoursNote: string
  /** Under the "Turn off notifications" button. */
  turnOffNote: string
}

/**
 * THE BROWSER COPY — byte-for-byte what a browser user reads today. Web push
 * really does honour both controls, so none of this may drift; the sibling test
 * pins all three strings exactly.
 */
export const NOTIFICATION_COPY_WEB: NotificationSectionCopy = {
  muteNote:
    'Unchecked kinds are dropped on this device before they show. These choices are saved on this device only — email is set separately above.',
  quietHoursNote:
    'Pause alerts while your family sleeps. Cancellations and drop-ins that end early still come through, so you never drive out to an empty park.',
  turnOffNote:
    'Turning them off removes every device you turned them on from. You can turn them back on here any time.',
}

/**
 * THE NATIVE COPY — the same three places, saying what is true inside the shell.
 * Short, plain, and a statement of current behaviour rather than an error: the
 * controls are not broken, they are scoped to the browser channel.
 *
 * Two honest facts the browser words got wrong here:
 *  1. neither control filters an app alert — the OS renders it and never runs
 *     our code (so Quiet hours does NOT silence the 6am alert);
 *  2. the native opt-out deletes `device_tokens` rows only, while the web
 *     opt-out deletes `push_subscriptions` rows only (deliberate — the
 *     transports are not unified, `docs/push-setup.md` §Known limits). So
 *     "removes every device you turned them on from" is false in the shell: a
 *     browser registration survives, and turning both off needs both places.
 */
export const NOTIFICATION_COPY_NATIVE: NotificationSectionCopy = {
  muteNote: 'These choices apply to browser alerts; app alerts on this phone are not filtered by them yet.',
  quietHoursNote: 'Quiet hours apply to browser alerts; app alerts on this phone are not paused yet.',
  turnOffNote:
    "Turning them off removes your account's app alerts; browser alerts are turned off in your browser. You can turn them back on here any time.",
}

/**
 * The one question a caller asks: is this the native shell? `native` is the
 * platform answer the component already resolves once on mount
 * (`nativePushShellPlatform`, slice 2b-ii) — this module does no detection of
 * its own and takes no second look at the platform.
 */
export function notificationSectionCopy(native: boolean): NotificationSectionCopy {
  return native ? NOTIFICATION_COPY_NATIVE : NOTIFICATION_COPY_WEB
}

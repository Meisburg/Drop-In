/**
 * The Notifications section's copy seam (slice 2b-iii) — the two channel
 * variants, pinned so neither can drift into a lie.
 *
 * WHY THIS TEST EXISTS. The section told a browser parent the truth and told a
 * shell parent the same sentences, where they are false: a native alert is drawn
 * by the OS, our service worker never sees it, so neither the per-kind mutes nor
 * Quiet hours filter anything inside the app. A copy rule with no test is a rule
 * that drifts back, so both directions are pinned here:
 *
 *  - **browser copy must not change at all.** The web path really does honour
 *    both controls (`src/sw.ts:141-143`), so the three strings are asserted
 *    against LITERALS written out in this file — not against the module's own
 *    values, which would pass no matter what they became.
 *  - **native copy must say what is true**, and must not contain the claims the
 *    browser sentences make.
 *
 * The native VARIANT cannot be driven on this machine (no Android device, no
 * `FCM_SERVICE_ACCOUNT_JSON`), so the device behaviour itself is UNPROVEN; what
 * is proven here is the copy the shell renders.
 */
import { describe, expect, it } from 'vitest'
import {
  NOTIFICATION_COPY_NATIVE,
  NOTIFICATION_COPY_WEB,
  notificationSectionCopy,
} from './notificationSectionCopy'

/**
 * What a browser user reads TODAY, written out by hand. These are transcriptions
 * of the JSX these strings were lifted from (the JSX line breaks were one space
 * each, so the rendered text is exactly this) — an edit to any character of any
 * of them is the failure this assertion exists to cause.
 */
const WEB_COPY_TODAY = {
  muteNote:
    'Unchecked kinds are dropped on this device before they show. These choices are saved on this device only — email is set separately above.',
  quietHoursNote:
    'Pause alerts while your family sleeps. Cancellations and drop-ins that end early still come through, so you never drive out to an empty park.',
  turnOffNote:
    'Turning them off removes every device you turned them on from. You can turn them back on here any time.',
}

describe('notificationSectionCopy (which channel this section is talking about)', () => {
  it('gives a browser EXACTLY today’s sentences, character for character', () => {
    expect(NOTIFICATION_COPY_WEB).toEqual(WEB_COPY_TODAY)
  })

  it('selects the browser copy in a browser and the native copy in the shell', () => {
    expect(notificationSectionCopy(false)).toBe(NOTIFICATION_COPY_WEB)
    expect(notificationSectionCopy(true)).toBe(NOTIFICATION_COPY_NATIVE)
  })

  it('never renders a browser sentence inside the shell', () => {
    for (const key of ['muteNote', 'quietHoursNote', 'turnOffNote'] as const) {
      expect(
        NOTIFICATION_COPY_NATIVE[key],
        `${key} is unchanged in the shell, so it still claims what native cannot do`,
      ).not.toBe(WEB_COPY_TODAY[key])
    }
  })

  it('scopes both preference notes to browser alerts, and says app alerts are not filtered yet', () => {
    for (const key of ['muteNote', 'quietHoursNote'] as const) {
      const text = NOTIFICATION_COPY_NATIVE[key]
      expect(text).toContain('browser alerts')
      // The safe direction, said out loud: an app alert is NOT filtered on this
      // phone. Without this clause the sentence could read as a promise again.
      expect(text).toMatch(/app alerts on this phone are not (filtered|paused)[^.]*yet/)
      // One sentence each (the brief's brevity rule): long enough to be honest,
      // short enough that a parent actually reads it.
      expect(text.match(/\./g) ?? []).toHaveLength(1)
    }
  })

  it('stops claiming the opt-out removes every device, because it removes app alerts only', () => {
    // The native DELETE is `device_tokens`-scoped and the web DELETE is
    // `push_subscriptions`-scoped (docs/push-setup.md, "Known limits"). So the
    // shell's sentence must name the app channel and point at the browser for
    // the other one — "removes every device" is false there.
    expect(NOTIFICATION_COPY_NATIVE.turnOffNote).toContain('app alerts')
    expect(NOTIFICATION_COPY_NATIVE.turnOffNote).toContain('browser alerts')
    expect(NOTIFICATION_COPY_NATIVE.turnOffNote).not.toContain('every device')
  })
})

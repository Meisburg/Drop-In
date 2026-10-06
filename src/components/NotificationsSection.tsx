import { useCallback, useEffect, useState } from 'react'
import {
  deleteDeviceTokensForProfile,
  getEmailOptout,
  listDeviceTokens,
  listPushSubscriptions,
  listRecentNotifications,
  saveDeviceToken,
  updateEmailOptout,
  type DeviceTokenSummary,
  type NotificationLogItem,
  type PushSubscriptionSummary,
} from '../lib/db'
import { useSessionContext } from './SessionProvider'
import { decideEmailOptoutControl } from '../lib/emailOptout'
import { settingsErrorMessage } from '../lib/settingsError'
import {
  disableNativePush,
  nativePushShellPlatform,
  registerForNativePush,
  type NativePushShellPlatform,
} from '../lib/nativePushToken'
import {
  NOTIFICATION_KIND_COPY,
  NOTIFICATION_KINDS,
  decideOptInControl,
  dedupeNotifications,
  isKindMuted,
  type BrowserPermission,
  type InstallSurface,
  type NotificationKind,
  type OptInRegistration,
  type PermissionDecision,
  type PushOptInGate,
  type PushPrefs,
} from '../lib/push'
import {
  currentDecision,
  currentInstallSurface,
  currentOptInGate,
  currentPermission,
  disablePush,
  dismissIosInstallCard,
  enablePush,
  iosInstallCardDismissed,
  promptInstall,
  pushSupported,
  readPushPrefs,
  refreshPushSubscription,
  saveQuietHours,
  subscribeInstallPrompt,
  toggleKindMuted,
  vapidPublicKey,
} from '../lib/pushClient'

/**
 * The /settings Notifications section (V8 ticket 08; V27 added quiet hours and
 * moved the alerts log behind a disclosure).
 *
 * It owns the whole notification surface for one parent:
 *   - the opt-in ("Turn on notifications" / "Turn off", which DELETES the
 *     subscription rows) and the honest reason for it,
 *   - the SAME control for the NATIVE channel (slice 2b-ii): inside the shell
 *     the opt-in goes through the `nativePushToken` seam and the status is read
 *     from `device_tokens`, because a Capacitor WebView has no `PushManager` and
 *     can never take the web path (which is why the native seam existing and
 *     being tested was not the same as being reachable),
 *   - the per-kind mute toggles,
 *   - the INSTALL affordance (a real button on Android, the Share → Add to Home
 *     Screen card on iOS Safari, which is also what gates the iOS opt-in — iOS
 *     delivers web push only to an installed PWA),
 *   - and the last few `notification_log` rows as the visible fallback for
 *     anyone who denies the browser permission.
 *
 * Everything browser-shaped is delegated to src/lib/pushClient.ts and every
 * DECISION to the pure seams in src/lib/push.ts — this component renders and
 * calls, it does not sniff. The opt-in control is `decideOptInControl` (the
 * registration question); `decidePermissionPrompt` (the interrupt question)
 * belongs to the floating post-action prompt and is NOT used here.
 *
 * A MISSING TABLE (0031/0032 are applied live as of 2026-09-12; this is the
 * fail-safe) makes both reads throw `PGRST205`, and this section is the ONLY
 * consumer — it catches them and shows a sentence, so the rest of /profile is
 * untouched and the opt-in stays usable.
 */

type Loadable<T> =
  | { status: 'loading' }
  | { status: 'ready'; value: T }
  | { status: 'error'; message: string }

/**
 * The email opt-out read (migration 0053). `ready` can still carry `undefined`
 * — the column did not come back (pre-0053 project, or no row) — and that is
 * NOT "email is off": the render rule is `decideEmailOptoutControl`, which
 * shows the default-on state with an honest note.
 */
type EmailOptoutLoad =
  | { status: 'loading' }
  | { status: 'ready'; value: boolean | undefined }
  | { status: 'error'; message: string }

function errorText(error: unknown): string {
  return settingsErrorMessage(error, 'the service did not respond')
}

/** "just now" / "12 min ago" / "3 h ago" / "Sep 12" for one log row. */
function agoLabel(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const minutes = Math.round((Date.now() - then) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function NotificationsSection() {
  const [subscriptions, setSubscriptions] = useState<Loadable<PushSubscriptionSummary[]>>({
    status: 'loading',
  })
  const [recent, setRecent] = useState<Loadable<NotificationLogItem[]>>({ status: 'loading' })
  const [prefs, setPrefs] = useState<PushPrefs>(() => readPushPrefs())
  const [permission, setPermission] = useState<BrowserPermission>('unsupported')
  const [decision, setDecision] = useState<PermissionDecision>('unknown')
  const [gate, setGate] = useState<PushOptInGate>({ allowed: true, reason: null })
  const [surface, setSurface] = useState<InstallSurface>('none')
  const [iosCardDismissed, setIosCardDismissed] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [tone, setTone] = useState<'info' | 'error'>('info')
  const [emailOptout, setEmailOptout] = useState<EmailOptoutLoad>({ status: 'loading' })
  const [savingEmailOptout, setSavingEmailOptout] = useState(false)
  const [emailOptoutError, setEmailOptoutError] = useState<string | null>(null)

  /**
   * THE NATIVE CHANNEL (slice 2b-ii). `platform` starts as `null` — the browser
   * answer — and is settled once on mount; the render below is the web one
   * until then, so a browser page never changes shape. Only 'android' takes the
   * native path: APNs (2a) is deferred, and offering it on iOS would store a
   * token the sender cannot address.
   *
   * Inside the shell the WEB read is empty by construction (`push_subscriptions`
   * is the browser's table), so the native status is read from `device_tokens`
   * instead. Rendering the web state there would say "Notifications are off"
   * over a live row — the same dishonesty as claiming "on" without one.
   */
  const { session } = useSessionContext()
  const profileId = session?.user.id ?? null
  const [platform, setPlatform] = useState<NativePushShellPlatform | null>(null)
  const [deviceTokens, setDeviceTokens] = useState<Loadable<DeviceTokenSummary[]>>({
    status: 'loading',
  })

  const native = platform === 'android'

  const reload = useCallback(async () => {
    try {
      const [subs, items] = await Promise.all([listPushSubscriptions(), listRecentNotifications()])
      setSubscriptions({ status: 'ready', value: subs })
      setRecent({ status: 'ready', value: dedupeNotifications(items) })
    } catch (error) {
      const message = errorText(error)
      setSubscriptions({ status: 'error', message })
      setRecent({ status: 'error', message })
    }
  }, [])

  const readDevice = useCallback(() => {
    setPermission(currentPermission())
    setDecision(currentDecision())
    setGate(currentOptInGate())
    setSurface(currentInstallSurface())
    setIosCardDismissed(iosInstallCardDismissed())
  }, [])

  useEffect(() => {
    readDevice()
    const unsubscribe = subscribeInstallPrompt(() => setSurface(currentInstallSurface()))
    return () => {
      unsubscribe()
    }
  }, [readDevice])

  /** The native twin of `reload` — this profile's `device_tokens` rows. Only
   *  ever called inside a shell (see `platform`), so a browser never pays for a
   *  read it cannot use. */
  const reloadDeviceTokens = useCallback(async () => {
    try {
      setDeviceTokens({ status: 'ready', value: await listDeviceTokens() })
    } catch (error) {
      setDeviceTokens({ status: 'error', message: errorText(error) })
    }
  }, [])

  // Which shell are we in? `nativePushShellPlatform` never rejects (a missing
  // Capacitor is a browser), so this needs no catch — and it deliberately does
  // not use a second detection of its own.
  useEffect(() => {
    let cancelled = false
    void nativePushShellPlatform().then((value) => {
      if (!cancelled) setPlatform(value)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!native) return
    void reloadDeviceTokens()
  }, [native, reloadDeviceTokens])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      // Self-healing re-register BEFORE the read, so a subscription the browser
      // rotated while no tab was open shows up as a row rather than as a
      // mysteriously missing device. It never creates a subscription.
      await refreshPushSubscription().catch(() => false)
      if (!cancelled) await reload()
    })()
    return () => {
      cancelled = true
    }
  }, [reload])

  // The email opt-out read is SEPARATE from reload() on purpose: a failed
  // `push_subscriptions` / `notification_log` read must not decide anything
  // about email, and vice versa. The failure lands in its own state, which the
  // pure decision turns into the default-on control plus a note. It is read
  // ONCE (not re-read after a write): the write path renders what it just sent,
  // because 0031's lesson is that an immediate read-after-write can miss the
  // row it wrote (see db.ts savePushSubscription).
  useEffect(() => {
    void (async () => {
      try {
        const value = await getEmailOptout()
        setEmailOptout({ status: 'ready', value })
      } catch (error) {
        setEmailOptout({ status: 'error', message: errorText(error) })
      }
    })()
  }, [])

  /**
   * The ONE registration status, from whichever channel this build actually
   * uses: `push_subscriptions` in a browser, `device_tokens` inside the shell.
   * When `native` is false every value below is exactly what it was before this
   * slice — the native branch is dead code until the platform settles on
   * 'android'.
   */
  const statusLoad = native ? deviceTokens.status : subscriptions.status
  const deviceCount = native
    ? deviceTokens.status === 'ready'
      ? deviceTokens.value.length
      : 0
    : subscriptions.status === 'ready'
      ? subscriptions.value.length
      : 0
  const optedIn = deviceCount > 0
  const statusError = native
    ? deviceTokens.status === 'error'
      ? deviceTokens.message
      : null
    : subscriptions.status === 'error'
      ? subscriptions.message
      : null

  /**
   * The control is gated on the REAL registration, never on the prompt rule
   * (decidePermissionPrompt's short-circuits — granted, dismissed — are about
   * whether to interrupt a parent, and using them here made "Turn off"
   * irreversible). 'unknown' while the read is in flight or failed, so the
   * section can still offer the button when it cannot see the rows: writing a
   * row is exactly the right recovery, and the failure is reported below.
   */
  const registration: OptInRegistration =
    statusLoad === 'ready' ? (optedIn ? 'registered' : 'none') : 'unknown'

  // Inside the shell the browser permission is 'unsupported' (the WebView has no
  // PushManager), and decideOptInControl turns that into NO BUTTON — which is
  // the structural unreachability slice 2b-ii exists to close. 'default' is the
  // honest input there: the OS permission has not been read yet, and offering
  // the button stays correct even when it is denied, because the seam's
  // checkPermissions() reports that denial with the sentence naming the phone's
  // settings (a re-asking web button would be a silent no-op).
  const control = decideOptInControl({
    decision,
    permission: native ? 'default' : permission,
    gate,
    registration,
  })

  // The email opt-out's rendered state is the PURE decision (src/lib/emailOptout.ts)
  // — the component never decides it inline. `loading` is true only for the
  // first read; a FAILED or absent read arrives as `undefined` and renders the
  // default-on state with its note, never "email is off".
  const emailControl = decideEmailOptoutControl({
    optout: emailOptout.status === 'ready' ? emailOptout.value : undefined,
    saving: savingEmailOptout,
    loading: emailOptout.status === 'loading',
  })

  /**
   * The one inline error line for this block: the failed WRITE if there is one,
   * otherwise the failed READ's reason. The read's CONSEQUENCE is already in the
   * control's note (the default-on sentence, see decideEmailOptoutControl), so
   * this line carries the cause only.
   */
  const emailOptoutReadError =
    emailOptout.status === 'error'
      ? `Couldn't load your email setting (${emailOptout.message}).`
      : null
  const emailOptoutFailure = emailOptoutError ?? emailOptoutReadError

  async function handleTurnOn() {
    setBusy(true)
    setNotice(null)

    // NATIVE WHEN (AND ONLY WHEN) THIS IS THE SHELL. The platform comes from the
    // seam (`nativePushShellPlatform`, which maps Capacitor's own answer through
    // the same `nativePlatformOf` the registration itself uses) — there is no
    // second sniff here. The browser branch below is therefore not merely
    // equivalent, it is the SAME path it always was: no dynamic import and no
    // extra await sits between the tap and `Notification.requestPermission()`,
    // which matters because a browser grants push only while the tap's user
    // activation is still live.
    if (native) {
      if (profileId === null) {
        setBusy(false)
        setTone('error')
        setNotice("You're signed out, so notifications can't be turned on.")
        return
      }
      const outcome = await registerForNativePush({ profileId, saveToken: saveDeviceToken })
      setBusy(false)
      await reloadDeviceTokens()
      readDevice()
      if (outcome.status === 'registered') {
        setTone('info')
        setNotice('Notifications are on for this device.')
        return
      }
      // blocked / error / unsupported: an honest sentence, NEVER a success.
      // `blocked` already carries a full sentence naming the way back; a raw
      // plugin fault is wrapped so the notice reads as one too.
      setTone(outcome.status === 'error' ? 'error' : 'info')
      setNotice(
        outcome.status === 'error'
          ? `Couldn't turn on notifications (${outcome.reason}).`
          : outcome.reason,
      )
      return
    }

    const result = await enablePush()
    setBusy(false)
    readDevice()
    await reload()
    if (!result.ok) {
      setTone(result.reason === 'error' ? 'error' : 'info')
      setNotice(result.message)
      return
    }
    setTone('info')
    setNotice('Notifications are on for this device.')
  }

  async function handleTurnOff() {
    setBusy(true)
    setNotice(null)

    // The native opt-out IS the device row's absence (0065's pin on the DELETE
    // policy), so it is a separate path with its own outcome — never a silent
    // success over a row that is still there.
    if (native) {
      const outcome = await disableNativePush({
        platform,
        deleteTokens: deleteDeviceTokensForProfile,
      })
      setBusy(false)
      await reloadDeviceTokens()
      readDevice()
      if (outcome.status === 'removed') {
        setTone('info')
        setNotice('Notifications are off. Nothing will be sent to this device.')
        return
      }
      setTone('error')
      setNotice(`Couldn't turn notifications off (${outcome.reason}).`)
      return
    }

    try {
      await disablePush()
      setTone('info')
      setNotice('Notifications are off. Nothing will be sent to this device.')
    } catch (error) {
      setTone('error')
      setNotice(`Couldn't turn notifications off (${errorText(error)}).`)
    } finally {
      setBusy(false)
      readDevice()
      await reload()
    }
  }

  function handleToggleKind(kind: NotificationKind) {
    setPrefs(toggleKindMuted(kind))
  }

  /** Quiet hours are device-level, like the mutes: the write persists to
   *  localStorage, mirrors into the SW cache, and renders from the new prefs. A
   *  cleared time input is ignored rather than stored as an empty window. */
  function handleQuietHoursChange(patch: Partial<PushPrefs['quietHours']>) {
    setPrefs(saveQuietHours({ ...prefs.quietHours, ...patch }))
  }

  async function handleInstall() {
    const outcome = await promptInstall()
    readDevice()
    if (outcome === null) setSurface(currentInstallSurface())
  }

  /**
   * Write the email opt-out. `nextChecked` is the checkbox state (true = email
   * allowed) and the COLUMN is the negation — the polarity lives in
   * src/lib/emailOptout.ts and in 0053's header, and this is the one place the
   * two are translated.
   *
   * On success the state is set from what was just written rather than re-read
   * (0031's measured read-after-write gap, see db.ts savePushSubscription). On
   * failure NOTHING flips: the stored value is unchanged, so the control keeps
   * rendering it and the error is stated in a sentence.
   */
  async function handleEmailOptoutChange(nextChecked: boolean) {
    setSavingEmailOptout(true)
    setEmailOptoutError(null)
    const nextOptout = !nextChecked
    try {
      await updateEmailOptout(nextOptout)
      setEmailOptout({ status: 'ready', value: nextOptout })
    } catch (error) {
      setEmailOptoutError(
        `Couldn't save your email setting (${errorText(error)}). Nothing changed.`,
      )
    } finally {
      setSavingEmailOptout(false)
    }
  }

  const sendingConfigured = vapidPublicKey() !== ''

  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      data-testid="notifications-section"
    >
      <h3 className="text-base font-semibold text-slate-900">Notifications</h3>
      <p className="mt-1 text-sm text-slate-600">
        A heads-up when someone joins your drop-in, when it starts, or if it gets cancelled.
      </p>

      {/* The WEB deployment's configuration note. It is gated on the VAPID
          public key — a web-push setting — so it is suppressed inside the shell,
          where web push cannot deliver at all and the native channel's own gate
          is the FCM secret (a server-side value this client cannot see). Leaving
          it up there would make a web-deployment fact stand in for the native
          channel's state, which is this project's D-025 defect class. */}
      {sendingConfigured || native ? null : (
        <p
          className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
          data-testid="push-config-note"
        >
          Push sending isn&apos;t switched on for this deployment yet, so nothing will go out until
          it is. Alerts still collect in the &quot;While you were away&quot; card on your feed.
        </p>
      )}

      {/* The iOS install card. iOS Safari has no beforeinstallprompt, so
          instructions are the only route — and they must come BEFORE the
          opt-in, because iOS delivers web push only to an installed PWA. */}
      {surface === 'ios-install-card' && !iosCardDismissed ? (
        <div
          className="mt-3 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2"
          data-testid="push-ios-card"
        >
          <p className="text-xs font-medium text-indigo-900">Add Drop In to your home screen</p>
          <p className="mt-1 text-xs text-indigo-800">
            On iPhone and iPad, notifications only arrive in the installed app. Tap the Share
            button, then <span className="font-medium">Add to Home Screen</span>, and turn
            notifications on there.
          </p>
          <button
            type="button"
            className="mt-2 text-xs font-medium text-indigo-700 underline"
            data-testid="push-ios-dismiss"
            onClick={() => {
              dismissIosInstallCard()
              setIosCardDismissed(true)
            }}
          >
            Got it
          </button>
        </div>
      ) : null}

      {/* The Android / desktop-Chromium affordance: a real button, backed by the
          deferred beforeinstallprompt event. */}
      {surface === 'android-install-button' ? (
        <button
          type="button"
          className="mt-3 min-h-11 w-full rounded-md border border-indigo-300 bg-white px-3 py-2 text-sm font-medium text-indigo-700"
          data-testid="push-install-button"
          onClick={() => void handleInstall()}
        >
          Add Drop In to your home screen
        </button>
      ) : null}

      <div className="mt-3" data-testid="push-status">
        {statusLoad === 'loading' ? (
          <p className="text-sm text-slate-600">Loading…</p>
        ) : optedIn && statusLoad === 'ready' ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-emerald-700">Notifications are on</p>
            <p className="text-xs text-slate-600">
              {deviceCount === 1
                ? 'One device is registered for this account.'
                : `${deviceCount} devices are registered for this account.`}
            </p>
            <button
              type="button"
              className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
              data-testid="push-turn-off"
              disabled={busy}
              onClick={() => void handleTurnOff()}
            >
              {busy ? 'Turning off…' : 'Turn off notifications'}
            </button>
            <p className="text-xs text-slate-500">
              Turning them off removes every device you turned them on from. You can turn them back
              on here any time.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-slate-600">Notifications are off.</p>
            {control.offer ? (
              <>
                <p className="text-xs text-slate-600">{control.reason}</p>
                <button
                  type="button"
                  className="min-h-11 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  data-testid="push-turn-on"
                  disabled={busy}
                  onClick={() => void handleTurnOn()}
                >
                  {busy ? 'Turning on…' : 'Turn on notifications'}
                </button>
              </>
            ) : (
              <p className="text-xs text-slate-600" data-testid="push-fallback-note">
                {control.note ?? 'Notifications are not available on this device right now.'}
              </p>
            )}
          </div>
        )}
      </div>

      {/* The EMAIL opt-out (migration 0053) — a SIBLING block to the push
          status above, deliberately outside it: email is the fallback channel
          for a parent who does not have push set up on this device, so the
          control is meaningful (and writable) whatever the push state is. It
          ALWAYS renders — no env var and no build flag gates it, because a flag
          that failed closed would silently hide the preference (decision
          recorded in 0053's header).

          The rendered state and the note come from the pure
          decideEmailOptoutControl; this component only renders and executes. */}
      <div className="mt-4 border-t border-slate-100 pt-3" data-testid="email-optout">
        <h3 className="text-base font-semibold text-slate-900">Email</h3>
        <p className="mt-1 text-xs text-slate-500">
          Email is the fallback for when you don&apos;t have notifications turned on for this
          device. It can arrive a few minutes after the alert in the app — it is not instant.
        </p>
        <label
          className={`mt-2 flex min-h-11 items-start gap-3 ${
            emailControl.disabled ? 'cursor-not-allowed' : 'cursor-pointer'
          }`}
        >
          <input
            type="checkbox"
            className="mt-2 h-5 w-5 shrink-0 accent-indigo-600 disabled:opacity-50"
            data-testid="email-optout-toggle"
            checked={emailControl.checked}
            disabled={emailControl.disabled}
            onChange={(event) => void handleEmailOptoutChange(event.target.checked)}
          />
          <span className="text-sm text-slate-700">
            <span className="font-medium">Email me about my drop-ins</span>
            <span className="block text-xs text-slate-500">
              Sent to the email address on your account. Some kinds of alert may not go out by
              email yet.
            </span>
          </span>
        </label>
        {/* The note is '' when there is nothing honest to add; it carries the
            failed-read sentence (the default-on state, stated) when there is. */}
        {emailControl.note === '' ? null : (
          <p className="mt-2 text-xs text-slate-500" data-testid="email-optout-note">
            {emailControl.note}
          </p>
        )}
        {/* A failed WRITE (or the cause of a failed read): said plainly, next
            to the control, which keeps rendering the stored value — nothing
            was silently flipped. */}
        {emailOptoutFailure === null ? null : (
          <p className="mt-2 text-xs text-red-600" data-testid="email-optout-error">
            {emailOptoutFailure}
          </p>
        )}
      </div>

      {/* A FAILED SETTINGS READ MUST NOT HIDE THE OPT-IN. An unreadable
          `push_subscriptions` (or `device_tokens`, in the shell) is 'unknown'
          registration, which still OFFERS the button (see decideOptInControl):
          writing a row is the right recovery, and only a confirmed row means
          "on". The failure itself is reported here, in a sentence, next to the
          control. */}
      {statusError === null ? null : (
        <p className="mt-2 text-sm text-red-600" data-testid="push-error">
          Couldn&apos;t load your notification settings ({statusError}). Your other profile
          settings are unaffected.
        </p>
      )}

      {notice === null ? null : (
        <p
          className={`mt-2 text-xs ${tone === 'error' ? 'text-red-600' : 'text-slate-600'}`}
          data-testid="push-notice"
        >
          {notice}
        </p>
      )}

      {/* Per-kind mutes. Enforced by the service worker on this device (see
          src/sw.ts + 0032's accepted residual) — a muted kind arrives and is
          dropped before it shows. */}
      <div className="mt-4 border-t border-slate-100 pt-3" data-testid="push-kind-prefs">
        <h3 className="text-base font-semibold text-slate-900">
          Choose what you get notified about
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Tap any row below to switch a kind on or off.
        </p>
        <ul className="mt-2 flex flex-col gap-2">
          {NOTIFICATION_KINDS.map((kind) => {
            const copy = NOTIFICATION_KIND_COPY[kind]
            const muted = isKindMuted(prefs, kind)
            return (
              <li key={kind} className="flex items-start gap-3">
                <input
                  id={`push-pref-${kind}`}
                  type="checkbox"
                  className="mt-1 h-5 w-5 shrink-0"
                  data-testid={`push-pref-${kind}`}
                  checked={!muted}
                  onChange={() => handleToggleKind(kind)}
                />
                <label htmlFor={`push-pref-${kind}`} className="text-sm text-slate-700">
                  <span className="font-medium">{copy.label}</span>
                  <span className="block text-xs text-slate-500">{copy.when}</span>
                </label>
              </li>
            )
          })}
        </ul>
        <p className="mt-2 text-xs text-slate-500">
          Unchecked kinds are dropped on this device before they show. These choices are saved on
          this device only — email is set separately above.
        </p>
      </div>

      {/* Quiet hours (V27). A device-level window enforced by the service
          worker, exactly like the mutes. Cancellations and early ends are
          deliberately exempt (see QUIET_HOURS_ALWAYS_ALLOWED): those exist to
          stop a parent driving out, so silence there would be a safety bug, not
          a courtesy. */}
      <div className="mt-4 border-t border-slate-100 pt-3" data-testid="quiet-hours">
        <h3 className="text-base font-semibold text-slate-900">Quiet hours</h3>
        <p className="mt-1 text-xs text-slate-500">
          Pause alerts while your family sleeps. Cancellations and drop-ins that end early still
          come through, so you never drive out to an empty park.
        </p>
        <label className="mt-2 flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            className="h-5 w-5 shrink-0 accent-indigo-600"
            data-testid="quiet-hours-toggle"
            checked={prefs.quietHours.enabled}
            onChange={(event) =>
              handleQuietHoursChange({ enabled: event.target.checked })
            }
          />
          <span className="text-sm font-medium text-slate-700">Pause non-urgent alerts overnight</span>
        </label>
        {prefs.quietHours.enabled ? (
          <div className="mt-1 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              From
              <input
                type="time"
                data-testid="quiet-hours-start"
                className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-800"
                value={prefs.quietHours.start}
                onChange={(event) => {
                  if (event.target.value === '') return
                  handleQuietHoursChange({ start: event.target.value })
                }}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              To
              <input
                type="time"
                data-testid="quiet-hours-end"
                className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-800"
                value={prefs.quietHours.end}
                onChange={(event) => {
                  if (event.target.value === '') return
                  handleQuietHoursChange({ end: event.target.value })
                }}
              />
            </label>
          </div>
        ) : null}
      </div>

      {/* The visible fallback: the same alerts, in the app, whether or not the
          browser ever granted permission. V27 put it behind a disclosure — it
          is a log, not a preference, and it should not push the controls a
          parent came to change off the screen. It stays on the page and stays
          honest; it just waits to be asked. */}
      <details className="mt-4 border-t border-slate-100 pt-3" data-testid="push-recent">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-slate-800">
          Recent alerts
        </summary>
        {recent.status === 'loading' ? (
          <p className="mt-1 text-sm text-slate-600">Loading…</p>
        ) : recent.status === 'error' ? (
          <p className="mt-1 text-sm text-slate-600">
            Couldn&apos;t load recent alerts ({recent.message}).
          </p>
        ) : recent.value.length === 0 ? (
          <p className="mt-1 text-sm text-slate-600">
            Nothing yet. Going, comments, cancellations and drop-ins starting soon all show up
            here.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {recent.value.map((item) => (
              <li key={item.id} className="text-sm">
                <span className="font-medium text-slate-800">{item.title}</span>
                <span className="block text-xs text-slate-500">
                  {item.body} · {agoLabel(item.createdAt)}
                  {item.error !== null && item.error !== ''
                    ? ` · not delivered (${item.error})`
                    : item.sentAt === null
                      ? ' · pending'
                      : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-slate-500">
          This list works whether or not your browser shows notifications.
        </p>
      </details>

      {/* The web-only footnote. Inside the shell the sentence would be false —
          native notifications DO work there — so it is suppressed with the
          native control rather than contradicting it. */}
      {native || pushSupported() ? null : (
        <p className="mt-2 text-xs text-slate-500">
          This browser can&apos;t show notifications at all — the list above still keeps you posted.
        </p>
      )}
    </div>
  )
}

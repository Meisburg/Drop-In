/**
 * SLICE 3 — a SHARED https link opens the app (Android App Links).
 *
 * ⚠️ THIS IS NOT SLICE 2c. 2c's custom scheme (`app.dropin.playdate://…`,
 * NATIVE_OAUTH_SCHEME in lib/oauth.ts) carries an OAuth return to the app and is
 * proven working on hardware. This module is the other mechanism: a link a
 * parent TAPS OR SHARES — `https://drop-in-mu.vercel.app/playdate/<id>` — which
 * needs the OS to trust the domain for our package, so it ships with
 * `public/.well-known/assetlinks.json` and the `autoVerify` intent filter in
 * `android/app/src/main/AndroidManifest.xml`. The two mechanisms share nothing
 * but the `appUrlOpen` event, and the subscription below is deliberately
 * careful about that shared resource (see the guard in `subscribeAppLinks`).
 *
 * Android only. iOS's half (`apple-app-site-association` + Associated Domains)
 * is slice 2a, deferred — this box cannot build iOS.
 *
 * ⚠️ TWO FINGERPRINTS, AND THE REPO HAS ONE. `assetlinks.json` carries the
 * UPLOAD keystore's SHA-256 (`/home/jmeisburg/.android-keys/drop-in-upload.jks`,
 * alias `upload`, re-confirmed with keytool for this slice). Play App Signing
 * RE-SIGNS the upload with GOOGLE's key, so installs from Play are signed by a
 * certificate whose fingerprint is not in that file yet: **the Play app-signing
 * SHA-256 must be appended to `sha256_cert_fingerprints` before release.**
 * Shipping only the upload key is the classic App Links mistake — it works for
 * sideloaded builds (this slice's device test included) and fails for everyone
 * who installed from Play. The full note, with the value, lives where a release
 * looks for it: `docs/RELEASE-CHECKLIST.md` § 2.6, still unticked.
 * `appLinks.test.ts` pins the file's shape and the upload key, not the list's
 * length, so appending the second fingerprint needs no test edit.
 */

/**
 * The https host the app claims: `capacitor.config.ts`'s appId is the package,
 * and this is the deployed web origin's host (`VITE_PUBLIC_BASE_URL` feeds
 * `buildShareUrl`, lib/trust.ts). It has ONE home in `src/` — this constant —
 * and `appLinks.test.ts` fails if the manifest's `android:host` drifts from it.
 */
export const APP_LINK_HOST = 'drop-in-mu.vercel.app'

/**
 * The path prefix the Android filter claims AND the gate the URL must pass —
 * one constant for both, because the OS hands us every URL under the prefix and
 * the JS must not take a narrower view than the filter does. `/playdate/` is
 * the shape `buildShareUrl` produces.
 *
 * Consequence, stated rather than implied: an emailed password-reset link
 * points at `/reset-password` (`RESET_PATH`, lib/passwordReset.ts), which is NOT
 * under this prefix, so it keeps opening in the browser. That is correct today —
 * the recovery token has to reach Supabase inside the WebView — and it is
 * recorded as a named follow-up rather than half-built here.
 */
export const APP_LINK_PATH_PREFIX = '/playdate/'

/**
 * The in-app path a URL should open, or `null` when the URL is not ours.
 *
 * Pure, so the rule is testable without a device. Strict on purpose: only
 * `https` (the manifest claims no other scheme), only our exact host (a
 * substring test would accept `drop-in-mu.vercel.app.evil.com`), and only a path
 * under the claimed prefix. Search and hash are KEPT — a link is allowed to
 * carry them and the router is the thing that decides what they mean.
 *
 * The prefix is as far as this decision goes: `/playdate/<id>/edit` comes back
 * as a path and the router routes it. This function says "ours", not "a screen
 * exists" — a second, narrower rule here would be a rule the manifest does not
 * share, and the two would drift.
 *
 * `isPlaydateReturnTarget` (lib/trust.ts) is deliberately NOT reused here, and
 * the reason is the shape that predicate enforces: it is the signed-out RETURN
 * TARGET — exactly one id segment, no trailing path — which is NARROWER than the
 * prefix the OS hands us. Reusing it would mean a URL the filter accepts
 * (`/playdate/<id>/edit`) reaching this gate and being dropped there, with the
 * app already in the foreground because the link opened it: the dead outcome
 * this function exists to prevent. Two rules for two questions, each with one
 * home.
 */
export function appLinkPath(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    // Not a URL at all — including `App.getLaunchUrl()`'s empty string on the
    // web (`@capacitor/app`'s AppWeb returns `{ url: '' }`).
    return null
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== APP_LINK_HOST) return null
  if (!parsed.pathname.startsWith(APP_LINK_PATH_PREFIX)) return null
  return `${parsed.pathname}${parsed.search}${parsed.hash}`
}

/**
 * Subscribe to app-link deliveries and hand the caller the in-app path to open.
 * Returns the detach function, exactly like `subscribeNativeOAuthReturn`
 * (lib/db.ts, slice 2c).
 *
 * ⚠️ WHY THIS READS `getLaunchUrl()` AND WHY IT SOMETIMES DOES NOT LISTEN AT
 * ALL. Capacitor retains a launch intent's URL as an `appUrlOpen` event until
 * the FIRST JavaScript listener registers for it, and that registration is also
 * what consumes it (`Plugin.addEventListener` → `sendRetainedArgumentsForEvent`
 * → `retainedEventArguments.remove`, in @capacitor/android — one delivery, to
 * whoever asked first). Slice 2c's subscriber, mounted by /login, is that first
 * listener when the app was COLD-STARTED by `app.dropin.playdate://…`, and its
 * own comment (lib/db.ts) says the retained event is what makes a killed-app
 * sign-in still land. So a root-level listener that registers first would steal
 * the OAuth return and turn a proven sign-in into a login screen with no
 * message.
 *
 * Hence: the launch URL is READ, never raced for — `Bridge.getIntentUri()` is
 * set once from the launch intent, so it is the cold-start URL and reading it
 * consumes nothing — and a launch URL that is NOT ours (2c's scheme) means this
 * subscription registers nothing at all and leaves the retained event to /login.
 * A later listener cannot be attached in that session; the cost is that a shared
 * link tapped while the app is already running would go unhandled only in a
 * session that began with an OAuth return, which is worth less than the sign-in
 * it protects.
 *
 * On the WEB (`npm run dev`, the deployed app) `getLaunchUrl()` answers `''` and
 * `appUrlOpen` is never dispatched by `@capacitor/app`'s web implementation, so
 * this is a silent no-op with no browser special case — the same shape 2c took.
 */
export function subscribeAppLinks(onPath: (path: string) => void): () => void {
  let stopped = false
  let detach: (() => void) | null = null

  void (async () => {
    try {
      const { App } = await import('@capacitor/app')
      if (stopped) return

      // COLD START. A link that launches the app never reaches the router:
      // Capacitor loads the BUNDLED web assets, not the intent's URL, so the
      // WebView's location is the app's own origin and nothing would navigate.
      const launch = await App.getLaunchUrl().catch(() => null)
      if (stopped) return
      const launchUrl = launch?.url ?? ''
      const launchPath = appLinkPath(launchUrl)
      if (launchPath !== null) onPath(launchPath)

      // ⚠️ The guard above's other half — see the docblock. Do not "simplify"
      // this into an unconditional addListener: registering consumes
      // Capacitor's retained launch URL, and for a cold-started OAuth return
      // that URL is the sign-in itself.
      if (launchUrl !== '' && launchPath === null) return

      // The retained launch URL is echoed to this listener too whenever /login
      // did not take it first, and it has already been opened just above.
      // Only the FIRST event can be that echo: a parent who later taps the same
      // shared link again must still be taken to it.
      let launchEchoPending = launchPath !== null

      const handle = await App.addListener('appUrlOpen', ({ url }) => {
        if (launchEchoPending) {
          launchEchoPending = false
          if (url === launchUrl) return
        }
        const path = appLinkPath(url)
        if (path !== null) onPath(path)
      })
      if (stopped) {
        void handle.remove()
        return
      }
      detach = () => void handle.remove()
    } catch {
      // Nothing lands here on a platform that has the plugin (web included — it
      // ships a web implementation). It is the bundle that dropped the plugin
      // or an import that threw, and then there is nothing to subscribe to.
    }
  })()

  return () => {
    stopped = true
    detach?.()
  }
}

# Capacitor 8 grounding for a bundled-assets Android-first wrap — 2026-10-05

Research date 2026-10-05. Primary sources only (Capacitor docs/upgrade guides/npm registry, Google + Android
developer docs, Apple developer docs, plugin release notes). Every claim carries a URL; anything I could not
confirm against a primary source is in the final section.

## What changed and what it means for us

1. Capacitor 8 (core 8.0.0 on 2025-12-08, latest **8.5.2** on 2026-09-11) is a **native-toolchain** release, not a
   web-API release: Node 22+, Xcode 26, Android Studio Otter, AGP 8.13.0, targetSdk 36 — a Capacitor 6/7 handoff
   is wrong on all of these.
2. Bundled assets are still expressed the same way — set `webDir` and **omit `server.url`** — but Android now
   serves them from `https://localhost` (`androidScheme` default `https`), so browser localStorage/cookies do
   **not** carry over into the shell: existing Supabase sessions re-authenticate once.
3. `android.adjustMarginsForEdgeToEdge` is **gone** in 8.0 (replaced by SystemBars + CSS `env()` safe areas), and
   8.5 makes the iOS **UIScene lifecycle** a breaking minor — a layout/AppDelegate handoff written for Capacitor 7
   needs edits in both places.
4. Android push is unchanged in shape (google-services.json in `android/app/`, plugin supplies the Firebase SDK,
   `requestPermissions()` → `register()` → `registration` gives an FCM token) — but **none of the Web Push/VAPID
   machinery transfers**: no service worker `push` handler, no `endpoint`/`p256dh`/`auth` subscription, and the
   Edge Function must gain a Google service-account OAuth2 path to call FCM v1.
5. The two real gates are **non-technical**: Apple 4.2 rejects "repackaged website" outright, and a **new personal**
   Play account must run a closed test with **12 testers opted in continuously for 14 days** before it can publish —
   that is a scheduling constraint on the launch, not a build task.

---

## 1. Capacitor 8 conventions as they stand today

**Versions (checked 2026-10-05).** `@capacitor/core` `latest` = **8.5.2** (published 2026-09-11); 8.0.0 published
2025-12-08; `@capacitor/cli` and `@capacitor/android` `latest` are also 8.5.2; `next` = 9.0.0-alpha.7.
Sources: <https://registry.npmjs.org/@capacitor/core> · <https://ionic.io/blog/announcing-capacitor-8>

**Project layout (unchanged in 8).** Three requirements: a `package.json`, a separate directory of built web assets
(`dist` for Vite — the docs name `dist` explicitly), and an `index.html` at that directory's root inside a `<head>`
tag, or plugins will not inject. Flow: `npm i @capacitor/core` + `npm i -D @capacitor/cli`, `npx cap init`,
`npm i @capacitor/android`, `npx cap add android`, then `npx cap sync` after every web build (sync = copy web assets
into the native project + update native deps). `cap init` auto-detects the output dir, but cross-check `webDir`.
Sources: <https://capacitorjs.com/docs/getting-started> · <https://capacitorjs.com/docs/basics/workflow>

**`capacitor.config.ts` fields that matter for a bundled-assets app.**

| Field | Meaning / default | Why it matters here |
|---|---|---|
| `appId`, `appName` | reverse-DNS bundle/application ID; display name | Must match the Firebase Android package name exactly |
| `webDir` | directory of compiled assets containing the final `index.html` (`@since 1.0.0`) | set to `dist` |
| `server.url` | "Load an external URL in the Web View… intended for use with live-reload servers. **This is not intended for use in production**" | **omit it** — this is the live-URL wrapper tell |
| `server.hostname` | local hostname, default `localhost`, kept so secure-context Web APIs (`geolocation`, `getUserMedia`) work | keep `localhost` |
| `server.androidScheme` | default **`https`**; **changing it from `http`/`https` can break routing** because custom schemes cannot change the URL path as of WebView 117 | leave at default |
| `server.cleartext`, `server.allowNavigation` | both marked "not intended for use in production" | leave off |
| `server.appStartPath` | append a path to the app URL instead of `/index.html` (`@since 7.3.0`) | only if you need a non-root entry |
| `android.allowMixedContent`, `android.webContentsDebuggingEnabled` | both default `false` | leave off in release |
| `backgroundColor`, `zoomEnabled` (6.0+), `initialFocus` (7.0+), `loggingBehavior` | misc | review before the store build |

Source: <https://capacitorjs.com/docs/config> and the authoritative interface source
<https://github.com/ionic-team/capacitor/blob/main/cli/src/declarations.ts> (`server` block, `webDir`, `android` block).

**Bundled vs remote, precisely.** There is one switch: if `server.url` is **absent**, the WebView loads the assets
copied from `webDir` through the local scheme (`androidScheme`, default `https`, hostname default `localhost` →
origin `https://localhost`); if `server.url` is **present**, the WebView loads that external URL instead and the
docs explicitly scope it to live reload and say it is not for production. Same source as above.

**Android-side expectations.** `AndroidManifest.xml` is at `android/app/src/main/AndroidManifest.xml`, `applicationId`
in `android/app/build.gradle`, app name in `res/values/strings.xml`; `webDir` assets land inside the Android project
and are served locally. Source: <https://capacitorjs.com/docs/android/configuration>

**What changed 7 → 8 that a Capacitor 6/7 handoff gets wrong.** All from <https://capacitorjs.com/docs/updating/8-0>:

- **Node.js 22+ required.** This repo's `engines.node` is `>=22`, so it already clears it.
- **Android minimums**: `minSdkVersion 24`, `compile/targetSdkVersion 36`, AGP **8.13.0**, Gradle wrapper **8.14.3**,
  Kotlin **2.2.20**, `google-services` plugin **4.4.4**, `androidxWebkitVersion 1.14.0`; Android Studio Otter 2025.2.1+.
- **iOS**: Xcode **26.0+**, deployment target **iOS 15.0**; CLI now creates **SPM** projects by default
  (`npx cap add ios` → SPM; `--packagemanager CocoaPods` to opt out). Existing CocoaPods projects keep working.
- **`android.adjustMarginsForEdgeToEdge` was removed** in favour of the new core **SystemBars** plugin; margins
  handling moves to `env()`/CSS variables. This breaks any edge-to-edge CSS written for 7.
- `appendUserAgent` iOS double-whitespace bug fixed — if you depended on the old string, add a space to
  `ios.appendUserAgent` (not the root key, which would also affect Android).
- `bridge_layout_main.xml` removed → use `capacitor_bridge_layout_main.xml`; add `density` to the activity's
  `android:configChanges` to stop WebView reloads on resize; Gradle property syntax now requires `=`.
- **`@capacitor/push-notifications` 8.0**: `firebaseMessagingVersion` minimum/default moved to **25.0.1**.

**And the 8.5 breaking minor** (<https://capacitorjs.com/docs/updating/8-5>): Capacitor 8.5 adopts the **iOS UIScene
lifecycle** because Xcode 27 requires it. You must add `App/App/SceneDelegate.swift`, a `UIApplicationSceneManifest`
entry in `Info.plist`, and an `application(_:configurationForConnecting:)` hook in `AppDelegate.swift`; `Main.storyboard`
no longer provides the window. Once the scene manifest exists, `application(_:open:options:)`,
`application(_:continue:)` and the AppDelegate foreground/background lifecycle methods **stop being called** — URL
and universal-link handling moves to `SceneDelegate`. Explicitly **unchanged**: `didFinishLaunchingWithOptions`,
`applicationWillTerminate`, and the **remote-notification callbacks (push token registration and delivery)**.
`npx cap migrate` applies the project changes for template-shaped projects.

---

## 2. Android push: `@capacitor/push-notifications` 8.1.3 + FCM

**Versions.** `@capacitor/push-notifications` `latest` = **8.1.3**, released **2026-10-02** (fix: show foreground
notification image on Android). 8.1.0 (2026-05-15) added the iOS `banner`/`list` presentation options; 8.0.4 added
`Importance 0` for notification channels.
Sources: <https://registry.npmjs.org/@capacitor/push-notifications> ·
<https://github.com/ionic-team/capacitor-plugins/blob/main/push-notifications/CHANGELOG.md>

**Required setup (all from <https://capacitorjs.com/docs/apis/push-notifications>).**
- Install: `npm install @capacitor/push-notifications` then `npx cap sync`.
- **`google-services.json` goes in the module (app-level) directory** — i.e. `android/app/google-services.json`.
- **No gradle edits and no manifest edits for Firebase**: "There is no need to add the Firebase SDK to your app or
  edit your app manifest - the Push Notifications provides that for you." The plugin's own `build.gradle` pulls
  `firebase-messaging`.
- The one variable to know: `firebaseMessagingVersion` in `android/app/variables.gradle`, default **`25.0.1`**; the
  root `build.gradle` needs the `com.google.gms:google-services` plugin (8-0 guide raises it to **4.4.4**).
- **Permission flow on Android 13 / targetSdk 33+ is now mandatory**: "Android 13 requires a permission check in
  order to receive push notifications. You are required to call `checkPermissions()` and `requestPermissions()`
  accordingly, when targeting SDK 33." `POST_NOTIFICATIONS` is the runtime permission. Order matters:
  `requestPermissions()` first (it does **not** register), then `register()` — which "does not prompt the user for
  notification permissions".
  Source for the platform side: <https://developer.android.com/develop/ui/views/notifications/notification-permission>
- Optional but recommended: a white-on-transparent notification icon via
  `com.google.firebase.messaging.default_notification_icon`, and a channel via `default_notification_channel_id`
  (`channelId` resolution order: payload → manifest → Firebase SDK fallback). Android 15+ caveat published by the
  plugin: users can install the app into **Private space**, where notifications are suppressed until unlocked and
  the app cannot detect it.

**What the plugin hands you.**
- `'registration'` → `Token { value: string }` — "On iOS it contains the APNS token. On Android it contains the FCM
  token." That single string is what the server sends to.
- `'registrationError'` → `RegistrationError { error: string }`.
- `'pushNotificationReceived'` → `PushNotificationSchema { title, subtitle, body, id, tag (Android only),
  badge (number), notification (documented as "It's not being returned"), data (any), click_action, … }`. **The
  custom JSON you send lives in `data`.**
- `'pushNotificationActionPerformed'` → `ActionPerformed` (fires when the user taps the notification).
- Foreground display is controlled by the `plugins.PushNotifications.presentationOptions` array
  (`badge`, `sound`, `alert` — deprecated on iOS in favour of `banner`/`list`).
Sources: <https://capacitorjs.com/docs/apis/push-notifications> · setup narrative in
<https://capacitorjs.com/docs/guides/push-notifications-firebase>

**Current FCM HTTP v1 send shape.**
- Endpoint: **`POST https://fcm.googleapis.com/v1/projects/{projectId}/messages:send`** — from Google's own API
  discovery document: method `fcm.projects.messages.send`, `httpMethod: POST`, path
  `v1/projects/{projectsId}/messages:send`, base URL `https://fcm.googleapis.com/`.
  Auth: OAuth2 **scope `https://www.googleapis.com/auth/firebase.messaging`** (or
  `https://www.googleapis.com/auth/cloud-platform`), presented as an `Authorization: Bearer <access token>` header
  from a Google **service account**. Source: <https://fcm.googleapis.com/$discovery/rest?version=v1>
- Payload (REST reference, <https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages>): a top-level
  `message` object with mutually exclusive target fields, plus `notification { title, body, image }`, `data` (map of
  **string→string**, UTF-8; keys must not be reserved words such as `from`, `message_type`, or anything starting
  `google.`/`gcm.notification.`), and per-platform `android` / `apns` / `webpush` / `fcm_options` blocks.
- **Note for review:** on that same page the target field `token` is marked **deprecated** — "This item is
  deprecated! **Deprecated: Use `fid` instead**", where `fid` is a Firebase Installation ID, and the doc says
  "during the transition period, this field also accepts a Firebase Installation ID (FID)." The Capacitor plugin
  still returns a registration token, so `token` remains the field you would send today.

**What is different from the Web Push/VAPID path this repo uses today.**
- **No VAPID key pair, and no subscription object** — no `endpoint`, no `p256dh`, no `auth`. The credential is a
  **per-install device token** (`Token.value` from the `registration` event), stored against the user.
- **No service worker.** The `push`/`notificationclick` handlers and the browser permission prompt are replaced by
  `requestPermissions()`/`register()` and the four plugin listeners; the OS renders the notification when the app is
  backgrounded.
- **Server auth changes from a VAPID signature to a Google OAuth2 access token** minted from a service-account
  private key — a new secret and a new dependency in the send path for the Supabase Edge Function.
- **Payload shape changes** from the Web Push `{ title, body, data, icon }`-style body to
  `{ message: { token, notification, data, android/apns } }`; existing `data` values carry through as strings.
- **iOS is only reachable through APNs/FCM**, and the plugin's iOS setup requires the Push Notifications capability
  and posting `.capacitorDidRegisterForRemoteNotifications` from `AppDelegate.swift` — still valid in 8.5, which
  keeps the AppDelegate remote-notification callbacks.
- Web (browser) push and native push are now **two code paths and two senders** from one backend.

---

## 3. Apple guideline 4.2, as worded today

Verbatim from <https://developer.apple.com/app-store/review/guidelines/> (fetched 2026-10-05):

> **4.2 Minimum Functionality**
> "Your app should include features, content, and UI that elevate it beyond a repackaged website. If your app is
> not particularly useful, unique, or 'app-like,' it doesn't belong on the App Store. If your App doesn't provide
> some sort of lasting entertainment value or adequate utility, it may not be accepted. Apps that are simply a song
> or movie should be submitted to the iTunes Store. Apps that are simply a book or game guide should be submitted
> to the Apple Books Store."

Adjacent sub-rules on the same page a wrapped web app must clear: **4.2.2** — "Other than catalogs, apps shouldn't
primarily be marketing materials, advertisements, web clippings, content aggregators, or a collection of links";
**4.2.3(ii)** — disclose download size and prompt before downloading resources needed on first launch; **4.2.6** —
apps from a "commercialized template or app generation service" are rejected unless submitted by the content
provider; **4.1(b)/(c)** and **4.3(a)/(b)** (impersonation; "don't submit apps that are indistinguishable from
what's already widely available"); **1.5** — an easy-to-reach support contact in the app and a Support URL.

**What satisfies vs fails, on the wording.** Satisfies: native-only capability (camera, push, offline, location,
biometrics) used for something the web page cannot do, app-like navigation, and an account-gated experience that is
genuinely useful. Fails: the same responsive page in a WebView with no added capability, browser-chrome feel, or a
screen that is essentially a collection of links. Apple publishes **no** Capacitor-specific rejection list — see
UNVERIFIED.

---

## 4. Deep links in Capacitor 8

**Mechanism.** Universal links (iOS) / App Links (Android): one HTTPS URL that opens the app when installed and the
website when not — "If the app isn't installed, then the user is directed to the website." Because the URL is
HTTPS on a domain you own, no other app can claim it. Inside the app you route yourself: Capacitor's App API
`getLaunchUrl()` gives the launching URL and `appUrlOpen` fires for links received while running.
Sources: <https://capacitorjs.com/docs/guides/deep-links> · <https://capacitorjs.com/docs/android/configuration>

**The exact files for Android.**

1. **`https://<your-domain>/.well-known/assetlinks.json`**, served over HTTPS, containing a JSON **array** of
   statements: `relation: ["delegate_permission/common.handle_all_urls"]` and
   `target: { namespace: "android_app", package_name: "<appId>", sha256_cert_fingerprints: ["<SHA-256 of signing cert>"] }`.
   Google fixes the location: "This is the official name and location for a statement list on a site; **statement
   lists in any other location, or with any other name, are not valid for this site**."
   Sources: <https://developers.google.com/digital-asset-links/v1/getting-started> ·
   <https://capacitorjs.com/docs/guides/deep-links> (generator: <https://developers.google.com/digital-asset-links/tools/generator>)
2. **An intent filter on the main activity in `android/app/src/main/AndroidManifest.xml`** with
   `android:autoVerify="true"`, action `android.intent.action.VIEW`, categories `DEFAULT` + `BROWSABLE`, and
   `<data android:scheme="https" android:host="<your-domain>" />`, on an activity with `android:launchMode="singleTask"`.

**How verification actually runs.** With `autoVerify="true"`, Android 6.0+ inspects every intent filter with action
VIEW + categories BROWSABLE/DEFAULT + scheme http/https and **for each unique hostname fetches
`https://<hostname>/.well-known/assetlinks.json`**; install triggers asynchronous verification (wait ≥20 seconds).
Android 12+ can re-verify manually (`adb shell pm set-app-links --package <pkg> 0 all`, then
`adb shell pm verify-app-links --re-verify <pkg>`, then `adb shell pm get-app-links <pkg>` to read results).
Source: <https://developer.android.com/training/app-links/verify-android-applinks>

**The exact file for iOS.** `https://<your-domain>/.well-known/apple-app-site-association` — **no file extension** —
containing `applinks.details[].appID = "TEAMID.BUNDLEID"`, plus the **Associated Domains** capability with
`applinks:<your-domain>` in Xcode, and Apple Developer enrollment.
Source: <https://capacitorjs.com/docs/guides/deep-links>

**Note for this repo.** Assets are already served from Vercel, so the sibling files go in `public/.well-known/` —
Capacitor's own React guidance: "Place the association files under `public/.well-known`. No additional steps are
necessary."

---

## 5. Google Play requirements for a new personal developer account, and current fees

**Closed-testing rule, quoted from Google's own page**
(<https://support.google.com/googleplay/android-developer/answer/14151465>, fetched 2026-10-05):

> "Developers with personal accounts created after November 13, 2023, must run a closed test for their app with a
> minimum of 12 testers who have been opted in continuously for at least 14 days. When you meet these criteria, you
> can apply for production access on the Dashboard in Play Console to distribute your app on Google Play."

Same page: "At least 12 testers must be opted in to your closed test when you apply for production access, and they
must have been opted in continuously for the preceding 14 days"; testers must be told they have to stay opted in for
at least 14 days; Production and Pre-registration stay **disabled** until the criteria are met; internal testing is
optional and has no requirements; open testing opens only after production access; and you must summarize your
testing feedback when applying.

**Personal vs organization.** Google's account-type page states Play offers exactly two types, "Personal and
Organization", and that they "have access to the same functionality and are able to monetize on Google Play".
Source: <https://support.google.com/googleplay/android-developer/answer/13634885>

**Fees.**
- Google Play: "There is a **US$25** one-time registration fee."
  Source: <https://support.google.com/googleplay/android-developer/answer/6112435>
- Apple: "The **Apple Developer Program annual fee is 99 USD** and the Apple Developer Enterprise Program annual
  fee is 299 USD, in local currency where available." Enrollment via the Apple Developer app is an
  auto-renewable annual subscription.
  Source: <https://developer.apple.com/support/enrollment/>

---

## UNVERIFIED / could not confirm from primary sources

- **Organization accounts exempt from the 12-testers/14-days closed test.** Google's article is scoped in its own
  words to "**personal** developer accounts created after November 13, 2023", and the account-type page never
  mentions testing requirements — so the rule does not apply to organization accounts *as worded*, but I found **no
  primary sentence** saying "organization accounts are exempt". Quote the scope, not an exemption.
- **Apple 4.2 rejection patterns specific to Capacitor/WebView wrappers.** Apple publishes the guideline wording and
  no rejection statistics or per-framework list; its "Common App Rejections" page
  (<https://developer.apple.com/app-store/review/>) is JS-rendered and returned no body text to a plain fetch. Any
  "Capacitor apps get rejected for X" claim is community anecdote, not a primary source.
- **Whether the FCM `token` → `fid` deprecation affects Capacitor's registration token.** The v1 REST reference
  marks `token` deprecated in favour of `fid` (Firebase Installation ID) while saying `token` still works "during
  the transition period". I could not confirm from a primary source whether the Capacitor plugin exposes a FID, or
  what the deprecation timeline is; its API publishes only `Token.value`.
- **Required `Content-Type` / no-redirect rules for `assetlinks.json`.** Google's Digital Asset Links page fixes the
  file's path, name and HTTPS hosting, but I could not extract an explicit `Content-Type: application/json` or
  "redirects are not followed" sentence from the primary pages I fetched.
- **Capacitor 8.5's effect on the push plugin's iOS wiring.** The 8.5 guide asserts the AppDelegate
  remote-notification callbacks keep working; I did not independently verify the plugin under the UIScene lifecycle.
- **Whether Capacitor 9 is imminent.** `next` is 9.0.0-alpha.7 and a `dev` tag exists, so a major is in flight, but
  no primary source gives a date or a breaking-change list.
- **Practical Supabase-auth behaviour on the `https://localhost` origin.** The origin follows from the
  `androidScheme`/`hostname` defaults, but I found no primary source on browser↔shell localStorage/session
  carry-over, so the "users re-authenticate once" consequence above is an inference, not a documented claim.

# Capacitor 8.x Android WebView geolocation — grounding for "Use my location" in the native shell

Research date 2026-10-06. Read-only research; no product file was modified.

**Method and tooling reality.** `web_search` is **dead in this environment** — every call returns
`Error: DeepSeek API error (HTTP 402): Insufficient Balance`. All findings below come from `curl` /
`web_fetch` against primary sources, plus the **installed** Capacitor source in
`node_modules/@capacitor/android` (the strongest source available) and this repo's own build artifacts.
Where a primary source could not be reached or does not state a thing, it is listed as **UNESTABLISHED**
at the end — an invented API shape is worse than a named gap.

Sources used, by kind:

| Kind | Source |
|---|---|
| Installed source (strongest) | `node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/**` |
| Built artifact | `android/app/build/intermediates/merged_manifest/release/processReleaseMainManifest/AndroidManifest.xml` |
| Android platform | `developer.android.com/reference/...`, `developer.android.com/training/...` |
| AOSP | `android.googlesource.com/platform/packages/modules/Permission` |
| Chromium / WebView | `chromium.googlesource.com/chromium/src/+/main/...` |
| WebKit / iOS | `raw.githubusercontent.com/WebKit/WebKit/main/...`, `developer.apple.com/tutorials/data/...` |
| Plugin | `raw.githubusercontent.com/ionic-team/capacitor-geolocation/main/...`, `registry.npmjs.org` |
| Spec | `w3c.github.io/geolocation/` (W3C Geolocation spec) |
| Capacitor docs | `capacitorjs.com/docs/...` |

---

## 1. Exact installed versions (quoted from the files)

`package.json` — two distinct groups, and the distinction matters later:

```json
"dependencies": {
    "@capacitor/android": "^8.5.2",
    "@capacitor/app": "^8.1.2",
    "@capacitor/browser": "^8.0.5",
    "@capacitor/core": "^8.5.2",
    "@capacitor/push-notifications": "^8.1.3",
```
```json
"devDependencies": {
    "@capacitor/cli": "^8.5.2",
```

**The ranges are not the installed versions.** Resolved from `node_modules/@capacitor/*/package.json`
and cross-checked against `package-lock.json`:

| Package | Declared in `package.json` | **Actually installed** |
|---|---|---|
| `@capacitor/core` | `^8.5.2` | **8.5.2** |
| `@capacitor/android` | `^8.5.2` | **8.5.2** |
| `@capacitor/cli` | `^8.5.2` (devDependency) | **8.5.2** |
| `@capacitor/app` | `^8.1.2` | 8.1.2 |
| `@capacitor/browser` | `^8.0.5` | 8.0.5 |
| `@capacitor/push-notifications` | `^8.1.3` | 8.1.3 |
| **`@capacitor/geolocation`** | **absent** | **ABSENT — not in `node_modules`** |

`android/variables.gradle` — quoted in full for the SDK numbers:

```gradle
ext {
    minSdkVersion = 24
    compileSdkVersion = 36
    targetSdkVersion = 36
    androidxActivityVersion = '1.11.0'
    androidxAppCompatVersion = '1.7.1'
    androidxCoordinatorLayoutVersion = '1.3.0'
    androidxCoreVersion = '1.17.0'
    androidxFragmentVersion = '1.8.9'
    coreSplashScreenVersion = '1.2.0'
    androidxWebkitVersion = '1.14.0'
    junitVersion = '4.13.2'
    androidxJunitVersion = '1.3.0'
    androidxEspressoCoreVersion = '3.7.0'
    cordovaAndroidVersion = '14.0.1'
}
```

`android/build.gradle`: `classpath 'com.android.tools.build:gradle:8.13.0'`, `com.google.gms:google-services:4.4.4`.
`android/app/build.gradle:13-18`: `namespace = "app.dropin.playdate"`, `applicationId "app.dropin.playdate"`,
`compileSdk`/`minSdkVersion`/`targetSdkVersion` all read from `rootProject.ext` above.

⚠️ **`targetSdkVersion = 36` is load-bearing for §2 and §4** — the Android docs' secure-origin rule and the
Android 12+ approximate-location behaviour are both gated on target SDK.

**The WebView origin is `https://localhost`.** `capacitor.config.ts` sets `webDir: 'dist'` and **no**
`server.url`, so assets are served over the local scheme; the Capacitor config reference documents
`server.hostname` default `localhost` and `server.androidScheme` default `https`. Consequence: the page is a
**secure context**, so `navigator.geolocation` exists — which is why the button renders at all. Source:
<https://capacitorjs.com/docs/config> and the sibling research file
`research/native-apps/2026-10-05-capacitor-grounding.md` §1.

**What the OS actually sees — measured, not inferred.** The built merged manifest at
`android/app/build/intermediates/merged_manifest/release/processReleaseMainManifest/AndroidManifest.xml`
(generated 2026-10-06 14:53) contains exactly these `uses-permission` entries and **zero** occurrences of
the string "location":

```
android.permission.ACCESS_NETWORK_STATE
android.permission.INTERNET
android.permission.POST_NOTIFICATIONS
android.permission.WAKE_LOCK
app.dropin.playdate.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION
com.google.android.c2dm.permission.RECEIVE
```

`POST_NOTIFICATIONS` / `c2dm.permission.RECEIVE` / `WAKE_LOCK` are merged in from
`@capacitor/push-notifications`. `android/app/src/main/AndroidManifest.xml` declares only
`android.permission.INTERNET` by hand. **Capacitor core's own library manifest declares nothing at all** —
`node_modules/@capacitor/android/capacitor/src/main/AndroidManifest.xml` is an empty
`<manifest>` element. So no Capacitor package will ever add a location permission for us.

---

## 2. THE DIRECT ANSWER — is a manifest permission alone enough, or is the plugin required?

**Manifest permission alone IS sufficient to make the web `navigator.geolocation` path work in Capacitor
8.5.2 — Capacitor does implement the WebView geolocation callback and does request the Android runtime
permission. The plugin is NOT required for a working flow.** Three conditions must hold simultaneously,
and the app currently meets **zero** of them:

1. **The app must declare a location permission in the manifest.** ← currently missing.
2. **The host app must implement `WebChromeClient.onGeolocationPermissionsShowPrompt`.** ← Capacitor does
   this for us (`BridgeWebChromeClient.java:246-273`).
3. **The page's origin must be secure (https).** ← already true (`https://localhost`).

### 2a. `setGeolocationEnabled` — WHERE and whether it is on by default

**Installed source, exact lines.** It is set **unconditionally, with no config gate**, in
`Bridge.initWebView()`:

> `node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/Bridge.java:586-591`
> ```java
> @SuppressLint("SetJavaScriptEnabled")
> private void initWebView() {
>     WebSettings settings = webView.getSettings();
>     settings.setJavaScriptEnabled(true);
>     settings.setDomStorageEnabled(true);
>     settings.setGeolocationEnabled(true);        // <-- line 591
> ```

And `Bridge.java:280` installs Capacitor's own chrome client, which is what makes §2b possible:
```java
webView.setWebChromeClient(new BridgeWebChromeClient(this));   // line 280
```
`android/app/src/main/java/app/dropin/playdate/MainActivity.java` is
`public class MainActivity extends BridgeActivity {}` — no custom WebView, no custom chrome client, no plugin
registration — so this default path is exactly what runs on the device.

**The Android platform docs confirm the default is already `true` and state the two other requirements
verbatim.** From
<https://developer.android.com/reference/android/webkit/WebSettings#setGeolocationEnabled(boolean)>:

> `public abstract void setGeolocationEnabled (boolean flag)`
> "Sets whether Geolocation is enabled. **The default is true.**
> Please note that in order for the Geolocation API to be usable by a page in the WebView, the following
> requirements must be met:
> - an application must have permission to access the device location, see
>   `Manifest.permission.ACCESS_COARSE_LOCATION`, `Manifest.permission.ACCESS_FINE_LOCATION`;
> - an application must provide an implementation of the `WebChromeClient.onGeolocationPermissionsShowPrompt`
>   callback to receive notifications that a page is requesting access to location via the JavaScript
>   Geolocation API."

So Capacitor's `setGeolocationEnabled(true)` at `Bridge.java:591` is redundant-but-explicit; the real gate
is the manifest permission plus `onGeolocationPermissionsShowPrompt`.

**Secure-origin rule, from the platform docs** —
<https://developer.android.com/reference/android/webkit/WebChromeClient#onGeolocationPermissionsShowPrompt(java.lang.String,%20android.webkit.GeolocationPermissions.Callback)>:

> "Notify the host application that web content from the specified origin is attempting to use the
> Geolocation API, but no permission state is currently set for that origin. The host application should
> invoke the specified callback with the desired permission state. …
> **Note that for applications targeting Android N and later SDKs (API level > `Build.VERSION_CODES.M`)
> this method is only called for requests originating from secure origins such as https. On non-secure
> origins geolocation requests are automatically denied.**"

`targetSdkVersion = 36` > M, and the origin is `https://localhost`, so this method **is** called. This is
also the authoritative statement behind the app's existing `unsupported` branch: on a non-secure origin the
WebView denies automatically (and in Chrome/WebView the API is additionally absent on an insecure origin,
which is what `isGeolocationAvailable()` at `src/lib/geolocation.ts:68-74` detects).

### 2b. The mechanism that produces today's silent `denied`

See §3 for the full chain with the quoted implementation. The short version: because neither
`ACCESS_COARSE_LOCATION` nor `ACCESS_FINE_LOCATION` is in the manifest, Capacitor's
`onGeolocationPermissionsShowPrompt` launches a runtime-permission request that Android resolves
**immediately and negatively without drawing any UI**, then calls
`callback.invoke(origin, false, false)` (`BridgeWebChromeClient.java:263`), and the WebView reports
`PERMISSION_DENIED` to the page. **No OS prompt is ever shown** — which is exactly the measured symptom.

### 2c. The one real trap in the manifest-only path (and it is counterintuitive)

If you fix only the manifest, Capacitor requests **both** permissions
(`BridgeWebChromeClient.java:249`), so on Android 12+ the parent sees the **Approximate / Precise** choice.
The app calls `getCurrentPosition` with **`enableHighAccuracy: false`** (`src/lib/geolocation.ts:112`).
In current Chromium, when the app holds **precise** permission but the page asked for **low** accuracy, the
Android location provider **reports an error instead of a coarse fix**:

> `services/device/geolocation/android/java/src/org/chromium/device/geolocation/LocationProviderAndroid.java:61-73`
> ```java
> // When Chrome is granted with app-level precise permission, we cannot generate
> // approximate (coarse) location using Criteria. To avoid leaking precise location
> // when coarse location is requested, report a position error.
> // See crbug.com/502587667.
> if (PermissionsAndroidFeatureMap.isEnabled(
>                 PermissionsAndroidFeatureList.APPROXIMATE_GEOLOCATION_PERMISSION)
>         && !enableHighAccuracy
>         && mContext.checkCallingOrSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
>                 == PackageManager.PERMISSION_GRANTED) {
>     unregisterFromLocationUpdates();
>     LocationProviderAdapter.newErrorAvailable("Cannot generate approximate location.");
>     return;
> }
> ```

The feature is **enabled by default on Android** —
`components/content_settings/core/common/features.cc:42-48`:
```cpp
BASE_FEATURE(kApproximateGeolocationPermission,
#if BUILDFLAG(IS_ANDROID)
             base::FEATURE_ENABLED_BY_DEFAULT
#else
             base::FEATURE_DISABLED_BY_DEFAULT
#endif
);
```
It is compiled into WebView, not just Chrome — `android_webview/browser/aw_permission_manager.cc:57-61`
gates on `content_settings::features::kApproximateGeolocationPermission`, and `:358-362` handles
`PermissionType::GEOLOCATION_APPROXIMATE` with the comment
`// TODO(crbug.com/466367918): Decide whether we want to support a separate approximate only geolocation permission in webview.`

The call path that reaches that `start(boolean)` is
`geolocation_impl.cc:57-59` → `const bool effective_high_accuracy = high_accuracy_hint_ && has_precise_permission_;`
→ `LocationProviderManager::StartProvider(enable_high_accuracy)` (`location_provider_manager.cc:138-163`)
→ `platform_location_provider_->StartProvider(...)`.

**Consequence table for the manifest-only fix, `enableHighAccuracy: false`:**

| Parent's OS choice | FINE granted? | `start(false)` sees FINE granted? | Result |
|---|---|---|---|
| "Approximate" | no | no | coarse fix returned — **works** |
| "Precise" | yes | **yes** | **error "Cannot generate approximate location"** → surfaces as `POSITION_UNAVAILABLE` → app's `unavailable` |

So a manifest-only fix would work for the parent who taps *Approximate* and fail for the parent who taps
*Precise* — the opposite of the intuitive expectation. Flipping the app to `enableHighAccuracy: true`
removes the trap in **both** branches (with `true`, `LocationProviderAndroid.start(true)` never enters the
guard; and if the parent chose Approximate, `has_precise_permission_` is false → `start(false)` is called
but `checkCallingOrSelfPermission(FINE)` is *not* granted → guard does not fire either).

⚠️ **Version caveat.** This guard is in Chromium `main` today and the WebView on a device is updated
independently by the Play Store, so whether the installed WebView contains it at a given moment is
**UNESTABLISHED** (see final section). Treat it as a live risk to verify on hardware, not as a certainty.

### 2d. Recommendation, with the tradeoff

- **Lowest-risk manifest-only path:** add both permissions to `AndroidManifest.xml` **and** change
  `src/lib/geolocation.ts:112` to `enableHighAccuracy: true`. ~15 lines of JSON+TS, no new dependency, no
  native rebuild of JS APIs. Tradeoff: the app cannot say *why* it failed — every non-grant failure still
  collapses into `unavailable` (see §4), and you are exposed to whatever Chromium does next with the
  approximate-location feature.
- **Most robust path:** add the manifest permissions **and** `@capacitor/geolocation` (see §6), then call
  `Geolocation.getCurrentPosition` instead of the web API. Tradeoff: a new dependency and a JS call-site
  change, but you get a real error taxonomy (code 18 for a missing manifest entry, code 7 for location
  services off) and you bypass Chromium's WebView geolocation entirely.

---

## 3. The permission-flow sequence a parent actually experiences

### 3a. TODAY (zero location permissions in the manifest) — nothing appears

**Measured fact:** the button reaches `denied` every time. The mechanism, quoted from installed source:

> `node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/BridgeWebChromeClient.java:245-273`
> ```java
> @Override
> public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
>     super.onGeolocationPermissionsShowPrompt(origin, callback);
>     Logger.debug("onGeolocationPermissionsShowPrompt: DOING IT HERE FOR ORIGIN: " + origin);
>     final String[] geoPermissions = { Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION };
>
>     if (!PermissionHelper.hasPermissions(bridge.getContext(), geoPermissions)) {
>         permissionListener = (isGranted) -> {
>             if (isGranted) {
>                 callback.invoke(origin, true, false);
>             } else {
>                 final String[] coarsePermission = { Manifest.permission.ACCESS_COARSE_LOCATION };
>                 if (
>                     Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
>                     PermissionHelper.hasPermissions(bridge.getContext(), coarsePermission)
>                 ) {
>                     callback.invoke(origin, true, false);
>                 } else {
>                     callback.invoke(origin, false, false);
>                 }
>             }
>         };
>         permissionLauncher.launch(geoPermissions);
>     } else {
>         // permission is already granted
>         callback.invoke(origin, true, false);
>         Logger.debug("onGeolocationPermissionsShowPrompt: has required permission");
>     }
> }
> ```

Chain, step by step:

1. Page calls `navigator.geolocation.getCurrentPosition` → WebView asks the app.
2. Android only calls `onGeolocationPermissionsShowPrompt` for a **secure origin** (docs quoted in §2a) —
   satisfied, origin is `https://localhost`.
3. Capacitor's `PermissionHelper.hasPermissions(context, {COARSE, FINE})`
   (`util/PermissionHelper.java:25-32` → `ActivityCompat.checkSelfPermission(...)`) returns **false**,
   because nothing is granted.
4. `permissionLauncher.launch({COARSE, FINE})` — the launcher is registered in the constructor as
   `bridge.registerForActivityResult(new ActivityResultContracts.RequestMultiplePermissions(), permissionCallback)`
   (`BridgeWebChromeClient.java:69`), and the callback folds the map to a single boolean, `granted = false`
   if **any** entry is false (`:59-68`).
5. Because neither permission is declared in the manifest, the request resolves **immediately and
   negatively with no UI**. Platform basis: `Activity.requestPermissions` — "Requests permissions to be
   granted to this application. **These permissions must be requested in your manifest**…"
   (<https://developer.android.com/reference/android/app/Activity#requestPermissions(java.lang.String%5B%5D,int)>),
   and the permissions guide — "**In certain situations, the permission might be denied automatically,
   without the user taking any action.**"
   (<https://developer.android.com/training/permissions/requesting>, "Handle permission denial").
6. `isGranted == false` → the fallback checks whether **COARSE alone** is granted. It is not → so
   **`callback.invoke(origin, false, false)`** (`:263`).
7. WebView → `GeolocationPermissionLevel::kDenied` → Chromium emits `kPermissionDenied`
   (`services/device/geolocation/geolocation_impl.cc:156-163`, carrying `"User denied Geolocation"`) → Blink
   surfaces `GeolocationPositionError` code **1**.
8. `src/lib/geolocation.ts:105-108` maps code 1 to `{ status: 'denied' }`.

**What the parent sees: nothing. No dialog, no system prompt, no explanation — just the app's `denied`
note.** That is the bug, and it is fully explained by the manifest.

### 3b. AFTER a manifest-only fix — the OS prompts, twice-over (once for permission, once for the app-level decision)

1. Parent taps **"Use my location"**.
2. **The Android system dialog appears** — this is the OS's own `PermissionController` UI, not Capacitor's
   and not the app's. On Android 12+ (SDK 36) it offers **"While using the app"** and, because Capacitor
   requests both COARSE and FINE, an **"Approximate"/"Precise"** toggle. Its buttons are Android's words,
   e.g. **"While using the app"** / **"Only this time"** / **"Don't allow"**, plus the precise toggle.
   Capacitor shows **no** app-owned dialog of its own — the only UI is the OS one. (The app-owned
   `AlertDialog` builder in this same file, `BridgeWebChromeClient.java:~200-238`, is used for JS
   `alert`/`confirm`/`prompt`, **not** for geolocation.)
3. Capacitor's callback fires and calls `callback.invoke(origin, true, false)` — allow, and **`retain=false`**.
4. The page receives a position. Note `retain=false`: the WebView does **not** remember the decision for the
   origin, so the app gets the prompt path again next time (subject to Android's own `USER_SET`/`USER_FIXED`
   flags).
5. If the parent taps **Don't allow** once, Android records `USER_SET`; Capacitor's listener sees
   `isGranted == false`, the COARSE fallback fails, and the page gets `PERMISSION_DENIED`.
6. **Second denial** → Android docs: "if the user taps Deny for a specific permission more than once during
   your app's lifetime of installation on a device, **the user will no longer see the system permissions
   dialog** if your app requests that permission again. The user's action implies 'don't ask again,' and is
   considered a **permanent denial**."
   (<https://developer.android.com/training/permissions/requesting>; `adb shell dumpsys package <pkg>` flags
   `USER_SET` for a once-denied permission and `USER_FIXED` for a permanent one.) From then on the tap
   produces the same silent `denied` as today's bug — **indistinguishable to the app from the
   missing-permission case.**

### 3c. WITH `@capacitor/geolocation` — the app asks first, and controls the ask

1. Parent taps the button → JS calls `Geolocation.checkPermissions()` / `requestPermissions()`.
   Both are overridden in the plugin (`GeolocationPlugin.kt:64-72`) to first call
   `checkLocationState`, which **errors with code 7, "Location services are not enabled."** if the OS master
   location switch is off — before any permission UI.
2. `getAlias` (`GeolocationPlugin.kt:189-197`) picks the alias from the manifest state and the
   `enableHighAccuracy` flag:
   ```kotlin
   val shouldRequestFine =
       hasFine && (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || enableHighAccuracy)
   return if (shouldRequestFine) LOCATION_ALIAS else COARSE_LOCATION_ALIAS
   ```
   With SDK 36 and `enableHighAccuracy = false`, the plugin requests **`ACCESS_COARSE_LOCATION` only** — so
   the OS dialog has **no Approximate/Precise toggle at all**, and the Chromium "cannot generate approximate
   location" trap of §2c cannot arise.
3. If **neither** location permission is declared, the plugin does not even ask: `getAlias` returns `null`
   and the call rejects with error **`OS-PLUG-GLOC-0018`**
   (`GeolocationPlugin.kt:118-121`, `GeolocationErrors.kt:77-80`):
   > "Location permissions are not declared in manifest. Make sure at least ACCESS_COARSE_LOCATION is declared
   > in AndroidManifest.xml, and optionally ACCESS_FINE_LOCATION if you require precise location access."
4. After the prompt, `handlePermissionResult` (`:154-160`) proceeds if **COARSE** is granted; only if coarse
   is also denied does it reject with `OS-PLUG-GLOC-0003` "Location permission request was denied."
   **So the plugin treats "Approximate" as success.**
5. The actual fix comes from the native controller `io.ionic.libs.iongeolocationlib.IONGLOCController`
   (Google Play Services `FusedLocationProvider`, with an `enableLocationFallback` to the Android
   `LocationManager`), **not** from Chromium — which is why it sidesteps the WebView entirely.

---

## 4. Outcome taxonomy mapping — and what the app cannot distinguish

The app's taxonomy is `granted | denied | unavailable | unsupported`
(`src/lib/geolocation.ts:57-61`). The normative mapping is the W3C Geolocation spec's failure algorithm,
<https://w3c.github.io/geolocation/> ("Dealing with failures"):

> "**User or system denied permission:** Call back with error passing errorCallback and `PERMISSION_DENIED`.
> *Note: Browser permission VS OS permission* — On certain platforms, there can be a circumstance where the
> user has granted the user agent permission to use Geolocation at the browser-level, but the permission to
> access location services has been denied at the OS level.
> **Timeout elapsed:** Call back with error with errorCallback and `TIMEOUT`.
> **Data acquisition error or any other reason:** Call back with error passing errorCallback and
> `POSITION_UNAVAILABLE`."

The spec also states, in the "Request a position" algorithm (`geoloc.txt` lines 822-825): "If geolocation's
environment settings object is a **non-secure context**: … Call back with error passing errorCallback and
**PERMISSION_DENIED**."

The app maps (`src/lib/geolocation.ts:101-110`):
```ts
if (error.code === error.PERMISSION_DENIED) { resolve({ status: 'denied' }); return }
resolve({ status: 'unavailable' })      // everything else: POSITION_UNAVAILABLE and TIMEOUT
```
and `unsupported` only when the API object is absent (`:68-74`, `:87`).

| Real-world case | Web API result | App status today | Correct? |
|---|---|---|---|
| Permission never requested, **not declared in manifest** (today) | code 1 `PERMISSION_DENIED` (immediate, no UI) | `denied` | ❌ misleading — the parent never denied anything |
| Permission declared, parent taps **Don't allow** (1st time) | code 1 | `denied` | ✅ |
| Denied permanently ("Don't ask again") | code 1, and **no UI appears** | `denied` | ✅ status, ❌ copy: must send them to **Settings**, not to a prompt that will not appear |
| Android 12+ parent chooses **Approximate** | **success**, coarse coords | `granted` | ✅ (see §5) |
| Android 12+, **Precise** granted, `enableHighAccuracy:false` | possibly `POSITION_UNAVAILABLE` (Chromium guard, §2c) | `unavailable` | ❌ blames signal for a Chromium policy |
| **Location services (GPS) off at the OS level** | `POSITION_UNAVAILABLE` (spec's "data acquisition error"; Chromium reports `kPositionUnavailable` from `LocationProviderManager::StartProvider` when no provider initialises — `location_provider_manager.cc:138-145`) | `unavailable` | ⚠️ status defensible, but **the app cannot say "turn Location on"** — the single most actionable message available |
| **Timeout** elapsed (10 s, `geolocation.ts:39`, `:113`) | code 3 `TIMEOUT` | `unavailable` | ✅ status, ❌ cannot offer "try again with more time" vs "no signal" |
| Non-secure origin | API absent in WebView/Chrome → `unsupported`; if it were present, spec says code 1 | `unsupported` | ✅ for the shell (`https://localhost`) |
| No GPS hardware / no provider | code 2 | `unavailable` | ✅ |

### What the current taxonomy **cannot distinguish**

1. **`denied` conflates "never asked and cannot ask" with "the parent said no".** Today's bug is case 1
   reported as a refusal the parent never made. Even after the manifest fix, *permanent denial* and
   *missing manifest entry* produce the **identical** signal (code 1, zero UI) — the app can only tell them
   apart by knowing it declared the permission, i.e. by construction, not by observation.
2. **`unavailable` conflates four different things:** location services off at OS level; genuine no-signal /
   acquisition failure; the 10-second timeout; and the Chromium approximate-vs-precise policy error. The
   W3C spec gives `TIMEOUT` its own code (3) that the app **throws away** — `error.code` is available and is
   not used except for the `PERMISSION_DENIED` check.
3. **Nothing can distinguish "Approximate" from "Precise".** The web API hands back `position.coords.accuracy`
   (a 95%-confidence radius in metres, per the spec's `positionData` definition) but the app discards it —
   `readDeviceCoords` returns only `{ lat, lng }` (`geolocation.ts:42-45`, `:99`). **A coarse fix and a
   precise fix are indistinguishable to every caller today**, and the accuracy value needed to distinguish
   them is dropped on the floor at `geolocation.ts:92-99`.
4. **`unsupported` is unreachable in the shipped shell** — the origin is always `https://localhost`, so the
   branch exists for the LAN dev server only.

**The plugin closes gaps 1 (code 18 vs code 3), 2 (code 7 "Location services are not enabled" vs code 10
timeout vs code 2 generic vs code 17 network+location off) and can close 3 (it returns `coords.accuracy`, and
`checkPermissions()` returns separate `location` and `coarseLocation` states).** It does **not** give a
"precise vs approximate was chosen" boolean directly, but `PermissionStatus.coarseLocation` plus the
`location` alias distinction is the closest primary-source-backed signal. Source for the plugin error table:
`@capacitor/geolocation` README <https://capacitorjs.com/docs/apis/geolocation> ("Errors") and the source
`GeolocationErrors.kt`.

---

## 5. Does Android 12+ approximate location break the app's purpose?

**No — and the app already asks for it, but it cannot tell that it got it.** The app geocodes an address from
coordinates to place a playdate; a playdate is a park/venue in a neighbourhood, not a doorway.

**Accuracy, from the Android docs** —
<https://developer.android.com/training/location/permissions>, "Accuracy":

> "**Approximate** — Provides a device location estimate. If this location estimate is from the
> `LocationManagerService` or `FusedLocationProvider`, this estimate is accurate to **within about 3 square
> kilometers (about 1.2 square miles)**. Your app can receive locations at this level of accuracy when you
> declare the `ACCESS_COARSE_LOCATION` permission but not the `ACCESS_FINE_LOCATION` permission.
> **Precise** — … usually within about 50 meters (160 feet) … and is sometimes as accurate as within a few
> meters (10 feet) or better. …"

> "If the user grants the approximate location permission, your app only has access to approximate location,
> **regardless of which location permissions your app declares**."
> "**Your app should still work when the user grants only approximate location access.**"

Note the two primary sources describe coarse differently and are not interchangeable: Android's guide states
a **~3 km² area** (a radius around ~1 km), while the plugin README says
"variable accuracy but usually around **2 kilometers**"
(<https://capacitorjs.com/docs/apis/geolocation>). Both are primary; quote whichever you use, and do not
average them. **UNESTABLISHED** which figure a given device actually returns.

**What the app asks for, and what the WebView asks the OS for — two different questions:**

- The **app** passes `enableHighAccuracy: false` (`src/lib/geolocation.ts:112`). Per the W3C spec
  (<https://w3c.github.io/geolocation/>, §7.1) this is *only a hint*: "the implementation MAY avoid using
  geolocation providers that consume a significant amount of power (e.g., GPS)." It is **not** a request for
  coarse permission.
- The **WebView** layer: Capacitor's `onGeolocationPermissionsShowPrompt` requests **both**
  `ACCESS_COARSE_LOCATION` and `ACCESS_FINE_LOCATION` (`BridgeWebChromeClient.java:249`), independent of the
  page's hint. So on Android 12+ the OS will show the **Approximate/Precise toggle** on a manifest-only fix,
  and if the parent picks Precise the app receives a **precise** fix even though the page asked for low
  accuracy. Only the plugin makes the ask match the intent (COARSE alias when `enableHighAccuracy=false`,
  §3c).
- Chromium then maps the hint to provider accuracy as
  `effective_high_accuracy = high_accuracy_hint_ && has_precise_permission_`
  (`geolocation_impl.cc:57-59`) → `Criteria.ACCURACY_FINE`/`ACCURACY_COARSE`
  (`LocationProviderAndroid.java:171-181`).

**Verdict:** a ~1-2 km radius is *ample* for "which park is near me" geocoding, so approximate genuinely
suffices for this app's stated purpose. The real problem is not the accuracy — it is that
**`coords.accuracy` is discarded** (`geolocation.ts:92-99`), so the app cannot detect a coarse fix, cannot
warn the parent that the geocoded address may be a neighbourhood centroid, and cannot offer "use precise
location" as the Android guide recommends ("If a feature in your app absolutely requires access to precise
location … you can ask the user to allow your app to access precise location"). Do **not** require precise:
the guide explicitly says the app should still work on approximate.

---

## 6. `@capacitor/geolocation` (current) vs the WebView path

**Current version: `8.2.3`, published 2026-10-02.** From the npm registry
<https://registry.npmjs.org/@capacitor/geolocation> (dist-tags: `latest` = `8.2.3`,
`latest-7` = `7.1.8`, `next` = `9.0.0-next.3`, and a curious `dev` = `8.3.0-locationbutton.8`).

**Capacitor 8 compatibility: yes, explicitly.**
`peerDependencies: { "@capacitor/core": ">=8.0.0" }`, and the 8.x line starts at `8.0.0` published
2025-12-08 — the same day as Capacitor 8 itself. It declares one runtime dependency,
`@capacitor/synapse ^1.0.4`. Install would be `npm install @capacitor/geolocation && npx cap sync`
(README, <https://capacitorjs.com/docs/apis/geolocation>).

**⚠️ The plugin does NOT declare the permissions for you.** Its own Android library manifest
(`android/src/main/AndroidManifest.xml` in `ionic-team/capacitor-geolocation`) is an **empty `<manifest>`
element** — identical to Capacitor core's. The README states the requirement explicitly:

> "This plugin requires the following permissions be added to your `AndroidManifest.xml`:
> ```xml
> <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
> <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
> <uses-feature android:name="android.hardware.location.gps" />
> ```
> The first two permissions ask for location data, both fine and coarse, and the last line is optional but
> necessary if your app _requires_ GPS to function."

Confirmed by the plugin's own example app manifest
(`example-app/android/app/src/main/AndroidManifest.xml`), which declares both permissions by hand.
**So adding the plugin without adding the manifest permissions changes nothing about the failure** — the
plugin would instead fail with its own code 18. The manifest edit is required in **every** approach.

**What the plugin adds or changes, concretely:**

| Dimension | WebView path (manifest only) | Plugin `8.2.3` |
|---|---|---|
| Who asks for the Android permission | Capacitor's `BridgeWebChromeClient` implicitly, as a side effect of the page's request | The app, explicitly and first, via `requestPermissions()` |
| Accuracy control | hint only; Capacitor still requests COARSE+FINE (so the toggle appears) | `getAlias` requests **only COARSE** when `enableHighAccuracy=false` on API ≥ 31 |
| Missing-manifest detection | **impossible** — looks exactly like a denial | explicit error `OS-PLUG-GLOC-0018` |
| Location services off | `POSITION_UNAVAILABLE`, indistinguishable from no-signal | explicit error `OS-PLUG-GLOC-0007` ("Location services are not enabled.") before any prompt; also `-0017` for both network+location off, `-0016` settings error, `-0014/-0015` Play Services |
| Timeout | code 3, discarded by the app | `OS-PLUG-GLOC-0010` |
| Provider | Chromium's WebView location (subject to the §2c policy guard) | `IONGLOCController` over Google Play Services `FusedLocationProvider`, with `enableLocationFallback` (default **`true`**) to the Android `LocationManager` when Play Services checks fail |
| Foreground/background | one-shot only, as the app uses it | `watchPosition`/`clearWatch` with Android-only `interval` (8.0.0) and `minimumUpdateInterval` (6.1.0); the README states the plugin "does not support background geolocation directly" on iOS |
| Permission state introspection | none | `checkPermissions()` → `{ location, coarseLocation }`; `PermissionState = 'prompt'｜'prompt-with-rationale'｜'granted'｜'denied'` |
| Returns | `GeolocationPosition` | `Position` incl. `coords.accuracy`, `altitudeAccuracy`, `magneticHeading`, `trueHeading`, `headingAccuracy`, `course` |

**Required or not?** **Not required for reliability in the narrow sense** — the WebView path works once the
manifest declares the permission, because Capacitor implements the callback (§2). **But it is the only way to
distinguish the failure cases the app currently cannot tell apart** (§4), and it is the only way to control
whether the OS shows the Approximate/Precise toggle. Given that this app's entire failure mode is *misreporting
the cause*, the plugin's error taxonomy is the substantive argument for it — not the fix itself.

---

## 7. The iOS half (deferred slice 2a) — do NOT implement anything here

### 7a. `Info.plist` keys

Capacitor's iOS guide says only: "iOS permissions do not need to be specified explicitly like they are in
Android. However, iOS requires 'Usage Descriptions' to be defined in `Info.plist`."
(<https://capacitorjs.com/docs/ios/configuration>). The specific keys, from Apple:

- **`NSLocationWhenInUseUsageDescription`** — *required* for foreground use.
  <https://developer.apple.com/documentation/bundleresources/information-property-list/nslocationwheninuseusagedescription>
  > "Use this key if your iOS app accesses location information only when running in the foreground. …
  > This key is required if your iOS app uses APIs that access the user's location information while the app
  > is in use."
- **`NSLocationAlwaysAndWhenInUseUsageDescription`** — required **only** for background/Always access.
  <https://developer.apple.com/documentation/bundleresources/information-property-list/nslocationalwaysandwheninuseusagedescription>
  > "…This key is required if your iOS app uses APIs that access the user's location information at all times."

The plugin README asks for **both**, and gives the reason — it links `ion-ios-geolocation`, which "can report
location in the background. As a result, Apple requires you to include a
`NSLocationAlwaysAndWhenInUseUsageDescription` entry in your `Info.plist`. Since this permission prompt
won't appear to users, you can safely use the same description string as for
`NSLocationWhenInUseUsageDescription`." A plugin-free app that only reads a foreground fix needs only the
**WhenInUse** key. `NSLocationAlwaysUsageDescription` is the pre-iOS-11 key and is **not** requested by the
plugin README — **UNESTABLISHED** whether Apple's current tooling still requires it for deployment target
iOS 15 (the sibling research records Capacitor 8's iOS deployment target as 15.0, so it should not).

**What happens if the key is missing** — Apple, "Requesting authorization to use location services"
(<https://developer.apple.com/documentation/corelocation/requesting-authorization-to-use-location-services>):

> "Add all usage description keys to your app's Information Property List **before you make any authorization
> requests. Authorization requests fail immediately if the required keys aren't present.**"

So: no prompt, immediate failure. On iOS 15+ the app is not terminated for a missing location string (that
is the camera/mic family), it simply never gets authorized.

### 7b. iOS is a **different** story from Android — WKWebView prompts by itself

This is the important asymmetry, established from WebKit source
(`Source/WebKit/UIProcess/ios/WKGeolocationProviderIOS.mm`, fetched from
`raw.githubusercontent.com/WebKit/WebKit/main/…`). The file's own comments number the flow:

> `WKGeolocationProviderIOS.mm:162-180`
> ```objc
> - (void)decidePolicyForGeolocationRequestFromOrigin:(WebKit::FrameInfoData&&)frameInfo completionHandler:(Function<void(bool)>&&)completionHandler view:(WKWebView *)contentView
> {
>     ...
>     _requestsWaitingForCoreLocationAuthorization.append(WTF::move(geolocationRequestData));
>     if (_coreLocationProvider) {
>         // Step 1: ask the user if the app can use Geolocation.
>         [_coreLocationProvider requestGeolocationAuthorization];
>     } else {
>         // Step 1: ask CoreLocation if the app can use Geolocation.
>         WebCore::CoreLocationGeolocationProvider::requestAuthorization(registrableDomain, [self, strongSelf = retainPtr(self)](bool authorized) {
>             if (authorized) [self geolocationAuthorizationGranted];
>             else [self geolocationAuthorizationDenied];
>         });
>     }
> }
> ```
> `:187-189`
> ```objc
> - (void)geolocationAuthorizationGranted
> {
>     // Step 2: ask the user if this particular page can use geolocation.
> ```

**Step 1 is WebKit itself calling CoreLocation's authorization request** — so on iOS the web API *does*
trigger the system prompt, and the app does **not** have to call
`CLLocationManager.requestWhenInUseAuthorization()` for the web path to work. (Contrast Android, where
Capacitor must request the runtime permission.) The gating is the `Info.plist` key from §7a.

**Step 2 is a second, WebKit-owned, per-origin alert.** If the app's `WKUIDelegate` does not implement the
(private-SPI at the time) `_webView:requestGeolocationAuthorizationForURL:frame:decisionHandler:`, WebKit
falls through to `WKWebGeolocationPolicyDecider`
(`WKGeolocationProviderIOS.mm:199-213`), which builds its own `UIAlertController`
(`WKWebGeolocationPolicyDeciderIOS.mm:178-200`):

> title: `"“%@” would like to use your current location."` (the parameter is the **host**)
> message: `"This website will use your precise location because “%@” currently has access to your precise
> location."` **or** `"This website will use your approximate location because “%@” currently has access to
> your approximate location."` — chosen by `appHasPreciseLocationPermission()`, which reads
> `CLLocationManager.authorizationStatus` and `accuracyAuthorization == CLAccuracyAuthorizationFullAccuracy`
> (`:64-71`)
> buttons: **"Allow"** and **"Don't Allow"**

so the iOS parent sees **two** prompts (Apple's system prompt with our usage string, then WebKit's
site-scoped Allow/Don't Allow), and the second one's wording depends on the **app's** CoreLocation accuracy
authorization. WebKit also caches the per-origin answer: 2 consecutive allows auto-allow, 2 consecutive
denials auto-deny, resettable by the `com.apple.locationd.appreset` notification (`:53-57`, `:168-176`).

**Does Capacitor interfere?** No. `WebViewDelegationHandler` is the `WKUIDelegate`
(`WebViewDelegationHandler.swift:7` declares `WKNavigationDelegate, WKUIDelegate, …`;
`CAPBridgeViewController.swift:320` assigns `aWebView.uiDelegate = delegationHandler`). It implements
`requestMediaCapturePermissionFor` and `requestDeviceOrientationAndMotionPermissionFor`
(`WebViewDelegationHandler.swift:52-63`) but **contains no geolocation method at all** — a grep for
`geolocation|locationManager|CLLocation` in both `WebViewDelegationHandler.swift` and
`CAPBridgeViewController.swift` returns nothing. So WebKit's own decider alert is what runs.

**New in iOS 27.0: a public hook.** `WKUIDelegate` now documents
`webView(_:requestGeolocationPermissionFor:initiatedByFrame:decisionHandler:)` —
"Allows your app to determine whether or not the given security origin should have access to geolocation
APIs" — with `introducedAt: "27.0"` for iOS/iPadOS/Mac Catalyst/macOS/visionOS
(<https://developer.apple.com/documentation/webkit/wkuidelegate/webview(_:requestgeolocationpermissionfor:initiatedbyframe:decisionhandler:)>).
It is `optional`, and Apple's page publishes **no** statement of what happens when it is unimplemented
(**UNESTABLISHED** as documented text, though the WebKit source above shows the fallback). **Prior to iOS 27
there was no public WKUIDelegate geolocation hook**, so a Capacitor app could not customise step 2 at all.

### 7c. Capacitor 8.5 UIScene — does it touch location? No.

From <https://capacitorjs.com/docs/updating/8-5>:

> "Capacitor 8.5 adopts the iOS UIScene lifecycle. Xcode 27 requires it, so this ships as a breaking minor
> rather than waiting for Capacitor 9. **The changes are iOS only.** … your app project needs to adopt the
> scene lifecycle: one new file, one `Info.plist` entry, and one method in your `AppDelegate`."

The three changes are `App/App/SceneDelegate.swift`, the **`UIApplicationSceneManifest`** `Info.plist`
dictionary, and `application(_:configurationForConnecting:options:)`. The 8.5 page lists exactly what
changes (`SceneDelegateProxy`, scene-scoped notifications, JS resume/pause driven by
`UIScene.willEnterForegroundNotification`, `WebViewDelegationHandler` reading
`windowScene.activationState`) and what keeps working (`didFinishLaunchingWithOptions`,
`applicationWillTerminate`, remote-notification callbacks). **It mentions location nowhere.** The relevance to
slice 2a is indirect and real: the UIScene change is *also* a new `Info.plist` key
(`UIApplicationSceneManifest`), so whoever adds `NSLocationWhenInUseUsageDescription` should be aware the
same file is already being edited for the scene manifest — two unrelated `Info.plist` additions, not one.

---

## 8. Version-specific / surprising things a builder would otherwise get wrong

1. **Capacitor core and the geolocation plugin both ship EMPTY Android library manifests.** Verified for core
   (`node_modules/@capacitor/android/capacitor/src/main/AndroidManifest.xml`) and for the plugin
   (`capacitor-geolocation/android/src/main/AndroidManifest.xml`). Neither will merge a location permission
   into the app. The merged manifest at
   `android/app/build/intermediates/merged_manifest/release/processReleaseMainManifest/AndroidManifest.xml`
   is the artifact to check after any change — it is what the OS sees.
2. **`targetSdk = compileSdk = 36`.** Two SDK-gated behaviours fire: Android 12+ (S) `Approximate/Precise` and
   the secure-origin rule for `onGeolocationPermissionsShowPrompt` (`targetSdk > M`).
   `BridgeWebChromeClient.java:256-261` has a `Build.VERSION.SDK_INT >= S` branch that returns **allow** when
   only COARSE is granted — i.e. **Capacitor 8.5.2 explicitly supports the Approximate choice.** Do not
   "fix" that branch.
3. **`callback.invoke(origin, true, false)` — the third argument is `retain`, and Capacitor passes `false`
   everywhere.** The WebView therefore does not remember the origin's allow decision; expect the flow to be
   re-entered. (`BridgeWebChromeClient.java:254`, `:261`, `:270`.)
4. **`onGeolocationPermissionsShowPrompt` reuses single-slot fields.** `permissionLauncher` and
   `permissionListener` are plain instance fields (`BridgeWebChromeClient.java:49-51`) shared with the
   camera/file-chooser paths (`:289-298`). A geolocation prompt and a camera prompt cannot be in flight
   together; not a problem for this app, but do not add a second concurrent prompt source.
5. **`enableHighAccuracy: false` + precise permission is the trap of §2c** — and it is *counterintuitive*,
   because the intuitive reading is that asking for *less* accuracy is always safe. It is not, in current
   Chromium.
6. **The `denied` copy is browser-scoped and is now wrong in the shell.** `src/lib/locationCopy.ts:64-65`
   says *"Your browser is blocking location for this site. Type your address instead, or allow it in your
   browser settings."* — and `locationCopy.test.ts` **pins** `/browser settings/i` and `/for this site/i`.
   Inside the Android shell there is no browser and no per-site setting; the control is
   **Settings → Apps → Drop In → Permissions → Location**. Any copy change must also update that test's
   assertions, which is the point of the pin (see the COPY section).
7. **ProGuard/R8: no concern for either path.** Capacitor's plugin discovery is annotation-driven at build
   time (the CLI writes plugin classes into the generated project; `PluginManager` loads classes from
   assets) and the repo has no custom `proguard-rules.pro` for Capacitor to conflict with. **UNESTABLISHED**
   whether a future plugin could need a keep rule — nothing in Capacitor 8.5.2's shipped build files
   indicates one is required for geolocation, and the plugin ships no ProGuard rules file.
8. **The plugin's `dev` dist-tag is `8.3.0-locationbutton.8`** (2026-09-25). Android's location-permission
   guide describes a **"location button"** for one-time, session-scoped access, and states: "if your app
   targets Android 17 (API level 37) or later and only contains features that require session-based location
   access, **Google Play policy requires you to use the location button**"
   (<https://developer.android.com/training/location/permissions>). This app's use is exactly session-based
   ("one fix, on a tap"). With `targetSdk 36` the requirement does not apply yet, but **a future bump to 37
   makes it a Play policy question, not a code choice.** Chromium also has `blink::features::kGeolocationElement`
   (`permissions_android_feature_map.cc`), i.e. a `<geolocation>` HTML element is in flight. Flag this for the
   next SDK bump.
9. **`@capacitor/geolocation` 8.2.3's README error table stops at `OS-PLUG-GLOC-0017`** while the shipped
   source defines **`-0018`** (`GeolocationErrors.kt:77-80`, `LOCATION_MANIFEST_PERMISSIONS_MISSING`). The
   docs are behind the code. Use the source, not the table.

---

## What the COPY must say — OS prompt, not a browser

The governing fact for slice 2b: **in the shell, the thing that prompts is Android's own
`PermissionController`, and the thing that holds the setting is the Android app's permission.** There is no
browser and no per-origin setting. The existing `denied` note (`src/lib/locationCopy.ts:64-65`) instructs the
parent to look in "browser settings" for "this site" — both clauses are false in the shell.

The copy has to change **shape**, not just wording, because the real cases no longer map 1:1 onto the three
statuses the module is keyed by. Given the taxonomy as-is
(`src/lib/locationCopy.ts:62-67`, `Record<DeviceLocationFailure, string>`):

| Real case | Status the app sees | What the note must say (shell) |
|---|---|---|
| Manifest permission missing *(the current bug — should disappear after the fix)* | `denied` | Nothing to a parent — **this must never be reachable**. If it is, it is a build defect, not a user situation. |
| Parent tapped **Don't allow** once | `denied` | The ask is over for now; **type the address**. A neutral re-ask is defensible (Android will prompt again), but say "you did not allow", not "we are blocked". |
| Denied **permanently** ("Don't ask again") | `denied` | **The only actionable route is Settings.** "Location is off for Drop In. Turn it on in Android Settings, or type your address." ⚠️ This is the phrasing the founder **rejected** for the *browser* case ("Location is off for Drop In" names the app as the holder of a setting it did not have) — but in the shell **the app IS the holder of the setting**, so the objection no longer applies. The test property `statesLocationAsAnAppSetting` in `locationCopy.test.ts:30` encodes the old, browser-era objection and **must be re-scoped**, or it will pin the wrong thing. |
| Location services (GPS) off at the OS level | `unavailable` | "Turn Location on in your phone's quick settings, or type your address." — this is reachable *only* via the plugin (code 7). On the web path it is indistinguishable from no-signal, so the note must stay generic there. |
| Timeout / no signal / acquisition failure | `unavailable` | "We couldn't get your location just now. Try again, or type your address." — current wording is already correct and should **not** be specialised while the taxonomy cannot distinguish the causes. |
| Approximate granted (fix is coarse) | `granted` | No error note, but if `coords.accuracy` is surfaced, a neutral hint belongs on the *result*: "Approximate — check the address below." Requires keeping `accuracy`, which the app currently discards. |
| Non-secure origin | `unsupported` | Unreachable in the shipped shell (`https://localhost`). Keep as-is for the LAN dev server. |

**The single most important copy consequence:** the two `denied` sub-cases (denied once vs denied
permanently) require **different actions** — "ask again" vs "go to Settings" — and **the current app cannot
tell them apart**, from the web API or from any Capacitor API. Either the copy stays generic enough to be
true in both ("you did not allow location — turn it on in Android Settings, or type your address", offering
Settings as the route that always works), or the builder accepts a settings-first note. Do not ship a note
that says "allow it when we ask" to a parent whose permission is permanently denied and who therefore will
never be asked again.

Also note the **avoidance** rule the module already encodes (`locationCopy.ts:1-51`): never state location as
a setting of the app *when the holder is the browser*. In the shell the holder **is** the app. That is a
genuine reversal, and it is the kind of thing `locationCopy.test.ts` will fight — the test's properties are
correct for the web target and wrong-shaped for the native one. Whoever writes this slice should expect to
edit `locationCopy.test.ts` deliberately and record why, rather than discover the red pin at the end.

---

## UNESTABLISHED / could not confirm from primary sources

1. **Whether the WebView build installed on the reviewer's Pixel 9 Pro contains the
   `LocationProviderAndroid.java:61-73` "Cannot generate approximate location" guard.** The code is present in
   Chromium `main`, the feature is `FEATURE_ENABLED_BY_DEFAULT` on Android
   (`content_settings/core/common/features.cc:42-48`), and WebView references the feature
   (`aw_permission_manager.cc:57-61`, `:358-362`) — but WebView ships and updates independently of the app, and
   I could not map `crbug.com/502587667` to a WebView milestone. **This is a device test, not a doc fact:**
   after the manifest fix, have the tester grant **Precise** and see whether the web path returns a position or
   `unavailable` with `enableHighAccuracy: false`. It also depends on whether WebView initialises
   `PermissionsAndroidFeatureMap`, which I did not establish.
2. **The exact AOSP line that strips or auto-denies a permission not declared in the manifest.** I fetched
   `GrantPermissionsActivity.java` (AOSP main, 1293 lines) and did **not** find the manifest-declaration
   filter there — `mRequestedPermissions.isEmpty() → setResultAndFinish()` at `:355-358` is the
   *remote-device* filter, not the declaration check. The requirement is documented
   (`Activity.requestPermissions`: "These permissions must be requested in your manifest") and the
   auto-denial is documented in prose ("In certain situations, the permission might be denied automatically,
   without the user taking any action"), and the plugin's error 18 exists for exactly this case — but I did
   not pin the implementing line. **The measured symptom (zero prompts, always `denied`, on a device with a
   zero-location merged manifest) is the strongest evidence and is consistent with all of it.**
3. **Whether `webView(_:requestGeolocationPermissionFor:…)`'s documented absence leaves WebKit's own alert as
   the fallback on iOS 27.** Apple's page states no default behaviour. The fallback is shown by WebKit source
   (`WKGeolocationProviderIOS.mm:199-213`) as of `main`, but the public-API page is thin and I could not
   confirm Apple's intended contract.
4. **Whether `NSLocationAlwaysUsageDescription` is still required for a deployment target of iOS 15.**
   Neither the plugin README nor Apple's current pages ask for it; I found no primary statement either way.
5. **Coarse-location accuracy for a real Pixel 9 Pro on Android 16.** Android's guide says "about 3 square
   kilometers" and the plugin README says "usually around 2 kilometers"; they are not the same measurement
   and neither is a promise for a specific device. Confirm on hardware if the UI will claim a precision.
6. **Whether Capacitor's `WebViewDelegationHandler` on iOS ever implements the iOS-27 geolocation delegate
   method.** Checked `main` today and it does **not** (`WebViewDelegationHandler.swift`, no geolocation
   symbol); whether the shipped `@capacitor/ios` 8.5.x adds it is unverified — the repo has no `@capacitor/ios`
   dependency at all yet, so this is slice-2a work.
7. **Whether `@capacitor/geolocation` needs a ProGuard/R8 keep rule.** No rules file ships in the plugin and
   nothing in Capacitor's build files indicates one, but I did not run a release build with the plugin.
8. **`POST_NOTIFICATIONS` in the merged manifest is attributed to `@capacitor/push-notifications` by
   inference** — I read the merged output, not each library's manifest individually, for that specific entry.
   (Capacitor core's and the geolocation plugin's empty manifests *are* individually verified.)

---

## One-line summary for the builder

**A manifest permission alone does work in Capacitor 8.5.2** — Capacitor's `BridgeWebChromeClient` implements
`onGeolocationPermissionsShowPrompt` and requests the Android runtime permission
(`BridgeWebChromeClient.java:246-273`), `setGeolocationEnabled(true)` is set at `Bridge.java:591`, and
`https://localhost` is a secure origin — **but the app declares zero location permissions today, so Android
denies instantly with no dialog and the page gets `PERMISSION_DENIED`.** Fix the manifest first; then either
set `enableHighAccuracy: true` on the web path to dodge the approximate-vs-precise trap, **or** add
`@capacitor/geolocation` 8.2.3 (still needing the same manifest edit) to get an error taxonomy that can tell
"you denied me" from "the permission was never declared" from "Location is off".

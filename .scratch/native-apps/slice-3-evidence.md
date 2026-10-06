# Slice 3 evidence — shared https links open the app (Android App Links)

Base: `ed9b7c9f5cdf81ff30ddc3824d791dd02994c506` (ed9b7c9), uncommitted work tree.
Device: Pixel 9 Pro (`46071FDAP005WC`), Android `pm`/`adb` from `~/Android/Sdk`.

**Do not read this file as a claim that the slice is done.** The three acceptance
criteria are split below into what was OBSERVED, what is NOT SATISFIED yet, and
what cannot be observed without a production deploy.

---

## 1. What changed

| Path | State |
|---|---|
| `public/.well-known/assetlinks.json` | new |
| `android/app/src/main/AndroidManifest.xml` | +51 (a SECOND intent-filter) |
| `src/lib/appLinks.ts` | new |
| `src/lib/appLinks.test.ts` | new |
| `src/App.tsx` | +31 (`<AppLinks />` inside `BrowserRouter`) |
| `vercel.json` | **untouched** — see §3 |

Nothing was committed.

## 2. The fingerprint — re-derived, and it matches the brief

```
$ PW=$(grep '^storePassword=' android/keystore.properties | cut -d= -f2-); export PW
$ keytool -list -v -keystore /home/jmeisburg/.android-keys/drop-in-upload.jks -alias upload -storepass:env PW | grep -i sha256
Alias name: upload
	 SHA256: 95:D0:0B:EF:A5:15:5C:23:5B:3F:2B:DB:EA:FD:70:D9:AD:B6:37:2D:23:46:8E:43:8E:27:E6:66:75:91:29:B4
```

The file carries that value and nothing else. The Play app-signing SHA-256 is
**not** in it, and must be appended before release — recorded in
`docs/RELEASE-CHECKLIST.md` § 2.6, which is still unticked.

## 3. The catch-all rewrite — measured on production, read-only

```
$ curl -s -o /tmp/fav.out -D - https://drop-in-mu.vercel.app/favicon.svg | head -8
HTTP/2 200
content-disposition: inline; filename="favicon.svg"
content-type: image/svg+xml
etag: "126bd9fdaebf9e5ccc9a4199a9bf8351"
server: Vercel

$ head -c 60 /tmp/fav.out
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" h

$ curl -s -o /dev/null -D - https://drop-in-mu.vercel.app/.well-known/assetlinks.json | head -4
HTTP/2 200
content-disposition: inline; filename="index.html"
content-type: text/html; charset=utf-8
```

Read carefully, because it is two measurements, not one:

- **An EXISTING static file is served from the filesystem** despite the catch-all
  (measured: `/favicon.svg` → `content-type: image/svg+xml`, and a NESTED file,
  `/fonts/bricolage-grotesque-latin-ext.woff2` → `content-type: font/woff2`,
  both 200 from Vercel's static layer). Vercel's filesystem check wins for a file
  that exists.
- **A MISSING path is caught** and answered `200 text/html` as `index.html` —
  which is what the assetlinks URL answers TODAY, since the file is not deployed.

So the brief's condition ("change `vercel.json` **only if** the measurement shows
the rewrite swallows the file") is NOT met, and `vercel.json` is untouched. The
file lands in the deployed output — `dist/.well-known/assetlinks.json` exists
after `vite build`, and `npx cap sync` copies it into the Android assets too.

**UNPROVEN:** no measurement exists of a dot-DIRECTORY file on this project's
production deployment. The post-deploy check decides it:

```
curl -si https://drop-in-mu.vercel.app/.well-known/assetlinks.json | head -20
```

Expect `content-type: application/json` with the JSON body. If it comes back
`text/html`, the fix is an explicit `/.well-known` route placed BEFORE the
catch-all — and the fix must be verified with the assetlinks URL *and* a deep SPA
path (e.g. `/playdate/x`) so the SPA fallback is not broken while fixing it. A
self-rewrite (`/.well-known/assetlinks.json` → itself) risks a 508 loop; the
idiomatic form is a negative-lookahead source on the catch-all.

## 4. The gate — `npm run verify`, exit 0

```
$ npm run verify
✓ built in 354ms
 Test Files  88 passed (88)
      Tests  2637 passed (2637)
Finished in 58ms on 375 files with 116 rules using 24 threads.   # oxlint
GUARDS: PASS — all deterministic rules hold.
```

Red-green proof of the new pins (each seeded, run, then restored byte-identical
with `cmp`):

- lowercase a fingerprint byte in `assetlinks.json` → the fingerprint leg fails;
- drop `android:autoVerify="true"` and change `pathPrefix` → the manifest leg fails;
- delete the launch-URL guard in `appLinks.ts` → *"registers NOTHING when slice
  2c's scheme launched the app"* fails, while the positive control stays green.

## 5. The device

Build: `npm run build` → `npx cap sync android` → `mise exec -- ./gradlew
assembleDebug` (`BUILD SUCCESSFUL`, exit 0), `adb install -r` → `Success`. The
installed build was already debug-signed, so this replaced it without touching
app data. Evidence the APK carries this slice:

- merged manifest contains `<intent-filter android:autoVerify="true">` with
  `host=drop-in-mu.vercel.app`, `pathPrefix=/playdate/`, `scheme=https`;
- the shipped bundle `assets/public/assets/index-CDRQGHVM.js` contains
  `drop-in-mu.vercel.app`;
- `assets/public/.well-known/assetlinks.json` is NOT in the APK — aapt's
  `ignoreAssetsPattern` drops dot-paths. Harmless: Android's verifier fetches the
  HTTPS URL, and nothing in the WebView reads that path.

The WebView's document URL is read over the Chrome DevTools socket
(`adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`, then
`/json`), which is an unambiguous observable — React Router's `pushState` puts the
route in the URL.

**Cold start (app force-stopped), link delivered to our activity:**

```
$ adb shell am start -n app.dropin.playdate/.MainActivity -a android.intent.action.VIEW \
    -d "https://drop-in-mu.vercel.app/playdate/11111111-2222-3333-4444-555555555555"
Starting: Intent { act=android.intent.action.VIEW dat=https://drop-in-mu.vercel.app/... cmp=app.dropin.playdate/.MainActivity }
$ # WebView page URL
  URL: https://localhost/playdate/11111111-2222-3333-4444-555555555555
```

and the screen behind it is the detail route, not the feed and not blank:

```
text="We couldn’t find this drop-in"
text="It may have been removed, or the link is a typo."
text="Back to today"
```

**Warm start (same app running, plain cold launch as the control):**

```
=== 1. plain COLD launch (no data) ===
  URL: https://localhost/
=== 2. same app, WARM, app-link VIEW intent ===
Warning: Activity not started, intent has been delivered to currently running top-most instance.
  URL: https://localhost/playdate/11111111-2222-3333-4444-555555555555
```

**What a real shared link does TODAY (no explicit component):**

```
$ adb shell am start -a android.intent.action.VIEW -d "https://drop-in-mu.vercel.app/playdate/1111..."
    topResumedActivity=ActivityRecord{... com.android.chrome/com.google.android.apps.chrome.Main ...}
```

The browser gets it, because the domain is not verified — see §6. (Chrome was
launched by the link and left alone; no browser lane was run.)

**`pm` state:**

```
$ adb shell pm get-app-links app.dropin.playdate
  app.dropin.playdate:
    Signatures: [CC:D9:1E:27:74:77:D4:DE:49:95:C9:68:29:D0:B2:24:FE:B7:4F:0F:64:AE:83:5D:A6:97:1E:EB:FE:79:E7:B0]
    Domain verification state:
      drop-in-mu.vercel.app: none          # before --re-verify

$ adb shell pm verify-app-links --re-verify app.dropin.playdate   # no output
$ adb shell pm get-app-links app.dropin.playdate
      drop-in-mu.vercel.app: 1024          # the attempt ran and did not succeed
```

Two independent reasons it cannot pass yet, both named rather than guessed:

1. the association file is not deployed (§3), so the verifier has nothing valid
   to read;
2. this install is signed by the **debug** key (`CC:D9:1E:…`), while the file
   names the **upload** key (`95:D0:0B:…`). Verification compares the installed
   signature, so the post-deploy test needs a build signed with the upload key —
   `./gradlew assembleRelease` — and installing it over the debug build requires
   an **uninstall** (signature mismatch), which discards the app's local data
   (the signed-in session). That is the device's state today, and it is the
   founder's call to make, not this slice's.

Also observed and NOT caused by this slice: after the deep link, `input keyevent
BACK` does not move the WebView (two presses, URL unchanged). Capacitor's
`AppPlugin` back handler calls `webView.canGoBack()` and consumes the press; the
app registers no `backButton` listener (`grep -rn backButton src/` → none). The
detail screen carries its own "Back to today" affordance. Not measured against a
non-deep-link push, so it is recorded as an observation, not a finding.

## 6. Criterion by criterion

1. **`/playdate/<id>` opens the app / the browser when not installed — OBSERVED
   IN PART.** The app opens on the named screen for both a cold and a warm
   delivery. The OS *choosing* the app over Chrome is NOT observed and cannot be
   before criterion 3 (Chrome takes the link today, measured above).
2. **Right content-type, not caught by the SPA rewrite — UNPROVEN.** Needs the
   deploy; §3 is the read-only evidence that the mechanism is favourable.
3. **Android reports the link verified — NOT SATISFIED.** `1024` after an
   explicit re-verify, for the two reasons in §5.

## 7. Follow-ups (named, not attempted)

- **The Play app-signing SHA-256 must be appended** to `assetlinks.json` before
  release (`docs/RELEASE-CHECKLIST.md` § 2.6). Until then the file verifies
  sideloaded upload-key builds only.
- **Production deploy** — required for criteria 2 and 3, and for the real
  link test. Needs the founder's authorization; **not done**.
- **Password-reset / email-confirmation links completing inside the app** are OUT
  OF SCOPE, deliberately. What is known: shares are exactly
  `https://drop-in-mu.vercel.app/playdate/<id>` (`buildShareUrl`, lib/trust.ts),
  while a reset link lands on `/reset-password` (`RESET_PATH`,
  lib/passwordReset.ts) carrying its recovery token in the URL (the implicit flow
  this client uses). That path is outside the claimed `pathPrefix`, so the link
  keeps opening in the browser — correct today, because the token has to reach
  Supabase inside the WebView. Widening the filter to the whole host would capture
  it; `appLinkPath` already preserves search + hash, so the mechanism for a later
  slice exists, but that slice needs its own risk analysis.
- **iOS** (`apple-app-site-association` + Associated Domains) is slice 2a. No
  Apple file was added — this box cannot build iOS, and an unverifiable artifact
  is worse than an absent one.

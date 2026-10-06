# Brief — make "Use my location" work in the Android shell

> **READ FIRST, IN FULL: `research/native-apps/2026-10-06-capacitor-android-geolocation.md`**
> (823 lines, every claim carries a URL or a local file:line). It is the grounding
> for this slice and it answers the questions below. Do not re-derive it; do not
> guess past it.

## The measured defect

On the Pixel 9 Pro, "Use my location" in the installed shell **always** fails and
the parent is told to *"turn it on in your browser settings"* — **in an app that
has no browser**.

The grounding explains it completely:

- `AndroidManifest.xml` declares **only `INTERNET`**; the merged manifest the OS
  actually sees has **zero** occurrences of "location".
- Capacitor 8.5.2 **does** implement the callback (`BridgeWebChromeClient`
  `onGeolocationPermissionsShowPrompt`) and **does** call
  `settings.setGeolocationEnabled(true)` (`Bridge.java:591`).
- So the runtime request is launched for permissions the manifest **never
  declared** → Android resolves it **immediately and negatively, with no UI** →
  `PERMISSION_DENIED` → `geolocation.ts` maps it to `denied`.
- **The parent is never asked anything, and the app reports a refusal they never
  made.** That is the bug.

## The decision, already made — implement the NO-DEPENDENCY path

The grounding establishes that **a manifest permission alone is enough**; the
plugin is not required for a working flow. Take the lazy path (`ponytail`):

1. **`android/app/src/main/AndroidManifest.xml`** — declare
   **`ACCESS_COARSE_LOCATION`** and **`ACCESS_FINE_LOCATION`**. Both, because
   Capacitor's callback requests both regardless of the page's hint and because
   Android 12+ lets the parent choose *Approximate*.
2. **`src/lib/geolocation.ts`** — set **`enableHighAccuracy: true`**.
   ⚠️ **THIS IS NOT COSMETIC, AND THE OBVIOUS CHOICE IS THE WRONG ONE.** Chromium's
   `LocationProviderAndroid` reports *"Cannot generate approximate location"* when
   the app holds `ACCESS_FINE_LOCATION` but the page asked for **low** accuracy,
   and that feature is on-by-default in the WebView. With
   `enableHighAccuracy: false` the feature therefore works for a parent who taps
   **Approximate** and can **fail for one who taps Precise** — the reverse of
   intuition. `true` avoids it in both branches. Put that reasoning in a comment;
   it is exactly the kind of line a future reader "simplifies".
3. **Do NOT add `@capacitor/geolocation`.** Its error taxonomy is nicer, but it is
   a new runtime dependency for a button that a manifest line makes work. If you
   find a concrete reason the manifest path CANNOT work on the device, **STOP and
   report it** rather than reaching for the plugin silently.

## The copy — and this WILL collide with a test you must edit deliberately

`src/lib/locationCopy.ts` currently ships ONE set of notes, written for the
**browser**. In the shell, **two of its clauses are false**: there is no browser
and no per-site setting. The holder of the permission in the shell is **the app**,
and the parent's route is
**Settings → Apps → Drop In → Permissions → Location**.

So the module needs a **per-platform variant**, exactly as
`src/lib/notificationSectionCopy.ts` already does for web vs native (read it for
the pattern, and use the existing shell seam — `nativePushShellPlatform()`).

**The native `denied` note must:**
- Name the **APP** as the holder. This is the *opposite* of the web rule and it is
  the point — do not "fix" it back to the browser framing.
- Name the **Settings route**, because that is the only action that works for a
  **permanently denied** permission.
- ⚠️ **NOT promise "we'll ask again."** Android stops re-prompting after a couple
  of refusals, and the app **cannot distinguish** denied-once from
  denied-forever (the grounding is explicit: both produce code 1 with zero UI). A
  note that says "allow it when we ask" is a lie to a permanently-denied parent.
- Still offer the **typed address** — the parent is stuck at that moment.
- Stay in the house voice (`firstRunCopy.ts`, `notificationSectionCopy.ts`): plain,
  warm, not scolding.

**`src/lib/locationCopy.test.ts` must be edited, and you must record why.**
It pins `/browser settings/i` and `/for this site/i` and a property called
`statesLocationAsAnAppSetting` — which encodes the founder's **browser-era**
objection (the app must not present itself as the holder). In the shell the app
**IS** the holder, so that property is wrong-shaped for the native target. Keep it
for the web variant; give the native variant the property that is true for it.
**Do not delete the web assertions** — the web copy is live and correct.

## Optional, only if it is genuinely small

`geolocation.ts` reads `error.code` only for `PERMISSION_DENIED` and **throws away
`TIMEOUT` (code 3)**, so a timeout is indistinguishable from "no signal" and "GPS
off". If distinguishing the timeout is a couple of lines, do it and give it honest
copy; if it opens a wider refactor, **leave it and say so**. Do not assert a cause
the app cannot detect — the grounding lists four different causes collapsed into
`unavailable`.

## Acceptance criteria

1. **On the real Pixel**, tapping "Use my location" produces **Android's own
   permission dialog** (While using / Only this time / Don't allow, plus the
   Approximate/Precise toggle) — a dialog that **does not exist today**.
2. Granting it yields **a position and a usable address**.
3. Denying it, or having it already denied, shows the **native** note naming the
   app and the Settings route — and never mentions a browser.
4. `npm run verify` exit 0.
5. ⚠️ **THE HIGHEST-VALUE 2-MINUTE CHECK IN THE GROUNDING, and the one thing the
   research could NOT establish:** grant **PRECISE** and confirm the web path
   returns a position rather than `unavailable`. Whether this device's WebView
   carries the approximate/precise guard is UNESTABLISHED (WebView updates
   independently of the OS), so it is a device test, not a reading. **Report what
   you observe either way** — if Precise fails, `enableHighAccuracy: true` is not
   enough and that is a finding, not a failure to hide.

## ⚠️ COLLISION WARNING — read before you touch anything

`src/components/LocationModal.tsx` carries **ANOTHER SESSION'S UNCOMMITTED WORK**
(a V31 locate-button animation, ~lines 348–380, with `index.css` support). Your
work in that file is around **lines 6 and 197–210**. **Do NOT revert, reformat, or
"tidy" it; never `git stash`, never `git checkout -- <file>`, never `git add -A`,
and do NOT commit** — the orchestrator stages by hunk and owns commits. If you
need a mutation proof in that file, back it up byte-for-byte and restore from
**your** backup, never from git.

## Verification command

`npm run verify` plus the on-device sequence. **Never a bare `npx playwright
test`** — it writes to production. Install with `assembleRelease` (the device is
verified for App Links with the upload key; a **debug** build would break that
verification, so keep it release-signed). Device: `~/Android/Sdk/platform-tools/adb`.

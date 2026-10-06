# Evidence — slice 2d-ii: the permission dialog was eating the location timeout

All commands below were run **this session (2026-10-06 ~16:05–16:20 UTC)** by the
orchestrator-builder agent, on the local **Pixel_9_Pro AVD**, because **no
physical phone was attached** — see `## Device reality` at the bottom. Raw logs,
scripts and screenshots are in `.scratch/native-apps/2dii/`.

Result in one line: the failure was **reproduced on the pre-fix bundle**
(`code 3, ms=10001`, dialog still open, parent told "couldn't get your location")
and the fix **returns a position on a device** after the dialog is answered at
t+11 s (retry `ms=5876`), with a measured worst case of **20 s** and one hard
limitation in the shell recorded in §6.

## 1. Device reality — no phone (this half is still UNPROVEN on hardware)

    $ ~/Android/Sdk/platform-tools/adb devices -l        # cold server
    List of devices attached                                (EMPTY)
    $ ~/Android/Sdk/platform-tools/adb kill-server; adb start-server; adb devices -l
    List of devices attached                                (EMPTY)
    $ lsusb | grep -iE "google|pixel|samsung|motorola|oneplus|xiaomi|sony|lg"
    no phone-like USB device

Slice 2d's five acceptance criteria were measured on the AVD, not the founder's
hardware. **That is still true after this session.** Everything below is AVD
evidence; nothing here re-runs 2d on a phone, because there is no phone.

## 2. BEFORE — the defect, reproduced on the pre-fix bundle

The installed `/login`-era artifact was replaced, deliberately, by
`android/app/build/outputs/apk/debug/app-debug.apk` **built 15:44 from a tree
whose `src/lib/geolocation.ts` is byte-identical to `HEAD`**
(`git diff HEAD -- src/lib/geolocation.ts` → empty), and whose bundle carries the
pre-fix code verbatim:

    $ grep -o ".\{200\}enableHighAccuracy:!0,timeout:e,maximumAge:6e4.\{80\}" \
        .scratch/native-apps/2dii/apk/assets/public/assets/index-Cj_YVF77.js
    …if(e.code===e.PERMISSION_DENIED){t({status:`denied`});return}
      t({status:`unavailable`})},{enableHighAccuracy:!0,timeout:e,maximumAge:6e4})
    # no TIMEOUT branch, no permissions API — HEAD's code, not a guess

Driven through the app's **own onboarding area card** (`/onboarding`, "4 of 4",
`data-testid="use-my-location-btn"`) with a fresh install (location permission
never asked: `granted=false`, no `USER_SET` flag) and CDP instrumentation on
`navigator.geolocation.getCurrentPosition`:

    called  t=1791328050815  opts {enableHighAccuracy:true, timeout:10000, maximumAge:60000}
    error   code 3  "Timeout expired"  ms=10001

**And the dialog was still up when the request died** — `uiautomator dump` after
the death, and the window manager:

    text="Allow Drop In to access this device's location?"  / Precise / Approximate
    text="While using the app" / "Only this time" / "Don't allow"
    mCurrentFocus=Window{… com.google.android.permissioncontroller/…GrantPermissionsActivity}

**And this is what the parent was reading at that moment** (DOM, same instant):

    <p role="status" data-testid="use-my-location-note">
      We couldn't get your location just now. Try again, or type your address.

Screenshot: `2dii/before-dialog-open-at-death.png` (not visually read by me — this
model has no image input; the claims above rest on the dumpsys/DOM text).

## 3. The fix (final shape — §6 is the gate that a ruling REMOVED)

`src/lib/geolocation.ts`: `readDeviceCoords` was split into an internal
`askOnce()` (which keeps the spec's `TIMEOUT`, code 3, distinct instead of
throwing it away) plus a wrapper that **retries once on TIMEOUT,
unconditionally**. `GeolocationOutcome` is unchanged — the four statuses and
every sentence in `locationCopy.ts` are untouched — so no copy and no caller
changed. `locationCopy.ts`/`locationCopy.test.ts` and `LocationModal.tsx` were
**not edited at all** (the collision risk the brief warns about was designed out,
not managed).

The first version of this fix gated the retry on
`navigator.permissions.query({name:'geolocation'})`, retrying only when the
permission was not already `granted`. §6 is the measurement that killed that
gate; the orchestrator ruled it must be **deleted, not documented**, because a
gate that cannot fire is dead code that looks like protection. The shipped rule is
the simple one: **every TIMEOUT gets exactly one more attempt**; `denied` (code 1)
and POSITION_UNAVAILABLE (code 2) get one attempt and never a second.

Unit-level RED/GREEN, twice, each against a verbatim copy of the implementation
being replaced, each with the temp copy deleted in the same command (`git status
-- src/lib/` afterwards showed only the two real files):

1. before the fix existed — the dialog-case assertion ran against
   `HEAD:src/lib/geolocation.ts`: `1 failed | 1 passed` (it returned `unavailable`
   pre-fix and `granted` post-fix);
2. after the ruling — the new "whatever the Permissions API claims" rule ran
   against the gated version: `1 failed | 1 passed`, failing on exactly the
   `granted` iteration, *`permission state granted: expected "vi.fn()" to be
   called 2 times, but got 1 times`*. That is the regression the removed gate
   would have reintroduced, and a test now pins it.

⚠️ A `npm run verify` run at 16:21 failed with **exit 2** on
`src/components/ProfileView.tsx(825,8): error TS2304: Cannot find name
'showsAbout'` — the OTHER session's file, mid-edit, exactly the hazard the
runbook names ("never build a file another process is writing"). Nothing in
`src/lib/` was implicated: `npx tsc -b` on the settled tree (their edit landed
16:22:38) exits 0 with no errors, and the gate was re-run — see §8. My files were
not touched in response.


## 4. AFTER — a position, on the device

Rebuilt (`npm run build` → `npx cap sync android` → `assembleDebug assembleRelease`,
all exit 0), installed **over the top** (`adb install -r`, same debug signature,
session and mid-onboarding state kept), and the loaded bundle verified from the
live page rather than assumed:

    $ loaded scripts (live page): ["", "index-B0xxzot1.js", "registerSW.js"]

Same screen, same button, same withheld dialog, one change — the dialog is
answered **at t+11 s, past the first 10 s budget**:

    t+0s    tap "Use my location"
    t+11s   foreground = GrantPermissionsActivity (still open); app state:
            note = null, button = "Finding you…", disabled = true
            calls = [called, error:10000, called]        ← retry already running
    t+11s   tap Precise (400,1398), tap While using the app (640,1766)
    t+12s   dumpsys: ACCESS_FINE_LOCATION granted=true … SELECTED_LOCATION_ACCURACY
    t+16s   GRANTED — lat 47.6204983 lng -122.3492983 acc 5 ms=5876

Full log:

    called  t=…476596  {enableHighAccuracy:true, timeout:10000, maximumAge:60000}
    error   code 3 "Timeout expired" ms=10000      ← the pre-fix death, dialog open
    called  t=…486596  {… timeout:10000 …}          ← the RETRY, today's budget
    granted lat 47.6204983 lng -122.3492983 acc 5 ms=5876

**The parent was never shown a failure note**: `note: null` at t+11s and at the
end, and the button read "Finding you…" while the retry was in flight.

Product-level outcome — the captured fix was reverse-geocoded and became the
profile's home, which is what the feature is *for*:

    $ bash scripts/db-sql.sh --read "select display_name, home_zip, radius_miles
        from public.profiles where id=(select id from auth.users where email='e2e-1791328024-2dii@gmail.com');"
    display_name  home_zip  radius_miles
    Loc Dii8024   98109     5
    # feed renders: "Drop-ins near you  Near 98109 · within 5 miles"

The **other** call site works too (feed → `data-testid=feed-location-control` →
the modal), where the granted branch produced
`"We found your location. Press Apply to use it."`

## 5. Worst case, measured, not reasoned

Same fixed build, same screen, the dialog **never answered** — both windows
spent:

    called  t=…08655
    error   code 3 ms=10001
    called  t=…18655
    error   code 3 ms=10000
    → note: We couldn't get your location just now. Try again, or type your address.

**20 s total, up from 10 s**, and only on this path (a provider that started and
answered nothing, or a dialog nobody ever answered). `denied` (code 1) and
POSITION_UNAVAILABLE (code 2) are single-attempt — unit-tested, and code 1 was
already measured on-device in slice 2d.

A genuine no-signal failure **could not be staged on the AVD**: with
`settings put secure location_mode 0` the mock provider still answered
(`granted … ms=6669`), because `adb emu geo fix` positions survive the setting.
So "a genuine failure returns in a comparable time on a device" is
**UNPROVEN on device**; what is proven is that code 2 and code 1 never retry (unit
tests) and that the code-3 worst case is 20 s (measured above).

## 6. ⚠️ FINDING not in the brief — the gate was INERT in the shell, so it was REMOVED

The first version of the fix gated the retry on the permission state, so that an
*already-granted* timeout kept today's single attempt. That gate works in a
browser and **cannot work in the shell**:

    $ adb shell dumpsys package app.dropin.playdate | grep ACCESS_FINE_LOCATION:
      android.permission.ACCESS_FINE_LOCATION: granted=true, flags=[USER_SET|…|SELECTED_LOCATION_ACCURACY]
    $ (in the live page) navigator.permissions.query({name:'geolocation'}).state
      "prompt"

Capacitor satisfies the WebView's geolocation prompt itself
(`onGeolocationPermissionsShowPrompt`, logcat in slice 2d's evidence) instead of
persisting a Chromium grant, so the WebView never reports `granted`. The gate
therefore **never fired in the app** — dead code that looked like protection, and
the code comment written around it claimed an economy the shell could not deliver
(that comment was corrected on measurement, and then the gate itself removed).

**Orchestrator ruling, this slice: delete the gate.** Retry unconditionally on
TIMEOUT, keep `askOnce()` preserving the spec `TIMEOUT` code, keep
`GeolocationOutcome`/copy/callers untouched. Reasoning recorded in the code
comment: a timeout on the first attempt usually MEANS a pending dialog or a fix
that needed longer — exactly what a second attempt fixes — so the extra time is
mostly spent on requests that then succeed, and when it does not succeed the
request was going to fail anyway. The shell genuinely cannot tell "dialog
pending" from "provider silent", and pretending otherwise is what produced the
dead gate. The cost is stated plainly in the comment: **20 s worst case, TIMEOUT
path only, with the button reading "Finding you…" throughout**.

Tests were updated to the rule that now ships: the old "does NOT retry a timeout
when the permission was already granted" asserted behaviour that no longer exists
— and that never held in the shell — so it was replaced by one that requires the
retry for `granted`, `prompt` **and** `denied` alike. The two
Permissions-API-absent/rejecting tests were dropped with it: the module no longer
calls that API at all, so those cases cannot differ, and keeping them would be
coverage of a branch that is gone. The stub stays in exactly one place, to feed
the module the value the removed gate trusted and prove it is ignored.

This has NO effect on the shell behaviour measured in §4: the shell always
reported `"prompt"`, so the retry branch was already the one taken there — the
gate removal changes the browser, not the app. In a browser the API *does* report
`granted` honestly, so the gate did work there, and dropping it means an
already-granted browser timeout now also spends a second window (10 s → 20 s on
that path). That is acceptance criterion 4's delta, recorded in §11.5.


## 7. ⚠️ FINDING, NOW REPRODUCED UNDER CONTROL — an update serves the PREVIOUS bundle on first launch

First, the accident that found it: the first AFTER attempt behaved **exactly like
the pre-fix code** (one call, `code 3` at `ms=10000`, failure note) even though
the new APK was installed and its bundle was on disk. It was discarded and
re-run, and every run reported above verifies the live bundle first
(`["", "index-B0xxzot1.js", "registerSW.js"]`; `caches.keys()` →
`["workbox-precache-v2-https://localhost/"]`).

Then the controlled test (`2dii/stale-bundle-test2.sh`, output in
`2dii/stale-bundle-run2.log`). The app precaches `index.html` + its hashed chunks
through a workbox service worker whose cache survives `adb install -r`, so the
test minted an APK whose bundle the precache had never seen and installed it over
the top:

    precache before install : index-B_Jmv9ju.js   (index.html rev f47395970eed)
    the v2 APK's bundle     : index-C9b6OlYG.js   (only bundle in the APK)

    t+1s  loaded: index-B_Jmv9ju.js   cached: index-B_Jmv9ju.js              rev f47395970eed
    t+2s  loaded: index-B_Jmv9ju.js   cached: index-B_Jmv9ju.js,C9b6OlYG.js  rev f47395970eed
    t+3s  loaded: index-B_Jmv9ju.js   cached: index-C9b6OlYG.js              rev 6f8d52f09b80
    …
    t+8s  loaded: index-B_Jmv9ju.js   cached: index-C9b6OlYG.js              rev 6f8d52f09b80
    reload 1..6:  loaded: index-C9b6OlYG.js

**So the parent really does get the PREVIOUS version's bundle for the first page
load after an update** — a bundle the installed APK no longer even contains —
while the new service worker installs in the background (~2–3 s here) and the next
navigation (reload, or the next launch) serves the new one. Because the app is a
SPA that loads once and stays, "the first page load" is the whole of that session:
a parent who updates and opens the app sees the old UI until they navigate or
relaunch. The window is one page load, and it resolves without user action.

Method notes, so the claim is not stretched further than it goes: measured on the
**debug** build (a release APK cannot be installed over the AVD's existing install
without `adb uninstall`, which would destroy the very precache under test); the
minted build differed from the verified one only by the timeout constant
(`10_000` → `10_002`), which was restored afterwards and **md5-verified
byte-identical** to the verified source (`a3d17cb0…`); the two bundles' JS content
was otherwise identical, so the bundle *filename* is the whole observable. The
mechanism is `index.html` being precached, which is variant-independent, so the
release build should behave the same — but that is **inferred, not measured**.

**Any device verification that installs and immediately tests must assert which
bundle the page actually loaded.** The runbook's "stale-bundle APK" warning has a
second form that does not involve a stale APK at all.


## 8. Commands, exit codes, counts

    $ npm run verify                    # final bytes; counts in 2dii/verify3.log
    VERIFY_EXIT=0                       # exit code of the wrapper shell, not a line in the log
    Test Files  89 passed (89)
    Tests       2653 passed (2653)      # 2646 before this slice: +7 net (9 added, 2 dropped with the gate)
    Found 87 warnings and 0 errors.     (oxlint)
    GUARDS: PASS — all deterministic rules hold.
    factory-guard check: all 185 checks passed.

    # This was run three times, because the OTHER session's ProfileView.tsx kept
    # moving under the gate mid-edit — exactly the runbook's "never build a file
    # another process is writing":
    #   verify2.log  16:21  exit 2  ProfileView.tsx(825,8) TS2304 'showsAbout'
    #   verify3.log  16:23  exit 0  ← counts above, first clean run
    #   verify4.log  16:29  exit 2  ProfileView.tsx(679,7) TS1005, (1112,5) TS1128
    #   verify5.log  ~16:33 exit 0  ← the run quoted here, on the settled tree
    # `npx tsc -b` exits 0 immediately after each failure, and NO error has ever
    # named a file in src/lib/. My two files' bytes are unchanged across all of
    # them (`a3d17cb0…`), so every exit-0 run is a run on these bytes.

    $ npx vitest run src/lib/geolocation.test.ts src/lib/locationCopy.test.ts
    Test Files  2 passed (2)   Tests  28 passed (28)      # 19 in geolocation.test.ts

Never a bare `npx playwright test` was run.

## 9. Collision discipline (another session is live in this workspace)

`.gitignore`, `index.html`, `src/index.css`, `src/pages/FeedPage.tsx`,
`src/components/LocationModal.tsx` — the five files the brief named — are
**byte-identical** to their md5s taken before this slice started:

    46583868fc5d5a4ce9cdf54de91a764b  .gitignore
    589f919cd22cdac240b045c8de0b9d61  index.html
    cc83b7f6470cffab4813871c40ffd6f4  src/index.css
    78b044bbf14d8a0c0e31c214a2d94874  src/pages/FeedPage.tsx
    f01587731215cb2411bddc9e05b0d656  src/components/LocationModal.tsx

⚠️ **`src/components/ProfileView.tsx` joined that session's footprint DURING this
slice** (229 changed lines, seen in `git status` at 16:20 but not at 16:05), and
kept moving: its TypeScript was broken at 16:21 and again at 16:29 (mtime
16:28:28), which is what failed two whole-tree gate runs — §8. Not mine, not
touched, not reverted, and never implicated by an error. The orchestrator's hunk
staging needs to know it moved under them.

No `git stash`, no `git checkout -- <file>`, no `git add -A`, no commit, no
`git restore`. `dist/` and `android/app/src/main/assets/public` are both
gitignored (verified with `git check-ignore -v`), so the builds added no tracked
changes. My tracked footprint is exactly these two, and their hashes are the ones
the passing gate ran on:

    src/lib/geolocation.ts        md5 a3d17cb07bd128f0044652287dfdb2cf   131 changed lines (≈35 functional)
    src/lib/geolocation.test.ts   md5 b68b0db5b6b67dd700a0ef50ca665a28   167 changed lines

⚠️ For the §7 experiment a *minted* debug APK was built from a deliberately nudged
constant and kept as `2dii/TESTFIXTURE-minted-10_002-app-debug.apk`. The source was
restored and md5-verified, and `dist/` + both APK variants were then rebuilt from
the verified source so nothing at a canonical path carries the minted build.


## 10. Production side effects (created and reported; since SWEPT)

One marker account was created **through the app's own signup UI**, because the
slice-2d markers (`e2e-1791326722-loc@`, `e2e-1791327197-rel@`) had already been
swept — `select email from auth.users where email like 'e2e-%'` returned `[]`:

    e2e-1791328024-2dii@gmail.com    password e2e-pw-1791328024    display "Loc Dii8024"
    # public.profiles: home_zip 98109, radius_miles 5 — matches the sweep's e2e-% pattern

Reported to the orchestrator with the first report and **since swept** (the
`e2e-%` count returned to zero after it). No further account was created for the
gate-removal round or the §7 experiment: both were done against the AVD's existing
install, and the §7 test needed no account at all.


Environment change: the AVD now runs the **debug-signed** build (it held the
release build when I started) and that marker's session is live in it. Nothing
on a real phone changed.

## 11. UNPROVEN / carried forward

1. **The founder's phone**: 2d's criteria, and this fix, remain unmeasured on
   hardware. No phone was attached — checked three times, the last time after this
   round's work, each with a restarted adb server, plus `lsusb` and the USB
   vendor list (keyboard, mouse, microphone, Stream Deck, hub — nothing else).
2. Whether the real device's WebView carries Chromium's approximate/precise
   guard — 2d's §4 question — is still open, and unanswered by this session.
3. A genuine code-2/no-signal failure on a device: not stageable on the AVD (§5).
4. A real parent answering between ~14 s and 20 s: extrapolated to fail (the
   retry's remaining window is shorter than the 5.9 s cold fix I measured). The
   measured survivable read time is ~11 s; the pre-fix figure was ~5 s.
5. "No behaviour change to the web path" (acceptance criterion 4) is not
   literally true, and after the gate removal it is true in one more case: a
   *browser* parent whose browser permission prompt is left open past 10 s now
   gets the retry (before: a failure), and so does a browser parent whose
   permission is already `granted` and whose fix times out (before: one attempt
   and a failure; now: a second window). Same defect, same fix, and the four
   outcomes and every sentence of copy are unchanged — but the web path's timing
   on the timeout branch does move, and that is a deliberate, recorded delta for
   the reviewer to accept or rule on.
6. The release-build form of §7 (stale bundle on first launch) — measured on the
   debug build, inferred for release; the mechanism (a precached `index.html`)
   does not depend on the build variant, but that is reasoning, not a measurement.


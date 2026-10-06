# Slice 3 brief — shared https links open the app (Android App Links)

> **Read first:**
> 1. `.scratch/native-apps/plan.md` § "Slice 3" — the contract.
> 2. `docs/agents/browser-lanes.md` before any browser lane.
> 3. `docs/agents/code-structure.md` — the build law.
> 4. `.scratch/native-apps/slice-2c-brief.md` — the SIBLING slice. 2c added a
>    **custom scheme** for the OAuth return. This slice is different and must not
>    be conflated (see "Why this is not 2c" below).

## Why this is not 2c, and why it is Android-only

Slice **2c** (done, proven on hardware) uses a **custom URL scheme**
(`app.dropin.playdate://`) so the OAuth provider can return to the app. That is
invisible to a web server and needs no domain.

**This** slice is about a **web link a parent taps or shares** —
`https://drop-in-mu.vercel.app/playdate/<id>` — opening the app when it is
installed, and the web page when it is not. That requires the OS to trust our
domain for our package, which means the two association artifacts.

**Android only.** iOS's half (`apple-app-site-association` + the Associated
Domains capability) is **slice 2a**, deferred: this box cannot build iOS, and
Capacitor 8.5's UIScene change moves URL handling out of `AppDelegate`, so an
iOS implementation copied from a 6/7 example will not fire. Do NOT add the
Apple file "for completeness" — an unverifiable artifact is worse than an
absent one, and its absence is recorded, not an oversight.

## Objective

A shared drop-in link opens the app when installed, the browser when not, on
**Android**, verified on the connected Pixel.

## The verified value this slice needs (do not re-derive, do not guess)

The **upload keystore** fingerprint, read from the real keystore this session:

```
/home/jmeisburg/.android-keys/drop-in-upload.jks   (alias: upload)
SHA-256: 95:D0:0B:EF:A5:15:5C:23:5B:3F:2B:DB:EA:FD:70:D9:AD:B6:37:2D:23:46:8E:43:8E:27:E6:66:75:91:29:B4
```

⚠️ **TWO FINGERPRINTS, NOT ONE — and we currently only have the first.** Play App
Signing re-signs the upload with **Google's own key**, so once the app is on
Play, installs from Play are signed by a certificate whose fingerprint we do not
have yet. `assetlinks.json` accepts a LIST: put the upload fingerprint in now,
and **record plainly that the Play app-signing fingerprint must be appended
before release**, because shipping only the upload key is the classic App Links
mistake — it works for sideloaded builds (including this test) and fails for
everyone who installed from Play.

## The trap that will decide this slice

`vercel.json` currently has a **catch-all rewrite**:

```json
{ "rewrites": [ { "source": "/(.*)", "destination": "/index.html" } ] }
```

If that catches `/.well-known/assetlinks.json`, the file is served as
`index.html` — wrong body, wrong content-type — and Android's verification
silently fails. **Do not assume Vercel's filesystem check wins; MEASURE it**
(after the deploy, `curl -i` the URL and inspect BOTH the status and the
body). If it is swallowed, the fix is an explicit `.well-known` route placed
BEFORE the catch-all — and that ordering is load-bearing.

## Scope

1. **`public/.well-known/assetlinks.json`** (new) — a JSON **ARRAY**, with
   `relation: ["delegate_permission/common.handle_all_urls"]`, the package
   `app.dropin.playdate`, and the `sha256_cert_fingerprints` list above (colon
   separated, uppercase, as the file requires).
2. **`android/app/src/main/AndroidManifest.xml`** — an `intent-filter` with
   `android:autoVerify="true"`, `VIEW`/`DEFAULT`/`BROWSABLE`, and an https
   `<data>` for host `drop-in-mu.vercel.app`. **2c already added a scheme filter
   — keep it, and do not merge the two filters into one.** Think about whether
   to constrain paths (a `pathPrefix` of `/playdate/`) or claim the whole host;
   state your choice and its consequence for the password-reset link below.
3. **`vercel.json`** — only if the measurement above shows the rewrite swallows
   the file.
4. **The router's handling of a link that opens the app cold.** A link can
   arrive when the app is not running; the app must land on the right screen,
   not the feed or a blank page. Check what the existing router already does
   for `/playdate/:id` before adding anything (App.tsx:904 has the route).
5. **A test for whatever is pure.** The association JSON's SHAPE and the
   fingerprint list are testable without a device — pin them so the file cannot
   silently rot into a form Android rejects.

## Acceptance criteria

1. `/playdate/<id>` opens the app when installed, the browser when not, on the
   connected Pixel — **observed**, not inferred.
2. The association files are served with the right **content-type** and are
   **not caught by the SPA rewrite** — verified against the DEPLOYED site, not
   just the local `public/` file.
3. Android reports the link as **verified** for our package.

## Verification command

`npm run verify`, plus these, with the real outputs pasted:

```bash
# deployed artifact — the check the plan demands
curl -si https://drop-in-mu.vercel.app/.well-known/assetlinks.json | head -20

# is Android's verification satisfied for our package?
~/Android/Sdk/platform-tools/adb shell pm get-app-links app.dropin.playdate
~/Android/Sdk/platform-tools/adb shell pm verify-app-links --re-verify app.dropin.playdate
```

Then a real link test: send/`am start` an `https://drop-in-mu.vercel.app/playdate/<real-id>`
link with the app installed and **closed**, and observe it open.

⚠️ **A production deploy is required to verify criterion 2, and a deploy needs
the founder's authorization.** If you reach that point, STOP and report that
the deploy is needed — do not deploy.

## Out of scope

- **iOS / `apple-app-site-association` / Associated Domains** (slice 2a).
- **The custom scheme** — 2c owns it; do not touch it.
- **Password-reset and email-confirmation links completing inside the app.**
  The plan lists this, but it is a DIFFERENT mechanism (a recovery token must
  reach Supabase inside the shell) and it has its own risks. **Record it as a
  named follow-up** with what you learned about the path routing, rather than
  attempting it here.
- Any change to `send-push`, the auth flow, or the login screen.

## Traps

- **Two fingerprints, and we have one** (see above).
- **The catch-all rewrite** (see above) — MEASURE, do not assume.
- **`autoVerify` is verified at install time and cached**: after changing the
  filter or the JSON, a reinstall (or `pm verify-app-links --re-verify`) is
  needed, or Android will keep the stale verdict. Do not conclude failure from
  a stale verdict, and do not conclude success from a stale pass either.
- **2c's scheme filter must survive** — the manifest now has real, working
  intent-filter state that the OAuth return depends on. A careless rewrite of
  that activity block breaks a flow that is proven working today.
- **A link with no app installed must still show the web page** — the web app
  is the landing pad, and that is the fallback that must not break.

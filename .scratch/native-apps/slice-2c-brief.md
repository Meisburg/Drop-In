# Slice 2c brief — the native OAuth RETURN (so a Google-only parent can sign in)

> **Read first, in this order:**
> 1. `.scratch/native-apps/plan.md` — slice 3 is the neighbouring contract; this
>    slice is deliberately NOT slice 3 (see "Why not slice 3" below).
> 2. `src/lib/oauth.ts` — the provider seams (`oauthRedirectTo`, `resolveOAuthProviders`).
> 3. `src/lib/db.ts` — `signInWithOAuthProvider` (~line 330) is the call site.
> 4. `src/lib/publicUrl.ts` — why the shell's origin is unusable as a return target.
> 5. `android/app/src/main/AndroidManifest.xml` and `capacitor.config.ts`.
> 6. `docs/agents/code-structure.md` — the build law.

## Why this slice exists — a MEASURED launch blocker

On 2026-10-06 the founder could not sign into the native app at all. Their
account is **Google-only**, so:

- they have **no password** — the email/password path cannot work for them;
- **"Continue with Google" cannot return to the app**, because the OAuth redirect
  is an **https** URL and nothing brings the browser back to the shell.

Verified in the tree, not assumed:

- `signInWithOAuthProvider` (db.ts) sets
  `redirectTo: oauthRedirectTo(currentPublicOrigin())` — an https origin — then
  `window.location.assign(data.url)`, which in the shell navigates the **WebView
  itself**.
- **None of the URL-return plumbing exists**: `package.json` has only
  `@capacitor/core|cli|android|push-notifications` — **no `@capacitor/app`, no
  `@capacitor/browser`**.
- `AndroidManifest.xml` has exactly one intent-filter (MAIN/LAUNCHER): **no
  custom scheme, no `autoVerify`**.
- The code itself says so: db.ts's comment reads *"The deep-link RETURN is still
  slice 3's job."*

**This is not a testing inconvenience.** A large share of real parents sign up
with Google, so **the native app is currently unusable for them** — which makes
this a **launch blocker for slice 4 (store submission)**, independent of push.

**It also blocks BOTH OAuth providers at once.** `src/lib/oauth.ts` already
supports `'google' | 'facebook'` (decision **D3, 2026-09-11**: ship Google keep
Facebook built-but-off, switched by `VITE_OAUTH_PROVIDERS`). Facebook is fully
built and needs only config — but it would hit this identical wall.

## Objective

A parent taps **Continue with Google** inside the native app, completes the
provider round trip in a browser, and **lands back in the app signed in**.

## Approach — a CUSTOM URL SCHEME, not https App Links

Register `app.dropin.playdate://` (the `appId`) and use it as the OAuth redirect.

**Why not slice 3's https App Links here:** App Links require the domain
association files (`assetlinks.json`) to be **served from production** and
`autoVerify` to pass — a deploy-coupled, slower loop. A custom scheme needs no
domain, no association file, and no deploy. Slice 3 still exists and is still
needed, but for **shared drop-in links** in https — a different problem. Do not
conflate them, and do not expand this slice into slice 3.

## Scope

1. **`package.json`** — add `@capacitor/app` and `@capacitor/browser`.
2. **`android/app/src/main/AndroidManifest.xml`** — add an intent-filter for the
   custom scheme on `MainActivity`. ⚠️ `android:launchMode="singleTask"` is
   **already set** and is required so the return reuses the running task
   instead of starting a second instance — verify it, do not re-add it.
3. **`src/lib/oauth.ts`** — a pure function for the native return target (so the
   web target and the native target are each named once and unit-testable).
4. **`src/lib/db.ts`** — `signInWithOAuthProvider` must, **in the shell only**,
   use the custom-scheme redirect and open the URL in an **external browser**
   (`Browser.open`) rather than `window.location.assign`, which would navigate
   the WebView away from the app.
5. **The return handler** — on `appUrlOpen`, complete the session. ⚠️ **The
   mechanism depends on the auth flow type, and you must DETERMINE it rather
   than assume:** `createClient(url, anonKey)` (db.ts:134) passes **no
   `flowType`**, so supabase-js's default applies. Read what the installed
   version actually defaults to and handle the corresponding shape — an
   implicit-flow return arrives with tokens in the **URL fragment**
   (`#access_token=…`) and needs the session set from them; a PKCE return
   arrives with `?code=…` and needs `exchangeCodeForSession`. **Say in your
   report which flow is in force and which handler you therefore wrote, with the
   evidence.** Getting this wrong produces a silent no-op — the worst outcome
   here.
6. **Tests** per the build law: the pure parts (redirect target selection) get
   unit tests with injected deps. The provider round trip itself cannot be
   unit-tested — say so rather than faking it.

## The production config this needs (NOT optional — name it)

Supabase rejects a `redirect_to` that is not on its **redirect allowlist**. The
custom scheme must be added to the project's allowed redirect URLs or every
attempt fails with a redirect error. **This is a production config change and
needs the orchestrator/founder to apply it** — record it under Risks as a
required step with the exact value, and do NOT try to apply it yourself.

## Requirements

- **The WEB flow must not regress.** In a browser the current behaviour is
  correct and must stay byte-for-byte: https redirect, `window.location.assign`,
  no external-browser call. `e2e/` covers this — the existing auth specs are
  your regression lane.
- **Detect the shell from the seam that already exists** (`nativePushShellPlatform`
  / the `publicUrl` shell check) — do **not** invent a third platform sniff.
- **Never navigate the WebView to a provider** in the shell: that is the current
  bug. The provider page must open outside the app.
- **Every failure is a sentence**, not a raw error — reuse `oauthErrorMessage`.
- A cancelled round trip must be recoverable, not a dead screen.

## Acceptance criteria

1. **In the native app**, tapping **Continue with Google** opens a browser,
   completes, and returns to the app **signed in** (the app shows the feed, not
   the login screen).
2. The **browser** (web app) Google sign-in still works, unchanged.
3. The device check is real and available: **the Pixel 9 Pro is connected** and
   Google OAuth is already enabled on the Supabase project (the web app uses it).

## Verification command

`npm run verify` (build + test + lint) plus the targeted auth e2e specs, and then
a **real-device check** driven with `adb`/`uiautomator` — the same method that
proved the push path: sign out, tap Continue with Google, complete in the
browser, and confirm the app returns signed-in.

## Out of scope

- Slice 3's https App Links / `assetlinks.json` / shared-link handling.
- Any iOS work (2a deferred).
- Turning Facebook ON (a `VITE_OAUTH_PROVIDERS` config change plus Meta
  credentials — separate).
- Changing any provider's copy or the login screen's layout.

## Traps (measured, or measured-by-predecessor)

- **`launchMode="singleTask"` is load-bearing** for the scheme return.
- **The flow type decides the handler** — determine it, do not guess (see 5).
- **The redirect allowlist is server-side**; a correct client still fails without
  it.
- **`skipBrowserRedirect: true` is already set** — keep it; the code opens the
  URL itself.
- **Do not `window.location.assign` in the shell** — that is the defect.

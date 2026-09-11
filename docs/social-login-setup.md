# Social sign-in setup (V4 slice 4)

The code is done and committed. **Nothing about Google/Facebook sign-in works
until the four steps below are done by a human with access to those accounts** —
they cannot be done from the development machine. Until then the buttons show
"Google sign-in isn't switched on yet — use your email and password for now."

Project ref: `ayzvjwxbxyrcgyoeaxuk` (from `.env` → `VITE_SUPABASE_URL`).

---

## 1. Google (≈10 minutes, no review needed)

1. https://console.cloud.google.com → create a project (or pick an existing one).
2. **APIs & Services → OAuth consent screen**: External, app name "Drop In",
   your email as support + developer contact. Scopes: the defaults
   (`userinfo.email`, `userinfo.profile`, `openid`) are enough. You do **not**
   need to publish or verify for personal use — "Testing" mode works, but only
   for accounts you add as **test users** (add your own and Nicole's).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**
   - Name: `Drop In web`
   - **Authorized redirect URIs** — add exactly this one:
     ```
     https://ayzvjwxbxyrcgyoeaxuk.supabase.co/auth/v1/callback
     ```
   - Authorized JavaScript origins: not required.
4. Copy the **Client ID** and **Client secret**.

## 2. Facebook (≈20 minutes, optional — see D3 in plan-v4.md)

1. https://developers.facebook.com → create an app → type **Consumer**.
2. Add the **Facebook Login** product (Web).
3. **Facebook Login → Settings → Valid OAuth Redirect URIs** — add exactly:
   ```
   https://ayzvjwxbxyrcgyoeaxuk.supabase.co/auth/v1/callback
   ```
4. **Settings → Basic**: app domain + privacy policy URL are required before
   the app can leave Development mode. In Development mode only app
   admins/testers can sign in — fine for the two-family beta.
5. Copy the **App ID** and **App secret**.

## 3. Supabase (≈3 minutes)

1. https://supabase.com/dashboard/project/ayzvjwxbxyrcgyoeaxuk/auth/providers
2. **Google** → enable → paste Client ID + Client secret → Save.
3. **Facebook** → enable → paste App ID + App secret → Save.
4. https://supabase.com/dashboard/project/ayzvjwxbxyrcgyoeaxuk/auth/url-configuration
   → **Redirect URLs** → add every origin the app is served from:
   ```
   http://localhost:5173/**
   http://127.0.0.1:5173/**
   http://192.168.1.61:5173/**     <- phone testing on the home Wi-Fi
   ```
   (Add the real deployment URL here too, once it exists.)
   Site URL can stay as-is; the app sends an explicit `redirectTo`.

## 4. Test it

1. `npm run build` (the app must be the built one — `npm run preview` on :4173
   — or the dev server on :5173).
2. Open /login and tap **Continue with Google**.
3. Expected: Google's account chooser → back to the app → **"Pick your display
   name"** (a first-time social user has no profiles row yet — the handle step
   creates it) → then the normal "Set your location" step → the feed.

If you see the raw JSON page `{"code":400,...}` instead, the provider is still
not enabled — the app now probes the authorize URL first and shows a sentence
instead, so seeing that page at all means the probe was bypassed (report it).

## What the code does (for reference)

- `src/lib/oauth.ts` — pure seams: the provider list, the redirect URL, the
  error wording, the suggested handle, and `probeOAuthProvider` (the preflight
  that stops an un-enabled provider from dumping the user on a JSON error page).
- `src/lib/db.ts` → `signInWithOAuthProvider` — `skipBrowserRedirect`, probe,
  then navigate.
- `src/pages/LoginPage.tsx` — the two buttons + inline error.
- `src/pages/OnboardingPage.tsx` — the handle step when `profile === null`.

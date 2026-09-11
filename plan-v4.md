# Plan V4 — "Drop In": mobile-app conversion

> Origin: human request 2026-09-11 (voice session). Four asks:
> (1) implement the mobile-experience fixes the agent identified;
> (2) rename the product **Playdate → Drop In** with a new logo;
> (3) a splash screen showing the logo on cold start;
> (4) social login (Google / Facebook).
> Goal: the product should *feel* like a phone app — target Android + iOS.

## State at planning time

- V3 fully closed (`f0d9139`); 253/253 unit, 19/19 e2e green; live DB clean (2 users).
- No pending migrations. No open tickets.
- Product copy already speaks "drop-in" everywhere — only the *brand name* is "Playdate".

## Invariants (every slice)

1. Gate = `npm run build && npm run test` green + the affected e2e spec green.
2. Commit per slice, conventional message, task-state.md updated at close-out.
3. No DB migration unless the slice's AC requires it. Slices 1–3 require none.
4. One writer in the repo (this session). Subagents are read-only research only.
5. Preserve V1–V3 behavior: every existing unit + e2e test stays green. If a spec
   breaks, that is a finding, not a license to edit the spec's expectation.

---

## Slice 1 — Mobile polish (no migration)

**Problem (measured, not vibes).** `index.html` sets `viewport-fit=cover`, but no
surface pads for the notch / home indicator, and the primary tap targets are 32px.

**AC**

1. Header pads for the status bar/notch (`env(safe-area-inset-top)`).
2. Bottom nav pads for the home indicator (`env(safe-area-inset-bottom)`); the
   `main` bottom padding clears nav + inset.
3. Every primary tap target is ≥44px tall (Apple HIG / Material 48dp-adjacent):
   - card going-check (`DropInCard`), /new steppers (`NewPlaydatePage`),
     login submit + mode toggle, detail-page action rows, comment composer.
4. No horizontal overflow at 320px, 375px, 390px, 430px.
5. Landscape (`dvh`) and the iOS keyboard do not hide the composer.

**Files.** `src/App.tsx`, `src/index.css` (safe-area utilities),
`src/components/DropInCard.tsx`, `src/pages/NewPlaydatePage.tsx`,
`src/pages/LoginPage.tsx`, `src/pages/PlaydateDetailPage.tsx`.

**Verify.** `npm run build && npm run test`; e2e `golden-path`, `card-circles`,
`comments`; manual phone pass.

---

## Slice 2 — Brand rename: Playdate → Drop In

**Scope decision (default, flagged to human): brand surface only.**
Renamed: `<title>`, meta description, manifest `name`/`short_name`, header
wordmark + logo, user-facing copy, README.
**NOT renamed:** `playdates` table, `/playdate/:id` route, `Playdate*` TS types,
ICS `UID <id>@playdate`. Rationale: zero user-visible benefit, high churn,
and the ICS UID is calendar-event identity (changing it re-invites everyone).

**AC**

1. No user-visible "Playdate" string remains (`grep -rn "Playdate" src index.html`
   returns only type/identifier hits).
2. New `DropInMark` SVG logo (inline React component) in the header, replacing
   the text wordmark; renders crisply at 20–32px.
3. Regenerated PWA icons from the logo: `favicon.svg`, `apple-touch-icon.png`
   (180×180), `pwa-192x192.png`, `pwa-512x512.png` (+ maskable 512).
4. Manifest: `name: "Drop In"`, `short_name: "Drop In"`, `theme_color` matched to
   the logo, `background_color` white.
5. Existing e2e specs stay green (none assert the old brand — verified by grep).

**Verify.** build + test; `npm run build` emits the new manifest (grep dist);
visual check of header + icons on the phone.

---

## Slice 3 — Splash screen

**Design.** iOS Safari generates **no** splash image for an arbitrary PWA, and
Android's is manifest-driven. So ship both layers:

1. **In-app splash overlay** (`SplashScreen.tsx`): full-bleed white screen, centered
   logo, shown on cold start and dismissed when the session resolves *or* after a
   700ms floor (never blocks a slow network for longer than that), fade-out.
   Must render for the signed-out path too — it is the "before the login screen"
   moment the human asked for.
2. **Native splash**: `apple-touch-startup-image` links for the common iPhone/iPad
   sizes + manifest `background_color`/`theme_color` for Android.

**AC**

1. Cold load shows logo → app; no flash of the login form first.
2. No layout shift after dismissal; the overlay never traps the user (a hard cap).
3. Reduced-motion respected (`prefers-reduced-motion` → no fade).
4. Splash is not re-shown on in-app navigation or on session refresh.

**Verify.** build + test; manual phone pass (cold start, and a warm reload).

---

## Slice 4 — Social login (Google + Facebook)

**Client work (this repo).** `signInWithOAuth({ provider: 'google' | 'facebook',
options: { redirectTo } })` on the login page, with proper provider buttons above
the email form. OAuth users arrive **without a display_name** — the profiles row
requires a unique handle, so the return path must route them into a
"pick your handle" step (reuses the existing onboarding gate pattern).

**HUMAN-OWNED BLOCKER (cannot be done from this machine).**

1. Google Cloud Console → OAuth 2.0 Client ID (Web) → authorized redirect URI
   `https://<project-ref>.supabase.co/auth/v1/callback`.
2. Meta for Developers → app + Facebook Login → same redirect URI.
3. Supabase dashboard → Authentication → Providers → enable Google + Facebook with
   those client id/secret; add the app origin(s) to the redirect allowlist.

**AC**

1. Provider buttons render and call `signInWithOAuth` with the right redirect.
2. A first-time OAuth user is routed to the handle step and lands on the feed with
   a profiles row.
3. An existing OAuth user signs in and lands on the feed.
4. Until providers are enabled in Supabase, the buttons surface a clear inline
   error — never a silent no-op.

**Verify.** unit tests on the pure redirect/handle-gate seams; live check blocked
until the human finishes the console steps.

---

## Deferred / decisions for the human

| # | Question | Default if no answer |
|---|---|---|
| D1 | Rename the share URL too (`/playdate/:id` → `/dropin/:id`)? Old links would need a redirect. | Keep `/playdate/:id` |
| D2 | Native store apps (App Store / Play Store) via Capacitor, or installable PWA only? Apple needs a Developer account (99/yr) and rejects thin website wrappers; push notifications are the usual justification. | PWA only for V4; Capacitor as V5 |
| D3 | Facebook login — keep it? Meta app review is real work; Google alone covers ~most users. | Build both, ship Google first |

## Out of scope for V4

Web push (needs deploy + HTTPS), edit-before-start, age filter, AI smart-paste.

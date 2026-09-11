# Drop In

A mobile-first PWA where Seattle parents post drop-in playdates ("at this
playground, 3–5, come by if you like") and browse what's happening nearby
today. See `plan.md` for the implementation plan and `task-state.md` for
current state.

## Stack

Vite + React 18 + TypeScript + Tailwind CSS v4 (CSS-first) + react-router +
Supabase (`@supabase/supabase-js`) + vite-plugin-pwa.

## Getting started

```sh
npm install
cp .env.example .env  # or copy your Supabase credentials into .env
npm run dev
```

Required env vars (in `.env`, never committed):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Scripts

- `npm run dev` — dev server
- `npm run build` — type-check + production build (emits `dist/` incl. PWA manifest)
- `npm run test` — vitest (unit tests, `src/**/*.test.ts`)
- `npm run lint` — oxlint
- `npm run preview` — preview the production build
- `npm run test:e2e` — Playwright against the live Supabase project (needs
  `npm run build` first; creates an `e2e-<epoch>` marker account)

## Mobile / PWA checks (V4)

These drive the **built** app (`npm run build` then `npm run preview`, or any
base URL as the first argument). They exist because the phone-level defects they
catch are invisible in a desktop browser and in the unit tests.

- `node scripts/mobile-audit.mjs [url]` — phone-width sweep (portrait +
  landscape): horizontal overflow, text controls under 16px (iOS zooms the page
  on focus), tap targets under 44px.
- `node scripts/verify-splash.mjs [url]` — the boot splash is in the HTML, the
  React overlay takes over, leaves inside its cap, and never replays on
  in-app navigation.
- `node scripts/verify-pwa.mjs [url]` — service worker takes control, the
  manifest is installable, every advertised icon resolves, the iOS standalone
  metadata is present, and a cold **offline** load still paints the app shell.
- `bash scripts/build-icons.sh` / `node scripts/build-splash.mjs` —
  regenerate the app icons and the iOS startup images from their SVG sources.

## Layout

- `src/pages/` — route screens
- `src/components/` — shared UI
- `src/lib/` — Supabase client + data access (`db.ts`), shared types
  (`types.ts`), pure auth-redirect logic (`auth.ts`)
- `supabase/migrations/` — SQL migrations, applied to the live Supabase project
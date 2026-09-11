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

## Layout

- `src/pages/` — route screens
- `src/components/` — shared UI
- `src/lib/` — Supabase client + data access (`db.ts`), shared types
  (`types.ts`), pure auth-redirect logic (`auth.ts`)
- `supabase/migrations/` — SQL migrations, applied to the live Supabase project
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Tailwind CSS v4 (CSS-first: `@import "tailwindcss"` in src/index.css,
    // no tailwind.config.js)
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // V8 ticket 08: injectManifest + a real src/sw.ts, because web push is
      // delivered to the SERVICE WORKER and generateSW has nowhere to put a
      // `push`/`notificationclick` handler. The generated worker's four
      // shell-serving lines (skipWaiting, clientsClaim, precacheAndRoute,
      // NavigationRoute→index.html) are reproduced by hand in src/sw.ts — the
      // `scripts/verify-pwa.mjs` cold-OFFLINE reload is what proves it.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        // The iOS startup images are per-device and never fetched by the app
        // itself — precaching all 96KB of them would only slow the install.
        globIgnores: ['splash/**'],
        // The default glob is js/css/html/ico/png/svg — without naming woff2 the
        // display font would be missing from the precache and a cold OFFLINE
        // load would fall back to system type (the shell itself still paints,
        // which is exactly the kind of regression that hides).
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Drop In',
        short_name: 'Drop In',
        description:
          'Drop-in playdates for Seattle families — post a time and place, come by if you like.',
        theme_color: '#e8552f',
        // Matches the splash (index.html boot splash + SplashScreen) so
        // Android's generated launch screen is the same brand frame.
        background_color: '#e8552f',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          // Maskable: Android crops to its own shape — the mark sits inside
          // the safe zone so nothing important is clipped.
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
})
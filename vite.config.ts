import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/

/**
 * BUILD-ONLY: strip the local dev-tool injector from the shipped HTML.
 *
 * THE HAZARD, and it is not hypothetical — it recurred on 2026-10-05 and cost a
 * mobile-audit run: the design tool on this machine (`~/.impeccable`, a live
 * server on :8400) writes a commented block into `index.html` —
 *
 *     <!-- impeccable-live-start -->
 *     <script src="http://localhost:8400/live.js?token=…"></script>
 *     <!-- impeccable-live-end -->
 *
 * — and `index.html` is a TRACKED file, so the edit shows up as uncommitted
 * work in a working tree any agent may stage from, and `vite build` bakes the
 * tag straight into `dist/`. `dist/` is gitignored and cannot be committed, but
 * it IS what the native-app plan bundles and what every preview-based audit and
 * e2e run serves: a shell built from that output would ship a localhost script
 * tag, and the mobile audit measured the dev overlay's own buttons instead of
 * the app (56 failures, all of them the injector).
 *
 * The V29 record flagged the same injector and stripped it by hand; it came
 * back the moment the tool ran again. A hand-strip cannot hold a rule that a
 * running tool re-breaks, so the RULE moves into the build: the block is
 * removed from the built HTML, while the dev server keeps serving it so the
 * human's tooling still works. The measurement that proves it: with the block
 * present in `index.html`, `dist/index.html` contains no `impeccable-live` and
 * no `localhost:8400`.
 */
function stripDevInjector() {
  const BLOCK =
    /[ \t]*<!--\s*impeccable-live-start\s*-->[\s\S]*?<!--\s*impeccable-live-end\s*-->[ \t]*\n?/g
  return {
    name: 'strip-dev-injector',
    apply: 'build' as const,
    transformIndexHtml(html: string) {
      return html.replace(BLOCK, '')
    },
  }
}

export default defineConfig({
  // PHONE LANE (added 2026-10-07). Vite binds loopback by DEFAULT, so a dev
  // server started here is invisible to a phone on the tailnet — the symptom is
  // a connection that simply never opens, which reads like the phone or
  // Tailscale being broken rather than a bind address. `host: true` binds every
  // interface, including the tailnet address (100.120.87.29), so
  // http://omarchy-2.tail0c686b.ts.net:5173 serves the app AND the Agentation
  // toolbar can reach the MCP server on :4747 from the same origin family.
  // This is a DEV-ONLY bind: `vite build` output is unaffected.
  server: {
    host: true,
    port: 5173,
    // Vite 5+ rejects requests whose Host header is not loopback or an explicit
    // allowlist entry — "Blocked request. This host is not allowed" — which is a
    // DNS-rebinding guard, not a network problem. A phone reaches this dev server
    // by the tailnet name, so that name must be listed or the page never loads even
    // though the port is open. `.ts.net` is Tailscale's own suffix, so the entry is
    // the tailnet hostname for this box (see `tailscale status --json` → Self.DNSName).
    allowedHosts: ['omarchy-2.tail0c686b.ts.net', '.tail0c686b.ts.net'],
  },
  plugins: [
    react(),
    // Tailwind CSS v4 (CSS-first: `@import "tailwindcss"` in src/index.css,
    // no tailwind.config.js)
    tailwindcss(),
    stripDevInjector(),
    VitePWA({
      registerType: 'autoUpdate',
      // ⚠️ NO INJECTED REGISTRATION SCRIPT (slice 2e). The default injects
      // `<script src="/registerSW.js">` into EVERY build, and in the Android
      // shell that tag registered a worker the shell gets nothing from (it
      // delivers push over FCM, has no `PushManager`, so no `push` event) while
      // its precache kept serving the PREVIOUS bundle on the first launch after
      // an update — which, in a SPA that loads once, was the whole session.
      // `src/lib/serviceWorkerPolicy.ts` is now the one place that decides:
      // a browser registers, a shell unregisters.
      injectRegister: false,
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
        // V22 slice 14: appearance is a USER CHOICE (light default; dark opt-in
        // via /settings), so the manifest ships the LIGHT chrome colour. The
        // dark page neutral (#181412 in src/index.css) is swapped into the
        // theme-color meta at runtime by ThemeToggle when the user picks dark —
        // the manifest carries one value, and light is what everyone gets.
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
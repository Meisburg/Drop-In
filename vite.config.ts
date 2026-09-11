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
      // The iOS startup images are per-device and never fetched by the app
      // itself — precaching all 96KB of them would only slow the install.
      workbox: { globIgnores: ['splash/**'] },
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Drop In',
        short_name: 'Drop In',
        description:
          'Drop-in playdates for Seattle families — post a time and place, come by if you like.',
        theme_color: '#4f46e5',
        // Matches the splash (index.html boot splash + SplashScreen) so
        // Android's generated launch screen is the same brand frame.
        background_color: '#4f46e5',
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
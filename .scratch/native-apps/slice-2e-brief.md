# Brief — the shell must stop serving a stale bundle after an update (2e)

## The defect, measured under control

Slice 2d-ii characterised this while chasing something else, and it is
**user-facing**:

The workbox precache **survives an app update**. With the precache holding
`index-B_Jmv9ju.js` and an APK whose only bundle was `index-C9b6OlYG.js`:

```
t+1s  loaded index-B_Jmv9ju.js   ← a bundle the INSTALLED APK NO LONGER CONTAINS
t+2s  loaded index-B_Jmv9ju.js
t+3s  loaded index-B_Jmv9ju.js   ← the new SW installs here
t+8s  loaded index-B_Jmv9ju.js
reload → index-C9b6OlYG.js
```

Because this app is a SPA that loads once and stays, **"the first page load" is
the whole session**. So **a parent who updates from Play sees the PREVIOUS
version's UI until they navigate or relaunch.**

⚠️ **Why this matters more than a cosmetic lag:** we have just shipped a fix to
"Use my location" (2d). On this behaviour, a parent who updates to that release
gets the **still-broken** location button for their entire first session. A stale
first session would show parents the exact bug we just fixed.

## The mechanism

`vite.config.ts` uses `VitePWA({ registerType: 'autoUpdate', strategies:
'injectManifest' })`, and the built `index.html` carries, **unconditionally**:

```html
<script id="vite-plugin-pwa:register-sw" src="/registerSW.js"></script>
```

That is in `dist/index.html` **and** in `android/app/src/main/assets/public/index.html`
— the shell registers a service worker it gets no benefit from.

## Why the shell does not need a service worker

- Its assets are **local to the APK** — offline already works without a cache.
- The worker exists for **web push**. The shell uses **FCM**, not web push.
- Slice 2b-iii already established the shell has **no `PushManager`, no
  subscription, and therefore no `push` event** — the suppression handler never
  runs. The worker is inert in the shell.

## The fix

**Do not register the service worker in the shell, and unregister anything a
previous version registered.**

Recommended shape — decide the details yourself:

1. `injectRegister: false` in `vite.config.ts`, and register **manually** from a
   `src/lib/` module so the decision is testable and has one home (the build law:
   `lib/*.ts` + a sibling `lib/*.test.ts`). Gate it on the existing shell seam
   (`nativePushShellPlatform()`).
2. In the shell, **unregister existing registrations** (and clear the caches they
   own) so the transition happens once. Check what the web path must keep doing —
   **the web's service worker is live and must not regress**; web push depends on
   it.

⚠️ **Expect a ONE-UPDATE transition and say so plainly rather than claiming
instant cleanliness:** on the first launch after this ships, the *old* bundle is
still what loads (it has no unregister code). The new worker installs in the
background, the next navigation serves the new bundle, and **that** bundle
unregisters — so the shell is clean from then on. Verify or refute that reasoning
on the emulator; if you can make the first post-update launch correct too, say how
and prove it, but do not trade a reload loop for it.

## Acceptance criteria

1. **Measured on the emulator with the same technique that found it**: install a
   build, then install a build whose bundle filename differs, and show the first
   launch serves **the bundle the APK actually contains** — or, if the one-update
   transition is real, show precisely what the first and second launches serve and
   state the window.
2. The **web** path still registers and still serves web push (say how you know —
   a browser lane is fine here, targeted spec files only).
3. `npm run verify` exit 0.
4. A sibling test pins the shell/web decision, and fails if the shell starts
   registering again.

## ⚠️ COLLISION WARNING — another session is ACTIVE

Its uncommitted footprint has been growing during this batch: `.gitignore`,
`index.html` (an impeccable design-tool injection), `src/index.css`,
`src/pages/FeedPage.tsx`, `src/components/LocationModal.tsx` (V31), and
`src/components/ProfileView.tsx`. **Do NOT revert, reformat or "tidy" any of it;
never `git stash`, never `git checkout -- <file>`, never `git add -A`, and do NOT
commit** — the orchestrator stages by hunk. Its mid-edit files have already broken
`verify` twice for another builder; if `verify` fails on a file outside your diff,
**wait and re-run** rather than "fixing" it.

## Verification command

`npm run verify` (exit code + counts), the emulator sequence in criterion 1, and
any targeted browser spec you need for criterion 2. **Never a bare
`npx playwright test`** — it writes to production.

/**
 * Which service worker this build runs — and why the shell runs NONE (slice 2e).
 *
 * ⚠️ THE DEFECT THIS CLOSES, measured on the AVD (`.scratch/native-apps/slice-2d-ii-evidence.md`
 * §7): a workbox precache **survives an app update**. With the precache holding
 * `index-B_Jmv9ju.js` and an APK whose only bundle was `index-C9b6OlYG.js`, the
 * first launch after the update loaded `index-B_Jmv9ju.js` at t+1s…t+8s — **a
 * bundle the installed APK no longer contains** — while the new worker installed
 * in the background; only a *reload* served the new bundle. And this app is a
 * SPA that loads once and stays, so "the first page load" IS the whole session:
 * a parent who updated to the "Use my location" fix would have seen the
 * still-broken location button for their entire first session.
 *
 * WHY THE SHELL MUST NOT RUN A WORKER:
 *  * its assets are local to the APK, so offline already works with no cache;
 *  * the worker exists for **web push** — the `push` handler in `./sw.ts` — and
 *    the shell delivers notifications over **FCM**;
 *  * slice 2b-iii established the shell has no `PushManager` and no
 *    subscription, therefore no `push` event, so that handler never runs.
 * A worker in the shell can only serve stale bytes. It was registered by a
 * build-injected `<script src="/registerSW.js">` that ran unconditionally; the
 * build no longer injects it (`injectRegister: false` in `vite.config.ts`, and a
 * test in the sibling file fails if that is turned back on), and this module is
 * the ONE place that decides at runtime.
 *
 * THE WEB PATH IS UNCHANGED: a browser still registers `/sw.js` at the same
 * point in startup, because web push depends on that worker.
 *
 * ⚠️ THE TRANSITION IS ONE UPDATE, and it is stated rather than hidden: the first
 * launch after this ships still runs the OLD bundle (that bundle has no
 * unregister code, and the old worker is what serves it). The old bundle's
 * injected script fetches the new `sw.js`, the new worker installs in the
 * background, and the NEXT launch serves the new bundle — which unregisters and
 * clears the caches. That launch is the last one with a worker in the shell, so
 * the staleness window is one launch, once, and never again. Nothing here
 * reloads the page: trading a reload loop for a first-launch fix would be worse
 * than the defect.
 */
import { nativePushShellPlatform, type NativePushShellPlatform } from './nativePushToken'

/** Where `vite-plugin-pwa` puts the built worker (`filename: 'sw.ts'`, base `/`). */
const WEB_SERVICE_WORKER_URL = '/sw.js'
const WEB_SERVICE_WORKER_SCOPE = '/'

export type ServiceWorkerAction = 'register' | 'unregister'

/**
 * The whole rule, purely: a **browser** registers (web push is delivered to the
 * service worker, so that registration IS the feature), and a **shell** — either
 * shell — unregisters. `null` is `nativePushShellPlatform`'s answer for a
 * browser, which is a browser both because Capacitor said `web` and because
 * Capacitor could not be loaded at all; registering is the safe reading of both.
 */
export function serviceWorkerAction(shell: NativePushShellPlatform | null): ServiceWorkerAction {
  return shell === null ? 'register' : 'unregister'
}

export interface ServiceWorkerPolicyInput {
  /** The shell answer (`nativePushShellPlatform`), injected so the rule is testable. */
  shell: NativePushShellPlatform | null
  register(): void
  unregister(): Promise<void>
}

/**
 * The rule above, executed against whatever the caller wired in. Returns the
 * action it took so a caller (or a test) can see the decision rather than infer
 * it from effects. `unregister` is deliberately not awaited: this runs on app
 * start and nothing downstream depends on the registration being gone.
 */
export function applyServiceWorkerPolicy(input: ServiceWorkerPolicyInput): ServiceWorkerAction {
  const action = serviceWorkerAction(input.shell)
  if (action === 'register') input.register()
  else void input.unregister()
  return action
}

// ─────────────────────────────────────────────────────────────────────────────
// The wiring — the only part that touches the real platform.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The browser's half, reimplementing the build-injected script verbatim:
 * `register('/sw.js', { scope: '/' })` on `load`, best effort. A browser that
 * refuses (an insecure origin, storage blocked) still gets the app.
 */
function registerWebServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  void navigator.serviceWorker
    .register(WEB_SERVICE_WORKER_URL, { scope: WEB_SERVICE_WORKER_SCOPE })
    .catch(() => undefined)
}

/**
 * The shell's half: drop every registration and the caches a previous version's
 * worker owns, so the shell stops serving the precache. Only the workbox
 * precache is load-bearing here; the other cache on this origin is
 * `PUSH_PREFS_CACHE`, a MIRROR of `localStorage` that is rewritten on every
 * toggle change (`pushClient.ts`, `writePushPrefs`) — so clearing it loses
 * nothing. Both steps are best effort: a shell that cannot unregister is still
 * an app, and this resolves rather than throwing into startup.
 */
async function unregisterShellServiceWorkers(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  try {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((registration) => registration.unregister()))
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
    }
  } catch {
    // Nothing a parent can act on, and nothing downstream depends on it.
  }
}

/**
 * App-start entry point (`main.tsx`). The platform question is asynchronous, so
 * the `load` listener is attached SYNCHRONOUSLY — attaching it after `load`
 * would silently stop the browser from ever registering, which is exactly the
 * regression this slice must not cause. If `load` has already fired by the time
 * this runs, it settles immediately.
 */
export function startServiceWorkerPolicy(): void {
  const settle = async (): Promise<void> => {
    applyServiceWorkerPolicy({
      shell: await nativePushShellPlatform(),
      register: registerWebServiceWorker,
      unregister: unregisterShellServiceWorkers,
    })
  }

  if (document.readyState === 'complete') void settle()
  else window.addEventListener('load', () => void settle())
}

/// <reference lib="webworker" />
/**
 * The Drop In service worker (V8 ticket 08).
 *
 * Until this ticket `vite-plugin-pwa` was in its `generateSW` mode, which
 * emits a shell-precaching worker with no place to put our own code — and web
 * push is delivered to the SERVICE WORKER, so a push-capable worker is the
 * feature. The build is now `injectManifest` against this file.
 *
 * THE REGRESSION GUARD FOR THAT SWITCH IS `scripts/verify-pwa.mjs` +
 * `scripts/verify-splash.mjs` (both must stay green): the first one reloads the
 * app with the network OFF and asserts the shell still paints, which is exactly
 * what a botched precache/fallback migration breaks. So the four things
 * `generateSW` used to emit for us are reproduced here EXPLICITLY, in the same
 * order the generated worker had them:
 *
 *     skipWaiting() · clientsClaim()
 *     precacheAndRoute(self.__WB_MANIFEST)
 *     cleanupOutdatedCaches()
 *     NavigationRoute(createHandlerBoundToURL('index.html'))
 *
 * The last line is the one that matters most offline: without it a cold offline
 * navigation to any route 404s instead of serving the shell.
 *
 * Then the three push handlers the ticket pins — `push`, `notificationclick`,
 * `pushsubscriptionchange` — plus the per-kind mute, which is enforced HERE
 * because a muted kind has no server-side preference table to consult (0031 and
 * 0032 are the only migrations this ticket may add; the residual is written
 * down in 0032's header).
 */
import { clientsClaim } from 'workbox-core'
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
  type PrecacheEntry,
} from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import {
  PUSH_PREFS_CACHE,
  PUSH_PREFS_CACHE_URL,
  base64UrlToBytes,
  isKindMuted,
  isNotificationKind,
  parsePushPrefs,
  shouldSuppressForQuietHours,
  type PushPrefs,
  type RotatedSubscriptionMessage,
  type ServiceWorkerInboundMessage,
} from './lib/push'

/**
 * The one binding the build injects: `injectManifest` replaces the literal
 * `self.__WB_MANIFEST` in this file with the precache list (so the identifier
 * must be spelled exactly that way — aliasing `self` to a local makes the
 * build fail with "Unable to find a place to inject the manifest").
 */
declare global {
  interface WorkerGlobalScope {
    __WB_MANIFEST: Array<PrecacheEntry | string>
  }
}

const sw: ServiceWorkerGlobalScope = self as unknown as ServiceWorkerGlobalScope

// --- the shell, exactly as generateSW emitted it --------------------------
sw.skipWaiting()
clientsClaim()
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

/**
 * The VAPID public key, baked at build time. Empty when the deployment has not
 * finished the human-owned setup (docs/push-setup.md) — in that case
 * `subscribe()` is still attempted without `applicationServerKey`, which the
 * Web Push protocol allows, so a parent's opt-in is recorded and starts working
 * the moment a sender exists.
 */
const VAPID_PUBLIC_KEY: string = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? ''

/**
 * The payload the `send-push` function posts (JSON). Everything is optional on
 * this side: a malformed or empty push must still produce a visible
 * notification, because a service worker that drops a push silently looks to
 * the platform like a bug and to the parent like nothing happened.
 */
interface PushMessage {
  title?: unknown
  body?: unknown
  url?: unknown
  kind?: unknown
  /** The sender's dedupe key — the notification `tag`, so a re-send replaces
   *  rather than stacks (the same rule as 0032's unique constraint). */
  tag?: unknown
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/** Read the published per-kind mutes out of Cache Storage (the SW cannot see
 *  localStorage). An absent or unreadable cache fails OPEN: `parsePushPrefs`
 *  treats garbage as "nothing muted", so a storage problem can never swallow a
 *  cancellation notice. */
async function readPrefs(): Promise<PushPrefs> {
  try {
    const cache = await sw.caches.open(PUSH_PREFS_CACHE)
    const response = await cache.match(PUSH_PREFS_CACHE_URL)
    if (response === undefined) return parsePushPrefs(null)
    return parsePushPrefs(await response.text())
  } catch {
    return parsePushPrefs(null)
  }
}

sw.addEventListener('push', (event) => {
  event.waitUntil(showPush(event))
})

async function showPush(event: PushEvent): Promise<void> {
  let message: PushMessage = {}
  try {
    message = (event.data?.json() ?? {}) as PushMessage
  } catch {
    // Not JSON (or no payload at all) — fall through to the generic copy below.
  }

  const kind = isNotificationKind(message.kind) ? message.kind : null

  // The per-kind mute and the quiet-hours window. The push has already arrived;
  // dropping it here is what "off" means until a profile×kind table exists.
  // Quiet hours never drop a cancellation or an early end — see
  // QUIET_HOURS_ALWAYS_ALLOWED — because those exist to stop a parent driving
  // out, and the alert is still in the app's Recent alerts list either way.
  const prefs = await readPrefs()
  if (kind !== null && isKindMuted(prefs, kind)) return
  if (shouldSuppressForQuietHours(prefs, kind, new Date())) return

  const url = asText(message.url) ?? '/'
  const title = asText(message.title) ?? 'Drop In'
  const body = asText(message.body) ?? 'Open Drop In to see what changed.'
  // The sender's key collapses a repeat of the same event into the already
  // visible notification; the fallback keeps the two obvious duplicates (same
  // URL) collapsed even if a future sender forgets to send one.
  const tag = asText(message.tag) ?? `dropin:${url}`

  await sw.registration.showNotification(title, {
    body,
    tag,
    data: { url, kind },
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
  })
}

sw.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = (event.notification.data ?? {}) as { url?: unknown }
  const target = new URL(asText(data.url) ?? '/', sw.location.origin).href
  event.waitUntil(openOrFocus(target))
})

/**
 * Tapping a notification must land the parent ON the post it is about. An
 * already-open Drop In tab is navigated to the target rather than replaced by a
 * second tab (which on iOS is not a choice the user can undo easily); only when
 * there is no Drop In tab at all do we open one.
 */
async function openOrFocus(target: string): Promise<void> {
  const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true })

  const exact = windows.find((client) => client.url === target)
  if (exact !== undefined) {
    await exact.focus()
    return
  }

  const sameOrigin = windows.find((client) => {
    try {
      return new URL(client.url).origin === sw.location.origin
    } catch {
      return false
    }
  })
  if (sameOrigin !== undefined) {
    try {
      await sameOrigin.navigate(target)
      await sameOrigin.focus()
      return
    } catch {
      // An uncontrolled client refuses navigate(); fall through to openWindow.
    }
  }

  await sw.clients.openWindow(target)
}

sw.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(rehandshake(event))
})

/**
 * The browser rotated the subscription behind our back (it does this on its own
 * schedule). We re-subscribe and hand the new subscription to every open app
 * window, which writes the row for the NEW endpoint under the parent's own RLS
 * (the SW cannot: the table is owner-only, and the SW has no session).
 *
 * BOTH HALVES OF THIS ARE REAL, and the client half is
 * `startPushSubscriptionRepair()` (src/lib/pushClient.ts), started by the authed
 * shell on every app open. The message below is not fire-and-forget: the app
 * listens for `push-subscription-changed` and persists the new endpoint, and a
 * rotation that happened while no tab was open is repaired by the app-open
 * re-register instead. That matters because the alternative is silent and
 * terminal — the sender keeps posting to the dead endpoint, the push service
 * answers 410, and the sender PRUNES the row, leaving an opted-in parent with no
 * row and no pushes (see docs/push-setup.md).
 */
async function rehandshake(event: PushSubscriptionChangeEvent): Promise<void> {
  const previous = event.oldSubscription
  if (previous === null || previous === undefined) return

  const keyBytes = VAPID_PUBLIC_KEY === '' ? null : base64UrlToBytes(VAPID_PUBLIC_KEY)
  let next: PushSubscription | null = null
  try {
    next = await sw.registration.pushManager.subscribe({
      userVisibleOnly: true,
      ...(keyBytes === null ? {} : { applicationServerKey: keyBytes }),
    })
  } catch {
    return
  }

  const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true })
  for (const client of windows) {
    // Typed against the ONE declaration of this message (src/lib/push.ts), so
    // the sender and the client listener below cannot drift apart.
    const rotated: RotatedSubscriptionMessage = {
      type: 'push-subscription-changed',
      subscription: next.toJSON(),
    }
    client.postMessage(rotated)
  }
}

sw.addEventListener('message', (event) => {
  const message = event.data as ServiceWorkerInboundMessage | null
  if (message === null || typeof message !== 'object') return
  if (message.type === 'push-prefs-changed') {
    // Mirror the client's prefs into the cache the `push` handler reads.
    event.waitUntil(publishPrefs(message.prefs))
  }
})

async function publishPrefs(prefs: PushPrefs): Promise<void> {
  try {
    const cache = await sw.caches.open(PUSH_PREFS_CACHE)
    await cache.put(
      PUSH_PREFS_CACHE_URL,
      new Response(JSON.stringify(prefs), { headers: { 'content-type': 'application/json' } }),
    )
  } catch {
    // Best effort: the client also writes the same cache entry directly.
  }
}

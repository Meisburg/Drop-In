import { beforeEach, describe, expect, it, vi } from 'vitest'
// Slice 3 — the two artifacts Android reads, and the pure rule that turns a URL
// into a screen. Read as SOURCE with `?raw`, this repo's pattern for a
// source-level pin (see oauth.test.ts, avatarUrl.test.ts): a `node:fs` read
// would be a build error, because tsconfig.app.json's types are ["vite/client"].
//
// The manifest is read with its comments STRIPPED. That is not tidiness: the
// slice-3 comment in that file names `drop-in-mu.vercel.app`, `/playdate/` and
// `android:autoVerify`, so a pin against the raw text would be satisfied by the
// prose alone — an instrument its own documentation passes.
import androidManifestSource from '../../android/app/src/main/AndroidManifest.xml?raw'
import assetLinksSource from '../../public/.well-known/assetlinks.json?raw'
import capacitorConfigSource from '../../capacitor.config.ts?raw'

/**
 * `@capacitor/app` is FAKED here, the way db-native-oauth.test.ts fakes it for
 * slice 2c: the device is the only place the real bridge exists, so what is
 * pinned is the WIRING — which launch URLs register a listener, which do not,
 * and what a delivered URL turns into.
 */
const caps = vi.hoisted(() => ({
  launchUrl: '',
  listeners: [] as { event: string; callback: (data: { url: string }) => void }[],
  removed: 0,
}))

vi.mock('@capacitor/app', () => ({
  App: {
    // A cold start's launch URL; `''` is what the web implementation answers.
    getLaunchUrl: async () => ({ url: caps.launchUrl }),
    addListener: async (event: string, callback: (data: { url: string }) => void) => {
      caps.listeners.push({ event, callback })
      return {
        remove: async () => {
          caps.removed += 1
        },
      }
    },
  },
}))

import { APP_LINK_HOST, APP_LINK_PATH_PREFIX, appLinkPath, subscribeAppLinks } from './appLinks'
import { NATIVE_OAUTH_SCHEME } from './oauth'

/** Our own shared link — built from the constant, never re-typed. */
const appLink = (path: string): string => `https://${APP_LINK_HOST}${path}`


/**
 * The upload key's SHA-256, read from the real keystore
 * (`/home/jmeisburg/.android-keys/drop-in-upload.jks`, alias `upload`) with
 * `keytool -list -v`, and the value slice 3's brief carries. Restated HERE on
 * purpose: this is the pin, not a second home — if `assetlinks.json` stops
 * carrying the key Android will actually verify against, this fails.
 *
 * ⚠️ It is NOT the only fingerprint the deployed file eventually needs: Play
 * App Signing re-signs the upload, so the Play app-signing SHA-256 must be
 * APPENDED before release (`docs/RELEASE-CHECKLIST.md` § 2.6). That is why the
 * legs below require the list to CONTAIN this value and to be well-formed, and
 * never require it to be the only one.
 */
const UPLOAD_KEY_SHA256 =
  '95:D0:0B:EF:A5:15:5C:23:5B:3F:2B:DB:EA:FD:70:D9:AD:B6:37:2D:23:46:8E:43:8E:27:E6:66:75:91:29:B4'

/** An Android SHA-256 cert fingerprint: 32 uppercase hex bytes, colon separated. */
const SHA256_FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/

describe('appLinkPath (what a shared https link opens)', () => {
  it('opens the detail path for our host', () => {
    expect(appLinkPath(`https://${APP_LINK_HOST}/playdate/abc-123`)).toBe('/playdate/abc-123')
  })

  it('keeps the search and the hash — the router decides what they mean', () => {
    expect(appLinkPath(`https://${APP_LINK_HOST}/playdate/abc?ping=1#top`)).toBe(
      '/playdate/abc?ping=1#top',
    )
  })

  it('takes the whole claimed prefix, not just the detail route', () => {
    // The manifest claims `/playdate/`, so this function must not hold a
    // narrower opinion than the filter does — the router routes, or the
    // catch-all sends it home.
    expect(appLinkPath(`https://${APP_LINK_HOST}/playdate/abc/edit`)).toBe('/playdate/abc/edit')
  })

  it('refuses a host that merely contains ours', () => {
    expect(appLinkPath(`https://${APP_LINK_HOST}.evil.example/playdate/abc`)).toBeNull()
    expect(appLinkPath(`https://evil.example/playdate/abc?x=${APP_LINK_HOST}`)).toBeNull()
  })

  it('refuses anything that is not our https host and prefix', () => {
    // http: the filter claims https only.
    expect(appLinkPath(`http://${APP_LINK_HOST}/playdate/abc`)).toBeNull()
    // A different path on our own host — /reset-password's emailed link above all.
    expect(appLinkPath(`https://${APP_LINK_HOST}/reset-password`)).toBeNull()
    expect(appLinkPath(`https://${APP_LINK_HOST}/`)).toBeNull()
    // Slice 2c's OAuth return: NOT ours to route, and conflating the two is the
    // failure this leg exists to catch.
    expect(appLinkPath('app.dropin.playdate://#access_token=t&refresh_token=r')).toBeNull()
  })

  it('refuses what is not a URL at all — including the web plugin empty string', () => {
    // @capacitor/app's AppWeb answers `{ url: '' }` to getLaunchUrl().
    expect(appLinkPath('')).toBeNull()
    expect(appLinkPath('/playdate/abc')).toBeNull()
    expect(appLinkPath('not a url')).toBeNull()
  })
})

describe('public/.well-known/assetlinks.json (the file Android fetches)', () => {
  const association = JSON.parse(assetLinksSource) as unknown
  const entries = association as Array<Record<string, never>>
  const target = entries[0]?.target as unknown as {
    namespace?: string
    package_name?: string
    sha256_cert_fingerprints?: string[]
  }

  it('is a non-empty read of a JSON ARRAY, not an object', () => {
    // An empty `?raw` read would make every negative leg below vacuously true,
    // and Google rejects a bare object here — both halves are the finding.
    expect(assetLinksSource.trim().length).toBeGreaterThan(0)
    expect(Array.isArray(association), 'assetlinks.json must be a JSON array').toBe(true)
    expect(entries).toHaveLength(1)
  })

  it('delegates url handling to the android_app package the config names', () => {
    const appId = capacitorConfigSource.match(/appId:\s*'([^']+)'/)?.[1]
    expect(appId, "capacitor.config.ts's appId is the package's one home").toBeDefined()
    expect(entries[0]?.relation).toEqual(['delegate_permission/common.handle_all_urls'])
    expect(target.namespace).toBe('android_app')
    expect(target.package_name).toBe(appId)
  })

  it('carries the upload keystore fingerprint in the format Android parses', () => {
    const fingerprints = target.sha256_cert_fingerprints
    expect(fingerprints, 'sha256_cert_fingerprints must be a non-empty list').toBeDefined()
    expect(fingerprints!.length).toBeGreaterThan(0)
    for (const fingerprint of fingerprints!) {
      expect(fingerprint, `${fingerprint} is not an uppercase colon-separated SHA-256`).toMatch(
        SHA256_FINGERPRINT,
      )
    }
    expect(fingerprints).toContain(UPLOAD_KEY_SHA256)
  })
})

describe('the manifest filter slice 3 claims the host with', () => {
  /** The manifest with its comments removed — prose must not satisfy a pin. */
  const manifest = androidManifestSource.replace(/<!--[\s\S]*?-->/g, '')
  const viewFilters = [
    ...manifest.matchAll(/<intent-filter([^>]*)>([\s\S]*?)<\/intent-filter>/g),
  ]
    .map(([, attrs, body]) => ({ attrs: attrs ?? '', body: body ?? '' }))
    .filter((filter) =>
      /<action\s+android:name="android\.intent\.action\.VIEW"\s*\/>/.test(filter.body),
    )

  it('is a SECOND ACTION_VIEW filter, not a rewrite of slice 2c', () => {
    // Two, and the count is the point: 2c's OAuth return is proven working on
    // hardware and its filter must still be here, beside this one.
    expect(viewFilters).toHaveLength(2)
  })

  it('declares https, our host and the claimed prefix, with autoVerify', () => {
    const httpsFilter = viewFilters.find((filter) => /android:scheme="https"/.test(filter.body))
    expect(httpsFilter, 'no https intent filter for shared links').toBeDefined()
    // autoVerify is the attribute that makes the OS fetch assetlinks.json at
    // install time; without it Android opens the browser and says nothing.
    expect(httpsFilter?.attrs).toMatch(/android:autoVerify="true"/)
    // BROWSABLE is what lets a link tapped in another app target this filter;
    // DEFAULT is required for an implicit intent to match at all.
    expect(httpsFilter?.body).toMatch(/android\.intent\.category\.BROWSABLE/)
    expect(httpsFilter?.body).toMatch(/android\.intent\.category\.DEFAULT/)

    // One `<data>` tag carrying all three; its attributes are ANDed.
    const data = httpsFilter?.body.match(/<data[\s\S]*?\/>/)?.[0]
    expect(data?.match(/android:scheme="([^"]+)"/)?.[1]).toBe('https')
    expect(data?.match(/android:host="([^"]+)"/)?.[1]).toBe(APP_LINK_HOST)
    expect(data?.match(/android:pathPrefix="([^"]+)"/)?.[1]).toBe(APP_LINK_PATH_PREFIX)
  })

  it('still routes slice 2c\u2019s custom scheme, with no autoVerify and no host', () => {
    const appId = capacitorConfigSource.match(/appId:\s*'([^']+)'/)?.[1]
    const schemeFilter = viewFilters.find((filter) =>
      new RegExp(`android:scheme="${appId}"`).test(filter.body),
    )
    expect(schemeFilter, "slice 2c's scheme filter is gone from the manifest").toBeDefined()
    expect(schemeFilter?.body).toMatch(/android\.intent\.category\.BROWSABLE/)
    // The scheme tag stays a single-attribute tag: oauth.test.ts matches it with
    // /<data\s+android:scheme="([^"]+)"\s*\/>/, so an attribute added there
    // breaks that pin. (Filter ORDER does not: that scan only sees
    // attribute-less `<intent-filter>` tags — measured by reordering this file.)
    expect(schemeFilter?.body.match(/<data\s+android:scheme="([^"]+)"\s*\/>/)?.[1]).toBe(appId)
    expect(schemeFilter?.attrs).not.toMatch(/autoVerify/)
    expect(schemeFilter?.body).not.toMatch(/android:host=/)
  })
})

describe('subscribeAppLinks — what registers, and what a delivery opens', () => {
  beforeEach(() => {
    caps.launchUrl = ''
    caps.listeners = []
    caps.removed = 0
  })

  it('opens a cold start\u2019s launch URL, and listens for the next link', async () => {
    caps.launchUrl = appLink('/playdate/cold')
    const onPath = vi.fn()

    subscribeAppLinks(onPath)

    await vi.waitFor(() => expect(caps.listeners).toHaveLength(1))
    expect(caps.listeners[0].event).toBe('appUrlOpen')
    expect(onPath).toHaveBeenCalledWith('/playdate/cold')
  })

  it('turns a delivered link into a path, and ignores a URL that is not ours', async () => {
    const onPath = vi.fn()

    subscribeAppLinks(onPath)
    await vi.waitFor(() => expect(caps.listeners).toHaveLength(1))

    caps.listeners[0].callback({ url: appLink('/playdate/warm?ping=1') })
    expect(onPath).toHaveBeenCalledWith('/playdate/warm?ping=1')

    // The scheme filter's URL reaches this listener too — every app on the
    // device can send one — and it must never be turned into a route.
    caps.listeners[0].callback({ url: `${NATIVE_OAUTH_SCHEME}://#access_token=at&refresh_token=rt` })
    caps.listeners[0].callback({ url: 'https://evil.example/playdate/x' })
    expect(onPath).toHaveBeenCalledTimes(1)
  })

  it('delivers the retained launch echo once, not twice, but a LATER tap of the same link still opens', async () => {
    caps.launchUrl = appLink('/playdate/cold')
    const onPath = vi.fn()

    subscribeAppLinks(onPath)
    await vi.waitFor(() => expect(caps.listeners).toHaveLength(1))
    expect(onPath).toHaveBeenCalledTimes(1)

    // Capacitor retains the launch URL and replays it to the first listener
    // that registers (Plugin.addEventListener) — that replay is the SAME link.
    caps.listeners[0].callback({ url: caps.launchUrl })
    expect(onPath).toHaveBeenCalledTimes(1)

    // A parent who taps it again, later in the session, is taken there again.
    caps.listeners[0].callback({ url: caps.launchUrl })
    expect(onPath).toHaveBeenCalledTimes(2)
  })

  /**
   * ⚠️ THE LEG THE WHOLE DESIGN EXISTS FOR. Registering an `appUrlOpen` listener
   * is what makes Capacitor flush its RETAINED launch URL, and the flush removes
   * it from the retained list (`Plugin.sendRetainedArgumentsForEvent`) — one
   * delivery, to whoever asked first. When the app was cold-started by slice
   * 2c's `app.dropin.playdate://…`, that retained URL IS the sign-in /login is
   * waiting for, so this subscription must not register at all. The positive
   * control is the first leg above: the same code path DOES register for our own
   * launch URL, so a green `toHaveLength(0)` here is not an instrument that
   * measures nothing.
   */
  it('registers NOTHING when slice 2c\u2019s scheme launched the app', async () => {
    caps.launchUrl = `${NATIVE_OAUTH_SCHEME}://#access_token=at&refresh_token=rt`
    const onPath = vi.fn()

    subscribeAppLinks(onPath)
    // A macrotask, so the async subscription is past its `await import()` and
    // past `getLaunchUrl()` even on a slow run.
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(caps.listeners).toHaveLength(0)
    expect(onPath).not.toHaveBeenCalled()
  })

  it('detaches cleanly, so unmounting leaves no listener behind', async () => {
    const detach = subscribeAppLinks(vi.fn())
    await vi.waitFor(() => expect(caps.listeners).toHaveLength(1))

    detach()

    await vi.waitFor(() => expect(caps.removed).toBe(1))
  })
})

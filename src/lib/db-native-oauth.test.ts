/**
 * Slice 2c — the native OAuth return, at the two edges that touch the world:
 * the redirect target `signInWithOAuthProvider` asks Supabase for, and the
 * completion of the URL the OS hands back.
 *
 * WHY THESE PINS EXIST. The provider round trip cannot be driven on this box —
 * it needs a real device, a real Google account and a real browser — so what
 * CAN be pinned is pinned, and the rest is recorded as unproven rather than
 * faked:
 *
 *  - the WEB path stays byte-for-byte: the origin-based https redirect,
 *    `window.location.assign`, and NO external-browser call. This is the
 *    regression this slice is most likely to cause, so it is asserted first;
 *  - the SHELL path uses the custom scheme and opens the provider OUTSIDE the
 *    app, never by navigating the WebView;
 *  - a returned FRAGMENT becomes a session, a returned error becomes a
 *    sentence, and a URL with nothing in it is ignored rather than swallowed.
 *
 * The Capacitor plugins are mocked, so this file proves the wiring the device
 * will run — not that the device runs it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const caps = vi.hoisted(() => ({
  platform: 'web',
  opened: [] as string[],
  listeners: [] as { event: string; callback: (data: { url: string }) => void }[],
  removed: 0,
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => caps.platform },
}))

vi.mock('@capacitor/browser', () => ({
  Browser: {
    open: async (options: { url: string }) => {
      caps.opened.push(options.url)
    },
  },
}))

vi.mock('@capacitor/app', () => ({
  App: {
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

import {
  completeNativeOAuthReturn,
  signInWithOAuthProvider,
  subscribeNativeOAuthReturn,
  supabase,
} from './db'
import { NATIVE_OAUTH_SCHEME, nativeOAuthRedirectTo } from './oauth'

const PROVIDER_URL = 'https://project.supabase.co/auth/v1/authorize?provider=google'
const FRAGMENT = '#access_token=at-123&expires_in=3600&refresh_token=rt-456&token_type=bearer'

/**
 * A return URL on OUR scheme, built from the constant rather than re-typed.
 *
 * Fix round 2: this file used to hardcode `'app.dropin.playdate://'` — a FOURTH
 * statement of the scheme's value, which no leg of the drift test covered, so
 * drifting the call site at `db.ts`'s shell branch left every leg green. The
 * scheme is now written down once in `src/` (`NATIVE_OAUTH_SCHEME`) and every
 * other mention derives from it: the helper below for inputs, and
 * `nativeOAuthRedirectTo()` for the assertion that pins the call site.
 */
const returnUrl = (tail: string): string => `${NATIVE_OAUTH_SCHEME}://${tail}`

let assign: ReturnType<typeof vi.fn>

beforeEach(() => {
  caps.platform = 'web'
  caps.opened = []
  caps.listeners = []
  caps.removed = 0

  assign = vi.fn()
  vi.stubGlobal('window', { location: { origin: 'https://localhost', assign } })
  vi.stubEnv('VITE_PUBLIC_BASE_URL', 'https://dropin.example')
  // The probe must never be the reason a case here behaves differently: an
  // opaque redirect is its "the provider will answer" arm.
  vi.stubGlobal('fetch', async () => ({ type: 'opaqueredirect', ok: false, status: 0 }))
  vi.spyOn(supabase.auth, 'signInWithOAuth').mockResolvedValue({
    data: { url: PROVIDER_URL, provider: 'google' },
    error: null,
  } as never)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

/** The redirect the app asked Supabase for, from the recorded call. */
function askedRedirectTo(): string | undefined {
  return vi.mocked(supabase.auth.signInWithOAuth).mock.calls[0]?.[0].options?.redirectTo
}

describe('signInWithOAuthProvider — the WEB path (unchanged, byte-for-byte)', () => {
  it('redirects to the https origin and navigates the tab itself', async () => {
    await signInWithOAuthProvider('google')

    expect(askedRedirectTo()).toBe('https://dropin.example/')
    expect(assign).toHaveBeenCalledWith(PROVIDER_URL)
    // No external browser in a tab — opening one is the shell's job.
    expect(caps.opened).toEqual([])
  })
})

describe('signInWithOAuthProvider — the SHELL path (slice 2c)', () => {
  it('redirects to the custom scheme and opens the provider OUTSIDE the app', async () => {
    caps.platform = 'android'

    await signInWithOAuthProvider('google')

    expect(askedRedirectTo()).toBe(nativeOAuthRedirectTo())
    expect(caps.opened).toEqual([PROVIDER_URL])
    // NEVER window.location.assign here: that is the defect — it navigates the
    // WebView to Google and leaves the parent with no way back.
    expect(assign).not.toHaveBeenCalled()
  })

  it('still refuses a provider that is not enabled, before opening anything', async () => {
    caps.platform = 'android'
    vi.stubGlobal('fetch', async () => ({
      type: 'basic',
      ok: false,
      status: 400,
      json: async () => ({ msg: 'Unsupported provider: provider is not enabled' }),
    }))

    await expect(signInWithOAuthProvider('google')).rejects.toThrow('provider is not enabled')
    expect(caps.opened).toEqual([])
    expect(assign).not.toHaveBeenCalled()
  })
})

function fakeClient(result: { data?: unknown; error?: unknown } = { data: {}, error: null }): {
  client: SupabaseClient
  setSession: ReturnType<typeof vi.fn>
} {
  const setSession = vi.fn(async () => result)
  return { client: { auth: { setSession } } as unknown as SupabaseClient, setSession }
}

describe('completeNativeOAuthReturn (slice 2c)', () => {
  it('turns the fragment the OS handed back into a session', async () => {
    const { client, setSession } = fakeClient()

    const outcome = await completeNativeOAuthReturn(returnUrl(FRAGMENT), client)

    expect(outcome).toEqual({ status: 'signed-in' })
    expect(setSession).toHaveBeenCalledWith({ access_token: 'at-123', refresh_token: 'rt-456' })
  })

  it('says a cancellation as a sentence, and sets no session', async () => {
    const { client, setSession } = fakeClient()

    const outcome = await completeNativeOAuthReturn(
      returnUrl('?error=access_denied&error_description=User+denied+access'),
      client,
    )

    expect(outcome).toEqual({ status: 'failed', message: 'Sign-in was cancelled.' })
    expect(setSession).not.toHaveBeenCalled()
  })

  it('reports a rejected session as a sentence, never as a sign-in', async () => {
    const { client } = fakeClient({ data: {}, error: { message: 'invalid grant' } })

    const outcome = await completeNativeOAuthReturn(returnUrl(FRAGMENT), client)

    expect(outcome).toEqual({ status: 'failed', message: 'invalid grant' })
  })

  it('ignores a URL with nothing to complete', async () => {
    const { client, setSession } = fakeClient()

    expect(await completeNativeOAuthReturn(returnUrl(''), client)).toEqual({
      status: 'ignored',
    })
    expect(setSession).not.toHaveBeenCalled()
  })

  /**
   * Slice 2c fix round 1 — the user-facing half of the blank-screen fix.
   *
   * /login renders this outcome's message as `{error ? <p>…</p> : null}`, so an
   * EMPTY message is a failed sign-in the parent is never told about. The four
   * shapes below all produced exactly that before the `??`→`||` fix (and the
   * whitespace-only third one still lost the specific sentence until `?.trim() ||`); this
   * asserts on what the SCREEN would show, at the seam the screen reads.
   */
  it('never reports a failure the parent would not be told about', async () => {
    const emptyShapes = [
      returnUrl('?error=access_denied&error_description='),
      returnUrl('?error='),
      returnUrl('#error='),
      returnUrl('#error=&error_description='),
    ]

    for (const url of emptyShapes) {
      const outcome = await completeNativeOAuthReturn(url, fakeClient().client)
      expect(outcome.status, `${url} must fail`).toBe('failed')
      const message = outcome.status === 'failed' ? outcome.message : ''
      expect(message.trim(), `${url} must produce a sentence [LoginPage renders nothing on '' ]`).not.toBe('')
    }
  })

  it('turns a rejected session with an EMPTY provider message into a sentence too', async () => {
    const { client } = fakeClient({ data: {}, error: { message: '' } })

    const outcome = await completeNativeOAuthReturn(returnUrl(FRAGMENT), client)

    expect(outcome).toEqual({ status: 'failed', message: 'Could not finish sign-in. Try again.' })
  })
})

describe('subscribeNativeOAuthReturn (slice 2c)', () => {
  it('listens for the URL and finishes the round trip', async () => {
    caps.platform = 'android'
    const setSession = vi
      .spyOn(supabase.auth, 'setSession')
      .mockResolvedValue({ data: {}, error: null } as never)
    const onFailure = vi.fn()

    subscribeNativeOAuthReturn(onFailure)
    await vi.waitFor(() => expect(caps.listeners).toHaveLength(1))
    expect(caps.listeners[0].event).toBe('appUrlOpen')

    caps.listeners[0].callback({ url: returnUrl(FRAGMENT) })

    await vi.waitFor(() =>
      expect(setSession).toHaveBeenCalledWith({
        access_token: 'at-123',
        refresh_token: 'rt-456',
      }),
    )
    expect(onFailure).not.toHaveBeenCalled()
  })

  it('hands a failure to the screen as a sentence', async () => {
    caps.platform = 'android'
    const setSession = vi
      .spyOn(supabase.auth, 'setSession')
      .mockResolvedValue({ data: {}, error: null } as never)
    const onFailure = vi.fn()

    subscribeNativeOAuthReturn(onFailure)
    await vi.waitFor(() => expect(caps.listeners).toHaveLength(1))

    caps.listeners[0].callback({ url: returnUrl('?error=access_denied') })

    await vi.waitFor(() => expect(onFailure).toHaveBeenCalledWith('Sign-in was cancelled.'))
    expect(setSession).not.toHaveBeenCalled()
  })

  it('detaches cleanly, so /login unmounting leaves no listener behind', async () => {
    caps.platform = 'android'

    const detach = subscribeNativeOAuthReturn(vi.fn())
    await vi.waitFor(() => expect(caps.listeners).toHaveLength(1))

    detach()

    await vi.waitFor(() => expect(caps.removed).toBe(1))
  })

  /**
   * Slice 2c fix round 2 — A REJECTED RETURN MUST STILL BE A SENTENCE.
   *
   * `completeNativeOAuthReturn` can REJECT rather than resolve `failed`:
   * supabase-js's `setSession` throws a plain `Error` on some inputs instead of
   * returning one (the reviewer measured "Invalid UTF-8 sequence" for a
   * malformed access token), and the parse path can throw too. The chain in
   * `subscribeNativeOAuthReturn` had a single `.then` and no `.catch`, so the
   * rejection was unhandled and `onFailure` was never called — the parent read
   * NOTHING, the one outcome the handler exists to prevent.
   *
   * REACHABLE, NOT THEORETICAL: MainActivity is `android:exported="true"` with a
   * BROWSABLE VIEW filter, so any app on the device can deliver a crafted
   * `app.dropin.playdate://…` URL to this handler.
   *
   * WHAT THESE ASSERT: the exact string handed to `onFailure`, which is the
   * string /login puts in `setError` and renders — i.e. the sentence a parent
   * sees. The second case pins the never-empty guarantee on this path too: a
   * rejection that is not an `Error` must not surface as the string
   * "undefined".
   */
  it('says the sentence when completing the return REJECTS (not just when it fails)', async () => {
    caps.platform = 'android'
    vi.spyOn(supabase.auth, 'setSession').mockRejectedValue(
      new Error('Invalid UTF-8 sequence'),
    )
    const onFailure = vi.fn()

    subscribeNativeOAuthReturn(onFailure)
    await vi.waitFor(() => expect(caps.listeners).toHaveLength(1))

    caps.listeners[0].callback({ url: returnUrl(FRAGMENT) })

    await vi.waitFor(() => expect(onFailure).toHaveBeenCalledWith('Invalid UTF-8 sequence'))
  })

  it('says a sentence when the rejection is not an Error at all', async () => {
    caps.platform = 'android'
    vi.spyOn(supabase.auth, 'setSession').mockRejectedValue('boom')
    const onFailure = vi.fn()

    subscribeNativeOAuthReturn(onFailure)
    await vi.waitFor(() => expect(caps.listeners).toHaveLength(1))

    caps.listeners[0].callback({ url: returnUrl(FRAGMENT) })

    await vi.waitFor(() =>
      expect(onFailure).toHaveBeenCalledWith('Could not finish sign-in. Try again.'),
    )
  })
})

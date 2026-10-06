/**
 * The native registration seam, pinned with COUNTING FAKES — no Capacitor, no
 * device, no socket. This is the only lane that can execute
 * `registerNativePushToken`'s ordering rule, and the ordering rule is the whole
 * point of the file:
 *
 *   ⚠️ THE PERMISSION FLOW MUST COME BEFORE `register()`. On Android 13+ a
 *   `register()` that runs before the permission is granted returns a token
 *   that can never produce a visible alert — the send succeeds, the OS drops
 *   it, and the parent believes notifications are on. So the fake records the
 *   ORDER of every call, and the assertions compare indices rather than merely
 *   checking that `requestPermissions` happened at some point.
 *
 * The fake plugin also delivers its `registration` / `registrationError` events
 * ASYNCHRONOUSLY (a microtask, like the real plugin), which is what catches the
 * other half of the ordering trap: a listener attached AFTER `register()`
 * resolves misses a token that arrives immediately.
 */
import { describe, expect, it } from 'vitest'
import { rawErrorMessage, settingsErrorMessage } from './settingsError.ts'
import {
  DEVICE_TOKEN_CONFLICT_KEY,
  NATIVE_PUSH_DENIED_REASON,
  NATIVE_PUSH_EMPTY_TOKEN_REASON,
  NATIVE_PUSH_OPT_OUT_FAILED_REASON,
  NATIVE_PUSH_REGISTRATION_FAILED_REASON,
  NATIVE_PUSH_UNCONFIRMED_PERMISSION_REASON,
  NATIVE_PUSH_WEB_REASON,
  deviceTokenRow,
  disableNativePush,
  nativePlatformOf,
  planNativePushRegistration,
  registerNativePushToken,
  type DeviceTokenRow,
  type NativePushListener,
  type NativePushPlugin,
} from './nativePushToken.ts'

interface FakeOptions {
  /** What `checkPermissions` reports. Default 'granted'. */
  check?: string
  /** What `requestPermissions` reports. Default 'granted'. */
  afterRequest?: string
  /** `null` makes the plugin emit `registrationError` instead of a token. */
  token?: string | null
  /** The message the `registrationError` carries. */
  registrationError?: string
  checkThrows?: Error
  requestThrows?: Error
  registerThrows?: Error
  saveThrows?: Error
}

interface FakePlugin {
  plugin: NativePushPlugin
  /** Every call, in order — the ORDER is the assertion. */
  calls: string[]
  /** The events whose listener was removed. */
  removed: string[]
  /** Every row handed to the persistence seam. */
  saved: DeviceTokenRow[]
}

function fakePlugin(options: FakeOptions = {}): FakePlugin {
  const calls: string[] = []
  const removed: string[] = []
  const saved: DeviceTokenRow[] = []

  let onToken: ((token: { value: string }) => void) | undefined
  let onError: ((error: { error: string }) => void) | undefined

  const plugin = {
    async checkPermissions() {
      calls.push('checkPermissions')
      if (options.checkThrows) throw options.checkThrows
      return { receive: options.check ?? 'granted' }
    },
    async requestPermissions() {
      calls.push('requestPermissions')
      if (options.requestThrows) throw options.requestThrows
      return { receive: options.afterRequest ?? 'granted' }
    },
    async register() {
      calls.push('register')
      if (options.registerThrows) throw options.registerThrows
      // The real plugin resolves `register()` and THEN fires the event, so the
      // listener must already be attached when this runs.
      queueMicrotask(() => {
        if (options.token === null) {
          onError?.({ error: options.registrationError ?? 'registration failed' })
          return
        }
        onToken?.({ value: options.token ?? 'fcm-token-1' })
      })
    },
    async addListener(event: 'registration' | 'registrationError', handler: unknown) {
      calls.push(`addListener:${event}`)
      if (event === 'registration') onToken = handler as (token: { value: string }) => void
      else onError = handler as (error: { error: string }) => void
      const listener: NativePushListener = {
        remove() {
          removed.push(event)
        },
      }
      return listener
    },
  } as unknown as NativePushPlugin

  return { plugin, calls, removed, saved }
}

const NOW = new Date('2026-10-06T12:00:00.000Z')

async function run(options: FakeOptions = {}, overrides: Record<string, unknown> = {}) {
  const fake = fakePlugin(options)
  const deps = {
    plugin: fake.plugin,
    platform: 'android' as const,
    profileId: 'prof-1',
    appVersion: '1.2.3',
    now: () => NOW,
    saveToken: async (row: DeviceTokenRow) => {
      if (options.saveThrows) throw options.saveThrows
      fake.saved.push(row)
    },
    ...overrides,
  }
  const outcome = await registerNativePushToken(deps as Parameters<typeof registerNativePushToken>[0])
  return { ...fake, outcome }
}

describe('planNativePushRegistration — the pure decision', () => {
  it('registers only on a granted permission', () => {
    expect(planNativePushRegistration('granted')).toEqual({ action: 'register' })
  })

  it('blocks a denied permission with the sentence that names the way back', () => {
    expect(planNativePushRegistration('denied')).toEqual({
      action: 'blocked',
      reason: NATIVE_PUSH_DENIED_REASON,
    })
  })

  it('asks first for both prompt states (the Android 13+ path)', () => {
    expect(planNativePushRegistration('prompt')).toEqual({ action: 'request' })
    expect(planNativePushRegistration('prompt-with-rationale')).toEqual({ action: 'request' })
  })

  it('asks — never registers — on a state it cannot read', () => {
    for (const state of ['', 'unknown', 'PROMPT', 'maybe']) {
      expect(planNativePushRegistration(state)).toEqual({ action: 'request' })
    }
  })
})

describe('registerNativePushToken — the order is the rule', () => {
  it('registers when the permission is already granted, and saves the row', async () => {
    const { calls, removed, saved, outcome } = await run({})

    expect(outcome).toEqual({ status: 'registered', token: 'fcm-token-1' })
    expect(calls).toEqual([
      'checkPermissions',
      'addListener:registration',
      'addListener:registrationError',
      'register',
    ])
    expect(saved).toEqual([
      {
        profile_id: 'prof-1',
        platform: 'android',
        token: 'fcm-token-1',
        app_version: '1.2.3',
        last_seen_at: NOW.toISOString(),
      },
    ])
    // Both listeners are removed on the way out.
    expect(removed.sort()).toEqual(['registration', 'registrationError'])
  })

  it('asks BEFORE registering when the permission is prompt (trap #1)', async () => {
    const { calls, outcome } = await run({ check: 'prompt', afterRequest: 'granted' })

    expect(outcome).toEqual({ status: 'registered', token: 'fcm-token-1' })
    // The assertion is on ORDER, not membership: register() before the grant is
    // exactly the bug that produces a token no alert can ever use.
    expect(calls.indexOf('requestPermissions')).toBeGreaterThan(-1)
    expect(calls.indexOf('requestPermissions')).toBeLessThan(calls.indexOf('register'))
    expect(calls.indexOf('addListener:registration')).toBeLessThan(calls.indexOf('register'))
    expect(calls.filter((call) => call === 'register')).toHaveLength(1)
  })

  it('asks for `prompt-with-rationale` too', async () => {
    const { calls } = await run({ check: 'prompt-with-rationale', afterRequest: 'granted' })
    expect(calls.indexOf('requestPermissions')).toBeLessThan(calls.indexOf('register'))
  })

  it('never registers when the parent denied the OS permission', async () => {
    const { calls, saved, outcome } = await run({ check: 'denied' })

    expect(outcome).toEqual({ status: 'blocked', reason: NATIVE_PUSH_DENIED_REASON })
    expect(calls).toEqual(['checkPermissions'])
    expect(saved).toEqual([])
  })

  it('never registers when the ASK was denied', async () => {
    const { calls, saved, outcome } = await run({ check: 'prompt', afterRequest: 'denied' })

    expect(outcome.status).toBe('blocked')
    expect(calls).toContain('requestPermissions')
    expect(calls).not.toContain('register')
    expect(saved).toEqual([])
  })

  it('asks when the permission state cannot be read, never registering unasked', async () => {
    const { calls } = await run({ check: '', afterRequest: 'granted' })
    expect(calls[0]).toBe('checkPermissions')
    expect(calls[1]).toBe('requestPermissions')
    expect(calls).toContain('register')
  })

  // FIX ROUND 1, finding 3 — THE SECOND READING IS THE ONE THAT DECIDES. The
  // first reading may legitimately be `prompt`; if it is STILL `prompt` after
  // the ask (a dismissed dialog), or the state is unreadable, registering would
  // store a token that can never show an alert. These pin the guard.
  for (const state of ['prompt', 'prompt-with-rationale', '']) {
    it(`never registers when the permission is still "${state}" AFTER the ask`, async () => {
      const { calls, saved, outcome } = await run({ check: 'prompt', afterRequest: state })

      expect(outcome).toEqual({ status: 'blocked', reason: NATIVE_PUSH_UNCONFIRMED_PERMISSION_REASON })
      expect(calls).toContain('requestPermissions')
      expect(calls).not.toContain('register')
      expect(saved).toEqual([])
    })
  }

  it('never registers when the FIRST reading is already unreadable and the ask changes nothing', async () => {
    const { calls, saved, outcome } = await run({ check: 'unknown', afterRequest: 'unknown' })

    expect(outcome.status).toBe('blocked')
    expect(calls).not.toContain('register')
    expect(saved).toEqual([])
  })
})

describe('registerNativePushToken — every failure is an outcome, never a throw', () => {
  it('reports a plugin registration error and saves nothing', async () => {
    const { saved, removed, outcome } = await run({ token: null, registrationError: 'no google-services.json' })

    // The raw detail rides in `cause` (see the outcome type): it is a
    // developer string, so the CALLER classifies it before a parent sees it.
    expect(outcome.status).toBe('error')
    if (outcome.status !== 'error') throw new Error('unreachable')
    expect(rawErrorMessage(outcome.cause)).toBe('no google-services.json')
    expect(saved).toEqual([])
    expect(removed.sort()).toEqual(['registration', 'registrationError'])
  })

  it('refuses an empty token rather than storing an undeliverable row', async () => {
    const { saved, outcome } = await run({ token: '' })
    expect(outcome.status).toBe('error')
    if (outcome.status !== 'error') throw new Error('unreachable')
    expect(rawErrorMessage(outcome.cause)).toBe(NATIVE_PUSH_EMPTY_TOKEN_REASON)
    expect(saved).toEqual([])
  })

  it('reports a failed save (the row never landed) without throwing', async () => {
    const { outcome, removed } = await run({ saveThrows: new Error('permission denied for table device_tokens') })

    expect(outcome.status).toBe('error')
    if (outcome.status !== 'error') throw new Error('unreachable')
    expect(rawErrorMessage(outcome.cause)).toContain('permission denied')
    expect(removed.sort()).toEqual(['registration', 'registrationError'])
  })

  it('reports a register() rejection', async () => {
    const { outcome } = await run({ registerThrows: new Error('plugin not implemented') })
    expect(outcome.status).toBe('error')
    if (outcome.status !== 'error') throw new Error('unreachable')
    expect(rawErrorMessage(outcome.cause)).toContain('plugin not implemented')
  })

  it('reports a checkPermissions rejection', async () => {
    const { outcome, saved } = await run({ checkThrows: new Error('bridge unavailable') })
    expect(outcome.status).toBe('error')
    expect(saved).toEqual([])
  })

  it('reports a requestPermissions rejection', async () => {
    const { outcome, saved } = await run({ check: 'prompt', requestThrows: new Error('no activity') })
    expect(outcome.status).toBe('error')
    expect(saved).toEqual([])
  })
})

describe('registerNativePushToken — the platform rides along for the deferred iOS branch', () => {
  it('records the platform it was given', async () => {
    const { saved } = await run({}, { platform: 'ios' })
    expect(saved[0]?.platform).toBe('ios')
  })
})

describe('deviceTokenRow — the upsert payload', () => {
  it('is the row an `on conflict (token)` upsert writes', () => {
    expect(DEVICE_TOKEN_CONFLICT_KEY).toBe('token')
    expect(
      deviceTokenRow({ profileId: 'p', token: 'abc', platform: 'android', appVersion: '2.0.0', now: NOW }),
    ).toEqual({
      profile_id: 'p',
      platform: 'android',
      token: 'abc',
      app_version: '2.0.0',
      last_seen_at: NOW.toISOString(),
    })
  })

  it('refreshes last_seen_at on a re-registration (same token, later clock)', () => {
    const first = deviceTokenRow({ profileId: 'p', token: 'abc', platform: 'android', now: NOW })
    const later = new Date('2026-11-01T00:00:00.000Z')
    const again = deviceTokenRow({ profileId: 'p', token: 'abc', platform: 'android', now: later })
    expect(first?.token).toBe(again?.token)
    expect(again?.last_seen_at).not.toBe(first?.last_seen_at)
  })

  it('trims a padded token', () => {
    expect(deviceTokenRow({ profileId: 'p', token: '  abc\n', platform: 'android', now: NOW })?.token).toBe('abc')
  })

  it('returns null — not a row — for a blank token', () => {
    for (const token of ['', '   ', '\n\t']) {
      expect(deviceTokenRow({ profileId: 'p', token, platform: 'android', now: NOW })).toBeNull()
    }
  })

  it('stores a blank app_version as null rather than an empty string', () => {
    expect(
      deviceTokenRow({ profileId: 'p', token: 'abc', platform: 'android', appVersion: '  ', now: NOW })
        ?.app_version,
    ).toBeNull()
  })
})

describe('nativePlatformOf — the one platform mapping', () => {
  it('names the two shells the sender can address', () => {
    expect(nativePlatformOf('android')).toBe('android')
    expect(nativePlatformOf('ios')).toBe('ios')
  })

  it('treats a browser — and anything unreadable — as NOT native', () => {
    // '' is the shape a shell that never initialised reports. A platform we
    // cannot read must never be assumed native: the native path stores a token
    // the web sender cannot address.
    for (const platform of ['web', '', 'electron', 'ANDROID', 'unknown']) {
      expect(nativePlatformOf(platform)).toBeNull()
    }
  })
})

describe('disableNativePush — the opt-out deletes the row, or says why not', () => {
  function counter(options: { throws?: Error } = {}) {
    const calls: string[] = []
    return {
      calls,
      deleteTokens: async () => {
        calls.push('deleteTokens')
        if (options.throws) throw options.throws
      },
    }
  }

  it('deletes this install’s device row and reports it removed', async () => {
    const fake = counter()
    const outcome = await disableNativePush({ platform: 'android', deleteTokens: fake.deleteTokens })
    expect(outcome).toEqual({ status: 'removed' })
    expect(fake.calls).toEqual(['deleteTokens'])
  })

  it('does NOT delete anything in a browser — the web path owns that one', async () => {
    const fake = counter()
    const outcome = await disableNativePush({ platform: null, deleteTokens: fake.deleteTokens })
    expect(outcome).toEqual({ status: 'unsupported', reason: NATIVE_PUSH_WEB_REASON })
    expect(fake.calls).toEqual([])
  })

  it('reports a failed delete as an error instead of claiming “off”', async () => {
    const fake = counter({ throws: new Error('permission denied for table device_tokens') })
    const outcome = await disableNativePush({ platform: 'ios', deleteTokens: fake.deleteTokens })
    expect(outcome.status).toBe('error')
    if (outcome.status !== 'error') throw new Error('unreachable')
    // The parent must be told the row is still there, so the raw cause is kept.
    expect(outcome.cause).toBeInstanceOf(Error)
    expect((outcome.cause as Error).message).toContain('permission denied')
    expect(fake.calls).toEqual(['deleteTokens'])
  })

  it('names the failure itself when the thrown value has no message at all', async () => {
    const calls: string[] = []
    const outcome = await disableNativePush({
      platform: 'android',
      deleteTokens: async () => {
        calls.push('deleteTokens')
        throw {}
      },
    })
    expect(calls).toEqual(['deleteTokens'])
    expect(outcome.status).toBe('error')
    if (outcome.status !== 'error') throw new Error('unreachable')
    // The caller's fallback is the seam's own sentence, so the notice still says
    // what failed. (The `[object Object]` that `String({})` produces IS carried
    // through and classified as human — `rawErrorMessage` reads `error.message`,
    // and this records that shape rather than pretending it cannot happen. It is
    // unreachable through the app: the only `deleteTokens` is db.ts's, which
    // throws a real Error.)
    expect((outcome.cause as Error).message).toBe('[object Object]')
    expect(settingsErrorMessage(outcome.cause, NATIVE_PUSH_OPT_OUT_FAILED_REASON)).toBe(
      '[object Object]',
    )
  })
})

/**
 * ⚠️ FIX ROUND 1, THE DEFECT: A RAW DATABASE MESSAGE IN A PARENT-FACING NOTICE.
 *
 * The component used to interpolate the seam's raw failure text, so an RLS
 * refusal rendered `Couldn't turn on notifications (permission denied for table
 * device_tokens).`, and a constraint violation rendered `23505 … duplicate key
 * value violates unique constraint`. `src/lib/settingsError.ts` exists to
 * prevent exactly that, and this block pins the CONTRACT the fix depends on: an
 * `error` outcome carries a wrapped cause, and the caller's classifier turns a
 * developer string into plain copy while a genuine human sentence survives. The
 * component calls the same function with the same fallbacks.
 */
describe('a failure cause is classified before a parent ever sees it', () => {
  it('rewrites an RLS refusal into plain copy — no “permission denied”, no schema name', async () => {
    const { outcome } = await run({ saveThrows: new Error('permission denied for table device_tokens') })
    if (outcome.status !== 'error') throw new Error('unreachable')

    const notice = settingsErrorMessage(outcome.cause, NATIVE_PUSH_REGISTRATION_FAILED_REASON)
    expect(notice).toBe(NATIVE_PUSH_REGISTRATION_FAILED_REASON)
    expect(notice).not.toContain('permission denied')
    expect(notice).not.toContain('device_tokens')
  })

  it('rewrites the unique-violation the token upsert can raise', async () => {
    const { outcome } = await run({
      saveThrows: new Error(
        '23505 duplicate key value violates unique constraint "device_tokens_token_key"',
      ),
    })
    if (outcome.status !== 'error') throw new Error('unreachable')

    const notice = settingsErrorMessage(outcome.cause, NATIVE_PUSH_REGISTRATION_FAILED_REASON)
    expect(notice).toBe(NATIVE_PUSH_REGISTRATION_FAILED_REASON)
    expect(notice).not.toContain('23505')
    expect(notice).not.toContain('violates')
  })

  it('rewrites a PostgREST code too', async () => {
    const { outcome } = await run({ saveThrows: new Error('PGRST205') })
    if (outcome.status !== 'error') throw new Error('unreachable')
    expect(settingsErrorMessage(outcome.cause, NATIVE_PUSH_REGISTRATION_FAILED_REASON)).toBe(
      NATIVE_PUSH_REGISTRATION_FAILED_REASON,
    )
  })

  it('rewrites a JSON error BODY — the shape a transport failure actually throws', async () => {
    // PostgREST answers with a body, and a client that surfaces it as text hands
    // back `{"code":"42501","message":"permission denied…"}`. The classifier's
    // `permission denied` pattern catches it, so the parent sees the plain
    // sentence rather than a paste of the response.
    const { outcome } = await run({
      saveThrows: new Error('{"code":"42501","message":"permission denied for table device_tokens"}'),
    })
    if (outcome.status !== 'error') throw new Error('unreachable')
    expect(settingsErrorMessage(outcome.cause, NATIVE_PUSH_REGISTRATION_FAILED_REASON)).toBe(
      NATIVE_PUSH_REGISTRATION_FAILED_REASON,
    )
  })

  it('quotes the PLUGIN’s own fault sentence — it is human text, and it is the cause', async () => {
    // Contrast with the credential path above: a plugin that says WHY in words
    // is the one useful detail, so it is passed through rather than flattened.
    const { outcome } = await run({ token: null, registrationError: 'a notification channel failed' })
    if (outcome.status !== 'error') throw new Error('unreachable')
    expect(settingsErrorMessage(outcome.cause, NATIVE_PUSH_REGISTRATION_FAILED_REASON)).toBe(
      'a notification channel failed',
    )
  })

  it('PASSES THROUGH a genuine human sentence — the classifier is conservative', () => {
    // A plugin that answers with a real, readable reason must still be quoted:
    // dropping it would hide the one useful detail the parent could act on.
    expect(
      settingsErrorMessage(
        new Error('Notifications are not allowed for Drop In on this phone'),
        NATIVE_PUSH_REGISTRATION_FAILED_REASON,
      ),
    ).toBe('Notifications are not allowed for Drop In on this phone')
  })

  it('leaves every blocked/unsupported REASON unclassified — those are written copy', async () => {
    // The other half of the rule: `blocked`/`unsupported` carry sentences the
    // seam wrote on purpose, INCLUDING the one that names the way back to the
    // phone's settings. The component must not run them through a fallback.
    const denied = await run({ check: 'denied' })
    expect(denied.outcome).toEqual({ status: 'blocked', reason: NATIVE_PUSH_DENIED_REASON })
    if (denied.outcome.status !== 'blocked') throw new Error('unreachable')
    expect(denied.outcome.reason).toContain('phone’s settings')

    const unconfirmed = await run({ check: 'prompt', afterRequest: 'prompt' })
    expect(unconfirmed.outcome).toEqual({
      status: 'blocked',
      reason: NATIVE_PUSH_UNCONFIRMED_PERMISSION_REASON,
    })
  })
})

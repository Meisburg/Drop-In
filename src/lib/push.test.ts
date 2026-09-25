/**
 * V8 ticket 08 — the pure seams for web push (src/lib/push.ts).
 *
 * Three of these are pinned by the ticket and are the reason this file is not
 * a formality:
 *
 *  1. the PAYLOAD BUILDER — the wording of all five kinds, including the
 *     singular "1 family is going" (the plural template would say
 *     "1 families", the same broken English the while-away inbox already
 *     fixed). These literals are the spec the SQL twin
 *     (`public.notification_payload`, migration 0032) and the `send-push`
 *     function must match, so they are asserted as literal strings rather
 *     than recomputed.
 *  2. the DEDUPE KEY — the app-side derivation of 0032's
 *     `unique (profile_id, kind, playdate_id)`.
 *  3. the iOS DETECTION SEAM — including the iPadOS 13+ case, which reports a
 *     DESKTOP Mac user-agent and is only distinguishable by its touch points.
 *
 * The permission-decision memory is tested through an injected fake storage,
 * and the cold-load pin ("never ask on a cold load") is asserted directly: it
 * is the requirement most likely to be broken by a well-meaning refactor.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PUSH_PREFS,
  DENIED_POINTER,
  DISMISSED_POINTER,
  IOS_INSTALL_REASON,
  IOS_SAFARI_ONLY_REASON,
  IOS_WEBVIEW_REASON,
  PUSH_DECISION_KEY,
  PUSH_PROMPT_REASON,
  PUSH_TRIGGER_KEY,
  PUSH_TRIGGER_ORIGIN_KEY,
  UNSUPPORTED_POINTER,
  WHILE_AWAY_POINTER,
  armPushPrompt,
  armPushPromptOrigin,
  browserPermissionOf,
  buildNotificationPayload,
  clearArmedTrigger,
  decideOptInControl,
  decidePermissionPrompt,
  dedupeNotifications,
  familiesGoingLabel,
  installSurface,
  isIosDevice,
  isIosSafari,
  isIosWebview,
  isKindMuted,
  isNotificationKind,
  isPlaydateDetailPath,
  isStandalone,
  notificationDedupeKey,
  notificationUrl,
  parsePermissionDecision,
  parsePushPrefs,
  pushOptInGate,
  readArmedOrigin,
  readArmedTrigger,
  readPermissionDecision,
  rememberPermissionDecision,
  serializePushPrefs,
  setKindMuted,
  type StorageLike,
} from './push'

/** A minimal in-memory Storage, plus one that throws on every access. */
function fakeStorage(seed: Record<string, string> = {}): StorageLike & { dump: () => Record<string, string> } {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    dump: () => Object.fromEntries(map),
  }
}

const throwingStorage: StorageLike = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('SecurityError')
  },
  removeItem: () => {
    throw new Error('SecurityError')
  },
}

// ---------------------------------------------------------------------------
// The payload builder
// ---------------------------------------------------------------------------

const POST_ID = '11111111-2222-3333-4444-555555555555'

describe('buildNotificationPayload', () => {
  it('builds the ping kind: who, and what they are going to', () => {
    expect(
      buildNotificationPayload({
        kind: 'ping_received',
        playdateId: POST_ID,
        postTitle: 'Green Lake playground',
        actorName: 'Sarah',
      }),
    ).toEqual({
      title: 'Sarah is going',
      body: 'to "Green Lake playground"',
      url: `/playdate/${POST_ID}`,
    })
  })

  it('builds the comment kind on the same post', () => {
    expect(
      buildNotificationPayload({
        kind: 'new_comment',
        playdateId: POST_ID,
        postTitle: 'Green Lake playground',
        actorName: 'Mia',
      }),
    ).toEqual({
      title: 'Mia commented',
      body: 'on "Green Lake playground"',
      url: `/playdate/${POST_ID}`,
    })
  })

  it('builds the cancellation kind as the don\'t-drive-out message', () => {
    expect(
      buildNotificationPayload({
        kind: 'cancelled',
        playdateId: POST_ID,
        postTitle: 'Green Lake playground',
      }),
    ).toEqual({
      title: 'Cancelled: "Green Lake playground"',
      body: "The host called it off — don't head out.",
      url: `/playdate/${POST_ID}`,
    })
  })

  it('builds the ended kind as the host-ended-early message (V12 t03, 0041 pin d)', () => {
    // The literal strings the SQL twin (public.notification_payload, the
    // 0041-rewritten branch) must match char-for-char.
    expect(
      buildNotificationPayload({
        kind: 'ended',
        playdateId: POST_ID,
        postTitle: 'Green Lake playground',
      }),
    ).toEqual({
      title: 'Ended: "Green Lake playground"',
      body: "The host ended it — don't head out.",
      url: `/playdate/${POST_ID}`,
    })
  })

  it('builds starting_soon with the SINGULAR at exactly one family going', () => {
    expect(
      buildNotificationPayload({
        kind: 'starting_soon',
        playdateId: POST_ID,
        postTitle: 'Green Lake playground',
        goingCount: 1,
      }),
    ).toEqual({
      title: 'Starting soon: "Green Lake playground"',
      body: 'Starts within the hour · 1 family is going',
      url: `/playdate/${POST_ID}`,
    })
  })

  it('uses the plural above one', () => {
    const payload = buildNotificationPayload({
      kind: 'starting_soon',
      playdateId: POST_ID,
      postTitle: 'Green Lake playground',
      goingCount: 3,
    })
    expect(payload.body).toBe('Starts within the hour · 3 families are going')
  })

  it('falls back to "your drop-in" rather than rendering an empty title', () => {
    const payload = buildNotificationPayload({
      kind: 'cancelled',
      playdateId: POST_ID,
      postTitle: null,
    })
    expect(payload.title).toBe('Cancelled: "your drop-in"')
    expect(payload.title).not.toContain('null')
  })

  it('treats a whitespace title as missing too', () => {
    const payload = buildNotificationPayload({
      kind: 'new_comment',
      playdateId: POST_ID,
      postTitle: '   ',
      actorName: 'Sarah',
    })
    expect(payload.body).toBe('on "your drop-in"')
  })

  it('falls back to "A parent" when the actor name is unknown', () => {
    expect(
      buildNotificationPayload({ kind: 'ping_received', playdateId: POST_ID, postTitle: 'Park' })
        .title,
    ).toBe('A parent is going')
    expect(
      buildNotificationPayload({
        kind: 'new_comment',
        playdateId: POST_ID,
        postTitle: 'Park',
        actorName: '  ',
      }).title,
    ).toBe('A parent commented')
  })

  it('never renders NaN families', () => {
    expect(
      buildNotificationPayload({
        kind: 'starting_soon',
        playdateId: POST_ID,
        postTitle: 'Park',
        goingCount: Number.NaN,
      }).body,
    ).toBe('Starts within the hour · you\'re the only one going so far')
  })

  it('says something TRUE at a zero/NULL count instead of "0 families are going"', () => {
    // The zero branch (fix round, finding G): a `starting_soon` notice only ever
    // goes to a parent who IS going, so the plural template read as "nobody is
    // coming". The sender passes 0 when its count query returns no rows, and a
    // direct probe passes NULL.
    for (const goingCount of [0, null, undefined, -2]) {
      const payload = buildNotificationPayload({
        kind: 'starting_soon',
        playdateId: POST_ID,
        postTitle: 'Green Lake playground',
        goingCount,
      })
      expect(payload.body).toBe('Starts within the hour · you\'re the only one going so far')
      expect(payload.body).not.toContain('0 families')
    }
  })
})

describe('familiesGoingLabel', () => {
  it('is singular at one, plural above one', () => {
    expect(familiesGoingLabel(1)).toBe('1 family is going')
    expect(familiesGoingLabel(2)).toBe('2 families are going')
    expect(familiesGoingLabel(3)).toBe('3 families are going')
  })

  it('names the honest zero rather than "0 families are going"', () => {
    expect(familiesGoingLabel(0)).toBe("you're the only one going so far")
  })

  it('clamps negatives and missing counts to the zero sentence', () => {
    expect(familiesGoingLabel(-4)).toBe("you're the only one going so far")
    expect(familiesGoingLabel(null)).toBe("you're the only one going so far")
    expect(familiesGoingLabel(undefined)).toBe("you're the only one going so far")
  })
})

describe('notificationUrl', () => {
  it('points at the app route the detail page actually serves', () => {
    expect(notificationUrl(POST_ID)).toBe(`/playdate/${POST_ID}`)
  })
})

describe('isNotificationKind', () => {
  it('accepts the five kinds and rejects anything else', () => {
    expect(isNotificationKind('ping_received')).toBe(true)
    expect(isNotificationKind('cancelled')).toBe(true)
    expect(isNotificationKind('ended')).toBe(true)
    expect(isNotificationKind('reminder')).toBe(false)
    expect(isNotificationKind(null)).toBe(false)
    expect(isNotificationKind(7)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// The dedupe key (0032's unique constraint, client side)
// ---------------------------------------------------------------------------

describe('notificationDedupeKey', () => {
  it('is the (profile, kind, post) triple', () => {
    expect(notificationDedupeKey({ profileId: 'p1', kind: 'cancelled', playdateId: 'd1' })).toBe(
      'p1:cancelled:d1',
    )
  })

  it('marks a null post explicitly so concatenation cannot collide', () => {
    expect(notificationDedupeKey({ profileId: 'p1', kind: 'cancelled', playdateId: null })).toBe(
      'p1:cancelled:none',
    )
  })

  it('separates the kinds for one post', () => {
    const a = notificationDedupeKey({ profileId: 'p1', kind: 'ping_received', playdateId: 'd1' })
    const b = notificationDedupeKey({ profileId: 'p1', kind: 'new_comment', playdateId: 'd1' })
    expect(a).not.toBe(b)
  })
})

describe('dedupeNotifications', () => {
  it('keeps the first row per key — the in-memory "on conflict do nothing"', () => {
    const rows = [
      { profileId: 'p1', kind: 'cancelled' as const, playdateId: 'd1', title: 'first' },
      { profileId: 'p1', kind: 'cancelled' as const, playdateId: 'd1', title: 'second' },
      { profileId: 'p1', kind: 'starting_soon' as const, playdateId: 'd1', title: 'other kind' },
    ]
    expect(dedupeNotifications(rows).map((row) => row.title)).toEqual(['first', 'other kind'])
  })
})

// ---------------------------------------------------------------------------
// The iOS detection seam
// ---------------------------------------------------------------------------

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1'
const IPADOS_AS_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
const REAL_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
/**
 * In-app browsers on iOS (fix round, finding E). None of them carries a
 * `Safari/<version>` token — that absence IS the seam — and none of them can
 * add a PWA to the Home Screen or receive a push. Copied from real UAs.
 */
const IOS_WEBVIEWS: Array<[string, string]> = [
  [
    'Instagram',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0.0.36.98 (iPhone14,3; iOS 17_5; en_US; en-US; scale=3.00; 1170x2532; 577471449)',
  ],
  [
    'Facebook',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/440.0.0.33.109;FBBV/539222285;FBDV/iPhone14,3;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5]',
  ],
  [
    'Slack',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Slack/24.04.20',
  ],
  [
    'a bare WKWebView',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  ],
]

describe('isIosDevice', () => {
  it('spots iPhone and iPad user agents', () => {
    expect(isIosDevice({ userAgent: IPHONE_SAFARI })).toBe(true)
    expect(isIosDevice({ userAgent: IPHONE_CHROME })).toBe(true)
  })

  it('spots iPadOS 13+ by its touch points, not its (desktop Mac) user agent', () => {
    expect(isIosDevice({ userAgent: IPADOS_AS_MAC, platform: 'MacIntel', maxTouchPoints: 5 })).toBe(
      true,
    )
  })

  it('does not mistake a real Mac for an iPad', () => {
    expect(isIosDevice({ userAgent: REAL_MAC, platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false)
  })

  it('leaves Android alone', () => {
    expect(isIosDevice({ userAgent: ANDROID_CHROME })).toBe(false)
  })
})

describe('isIosSafari', () => {
  it('is true for iOS Safari', () => {
    expect(isIosSafari({ userAgent: IPHONE_SAFARI })).toBe(true)
  })

  it('is false for another iOS browser — none of them can install a PWA', () => {
    expect(isIosSafari({ userAgent: IPHONE_CHROME })).toBe(false)
    expect(isIosSafari({ userAgent: `${IPHONE_SAFARI} FxiOS/126.0` })).toBe(false)
  })

  it('is false off iOS entirely', () => {
    expect(isIosSafari({ userAgent: ANDROID_CHROME })).toBe(false)
  })

  it('is false inside an app (a webview is not Safari, however much it looks like it)', () => {
    for (const [name, userAgent] of IOS_WEBVIEWS) {
      expect(isIosDevice({ userAgent }), name).toBe(true)
      expect(isIosSafari({ userAgent }), name).toBe(false)
      expect(isIosWebview({ userAgent }), name).toBe(true)
    }
  })

  it('does not call Safari (or the other named shells) a webview', () => {
    expect(isIosWebview({ userAgent: IPHONE_SAFARI })).toBe(false)
    expect(isIosWebview({ userAgent: IPHONE_CHROME })).toBe(false)
    expect(isIosWebview({ userAgent: IPADOS_AS_MAC, platform: 'MacIntel', maxTouchPoints: 5 })).toBe(
      false,
    )
    expect(isIosWebview({ userAgent: REAL_MAC, platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false)
  })
})

describe('isStandalone', () => {
  it('accepts either signal', () => {
    expect(isStandalone(true, false)).toBe(true)
    expect(isStandalone(false, true)).toBe(true)
    expect(isStandalone(false, false)).toBe(false)
  })
})

describe('installSurface', () => {
  const base = { userAgent: ANDROID_CHROME, standalone: false, hasInstallPrompt: false }

  it('offers nothing once installed', () => {
    expect(installSurface({ ...base, standalone: true, hasInstallPrompt: true })).toBe('none')
  })

  it('offers the iOS card on iOS Safari — there is no beforeinstallprompt there', () => {
    expect(
      installSurface({ ...base, userAgent: IPHONE_SAFARI, hasInstallPrompt: false }),
    ).toBe('ios-install-card')
  })

  it('prefers the iOS card over a (never-firing) install prompt', () => {
    expect(installSurface({ ...base, userAgent: IPHONE_SAFARI, hasInstallPrompt: true })).toBe(
      'ios-install-card',
    )
  })

  it('offers the real button on Android once the browser has deferred a prompt', () => {
    expect(installSurface({ ...base, hasInstallPrompt: true })).toBe('android-install-button')
  })

  it('offers nothing when the browser has no prompt to defer', () => {
    expect(installSurface(base)).toBe('none')
    expect(installSurface({ ...base, userAgent: REAL_MAC, platform: 'MacIntel' })).toBe('none')
  })

  it('offers nothing inside an app — there is no Share menu to point at', () => {
    for (const [name, userAgent] of IOS_WEBVIEWS) {
      expect(
        installSurface({ ...base, userAgent, hasInstallPrompt: true }),
        `${name} must not be shown a Share -> Add to Home Screen card`,
      ).toBe('none')
    }
  })
})

describe('pushOptInGate', () => {
  it('allows the opt-in off iOS', () => {
    expect(pushOptInGate({ userAgent: ANDROID_CHROME, standalone: false })).toEqual({
      allowed: true,
      reason: null,
    })
  })

  it('refuses on iOS Safari until the app is installed, with the honest reason', () => {
    const gate = pushOptInGate({ userAgent: IPHONE_SAFARI, standalone: false })
    expect(gate.allowed).toBe(false)
    expect(gate.reason).toBe(IOS_INSTALL_REASON)
  })

  it('allows it once installed on iOS', () => {
    expect(pushOptInGate({ userAgent: IPHONE_SAFARI, standalone: true })).toEqual({
      allowed: true,
      reason: null,
    })
  })

  it('points a non-Safari iOS browser at Safari rather than at an impossible install', () => {
    const gate = pushOptInGate({ userAgent: IPHONE_CHROME, standalone: false })
    expect(gate.allowed).toBe(false)
    expect(gate.reason).toBe(IOS_SAFARI_ONLY_REASON)
  })

  it('tells a parent inside another app the one thing that works, not a Share menu', () => {
    for (const [name, userAgent] of IOS_WEBVIEWS) {
      const gate = pushOptInGate({ userAgent, standalone: false })
      expect(gate.allowed, name).toBe(false)
      expect(gate.reason, name).toBe(IOS_WEBVIEW_REASON)
      // The impossible instruction must not leak into the webview's sentence …
      expect(gate.reason, name).not.toContain('Add to Home Screen')
      // … and it must name the real escape route instead of dead-ending.
      expect(gate.reason, name).toContain('Safari')
    }
  })
})

// ---------------------------------------------------------------------------
// The permission-decision memory
// ---------------------------------------------------------------------------

describe('parsePermissionDecision', () => {
  it('reads the three real answers', () => {
    expect(parsePermissionDecision('granted')).toBe('granted')
    expect(parsePermissionDecision('denied')).toBe('denied')
    expect(parsePermissionDecision('dismissed')).toBe('dismissed')
  })

  it('reads garbage, null and missing as "unknown" — never as a decision', () => {
    expect(parsePermissionDecision(null)).toBe('unknown')
    expect(parsePermissionDecision(undefined)).toBe('unknown')
    expect(parsePermissionDecision('')).toBe('unknown')
    expect(parsePermissionDecision('yes')).toBe('unknown')
  })
})

describe('readPermissionDecision / rememberPermissionDecision', () => {
  it('round-trips a decision through storage', () => {
    const storage = fakeStorage()
    rememberPermissionDecision(storage, 'denied')
    expect(storage.dump()[PUSH_DECISION_KEY]).toBe('denied')
    expect(readPermissionDecision(storage)).toBe('denied')
  })

  it('reads an absent key as unknown', () => {
    expect(readPermissionDecision(fakeStorage())).toBe('unknown')
  })

  it('survives a storage that refuses everything', () => {
    expect(readPermissionDecision(throwingStorage)).toBe('unknown')
    expect(() => rememberPermissionDecision(throwingStorage, 'denied')).not.toThrow()
    expect(readPermissionDecision(null)).toBe('unknown')
    expect(() => rememberPermissionDecision(null, 'denied')).not.toThrow()
  })
})

describe('the armed trigger', () => {
  it('round-trips the two meaningful actions', () => {
    const storage = fakeStorage()
    armPushPrompt(storage, 'post_created')
    expect(readArmedTrigger(storage)).toBe('post_created')
    armPushPrompt(storage, 'ping_saved')
    expect(readArmedTrigger(storage)).toBe('ping_saved')
    clearArmedTrigger(storage)
    expect(readArmedTrigger(storage)).toBe(null)
    expect(storage.dump()[PUSH_TRIGGER_KEY]).toBeUndefined()
  })

  it('reads anything unexpected as "no action happened"', () => {
    expect(readArmedTrigger(fakeStorage({ [PUSH_TRIGGER_KEY]: 'cold_load' }))).toBe(null)
    expect(readArmedTrigger(throwingStorage)).toBe(null)
    expect(readArmedTrigger(null)).toBe(null)
  })
})

// The origin of an armed action (first-use audit, ticket 03): a fact stored
// BESIDE the trigger, so a storage that refuses this write still leaves the
// prompt working — it just cannot defer.
describe('the armed trigger origin', () => {
  it('round-trips the route the action happened on', () => {
    const storage = fakeStorage()
    armPushPrompt(storage, 'ping_saved')
    armPushPromptOrigin(storage, '/playdate/abc')
    expect(readArmedOrigin(storage)).toBe('/playdate/abc')
  })

  it('clears the origin with the trigger, so no stale route survives a dismissal', () => {
    const storage = fakeStorage()
    armPushPrompt(storage, 'ping_saved')
    armPushPromptOrigin(storage, '/playdate/abc')
    clearArmedTrigger(storage)
    expect(readArmedTrigger(storage)).toBe(null)
    expect(readArmedOrigin(storage)).toBe(null)
    expect(storage.dump()[PUSH_TRIGGER_ORIGIN_KEY]).toBeUndefined()
  })

  it('reads a missing, empty, or unreadable origin as unknown — today’s behavior', () => {
    expect(readArmedOrigin(fakeStorage())).toBe(null)
    expect(readArmedOrigin(fakeStorage({ [PUSH_TRIGGER_ORIGIN_KEY]: '' }))).toBe(null)
    expect(readArmedOrigin(throwingStorage)).toBe(null)
    expect(readArmedOrigin(null)).toBe(null)
  })

  it('never throws into the click handler that armed it', () => {
    expect(() => armPushPromptOrigin(throwingStorage, '/playdate/abc')).not.toThrow()
    expect(() => armPushPromptOrigin(null, '/playdate/abc')).not.toThrow()
  })
})

describe('isPlaydateDetailPath', () => {
  it('recognizes the detail route, with or without a trailing slash', () => {
    expect(isPlaydateDetailPath('/playdate/abc')).toBe(true)
    expect(isPlaydateDetailPath('/playdate/1111-2222')).toBe(true)
    expect(isPlaydateDetailPath('/playdate/abc/')).toBe(true)
  })

  it('rejects every other route, including the host’s edit form', () => {
    for (const path of [
      '/',
      '/new',
      '/playdate',
      '/playdates',
      '/playdate/abc/edit',
      '/place/abc',
      '',
    ]) {
      expect(isPlaydateDetailPath(path)).toBe(false)
    }
    expect(isPlaydateDetailPath(null)).toBe(false)
    expect(isPlaydateDetailPath(undefined)).toBe(false)
  })
})

describe('browserPermissionOf', () => {
  it('maps the three real values and calls anything else unsupported', () => {
    expect(browserPermissionOf('granted')).toBe('granted')
    expect(browserPermissionOf('denied')).toBe('denied')
    expect(browserPermissionOf('default')).toBe('default')
    expect(browserPermissionOf(undefined)).toBe('unsupported')
    expect(browserPermissionOf('prompt')).toBe('unsupported')
  })
})

// ---------------------------------------------------------------------------
// The prompt rule — the cold-load pin lives here
// ---------------------------------------------------------------------------

const OPEN_GATE = { allowed: true, reason: null }

describe('decidePermissionPrompt', () => {
  it('NEVER asks on a cold load, with no reason and no nagging note', () => {
    const decision = decidePermissionPrompt({
      decision: 'unknown',
      permission: 'default',
      trigger: null,
      gate: OPEN_GATE,
    })
    expect(decision).toEqual({ ask: false, reason: null, note: null })
  })

  it('asks after a meaningful action, with the one-line reason', () => {
    const decision = decidePermissionPrompt({
      decision: 'unknown',
      permission: 'default',
      trigger: 'post_created',
      gate: OPEN_GATE,
    })
    expect(decision.ask).toBe(true)
    expect(decision.reason).toBe(PUSH_PROMPT_REASON)
    expect(decision.note).toBe(null)
  })

  it('asks after a saved ping too', () => {
    expect(
      decidePermissionPrompt({
        decision: 'unknown',
        permission: 'default',
        trigger: 'ping_saved',
        gate: OPEN_GATE,
      }).ask,
    ).toBe(true)
  })

  it('never re-prompts a remembered denial, and points at the inbox instead', () => {
    const decision = decidePermissionPrompt({
      decision: 'denied',
      permission: 'default',
      trigger: 'ping_saved',
      gate: OPEN_GATE,
    })
    expect(decision.ask).toBe(false)
    expect(decision.note).toBe(DENIED_POINTER)
    expect(decision.note).toContain(WHILE_AWAY_POINTER)
  })

  it('treats the browser\'s own denial the same way', () => {
    const decision = decidePermissionPrompt({
      decision: 'unknown',
      permission: 'denied',
      trigger: 'post_created',
      gate: OPEN_GATE,
    })
    expect(decision.ask).toBe(false)
    expect(decision.note).toBe(DENIED_POINTER)
  })

  it('honours a remembered "not now" without asking again', () => {
    const decision = decidePermissionPrompt({
      decision: 'dismissed',
      permission: 'default',
      trigger: 'post_created',
      gate: OPEN_GATE,
    })
    expect(decision.ask).toBe(false)
    expect(decision.note).toBe(DISMISSED_POINTER)
  })

  it('has nothing to ask for once permission is granted', () => {
    expect(
      decidePermissionPrompt({
        decision: 'unknown',
        permission: 'granted',
        trigger: 'post_created',
        gate: OPEN_GATE,
      }),
    ).toEqual({ ask: false, reason: null, note: null })
  })

  it('never asks when the gate is closed, and shows the gate\'s reason verbatim', () => {
    const gate = pushOptInGate({ userAgent: IPHONE_SAFARI, standalone: false })
    const decision = decidePermissionPrompt({
      decision: 'unknown',
      permission: 'default',
      trigger: 'post_created',
      gate,
    })
    expect(decision.ask).toBe(false)
    expect(decision.note).toBe(IOS_INSTALL_REASON)
  })

  it('points at the inbox in a browser that cannot do notifications at all', () => {
    const decision = decidePermissionPrompt({
      decision: 'unknown',
      permission: 'unsupported',
      trigger: 'post_created',
      gate: OPEN_GATE,
    })
    expect(decision.ask).toBe(false)
    expect(decision.note).toBe(UNSUPPORTED_POINTER)
  })
})

// ---------------------------------------------------------------------------
// The RSVP-priority deferral (first-use audit, ticket 03)
//
// The action that arms the prompt happened on a drop-in's DETAIL page, whose
// own confirmation is the moment the parent just earned. The prompt waits for
// the next feed visit instead of competing with "✓ Going".
// ---------------------------------------------------------------------------

describe('decidePermissionPrompt — the RSVP-priority deferral', () => {
  const DETAIL = '/playdate/11111111-2222-3333-4444-555555555555'

  it('defers a ping saved on a drop-in detail page', () => {
    const decision = decidePermissionPrompt({
      decision: 'unknown',
      permission: 'default',
      trigger: 'ping_saved',
      origin: DETAIL,
      gate: OPEN_GATE,
    })
    expect(decision).toEqual({ ask: false, reason: null, note: null })
  })

  it('still asks for a ping saved on the feed, where the action did not navigate', () => {
    expect(
      decidePermissionPrompt({
        decision: 'unknown',
        permission: 'default',
        trigger: 'ping_saved',
        origin: '/',
        gate: OPEN_GATE,
      }).ask,
    ).toBe(true)
  })

  it('still asks for a post created on /new', () => {
    expect(
      decidePermissionPrompt({
        decision: 'unknown',
        permission: 'default',
        trigger: 'post_created',
        origin: '/new',
        gate: OPEN_GATE,
      }).ask,
    ).toBe(true)
  })

  it('treats a MISSING origin as today’s behavior — a legitimate prompt is never silently dropped', () => {
    expect(
      decidePermissionPrompt({
        decision: 'unknown',
        permission: 'default',
        trigger: 'ping_saved',
        gate: OPEN_GATE,
      }).ask,
    ).toBe(true)
    expect(
      decidePermissionPrompt({
        decision: 'unknown',
        permission: 'default',
        trigger: 'ping_saved',
        origin: null,
        gate: OPEN_GATE,
      }).ask,
    ).toBe(true)
  })

  it('keeps the fallback notes on a detail page — only the ASK is deferred', () => {
    // A parent who already denied gets the honest pointer, not silence: the
    // deferral rule is about the prompt competing with the RSVP confirmation.
    expect(
      decidePermissionPrompt({
        decision: 'denied',
        permission: 'default',
        trigger: 'ping_saved',
        origin: DETAIL,
        gate: OPEN_GATE,
      }).note,
    ).toBe(DENIED_POINTER)
  })

  it('defers only on the detail ROUTE — the edit form is not the RSVP surface', () => {
    // `/playdate` with no id, `/playdates`, and the host's edit form are all
    // somewhere else, and there the prompt is not competing with "✓ Going".
    for (const origin of ['/playdate', '/playdates', '/playdate/x/edit']) {
      expect(
        decidePermissionPrompt({
          decision: 'unknown',
          permission: 'default',
          trigger: 'ping_saved',
          origin,
          gate: OPEN_GATE,
        }).ask,
      ).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// The /profile opt-in CONTROL — the round trip "Turn off" -> "Turn on"
//
// These are the fix-round finding A tests: gating this control on the PROMPT
// rule made the opt-in one-way, because "Turn off" remembers 'dismissed' while
// leaving `Notification.permission === 'granted'`, and the prompt rule
// short-circuits on both.
// ---------------------------------------------------------------------------

describe('decideOptInControl', () => {
  const base = {
    permission: 'granted' as const,
    decision: 'dismissed' as const,
    gate: OPEN_GATE,
    registration: 'none' as const,
  }

  it('OFFERS the button after "Turn off": granted + dismissed + no row', () => {
    // THE BUG: this is exactly the state disablePush() leaves behind, and the
    // section used to render "You can turn them back on here any time" with no
    // button anywhere.
    const control = decideOptInControl(base)
    expect(control.offer).toBe(true)
    expect(control.reason).toBe(PUSH_PROMPT_REASON)
    expect(control.note).toBe(null)
  })

  it('OFFERS the button to a parent who re-granted in browser settings (granted, no row)', () => {
    expect(decideOptInControl({ ...base, decision: 'unknown' }).offer).toBe(true)
    expect(decideOptInControl({ ...base, decision: 'granted' }).offer).toBe(true)
  })

  it('OFFERS it when the row read failed — writing a row is the right recovery', () => {
    expect(decideOptInControl({ ...base, registration: 'unknown' }).offer).toBe(true)
  })

  it('offers nothing when a row already exists (the section draws "on" + "Turn off")', () => {
    expect(decideOptInControl({ ...base, registration: 'registered' })).toEqual({
      offer: false,
      reason: null,
      note: null,
    })
  })

  it('offers nothing to a denied parent — the browser will not prompt again — and names the real route back', () => {
    expect(decideOptInControl({ ...base, permission: 'denied' })).toEqual({
      offer: false,
      reason: null,
      note: DENIED_POINTER,
    })
    expect(decideOptInControl({ ...base, permission: 'default', decision: 'denied' }).note).toBe(
      DENIED_POINTER,
    )
  })

  it('offers nothing in a browser that cannot do notifications, and points at the inbox', () => {
    expect(decideOptInControl({ ...base, permission: 'unsupported' }).note).toBe(UNSUPPORTED_POINTER)
  })

  it('offers nothing before the iOS app is installed, and shows the gate reason verbatim', () => {
    const gate = pushOptInGate({ userAgent: IPHONE_SAFARI, standalone: false })
    const control = decideOptInControl({ ...base, permission: 'default', gate })
    expect(control.offer).toBe(false)
    expect(control.note).toBe(IOS_INSTALL_REASON)
  })

  it('is NOT the prompt rule: a cold load has no control consequence', () => {
    // decidePermissionPrompt refuses to ASK on a cold load; the control is a
    // permanent affordance and must not inherit that refusal.
    expect(
      decidePermissionPrompt({
        decision: 'unknown',
        permission: 'default',
        trigger: null,
        gate: OPEN_GATE,
      }).ask,
    ).toBe(false)
    expect(
      decideOptInControl({ ...base, permission: 'default', decision: 'unknown' }).offer,
    ).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// The per-kind mutes
// ---------------------------------------------------------------------------

describe('push prefs', () => {
  it('defaults to nothing muted', () => {
    expect(parsePushPrefs(null)).toEqual(DEFAULT_PUSH_PREFS)
    expect(parsePushPrefs('')).toEqual(DEFAULT_PUSH_PREFS)
  })

  it('round-trips muted kinds and drops unknown ones', () => {
    const prefs = setKindMuted(DEFAULT_PUSH_PREFS, 'starting_soon', true)
    expect(parsePushPrefs(serializePushPrefs(prefs))).toEqual({ muted: ['starting_soon'] })
    expect(parsePushPrefs('{"muted":["starting_soon","nonsense"]}')).toEqual({
      muted: ['starting_soon'],
    })
  })

  it('fails OPEN on garbage, so a storage problem cannot swallow a cancellation', () => {
    expect(parsePushPrefs('not json')).toEqual(DEFAULT_PUSH_PREFS)
    expect(parsePushPrefs('{"muted":"starting_soon"}')).toEqual(DEFAULT_PUSH_PREFS)
    expect(parsePushPrefs('[1,2,3]')).toEqual(DEFAULT_PUSH_PREFS)
  })

  it('toggles a kind on and off without disturbing the others', () => {
    let prefs = setKindMuted(DEFAULT_PUSH_PREFS, 'new_comment', true)
    prefs = setKindMuted(prefs, 'cancelled', true)
    expect(prefs.muted).toEqual(['cancelled', 'new_comment'])
    prefs = setKindMuted(prefs, 'cancelled', false)
    expect(prefs.muted).toEqual(['new_comment'])
    expect(isKindMuted(prefs, 'new_comment')).toBe(true)
    expect(isKindMuted(prefs, 'cancelled')).toBe(false)
  })

  it('never mutates the prefs it is given', () => {
    const prefs = setKindMuted(DEFAULT_PUSH_PREFS, 'cancelled', true)
    expect(DEFAULT_PUSH_PREFS.muted).toEqual([])
    expect(prefs).not.toBe(DEFAULT_PUSH_PREFS)
  })
})

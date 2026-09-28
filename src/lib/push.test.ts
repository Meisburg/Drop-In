/**
 * V8 ticket 08 — the pure seams for web push (src/lib/push.ts).
 *
 * Three of these are pinned by the ticket and are the reason this file is not
 * a formality:
 *
 *  1. the PAYLOAD BUILDER — the wording of all six kinds, including the
 *     singular "1 family is going" (the plural template would say
 *     "1 families", the same broken English the while-away inbox already
 *     fixed). These literals are the spec the SQL twin
 *     (`public.notification_payload`, migration 0055) and the `send-push`
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
  NOTIFICATION_KINDS,
  PING_PROMPT_REASON,
  PUSH_DECISION_KEY,
  PUSH_DECISION_MIGRATED_KEY,
  PUSH_OFFERED_KEY,
  PUSH_PROMPT_REASON,
  PUSH_PROMPT_TRIGGERS,
  PUSH_TRIGGER_KEY,
  PUSH_TRIGGER_ORIGIN_KEY,
  UNSUPPORTED_POINTER,
  WHILE_AWAY_POINTER,
  addOfferedTrigger,
  armPushPrompt,
  armPushPromptOrigin,
  browserPermissionOf,
  buildNotificationPayload,
  clearArmedTrigger,
  decideOptInControl,
  decidePermissionPrompt,
  dedupeNotifications,
  familiesGoingLabel,
  hasOfferedTrigger,
  installSurface,
  isIosDevice,
  isIosSafari,
  isIosWebview,
  isKindMuted,
  isNotificationKind,
  isPlaydateDetailPath,
  isPushPromptTrigger,
  isRsvpDeferredAt,
  isPromptSuppressedPath,
  isStandalone,
  migrateLegacyDecision,
  migrateLegacyDecisionOnce,
  notificationDedupeKey,
  notificationUrl,
  parseOfferedTriggers,
  parsePermissionDecision,
  parsePushPrefs,
  parseQuietHours,
  promptReasonFor,
  pushOptInGate,
  readArmedOrigin,
  readArmedTrigger,
  readOfferedTriggers,
  readPermissionDecision,
  rememberPermissionDecision,
  rememberTriggerOffered,
  reviewPromptUrl,
  serializeOfferedTriggers,
  serializePushPrefs,
  setKindMuted,
  setQuietHours,
  shouldSuppressForQuietHours,
  shouldSpendPushPoint,
  isQuietAt,
  type PushPrefs,
  type QuietHours,
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

  it('builds the review prompt kind, pointed at the PLACE (V26 s1, migration 0055)', () => {
    const PLACE_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    // The literal strings the SQL twin (public.notification_payload, the
    // 0055-rewritten branch) must match char-for-char.
    expect(
      buildNotificationPayload({
        kind: 'review_due',
        playdateId: POST_ID,
        postTitle: 'Green Lake',
        placeId: PLACE_ID,
      }),
    ).toEqual({
      title: 'How was "Green Lake"?',
      body: 'You said you were going — rate the place.',
      url: `/place/${PLACE_ID}/details`,
    })
  })

  it('never claims attendance — a ping is a stated intention, not a check-in', () => {
    // `going_pings` (0007) has no status column and no check-in exists, so a
    // no-show is indistinguishable from a show. "you went" would be a
    // falsehood for every no-show; "you said you were going" is true for both.
    const payload = buildNotificationPayload({
      kind: 'review_due',
      playdateId: POST_ID,
      postTitle: 'Green Lake',
      placeId: 'place-1',
    })
    expect(payload.body).toBe('You said you were going — rate the place.')
    expect(payload.body).not.toContain('you went')
    expect(payload.body.toLowerCase()).not.toContain('you were there')
  })

  it('falls back to the drop-in url when review_due has no usable place id', () => {
    for (const placeId of [null, undefined, '', '   ']) {
      const payload = buildNotificationPayload({
        kind: 'review_due',
        playdateId: POST_ID,
        postTitle: 'Green Lake',
        placeId,
      })
      // Never `/place/null/details` and never `/place//details`.
      expect(payload.url).toBe(`/playdate/${POST_ID}`)
      expect(payload.url).not.toContain('/place/')
      expect(payload.url).not.toContain('null')
    }
  })

  it('uses the honest title fallback for an untitled review prompt', () => {
    expect(
      buildNotificationPayload({
        kind: 'review_due',
        playdateId: POST_ID,
        postTitle: null,
        placeId: 'place-1',
      }).title,
    ).toBe('How was "your drop-in"?')
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

describe('reviewPromptUrl', () => {
  it('points at the place detail route, not the drop-in route', () => {
    // The SIBLING of notificationUrl: five KINDS flow through that one (it has
    // a single call site, buildNotificationPayload) and its `/playdate/:id`
    // route is pinned above, so the review prompt got its own rule rather than
    // widening that contract.
    expect(reviewPromptUrl('place-1')).toBe('/place/place-1/details')
    expect(reviewPromptUrl('place-1')).not.toContain('/playdate/')
    // A real uuid is byte-identical to the unencoded spelling, so every
    // uuid-based assertion elsewhere stays true.
    const uuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    expect(reviewPromptUrl(uuid)).toBe(`/place/${uuid}/details`)
  })

  it('ENCODES the id — one route, one encoding contract (places.ts)', () => {
    // The canonical builder is `placeDetailsPath` (src/lib/places.ts), which
    // uses encodeURIComponent. Unencoded, an id containing `/` would silently
    // become a SECOND PATH SEGMENT and lead somewhere else entirely.
    expect(reviewPromptUrl('a/b')).toBe('/place/a%2Fb/details')
    expect(reviewPromptUrl('a/b')).not.toBe('/place/a/b/details')
    // `/place/:id/details` is four segments even for a hostile id; unencoded
    // this string has five.
    expect(reviewPromptUrl('a/b').split('/')).toHaveLength(4)
    expect(reviewPromptUrl('a/b?x=1#y')).toBe('/place/a%2Fb%3Fx%3D1%23y/details')
    // The payload builder routes through this function, so the encoding holds
    // on the notification's url too — not just on the helper.
    expect(
      buildNotificationPayload({
        kind: 'review_due',
        playdateId: POST_ID,
        postTitle: 'Green Lake',
        placeId: 'a/b',
      }).url,
    ).toBe('/place/a%2Fb/details')
  })
})

describe('isNotificationKind', () => {
  it('accepts the six kinds and rejects anything else', () => {
    // Iterating the one list is the point: a seventh kind added to
    // NOTIFICATION_KINDS without a thought for this guard still has to pass
    // (and every kind it names is accepted).
    expect([...NOTIFICATION_KINDS]).toHaveLength(6)
    for (const kind of NOTIFICATION_KINDS) expect(isNotificationKind(kind)).toBe(true)
    expect(isNotificationKind('ping_received')).toBe(true)
    expect(isNotificationKind('cancelled')).toBe(true)
    expect(isNotificationKind('ended')).toBe(true)
    expect(isNotificationKind('review_due')).toBe(true)
    expect(isNotificationKind('reminder')).toBe(false)
    expect(isNotificationKind('review_prompt')).toBe(false)
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

// ---------------------------------------------------------------------------
// The one-time legacy-decision migration (V25 ticket 15, fix round · finding 3)
//
// `PUSH_DECISION_KEY` was read verbatim, with no versioning. Every parent who
// ever tapped "Not now" on the OLD prompt — or turned notifications off, or
// dismissed the OS dialog, which used to write the same value (finding 1) —
// already has 'dismissed' stored, and the decision seam turns a stored
// 'dismissed' into global silence. So for exactly those parents all three new
// moments were a no-op. The migration resets a legacy 'dismissed' to 'unknown'
// ONCE, guarded by a marker, so a 'dismissed' the /settings off-switch writes
// afterwards (a CURRENT answer) is never erased out from under the parent.
// ---------------------------------------------------------------------------

describe('the one-time legacy-decision migration', () => {
  it('resets a legacy dismissed — the value that predates the three moments', () => {
    expect(migrateLegacyDecision('dismissed')).toBe('unknown')
  })

  it('carries a real browser fact forward untouched', () => {
    expect(migrateLegacyDecision('granted')).toBe('granted')
    expect(migrateLegacyDecision('denied')).toBe('denied')
    expect(migrateLegacyDecision('unknown')).toBe('unknown')
  })

  it('a legacy dismissed no longer blocks the prompts', () => {
    // THE PIN FOR FINDING 3: the parent who said "Not now" on the old prompt is
    // offered the three moments again, and the legacy value is gone.
    const storage = fakeStorage({ [PUSH_DECISION_KEY]: 'dismissed' })
    migrateLegacyDecisionOnce(storage)
    expect(readPermissionDecision(storage)).toBe('unknown')
    expect(storage.dump()[PUSH_DECISION_KEY]).toBeUndefined()
    for (const trigger of PUSH_PROMPT_TRIGGERS) {
      expect(
        decidePermissionPrompt({
          decision: readPermissionDecision(storage),
          permission: 'default',
          trigger,
          origin: '/',
          currentPath: '/',
          offered: [],
          gate: OPEN_GATE,
        }).ask,
        `${trigger} must be offered again`,
      ).toBe(true)
    }
  })

  it('leaves a granted/denied decision alone, and records that it ran', () => {
    const storage = fakeStorage({ [PUSH_DECISION_KEY]: 'denied' })
    migrateLegacyDecisionOnce(storage)
    expect(readPermissionDecision(storage)).toBe('denied')
    expect(storage.dump()[PUSH_DECISION_MIGRATED_KEY]).toBe('1')
  })

  it('runs EXACTLY once — a dismissal written after the marker is a current answer', () => {
    // The /settings off-switch after the migration must stay global: a migration
    // that re-ran on every read would erase that answer.
    const storage = fakeStorage({ [PUSH_DECISION_KEY]: 'dismissed' })
    migrateLegacyDecisionOnce(storage)
    rememberPermissionDecision(storage, 'dismissed')
    migrateLegacyDecisionOnce(storage)
    expect(readPermissionDecision(storage)).toBe('dismissed')
  })

  it('is a no-op once the marker exists, whatever the stored value is', () => {
    const storage = fakeStorage({
      [PUSH_DECISION_KEY]: 'dismissed',
      [PUSH_DECISION_MIGRATED_KEY]: '1',
    })
    migrateLegacyDecisionOnce(storage)
    expect(readPermissionDecision(storage)).toBe('dismissed')
  })

  it('never throws into a handler, and no storage means no migration', () => {
    expect(() => migrateLegacyDecisionOnce(null)).not.toThrow()
    expect(() => migrateLegacyDecisionOnce(throwingStorage)).not.toThrow()
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

// ---------------------------------------------------------------------------
// The per-point memory (V25 ticket 15). The founder's three trigger points,
// each offered at most once, so a "Not now" at ONE of them cannot cancel the
// others.
// ---------------------------------------------------------------------------

describe('the offered points', () => {
  it('names exactly the three moments, and reads only those', () => {
    expect(PUSH_PROMPT_TRIGGERS).toEqual(['signup', 'post_created', 'ping_saved'])
    expect(isPushPromptTrigger('signup')).toBe(true)
    expect(isPushPromptTrigger('post_created')).toBe(true)
    expect(isPushPromptTrigger('ping_saved')).toBe(true)
    expect(isPushPromptTrigger('cold_load')).toBe(false)
    expect(isPushPromptTrigger(null)).toBe(false)
    expect(isPushPromptTrigger(3)).toBe(false)
  })

  it('arms and reads back the signup moment (it is a trigger like the other two)', () => {
    const storage = fakeStorage()
    armPushPrompt(storage, 'signup')
    expect(readArmedTrigger(storage)).toBe('signup')
  })

  it('parses a stored list, drops anything that is not a point, and reads garbage as empty', () => {
    expect(parseOfferedTriggers('signup,post_created')).toEqual(['signup', 'post_created'])
    expect(parseOfferedTriggers('signup, nonsense ,ping_saved')).toEqual(['signup', 'ping_saved'])
    expect(parseOfferedTriggers('')).toEqual([])
    expect(parseOfferedTriggers(null)).toEqual([])
    expect(parseOfferedTriggers(undefined)).toEqual([])
    expect(parseOfferedTriggers('yes')).toEqual([])
  })

  it('serializes in the founder’s order, deduplicated — one canonical form', () => {
    expect(serializeOfferedTriggers(['ping_saved', 'signup', 'signup'])).toBe('signup,ping_saved')
    expect(serializeOfferedTriggers([])).toBe('')
  })

  it('adds a point without disturbing the ones already there', () => {
    expect(addOfferedTrigger(['signup'], 'ping_saved')).toEqual(['signup', 'ping_saved'])
    expect(addOfferedTrigger([], 'post_created')).toEqual(['post_created'])
    expect(addOfferedTrigger(['signup'], 'signup')).toEqual(['signup'])
    // Never mutates the list it is handed.
    const offered: Array<'signup' | 'post_created' | 'ping_saved'> = ['signup']
    addOfferedTrigger(offered, 'post_created')
    expect(offered).toEqual(['signup'])
  })

  it('round-trips through storage, merging rather than replacing', () => {
    const storage = fakeStorage()
    rememberTriggerOffered(storage, 'signup')
    rememberTriggerOffered(storage, 'ping_saved')
    expect(storage.dump()[PUSH_OFFERED_KEY]).toBe('signup,ping_saved')
    expect(readOfferedTriggers(storage)).toEqual(['signup', 'ping_saved'])
  })

  it('reads an absent key as "no point offered yet"', () => {
    expect(readOfferedTriggers(fakeStorage())).toEqual([])
  })

  it('survives a storage that refuses everything', () => {
    expect(readOfferedTriggers(throwingStorage)).toEqual([])
    expect(() => rememberTriggerOffered(throwingStorage, 'signup')).not.toThrow()
    expect(readOfferedTriggers(null)).toEqual([])
    expect(() => rememberTriggerOffered(null, 'signup')).not.toThrow()
  })

  it('answers "is this point spent?" — and a cold load (null) is never spent', () => {
    expect(hasOfferedTrigger(['signup'], 'signup')).toBe(true)
    expect(hasOfferedTrigger(['signup'], 'ping_saved')).toBe(false)
    expect(hasOfferedTrigger([], 'ping_saved')).toBe(false)
    expect(hasOfferedTrigger(['signup'], null)).toBe(false)
  })
})

describe('promptReasonFor', () => {
  it('gives the going-to-an-event point its own reason — comments and cancellations', () => {
    expect(promptReasonFor('ping_saved')).toBe(PING_PROMPT_REASON)
    expect(PING_PROMPT_REASON).toContain('comments')
    expect(PING_PROMPT_REASON).toContain('cancelled')
  })

  it('keeps the drop-in reason for the other two points', () => {
    expect(promptReasonFor('signup')).toBe(PUSH_PROMPT_REASON)
    expect(promptReasonFor('post_created')).toBe(PUSH_PROMPT_REASON)
  })
})

describe('isPromptSuppressedPath', () => {
  it('names the surfaces that own the slot themselves', () => {
    expect(isPromptSuppressedPath('/settings')).toBe(true)
    expect(isPromptSuppressedPath('/onboarding')).toBe(true)
    // The composer: the post point is armed while its form submits and the app
    // then navigates to the feed by itself, so a card there is spent unseen.
    expect(isPromptSuppressedPath('/new')).toBe(true)
  })

  it('is not a blanket route filter — every other surface can carry the prompt', () => {
    for (const path of ['/', '/playdate/abc', '/profile', '/inbox', null, undefined]) {
      expect(isPromptSuppressedPath(path), String(path)).toBe(false)
    }
  })
})

describe('isRsvpDeferredAt', () => {
  const DETAIL = '/playdate/11111111-2222-3333-4444-555555555555'

  it('defers only while the parent is still on a detail page', () => {
    expect(isRsvpDeferredAt(DETAIL, DETAIL)).toBe(true)
    expect(isRsvpDeferredAt(DETAIL, '/')).toBe(false)
    expect(isRsvpDeferredAt(DETAIL, '/new')).toBe(false)
    // A different detail page is still a detail page.
    expect(isRsvpDeferredAt(DETAIL, '/playdate/other')).toBe(true)
  })

  it('is not a deferral at all when the action happened elsewhere', () => {
    expect(isRsvpDeferredAt('/', '/')).toBe(false)
    expect(isRsvpDeferredAt('/playdate/x/edit', '/playdate/x/edit')).toBe(false)
    expect(isRsvpDeferredAt(null, '/')).toBe(false)
  })

  it('keeps deferring when the current route is unknown — the conservative direction', () => {
    expect(isRsvpDeferredAt(DETAIL, null)).toBe(true)
    expect(isRsvpDeferredAt(DETAIL, undefined)).toBe(true)
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
// The per-point re-ask rule (V25 ticket 15). THE RULE, in the founder's terms:
// each of the three points is offered at most once, a "Not now" at one point
// does not cancel the others, and after all three the app is silent.
// ---------------------------------------------------------------------------

describe('decidePermissionPrompt — one offer per point', () => {
  it('asks each point when it has not been offered yet — signup, post, going', () => {
    for (const trigger of ['signup', 'post_created', 'ping_saved'] as const) {
      const decision = decidePermissionPrompt({
        decision: 'unknown',
        permission: 'default',
        trigger,
        origin: '/',
        currentPath: '/',
        offered: [],
        gate: OPEN_GATE,
      })
      expect(decision.ask, `${trigger} must ask`).toBe(true)
      expect(decision.reason).toBe(promptReasonFor(trigger))
    }
  })

  it('a "Not now" at SIGNUP does not cancel the after-post ask — the ticket’s rule', () => {
    expect(
      decidePermissionPrompt({
        decision: 'unknown',
        permission: 'default',
        trigger: 'post_created',
        origin: '/new',
        currentPath: '/',
        offered: ['signup'],
        gate: OPEN_GATE,
      }).ask,
    ).toBe(true)
  })

  it('a "Not now" at the post does not cancel the going ask either', () => {
    expect(
      decidePermissionPrompt({
        decision: 'unknown',
        permission: 'default',
        trigger: 'ping_saved',
        origin: '/',
        currentPath: '/',
        offered: ['signup', 'post_created'],
        gate: OPEN_GATE,
      }).ask,
    ).toBe(true)
  })

  it('a point already offered is SILENCE — no ask and no sentence on a loop', () => {
    const decision = decidePermissionPrompt({
      decision: 'unknown',
      permission: 'default',
      trigger: 'post_created',
      origin: '/new',
      currentPath: '/',
      offered: ['post_created'],
      gate: OPEN_GATE,
    })
    expect(decision).toEqual({ ask: false, reason: null, note: null })
  })

  it('after all three points, the app is silent and /settings is the only door back', () => {
    for (const trigger of ['signup', 'post_created', 'ping_saved'] as const) {
      expect(
        decidePermissionPrompt({
          decision: 'unknown',
          permission: 'default',
          trigger,
          origin: '/',
          currentPath: '/',
          offered: ['signup', 'post_created', 'ping_saved'],
          gate: OPEN_GATE,
        }),
        `${trigger} must be silent once spent`,
      ).toEqual({ ask: false, reason: null, note: null })
    }
  })

  it('a SPENT point beats a remembered dismissal — spent reads as silence, not the sentence', () => {
    expect(
      decidePermissionPrompt({
        decision: 'dismissed',
        permission: 'default',
        trigger: 'post_created',
        origin: '/new',
        currentPath: '/',
        offered: ['post_created'],
        gate: OPEN_GATE,
      }),
    ).toEqual({ ask: false, reason: null, note: null })
  })

  it('a remembered dismissal is still global when the point is NEW — and the /settings off-switch is its only writer', () => {
    // FIX ROUND, FINDING 1. 'dismissed' no longer has three writers: a dismissed
    // OS dialog writes NOTHING (see src/lib/pushClient.ts enablePush), and a
    // legacy 'dismissed' — an old "Not now", an old "Turn off", or that OS dialog
    // — is reset once by migrateLegacyDecisionOnce (finding 3). So the value that
    // reaches the branch below is a CURRENT answer ("Turn off notifications" in
    // /settings), and that answer IS global: a device the parent switched off
    // must not be asked again just because a later point is new. This is the
    // corrected rule the old version of this test encoded wrongly — it asserted
    // global silence without pinning who may write the value.
    const storage = fakeStorage({ [PUSH_DECISION_KEY]: 'dismissed' })

    // A LEGACY 'dismissed' is not that answer: it is migrated away, and the new
    // point is offered — which is the whole bug this fix round exists for.
    migrateLegacyDecisionOnce(storage)
    expect(readPermissionDecision(storage)).toBe('unknown')
    expect(
      decidePermissionPrompt({
        decision: readPermissionDecision(storage),
        permission: 'default',
        trigger: 'ping_saved',
        origin: '/',
        currentPath: '/',
        offered: [],
        gate: OPEN_GATE,
      }).ask,
      'a legacy dismissal must not silence a NEW point',
    ).toBe(true)

    // The off-switch writes a CURRENT 'dismissed' (after the migration marker),
    // and that one still silences a new point.
    rememberPermissionDecision(storage, 'dismissed')
    const decision = decidePermissionPrompt({
      decision: readPermissionDecision(storage),
      permission: 'default',
      trigger: 'ping_saved',
      origin: '/',
      currentPath: '/',
      offered: [],
      gate: OPEN_GATE,
    })
    expect(decision.ask).toBe(false)
    expect(decision.note).toBe(DISMISSED_POINTER)
  })

  it('a denial still stops every point, offered or not', () => {
    for (const offered of [[], ['signup']] as const) {
      const decision = decidePermissionPrompt({
        decision: 'unknown',
        permission: 'denied',
        trigger: 'post_created',
        origin: '/new',
        currentPath: '/',
        offered,
        gate: OPEN_GATE,
      })
      expect(decision.ask).toBe(false)
      expect(decision.note).toBe(DENIED_POINTER)
    }
  })

  it('a missing offered list reads as "nothing offered yet" — a caller cannot silence by omission', () => {
    expect(
      decidePermissionPrompt({
        decision: 'unknown',
        permission: 'default',
        trigger: 'signup',
        origin: '/login',
        currentPath: '/',
        gate: OPEN_GATE,
      }).ask,
    ).toBe(true)
  })

  it('never asks on /settings, /onboarding or /new — the surface owns the question', () => {
    for (const currentPath of ['/settings', '/onboarding', '/new']) {
      expect(
        decidePermissionPrompt({
          decision: 'unknown',
          permission: 'default',
          trigger: 'signup',
          origin: '/login',
          currentPath,
          offered: [],
          gate: OPEN_GATE,
        }),
        currentPath,
      ).toEqual({ ask: false, reason: null, note: null })
    }
  })
})

// ---------------------------------------------------------------------------
// WHEN a point is SPENT (V25 ticket 15, fix round · finding 2)
//
// This rule used to be an `if` inside src/components/PushOptInPrompt.tsx, which
// put it out of reach of the vitest lane entirely and duplicated two predicates
// that already live in this module (isPromptSuppressedPath, isPlaydateDetailPath).
// It is a pure function here now, and the component only applies it.
// ---------------------------------------------------------------------------

const DETAIL_PATH = '/playdate/11111111-2222-3333-4444-555555555555'

describe('shouldSpendPushPoint — when is a point spent', () => {
  it('spends the point the moment the card is drawn on a normal surface', () => {
    expect(
      shouldSpendPushPoint({ ask: true, trigger: 'post_created', currentPath: '/' }),
    ).toBe(true)
  })

  it('never spends on a suppressed surface — the app navigates out of it by itself', () => {
    for (const currentPath of ['/settings', '/onboarding', '/new']) {
      expect(
        shouldSpendPushPoint({ ask: true, trigger: 'signup', currentPath }),
        currentPath,
      ).toBe(false)
    }
  })

  it('never spends on a drop-in DETAIL page, even when the seam would ask there', () => {
    // The case the seam does NOT cover on its own: an action armed on the feed
    // and a parent now standing on a detail page. isRsvpDeferredAt only defers
    // the ask when the ACTION happened on a detail page too, so `ask` can be
    // true here — and the RSVP confirmation still owns the screen.
    expect(
      shouldSpendPushPoint({ ask: true, trigger: 'ping_saved', currentPath: DETAIL_PATH }),
    ).toBe(false)
    expect(
      shouldSpendPushPoint({ ask: true, trigger: 'ping_saved', currentPath: `${DETAIL_PATH}/` }),
    ).toBe(false)
  })

  it('a host form under /playdate/:id is not the detail page — the point is spent', () => {
    expect(
      shouldSpendPushPoint({
        ask: true,
        trigger: 'post_created',
        currentPath: `${DETAIL_PATH}/edit`,
      }),
    ).toBe(true)
  })

  it('never spends when there is no card to draw — no ask, or no trigger', () => {
    expect(shouldSpendPushPoint({ ask: false, trigger: 'signup', currentPath: '/' })).toBe(false)
    expect(shouldSpendPushPoint({ ask: false, trigger: null, currentPath: '/' })).toBe(false)
    expect(shouldSpendPushPoint({ ask: true, trigger: null, currentPath: '/' })).toBe(false)
  })

  it('is total — an unknown route reads as "not suppressed" and never throws', () => {
    expect(shouldSpendPushPoint({ ask: true, trigger: 'signup', currentPath: undefined })).toBe(
      true,
    )
    expect(shouldSpendPushPoint({ ask: true, trigger: 'signup', currentPath: null })).toBe(true)
  })

  it('agrees with the ask seam on every suppressed surface — the predicates cannot drift', () => {
    for (const currentPath of ['/settings', '/onboarding', '/new']) {
      const ask = decidePermissionPrompt({
        decision: 'unknown',
        permission: 'default',
        trigger: 'signup',
        origin: '/',
        currentPath,
        offered: [],
        gate: OPEN_GATE,
      }).ask
      expect(ask, `${currentPath} must not ask`).toBe(false)
      expect(
        shouldSpendPushPoint({ ask, trigger: 'signup', currentPath }),
        `${currentPath} must not spend`,
      ).toBe(false)
    }
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

  it('asks on the NEXT non-detail surface — the deferral is a wait, not a swallow', () => {
    // V25 ticket 15: at HEAD the origin alone decided this, so the point was
    // deferred on every route forever and the trigger-3 offer never happened.
    // The live route is the fact that ends it.
    const decision = decidePermissionPrompt({
      decision: 'unknown',
      permission: 'default',
      trigger: 'ping_saved',
      origin: DETAIL,
      currentPath: '/',
      gate: OPEN_GATE,
    })
    expect(decision.ask).toBe(true)
    expect(decision.reason).toBe(PING_PROMPT_REASON)
  })

  it('still defers while the parent is on a detail page — the confirmation keeps its moment', () => {
    expect(
      decidePermissionPrompt({
        decision: 'unknown',
        permission: 'default',
        trigger: 'ping_saved',
        origin: DETAIL,
        currentPath: DETAIL,
        gate: OPEN_GATE,
      }),
    ).toEqual({ ask: false, reason: null, note: null })
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
    expect(parsePushPrefs(serializePushPrefs(prefs)).muted).toEqual(['starting_soon'])
    expect(parsePushPrefs('{"muted":["starting_soon","nonsense"]}').muted).toEqual([
      'starting_soon',
    ])
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

// ---------------------------------------------------------------------------
// Quiet hours (V27) — a device-level window, enforced by the service worker.
// ---------------------------------------------------------------------------

describe('parseQuietHours', () => {
  it('returns the default for a non-object', () => {
    expect(parseQuietHours(null)).toEqual({ enabled: false, start: '21:00', end: '07:00' })
    expect(parseQuietHours('nonsense')).toEqual({ enabled: false, start: '21:00', end: '07:00' })
  })

  it('keeps a well-formed window and enabled flag', () => {
    expect(parseQuietHours({ enabled: true, start: '20:30', end: '06:15' })).toEqual({
      enabled: true,
      start: '20:30',
      end: '06:15',
    })
  })

  it('falls back per field on an invalid time', () => {
    expect(parseQuietHours({ enabled: true, start: '25:00', end: '9:00' })).toEqual({
      enabled: true,
      start: '21:00',
      end: '07:00',
    })
  })

  it('treats a non-true enabled as off', () => {
    expect(parseQuietHours({ enabled: 'yes', start: '21:00', end: '07:00' }).enabled).toBe(false)
  })
})

describe('isQuietAt', () => {
  const withinDay: QuietHours = { enabled: true, start: '13:00', end: '15:00' }
  const overnight: QuietHours = { enabled: true, start: '21:00', end: '07:00' }
  const at = (hours: number, minutes: number) => new Date(2025, 0, 1, hours, minutes)

  it('is never quiet when disabled', () => {
    expect(isQuietAt({ ...overnight, enabled: false }, at(23, 0))).toBe(false)
  })

  it('handles a same-day window with inclusive start and exclusive end', () => {
    expect(isQuietAt(withinDay, at(12, 59))).toBe(false)
    expect(isQuietAt(withinDay, at(13, 0))).toBe(true)
    expect(isQuietAt(withinDay, at(14, 59))).toBe(true)
    expect(isQuietAt(withinDay, at(15, 0))).toBe(false)
  })

  it('handles an overnight window that wraps midnight', () => {
    expect(isQuietAt(overnight, at(20, 59))).toBe(false)
    expect(isQuietAt(overnight, at(21, 0))).toBe(true)
    expect(isQuietAt(overnight, at(23, 59))).toBe(true)
    expect(isQuietAt(overnight, at(0, 30))).toBe(true)
    expect(isQuietAt(overnight, at(6, 59))).toBe(true)
    expect(isQuietAt(overnight, at(7, 0))).toBe(false)
  })

  it('treats a zero-length window as no window, not all-day silence', () => {
    expect(isQuietAt({ enabled: true, start: '09:00', end: '09:00' }, at(9, 0))).toBe(false)
  })

  it('ignores a malformed stored time', () => {
    expect(isQuietAt({ enabled: true, start: 'oops', end: '07:00' }, at(23, 0))).toBe(false)
  })
})

describe('shouldSuppressForQuietHours', () => {
  const quiet: PushPrefs = {
    muted: [],
    quietHours: { enabled: true, start: '21:00', end: '07:00' },
  }
  const night = new Date(2025, 0, 1, 23, 0)

  it('drops a chatter kind inside the window', () => {
    expect(shouldSuppressForQuietHours(quiet, 'starting_soon', night)).toBe(true)
    expect(shouldSuppressForQuietHours(quiet, 'new_comment', night)).toBe(true)
  })

  it('never drops a cancellation or an early end — those stop a drive-out', () => {
    expect(shouldSuppressForQuietHours(quiet, 'cancelled', night)).toBe(false)
    expect(shouldSuppressForQuietHours(quiet, 'ended', night)).toBe(false)
  })

  it('never drops an unclassifiable push (fail open)', () => {
    expect(shouldSuppressForQuietHours(quiet, null, night)).toBe(false)
  })

  it('drops nothing outside the window', () => {
    const noon = new Date(2025, 0, 1, 12, 0)
    expect(shouldSuppressForQuietHours(quiet, 'starting_soon', noon)).toBe(false)
  })
})

describe('quiet-hours persistence', () => {
  it('round-trips the window through serialize/parse', () => {
    const prefs = setQuietHours(DEFAULT_PUSH_PREFS, {
      enabled: true,
      start: '22:15',
      end: '06:45',
    })
    expect(parsePushPrefs(serializePushPrefs(prefs)).quietHours).toEqual({
      enabled: true,
      start: '22:15',
      end: '06:45',
    })
  })

  it('defaults quiet hours when the stored JSON predates V27', () => {
    expect(parsePushPrefs('{"muted":["starting_soon"]}').quietHours).toEqual({
      enabled: false,
      start: '21:00',
      end: '07:00',
    })
  })

  it('does not mutate the prefs it is given', () => {
    const next = setQuietHours(DEFAULT_PUSH_PREFS, { enabled: true, start: '20:00', end: '08:00' })
    expect(DEFAULT_PUSH_PREFS.quietHours.enabled).toBe(false)
    expect(next).not.toBe(DEFAULT_PUSH_PREFS)
  })
})

/**
 * V8 ticket 09 — the loop-closing pure seams (src/lib/follows.ts).
 *
 * The three load-bearing ones are the ticket's own list, and each is tested
 * for the failure it exists to prevent:
 *  - `validateFollowTarget` — the client twin of the DB's
 *    `follows_one_target_check`: BOTH targets and NEITHER target are refused
 *    (a both-set row would be a follow that means two things).
 *  - `metBeforeLine` — singular at 1, plural at N, and HIDDEN at 0 (which is
 *    also the "the viewer follows nobody" case: a viewer who has never
 *    followed anyone must see exactly today's card).
 *  - `nextOccurrencePlan` — the next occurrence, INCLUDING "there is none"
 *    (stopped vs no-more), so the page never renders a dead one-tap control.
 *
 * Every expectation is a literal (the series.test.ts discipline): the copy and
 * the instants are written out, not re-derived from the seam under test.
 */
import { describe, expect, it } from 'vitest'
import {
  ENDED_REWIND_DAYS,
  endedWithinDays,
  followTargetOf,
  followTargetsFrom,
  metBeforeLine,
  nextOccurrencePlan,
  occurrenceWhenLabel,
  placeFollowerLine,
  validateFollowTarget,
} from './follows'
import type { OccurrenceLike } from './follows'

describe('validateFollowTarget (the exactly-one-target rule, 0033 CHECK twin)', () => {
  it('accepts a family-only target', () => {
    expect(validateFollowTarget({ followeeProfileId: 'p-1' })).toBeNull()
  })

  it('accepts a place-only target', () => {
    expect(validateFollowTarget({ placeId: 'place-1' })).toBeNull()
  })

  it('refuses BOTH targets (the CHECK’s <> is an XOR)', () => {
    expect(validateFollowTarget({ followeeProfileId: 'p-1', placeId: 'place-1' })).toBe(
      'A follow is either a family or a place — not both.',
    )
  })

  it('refuses NEITHER target', () => {
    expect(validateFollowTarget({})).toBe('Pick a family or a place to follow.')
    expect(validateFollowTarget({ followeeProfileId: null, placeId: null })).toBe(
      'Pick a family or a place to follow.',
    )
  })

  it('treats a blank/whitespace id as ABSENT, not as a target', () => {
    expect(validateFollowTarget({ followeeProfileId: '   ', placeId: 'place-1' })).toBeNull()
    expect(validateFollowTarget({ followeeProfileId: '' })).toBe(
      'Pick a family or a place to follow.',
    )
    expect(validateFollowTarget({ followeeProfileId: 'p-1', placeId: '  ' })).toBeNull()
    expect(validateFollowTarget({ followeeProfileId: '', placeId: '' })).toBe(
      'Pick a family or a place to follow.',
    )
  })

  it('trims a padded id rather than accepting it with the padding', () => {
    expect(followTargetOf({ followee_profile_id: ' p-1 ' })).toEqual({
      kind: 'family',
      profileId: 'p-1',
    })
  })
})

describe('followTargetOf (the read-side twin)', () => {
  it('resolves each kind', () => {
    expect(followTargetOf({ followee_profile_id: 'p-1', place_id: null })).toEqual({
      kind: 'family',
      profileId: 'p-1',
    })
    expect(followTargetOf({ followee_profile_id: null, place_id: 'place-1' })).toEqual({
      kind: 'place',
      placeId: 'place-1',
    })
  })

  it('returns null for a row that breaks the exactly-one rule (never a link to nowhere)', () => {
    expect(followTargetOf({ followee_profile_id: null, place_id: null })).toBeNull()
    expect(followTargetOf({ followee_profile_id: 'p-1', place_id: 'place-1' })).toBeNull()
  })
})

describe('followTargetsFrom (the viewer’s own follow sets)', () => {
  it('splits rows by kind and skips invalid ones', () => {
    const targets = followTargetsFrom([
      { followee_profile_id: 'p-1', place_id: null },
      { followee_profile_id: null, place_id: 'place-1' },
      { followee_profile_id: 'p-2', place_id: null },
      { followee_profile_id: null, place_id: null },
      { followee_profile_id: 'p-3', place_id: 'place-2' },
    ])
    expect([...targets.followeeIds].sort()).toEqual(['p-1', 'p-2'])
    expect([...targets.placeIds]).toEqual(['place-1'])
  })

  it('is empty for no rows (a viewer who follows nobody)', () => {
    const targets = followTargetsFrom([])
    expect(targets.followeeIds.size).toBe(0)
    expect(targets.placeIds.size).toBe(0)
  })
})

describe('metBeforeLine (the card line)', () => {
  const followees = new Set(['sam', 'rita'])

  it('is singular at 1', () => {
    expect(metBeforeLine([{ profileId: 'sam' }], followees)).toBe(
      '1 family you’ve met before is going',
    )
  })

  it('is plural at N', () => {
    expect(
      metBeforeLine([{ profileId: 'sam' }, { profileId: 'rita' }, { profileId: 'zoe' }], followees),
    ).toBe('2 families you’ve met before are going')
  })

  it('is HIDDEN at 0 (nobody going is a followed family)', () => {
    expect(metBeforeLine([{ profileId: 'zoe' }], followees)).toBeNull()
    expect(metBeforeLine([], followees)).toBeNull()
  })

  it('is HIDDEN when the viewer follows nobody', () => {
    expect(metBeforeLine([{ profileId: 'sam' }], new Set<string>())).toBeNull()
    expect(metBeforeLine([{ profileId: 'sam' }, { profileId: 'rita' }], new Set())).toBeNull()
  })

  it('counts DISTINCT families (a repeated ping is still one family)', () => {
    expect(metBeforeLine([{ profileId: 'sam' }, { profileId: 'sam' }], followees)).toBe(
      '1 family you’ve met before is going',
    )
  })

  it('ignores a blank ping profile id rather than counting it', () => {
    expect(metBeforeLine([{ profileId: '' }, { profileId: 'sam' }], followees)).toBe(
      '1 family you’ve met before is going',
    )
    expect(metBeforeLine([{ profileId: '   ' }], followees)).toBeNull()
  })

  it('counts only families — a followed PLACE is not one of the pingers', () => {
    // The seam's input is the viewer's FAMILY ids; a place id can never be a
    // pinger's profile id, so the line stays hidden for place-only follows.
    const placeOnly = followTargetsFrom([{ followee_profile_id: null, place_id: 'place-1' }])
    expect(metBeforeLine([{ profileId: 'place-1' }], placeOnly.followeeIds)).toBeNull()
  })
})

describe('placeFollowerLine (/place/:id, the SECDEF count’s copy)', () => {
  it('says zero out loud (it is information, not a hidden line)', () => {
    expect(placeFollowerLine(0)).toBe('No families follow this place yet')
  })

  it('is singular at 1 and plural above it', () => {
    expect(placeFollowerLine(1)).toBe('1 family follows this place')
    expect(placeFollowerLine(2)).toBe('2 families follow this place')
    expect(placeFollowerLine(37)).toBe('37 families follow this place')
  })

  it('degrades a nonsense count to 0 rather than printing it', () => {
    expect(placeFollowerLine(-4)).toBe('No families follow this place yet')
    expect(placeFollowerLine(Number.NaN)).toBe('No families follow this place yet')
  })
})

describe('endedWithinDays (the "Same time next week" window)', () => {
  const now = '2026-09-19T18:00:00.000Z'

  it('pins the 7-day window', () => {
    expect(ENDED_REWIND_DAYS).toBe(7)
  })

  it('is true for a post that just ended, and at the exact boundary', () => {
    expect(endedWithinDays({ ends_at: '2026-09-19T17:00:00.000Z' }, now)).toBe(true)
    expect(endedWithinDays({ ends_at: now }, now)).toBe(true)
    expect(endedWithinDays({ ends_at: '2026-09-12T18:00:00.000Z' }, now)).toBe(true)
  })

  it('is false once the post is older than the window', () => {
    expect(endedWithinDays({ ends_at: '2026-09-12T17:59:59.000Z' }, now)).toBe(false)
    expect(endedWithinDays({ ends_at: '2026-01-01T00:00:00.000Z' }, now)).toBe(false)
  })

  it('is false for a post that has not ended yet', () => {
    expect(endedWithinDays({ ends_at: '2026-09-19T19:00:00.000Z' }, now)).toBe(false)
  })

  it('is false for an unparseable instant (never invent an action)', () => {
    expect(endedWithinDays({ ends_at: 'not a date' }, now)).toBe(false)
    expect(endedWithinDays({ ends_at: now }, 'nope')).toBe(false)
  })
})

describe('nextOccurrencePlan (the series chooser)', () => {
  const now = '2026-09-19T18:00:00.000Z'
  const active = { active: true }
  const stopped = { active: false }

  it('picks the SOONEST future occurrence, whatever order the rows arrive in', () => {
    const rows: OccurrenceLike[] = [
      { id: 'week-3', starts_at: '2026-10-03T17:00:00.000Z', ends_at: '2026-10-03T18:00:00.000Z' },
      { id: 'week-2', starts_at: '2026-09-26T17:00:00.000Z', ends_at: '2026-09-26T18:00:00.000Z' },
      { id: 'last-week', starts_at: '2026-09-12T17:00:00.000Z', ends_at: '2026-09-12T18:00:00.000Z' },
    ]
    expect(nextOccurrencePlan(active, rows, now)).toEqual({
      kind: 'occurrence',
      id: 'week-2',
      startsAt: '2026-09-26T17:00:00.000Z',
    })
  })

  it('keeps a meetup that is HAPPENING RIGHT NOW as the next one (upcoming = not ended)', () => {
    const rows: OccurrenceLike[] = [
      { id: 'live', starts_at: '2026-09-19T17:30:00.000Z', ends_at: '2026-09-19T18:30:00.000Z' },
      { id: 'week-2', starts_at: '2026-09-26T17:00:00.000Z', ends_at: '2026-09-26T18:00:00.000Z' },
    ]
    expect(nextOccurrencePlan(active, rows, now)).toEqual({
      kind: 'occurrence',
      id: 'live',
      startsAt: '2026-09-19T17:30:00.000Z',
    })
  })

  it('skips an occurrence that has already ended', () => {
    const rows: OccurrenceLike[] = [
      { id: 'ended', starts_at: '2026-09-19T15:00:00.000Z', ends_at: '2026-09-19T16:00:00.000Z' },
    ]
    expect(nextOccurrencePlan(active, rows, now)).toEqual({ kind: 'none', reason: 'no-more' })
  })

  it('falls back to starts_at when a row carries no end', () => {
    expect(
      nextOccurrencePlan(active, [{ id: 'no-end', starts_at: '2026-09-20T17:00:00.000Z' }], now),
    ).toEqual({ kind: 'occurrence', id: 'no-end', startsAt: '2026-09-20T17:00:00.000Z' })
    expect(
      nextOccurrencePlan(active, [{ id: 'no-end-past', starts_at: '2026-09-01T17:00:00.000Z' }], now),
    ).toEqual({ kind: 'none', reason: 'no-more' })
  })

  it('says STOPPED when the host turned repeating off and no week is posted ahead', () => {
    expect(nextOccurrencePlan(stopped, [], now)).toEqual({ kind: 'none', reason: 'stopped' })
    expect(
      nextOccurrencePlan(
        stopped,
        [{ id: 'last-week', starts_at: '2026-09-12T17:00:00.000Z', ends_at: '2026-09-12T18:00:00.000Z' }],
        now,
      ),
    ).toEqual({ kind: 'none', reason: 'stopped' })
  })

  it('says NO-MORE when repeating is on but no future week was materialized', () => {
    expect(nextOccurrencePlan(active, [], now)).toEqual({ kind: 'none', reason: 'no-more' })
  })

  it('does NOT depend on the active flag when a future occurrence exists (a stopped series’ posted weeks still count)', () => {
    expect(
      nextOccurrencePlan(
        stopped,
        [{ id: 'week-2', starts_at: '2026-09-26T17:00:00.000Z', ends_at: '2026-09-26T18:00:00.000Z' }],
        now,
      ),
    ).toEqual({ kind: 'occurrence', id: 'week-2', startsAt: '2026-09-26T17:00:00.000Z' })
  })

  it('degrades to NO-MORE for an unparseable now (never throws in a render)', () => {
    expect(nextOccurrencePlan(active, [{ id: 'week-2', starts_at: '2026-09-26T17:00:00.000Z' }], 'nope')).toEqual(
      { kind: 'none', reason: 'no-more' },
    )
  })
})

describe('occurrenceWhenLabel (the confirmation line’s day · time)', () => {
  it('reads one occurrence back as a locale-independent day and a local time', () => {
    const iso = new Date(2026, 8, 26, 10, 0).toISOString()
    expect(occurrenceWhenLabel(iso, new Date(2026, 8, 19, 12, 0).toISOString())).toBe(
      'Sat, Sep 26 · 10:00 AM',
    )
  })

  it('says Today for an occurrence later today', () => {
    const iso = new Date(2026, 8, 19, 17, 30).toISOString()
    expect(occurrenceWhenLabel(iso, new Date(2026, 8, 19, 12, 0).toISOString())).toBe(
      'Today · 5:30 PM',
    )
  })

  it('is empty for an unparseable instant (the caller omits the line)', () => {
    expect(occurrenceWhenLabel('not a date', new Date().toISOString())).toBe('')
  })
})

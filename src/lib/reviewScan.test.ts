/**
 * The review-scan decision — the pure rules in
 * `supabase/functions/_shared/reviewScan.ts`, imported through the app seam.
 *
 * Why this spec exists at all: the real scan runs in a Deno Edge Function
 * against live Postgres and cannot be unit-tested, so the one decision that must
 * be right ("does this finished drop-in earn a review prompt?") was extracted
 * into the pure module above. This file pins it.
 *
 * The tests are written so each of the five rejection rules can DIE
 * individually: `plan.md` Slice 2 criterion 7 requires that flipping any one of
 * them to always-true makes at least one named test fail. Each test below
 * therefore states the rule it kills, and every negative assertion is paired
 * with a positive control at the same `ends_at`/`now` so the test proves the
 * named fact is what decided it — not some neighbouring rule.
 *
 * `now` is always passed in. Nothing here reads the clock, which is the whole
 * point: the 24-hour boundary is only assertable because the module takes the
 * instant as an argument.
 */
import { describe, expect, it } from 'vitest'
import {
  REVIEW_PROMPT_WINDOW_HOURS,
  isReviewPromptCandidate,
  reviewPromptRow,
  type ReviewPromptFacts,
} from './reviewScan'

const HOUR = 60 * 60 * 1000
const PLACE_ID = '3f1a9d2e-6c4b-4a17-9f2e-8b7c5d4e3a10'
const PLAYDATE_ID = '8c2b7e4f-1d3a-4b6c-9e0f-2a5d8c1b4e77'
const PROFILE_ID = 'b4d6f8a2-0c1e-4d3b-8a7f-6e5d4c3b2a19'

/** A fixed instant: every test computes its `ends_at` relative to this. */
const NOW = new Date('2026-09-26T18:00:00.000Z')
const NOW_MS = NOW.getTime()

/** An ISO instant `ms` milliseconds before NOW (positive ms = in the past). */
function ago(ms: number): string {
  return new Date(NOW_MS - ms).toISOString()
}

/** The known-good shape: finished 2 hours ago, still on, at a real place. */
function candidateFacts(overrides: Partial<ReviewPromptFacts> = {}): ReviewPromptFacts {
  return { status: 'on', endsAt: ago(2 * HOUR), placeId: PLACE_ID, ...overrides }
}

describe('REVIEW_PROMPT_WINDOW_HOURS', () => {
  it('is 24 — the window is a rule, so it is exported from the pure module both lanes import', () => {
    // Pinned because `send-push` (slice 3) imports this exact number for its
    // query bound while the test lane uses it for the boundary below. A change
    // here is a product decision, and this test is where it gets noticed.
    expect(REVIEW_PROMPT_WINDOW_HOURS).toBe(24)
  })
})

describe('isReviewPromptCandidate', () => {
  it('criterion 1: a drop-in that ended 2 hours ago, still on, with a place, IS a candidate', () => {
    expect(isReviewPromptCandidate(candidateFacts(), NOW)).toBe(true)
  })

  it('criterion 2 (rule a): a cancelled or ended drop-in is NEVER a candidate, at any ends_at', () => {
    const endsAts = [
      ago(2 * HOUR), // the shape that IS a candidate while status is 'on'
      new Date(NOW_MS + 2 * HOUR).toISOString(), // future
      ago(100 * HOUR), // ancient
      null,
    ]
    for (const status of ['cancelled', 'ended']) {
      for (const endsAt of endsAts) {
        expect(
          isReviewPromptCandidate({ status, endsAt, placeId: PLACE_ID }, NOW),
          `status=${status} endsAt=${JSON.stringify(endsAt)}`,
        ).toBe(false)
      }
    }
    // The control that makes this test about the STATUS: the identical ends_at
    // with status 'on' is a candidate, so a flip that drops rule (a) turns the
    // first row above green and this test fails on it.
    expect(isReviewPromptCandidate({ status: 'on', endsAt: ago(2 * HOUR), placeId: PLACE_ID }, NOW)).toBe(
      true,
    )
    // Anything that is not exactly 'on' is also rejected — an unknown status is
    // never promoted, the conservative direction.
    expect(isReviewPromptCandidate(candidateFacts({ status: 'draft' }), NOW)).toBe(false)
    expect(isReviewPromptCandidate(candidateFacts({ status: null }), NOW)).toBe(false)
  })

  it('criterion 3 (rule d): an ends_at in the future is NOT a candidate', () => {
    expect(isReviewPromptCandidate(candidateFacts({ endsAt: new Date(NOW_MS + 1 * 60 * 1000).toISOString() }), NOW)).toBe(
      false,
    )
    expect(isReviewPromptCandidate(candidateFacts({ endsAt: new Date(NOW_MS + 2 * HOUR).toISOString() }), NOW)).toBe(
      false,
    )
    expect(isReviewPromptCandidate(candidateFacts({ endsAt: new Date(NOW_MS + 30 * 24 * HOUR).toISOString() }), NOW)).toBe(
      false,
    )
    // The boundary: exactly now is not yet over, so it is not a candidate…
    expect(isReviewPromptCandidate(candidateFacts({ endsAt: new Date(NOW_MS).toISOString() }), NOW)).toBe(false)
    // …while one millisecond earlier IS one, which is what makes the comparison
    // strict rather than merely "different".
    expect(isReviewPromptCandidate(candidateFacts({ endsAt: new Date(NOW_MS - 1).toISOString() }), NOW)).toBe(true)
  })

  it('criterion 4 (rule e): an ends_at older than the window is NOT a candidate, and the edge is inclusive', () => {
    expect(isReviewPromptCandidate(candidateFacts({ endsAt: ago(25 * HOUR) }), NOW)).toBe(false)
    expect(isReviewPromptCandidate(candidateFacts({ endsAt: ago(2 * 24 * HOUR) }), NOW)).toBe(false)
    expect(isReviewPromptCandidate(candidateFacts({ endsAt: ago(30 * 24 * HOUR) }), NOW)).toBe(false)
    // Exactly the window is still inside it; one millisecond more is not. This
    // pair is what proves the bound is REVIEW_PROMPT_WINDOW_HOURS and not an
    // off-by-one neighbour.
    expect(isReviewPromptCandidate(candidateFacts({ endsAt: ago(REVIEW_PROMPT_WINDOW_HOURS * HOUR) }), NOW)).toBe(true)
    expect(isReviewPromptCandidate(candidateFacts({ endsAt: ago(REVIEW_PROMPT_WINDOW_HOURS * HOUR + 1) }), NOW)).toBe(
      false,
    )
    expect(isReviewPromptCandidate(candidateFacts({ endsAt: ago(23 * HOUR) }), NOW)).toBe(true)
  })

  it('criterion 5 (rule b): a null, undefined, empty or whitespace-only place_id is NOT a candidate', () => {
    for (const placeId of [null, undefined, '', '   ', '\t\n'] as const) {
      expect(
        isReviewPromptCandidate(candidateFacts({ placeId }), NOW),
        `placeId=${JSON.stringify(placeId)}`,
      ).toBe(false)
    }
    // A padded id is the SAME id trimmed — the rule is blankness, not length.
    expect(isReviewPromptCandidate(candidateFacts({ placeId: `  ${PLACE_ID}  ` }), NOW)).toBe(true)
  })

  it('rule c: a missing, empty or unparseable ends_at is NOT a candidate (it is not "long ago")', () => {
    for (const endsAt of [null, undefined, '', '   ', 'not-a-date'] as const) {
      expect(
        isReviewPromptCandidate(candidateFacts({ endsAt }), NOW),
        `endsAt=${JSON.stringify(endsAt)}`,
      ).toBe(false)
    }
  })

  it('reads `now` from its argument, not from the clock: the same drop-in ages out as now advances', () => {
    const facts = candidateFacts({ endsAt: ago(2 * HOUR) })
    expect(isReviewPromptCandidate(facts, NOW)).toBe(true)
    // 23 hours later the drop-in ended 25 hours ago — outside the window. Only a
    // module that honours its `now` argument can answer both ways for the SAME
    // facts, which is what makes the 24-hour rule testable at all.
    const later = new Date(NOW_MS + 23 * HOUR)
    expect(isReviewPromptCandidate(facts, later)).toBe(false)
  })

  it('is a pure function: it never mutates the facts it is given', () => {
    const facts = candidateFacts()
    const before = { ...facts }
    isReviewPromptCandidate(facts, NOW)
    expect(facts).toEqual(before)
  })
})

describe('reviewPromptRow', () => {
  it('criterion 6: produces kind review_due, the pinned title/body, and the place details url', () => {
    const row = reviewPromptRow({
      profileId: PROFILE_ID,
      playdateId: PLAYDATE_ID,
      placeId: PLACE_ID,
      title: 'Green Lake',
    })
    expect(row).toEqual({
      profile_id: PROFILE_ID,
      kind: 'review_due',
      playdate_id: PLAYDATE_ID,
      title: 'How was "Green Lake"?',
      body: 'You said you were going — rate the place.',
      url: `/place/${PLACE_ID}/details`,
    })
  })

  it('carries ONLY insert columns — no extra key can reach notification_log', () => {
    // PostgREST rejects an insert with an unknown column, so the row's key set
    // is part of the contract, not a detail.
    expect(
      Object.keys(
        reviewPromptRow({ profileId: PROFILE_ID, playdateId: PLAYDATE_ID, placeId: PLACE_ID, title: 'Park' }),
      ).sort(),
    ).toEqual(['body', 'kind', 'playdate_id', 'profile_id', 'title', 'url'])
  })

  it('falls back on a blank title through the shared copy rule, never rendering "null"', () => {
    for (const title of [null, '', '   '] as const) {
      const row = reviewPromptRow({ profileId: PROFILE_ID, playdateId: PLAYDATE_ID, placeId: PLACE_ID, title })
      expect(row.title, `title=${JSON.stringify(title)}`).toBe('How was "your drop-in"?')
    }
  })

  it('never spells the url itself: a blank place_id falls back to the drop-in route, not /place//details', () => {
    // The mapper does not re-run the candidate predicate (one rule, one place) —
    // it delegates the fallback to buildNotificationPayload, which is where
    // reviewPromptUrl stays the single source of the place url.
    for (const placeId of [null, undefined, ''] as const) {
      const row = reviewPromptRow({ profileId: PROFILE_ID, playdateId: PLAYDATE_ID, placeId, title: 'Green Lake' })
      expect(row.url, `placeId=${JSON.stringify(placeId)}`).toBe(`/playdate/${PLAYDATE_ID}`)
    }
  })

  it('is a pure function: two calls with the same input are deep-equal and independent', () => {
    const input = { profileId: PROFILE_ID, playdateId: PLAYDATE_ID, placeId: PLACE_ID, title: 'Green Lake' }
    const first = reviewPromptRow(input)
    const second = reviewPromptRow(input)
    expect(first).toEqual(second)
    expect(first).not.toBe(second)
    expect(input).toEqual({
      profileId: PROFILE_ID,
      playdateId: PLAYDATE_ID,
      placeId: PLACE_ID,
      title: 'Green Lake',
    })
  })

  it('agrees with the predicate: the row a candidate maps to is the review_due row', () => {
    const facts = candidateFacts()
    expect(isReviewPromptCandidate(facts, NOW)).toBe(true)
    const row = reviewPromptRow({
      profileId: PROFILE_ID,
      playdateId: PLAYDATE_ID,
      placeId: facts.placeId,
      title: 'Green Lake',
    })
    expect(row.kind).toBe('review_due')
    expect(row.url).toBe(`/place/${PLACE_ID}/details`)
  })
})

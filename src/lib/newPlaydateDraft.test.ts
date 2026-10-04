/**
 * r3-9 — the /new post-form draft (option B): the storage seam's unit tests.
 *
 * These are the slice's PRIMARY proof (the spec's test strategy): pure
 * functions with injected storage, no DOM. They pin the round-trip, the
 * per-user keying, the version/shape rejection of a corrupt draft, the clear,
 * the "no draft ⇒ no-op" path, and the precedence rule a prefill wins and
 * leaves the draft untouched.
 */
import { describe, expect, it } from 'vitest'
import {
  NEW_PLAYDATE_DRAFT_VERSION,
  NEW_PLAYDATE_DRAFT_KEY_PREFIX,
  clearDraft,
  decideDraftRestore,
  newPlaydateDraftKey,
  readDraft,
  writeDraft,
  type DraftStorage,
  type NewPlaydateDraft,
} from './newPlaydateDraft'
import type { PlaydateFormValues } from './feed'

/**
 * The injected storage: a `Map` behind the `DraftStorage` surface — the same
 * three calls `window.sessionStorage` makes, minus the DOM.
 */
class MemoryStorage implements DraftStorage {
  private map = new Map<string, string>()
  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value)
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
  rawEntries(): Array<[string, string]> {
    return [...this.map.entries()]
  }
}

const USER_A = 'user-a'
const USER_B = 'user-b'

/** A meaningful draft — every field a parent can set (the acceptance list). */
function makeDraft(overrides: Partial<NewPlaydateDraft> = {}): NewPlaydateDraft {
  const values: PlaydateFormValues = {
    title: 'Drop-in at E2E park',
    place: 'E2E quick post lot',
    neighborhoodId: '',
    startDate: '2026-10-04',
    startMinutes: 570,
    durationMinutes: 90,
    ageHint: 'best for 2-5',
    details: 'Bring water; parking on 4th.',
  }
  return {
    values,
    placeId: null,
    address: '1234 E2E Ave NE',
    kidIds: ['kid-1', 'kid-2'],
    ...overrides,
  }
}

describe('newPlaydateDraftKey', () => {
  it('scopes the key to the user', () => {
    expect(newPlaydateDraftKey(USER_A)).toBe(`${NEW_PLAYDATE_DRAFT_KEY_PREFIX}:${USER_A}`)
    expect(newPlaydateDraftKey(USER_B)).toBe(`${NEW_PLAYDATE_DRAFT_KEY_PREFIX}:${USER_B}`)
    expect(newPlaydateDraftKey(USER_A)).not.toBe(newPlaydateDraftKey(USER_B))
  })

  it('is a sessionStorage-style key, not a localStorage one (the spec: never localStorage)', () => {
    // The module never names a storage at all (it is injected); what it owns
    // is the key shape, which must stay namespaced per user.
    expect(newPlaydateDraftKey(USER_A)).toContain(USER_A)
  })
})

describe('readDraft / writeDraft round-trip', () => {
  it('round-trips a meaningful draft exactly (no serializer drift)', () => {
    const storage = new MemoryStorage()
    const draft = makeDraft()
    writeDraft(storage, USER_A, draft)
    expect(readDraft(storage, USER_A)).toEqual(draft)
  })

  it('round-trips a free-text draft (placeId null) and a picked one', () => {
    const storage = new MemoryStorage()
    writeDraft(storage, USER_A, makeDraft({ placeId: null }))
    expect(readDraft(storage, USER_A)?.placeId).toBe(null)
    writeDraft(storage, USER_A, makeDraft({ placeId: 'place-9' }))
    expect(readDraft(storage, USER_A)?.placeId).toBe('place-9')
  })

  it('stores the versioned envelope, not a bare draft', () => {
    const storage = new MemoryStorage()
    writeDraft(storage, USER_A, makeDraft())
    const [key, raw] = storage.rawEntries()[0]
    expect(key).toBe(newPlaydateDraftKey(USER_A))
    const parsed = JSON.parse(raw) as { version: number }
    expect(parsed.version).toBe(NEW_PLAYDATE_DRAFT_VERSION)
  })
})

describe('per-user keying (another account in the same session reads nothing)', () => {
  it('a draft written for one user is invisible to another', () => {
    const storage = new MemoryStorage()
    writeDraft(storage, USER_A, makeDraft())
    expect(readDraft(storage, USER_B)).toBeNull()
  })

  it("clearing one user leaves the other's draft intact", () => {
    const storage = new MemoryStorage()
    writeDraft(storage, USER_A, makeDraft())
    writeDraft(storage, USER_B, makeDraft({ values: { ...makeDraft().values, title: 'B\'s draft' } }))
    clearDraft(storage, USER_A)
    expect(readDraft(storage, USER_A)).toBeNull()
    expect(readDraft(storage, USER_B)?.values.title).toBe('B\'s draft')
  })
})

describe('corrupt / foreign payloads reject to null (never a crash, never garbage)', () => {
  it('rejects unparseable JSON', () => {
    const storage = new MemoryStorage()
    storage.setItem(newPlaydateDraftKey(USER_A), '{ not json')
    expect(readDraft(storage, USER_A)).toBeNull()
  })

  it('rejects JSON that is not an object', () => {
    const storage = new MemoryStorage()
    storage.setItem(newPlaydateDraftKey(USER_A), JSON.stringify('a string'))
    expect(readDraft(storage, USER_A)).toBeNull()
  })

  it('rejects an unknown version (a shape change the reader does not know)', () => {
    const storage = new MemoryStorage()
    const draft = makeDraft()
    storage.setItem(
      newPlaydateDraftKey(USER_A),
      JSON.stringify({ version: NEW_PLAYDATE_DRAFT_VERSION + 1, draft }),
    )
    expect(readDraft(storage, USER_A)).toBeNull()
  })

  it('rejects a payload missing a values key', () => {
    const storage = new MemoryStorage()
    const draft = makeDraft()
    const valuesWithoutStartMinutes = {
      title: draft.values.title,
      place: draft.values.place,
      neighborhoodId: draft.values.neighborhoodId,
      startDate: draft.values.startDate,
      durationMinutes: draft.values.durationMinutes,
      ageHint: draft.values.ageHint,
      details: draft.values.details,
    } as PlaydateFormValues
    storage.setItem(
      newPlaydateDraftKey(USER_A),
      JSON.stringify({
        version: NEW_PLAYDATE_DRAFT_VERSION,
        draft: { ...draft, values: valuesWithoutStartMinutes },
      }),
    )
    expect(readDraft(storage, USER_A)).toBeNull()
  })

  it('rejects wrong-typed values (a string where a number belongs)', () => {
    const storage = new MemoryStorage()
    const draft = makeDraft()
    storage.setItem(
      newPlaydateDraftKey(USER_A),
      JSON.stringify({
        version: NEW_PLAYDATE_DRAFT_VERSION,
        draft: { ...draft, values: { ...draft.values, startMinutes: '9:30' } },
      }),
    )
    expect(readDraft(storage, USER_A)).toBeNull()
  })

  it('rejects a placeId that is neither a string nor null', () => {
    const storage = new MemoryStorage()
    const draft = makeDraft()
    storage.setItem(
      newPlaydateDraftKey(USER_A),
      JSON.stringify({
        version: NEW_PLAYDATE_DRAFT_VERSION,
        draft: { ...draft, placeId: 42 },
      }),
    )
    expect(readDraft(storage, USER_A)).toBeNull()
  })

  it('rejects kidIds that is not a string array', () => {
    const storage = new MemoryStorage()
    const draft = makeDraft()
    storage.setItem(
      newPlaydateDraftKey(USER_A),
      JSON.stringify({
        version: NEW_PLAYDATE_DRAFT_VERSION,
        draft: { ...draft, kidIds: ['kid-1', 7] },
      }),
    )
    expect(readDraft(storage, USER_A)).toBeNull()
  })
})

describe('clearDraft and the "no draft ⇒ no-op" path', () => {
  it('clears a stored draft (a later read is the no-draft path)', () => {
    const storage = new MemoryStorage()
    writeDraft(storage, USER_A, makeDraft())
    clearDraft(storage, USER_A)
    expect(readDraft(storage, USER_A)).toBeNull()
  })

  it('clearing a key with no draft is a no-op (no throw)', () => {
    const storage = new MemoryStorage()
    expect(() => clearDraft(storage, USER_A)).not.toThrow()
    expect(readDraft(storage, USER_A)).toBeNull()
  })

  it('reading a key with no draft is null', () => {
    const storage = new MemoryStorage()
    expect(readDraft(storage, USER_A)).toBeNull()
  })
})

describe('decideDraftRestore — the precedence rule (decided, pinned here)', () => {
  it('no prefill + a draft → restore (the round trip)', () => {
    const draft = makeDraft()
    expect(decideDraftRestore({ draft, hasPlacePrefill: false, hasDuplicatePrefill: false })).toEqual({
      kind: 'restore',
      draft,
    })
  })

  it('a fresh place prefill WINS and the draft is left untouched', () => {
    const draft = makeDraft()
    const decision = decideDraftRestore({ draft, hasPlacePrefill: true, hasDuplicatePrefill: false })
    // 'prefill', not 'restore' — and NOT a clear: the stored draft must
    // survive a prefilled visit (destroying it would lose the parent's work).
    expect(decision).toEqual({ kind: 'prefill' })
  })

  it('a duplicate prefill wins too (fresh intent; the draft is untouched)', () => {
    const draft = makeDraft()
    const decision = decideDraftRestore({ draft, hasPlacePrefill: false, hasDuplicatePrefill: true })
    expect(decision).toEqual({ kind: 'prefill' })
  })

  it('no prefill, no draft → fresh (the ordinary first visit, unchanged)', () => {
    expect(decideDraftRestore({ draft: null, hasPlacePrefill: false, hasDuplicatePrefill: false })).toEqual({
      kind: 'fresh',
    })
  })
})

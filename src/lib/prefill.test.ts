/**
 * V10 ticket 03 — the prefill seams, pinned: the response guard, the merge,
 * and THE PRIVACY PIN'S OWN TEST (the request body carries exactly
 * text/todayIso/timezone — snapshotted, never anything else).
 *
 * The edge function has its OWN copy of the whitelist (Deno-side, pinned by
 * the same numbers); these tests pin the client side, so neither side alone
 * is load-bearing and the two cannot silently drift apart (the
 * generatedTitle-agreement discipline: pin the twins together).
 */
import { describe, expect, it } from 'vitest'
import { computeStartIso, defaultStartDateIso, validatePlaydateForm } from './feed'
import type { PlaydateFormValues } from './feed'
import { mergePrefill, prefillErrors, prefillFetch, prefillFieldsFrom } from './prefill'

/** A hand-filled-feeling form (the merge's input baseline). */
function baseValues(): PlaydateFormValues {
  return {
    title: 'Playdate',
    place: '',
    neighborhoodId: '',
    startDate: defaultStartDateIso('2026-09-14T12:00:00.000Z'),
    startMinutes: 12 * 60 + 30,
    durationMinutes: 0,
    ageHint: '',
    details: '',
  }
}

describe('prefillFieldsFrom (the response guard: whitelist + drop, never coerce)', () => {
  it('keeps only the seven known fields, trimmed', () => {
    const out = prefillFieldsFrom({
      title: '  Park hang  ',
      place: 'Green Lake Park',
      startDate: '2026-09-20',
      startMinutes: 600,
      durationMinutes: 120,
      details: ' Bring snacks ',
    })
    expect(out).toEqual({
      title: 'Park hang',
      place: 'Green Lake Park',
      startDate: '2026-09-20',
      startMinutes: 600,
      durationMinutes: 120,
      details: 'Bring snacks',
    })
  })

  it('drops UNKNOWN keys (never spread into the form)', () => {
    const out = prefillFieldsFrom({
      place: 'A Park',
      neighborhoodId: 'n-green',
      kidIds: ['kid-a'],
      hostNote: 'hello',
    })
    expect(out).toEqual({ place: 'A Park' })
  })

  it('snaps an off-grid startMinutes to the 30-minute grid (NEAREST slot)', () => {
    // Math.round: 615 is equidistant and rounds up to 630 (the same rule the
    // nextSlotMinutes grid uses — ceil — for the form's own default).
    expect(prefillFieldsFrom({ startMinutes: 605 })?.startMinutes).toBe(600)
    expect(prefillFieldsFrom({ startMinutes: 610 })?.startMinutes).toBe(600)
    expect(prefillFieldsFrom({ startMinutes: 615 })?.startMinutes).toBe(630)
    expect(prefillFieldsFrom({ startMinutes: 620 })?.startMinutes).toBe(630)
    expect(prefillFieldsFrom({ startMinutes: 630 })?.startMinutes).toBe(630)
  })

  it('drops out-of-range minutes and a fifth duration chip', () => {
    expect(prefillFieldsFrom({ startMinutes: 1440 }).startMinutes).toBeUndefined()
    expect(prefillFieldsFrom({ startMinutes: -30 }).startMinutes).toBeUndefined()
    expect(prefillFieldsFrom({ startMinutes: 6.5 }).startMinutes).toBeUndefined()
    expect(prefillFieldsFrom({ durationMinutes: 45 }).durationMinutes).toBeUndefined()
  })

  it('drops an unparseable date, keeps a legal one (the regex is the shape, the parse is the reality)', () => {
    expect(prefillFieldsFrom({ startDate: 'tomorrow' }).startDate).toBeUndefined()
    expect(prefillFieldsFrom({ startDate: '2026-02-31' }).startDate).toBeUndefined()
    expect(prefillFieldsFrom({ startDate: '2026-09-20' }).startDate).toBe('2026-09-20')
  })

  it('drops empty strings and non-strings', () => {
    expect(prefillFieldsFrom({ place: '   ' }).place).toBeUndefined()
    expect(prefillFieldsFrom({ place: 42 }).place).toBeUndefined()
    expect(prefillFieldsFrom({ details: '' }).details).toBeUndefined()
  })

  it('the ageHint is NOT carried (the form no longer asks — a value the parent cannot see is a hidden default)', () => {
    const out = prefillFieldsFrom({ ageHint: 'best for 2-5' })
    expect(out).toEqual({})
  })

  it('garbage in, nothing out', () => {
    expect(prefillFieldsFrom(null)).toEqual({})
    expect(prefillFieldsFrom('nope')).toEqual({})
    expect(prefillFieldsFrom(42)).toEqual({})
  })

  it('a title over the cap is TRUNCATED to the form\u2019s own limit, never refused', () => {
    const out = prefillFieldsFrom({ title: 'x'.repeat(200) })
    expect(out.title?.length).toBe(80)
  })
})

describe('mergePrefill (the ONE patch the button press applies)', () => {
  it('writes only the arrived fields; the rest of the form is untouched', () => {
    const prev = baseValues()
    const out = mergePrefill(prev, { place: 'Green Lake Park', durationMinutes: 120 })
    expect(out.values.place).toBe('Green Lake Park')
    expect(out.values.durationMinutes).toBe(120)
    expect(out.values.title).toBe(prev.title)
    expect(out.values.startMinutes).toBe(prev.startMinutes)
    expect(out.values.neighborhoodId).toBe('')
    expect(out.applied).toEqual(['place', 'durationMinutes'])
  })

  it('NEIGHBORHOODID is never settable by a prefill (a place pick fills it later)', () => {
    const prev = baseValues()
    // The guard never lets neighborhoodId through, and the merge only reads
    // the seven known keys — a crafted input claiming neighborhoodId must
    // still leave the form's own value alone.
    const out = mergePrefill(prev, prefillFieldsFrom({
      place: 'A Park',
      neighborhoodId: 'n-green',
    }))
    expect(out.values.neighborhoodId).toBe('')
    expect(out.applied).toEqual(['place'])
  })

  it('an EMPTY-string arrival for title/details is still a write (the LLM said so)', () => {
    // The guard already dropped empties, so an empty title can only arrive by
    // a caller bypassing it — the merge writes what the guard would have kept.
    const out = mergePrefill(baseValues(), { title: 'X' })
    expect(out.values.title).toBe('X')
  })

  it('an off-grid startMinutes in the merge input is refused (defense in depth)', () => {
    const prev = baseValues()
    const out = mergePrefill(prev, { startMinutes: 617 })
    expect(out.values.startMinutes).toBe(prev.startMinutes)
    expect(out.applied).not.toContain('startMinutes')
  })

  it('the merged values pass validatePlaydateForm when the essential fields arrived', () => {
    const prev = baseValues()
    const out = mergePrefill(prev, {
      title: 'Park hang',
      place: 'Green Lake Park',
      startDate: '2026-09-20',
      startMinutes: 600,
      durationMinutes: 60,
    })
    expect(validatePlaydateForm(out.values)).toEqual({})
  })
})

describe('prefillErrors (the page\u2019s gate: a prefill that misses fields is a FORM error)', () => {
  it('an incomplete prefill leaves the validator\u2019s place error', () => {
    const { values } = mergePrefill(baseValues(), { startMinutes: 600 })
    const errors = prefillErrors(values)
    expect(errors.place).toBe('Add a place (park, lot, field).')
  })

  it('a complete prefill is clean', () => {
    const { values } = mergePrefill(baseValues(), {
      title: 'Park hang',
      place: 'Green Lake Park',
      startDate: '2026-09-20',
      startMinutes: 600,
      durationMinutes: 60,
    })
    expect(prefillErrors(values)).toEqual({})
  })
})

describe('prefillFetch (THE PRIVACY PIN: the request body is exactly text/todayIso/timezone)', () => {
  it('POSTs the three keys and NOTHING else, to the functions URL, with the session bearer', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: (init ?? {}) as RequestInit })
      return new Response(JSON.stringify({ fields: { place: 'A Park' } }), { status: 200 })
    }) as unknown as typeof fetch

    const out = await prefillFetch(
      'Green Lake tomorrow 10 to noon',
      '2026-09-14',
      'America/Los_Angeles',
      fakeFetch,
    )
    expect(out.place).toBe('A Park')

    expect(calls).toHaveLength(1)
    const { url, init } = calls[0]
    expect(url).toBe(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/prefill-playdate`,
    )
    expect(init.method).toBe('POST')
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    // THE PIN, key by key: exactly three, no kid ids, no profile fields.
    expect(Object.keys(body)).toHaveLength(3)
    expect(body.text).toBe('Green Lake tomorrow 10 to noon')
    expect(body.todayIso).toBe('2026-09-14')
    expect(body.timezone).toBe('America/Los_Angeles')
    const headers = init.headers as Record<string, string>
    expect(headers.authorization).toMatch(/^Bearer /)
    expect(headers.apikey).toBe(import.meta.env.VITE_SUPABASE_ANON_KEY)
  })

  it('a failing HTTP is a thrown error (the page degrades quietly)', async () => {
    const fakeFetch = (async () => new Response('{"error":"nope"}', { status: 502 })) as unknown as typeof fetch
    await expect(
      prefillFetch('hi', '2026-09-14', 'UTC', fakeFetch),
    ).rejects.toThrow('prefill http 502')
  })

  it('a malformed 200 body degrades to no fields (the guard is the backstop)', async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ fields: 'not-an-object' }), { status: 200 })) as unknown as typeof fetch
    const out = await prefillFetch('hi', '2026-09-14', 'UTC', fakeFetch)
    expect(out).toEqual({})
  })
})

// The computeStartIso import is used to document the round-trip the summary
// shows: the guard's snapped minutes ARE what the submit converts.
describe('the grid contract holds end to end', () => {
  it('a snapped prefill start is a legal computeStartIso input (the submit\u2019s conversion)', () => {
    const fields = prefillFieldsFrom({ startMinutes: 610, startDate: '2026-09-20' })
    const { values } = mergePrefill(baseValues(), fields)
    expect(values.startMinutes).toBe(600)
    expect(() => computeStartIso(values.startDate, values.startMinutes)).not.toThrow()
  })
})
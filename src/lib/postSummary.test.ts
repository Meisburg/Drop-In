/**
 * V9 ticket 03 — the /new summary's two pure seams, pinned string by string.
 *
 * The ticket's AC is "the summary reads back exactly what will be posted
 * before it is posted", and that is only checkable if the read-back's strings
 * are pinned HERE, per line, rather than asserted loosely through the DOM. The
 * e2e (post-fast.e2e.ts) then asserts that the rendered line equals
 * `postSummaryLines(values)` and that what lands on the feed agrees with it.
 */
import { describe, expect, it } from 'vitest'
import { computeEndIso, computeStartIso, mapsHref, TITLE_MAX_LENGTH } from './feed'
import type { PlaydateFormValues } from './feed'
import { weekdayFromDateIso } from './series'
import {
  addressAfterPlaceTextEdit,
  GENERATED_TITLE_FALLBACK,
  GENERATED_TITLE_PREFIX,
  generatedTitle,
  postSummaryLines,
  SUMMARY_NO_DAY,
  SUMMARY_NO_DURATION,
  SUMMARY_NO_PLACE,
  SUMMARY_REPEATS_SUFFIX,
} from './postSummary'

/** The form's values with everything answered: Sat, Aug 29 2026, 3:30 PM, 1h. */
const answered: PlaydateFormValues = {
  title: 'Playdate at Green Lake Park',
  place: 'Green Lake Park',
  neighborhoodId: '',
  startDate: '2026-08-29',
  startMinutes: 15 * 60 + 30, // 3:30 PM
  durationMinutes: 60,
  ageHint: '',
  details: '',
}

describe('generatedTitle (the title /new writes when the parent does not)', () => {
  it('is "Drop-in at <place>" (renamed from "Playdate at …" in V23)', () => {
    expect(generatedTitle('Green Lake Park')).toBe('Drop-in at Green Lake Park')
  })

  it('trims the place, and the prefix is exactly one space + the name', () => {
    expect(generatedTitle('   Green Lake Park   ')).toBe('Drop-in at Green Lake Park')
    expect(generatedTitle('Green Lake Park')).toBe(GENERATED_TITLE_PREFIX + 'Green Lake Park')
  })

  it('is NEVER empty — a place-less form still gets a title', () => {
    expect(generatedTitle('')).toBe(GENERATED_TITLE_FALLBACK)
    expect(generatedTitle('   ')).toBe(GENERATED_TITLE_FALLBACK)
    expect(generatedTitle('')).not.toBe('')
  })

  it('drops the `@` picker alias (a gesture, not a place name)', () => {
    // The alias's most natural use — type `@`, pick from the list — must not
    // seed "Playdate at @" (the V9 ticket 01 finding: a seed that is never
    // overwritten posted it).
    expect(generatedTitle('@')).toBe(GENERATED_TITLE_FALLBACK)
    expect(generatedTitle('@Green Lake Park')).toBe('Drop-in at Green Lake Park')
    expect(generatedTitle('  @  Green Lake Park  ')).toBe('Drop-in at Green Lake Park')
  })

  it('caps at TITLE_MAX_LENGTH, so the generated value is always valid', () => {
    const long = generatedTitle('P'.repeat(200))
    expect(long.length).toBe(TITLE_MAX_LENGTH)
    expect(long.startsWith(GENERATED_TITLE_PREFIX)).toBe(true)
  })
})

describe('postSummaryLines (the read-back, pinned per line)', () => {
  it('reads back the day + duration, the window and the place — in that order', () => {
    expect(postSummaryLines(answered)).toEqual([
      'Sat, Aug 29 · 1h', // the day the parent is agreeing to, and how long
      '3:30 PM–4:30 PM', // start–end: computed, never typed
      'Green Lake Park', // where
    ])
  })

  it('pins the line COUNT — three lines, or four when the weekly repeat is on', () => {
    expect(postSummaryLines(answered)).toHaveLength(3)
    expect(postSummaryLines(answered, { repeatsWeekly: true })).toHaveLength(4)
    expect(postSummaryLines(answered, { repeatsWeekly: false })).toHaveLength(3)
  })

  it('says what is still unanswered, in the same slots (the first thing a parent sees)', () => {
    // A cold /new: today's date and the next slot are known, the three
    // DECISIONS are not. No dangling separators, no blank lines.
    const cold: PlaydateFormValues = {
      ...answered,
      place: '',
      startDate: '2026-08-29',
      startMinutes: 15 * 60 + 30,
      durationMinutes: 0,
    }
    expect(postSummaryLines(cold)).toEqual([
      'Sat, Aug 29 · no duration picked',
      '3:30 PM',
      'no place picked',
    ])
  })

  it('says "no day picked" when the date is empty or unparseable', () => {
    expect(postSummaryLines({ ...answered, startDate: '' })[0]).toBe(
      `${SUMMARY_NO_DAY} · 1h`,
    )
    expect(postSummaryLines({ ...answered, startDate: 'not-a-date' })[0]).toBe(
      `${SUMMARY_NO_DAY} · 1h`,
    )
  })

  it('uses the same "no …" words the constants pin (no copy drift)', () => {
    const empty = postSummaryLines({ ...answered, place: '', durationMinutes: 0, startDate: '' })
    expect(empty[0]).toContain(SUMMARY_NO_DAY)
    expect(empty[0]).toContain(SUMMARY_NO_DURATION)
    expect(empty[2]).toBe(SUMMARY_NO_PLACE)
  })

  it('names the place with its `@` alias stripped, exactly like the field it came from', () => {
    expect(postSummaryLines({ ...answered, place: '@Green Lake Park' })[2]).toBe('Green Lake Park')
    // A bare `@` is NO place — never "no place picked" replaced by a stray
    // character, and never "Playdate at @" on the title line.
    expect(postSummaryLines({ ...answered, place: '@' })[2]).toBe(SUMMARY_NO_PLACE)
  })

  it('every chip duration reads back as its own chip label', () => {
    for (const [minutes, label] of [
      [60, '1h'],
      [90, '1.5h'],
      [120, '2h'],
      [180, '3h'],
    ] as const) {
      const lines = postSummaryLines({ ...answered, durationMinutes: minutes })
      expect(lines[0]).toBe(`Sat, Aug 29 · ${label}`)
      expect(lines[1]).toContain('–')
    }
  })

  it('reads back the SAME window the submit writes (computeStartIso/computeEndIso)', () => {
    // The T4 pin: one source. The summary's window is the start + the duration
    // the insert will carry, not a re-derivation — so it cannot promise one
    // time and post another.
    const [dayLine, windowLine] = postSummaryLines(answered)
    expect(dayLine).toBe('Sat, Aug 29 · 1h')
    expect(windowLine).toBe('3:30 PM–4:30 PM')
    const start = new Date(computeStartIso(answered.startDate, answered.startMinutes))
    const end = new Date(computeEndIso(answered.startDate, answered.startMinutes, 60))
    expect((end.getTime() - start.getTime()) / 60_000).toBe(60)
    expect(start.getMinutes()).toBe(30)
    expect(start.getHours()).toBe(15)
  })

  it('marks a window that rolls past midnight "(next day)" — the "Ends …" rule', () => {
    const late = { ...answered, startMinutes: 23 * 60 + 30, durationMinutes: 180 }
    expect(postSummaryLines(late)[1]).toBe('11:30 PM–2:30 AM (next day)')
  })

  it('states the weekly repeat, in the weekday words the control derives', () => {
    // 2026-08-29 is a Saturday (the day line above pins the same fact).
    expect(postSummaryLines(answered, { repeatsWeekly: true })[3]).toBe(
      `Repeats every Saturday — ${SUMMARY_REPEATS_SUFFIX}`,
    )
    // A different date moves the words with it: 2026-08-31 is a Monday.
    expect(
      postSummaryLines({ ...answered, startDate: '2026-08-31' }, { repeatsWeekly: true })[3],
    ).toBe(`Repeats every Monday — ${SUMMARY_REPEATS_SUFFIX}`)
  })

  it('still states the repeat when no day is chosen — NO, it states nothing', () => {
    // Review cycle 1, F3. The rule this replaces asserted the OPPOSITE: it
    // expected a line reading "Repeats weekly — the weeks ahead post
    // themselves" while no start date was chosen — but the submit guards on
    // `repeatWeekly && seriesWeekday !== null` (NewPlaydatePage.handleSubmit),
    // and weekdayFromDateIso('') is null, so NO series would be created. The
    // line was a promise the submit breaks, and the disclosure's own control
    // says the opposite in exactly this state ("Pick a start date and this
    // becomes a standing weekly meetup").
    expect(postSummaryLines({ ...answered, startDate: '' }, { repeatsWeekly: true })).toHaveLength(3)
    expect(
      postSummaryLines({ ...answered, startDate: 'not-a-date' }, { repeatsWeekly: true }),
    ).toHaveLength(3)
    // The same guard the submit uses, evaluated directly: no weekday, no series.
    expect(weekdayFromDateIso('')).toBeNull()
  })

  it('states the repeat exactly when the submit WILL create the series', () => {
    // 2026-08-29 is a Saturday, so the guard passes and the line is there…
    const withDate = postSummaryLines(answered, { repeatsWeekly: true })
    expect(withDate).toHaveLength(4)
    expect(withDate[3]).toBe(`Repeats every Saturday — ${SUMMARY_REPEATS_SUFFIX}`)
    // …and the toggle alone is never enough: same values, no date, three lines.
    expect(postSummaryLines({ ...answered, startDate: '' }, { repeatsWeekly: true })).toEqual(
      postSummaryLines({ ...answered, startDate: '' }),
    )
  })
})

describe('the address in the read-back (V9 ticket 03, review cycle 1 F1)', () => {
  it('rides on the PLACE line, so the read-back names the Maps link’s two halves', () => {
    expect(postSummaryLines(answered, { address: '7201 East Green Lake Dr N' })[2]).toBe(
      'Green Lake Park · 7201 East Green Lake Dr N',
    )
    // The feed.detail page builds the Maps link from (place, address) —
    // feed.mapsHref — so both halves being read back is the point.
    expect(mapsHref('Green Lake Park', '7201 East Green Lake Dr N')).toContain(
      'Green%20Lake%20Park%2C%207201%20East%20Green%20Lake%20Dr%20N',
    )
  })

  it('is trimmed, and an empty or whitespace address adds nothing — no dangling separator', () => {
    expect(postSummaryLines(answered, { address: '  7201 East Green Lake Dr N  ' })[2]).toBe(
      'Green Lake Park · 7201 East Green Lake Dr N',
    )
    expect(postSummaryLines(answered, { address: '' })[2]).toBe('Green Lake Park')
    expect(postSummaryLines(answered, { address: '   ' })[2]).toBe('Green Lake Park')
    // No address AND no place is still ONE honest line, never " · ".
    expect(
      postSummaryLines({ ...answered, place: '' }, { address: '' })[2],
    ).toBe(SUMMARY_NO_PLACE)
  })

  it('never invents a place for an address to hang off', () => {
    // An address with no place is a real state (a place field cleared after a
    // pick): the line stays "no place picked" rather than "no place picked ·
    // 7201 …", which would read as a place.
    expect(postSummaryLines({ ...answered, place: '' }, { address: '1234 E2E Ave NE' })[2]).toBe(
      SUMMARY_NO_PLACE,
    )
  })

  it('keeps the line COUNT honest with an address present (still three lines)', () => {
    expect(postSummaryLines(answered, { address: '1234 E2E Ave NE' })).toHaveLength(3)
  })
})

describe('addressAfterPlaceTextEdit (V9 ticket 03, review cycle 1 F1)', () => {
  it('drops an address the PICK wrote when the place TEXT changes', () => {
    // pick "Green Lake Park" (the one tap writes the street), then type
    // "Ballard Playground" over it: the place link is dropped (V8 ticket 07)
    // and the street the pick wrote must go with it — the post must never claim
    // a place it no longer names, and behind the collapsed disclosure nobody
    // would see the stale street.
    expect(addressAfterPlaceTextEdit('7201 East Green Lake Dr N', false)).toBe('')
  })

  it('KEEPS an address the parent typed', () => {
    // The non-destructive half: correcting the place text must not wipe the
    // parent's own typing (the case the comment in the place handler already
    // states).
    expect(addressAfterPlaceTextEdit('1234 E2E Ave NE', true)).toBe('1234 E2E Ave NE')
  })

  it('is a no-op on an empty address, either way', () => {
    expect(addressAfterPlaceTextEdit('', false)).toBe('')
    expect(addressAfterPlaceTextEdit('', true)).toBe('')
  })
})

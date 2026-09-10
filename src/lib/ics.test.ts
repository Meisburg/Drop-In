/**
 * ICS-generation tests (V3 slice 8, ticket 03). Everything runs against
 * fixed instants (no wall clock): the nowIso seam pins DTSTAMP, and the
 * post's starts_at / ends_at are fixed UTC ISO strings, so the UTC date
 * formatting holds on any machine timezone.
 */
import { describe, expect, it } from 'vitest'
import { buildIcs, escapeIcsText, foldIcsLine, formatIcsUtcDate, type IcsPost } from './ics'

/** A fixed post with every field set (address included — the ticket 08 fold-in). */
const POST: IcsPost = {
  id: 'pd-123',
  title: 'Playground time',
  place: 'Green Lake playground',
  starts_at: '2026-09-05T18:00:00.000Z',
  ends_at: '2026-09-05T20:30:00.000Z',
  age_hint: '2-5',
  details: 'Bring water',
  address: '7200 4th Ave NE, Seattle',
}
/** The same post without an address (the LOCATION line falls back to place). */
const NO_ADDRESS: IcsPost = { ...POST, address: null }
/** A fixed "now" for the DTSTAMP seam. */
const NOW_ISO = '2026-09-04T12:00:00.000Z'

/** The output's lines (the CRLF-split view the structural assertions use). */
function lines(ics: string): string[] {
  return ics.replace(/\r\n$/, '').split('\r\n')
}

describe('formatIcsUtcDate (the UTC date format — YYYYMMDDTHHMMSSZ)', () => {
  it('formats a UTC instant straight (no local-time conversion)', () => {
    expect(formatIcsUtcDate('2026-09-05T18:00:00.000Z')).toBe('20260905T180000Z')
  })

  it('zero-pads month, day, hour, minute, and second', () => {
    expect(formatIcsUtcDate('2026-01-05T03:04:05.000Z')).toBe('20260105T030405Z')
  })

  it('is timezone-independent: the same instant under a +02:00 offset', () => {
    // 20:00+02:00 IS 18:00Z — the UTC form, never the offset's local form.
    expect(formatIcsUtcDate('2026-09-05T20:00:00+02:00')).toBe('20260905T180000Z')
  })
})

describe('escapeIcsText (RFC 5545 TEXT escaping, one case per character)', () => {
  it('escapes the backslash', () => {
    expect(escapeIcsText('a\\b')).toBe('a\\\\b')
  })

  it('escapes the semicolon', () => {
    expect(escapeIcsText('a;b')).toBe('a\\;b')
  })

  it('escapes the comma', () => {
    expect(escapeIcsText('a,b')).toBe('a\\,b')
  })

  it('escapes a LF newline as the literal \n sequence', () => {
    expect(escapeIcsText('a\nb')).toBe('a\\nb')
  })

  it('escapes a CRLF newline as the literal \n sequence', () => {
    expect(escapeIcsText('a\r\nb')).toBe('a\\nb')
  })

  it('escapes the backslash FIRST (a mixed value never double-escapes)', () => {
    // Input a\;b (chars a, \, ;, b): the backslash doubles, then the
    // semicolon escapes — a\\\;b, never a\\\\\;b.
    expect(escapeIcsText('a\\;b')).toBe('a\\\\\\;b')
  })
})

describe('foldIcsLine (the RFC 5545 75-octet line folding)', () => {
  it('leaves a short line unchanged', () => {
    expect(foldIcsLine('SUMMARY:Playground time')).toBe('SUMMARY:Playground time')
  })

  it('folds a long line into <= 75-octet pieces, continuation space-led', () => {
    const line = `SUMMARY:${'a'.repeat(80)}` // 88 chars (8-char prefix + 80)
    const folded = foldIcsLine(line)
    const pieces = folded.split('\r\n')
    expect(pieces).toHaveLength(2)
    expect(pieces[0]).toHaveLength(75) // 8-char prefix + 67 a's
    expect(pieces[1]).toHaveLength(14) // the leading space + the 13-a tail
    // Unfolding (drop the CRLF + the continuation space) restores the line.
    expect(folded.replace(/\r\n /g, '')).toBe(line)
  })

  it('counts UTF-8 octets, not characters (a multibyte run folds earlier)', () => {
    // 39 × é (2 octets each) + the 9-octet prefix = 87 octets > 75.
    const line = `SUMMARY:${'é'.repeat(39)}`
    const folded = foldIcsLine(line)
    const pieces = folded.split('\r\n')
    expect(pieces.length).toBeGreaterThan(1)
    for (const piece of pieces) {
      expect(new TextEncoder().encode(piece).length).toBeLessThanOrEqual(75)
    }
    expect(folded.replace(/\r\n /g, '')).toBe(line)
  })
})

describe('buildIcs (structural validity + CRLF)', () => {
  it('is a VCALENDAR (VERSION + PRODID) holding one VEVENT, in order', () => {
    const ics = buildIcs(POST, NOW_ISO)
    const ls = lines(ics)
    expect(ls[0]).toBe('BEGIN:VCALENDAR')
    expect(ls[1]).toBe('VERSION:2.0')
    expect(ls[2]).toBe('PRODID:-//Playdate//Drop-in//EN')
    expect(ls[3]).toBe('BEGIN:VEVENT')
    expect(ls[ls.length - 2]).toBe('END:VEVENT')
    expect(ls[ls.length - 1]).toBe('END:VCALENDAR')
    // The VEVENT carries its required properties.
    for (const prefix of ['UID:', 'DTSTAMP:', 'DTSTART:', 'DTEND:', 'SUMMARY:']) {
      expect(ls.some((l) => l.startsWith(prefix))).toBe(true)
    }
  })

  it('derives the UID from the post id (stable across regenerations)', () => {
    expect(lines(buildIcs(POST, NOW_ISO))).toContain('UID:pd-123@playdate')
  })

  it('formats DTSTART / DTEND from starts_at / ends_at in UTC', () => {
    const ls = lines(buildIcs(POST, NOW_ISO))
    expect(ls).toContain('DTSTART:20260905T180000Z')
    expect(ls).toContain('DTEND:20260905T203000Z')
  })

  it('is CRLF-only throughout (no bare LF, file ends with a CRLF)', () => {
    const ics = buildIcs(POST, NOW_ISO)
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n')
    expect(ics.endsWith('\r\n')).toBe(true)
  })
})

describe('buildIcs (the VEVENT content)', () => {
  it('sets SUMMARY to the title', () => {
    expect(lines(buildIcs(POST, NOW_ISO))).toContain('SUMMARY:Playground time')
  })

  it('folds the LOCATION line in "place, address" when an address is present', () => {
    // The commas of the joined form are escaped like any other commas.
    expect(lines(buildIcs(POST, NOW_ISO))).toContain(
      'LOCATION:Green Lake playground\\, 7200 4th Ave NE\\, Seattle',
    )
  })

  it('uses the plain place when the address is absent or blank', () => {
    expect(lines(buildIcs(NO_ADDRESS, NOW_ISO))).toContain('LOCATION:Green Lake playground')
    expect(lines(buildIcs({ ...NO_ADDRESS, address: '   ' }, NOW_ISO))).toContain(
      'LOCATION:Green Lake playground',
    )
    expect(lines(buildIcs({ ...NO_ADDRESS, address: undefined }, NOW_ISO))).toContain(
      'LOCATION:Green Lake playground',
    )
  })

  it('joins DESCRIPTION from the age hint (the app\'s "Best for …" copy) + details', () => {
    // The join newline renders as the escaped \n sequence.
    expect(lines(buildIcs(POST, NOW_ISO))).toContain('DESCRIPTION:Best for 2-5\\nBring water')
  })

  it('omits the blank half of the DESCRIPTION (null age hint, details only)', () => {
    expect(lines(buildIcs({ ...NO_ADDRESS, age_hint: null }, NOW_ISO))).toContain(
      'DESCRIPTION:Bring water',
    )
  })

  it('emits no DESCRIPTION line at all when both halves are blank', () => {
    const ls = lines(buildIcs({ ...NO_ADDRESS, age_hint: null, details: null }, NOW_ISO))
    expect(ls.some((l) => l.startsWith('DESCRIPTION:'))).toBe(false)
  })

  it('escapes every special character in a title + details (through buildIcs)', () => {
    const ics = buildIcs(
      {
        ...POST,
        age_hint: null, // isolate the details line (no "Best for …" half)
        title: 'a;b,c\\d\ne',
        details: 'line one\nline two, more',
      },
      NOW_ISO,
    )
    const ls = lines(ics)
    expect(ls).toContain('SUMMARY:a\\;b\\,c\\\\d\\ne')
    expect(ls).toContain('DESCRIPTION:line one\\nline two\\, more')
  })
})

describe('buildIcs (the nowIso seam — determinism)', () => {
  it('is fully deterministic for a fixed nowIso', () => {
    expect(buildIcs(POST, NOW_ISO)).toBe(buildIcs(POST, NOW_ISO))
  })

  it('pins DTSTAMP to the seam (not the wall clock)', () => {
    expect(lines(buildIcs(POST, NOW_ISO))).toContain('DTSTAMP:20260904T120000Z')
  })

  it('defaults to the current time when no nowIso is passed (DTSTAMP still valid)', () => {
    const ics = buildIcs(POST)
    expect(ics).toMatch(/DTSTAMP:\d{8}T\d{6}Z\r\n/)
  })

  it('emits folded lines <= 75 octets for a long details field', () => {
    const ics = buildIcs({ ...POST, details: 'x'.repeat(300) }, NOW_ISO)
    for (const line of lines(ics)) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    }
    // Unfolding restores the whole 300-char detail (nothing lost to folds).
    const unfolded = ics.replace(/\r\n /g, '')
    expect(unfolded).toContain('x'.repeat(300))
  })
})
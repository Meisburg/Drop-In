/**
 * Pure ICS (RFC 5545) generation for the detail page's "Add to calendar"
 * (V3 slice 8, ticket 03).
 *
 * Everything in here is free of React/Supabase/DOM so it can be tested
 * without a database or browser (see ics.test.ts) — the same house style
 * as feed.ts. The detail page (PlaydateDetailPage) calls buildIcs with the
 * post it already has in hand (the signed-in PlaydateWithNeighborhood row
 * OR the signed-out PublicPlaydateDetail payload — both satisfy IcsPost)
 * and triggers a Blob download; no server round-trip, and public-surface
 * fields only (the ticket pin: the button works signed-out too, with no
 * new data exposure).
 */

/**
 * The post shape buildIcs needs: Playdate / PlaydateWithNeighborhood and
 * PublicPlaydateDetail all qualify. The public surface carries exactly
 * these fields, so the signed-out view builds the same file with nothing
 * beyond the 12-field get_public_playdate payload crossing the anon
 * boundary.
 */
export interface IcsPost {
  id: string
  title: string
  place: string
  starts_at: string
  ends_at: string
  age_hint: string | null
  details: string | null
  /**
   * The post's street address (V3 slice 5, ticket 08, migration 0021):
   * when present, the LOCATION line folds in "place, address" (the
   * ticket 08 AC, closed by this slice). Optional: absent until the live
   * project is past 0021 (undefined at runtime — treated as no address,
   * the pre-0016 status discipline).
   */
  address?: string | null
}

/**
 * The UTC date format of RFC 5545 DATE-TIME values: YYYYMMDDTHHMMSSZ,
 * the trailing Z marking UTC. The post's starts_at / ends_at (and the
 * nowIso seam) are UTC ISO instants, so the format is a straight
 * re-encoding — never a local-time conversion. Pure + unit-tested.
 */
export function formatIcsUtcDate(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

/**
 * RFC 5545 TEXT escaping for property values: backslash, semicolon, and
 * comma are backslash-escaped; newlines (CRLF, CR, or LF) become the
 * escape sequence \n (a LITERAL backslash + n in the file). The
 * backslash is escaped FIRST — escaping any other character first would
 * double-escape the backslashes it introduces. Pure + unit-tested.
 */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n/g, '\\n')
    .replace(/\r/g, '\\n')
    .replace(/\n/g, '\\n')
}

/** RFC 5545's line-length limit (75 octets, excluding the line break). */
const ICS_MAX_LINE_OCTETS = 75

/**
 * RFC 5545 line folding (§3.1): lines SHOULD NOT exceed 75 octets
 * (excluding the CRLF); a folded continuation line starts with a single
 * space. The limit counts UTF-8 OCTETS, not characters (a multibyte
 * sequence is never split — for..of iterates code points, a surrogate
 * pair is one code point worth 4 octets), and a continuation's leading
 * space counts against its own limit. Pure + unit-tested.
 */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder()
  if (encoder.encode(line).length <= ICS_MAX_LINE_OCTETS) return line
  const pieces: string[] = []
  let current = ''
  let currentOctets = 0
  for (const codePoint of line) {
    const octets = encoder.encode(codePoint).length // 1–4, pair-safe
    // The first line has the full 75; a continuation's leading space
    // takes 1 octet of its 75.
    const limit = pieces.length === 0 ? ICS_MAX_LINE_OCTETS : ICS_MAX_LINE_OCTETS - 1
    if (current !== '' && currentOctets + octets > limit) {
      pieces.push(current)
      current = ` ${codePoint}`
      currentOctets = 1 + octets
    } else {
      current += codePoint
      currentOctets += octets
    }
  }
  pieces.push(current)
  return pieces.join('\r\n')
}

/**
 * The ICS file for one drop-in (RFC 5545): a VCALENDAR (VERSION +
 * PRODID) holding one VEVENT.
 *
 * - The UID is derived from the post's id (stable across regenerations —
 *   re-downloading the same post updates the SAME calendar entry, it
 *   never creates a duplicate).
 * - DTSTAMP comes from the nowIso seam (the house nowIso style, per
 *   filterFeed): deterministic when a nowIso is passed (the unit tests),
 *   the current time by default.
 * - DTSTART / DTEND are the post's starts_at / ends_at in UTC
 *   (YYYYMMDDTHHMMSSZ).
 * - SUMMARY is the title. LOCATION is the place — "place, address" when
 *   the post has an address (the ticket 08 fold-in, the mapsHref
 *   discipline: trimmed, blank/absent = plain place). DESCRIPTION
 *   carries the age hint (the app's own "Best for …" copy) + the
 *   details, newline-joined (the newline renders as the escaped \n in
 *   the content value); a blank half is omitted, and when both are
 *   blank no DESCRIPTION line is emitted at all.
 * - Every value is RFC 5545-escaped, every line break is CRLF, and lines
 *   over the 75-octet limit are folded.
 */
export function buildIcs(post: IcsPost, nowIso: string = new Date().toISOString()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Playdate//Drop-in//EN',
    'BEGIN:VEVENT',
    `UID:${post.id}@playdate`,
    `DTSTAMP:${formatIcsUtcDate(nowIso)}`,
    `DTSTART:${formatIcsUtcDate(post.starts_at)}`,
    `DTEND:${formatIcsUtcDate(post.ends_at)}`,
    `SUMMARY:${escapeIcsText(post.title)}`,
  ]
  const address = (post.address ?? '').trim()
  const location = address !== '' ? `${post.place}, ${address}` : post.place
  if (location !== '') {
    lines.push(`LOCATION:${escapeIcsText(location)}`)
  }
  const parts: string[] = []
  const ageHint = (post.age_hint ?? '').trim()
  if (ageHint !== '') parts.push(`Best for ${ageHint}`)
  const details = (post.details ?? '').trim()
  if (details !== '') parts.push(details)
  if (parts.length > 0) {
    lines.push(`DESCRIPTION:${escapeIcsText(parts.join('\n'))}`)
  }
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.map(foldIcsLine).join('\r\n') + '\r\n'
}
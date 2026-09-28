/**
 * V27 — the SOCIAL PROOF the browse card shows beside the stars: a real review
 * quote from another parent, and how much drop-in activity a place has seen.
 *
 * WHY THIS EXISTS. The founder's priority for the places page — *"do other
 * parents rave about it? does it have good reviews that parents say good things
 * in the comments"* — is the one thing a bare average cannot answer. `★★★★★ 4.3
 * (12)` is a number; `"Best splash pad for toddlers" — Sam R.` is a reason to
 * go. This module owns the two pure decisions behind those lines so the card
 * renders them and does not decide them (the build law).
 *
 * HONESTY RULES (the module's standing convention):
 *   * a review with no body has no quote — `null`, never an empty `""` frame;
 *   * a place with no past drop-ins has no activity line — `null`, never
 *     "0 drop-ins hosted here" (which reads as a verdict);
 *   * a cancelled drop-in never counts as "hosted";
 *   * the author is reduced to a first name + last initial. The full display
 *     name belongs on the place page's review list, not on a public card in a
 *     list a passer-by can scroll.
 */

/** One place's best available review text, as the card needs it. */
export interface PlaceReviewHighlight {
  /** 1–5, the same score the aggregate is built from. */
  score: number
  /** The review body (non-empty; a stars-only review is not a highlight). */
  body: string
  /** The author's display name; rendered reduced, never in full. */
  authorDisplayName: string
  createdAt: string
}

/** One place's drop-in activity, as the card needs it. */
export interface PlaceDropInProof {
  /** Past, non-cancelled drop-ins hosted at this place. */
  hostedCount: number
  /** The most recent one's `ends_at` (ISO), or null. */
  lastEndedAt: string | null
}

/** A raw `playdates` row, the shape this module aggregates. */
export interface PlaceDropInRow {
  place_id: string | null
  ends_at: string | null
  status: string | null
}

/**
 * "Sam Rivera" → "Sam R."; "Sam" → "Sam"; anything blank → "A parent".
 *
 * The last initial disambiguates two Sams in a list without publishing a
 * surname. A single-word name keeps its whole word (inventing an initial would
 * be inventing data), and an empty name falls back to a neutral noun rather
 * than rendering a dangling em-dash.
 */
export function authorInitialLine(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'A parent'
  if (parts.length === 1) return parts[0]
  const last = parts[parts.length - 1]
  return `${parts[0]} ${last[0].toUpperCase()}.`
}

/**
 * The one-line quote: `"…" — Sam R.`, truncated on a WORD boundary with an
 * ellipsis. Returns null for a missing/blank body (a stars-only review has no
 * quote to show) — the card then falls back to the plain rating line.
 */
export function reviewQuoteLine(review: PlaceReviewHighlight, maxLength = 96): string | null {
  const body = review.body.replace(/\s+/g, ' ').trim()
  if (body === '') return null
  let text = body
  if (text.length > maxLength) {
    const slice = text.slice(0, maxLength)
    const lastSpace = slice.lastIndexOf(' ')
    text = `${(lastSpace > 24 ? slice.slice(0, lastSpace) : slice).trimEnd()}…`
  }
  return `“${text}” — ${authorInitialLine(review.authorDisplayName)}`
}

/**
 * Aggregate raw `playdates` rows into per-place proofs.
 *
 * "HOSTED" means a non-cancelled drop-in that has ALREADY ENDED at `nowIso`.
 * An upcoming or in-progress drop-in is not proof of anything yet, and a
 * cancelled one never happened — counting either would inflate the line the
 * founder is meant to trust.
 */
export function dropInProofsFromRows(
  rows: readonly PlaceDropInRow[],
  nowIso: string,
): Map<string, PlaceDropInProof> {
  const now = Date.parse(nowIso)
  const proofs = new Map<string, PlaceDropInProof>()
  if (Number.isNaN(now)) return proofs
  for (const row of rows) {
    const placeId = row.place_id
    if (placeId === null || placeId === '') continue
    if (row.status === 'cancelled') continue
    if (row.ends_at === null) continue
    const ended = Date.parse(row.ends_at)
    if (Number.isNaN(ended) || ended > now) continue
    const existing = proofs.get(placeId)
    if (existing === undefined) {
      proofs.set(placeId, { hostedCount: 1, lastEndedAt: row.ends_at })
      continue
    }
    existing.hostedCount += 1
    if (existing.lastEndedAt === null || Date.parse(existing.lastEndedAt) < ended) {
      existing.lastEndedAt = row.ends_at
    }
  }
  return proofs
}

/** "3 days ago" / "5 hours ago" / "just now", for the activity line. */
export function relativePastLabel(iso: string, nowIso: string): string | null {
  const then = Date.parse(iso)
  const now = Date.parse(nowIso)
  if (Number.isNaN(then) || Number.isNaN(now)) return null
  const minutes = Math.floor((now - then) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} ${days === 1 ? 'day' : 'days'} ago`
  const months = Math.floor(days / 30)
  return `${months} ${months === 1 ? 'month' : 'months'} ago`
}

/**
 * The card's activity line, or null when there is nothing true to say.
 *
 * One drop-in reads "1 drop-in hosted here", never "1 drop-ins". The "last one"
 * tail is dropped when there is no readable date rather than printing a
 * dangling separator.
 */
export function dropInProofLine(proof: PlaceDropInProof | null | undefined, nowIso: string): string | null {
  if (proof === null || proof === undefined || proof.hostedCount <= 0) return null
  const noun = proof.hostedCount === 1 ? 'drop-in' : 'drop-ins'
  const base = `${proof.hostedCount} ${noun} hosted here`
  if (proof.lastEndedAt === null) return base
  const when = relativePastLabel(proof.lastEndedAt, nowIso)
  return when === null ? base : `${base} · last one ${when}`
}

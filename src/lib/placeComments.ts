/**
 * V23 slice 5 — the place comment wall's PURE rules.
 *
 * The wall itself is a page (`PlaceDetailsPage`) and a table
 * (`place_comments`, migration 0050). This module holds the three decisions
 * that must not live in JSX: what counts as a postable comment, how the wall's
 * count reads, and what order it renders in. Pure functions, no Supabase client,
 * no React — trivially testable, mock-free (the build law).
 */

/**
 * The client-side cap, mirroring 0050's CHECK
 * (`char_length(body) <= 500`) and 0013's comment bound exactly.
 *
 * THE DUPLICATION IS DELIBERATE and is the house rule for a bound that exists
 * on both sides (cf. `profiles_radius_miles_chk` <-> `RADIUS_MIN_MILES`): the
 * client cap gives the parent a sentence they can act on, the DB CHECK is the
 * wall that makes it true. If these two ever disagree the DB wins and the
 * parent sees a raw Postgres error — so a test pins the number.
 */
export const PLACE_COMMENT_MAX_LENGTH = 500

/**
 * Validate a comment body before sending — the client-side mirror of 0050's
 * CHECK constraint: trim must leave 1–500 characters. Returns an error string
 * (the sentence the parent reads), or null when the body is sendable.
 *
 * The shape follows `validateMessageBody` / `validateCommentBody` so the three
 * compose surfaces cannot phrase the same rejection three ways.
 */
export function validatePlaceComment(body: string): string | null {
  const trimmed = body.trim()
  if (trimmed.length === 0) return 'Write something first — it cannot be empty.'
  if (trimmed.length > PLACE_COMMENT_MAX_LENGTH) {
    return `Keep it to ${PLACE_COMMENT_MAX_LENGTH} characters.`
  }
  return null
}

/**
 * How many parents have said something here.
 *
 * The zero case names the PLACE rather than saying "0 comments", because the
 * empty wall's job is to invite the first word, not to report a shortfall — the
 * same reasoning that made the radius empty state name its actual radius
 * (`emptyRadiusCopy`, V8 t02) instead of saying "nothing today".
 *
 * A blank name degrades to the "Be the first" sentence without a trailing
 * space, so a place row with no name cannot render "about ." — the caller still
 * gets a usable line.
 */
export function placeCommentCountLabel(count: number, placeName: string): string {
  const name = placeName.trim()
  if (count <= 0) {
    return name === ''
      ? 'Be the first to say something here.'
      : `Be the first to say something about ${name}.`
  }
  return count === 1
    ? '1 parent has said something here.'
    : `${count} parents have said something here.`
}

/**
 * The wall's order: NEWEST FIRST.
 *
 * Why newest-first rather than oldest-first (the playdate comment thread's
 * order, 0013): a park's wall is a running set of advice, and the freshest word
 * on a playground ("the splash pad is closed for the season") is the one that
 * matters most. A playdate thread is a conversation read from its beginning; a
 * place wall is a bulletin read from its top. Same rows, different question.
 *
 * Does not mutate its input, and is stable for equal timestamps (Array.prototype
 * .sort is stable in every engine this app targets), so a page that re-sorts
 * after posting cannot shuffle two comments written in the same millisecond.
 */
export function sortPlaceComments<T extends { created_at: string }>(
  rows: readonly T[],
): T[] {
  return [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
}

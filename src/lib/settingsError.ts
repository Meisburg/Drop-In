/**
 * Plain-language failure copy for the settings surfaces (V27).
 *
 * WHY THIS EXISTS: the settings page used to interpolate the raw Supabase /
 * PostgREST message into a parent-facing sentence, so a failed read could render
 * `Couldn't load your notification settings (PGRST205).` — an internal code, in
 * a sentence addressed to a tired parent. The app already knows what it was
 * trying to do; that is the useful half.
 *
 * The rule is deliberately conservative: a message is passed through ONLY when
 * it is already a human sentence (no driver code, no SQL, no constraint name).
 * Anything that looks like it came from the database layer is replaced by the
 * caller's fallback, because a code is noise and a half-translated SQL sentence
 * is worse than a plain one.
 *
 * Pure and total — the test lane pins every branch. No React, no client.
 */

/** Patterns that mark a string as a DEVELOPER message, not parent-facing copy. */
const DEVELOPER_MESSAGE_PATTERNS: readonly RegExp[] = [
  /\bPGRST\d+\b/i, // PostgREST error codes (PGRST205 = missing table)
  /\b42P\d\d\b/, // Postgres class 42 (undefined table/column)
  /\b23505\b/, // unique_violation
  /\b23503\b/, // foreign_key_violation
  /\bpermission denied\b/i,
  /\brow-level security\b/i,
  /\bviolates\b/i,
  /\bduplicate key\b/i,
  /\brelation\b.*\bdoes not exist\b/i,
  /\bcolumn\b.*\bdoes not exist\b/i,
  /\bJWT\b/,
  /\bTypeError\b/,
  /\bFailed to fetch\b/i,
  /^[A-Z0-9_]{3,}$/, // a bare SCREAMING code
]

/** The message off an unknown thrown value, or null when there is none. */
export function rawErrorMessage(error: unknown): string | null {
  if (error instanceof Error && error.message.trim() !== '') return error.message.trim()
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { message?: unknown; details?: unknown; code?: unknown }
    for (const value of [candidate.message, candidate.details, candidate.code]) {
      if (typeof value === 'string' && value.trim() !== '') return value.trim()
    }
  }
  if (typeof error === 'string' && error.trim() !== '') return error.trim()
  return null
}

/** Whether a message is safe to show a parent verbatim. */
export function isHumanMessage(message: string | null): boolean {
  if (message === null || message.trim() === '') return false
  return !DEVELOPER_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))
}

/**
 * The sentence a settings surface renders for a failed read or write. Always a
 * complete, plain sentence — the caller supplies exactly one, so every settings
 * failure names the thing that failed and nothing else.
 *
 * A genuinely human message from the layer below (a validation sentence, for
 * example) is passed through: dropping it would hide the one useful detail.
 */
export function settingsErrorMessage(error: unknown, fallback: string): string {
  const raw = rawErrorMessage(error)
  return isHumanMessage(raw) ? (raw as string) : fallback
}

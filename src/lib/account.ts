/**
 * The ACCOUNT-FORM seams — the pure decisions behind signup and the profile
 * name, so the pages that render those fields decide nothing (the build law)
 * and the rules are held by a unit test rather than by a React handler.
 *
 * WHY THIS MODULE EXISTS. Signup used to collect ONE field, `display_name`,
 * labelled "Display name" and explained as "your persistent public handle".
 * The founder's report on the live app: parents searching for someone in the
 * Inbox cannot find them, because nobody knows which handle their friend chose
 * — so signup now asks for a FIRST NAME and a LAST NAME (two fields), and the
 * handle is COMPOSED from them. Address joins the same form so the viewer's
 * home zip is set before they ever reach the feed, which is what makes the
 * first thing they see already local.
 *
 * The composition is a seam and not an inline template because two surfaces
 * have to agree on it — /login's signup form and /onboarding's handle step —
 * and because it is the one place where the handle's uniqueness, the 40-char
 * cap and the DB's `profiles_display_name_key` constraint all meet.
 */
/**
 * The handle's cap. The signup and /onboarding inputs have each carried
 * `maxLength={40}` since the display-name form was written, and the two name
 * fields keep that cap individually; this is the cap on the COMPOSED handle,
 * which is the value the profile column stores. Kept here rather than imported
 * so `account.ts` stays a leaf with no dependency on the profile-save module.
 */
export const DISPLAY_NAME_MAX_LENGTH = 40

/**
 * Compose the public handle from the two name fields.
 *
 * The rule is the plain reading of the request: "Sam" + "Rivera" becomes
 * `Sam Rivera`. Either half may be absent — a parent who gives only a first
 * name gets `Sam`, only a last name gets `Rivera` — so this returns the halves
 * trimmed and joined by a single space, collapsing internal runs of whitespace.
 *
 * It deliberately does NOT invent anything (no initial from a missing surname,
 * no "@" prefix). The result is what the parent typed, joined.
 *
 * The 40-character cap is applied here rather than at the input, because the
 * INPUTS are two fields the parent can each fill to 40: the joined value is
 * what the profile column stores, so the cap has to be applied to the value
 * that is actually written. Truncation is on the composed string and therefore
 * keeps the first name whole whenever it fits.
 */
export function composeDisplayName(firstName: string, lastName: string): string {
  const joined = `${firstName} ${lastName}`.replace(/\s+/g, ' ').trim()
  return joined.slice(0, DISPLAY_NAME_MAX_LENGTH)
}

/**
 * The inline error for the composed name on the signup / handle form, or null
 * when it may be submitted. One function for both surfaces, so a parent who
 * hits it on /login and retries on /onboarding reads the same sentence.
 *
 * An empty result is the only failure the app can judge: whether the handle is
 * actually AVAILABLE is the database's answer (`profiles_display_name_key`),
 * surfaced by the caller as `HandleTakenError` — this seam never guesses at it.
 */
export function displayNameFieldError(firstName: string, lastName: string): string | null {
  if (composeDisplayName(firstName, lastName) === '') {
    return 'Add your name so other parents can find you.'
  }
  return null
}

/**
 * The inline error for signup's required ADDRESS field, or null.
 *
 * Only emptiness is judged here. Whether the address resolves to a place we
 * cover is a question for the geocoder (a network answer, not a pure one) and
 * is asked AFTER the account exists — see the page: a failed lookup leaves the
 * parent on /onboarding's zip step with its own designed message rather than
 * blocking account creation on a third-party service being up.
 */
export function addressFieldError(address: string): string | null {
  if (address.trim() === '') return 'Add your home address so we can show drop-ins near you.'
  return null
}

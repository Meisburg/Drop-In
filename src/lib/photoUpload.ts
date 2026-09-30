/**
 * V28 r2 slice 2 (fix round 1) — the name card's photo-upload gate.
 *
 * The parent's photo lives on the name card, which is also the card that
 * CREATES the profiles row (the `createProfile` seam in db.ts). So the crop
 * step's upload runs BEFORE the row exists, and the card's Continue can race
 * it: a parent who confirms the crop and then taps Continue while
 * `uploadAvatar` is still in flight would create the row with `avatar_url`
 * NULL, and the URL that settles afterwards is read by nothing — an
 * orphaned object in the avatars bucket, the exact silent-data-loss failure
 * the slice 2 scope ruling exists to prevent.
 *
 * The ruling distinguishes two states (and the fix carries the
 * pending-state rule's bounded escape, the `ADDRESS_LOOKUP_TIMEOUT_MS`
 * idiom — a gate with no escape is the trap that rule exists to prevent):
 *
 * - A FAILED upload must NOT block Continue. The photo is optional; the
 *   run proceeds (a failure is settled, so it reads as not-in-flight here).
 * - An IN-FLIGHT upload blocks Continue, so the URL is known before the row
 *   is written.
 * - A HUNG upload must never trap the parent on the name card: after
 *   `PHOTO_UPLOAD_TIMEOUT_MS` the card surfaces the photo error and lets
 *   Continue proceed WITHOUT the photo (the late-arriving upload then
 *   leaves an orphaned object — the documented trade of the escape, which
 *   is strictly better than a wall).
 */

/**
 * The bounded wait. Same order as the area card's address-lookup escape
 * (`ADDRESS_LOOKUP_TIMEOUT_MS` — the pending-state rule's one idiom for
 * "a bounded wait, never a wall"): a storage write that has not settled in
 * ten seconds is a hung write, and the run proceeds without the photo
 * rather than wait forever. A real crop upload (a ~1MB JPEG) settles well
 * under the bound.
 */
export const PHOTO_UPLOAD_TIMEOUT_MS = 10_000

/**
 * The name card's Continue gate for the photo upload — a PURE DECISION the
 * page composes (the build law: pages may branch on presentation, rules
 * live in lib/). `inFlight` is the crop step's own `busy` flag — the single
 * source of truth for the in-flight state, so the page keeps no parallel
 * mirror of it. `waitExpired` is the bounded escape's flag. A failed
 * upload reads as `inFlight === false` (settled), so it never blocks; a
 * hung one reads as `inFlight && waitExpired`, so the escape unblocks it.
 */
export function photoUploadBlocksContinue(inFlight: boolean, waitExpired: boolean): boolean {
  return inFlight && !waitExpired
}
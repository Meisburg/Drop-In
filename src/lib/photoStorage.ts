/**
 * WHERE A FAMILY'S IMAGES LIVE, and who may fetch each kind (V9 ticket 11,
 * migration 0038).
 *
 * WHY THIS FILE EXISTS. Until this ticket every family image lived in ONE
 * public bucket: parent avatars at `<uid>/avatar` and kid photos at
 * `<uid>/kids/<kidId>` in `avatars` (0011, `public = true` with
 * `avatars_public_read` for role `public`). The human confirmed option A on
 * 2026-09-13 — "yes, private bucket" — so the two classes had to be separated:
 *
 *   * `avatars` (PUBLIC, unchanged) .......... `<uid>/avatar`, the parent's own
 *     photo. Rendered on every card, the detail page and both profile pages, and
 *     deliberately public (T5: separation, not lockdown — putting avatars behind
 *     signed URLs would be a large regression for no privacy gain).
 *   * `kid-photos` (PRIVATE, new) ............ TWO path classes, TWO policies:
 *       - `<uid>/kids/<kidId>`  → the OWNER alone, forever. Nobody else — not
 *         even another signed-in parent — may list it or mint a signed URL for
 *         it. (The app renders no kid photo at all any more; the class stays
 *         readable by its owner so the images the human asked to KEEP are still
 *         reachable if this decision is ever reversed.)
 *       - `<uid>/family/photo.<ext>` → any signed-in family
 *         (`familyPhotoVisibility`). A "photo of your family" will USUALLY
 *         DEPICT THE CHILDREN, so it cannot be anonymous (T4): it is not in a
 *         public bucket and no anon caller can mint for it. It is nonetheless
 *         readable by every signed-in family, because that is the audience the
 *         profile itself is for and the photo is what `/u/:handle` shows.
 *
 * The bucket name `kid-photos` is the ticket's own (T9) and is historic: the
 * bucket was created to end the kid-photo exposure and now holds both classes.
 * It is NOT renamable without a data move, so the name stays and this comment
 * carries the meaning.
 *
 * THE PATHS ARE THE PUBLIC API OF THIS MODULE. Every rule that decides "where
 * an image goes" or "who may fetch it" is a pure function here, unit-tested in
 * `photoStorage.test.ts`, and used by exactly the callers that need it:
 *   - `db.ts` (the family-photo upload + the batched signed-URL mint),
 *   - `ProfilePage` / `UserPage` (the two render sites),
 *   - `e2e/kid-photo-exposure.e2e.ts` (which asserts these INTENTIONS and then
 *     proves the live storage policies enforce them — the seam is the intent,
 *     the policy is the wall),
 *   - `scripts/migrate-kid-photos.mjs`, which CLASSIFIES the already-uploaded
 *     objects before moving them; that script duplicates these three tiny rules
 *     in plain JS (it cannot import TypeScript) and
 *     `photoStorage.test.ts` cross-checks the two implementations against each
 *     other so a drift cannot pass unnoticed.
 *
 * THE ONE THING NEVER DONE HERE: building a URL. `profiles.family_photo_url`
 * and (after migration 0038) `kids.avatar_url` hold an OBJECT PATH — a signed
 * URL expires, so storing one would hand a parent a broken image on a timer
 * (T6). URLs are minted at render time and never persisted.
 */

/**
 * The private bucket (T9). Holds `<uid>/kids/<kidId>` and `<uid>/family/<file>`.
 * Created as a `storage.buckets` ROW by 0038 with `public = false`; parent
 * avatars are NOT here (they stay in the public `avatars` bucket, 0011).
 */
export const PHOTO_BUCKET = 'kid-photos'

/** The object-path folder (the SECOND path segment) that marks the kid class. */
export const KIDS_FOLDER = 'kids'

/** The object-path folder (the SECOND path segment) that marks the family class. */
export const FAMILY_FOLDER = 'family'

/** The family photo's fixed object name: `<uid>/family/photo.<ext>`. */
export const FAMILY_PHOTO_FILE = 'photo'

/**
 * How long a minted family-photo signed URL is valid, in seconds (T6).
 *
 * One hour: long enough that a parent reading a profile does not watch the
 * image die mid-session, short enough that a URL copied out of the DOM (or out
 * of a devtools log) is worthless by the time anyone else tries it. Nothing
 * depends on the exact value — every render mints a fresh URL — so this is a
 * policy number, not a correctness one.
 */
export const FAMILY_PHOTO_URL_TTL_SECONDS = 3600

/**
 * A kid photo's object path inside `PHOTO_BUCKET` (and inside `avatars` before
 * migration 0038 — the move preserves the key and changes only the bucket).
 */
export function kidPhotoPath(profileId: string, kidId: string): string {
  return `${profileId}/${KIDS_FOLDER}/${kidId}`
}

/**
 * The value `kids.avatar_url` holds AFTER 0038: the same object path, made
 * unambiguous by prefixing the bucket it now lives in.
 *
 * WHY THE COLUMN IS REWRITTEN AT ALL, and why to this shape (T7, the ticket's
 * open question — decided here and in the migration header):
 *   - the old value is a URL into the `public` `avatars` bucket, and the whole
 *     point of the move is that such a URL stops resolving, so leaving it would
 *     leave a dead pointer in the database;
 *   - the information the human wanted kept — "keep the files" — is exactly the
 *     object path, so the path is what gets stored;
 *   - it is deliberately NOT a URL: every URL form is either dead (public) or
 *     expiring (signed), and a stored expiring URL is the trap T6 forbids;
 *   - the bucket prefix is included so a future reader (or a reversal) cannot
 *     mistake the value for the old public shape or for a bare key in the
 *     `avatars` bucket.
 * The column name `avatar_url` is left alone: renaming a column is a schema
 * change this ticket has no reason to make, and every reader of it was removed
 * (no code path may render a kid's `avatar_url` — the ticket's AC).
 *
 * `familyPhotoObjectPath` accepts BOTH the bucket-qualified and the bare form,
 * because the two columns are written by the same kind of code and only one of
 * them is prefixed.
 */
export function kidPhotoStoredRef(profileId: string, kidId: string): string {
  return `${PHOTO_BUCKET}/${kidPhotoPath(profileId, kidId)}`
}

/** The path segments of an object key (`a/b/c` → ['a','b','c']); '' has none. */
function segments(objectPath: string): string[] {
  return objectPath.split('/').filter((part) => part !== '')
}

/**
 * True when an object key is the KID-PHOTO class — `<owner>/kids/<kid>` — in
 * whichever bucket it currently sits in.
 *
 * This is the classifier the migration script plans its moves with and the
 * exposure spec asserts against: after 0038 no object under the public
 * `avatars` bucket may answer true, or the exposure is still open. It keys on
 * the SECOND segment (the same segment the storage policies key on,
 * `(storage.foldername(name))[2]`), so the classifier and the policies agree by
 * construction.
 */
export function isKidPhotoPath(objectPath: string): boolean {
  const parts = segments(objectPath)
  return parts.length >= 3 && parts[1] === KIDS_FOLDER
}

/**
 * THE KID-PHOTO VISIBILITY DECISION, stated once and pinned by a unit test: a
 * kid photo is fetchable by its OWNER alone. `'denied'` covers a signed-in
 * stranger (the case ticket 10's gate is about — a signed-URL path must never
 * let one parent fetch another family's kid photos) and an anonymous caller.
 *
 * The app never mints a kid-photo URL (no kid photo renders anywhere), so this
 * is the rule the storage policies implement and the e2e asserts; it is not a
 * gate the client could be trusted to apply.
 */
export function kidPhotoVisibility(
  viewerProfileId: string | null,
  ownerProfileId: string,
): 'owner' | 'denied' {
  if (viewerProfileId === null || viewerProfileId === '') return 'denied'
  return viewerProfileId === ownerProfileId ? 'owner' : 'denied'
}

/**
 * The extension an object name ends in, normalised to the alphabet an object
 * key may contain. The encoder always produces JPEG (`prepareAvatarFile`), so
 * 'jpg' is both the default and the value every real call passes; the parameter
 * exists so the seam is testable against a hostile value ('.JPG?x=1') instead
 * of silently interpolating whatever a caller hands it into a storage key.
 */
export function normalizePhotoExt(ext: string): string {
  const cleaned = ext.toLowerCase().replace(/^\.+/, '').replace(/[^a-z0-9]/g, '')
  return cleaned === '' ? 'jpg' : cleaned
}

/**
 * A family photo's object path: `<uid>/family/photo.<ext>` (ticket 08's pinned
 * `<uid>/family/…` prefix).
 *
 * One fixed object per family, replaced in place by an `upsert` — the same
 * choice the avatar makes. It is safe here for the reason the avatar needed an
 * explicit cache-buster and this does not: a family photo is never served from
 * a public URL, and every signed URL carries its own fresh token, so a
 * re-upload cannot be shadowed by a cached URL (T6).
 */
export function familyPhotoPath(profileId: string, ext: string): string {
  return `${profileId}/${FAMILY_FOLDER}/${FAMILY_PHOTO_FILE}.${normalizePhotoExt(ext)}`
}

/**
 * A stored `profiles.family_photo_url` value as the OBJECT PATH to mint a
 * signed URL for — or null when there is nothing usable, in which case the
 * render shows no image (best-effort by contract: no image is ever an error
 * state).
 *
 * It accepts a bucket-qualified value (`kid-photos/<uid>/family/photo.jpg`, the
 * shape `kidPhotoStoredRef` uses for kids) and a bare one, drops a leading slash
 * and any `?query` / `#fragment` (the cache-buster the AVATAR's public URL
 * carries — a value copied from there must not become a bogus object key), and
 * it REFUSES two things outright:
 *   - anything URL-shaped (`://`): a stored URL is either dead (a public URL
 *     into the old bucket) or expiring (a signed URL), and minting from it
 *     would be nonsense. T6's "never persisted" is enforced here as well as in
 *     the writer;
 *   - any path that is not the FAMILY class, which is the one that matters:
 *     `kidPhotoObjectPath`-shaped input can never be minted through this door,
 *     so a wiring mistake cannot turn the family renderer into a
 *     kid-photo reader.
 */
export function familyPhotoObjectPath(storedValue: string | null | undefined): string | null {
  if (storedValue === null || storedValue === undefined) return null
  // Cut the query/fragment BEFORE anything else: `photo.jpg?v=123` and
  // `photo.jpg` name the same object, and the avatar's public URL carries
  // exactly that buster shape.
  const withoutQuery = storedValue.trim().split(/[?#]/)[0].replace(/^\/+/, '')
  if (withoutQuery === '' || withoutQuery.includes('://')) return null
  const withoutBucket = withoutQuery.startsWith(`${PHOTO_BUCKET}/`)
    ? withoutQuery.slice(PHOTO_BUCKET.length + 1)
    : withoutQuery
  const parts = segments(withoutBucket)
  if (parts.length < 3 || parts[1] !== FAMILY_FOLDER) return null
  if (isKidPhotoPath(withoutBucket)) return null
  return parts.join('/')
}

/**
 * THE FAMILY-PHOTO VISIBILITY DECISION (T4): readable by any SIGNED-IN family,
 * never by an anonymous caller.
 *
 * Why it is not owner-only like the kid class: the photo is shown on
 * `/u/:handle` — a surface whose entire audience is signed-in families — and
 * `/profile` is the owner's own copy of the same image. Why it is not public
 * like an avatar: a "photo of your family" will usually DEPICT THE CHILDREN,
 * and a public bucket is exactly the exposure this ticket closes. The line is
 * therefore "signed in", and the storage policy is the wall.
 */
export function familyPhotoVisibility(
  viewerProfileId: string | null,
): 'authenticated' | 'denied' {
  return viewerProfileId === null || viewerProfileId === '' ? 'denied' : 'authenticated'
}

/**
 * The distinct object paths to mint for, from the stored values a page holds.
 * ONE batched call per page (T6), never one per image, so the dedupe lives
 * here: a page that renders the same value twice (the self view of `/profile`
 * and the same profile's `/u/:handle` card both do) mints once.
 */
export function familyPhotoMintPaths(
  storedValues: Array<string | null | undefined>,
): string[] {
  const seen = new Set<string>()
  for (const value of storedValues) {
    const path = familyPhotoObjectPath(value)
    if (path !== null) seen.add(path)
  }
  return [...seen]
}

/** The optional blocks a profile page renders, in the pinned order (ticket 11). */
export type ProfileBlurbBlock = 'familyPhoto' | 'about' | 'kids'

/**
 * WHICH of the three optional profile blocks render, in the order the ticket
 * pins: family photo → "About our family" → the kids list.
 *
 * This is the single decision for all three, so the two render sites
 * (`/u/:handle` and `/profile`) cannot drift apart on "is there a bio" or "does
 * this file have a photo URL". Each block is optional and independent: an
 * entirely empty profile returns `[]`, and the page must still look finished
 * (the ticket's AC — no placeholder, no empty card, no "No family photo yet").
 *
 * `kidsVisible` is the CALLER's decision, passed in rather than computed,
 * because the rule behind it is not about the profile at all: `/u/:handle`
 * renders the kids card in the SELF VIEW only (V9 ticket 10's accepted cost —
 * RLS returns a stranger an empty array, and an empty list must never be shown
 * as if it were the whole family). Keeping that decision at the call site keeps
 * this function pure and keeps the two pages' differing reasons visible where
 * they are decided.
 *
 * The ORDER here is the contract; the JSX at each site lays the blocks out in
 * the same order and says so. The "rest" of each page (the handle header, the
 * interests line, the posts) is not part of this seam.
 */
export function profileBlurbOrder(
  profile: { family_photo_url?: string | null; bio?: string | null } | null,
  kidsVisible: boolean,
): ProfileBlurbBlock[] {
  const blocks: ProfileBlurbBlock[] = []
  if (familyPhotoObjectPath(profile?.family_photo_url) !== null) blocks.push('familyPhoto')
  if ((profile?.bio ?? '').trim() !== '') blocks.push('about')
  if (kidsVisible) blocks.push('kids')
  return blocks
}

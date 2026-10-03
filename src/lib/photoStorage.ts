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
 *       - `<uid>/kids/<kidId>`  → ANY SIGNED-IN PARENT (V25 ticket 14,
 *         migration 0054). V9 ticket 11 had made it the OWNER alone; the
 *         founder reversed that on 2026-09-26 — "it's optional if you want to
 *         upload photos and if someone chooses to upload photos, other people
 *         should be able to see them" — with "people" scoped to signed-in
 *         parents. The bucket stays private and the role stays `authenticated`,
 *         so an anonymous caller still can neither list, fetch nor mint. The
 *         CLASS check (`[2] = 'kids'`) is the remaining gate and keeps this rule
 *         from swallowing the family class below.
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
 *   - `db.ts` (the family-photo upload + the batched signed-URL mints, family
 *     AND kid),
 *   - `ProfilePage` / `UserPage` (the family-photo render sites; `ProfilePage`
 *     also renders the kid-photo list),
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

/**
 * The distinct kid-photo object paths to mint a signed URL for, from the ids of
 * the kids a page renders (V12 t04: the owner's `/profile` kid-photo list).
 *
 * The paths are BUILT from the ids, never read from `kids.avatar_url`: the
 * stored column is a bucket-qualified object path (or a legacy public URL) and
 * the canonical `<uid>/kids/<kidId>` shape is what the storage policy mints
 * for. One batched mint per page (the sibling `familyPhotoMintPaths`), so the
 * dedupe lives here: a list that names the same kid twice mints once. An empty
 * id is skipped.
 *
 * `profileId` is the profile WHOSE KIDS these are — not the viewer. Since V25
 * ticket 14 any signed-in parent may mint for the kid class, so the caller is
 * responsible for passing only the kids the database actually returned to that
 * viewer (0040 filters the `kids` embed row by row) and for passing `null`
 * instead of a profile id when there is no session at all.
 */
export function kidPhotoMintPaths(profileId: string, kidIds: string[]): string[] {
  const seen = new Set<string>()
  for (const kidId of kidIds) {
    if (kidId === '') continue
    seen.add(kidPhotoPath(profileId, kidId))
  }
  return [...seen]
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
 * THE KID-PHOTO VISIBILITY DECISION, stated once and pinned by a unit test:
 * any SIGNED-IN parent may fetch a kid photo; an anonymous caller may not.
 * `'owner'` and `'authenticated'` differ only in WHY the viewer qualifies —
 * naming the owner is what lets the seam state the family's own relationship —
 * while both mean "the storage policy will mint for this object". The client
 * does not branch on the difference: it passes the profile id whenever a
 * session exists and lets the RLS-filtered kid rows decide what is on screen.
 *
 * V25 TICKET 14 REVERSED THIS RULE, and the reversal is the founder's
 * (2026-09-26, recorded in .scratch/v25/issues/14-kids-photos-visible.md):
 * uploading a child's photo is OPTIONAL, and if a parent uploads one, other
 * people may see it. "People" is scoped to signed-in parents — the app's
 * privacy-first posture is "parents authenticate before seeing anything"
 * (AGENTS.md) — so the answer for an anon caller is still `'denied'`, the
 * bucket stays `public = false`, and the policy is `to authenticated`. Before
 * this, V9 ticket 11 answered `'denied'` for every non-owner, which is what
 * migration 0054 changes: the policy keeps the CLASS check
 * (`(storage.foldername(name))[2] = 'kids'`) and drops the owner check.
 *
 * This function is the INTENT the policy implements, not a gate the client is
 * trusted to apply: the storage policy is the wall (the note on
 * `kidPhotoMintPaths` above is the caller's half of the contract).
 */
export function kidPhotoVisibility(
  viewerProfileId: string | null,
  ownerProfileId: string,
): 'owner' | 'authenticated' | 'denied' {
  if (viewerProfileId === null || viewerProfileId === '') return 'denied'
  return viewerProfileId === ownerProfileId ? 'owner' : 'authenticated'
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
 * Why it is not public like an avatar: a "photo of your family" will usually
 * DEPICT THE CHILDREN, and a public bucket is exactly the exposure this ticket
 * closes. The line is therefore "signed in", and the storage policy is the
 * wall.
 *
 * V25 ticket 14 put the KID class on the same line (`kidPhotoVisibility` now
 * answers `'authenticated'` for a signed-in non-owner too), so the two classes
 * share one read audience and differ in what the audience can DO with it: a
 * family photo is one fixed object per family, while kid photos are per kid and
 * are only ever rendered for the kid rows 0040 already returned to that viewer.
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

/** The blocks a profile page renders, in the pinned order (V16 t05; V23 s16). */
export type ProfileBlurbBlock =
  | 'user'
  | 'kids'
  | 'about'
  | 'familyPhoto'
  | 'parentCards'

/**
 * WHICH blocks a profile surface renders, in the order the ticket pins:
 * identity → kids list → "About the parents" → family photo.
 *
 * V27: "About the parents" is the PARENT ROWS on the read surface and the BIO
 * CARD on the edit surface. The read view no longer renders the bio (the
 * founder's /profile annotation asked for the two parent rows and nothing
 * else), so its 'about' is pushed by `parentNamesVisible` alone; the editor
 * still draws its bio card, so 'edit' is pushed by a non-empty bio. A read
 * profile with a bio and no parent cards therefore reports NO 'about' block —
 * the seam matches the DOM rather than naming a card that is no longer drawn.
 *
 * V16 t05 RE-PINNED THIS ORDER for the optional blocks. It used to be family
 * photo → about → kids; the founder's own reading of the page put the people
 * first and the family photo last, so the photo is now the CLOSER and the kids
 * block leads. The reorder was a change here plus a test update rather than a
 * JSX shuffle, because this function is the single decision for all three
 * blocks — the two render sites (`/u/:handle` and `/profile`) cannot drift
 * apart on "is there a bio" or "does this file have a photo URL". Each block is
 * optional and independent: an entirely empty profile returns `[]`, and the
 * page must still look finished (the ticket's AC — no placeholder, no empty
 * card, no "No family photo yet").
 *
 * V23 SLICE 16 EXTENDED THE SEAM TO NAME EVERY BLOCK BOTH SURFACES SHOW, so the
 * block order is single-sourced across the read view AND the edit surface. The
 * read view shows user → kids → about → familyPhoto (the family photo closes the
 * "About the parents" card); the edit surface shows the same sequence with its
 * always-present parent cards appended after it (their empty states are still
 * cards, so they are NOT gated on content). The family photo sits AFTER the bio
 * on both surfaces — that is the position this slice moves it to in the editor,
 * killing the drift where the read view closed with the photo while the editor
 * led with it.
 *
 * V24 SLICE 11B: THE 'linkedParent' BLOCK IS GONE, AND 'about' IS NOW
 * NAME-AWARE.
 *
 *   - 'linkedParent' was the standalone "Linked parent" section — the edit
 *     surface's second entry point to the account-link handshake. 11B moved that
 *     action INTO each parent card, so there is no such block any more: the
 *     linking AFFORDANCE is edit-only and lives inside `parentCards`, and the
 *     linked NAME is read+edit and renders inside the 'about' block (the "About
 *     the parents" card), where 11A put it. Nothing rendered on the read surface
 *     was ever gated on this key.
 *   - 'about' is pushed when the caller says the family's parent NAMES are
 *     visible, and on the edit surface ALSO when the bio is non-empty (V24 11B
 *     closed the gap where 11A's read view rendered its heading while this seam
 *     said the block did not exist — finding N1). V27 reverses the read half of
 *     that: the read view no longer draws the bio, so a bio alone pushes no
 *     'about' there, and `parentNamesVisible` is the read gate.
 *
 * `kidsVisible` is the CALLER's decision, passed in rather than computed,
 * because the rule behind it is not about the profile at all: the `kids` embed
 * is RLS-FILTERED per kid (0040), so what arrives in `profile.kids` is exactly
 * "the kids this viewer may see" — the family's own, the ones attached to a
 * drop-in they host or pinged, and any of them for a moderator. The caller
 * renders the card when that list is non-empty, and the database has already
 * answered who that is. Keeping the decision at the call site keeps this
 * function pure and keeps the two pages' differing reasons visible where they
 * are decided. `parentNamesVisible` follows the same discipline for the same
 * reason: only the caller knows what its own card grid rendered.
 *
 * The ORDER here is the contract; the JSX at each site lays the blocks out in
 * the same order and says so. The "rest" of each page (the handle header, the
 * interests line, the posts) is not part of this seam.
 */
export function profileBlurbOrder(
  profile: { family_photo_url?: string | null } | null,
  kidsVisible: boolean,
  surface: 'read' | 'edit' = 'read',
  parentNamesVisible = false,
): ProfileBlurbBlock[] {
  const blocks: ProfileBlurbBlock[] = ['user']
  if (kidsVisible) blocks.push('kids')
  // V28: the bio is retired — "About the parents" on both surfaces is now
  // driven by parentNamesVisible alone. The edit surface's parent cards block
  // carries the "About me" editor.
  if (parentNamesVisible) blocks.push('about')
  if (familyPhotoObjectPath(profile?.family_photo_url) !== null) blocks.push('familyPhoto')
  if (surface === 'edit') {
    // The edit surface ALWAYS carries the parent cards — their empty states are
    // still rendered cards — and each card carries its own link control (the
    // retired 'linkedParent' section became part of this block in V24 11B), so
    // unlike the optional blocks above it is not gated on content.
    blocks.push('parentCards')
  }
  return blocks
}

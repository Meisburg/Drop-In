/**
 * THE PHOTO GALLERY'S PURE HALF (V25 ticket 10) — the arithmetic and the words
 * that decide what a photo block renders, separated from the markup that paints
 * it, so the whole decision is unit-testable in this repo's Node-only suite.
 * (Every one of the ~46 test files is plain Node: no jsdom, no
 * testing-library, no component renderer — so a decision that wants a unit test
 * has to live in a module like this one. Ticket 10's "no new dependency" means
 * this suite stays Node-only.)
 *
 * WHAT THE FOUNDER ASKED FOR (annotation, /profile's "Family photos" block):
 *
 *   "make sure that if there's any family photos … they Fill the space of the
 *    phone so that it doesn't look weird And if there's more than one photo
 *    that could be like a grid … where you click on each one and they expand
 *    and close Like they're tiled or whatever"
 *
 * THE DATA WALL, stated here because this module is where the code would have to
 * change if it ever moves: `profiles.family_photo_url` is ONE column
 * (`supabase/migrations/0038_lifecycle_and_kid_photos.sql`), the storage class
 * is ONE path per family (`<uid>/family/photo.<ext>` — `familyPhotoPath`,
 * `photoStorage.ts`), and `familyPhotoMintPaths` mints for that single path. So
 * today every photo block holds exactly ONE photo, and NOTHING in this module
 * can invent a second one. A real multi-photo grid needs a schema decision (a
 * photo table, or a `<uid>/family/<n>` convention with a listing mint), which
 * ticket 10 explicitly forbids adding. The functions below are therefore
 * GALLERY-CAPABLE and correct for N ≥ 1; N = 1 is what the database can hand
 * them, and `photosAreTiled` is what keeps that honest — one photo is not a
 * grid, and pretending otherwise would be drawing a tile around a photo that has
 * no tile beside it.
 *
 * WHY THE GRID'S TILE SIZE IS SQUARE (read before "improving" it): the ticket's
 * AC is "a stable tile size, no layout shift as images load". A tile sized by
 * its own image's intrinsic ratio cannot be stable — the box would be unknown
 * until the bytes arrive, which is the shift the AC forbids. `aspect-square` +
 * `object-cover` fixes the box in CSS with no dependency on the network, and it
 * does not DISTORT: `object-cover` crops, it never stretches (the same rule the
 * ticket states for the single photo: "no part of the image is distorted").
 * The single photo is NOT put in a square tile — it fills the block's width at
 * its own ratio, which is what the founder asked for first.
 *
 * A LIB/ MODULE SHIPS ITS SIBLING TEST (docs/agents/code-structure.md): see
 * `photoGallery.test.ts`.
 */

/** A photo as every viewer in the app speaks it: a MINTED URL plus its alt. */
export interface GalleryPhoto {
  src: string
  alt: string
}

/**
 * How many photos a grid needs before it becomes a grid. Two: one photo is a
 * photo (full width at its own ratio), and a one-tile "grid" is a lie about
 * what the family uploaded — it would also reserve a square crop for an image
 * that has all the room it needs.
 */
export const GALLERY_GRID_MIN = 2

/**
 * The tiled grid's box (V25 t10). `grid-cols-2` fixed, not auto-fit: two columns
 * is the stable answer at 320px (a tile is ~144px wide — comfortably past the
 * 44px floor with room for the photo) and it does not reflow when a third photo
 * arrives. Tailwind needs the literal class names, so this is a constant rather
 * than something composed per render.
 */
export const GALLERY_GRID_CLASS = 'grid grid-cols-2 gap-2'

/**
 * One grid tile: a STABLE square box with the photo cropped into it. No
 * `max-h-*` anywhere (that cap is what letterboxed the single photo), and
 * `overflow-hidden` keeps a large photo inside the fixed box.
 */
export const GALLERY_TILE_CLASS = 'block w-full aspect-square overflow-hidden rounded-xl'

/**
 * The single (non-tiled) photo: the BLOCK's full width, the image's own height.
 * There is deliberately no height cap — a cap is exactly the letterbox the
 * founder circled: a portrait photo loses its bottom, a landscape one gets
 * bars. The viewer's `object-cover` on the tile crops without distorting; this
 * one has no crop at all.
 */
export const GALLERY_SINGLE_CLASS = 'block w-full overflow-hidden rounded-xl'

/** True when N photos should be TILED rather than shown as one full-width photo. */
export function photosAreTiled(count: number): boolean {
  return count >= GALLERY_GRID_MIN
}

/**
 * The ONE drop rule `galleryPhotosFrom` applies, named and private so the index
 * remap below cannot drift from the filter: a photo is KEPT exactly when it has
 * a `src` to fetch. Two copies of `src !== ''` in this module would be an
 * off-by-N waiting to happen again.
 */
function photoHasSrc(photo: GalleryPhoto): boolean {
  return photo.src !== ''
}

/**
 * The photo array a render should work from, given either shape a call site can
 * hand over: the historical `(src, alt)` pair (host avatars, comment rows, kid
 * rows — `PhotoButton`'s existing contract, unchanged) or an explicit gallery.
 * An array wins when present; entries with no `src` are dropped, because a photo
 * that cannot be fetched must never become a tile (a broken-image frame is worse
 * than one fewer tile). Returns `[]` when there is nothing to show — callers
 * render no block, which is the app's existing "no placeholder" rule.
 *
 * DROPPING IS WHY THE CALLER'S INDEX CANNOT BE USED AS-IS — see
 * `galleryIndexInKept`.
 */
export function galleryPhotosFrom(
  src: string | null | undefined,
  alt: string,
  photos?: readonly GalleryPhoto[] | null,
): GalleryPhoto[] {
  if (photos !== undefined && photos !== null) {
    return photos.filter(photoHasSrc)
  }
  if (src === undefined || src === null || src === '') return []
  return [{ src, alt }]
}

/**
 * `index` forced into `[0, count)`. The viewer's index is state, and a gallery
 * that shrinks under it (a photo removed, a mint that fails on a re-render) must
 * not point past the end — an out-of-range index would render `undefined.src`.
 * An empty gallery clamps to 0, which is a value the caller can test for with
 * `count === 0` (nothing is open) rather than a crash.
 */
export function clampGalleryIndex(count: number, index: number): number {
  if (count <= 0) return 0
  if (!Number.isFinite(index)) return 0
  const whole = Math.trunc(index)
  if (whole < 0) return 0
  if (whole > count - 1) return count - 1
  return whole
}

/**
 * `index` — a position in the caller's OWN array — re-expressed as a position
 * in the KEPT array `galleryPhotosFrom` returns for that same array. This is
 * the tap's meaning: a tile at pre-filter position 1 is the SECOND entry in the
 * array a grid maps over, and once a no-`src` entry before it is dropped it is
 * the FIRST photo the viewer holds. Clamping the caller's index against the
 * FILTERED length instead (what this module's caller did until this fix) opens
 * a different photo than the one tapped: with `[P0(''), P1, P2]` clamped against
 * the 2 kept photos, a tap on P1 at pre-filter index 1 renders P2.
 *
 * RULE, stated so every branch below is a consequence of it: the result points
 * at the FIRST KEPT entry at or after `index` (a tap cannot land on a dropped
 * entry through `PhotoButton`, which renders no button for one, but the rule is
 * total); when no kept entry sits at or after it — a tap past the end, or an
 * all-dropped array — it is the LAST kept entry, and `0` for an empty result.
 *
 * Pure arithmetic on the two primitives above: the caller's index is clamped
 * into its own array first, the drops strictly before it are counted, and the
 * remainder is clamped into the kept array. The component stores THIS value, so
 * the invariant "the stored index is a position in the filtered array" holds
 * whatever array a future caller hands `openGallery`.
 */
export function galleryIndexInKept(photos: readonly GalleryPhoto[], index: number): number {
  const tapped = clampGalleryIndex(photos.length, index)
  const droppedBefore = photos.slice(0, tapped).filter((photo) => !photoHasSrc(photo)).length
  const keptCount = photos.reduce((count, photo) => (photoHasSrc(photo) ? count + 1 : count), 0)
  return clampGalleryIndex(keptCount, tapped - droppedBefore)
}

/**
 * The index one step from `index` with the ends WRAPPING. Wrapping is the
 * behaviour the founder asked for in one word ("close Like they're tiled or
 * whatever" — i.e. keep moving); it also gives the arrows one meaning instead of
 * a disabled state that changes with position. A single-photo gallery has
 * nowhere to go: it answers its own index, and the viewer disables the controls
 * (`galleryPhotosAreSteppable`) rather than silently re-rendering the same photo.
 */
export function stepGalleryIndex(count: number, index: number, delta: number): number {
  if (count <= 1) return clampGalleryIndex(count, index)
  const from = clampGalleryIndex(count, index)
  return (((from + delta) % count) + count) % count
}

/** True when the viewer should offer next/previous at all (two or more photos). */
export function galleryPhotosAreSteppable(count: number): boolean {
  return count >= GALLERY_GRID_MIN
}

/**
 * The viewer's counter — "1 of 1", "2 of 3". Screen readers get it as the
 * dialog's live text, which is the only place the app tells a keyboard user
 * which photo of how many they are on. Returns `''` for an empty gallery so a
 * caller never prints "1 of 0".
 */
export function galleryPositionLabel(count: number, index: number): string {
  if (count <= 0) return ''
  return `${clampGalleryIndex(count, index) + 1} of ${count}`
}

/**
 * The next-photo control's accessible name. It carries the position so a
 * screen-reader user hears "Next photo, 2 of 3" rather than a bare "Next" that
 * says nothing about where they are.
 */
export function galleryStepLabel(
  direction: 'previous' | 'next',
  count: number,
  index: number,
): string {
  const word = direction === 'previous' ? 'Previous photo' : 'Next photo'
  const position = galleryPositionLabel(count, index)
  return position === '' ? word : `${word}, ${position}`
}

/**
 * A gallery's alt text: a numbered position for the photos after the first, so
 * two tiles of the same family do not read as the same image to a screen reader
 * ("…, photo 2"). The first keeps the caller's alt verbatim — that is the alt
 * every existing single-photo spec and every existing call site already has.
 * The numbering is appended HERE rather than at each call site so the button's
 * accessible name, the <img>'s alt and the dialog's `aria-label` cannot drift
 * apart.
 */
export function galleryAltAt(photos: readonly GalleryPhoto[], index: number): string {
  if (photos.length === 0) return ''
  const at = clampGalleryIndex(photos.length, index)
  const photo = photos[at]
  if (photo === undefined) return ''
  return at === 0 ? photo.alt : `${photo.alt}, photo ${at + 1}`
}

/**
 * One photo's alt inside a block, from the block's ONE label. This is what a
 * render site hands `FamilyPhotoBlock` (see `ImageLightbox.tsx`): the site knows
 * the family's wording once, and the numbering rule above decides the rest.
 */
export function galleryLabelAt(label: string, count: number, index: number): string {
  if (count <= 0) return ''
  const at = clampGalleryIndex(count, index)
  return at === 0 ? label : `${label}, photo ${at + 1}`
}

/**
 * The photo a render should paint, or `null` when there is none. This is the one
 * door the viewer and the block both read, so "index past the end" and "empty
 * gallery" have exactly one answer here instead of one per call site.
 */
export function galleryPhotoAt(
  photos: readonly GalleryPhoto[],
  index: number,
): GalleryPhoto | null {
  if (photos.length === 0) return null
  return photos[clampGalleryIndex(photos.length, index)] ?? null
}

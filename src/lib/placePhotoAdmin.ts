/**
 * V28 r4 — the PURE half of the moderator's place-photo tool.
 *
 * WHAT THIS MODULE IS FOR. The founder wants to fix a bad place photo by hand:
 * *"i want to be able to swap them out myself as the admin ... am i able to just
 * click on one as the admin and swap them out with a different one i find
 * online?"* That is a small UI backed by real decisions — is this URL usable,
 * is this file acceptable, what do we store alongside the image — and every one
 * of those decisions is here, as a pure function, so it is testable without a
 * browser, a network, or a storage bucket. The page renders; this module decides
 * (the build law).
 *
 * WHY THE ATTRIBUTION COLUMNS MATTER AND ARE NOT OPTIONAL. `places` carries
 * `photo_source_url`, `photo_license`, `photo_author` and `photo_attribution`
 * (migration 0046 added all four). 0046's own header gives the reason: CC BY and
 * CC BY-SA REQUIRE attribution, and the existing 121 photos all arrived from
 * Wikimedia Commons with that metadata populated. A replacement written by this
 * tool must not silently blank those columns — a photo whose licence we no
 * longer record is a photo we cannot legally justify later, and the credit line
 * is already rendered under the image (`photoCreditLine`). So the patch builder
 * below takes the source and licence as REQUIRED inputs rather than defaulting
 * them away.
 *
 * ⚠️ WHAT THIS MODULE DOES NOT DO, DELIBERATELY: it never fetches, downloads, or
 * re-hosts a third-party image. Google's Maps Platform Terms 3.2.4(a)(i) forbid
 * *"pre-fetch, index, store, reshare, or rehost Google Maps Content"*, and the
 * research at `research/place-photos/2026-10-03-strategies.md` found the same
 * shape at TripAdvisor and Foursquare. A moderator pasting a URL from a source
 * they have the right to use is a human judgement about licensing that this code
 * cannot make for them — which is why the UI asks for the source and the licence
 * rather than guessing one.
 */

/** The image types a place photo may be. Deliberately narrow. */
export const PLACE_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export type PlacePhotoType = (typeof PLACE_PHOTO_TYPES)[number]

/**
 * The upload cap. 8 MB, sized against the thing that actually breaks: this is
 * a directory of 239 public parks whose images render as small cards, so a
 * multi-megabyte original buys nothing visible and costs storage and mobile
 * data for every parent who loads the browse list.
 */
export const PLACE_PHOTO_MAX_BYTES = 8 * 1024 * 1024

/**
 * Validate a moderator-typed image URL.
 *
 * Returns the trimmed URL on success, or a PARENT-READABLE reason on failure.
 * The reason is a string rather than a boolean because the moderator is a person
 * at a keyboard who needs to know WHICH thing was wrong — "that isn't a valid
 * link" is useless when the real problem is a `javascript:` scheme.
 *
 * ⚠️ ONLY http AND https ARE ACCEPTED, and this is a security boundary, not a
 * style rule. The value is rendered into an `<img src>` AND into an anchor's
 * href on a public directory; a `javascript:` or `data:` value there is an
 * injection vector. `placeLearnMoreLink` already applies exactly this rule to
 * `website_url` for the same reason, so this mirrors an existing decision rather
 * than inventing a second one.
 */
export function validatePhotoUrl(raw: string): { url: string } | { error: string } {
  const trimmed = raw.trim()
  if (trimmed === '') return { error: 'Paste an image link first.' }
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return { error: 'That does not look like a link. It should start with https://' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { error: 'Only http:// and https:// links can be used.' }
  }
  return { url: trimmed }
}

/**
 * Validate a moderator-chosen upload.
 *
 * A FILE IS REJECTED FOR ITS TYPE BEFORE ITS SIZE, and the order is deliberate:
 * a 40 MB video is a type error, not a size error, and telling the moderator to
 * "pick a smaller file" when the real problem is that they picked a video sends
 * them to fix the wrong thing.
 */
export function validatePhotoFile(file: {
  type: string
  size: number
}): { ok: true } | { ok: false; error: string } {
  if (!(PLACE_PHOTO_TYPES as readonly string[]).includes(file.type)) {
    return {
      ok: false,
      error: 'That file type is not supported. Use a JPEG, PNG, or WebP image.',
    }
  }
  if (file.size > PLACE_PHOTO_MAX_BYTES) {
    return {
      ok: false,
      error: `That image is too large (${formatMegabytes(file.size)}). The limit is ${formatMegabytes(PLACE_PHOTO_MAX_BYTES)}.`,
    }
  }
  if (file.size === 0) {
    return { ok: false, error: 'That file is empty.' }
  }
  return { ok: true }
}

/** One decimal place, e.g. "8.0 MB" — enough for a human to act on. */
export function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * The PUBLIC object path for an uploaded place photo.
 *
 * WHY A DETERMINISTIC PATH AND NOT A RANDOM ONE. `PlaceDirectory` renders
 * `<img src={photo_url}>`, and a browser that has already cached the OLD image
 * at a stable URL will keep showing it after a replacement — the moderator would
 * swap a photo, see the old one, and conclude the tool is broken. `kidPhotoStoredRef`
 * hit exactly this in V28 r2 (fix round 2, R1: "the id set alone cannot see NEW
 * BYTES at the same path; only the generation moves"). So the path carries a
 * GENERATION: a second replacement of the same place writes a NEW path, which is
 * a new URL, which the browser must fetch.
 *
 * The extension is derived from the MIME type rather than taken from the
 * filename: a moderator's file could be named anything, and storage serves what
 * the extension says it is.
 */
export function placePhotoObjectPath(
  placeId: string,
  type: PlacePhotoType,
  generation: number,
): string {
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'
  return `${placeId}/${generation}.${ext}`
}

/**
 * The `places` patch for a moderator's replacement photo.
 *
 * ⚠️ WHY THE ATTRIBUTION FIELDS ARE PARAMETERS AND NOT BLANKED. Rewriting
 * `photo_url` without also writing its provenance would leave the row claiming a
 * licence and author that belong to the OLD image — which is worse than no
 * metadata at all, because the credit line would attribute the new picture to
 * the wrong person. Every replacement therefore carries its own source, licence
 * and author (all four columns together, the same discipline
 * `apply-place-photos.mjs` already follows: "never `photo_url` alone").
 *
 * A whitespace-only value is normalised to `null` rather than stored as `''`, so
 * `photoCreditLine`'s existing "empty means absent" checks keep working without
 * a second rule.
 */
export function placePhotoPatch(input: {
  photoUrl: string
  sourceUrl?: string | null
  license?: string | null
  author?: string | null
}): Record<string, unknown> {
  const attribution = [input.author, input.license]
    .map((part) => (part ?? '').trim())
    .filter((part) => part !== '')
    .join(' / ')
  return {
    photo_url: input.photoUrl.trim(),
    photo_source_url: normalise(input.sourceUrl),
    photo_license: normalise(input.license),
    photo_author: normalise(input.author),
    // Built from the two parts it displays, so the credit line cannot disagree
    // with the fields beside it (the same rule 0046's backfill follows).
    photo_attribution: attribution === '' ? null : attribution,
  }
}

/**
 * Clearing a photo. `null` on all five columns, written together — a row with a
 * URL but no provenance is the state this tool exists to avoid, so the reverse
 * (provenance with no URL) must not be reachable either.
 */
export function clearPlacePhotoPatch(): Record<string, unknown> {
  return {
    photo_url: null,
    photo_source_url: null,
    photo_license: null,
    photo_author: null,
    photo_attribution: null,
  }
}

function normalise(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? null : trimmed
}

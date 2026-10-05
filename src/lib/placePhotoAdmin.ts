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
 * PROVENANCE IS NO LONGER ASKED FOR — A RECORDED REVERSAL (2026-10-05). This
 * module used to require the source, licence and author from the editor, on the
 * argument below (kept as the record of what was reversed, not deleted): the
 * four columns exist because migration 0046 sourced 121 Wikimedia Commons photos
 * where CC BY / CC BY-SA REQUIRE attribution, and a replacement that blanked
 * them would attribute the NEW picture to the OLD photographer. The founder was
 * shown that trade and ruled: *"we don't need to put who took it, license, or
 * where it came from."* So the editor no longer asks for any of the three, and
 * `placePhotoPatch` is called with all three null. Existing rows KEEP whatever
 * is already stored and the credit line keeps rendering (`photoCreditLine`). The
 * rule that survives, and the one that made the reversal safe, is unchanged:
 * all five columns are written TOGETHER, so provenance is cleared with the photo
 * it described and a new picture can never wear the old credit. `placePhotoPatch`
 * keeps taking all three as inputs — the editor passes null — so "never
 * `photo_url` alone" has one home and a caller that does know the provenance can
 * still supply it.
 *
 * ⚠️ AND IT COPIES ONE, FALLING BACK TO THE LINK WHEN IT CANNOT — A RECORDED
 * REVERSAL (2026-10-05). This module used to state, categorically, that it never
 * fetched or re-hosted a third-party image: Google's Maps Platform Terms
 * 3.2.4(a)(i) forbid *"pre-fetch, index, store, reshare, or rehost Google Maps
 * Content"*, and the research at `research/place-photos/2026-10-03-strategies.md`
 * found the same shape at TripAdvisor and Foursquare. The founder was shown that
 * trade and ruled twice. First, that a pasted link may be copied so it can be
 * framed — necessary, because a cross-origin image taints a canvas and cannot be
 * encoded. Then, on cost: *"I think we should prefer hosting using whoever has
 * already got the image hosted on their link if possible, but then you have the
 * option to — if you need to crop or pan the image — then it gets copied to our
 * database, because otherwise we're going to be paying to serve up every image
 * for everyone."*
 *
 * SLICE 4 (2026-10-05) TOOK THE CHOICE AWAY AND KEPT BOTH OUTCOMES. The founder,
 * after using slices 1–3: *"I don't think we need a crop or adjust button
 * anymore here."* So URL mode is one action, `fetchPlacePhotoFile` is the only
 * fetch it makes, and the FALLBACK is what preserves the cost ruling: a host
 * that refuses the copy has its URL stored instead (and the moderator reads
 * `linkFallbackNotice`), while a host that answers gets our own `place-photos`
 * object, because that is the price of framing. The accepted risks — re-hosting
 * a third party's image against its terms, and a link that can rot or be blocked
 * later — are recorded, not argued, in
 * `docs/adr/0003-place-photos-are-copied-and-cropped.md`.
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
 * The stored shape of a place photo: a 1400×700 JPEG (quality 0.85 — the
 * encoder's one setting, in `prepareCroppedPhotoFile`), and the SAME 2:1 window
 * the crop dialog draws.
 *
 * WHY WIDER THAN TALL, AND WHY THESE NUMBERS (place-photo-crop slice 3,
 * 2026-10-05). Slice 1 stored a 1200px SQUARE and the founder framed in it, then
 * reported: *"Why is it a square that I'm editing in when what I see for each
 * place is a rectangle? … It is the wrong size."* The hero was RE-MEASURED in the
 * shipped tree rather than copied from the spec's table, and the table is wrong
 * about `md`: the page column is `mx-auto max-w-md md:max-w-3xl` (App.tsx), so
 * the old `h-48` hero was 358×192 at 390px (1.86:1), **664×192 at 768px (3.46:1)
 * and 740×192 at 844px (3.85:1)** — not 448×192 (2.33:1). The directory card is
 * ~356×144 (~2.5:1). Every surface is WIDE, so a square was re-cropped by
 * `object-cover` on every render and the moderator's framing was thrown away.
 * Pinning the hero to `aspect-[2/1]` makes the crop window and that surface the
 * same rectangle at EVERY width (measured 2.0000:1 at 390, 768 and 844), and the
 * card keeps the middle ~80% of its height. One stored crop serves both.
 *
 * WHERE 1400 COMES FROM, and its known limit: the spec pinned 1400 against a
 * 448 CSS px hero at 3× (~1344 device px), and this constant is that ruling. The
 * re-measurement above says the widest hero is 740 CSS px, i.e. ~2220 device px
 * at 3× — so on a 3× display the hero is upscaled slightly. The 2:1 RATIO is what
 * buys the founder's framing; whether to raise the pixel count is a product
 * decision outside this slice and is reported, not taken here. Avatars stay at
 * `AVATAR_SIZE_PX` (512) and square, and this is deliberately NOT the original
 * resolution, for the same reason the avatar pipeline is not: the network only
 * ever sees the small result.
 *
 * Already-stored photos (the 239 seeded ones and any square slice-1 upload) need
 * no migration: they render in the 2:1 box as a centre band.
 */
export const PLACE_PHOTO_WIDTH_PX = 1400
export const PLACE_PHOTO_HEIGHT_PX = 700

/**
 * The pair, as one value: the encoder's output size AND the crop window's
 * aspect. One constant rather than the same two numbers spelled twice at the
 * editor's two seams (the one-copy rule).
 */
export const PLACE_PHOTO_SIZE = {
  width: PLACE_PHOTO_WIDTH_PX,
  height: PLACE_PHOTO_HEIGHT_PX,
} as const

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
    return { ok: false, error: tooLargeMessage(file.size) }
  }
  if (file.size === 0) {
    return { ok: false, error: 'That file is empty.' }
  }
  return { ok: true }
}

/**
 * The crop step's pre-decode gate for a place photo: the error message, or null.
 *
 * A MODULE-LEVEL function rather than an inline arrow, because `useCropStep`
 * takes it as a dependency and rebuilds `beginCrop` when its identity changes —
 * an inline closure would be a new one every render (the hook's own parameter
 * note says so). It DELEGATES to `validatePhotoFile` rather than restating the
 * checks, so the type-then-size ordering and every message keep one home; the
 * only difference is the shape the hook wants (message-or-null).
 */
export function validatePlacePhotoCropFile(file: File): string | null {
  const checked = validatePhotoFile(file)
  return checked.ok ? null : checked.error
}

/** One decimal place, e.g. "8.0 MB" — enough for a human to act on. */
export function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** The one "too large" sentence, shared by the file gate and the fetch. */
function tooLargeMessage(bytes: number): string {
  return `That image is too large (${formatMegabytes(bytes)}). The limit is ${formatMegabytes(PLACE_PHOTO_MAX_BYTES)}.`
}

/**
 * "We could not read that image", with the way out. One sentence, one home: the
 * CORS case and the offline case are indistinguishable to `fetch`, and the
 * workaround is the same for both.
 */
function cannotCopyMessage(): string {
  return "That site wouldn't let us copy the photo. Save it to your device and use Upload a file."
}

/**
 * The sentence the moderator reads when the copy was refused and the LINK was
 * stored instead (place-photo-crop slice 4).
 *
 * WHY IT LEADS WITH THE OUTCOME RATHER THAN BEING THE REASON ALONE. Until slice
 * 4 a refusal meant NOTHING was saved: `cannotCopyMessage` and its siblings only
 * had to explain the failure. Now the same refusal arrives with a stored link,
 * and a moderator who read the reason alone would believe the photo was not
 * saved at all — the editor has closed and the picture is on the card, so the
 * message has to agree with what they can see. It states the outcome first and
 * hands the refusal's own words after it, keeping that reason's way out ("save
 * it to your device and use Upload a file"), which is what makes framing
 * reachable for a host that will not let us copy.
 */
export function linkFallbackNotice(reason: string): string {
  return `We saved the link instead. ${reason}`
}

/** The bare media type from a Content-Type header: parameters dropped, lowercased. */
function normalizeContentType(raw: string | null): string {
  return (raw ?? '').split(';')[0].trim().toLowerCase()
}

/**
 * Copy a moderator-pasted image so the crop step can frame it.
 *
 * WHY THIS EXISTS AT ALL, AND WHY ONLY THE CROP PATH CALLS IT. A remote URL
 * cannot be framed: a cross-origin image taints the canvas, so `drawImage`
 * cannot read it and `cropRectFor`'s output would encode as a blank square. The
 * founder asked for the framing, so the bytes are copied into our own bucket
 * exactly when the moderator chooses to frame them — while plain `Save` keeps
 * the link and costs us no hosting (the 2026-10-05 cost ruling; see the module
 * header and the ADR).
 *
 * THE `fetchImpl` SEAM IS THE BUILD LAW, not decoration: `lib/` takes its
 * dependency as a parameter, so every refusal below is testable without a
 * network. This is also the app's ONLY fetch whose response becomes a stored
 * place photo — the two other call sites (`geocode.ts`, the Open-Meteo lookup in
 * `db.ts`) read text they do not keep.
 *
 * Rejections are REFUSALS, never guesses, and each answers with a plain sentence
 * because the moderator is a person at a keyboard: a non-ok response, a
 * `content-type` outside `PLACE_PHOTO_TYPES`, a declared OR measured length over
 * `PLACE_PHOTO_MAX_BYTES`, and a thrown fetch (the CORS case — the one that must
 * name the way out, because no client-side work can fix it).
 */
export async function fetchPlacePhotoFile(
  url: string,
  deps: { fetchImpl?: typeof fetch } = {},
): Promise<{ ok: true; file: File } | { ok: false; error: string }> {
  const fetchImpl = deps.fetchImpl ?? fetch
  let response: Response
  try {
    response = await fetchImpl(url)
  } catch {
    // The CORS case, and the offline case: `fetch` REJECTS rather than
    // answering. Nothing about the image is knowable, so the message names the
    // workaround instead of pretending to diagnose a cause it cannot see.
    return { ok: false, error: cannotCopyMessage() }
  }
  if (!response.ok) {
    return {
      ok: false,
      error: `That link answered with ${response.status}. Check the link, or save the photo to your device and use Upload a file.`,
    }
  }
  // TYPE BEFORE SIZE, the same order `validatePhotoFile` uses and for the same
  // reason: a 40 MB web PAGE is a type error, and telling the moderator to "pick
  // a smaller file" sends them to fix the wrong thing.
  const contentType = normalizeContentType(response.headers.get('content-type'))
  if (!(PLACE_PHOTO_TYPES as readonly string[]).includes(contentType)) {
    return {
      ok: false,
      error:
        'That link is not an image we can use. Use a JPEG, PNG, or WebP image, or upload the file instead.',
    }
  }
  // A DECLARED length over the cap is refused before the body is read: the point
  // of the cap is not to download 40 MB and then complain about it.
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > PLACE_PHOTO_MAX_BYTES) {
    return { ok: false, error: tooLargeMessage(declared) }
  }
  let blob: Blob
  try {
    blob = await response.blob()
  } catch {
    // A body that dies mid-transfer lands here, and it is the same situation as
    // a refused fetch from the moderator's point of view.
    return { ok: false, error: cannotCopyMessage() }
  }
  // AND THE LENGTH THE SERVER DID NOT DECLARE. `content-length` is absent under
  // chunked encoding and a host may simply be wrong, so the measured size is the
  // one that actually decides.
  if (blob.size > PLACE_PHOTO_MAX_BYTES) {
    return { ok: false, error: tooLargeMessage(blob.size) }
  }
  // The NAME is fixed and the TYPE comes from the header: nothing downstream
  // reads the name, and the type is what the *next* gate (`validatePhotoFile`,
  // inside `beginCrop`) checks before the decode.
  return { ok: true, file: new File([blob], 'place-photo', { type: contentType }) }
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
 * ⚠️ WHY ALL FIVE COLUMNS ARE STILL WRITTEN TOGETHER. Rewriting `photo_url`
 * without also writing the four provenance columns would leave the row claiming
 * a licence and author that belong to the OLD image — worse than no metadata at
 * all, because the credit line would attribute the new picture to the wrong
 * person. Every replacement therefore carries its own provenance (all four
 * columns together, the same discipline `apply-place-photos.mjs` already
 * follows: "never `photo_url` alone"). Since the 2026-10-05 reversal the editor
 * passes all three as `null`, which CLEARS them with the photo — that is the
 * point, not an oversight: the new picture must not wear the old credit.
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

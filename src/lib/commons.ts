/**
 * V18 t02: reading a Wikimedia Commons response into a candidate photo.
 *
 * WHY THIS IS A SEPARATE, PURE MODULE: the build law
 * (`docs/agents/code-structure.md`) puts domain logic in `src/lib` as pure
 * functions with injected dependencies. Everything here is a pure transform of
 * already-fetched data — no network, no `fetch`, no clock. The network lives in
 * `scripts/fetch-place-photos.mjs`, which is where it belongs: it is an
 * operational tool that runs once against the live API, not product code.
 * Keeping the split means the parsing rules are unit-testable without a socket,
 * which matters because the rules below are the whole reason this batch is
 * careful.
 *
 * THE DISTINCTION THIS MODULE EXISTS TO PROTECT
 * ---------------------------------------------
 * Commons returns `403` without a descriptive `User-Agent`, and `429` under
 * fast pacing. Both are TRANSIENT OPERATIONAL FAILURES, not statements about
 * whether a photo exists. A naive script treats every non-result as "no photo
 * here" and leaves places empty that have perfectly good images — the V17
 * feasibility probe did exactly that and reported 0%, a measurement bug that
 * looked like a fact (`.scratch/v17/spec.md` §4.1.2).
 *
 * So a candidate's miss is THREE-VALUED, not a nullable image:
 *   - `miss: null`     — we have an image.
 *   - `miss: 'none'`   — the API answered, and there is genuinely no image.
 *   - `miss: 'failed'` — the request failed; we know NOTHING about this place.
 *
 * Collapsing the last two is the defect this type prevents, so they are
 * distinct members of a union rather than a boolean. A caller cannot
 * accidentally treat a failure as an absence without writing `=== 'none'`.
 */

/**
 * One photo, ready to apply: the image plus everything needed to honour its
 * licence.
 *
 * `author` is PLAIN TEXT. Commons' `extmetadata.Artist` is an HTML anchor
 * (`<a href="…/user:Shakespeare">en:user:Shakespeare</a>`), so the raw value is
 * run through `stripHtml` on the way in. Storing markup and deciding what to do
 * with it at render time would put an injection surface in the layer that has
 * no test; stripping here keeps the DB holding exactly what a human reads.
 */
export interface CommonsImage {
  /** The scaled thumbnail URL, hotlinked from Wikimedia's CDN. */
  thumbUrl: string
  /** The `File:` page — canonical provenance, always recorded. */
  filePageUrl: string
  /** The licence as Commons states it, e.g. "CC BY-SA 3.0". */
  license: string
  /** Plain-text author, or '' when Commons does not name one. */
  author: string
  /** Ready-to-render credit line, from `buildAttribution`. */
  attribution: string
}

/** Why a place has no image, or null when it has one. Never a bare boolean. */
export type CommonsMiss = 'none' | 'failed' | null

/** The outcome for one place. `image` is null exactly when `miss` is non-null. */
export interface CommonsCandidate {
  placeId: string
  placeName: string
  kind: string
  image: CommonsImage | null
  miss: CommonsMiss
  /** Present only when `miss === 'failed'` — the reason, for the sheet. */
  failure?: string
}

/** The place fields this module needs. A subset of `Place`, to keep it decoupled. */
export interface CandidatePlace {
  id: string
  name: string
  kind: string
}

/**
 * Strip HTML from a Commons `extmetadata` value down to plain text.
 *
 * Deliberately NOT a general-purpose sanitiser: it does not try to preserve
 * structure, decode every entity, or defend against a malicious document. It
 * answers one question — "what does this field SAY?" — for values like
 * `<a href="…">en:user:Shakespeare</a>` and
 * `<span class="int-own-work">Own work</span>`.
 *
 * Order matters. Tags are removed BEFORE entities are decoded, so an
 * entity-encoded tag (`&lt;a&gt;`) decodes to literal text rather than becoming
 * a tag that a later render might act on.
 */
export function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    // `&amp;` LAST: decoding it first would turn `&amp;lt;` into `&lt;` and
    // then into `<`, resurrecting a tag we had already neutralised.
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Compose the credit line. CC BY / CC BY-SA require attribution, so this is a
 * licence-compliance function, not decoration.
 *
 * Skips empty parts rather than emitting a dangling separator: Commons does not
 * always name an author, and `" / CC BY 3.0"` would read as a missing name
 * rather than the honest "we were not told who made this". Returns '' when
 * neither part exists, which callers treat as "no credit line to show" — the
 * licence itself is still stored in its own column either way.
 */
export function buildAttribution(author: string, license: string): string {
  const parts = [author.trim(), license.trim()].filter((part) => part !== '')
  return parts.join(' / ')
}

/** Read a nested value out of an `extmetadata` bag without trusting its shape. */
function meta(raw: Record<string, unknown>, key: string): string {
  const entry = raw[key]
  if (entry === null || typeof entry !== 'object') return ''
  const value = (entry as Record<string, unknown>).value
  return typeof value === 'string' ? value : ''
}

/**
 * A failed request, recorded as a failure. Kept as its own constructor so the
 * `miss: 'failed'` branch can never be written by hand as `miss: 'none'`.
 */
export function failedCandidate(place: CandidatePlace, reason: string): CommonsCandidate {
  return {
    placeId: place.id,
    placeName: place.name,
    kind: place.kind,
    image: null,
    miss: 'failed',
    failure: reason,
  }
}

/** The API answered and there is genuinely no image for this place. */
function absentCandidate(place: CandidatePlace): CommonsCandidate {
  return { placeId: place.id, placeName: place.name, kind: place.kind, image: null, miss: 'none' }
}

/**
 * Turn one raw Commons API response into a candidate.
 *
 * NEVER THROWS. A malformed response is a fact about the response, so it comes
 * back as `miss: 'failed'` — the caller's job is to surface it in the sheet and
 * re-run it, never to read it as "this place has no photo".
 *
 * The `generator=search` shape is:
 *   { query: { pages: { "<pageid>": { title, imageinfo: [ { thumburl, … } ] } } } }
 * `query.pages` is ABSENT (not empty) when the search matched nothing, and each
 * page's `imageinfo` can itself be missing, so both are checked rather than
 * assumed. When several files match, the FIRST in the response's own `index`
 * order wins — Commons' relevance ranking — because re-ranking here would be an
 * unreviewed judgement the candidate sheet exists to let a human make instead.
 */
export function readCommonsResponse(place: CandidatePlace, raw: unknown): CommonsCandidate {
  if (raw === null || typeof raw !== 'object') {
    return failedCandidate(place, 'response was not an object')
  }
  // An explicit error envelope (the API reports failures this way rather than
  // with an HTTP status in some paths).
  const error = (raw as Record<string, unknown>).error
  if (error !== undefined && error !== null) {
    const info =
      typeof error === 'object' && error !== null
        ? String((error as Record<string, unknown>).info ?? 'api error')
        : String(error)
    return failedCandidate(place, `api error: ${info}`)
  }

  const query = (raw as Record<string, unknown>).query
  if (query === null || typeof query !== 'object') {
    // No `query` at all means the search ran and matched nothing.
    return absentCandidate(place)
  }
  const pages = (query as Record<string, unknown>).pages
  if (pages === null || typeof pages !== 'object' || Array.isArray(pages)) {
    return absentCandidate(place)
  }

  const entries = Object.values(pages as Record<string, unknown>)
  if (entries.length === 0) return absentCandidate(place)

  // Prefer the response's own relevance order when it carries `index`.
  const ordered = entries.slice().sort((a, b) => {
    const ai = indexOf(a)
    const bi = indexOf(b)
    return ai - bi
  })

  for (const page of ordered) {
    if (page === null || typeof page !== 'object') continue
    const record = page as Record<string, unknown>
    const imageinfo = record.imageinfo
    if (!Array.isArray(imageinfo) || imageinfo.length === 0) continue
    const info = imageinfo[0]
    if (info === null || typeof info !== 'object') continue
    const infoRecord = info as Record<string, unknown>

    const thumbUrl = str(infoRecord.thumburl)
    if (thumbUrl === '') continue

    const title = str(record.title)
    const filePageUrl = title === '' ? '' : filePageUrlFor(title)
    const ext = infoRecord.extmetadata
    const extRecord = ext !== null && typeof ext === 'object' ? (ext as Record<string, unknown>) : {}

    const license = stripHtml(meta(extRecord, 'LicenseShortName'))
    const author = stripHtml(meta(extRecord, 'Artist'))

    return {
      placeId: place.id,
      placeName: place.name,
      kind: place.kind,
      miss: null,
      image: {
        thumbUrl,
        filePageUrl,
        license,
        author,
        attribution: buildAttribution(author, license),
      },
    }
  }

  // Pages came back but none carried a usable image.
  return absentCandidate(place)
}

function indexOf(page: unknown): number {
  if (page === null || typeof page !== 'object') return Number.MAX_SAFE_INTEGER
  const index = (page as Record<string, unknown>).index
  return typeof index === 'number' ? index : Number.MAX_SAFE_INTEGER
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * The canonical `File:` page URL for a Commons title.
 *
 * Commons titles look like `File:Green Lake-1.jpg`; the page lives at
 * `https://commons.wikimedia.org/wiki/File:Green_Lake-1.jpg` with spaces as
 * underscores. `encodeURIComponent` would be wrong here — it escapes the colon
 * and slash that a wiki title legitimately contains.
 */
export function filePageUrlFor(title: string): string {
  const slug = title.trim().replace(/\s+/g, '_')
  return `https://commons.wikimedia.org/wiki/${slug}`
}

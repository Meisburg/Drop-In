/**
 * Place-photo sourcing (slice 5, 2026-10-05) — the PURE half of the automatic
 * fill, and the module that actually matters.
 *
 * THE FOUNDER'S ASK: *"What are we doing about automatically populating all of
 * the images … I have all these places in here around Seattle that are blank
 * pictures. And I don't want to have to manually populate them if I don't have
 * to."* Then his own model of the system, which is what shapes this file:
 * *"it will automatically try to add the correct images for every place and then
 * I'll go through it as the manual reviewer and upload better photos for any
 * that need them."*
 *
 * So this is BEST-EFFORT FILL WITH A HUMAN FILTER, not "only fill what is
 * certain" — and the concern moves from precision to *what a family sees while
 * the review is pending*. That is the whole of the two tiers:
 *
 *   TIER 1 — the candidate's own title (or description) names the place AND
 *     carries a PLACE signal (a place-kind word, the neighbourhood/city, or a
 *     Commons category that says so). Both halves are required, so the evidence
 *     that it is the right place travels with the file and it is applied and live
 *     to parents immediately.
 *   TIER 2 — the best remaining candidate that is not blocklisted. A real image
 *     from a real search with nothing tying it to this place, so it is applied
 *     to the row, flagged `'unreviewed'`, and NOT shown to parents until a
 *     moderator confirms it. Those rows keep the per-kind illustration, which is
 *     what they show today, so nothing regresses.
 *
 * ⚠️ THE 2026-10-05 DEFECT THIS FILE NOW FIXES. Tier 1 originally accepted any
 * candidate whose own title contained the place's name — fine for "Albert Davis
 * Park", useless for a one-word or common-word name. The measured consequence:
 * **"Wunderkind" matched a Wikimedia scan of Thomas Mann's *Das Wunderkind*
 * (1914)** and would have gone LIVE on a kids' play space, because one German
 * noun is the whole place name. So the rule is now two halves (name AND a place
 * signal), and a title that reads as a work — a book, a film, a scan with a year,
 * a person, a historical document — is DROPPED outright rather than demoted. A
 * wrong live picture costs more than a blank.
 *
 * ⚠️ AND THE DEFECT THE FIRST FIX DID NOT CATCH, found by reading the tightened
 * list: Commons name search is not locality-bound, so **"Beacon Hill Playground"
 * matched a playground in ENGLAND** (the file's own geotag says 51.12, -0.75) and
 * **"Ross Playground" matched Dan Ross Playground in BROOKLYN** (40.62, -74.02) —
 * right name, right kind word, wrong continent. A candidate's OWN geotag is
 * therefore a drop when it is provably far from the place (`isWrongLocation`),
 * and the shell now asks Commons for the city as well as the name.
 *
 * WHY THE GATE IS THE DESIGN, and its measured basis. The probe that decided this
 * slice (`.scratch/place-photo-sourcing/spec.md` §1) searched three blank places
 * against Commons geosearch, Wikidata, Openverse and Commons name search. Only
 * Openverse and Commons name search yielded anything, and what geosearch yielded
 * is the reason a name gate exists at all: *"1914 Packard dump truck"*, *"Kitchen
 * stone countertops"*, *"Back to the future — olden days keyboard rig"*, *"Seattle
 * City Councilmember Sally Clark at Seattle Animal Shelter"* — photographs taken
 * NEAR a small Seattle park, with nothing to do with it. Every one of those is
 * caught here, and `placePhotoSourcing.test.ts` pins each one as a rejection
 * rather than trusting that it is.
 *
 * The network shell is `scripts/source-place-photos.mjs`. It fetches, paces,
 * verifies that a URL answers `image/*` and writes; every DECISION is here, so
 * the decisions are testable without a network, a database or a browser (the
 * build law, `docs/agents/code-structure.md`).
 */

import { placePhotoPatch } from './placePhotoAdmin.ts'
import type { PlacePhotoReviewState } from './types'

/** The two tiers, and the only two outcomes of the gate. */
export type SourcingTier = 'tier1' | 'tier2'

/** Where a candidate came from. `openverse` aggregates Flickr + Wikimedia + others. */
export type CandidateSource = 'openverse' | 'commons'

/**
 * One image a source offered, normalized to the fields both sources can supply.
 *
 * `url` is the REMOTE image URL — nothing in this slice downloads anything. The
 * founder's hosting ruling is link-first: *"we should prefer hosting using
 * whoever has already got the image hosted on their link if possible"*, and we
 * only copy when a moderator frames the picture (`lib/placePhotoAdmin.ts`).
 */
export interface SourceCandidate {
  title: string
  description?: string | null
  url: string
  source: CandidateSource
  /** The human-facing page the image was found on, when the source states one. */
  sourceUrl?: string | null
  /** The licence as the source states it. Recorded either way (see below). */
  license?: string | null
  author?: string | null
  /**
   * The Commons CATEGORIES the file belongs to ("Category:Playgrounds in
   * Seattle"), when the source states them.
   *
   * They are a place signal in their own right: a category is the uploader's
   * own statement of what the file is, and it is often far more truthful than
   * the file name (`P-Patch at Kirke Park, Seattle, Washington.JPG` sits in
   * "Category:Community gardens in Seattle"). `scripts/source-place-photos.mjs`
   * asks Commons for them; Openverse does not offer an equivalent field.
   */
  categories?: readonly string[] | null
  /**
   * The file's OWN geolocation, when the source states one (Commons
   * `prop=coordinates`). It is the one locality fact a candidate can carry:
   * Openverse aggregates Flickr and states none, Commons states one whenever the
   * uploader geocoded the file.
   *
   * WHY IT MATTERS, measured 2026-10-05: Commons NAME search is not
   * locality-bound, so "Ross Playground" returned *Dan Ross Playground, Brooklyn
   * NYC* (40.62, -74.02) and "Beacon Hill Playground" returned a geograph.org.uk
   * playground in ENGLAND (51.12, -0.75) — both correct name matches, both
   * 4,000–8,000 km from the Seattle place, both about to go live to parents.
   */
  coordinates?: { lat: number; lng: number } | null
}

/**
 * The blocklist — the non-place subjects a real probe actually returned.
 *
 * FOUR CLASSES, and each one is here because a measured result produced it:
 *
 *   1. NON-PLACE SUBJECTS from the Openverse/Commons probe: a *dump truck*, a
 *      *keyboard*, *stone countertops*, a *hamburger*. Photographed near these
 *      small parks; nothing to do with them.
 *   2. PEOPLE: a *councilmember*, a *portrait*, a *headshot*. A person is never
 *      the answer to "where should we take the kids this afternoon".
 *   3. SCANNED DOCUMENTS — the dominant false-positive class the V18 pipeline
 *      already measured (`.scratch/v18/spec.md` §4.1.2): Internet Archive book
 *      scans whose TITLE shares a surname or a street name with a Seattle park,
 *      so a Victorian memorial pamphlet ranked as a photo of that park. The
 *      `(ia ` marker and the raw `.pdf` / `.djvu` extensions catch those
 *      structurally; the document words catch the ones with clean names.
 *   4. BOOKS, FILMS AND WORKS — the same class seen through a clean filename,
 *      measured by the 2026-10-05 dry run and the V18 ledger: a *1919 seed
 *      catalogue* ("Price list. Fall 1919 - Baker Bros. Co."), a *Victorian
 *      memorial pamphlet* ("Filial tribute to the memory of Rev. John Moffat
 *      Howe"), an *EU fisheries visit* ("Visit of Maria Damanaki, Member of the
 *      EC, to Greece"), a *treatise*, an *annual report*. The words here are
 *      the ones that actually appeared; none is a guess about layout.
 *
 * IT IS A DROP, NOT A DEMOTION: a blocklisted candidate does not fall through to
 * tier 2. Tier 2 exists for a picture that MIGHT be the right area; a dump truck
 * is not a worse answer than the illustration, it is a wrong answer with a
 * confident picture, and the founder reviews tier 2 — he should not have to
 * reject a truck.
 *
 * ⚠️ SUBSTRING MATCHING, SO EVERY TERM MUST BE UNAMBIGUOUS AS A SUBSTRING. This
 * is why "novel" is not here (it would match "novelty playground") and why bare
 * "memorial" is not either (it would reject "Ron K. Bills Memorial Fountain",
 * a real place in this directory). Where a measured title needed one of those,
 * the phrase that measured it is used instead — `in memory of`, `tribute`.
 */
export const SOURCE_BLOCKLIST: readonly string[] = [
  // 1. measured non-place subjects
  'dump truck',
  'keyboard',
  'countertop',
  'counter top',
  'hamburger',
  // 2. people, not places
  'portrait',
  'headshot',
  'selfie',
  'councilmember',
  'councilwoman',
  'councilman',
  'city council',
  'visit of',
  // 3. scanned documents / archival book scans
  'price list',
  'catalogue',
  'catalog',
  'treatise',
  'pamphlet',
  'bulletin',
  'annual report',
  'proceedings',
  'souvenir programme',
  'programme',
  'guide book',
  'guidebook',
  'yearbook',
  'almanac',
  'directory',
  '(ia ',
  '.pdf',
  '.djvu',
  // 4. books / pamphlets / works measured by name
  'tribute',
  'in memory of',
  'memoir',
  'obituary',
  'biography',
  'sermon',
  'postcard',
  'dpla',
  'seed catalog',
  'nursery catalog',
  'exhibition catalog',
]

/**
 * The person-name SHAPE, separate from the blocklist words because the two catch
 * different things: the blocklist names roles that showed up in a probe, while
 * this catches the general form — a role or an honorific followed by a
 * capitalized name ("Councilmember Sally Clark", "Mayor Bruce Harrell").
 *
 * IT REQUIRES THE ROLE WORD, deliberately. A bare "two capitalized words" rule
 * would reject the TRUE positive this slice exists to keep: "Olympic Hills,
 * Albert Davis Park" is two capitalized words and is exactly right. A person is
 * only inferred when the title says a person is its subject.
 *
 * IT IS ALSO TWO STEPS RATHER THAN ONE REGEX, and that is a correctness fix, not
 * style: JavaScript's `i` flag makes `\p{Lu}` case-insensitive too, so a single
 * `/\bcouncilmember\b\s+\p{Lu}/iu` matches "councilmember sally" as readily as
 * "Councilmember Sally" and the shape would fire on a lowercase sentence. The
 * role is found case-insensitively, then the NEXT WORD is tested for a capital
 * with the `u` flag alone.
 *
 * `rev` joined the list on 2026-10-05: the Victorian memorial pamphlet that
 * matched "12th West / West Howe Park" is titled "…Rev. John Moffat Howe…", and
 * `reverend` (the long form already here) did not see the abbreviation.
 */
const PERSON_ROLE_SOURCE =
  '\\b(?:council(?:member|woman|man)|mayor|senator|congress(?:man|woman|member)|representative|governor|judge|dr|mr|mrs|ms|professor|reverend|rev)\\b\\.?\\s+(\\S+)'

/** The capitalized-word test, on its own so the `u` flag is not polluted by `i`. */
const CAPITALIZED_WORD = /^\p{Lu}/u

/**
 * Words too generic in THIS corpus to be evidence that a picture is of a place.
 *
 * Stripping them is what lets the gate match "Albert Davis" inside "Olympic
 * Hills, Albert Davis Park" while refusing to call every Seattle photograph a
 * match for a place whose name is "Community Center". Directions, colours and
 * proper nouns are deliberately NOT here: "Green Lake" is two real words, and
 * stripping "lake" would leave one, which the two-token rule below then refuses
 * to match on its own.
 */
const GENERIC_PLACE_WORDS = new Set([
  'a', 'an', 'and', 'at', 'for', 'in', 'of', 'on', 'the', 'to',
  'seattle', 'washington', 'wa',
  'park', 'parks', 'playground', 'playgrounds', 'playfield', 'playfields',
  'community', 'center', 'centre', 'school', 'elementary', 'public', 'city',
  'neighborhood', 'neighbourhood', 'pocket', 'small', 'mini',
  'field', 'fields', 'pool', 'beach', 'trail', 'trails', 'garden', 'gardens',
  'plaza', 'library', 'annex', 'building', 'hall', 'house', 'lot', 'area',
  'site', 'station',
  'street', 'st', 'ave', 'avenue', 'road', 'rd', 'blvd', 'boulevard',
  'drive', 'dr', 'lane', 'ln', 'way', 'place', 'pl', 'court', 'ct',
  'terrace', 'ter', 'nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w',
  'p', 'patch', 'ppatch', 'restroom', 'restrooms', 'comfort', 'wading', 'spray',
])

/**
 * Lowercase, drop a file extension and any punctuation, collapse whitespace.
 *
 * The extension is removed because a Commons FILE title arrives as
 * `File:West Howe Park.jpg` — the `.jpg` is not part of the place's name, and a
 * naive substring test for the full name would fail against it.
 */
export function normalizeForMatch(value: string): string {
  return String(value)
    .toLowerCase()
    .replace(/\.(jpe?g|png|gif|webp|tiff?|pdf|djvu)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * The names one directory row answers to.
 *
 * Some seeded names are two names separated by a slash — *"12th West / West Howe
 * Park"* — because the city's dataset names a park by both its street and its
 * common name. Splitting on `/` (and `|`) is what lets a perfectly good file
 * titled "West Howe Park.jpg" pass while the row's display name does not appear
 * in it. A parenthetical is also offered without its contents
 * ("Green Lake Park (East)" → also "green lake park"), because the qualifier is
 * the data's, not the photographer's.
 *
 * Commas are NOT split points: "Olympic Hills, Albert Davis Park" is one name
 * with a neighbourhood prefix, and accepting the prefix alone as the place would
 * be exactly the "photo taken near the park" mistake the gate exists to stop.
 */
export function placeNameAliases(name: string): string[] {
  const aliases: string[] = []
  for (const part of String(name).split(/[/|]/)) {
    for (const variant of [part, part.replace(/\([^)]*\)/g, ' ')]) {
      const normalized = normalizeForMatch(variant)
      if (normalized !== '' && !aliases.includes(normalized)) aliases.push(normalized)
    }
  }
  return aliases
}

/**
 * The words that must be present for a name to be considered present.
 *
 * Pure digits are dropped ("12th" survives as a token because it has letters;
 * a bare "12" would not), and duplicates collapse ("West Howe" from "12th West /
 * West Howe Park" is not made harder to satisfy by the row repeating itself).
 */
export function distinctivePlaceTokens(name: string): string[] {
  const tokens: string[] = []
  for (const token of normalizeForMatch(name).split(' ')) {
    if (token === '' || GENERIC_PLACE_WORDS.has(token) || /^\d+$/.test(token)) continue
    if (!tokens.includes(token)) tokens.push(token)
  }
  return tokens
}

/**
 * Does this text name the place?
 *
 * TWO WAYS, in the order the spec pins them — the full name, or the name minus
 * its generic words:
 *
 *   1. the whole normalized name appears as a contiguous run of words, which
 *      also covers the `"<Neighbourhood>, <Name>"` prefix form the spec calls
 *      out ("Olympic Hills, Albert Davis Park" contains "albert davis park");
 *   2. every distinctive token appears SOMEWHERE in the text, in any order —
 *      "Albert Davis Park" is named by a file titled "Albert Davis Park
 *      playground panorama", and by one titled "Playground, Davis Park, Albert".
 *
 * ⚠️ AND THE ONE-TRUE-WORD FLOOR. A name with fewer than two distinctive tokens
 * gets way 1 ONLY: one distinctive word is not evidence ("Howe" is a street, a
 * surname and half of Seattle), and a single-word match would make a photo of
 * anything on that street tier 1 — that is, live to parents with no review. A
 * two-word core is the smallest thing this gate trusts on its own.
 *
 * ⚠️ THE TWO WAYS ARE NOT EQUAL EVIDENCE, which the gate uses: way 1 is the
 * place's own name in its own order, way 2 is a bag of words that can reassemble
 * into a different referent. The measured case is "Chinatown-International
 * District, Seattle, Washington" for the place "International District Community
 * Center" — every distinctive token is there, and the photograph is of the
 * neighbourhood, not the building.
 */
export function titleNamesPlace(text: string, placeName: string): boolean {
  const haystack = normalizeForMatch(text)
  if (haystack === '') return false
  if (placeNameAppearsVerbatim(text, placeName)) return true
  const words = new Set(haystack.split(' '))
  for (const alias of placeNameAliases(placeName)) {
    const tokens = distinctivePlaceTokens(alias)
    if (tokens.length < 2) continue
    if (tokens.every((token) => words.has(token))) return true
  }
  return false
}

/**
 * The STRONG half of `titleNamesPlace`: the whole name, in its own order.
 *
 * Exposed separately because the gate trusts it more — a verbatim name may ride
 * on the city as its place signal, while an any-order token match needs a
 * place-kind word before it can go live (see `gateCandidate`).
 */
export function placeNameAppearsVerbatim(text: string, placeName: string): boolean {
  const haystack = normalizeForMatch(text)
  if (haystack === '') return false
  const padded = ` ${haystack} `
  return placeNameAliases(placeName).some((alias) => padded.includes(` ${alias} `))
}

/** The title and description as one searchable string (the spec's "title/description"). */
export function candidateText(candidate: Pick<SourceCandidate, 'title' | 'description'>): string {
  return [candidate.title ?? '', candidate.description ?? ''].filter((p) => p !== '').join(' ')
}

/**
 * Is this text one of the measured non-place subjects?
 *
 * TWO FORMS ARE TESTED, because the blocklist holds two kinds of term and one
 * form cannot see both:
 *
 *   - the RAW lowercased text, which is where the document markers live — a
 *     `.pdf` extension and the Internet Archive's own `(ia ` marker are
 *     punctuation-bearing and are stripped by any normalization;
 *   - the punctuation-COLLAPSED text, so `Dump-Truck` and `Dump  Truck` are the
 *     same subject as `dump truck`.
 */
export function matchesBlocklist(text: string): boolean {
  const raw = String(text).toLowerCase()
  const collapsed = raw.replace(/[^a-z0-9]+/g, ' ').trim()
  return SOURCE_BLOCKLIST.some((term) => raw.includes(term) || collapsed.includes(term))
}

/** Does this text have a person as its subject ("Councilmember Sally Clark …")? */
export function hasPersonNameShape(text: string): boolean {
  const value = String(text)
  for (const match of value.matchAll(new RegExp(PERSON_ROLE_SOURCE, 'gi'))) {
    const nextWord = match[1] ?? ''
    if (CAPITALIZED_WORD.test(nextWord)) return true
  }
  return false
}

/**
 * THE PLACE-KIND WORDS the product already uses, as the SIGNAL half of the
 * tightened tier-1 rule (2026-10-05).
 *
 * WHY THIS EXISTS, in one measured sentence. The first dry run over the 112
 * blanks made a Wikimedia scan of Thomas Mann's *Das Wunderkind* (1914) the live
 * picture of "Wunderkind", a kids' play space — because the old rule asked only
 * whether the candidate's title contained the place's name, and for a one-word
 * (or common-word) place name that question is nearly meaningless. The fix is
 * that tier 1 now needs the name AND evidence that the file is a PLACE: one of
 * these words, the neighbourhood/city, or a Commons category that says so.
 *
 * THE LIST IS THE PRODUCT'S OWN VOCABULARY, not a new one: the ten `PlaceKind`
 * values (`src/lib/types.ts`) as a title spells them (park, playground, museum,
 * pool, splash pad, library, beach, trail), plus the words the seed's own place
 * names are built from and a photographer would repeat (playfield, wading pool,
 * community center, P-Patch, tot lot).
 */
export const PLACE_SIGNAL_WORDS: readonly string[] = [
  // the ten PlaceKind values, as a title writes them
  'park', 'parks',
  'playground', 'playgrounds',
  'indoor play',
  'museum', 'museums',
  'pool', 'pools', 'swimming pool', 'wading pool', 'wading pools',
  'splash pad', 'splash pads', 'spray park', 'spray pad', 'sprayground',
  'library', 'libraries',
  'beach', 'beaches',
  'trail', 'trails',
  // the words this directory's own names are built from
  'playfield', 'playfields', 'play area', 'play areas', 'play lot', 'playlot',
  'tot lot', 'totlot', 'play structure', 'picnic area',
  'field', 'fields', 'court', 'courts', 'plaza', 'garden', 'gardens',
  'community center', 'community centre', 'community centers', 'community centres',
  'p patch', 'p patches', 'reservoir', 'zoo', 'fountain', 'fountains',
  'open space', 'greenway', 'shoreline', 'waterfront', 'boardwalk', 'pier',
  'forest', 'woodland',
]

/** Single words and multi-word phrases need different tests; split once, here. */
const PLACE_SIGNAL_SINGLE = new Set(PLACE_SIGNAL_WORDS.filter((term) => !term.includes(' ')))
const PLACE_SIGNAL_PHRASES = PLACE_SIGNAL_WORDS.filter((term) => term.includes(' '))

/**
 * The place-kind NOUNS that can sit inside a place's OWN name — "…Community
 * Center", "…Wading Pool", "…Playground". Derived from the signal vocabulary, so
 * the two lists cannot drift apart.
 */
const PLACE_KIND_NOUNS = new Set(
  PLACE_SIGNAL_WORDS.flatMap((term) => term.split(' ')).filter((word) => word.length > 2),
)

/**
 * The kind words the place calls ITSELF: "International District **Community
 * Center**" → ['community', 'center']; "Warren G Magnuson" → [].
 *
 * Used for the loose half of the name test (see `gateCandidate`): a bag of words
 * that happens to contain the place's distinctive tokens is only believed when
 * the title also echoes what kind of place it is. The measured failure is a
 * photograph of Hing Hay Park titled "…Chinatown-International District…" for the
 * place "International District Community Center": the neighbourhood supplied the
 * distinctive tokens, a different park supplied the place-kind word, and the
 * community center itself appears nowhere.
 */
export function placeKindWordsInName(name: string): string[] {
  const found: string[] = []
  for (const word of normalizeForMatch(name).split(' ')) {
    if (PLACE_KIND_NOUNS.has(word) && !found.includes(word)) found.push(word)
  }
  return found
}

/**
 * Does this text call itself a place? Word-wise, so "parking" is not "park" and
 * "counterpane" is not "court", and phrase-wise for "community center" and
 * "wading pool".
 */
export function hasPlaceKindWord(text: string): boolean {
  const normalized = normalizeForMatch(text)
  if (normalized === '') return false
  const padded = ` ${normalized} `
  if (PLACE_SIGNAL_PHRASES.some((phrase) => padded.includes(` ${phrase} `))) return true
  return normalized.split(' ').some((word) => PLACE_SIGNAL_SINGLE.has(word))
}

/**
 * What the directory knows about the place that a candidate can match on, beyond
 * its name. Both fields are optional because the data is optional: every seeded
 * `places.neighborhood_id` is NULL (migration 0029 says so in its own header),
 * so in practice only the city is ever supplied.
 */
export interface PlaceSignalContext {
  /** A neighbourhood the directory knows, when it knows one. */
  neighbourhood?: string | null
  /** The city the directory covers. The app is single-city: Seattle. */
  city?: string | null
  /** Extra text that may say what the candidate is (a Commons category list). */
  categories?: readonly string[] | null
  /**
   * The place's own coordinates, for the locality check. PostgREST returns
   * `numeric` as a STRING, so these are coerced with `Number` before use.
   */
  lat?: number | string | null
  lng?: number | string | null
}

/** A latitude/longitude pair. */
export interface LatLng {
  lat: number
  lng: number
}

/** `Number(value)` when it is a finite number, else null. Tolerates a numeric string. */
function toFiniteNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * How far a file may be geotagged from the place and still BE that place.
 *
 * Deliberately loose, because the check must never lose a real photo to an
 * approximate geotag: 50 km is wider than the Seattle metro, so a photo taken
 * across town passes, while the two measured wrong-locality hits — Brooklyn
 * (~3,900 km) and England (~7,700 km) — are nowhere near it.
 */
export const MAX_SAME_PLACE_KM = 50

/** Great-circle distance in km. Enough to answer "is this even the same city?". */
export function distanceKm(a: LatLng, b: LatLng): number {
  const earthRadiusKm = 6371
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const deltaLat = toRadians(b.lat - a.lat)
  const deltaLng = toRadians(b.lng - a.lng)
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(deltaLng / 2) ** 2
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(haversine)))
}

/**
 * Is the candidate's own location provably NOT this place?
 *
 * Only answered when BOTH sides state coordinates: a missing geotag is UNKNOWN,
 * never "wrong" (the same rule the rest of this codebase follows for absent
 * data). Three of the 112 blank places have `lat`/`lng` NULL, and they simply do
 * not get this check.
 */
export function isWrongLocation(candidate: SourceCandidate, context: PlaceSignalContext): boolean {
  const candidateLat = toFiniteNumber(candidate.coordinates?.lat)
  const candidateLng = toFiniteNumber(candidate.coordinates?.lng)
  const placeLat = toFiniteNumber(context.lat)
  const placeLng = toFiniteNumber(context.lng)
  if (candidateLat === null || candidateLng === null || placeLat === null || placeLng === null) {
    return false
  }
  return distanceKm({ lat: candidateLat, lng: candidateLng }, { lat: placeLat, lng: placeLng }) >
    MAX_SAME_PLACE_KM
}

/**
 * THE PLACE SIGNAL — the second half of the tightened tier-1 rule.
 *
 * True when the candidate's own words, or a Commons category it sits in, say it
 * is a place: a place-kind word, the neighbourhood/city, or — for a category —
 * the place's own name ("Category:Albert Davis Park" is the file stating its
 * subject). A category naming a place the file is NOT about cannot fire, because
 * this is only ever asked together with `titleNamesPlace`.
 */
export function hasPlaceSignal(
  placeName: string,
  text: string,
  context: PlaceSignalContext = {},
): boolean {
  const neighbourhood = context.neighbourhood ? normalizeForMatch(context.neighbourhood) : ''
  const city = context.city ? normalizeForMatch(context.city) : ''
  const readsAsAPlace = (value: string): boolean => {
    if (value === '') return false
    if (hasPlaceKindWord(value)) return true
    const padded = ` ${normalizeForMatch(value)} `
    if (neighbourhood !== '' && padded.includes(` ${neighbourhood} `)) return true
    return city !== '' && padded.includes(` ${city} `)
  }
  if (readsAsAPlace(text)) return true
  for (const raw of context.categories ?? []) {
    const category = String(raw ?? '')
    // A category that NAMES the place is the file's own statement of its
    // subject. This is asked of CATEGORIES ONLY: the candidate's own text
    // already names the place (that is the other half of the rule), so asking
    // it here would make the signal vacuous.
    if (readsAsAPlace(category) || titleNamesPlace(category, placeName)) return true
  }
  return false
}

/**
 * A YEAR THAT READS AS AN ARCHIVAL REPRODUCTION, not a recent photograph.
 *
 * The measured case: `Thomas Mann Das Wunderkind 1914` — a scan of a 1914
 * novella edition, whose file name carries the year of the WORK. The V18
 * pipeline measured the same shape at scale and drew the line at 1955 ("ca. 1910
 * - DPLA", "Hiawatha Playfield in 1913", "a 1950 diving photo"): a card for
 * "where should we go this afternoon" showing a 1911 photograph is the wrong
 * ANSWER even when it is the right SUBJECT.
 *
 * Deliberately title-only, never the description: a modern Flickr photo can
 * describe itself with a date ("our 1908 restoration") and losing a real photo of
 * the place to a word in its caption is the wrong error. A recent year (2025,
 * 2026) is not archival, and a long digit run (a geograph id, `1152815`) is not a
 * year because the boundaries do not fall inside it.
 */
export function carriesArchivalYear(title: string): boolean {
  // Underscores become spaces first: a Commons file name reaches us both ways —
  // `File:Thomas Mann Das Wunderkind 1914.jpg` and `Thomas_Mann_Das_Wunderkind_1914`
  // — and `\b` does not fall between `_` and `1` (both are word characters), so
  // the underscore form would slip through a naive test. This is the exact string
  // the defect was found on.
  //
  // ONLY A LOWERCASE-JOINED UNDERSCORE IS A SEPARATOR, which is a measured
  // distinction rather than a stylistic one: a prose title writes
  // `Wunderkind_1914`, while a camera file name writes `IMG_1914` and its digits
  // are a sequence number, not a year. Turning every underscore into a space
  // would drop every Flickr file named `IMG_1914`, and losing a real photo of the
  // place is the wrong error.
  const value = String(title).replace(/(?<=[a-z])_(?=\d)/g, ' ')
  for (const match of value.matchAll(/\b(1[89]\d\d)\b/g)) {
    if (Number(match[1]) < 1955) return true
  }
  return false
}

/**
 * HUMAN-REVIEWED REJECTIONS — the 2026-10-05 tier-1 list, read title by title.
 *
 * These are the wince cases that no rule reaches: the place's name really is in
 * the title, in its own order, and the photograph is still of something else. A
 * rule broad enough to catch "White house details, …, Washington Park, Seattle"
 * would also demote "Dogs at play, …, Warren G. Magnuson Dog Park, Seattle",
 * which is a real picture of the place — so instead of guessing, the reviewer
 * (this session, on the founder's behalf) read the list and said no.
 *
 * THEY ARE SCOPED TO THEIR PLACE, which is the point: "white house details" is
 * not a universal non-place word (a field house is a real thing), but it is
 * decisive for a park named Washington Park. Each entry carries WHY, because the
 * next reviewer has to be able to disagree with the reason rather than the code.
 *
 * THIS IS A MEASURED LIST, NOT A HEURISTIC — the same genus as `SOURCE_BLOCKLIST`
 * one screen up. It is keyed on the exact measured title, so a different
 * candidate for the same place is judged on its own merits next run.
 */
export interface ReviewedRejection {
  place: string
  titleIncludes: string
  why: string
}

export const REVIEWED_REJECTIONS: readonly ReviewedRejection[] = [
  {
    place: 'Washington Park',
    titleIncludes: 'white house details',
    why: 'the title is a list of architectural details — a house near the park, not the park',
  },
  {
    place: 'Pritchard Beach',
    titleIncludes: 'a babe of a house',
    why: 'the subject is a house (and a person), not the beach; the place name is only a location tag',
  },
]

/** The reason this title was rejected by hand for this place, or null. */
export function reviewedRejectionReason(placeName: string, title: string): string | null {
  const place = normalizeForMatch(placeName)
  const value = normalizeForMatch(title)
  for (const entry of REVIEWED_REJECTIONS) {
    if (normalizeForMatch(entry.place) !== place) continue
    if (value.includes(normalizeForMatch(entry.titleIncludes))) return entry.why
  }
  return null
}

/**
 * The gate's verdict on ONE candidate.
 *
 * `tier: null` means DROPPED — not demoted. The reason is carried because the
 * report has to be able to say why a place got nothing, and "the only three
 * results were a truck and two book scans" is a different fact from "the search
 * returned nothing".
 */
/**
 * WHY a candidate was dropped — ONE vocabulary, shared by the gate's verdict and
 * the report's audit trail, so the two cannot drift apart (they did once, and the
 * build caught it).
 */
export type DropReason =
  | 'blocklisted'
  | 'person-name'
  | 'archival'
  | 'reviewed-non-place'
  | 'wrong-location'

export type CandidateGateResult =
  | { tier: SourcingTier; reason: null }
  | { tier: null; reason: DropReason }

/**
 * THE GATE. Six questions, in this order:
 *
 *   1. is a person the subject? → DROP (the general form; a role word plus a
 *      capitalized name);
 *   2. is it a measured non-place subject, a book, a film or a scanned
 *      document? → DROP;
 *   3. did a human read this exact title and wince? → DROP;
 *   4. does the title carry an archival year (before 1955)? → DROP;
 *   5. is the FILE's own geotag provably not this place? → DROP (this is the one
 *      check that catches a perfect name match 4,000 km away);
 *   6. does the text name the place AND carry a place signal? → TIER 1, else
 *      TIER 2.
 *
 * The drops come first, and that ordering is the one real decision in this
 * function: a title can both name the place and be the wrong subject — "Seattle
 * City Councilmember Sally Clark at Seattle Animal Shelter" names "Seattle
 * Animal Shelter" and is still a photograph of a person at a podium. If the name
 * check ran first, that candidate would be tier 1 and LIVE TO PARENTS.
 *
 * THE FIFTH QUESTION IS THE SECOND HALF OF THE 2026-10-05 FIX, and it exists
 * because the fourth one cannot see locality. Commons name search is not
 * locality-bound: "Beacon Hill Playground" matched a playground in England and
 * "Ross Playground" matched Dan Ross Playground in Brooklyn, both with the right
 * name and a place-kind word. The file's own coordinates settle it — a geotag
 * 4,000 km away is not this place, whatever the title says.
 *
 * THE SIXTH QUESTION IS THE FIRST HALF. A name match alone is not enough for the
 * tier that goes live to parents: "Wunderkind" is a one-word place name, and every
 * book, pamphlet and scan whose text contains that word used to be tier 1. Now the
 * same title is tier 2 at best (stored, hidden), and an archival one is dropped.
 * The good ones still pass because a real photo of a park says "park",
 * "playground", "community center" or its own city.
 *
 * AND THE TWO HALVES OF THE NAME ARE NOT EQUAL. A VERBATIM name ("Albert Davis
 * Park") may use the city or a category as its signal; an ANY-ORDER token match
 * must be corroborated — the title has to echo the kind words the place calls
 * ITSELF ("community center", "wading pool"), because a bag of words can
 * reassemble into a different referent. Two measured failures: "Chinatown-
 * International District, Seattle, Washington" for the place "International
 * District Community Center" (the neighbourhood, not the building), and "Hing
 * Hay Park, Chinatown-International District, Seattle, Washington" (a different
 * park's photo, whose kind word "Park" belongs to Hing Hay, not to the center).
 *
 * NOTE WHAT IS NOT GATED: THE LICENCE. The candidate's licence is recorded and
 * reported, never used to refuse it — the founder's 2026-10-05 ruling is that
 * attribution is not wanted, and the spec pins "do not gate on it now". It stays
 * in the record so the same pipeline can start gating on it in one place if that
 * ruling ever changes.
 */
export function gateCandidate(
  placeName: string,
  candidate: SourceCandidate,
  context: PlaceSignalContext = {},
): CandidateGateResult {
  const text = candidateText(candidate)
  if (hasPersonNameShape(text)) return { tier: null, reason: 'person-name' }
  if (matchesBlocklist(text)) return { tier: null, reason: 'blocklisted' }
  if (reviewedRejectionReason(placeName, text) !== null) return { tier: null, reason: 'reviewed-non-place' }
  if (carriesArchivalYear(candidate.title ?? '')) return { tier: null, reason: 'archival' }
  if (isWrongLocation(candidate, context)) return { tier: null, reason: 'wrong-location' }
  if (!titleNamesPlace(text, placeName)) return { tier: 'tier2', reason: null }
  const categories = [...(candidate.categories ?? []), ...(context.categories ?? [])]
  if (!hasPlaceSignal(placeName, text, { ...context, categories })) return { tier: 'tier2', reason: null }
  // THE STRONG HALF: the place's own name, in its own order.
  if (placeNameAppearsVerbatim(text, placeName)) return { tier: 'tier1', reason: null }
  // THE LOOSE HALF needs the place's own kind words echoed ("community center"),
  // or — for a name that has no kind words of its own ("Warren G Magnuson") —
  // any place-kind word at all.
  const ownKind = placeKindWordsInName(placeName)
  const echoesKind =
    ownKind.length > 0
      ? ownKind.some(
          (word) =>
            hasWord(text, word) || categories.some((category) => hasWord(category, word)),
        )
      : hasPlaceKindWord(text) || categories.some((category) => hasPlaceKindWord(category))
  if (echoesKind) return { tier: 'tier1', reason: null }
  return { tier: 'tier2', reason: null }
}

/**
 * Is this word present in this text AS A WORD? ("center" is in "community center",
 * not in "centered".) The tiny companion to `normalizeForMatch`.
 */
export function hasWord(text: string, word: string): boolean {
  const normalized = normalizeForMatch(text)
  return normalized !== '' && normalized.split(' ').includes(normalizeForMatch(word))
}

/** One accepted candidate with the tier it earned. */
export interface RankedCandidate {
  tier: SourcingTier
  candidate: SourceCandidate
}

/** One rejected candidate, with the reason it was dropped. */
export interface DroppedCandidate {
  title: string
  reason: DropReason
}

export interface RankCandidatesResult {
  /** Every accepted candidate, ALL tier 1s before ANY tier 2, order preserved within a tier. */
  accepted: RankedCandidate[]
  /** How many candidates the gate dropped, so the report can say why a place got nothing. */
  rejected: number
  /**
   * WHY each one was dropped, in source order. The count alone says "all failed
   * the gate"; this is the part that lets a human check the gate's work without
   * re-running it — "the only results were a 1912 scan and a dump truck" is a
   * fact, and a gate nobody can audit is a gate nobody should trust.
   */
  dropped: DroppedCandidate[]
}

/**
 * Gate every candidate and rank them: tier 1 first, then tier 2, each keeping the
 * source's own order.
 *
 * DUPLICATES BY URL ARE COLLAPSED. Openverse aggregates Wikimedia, so the same
 * Commons file can arrive from both sources; without this, the shell would spend
 * a second request HEADing a URL it has already accepted.
 */
export function rankCandidates(
  placeName: string,
  candidates: readonly SourceCandidate[],
  context: PlaceSignalContext = {},
): RankCandidatesResult {
  const tier1: RankedCandidate[] = []
  const tier2: RankedCandidate[] = []
  const dropped: DroppedCandidate[] = []
  const seen = new Set<string>()
  let rejected = 0
  for (const candidate of candidates) {
    const url = (candidate.url ?? '').trim()
    if (url === '' || seen.has(url)) continue
    seen.add(url)
    const verdict = gateCandidate(placeName, candidate, context)
    if (verdict.tier === null) {
      rejected++
      dropped.push({ title: candidate.title, reason: verdict.reason })
      continue
    }
    const ranked: RankedCandidate = { tier: verdict.tier, candidate }
    if (verdict.tier === 'tier1') tier1.push(ranked)
    else tier2.push(ranked)
  }
  return { accepted: [...tier1, ...tier2], rejected, dropped }
}

/**
 * Why a place got nothing. The two codes the spec names, plus the source-failure
 * case that must never be reported as either of them.
 */
export type NoCandidateReason = '0 results' | 'all failed the gate'

export type CandidateChoice =
  | { tier: SourcingTier; candidate: SourceCandidate; rejected: number }
  | { tier: null; reason: NoCandidateReason; rejected: number }

/**
 * The single best candidate for one place, or the honest reason there is none.
 *
 * `'0 results'` is the sources answering with nothing; `'all failed the gate'` is
 * results that all turned out to be the wrong subject. They are kept apart
 * because they are different facts about the world — and NEITHER of them is
 * "the request failed", which the shell records as its own outcome so a 429 from
 * a rate-limited API is never written down as "this park has no photo".
 */
export function chooseSourceCandidate(
  placeName: string,
  candidates: readonly SourceCandidate[],
  context: PlaceSignalContext = {},
): CandidateChoice {
  if (candidates.length === 0) return { tier: null, reason: '0 results', rejected: 0 }
  const ranked = rankCandidates(placeName, candidates, context)
  const best = ranked.accepted[0]
  if (best === undefined) return { tier: null, reason: 'all failed the gate', rejected: ranked.rejected }
  return { tier: best.tier, candidate: best.candidate, rejected: ranked.rejected }
}

/** The review state a tier writes: tier 1 is live, tier 2 waits for a human. */
export function reviewStateForTier(tier: SourcingTier): PlacePhotoReviewState {
  return tier === 'tier1' ? 'confirmed' : 'unreviewed'
}

/**
 * The row patch for an applied candidate.
 *
 * It goes through `placePhotoPatch`, so the URL, its four provenance columns and
 * the review state are written TOGETHER — the same "never `photo_url` alone" rule
 * the moderator's editor follows, and the reason this module does not build the
 * patch itself (the one-copy rule).
 */
export function sourcingPhotoPatch(input: {
  tier: SourcingTier
  url: string
  sourceUrl?: string | null
  license?: string | null
  author?: string | null
}): Record<string, unknown> {
  return placePhotoPatch({
    photoUrl: input.url,
    sourceUrl: input.sourceUrl ?? null,
    license: input.license ?? null,
    author: input.author ?? null,
    reviewState: reviewStateForTier(input.tier),
  })
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

/**
 * One place's outcome, as the report records it.
 *
 * `'failed'` is a THIRD outcome and it is not a synonym for `'no-candidate'`: a
 * source that 429'd or timed out tells us NOTHING about whether a photo exists,
 * and the V18 pipeline already paid for learning that the hard way — a
 * measurement bug (403 without a User-Agent, 429 under fast pacing) presented as
 * the finding "0% of these parks have photos".
 */
export interface SourcingRow {
  placeId: string
  placeName: string
  kind?: string
  outcome: 'applied' | 'no-candidate' | 'failed'
  tier?: SourcingTier
  /**
   * The candidate's own title, as the source stated it.
   *
   * THE FOUNDER REVIEWS THIS LIST TITLE BY TITLE, and the URL alone cannot be
   * reviewed: a Flickr id says nothing about the subject, and a Commons file name
   * is percent-encoded inside the URL. Carrying the title here is what makes the
   * report's tier-1 list a review rather than a rumour.
   */
  title?: string | null
  url?: string | null
  source?: CandidateSource | null
  sourceUrl?: string | null
  license?: string | null
  /** Why there is no candidate, or how the request failed. */
  reason?: string | null
}

export interface SourcingReportInput {
  rows: readonly SourcingRow[]
  /** How many blank places the run was asked to fill (112 at the time of writing). */
  requested: number
  dryRun: boolean
  generatedAt?: string
}

/**
 * The report, as markdown — rendered by a PURE function so the arithmetic the
 * acceptance criteria rest on is the same arithmetic a test can check, rather
 * than string-building buried in a network script.
 *
 * ITS SECOND LIST IS THE PRODUCT: the `no candidate` places are the founder's
 * manual worklist, and the balance line (`applied + no candidate = requested`) is
 * the honest measure of what automation could not do. The count is printed so a
 * run that silently dropped rows is VISIBLE instead of merely quieter.
 */
export function renderSourcingReport(input: SourcingReportInput): string {
  const rows = input.rows
  const applied = rows.filter((row) => row.outcome === 'applied')
  const tier1 = applied.filter((row) => row.tier === 'tier1')
  const tier2 = applied.filter((row) => row.tier === 'tier2')
  const noCandidate = rows.filter((row) => row.outcome === 'no-candidate')
  const failed = rows.filter((row) => row.outcome === 'failed')
  const generatedAt = input.generatedAt ?? new Date().toISOString()
  const lines: string[] = []

  lines.push('# Place photos — sourcing run')
  lines.push('')
  lines.push(`Generated: ${generatedAt}`)
  lines.push(
    input.dryRun
      ? '**DRY RUN** — nothing was written. This is what a live run would do.'
      : '**LIVE RUN** — these rows were written to `places`.',
  )
  lines.push('')

  lines.push('## Summary')
  lines.push('')
  lines.push('| Outcome | Count | Meaning |')
  lines.push('|---|---|---|')
  lines.push(`| **applied, tier 1** | ${tier1.length} | the title names the place AND carries a place signal — live to parents |`)
  lines.push(`| **applied, tier 2** | ${tier2.length} | best remaining candidate — stored for review, HIDDEN from parents until confirmed |`)
  lines.push(`| **no candidate** | ${noCandidate.length} | the sources answered; nothing usable — the manual worklist below |`)
  lines.push(`| **request failed** | ${failed.length} | a source errored (429/403/network) — this is NOT "no photo exists" |`)
  lines.push(`| requested | ${input.requested} | blank places this run covered |`)
  lines.push('')
  lines.push(
    `Balance: applied ${applied.length} + no candidate ${noCandidate.length} = ` +
      `${applied.length + noCandidate.length} of ${input.requested} requested` +
      (failed.length > 0 ? ` (+${failed.length} failed, which is a fourth state, not a candidate answer)` : '') +
      '.',
  )
  lines.push('')

  lines.push('## Every place')
  lines.push('')
  lines.push('| Place | Outcome | Tier | Candidate title | Image | Source | Licence |')
  lines.push('|---|---|---|---|---|---|---|')
  for (const row of rows) {
    const outcome = row.outcome === 'no-candidate' ? `no candidate (${row.reason ?? 'unknown'})` : row.outcome
    lines.push(
      `| ${row.placeName} | ${outcome} | ${row.tier ?? '—'} | ${row.title ?? '—'} | ${row.url ?? '—'} | ${
        row.source ?? '—'
      } | ${row.license ?? '—'} |`,
    )
  }
  lines.push('')

  lines.push(`## Tier 1 (${tier1.length}) — LIVE to parents now`)
  lines.push('')
  lines.push(
    'These are the pictures a family sees today, so this is the list to read. Every one carries the ' +
      "place's name in its own title AND a place signal (a place-kind word, the city, or a Commons category).",
  )
  lines.push('')
  if (tier1.length === 0) lines.push('None.')
  for (const row of tier1) {
    lines.push(`- **${row.placeName}** — "${row.title ?? 'unknown title'}" — ${row.url ?? '—'}`)
  }
  lines.push('')

  lines.push(`## No candidate (${noCandidate.length}) — the founder's manual worklist`)
  lines.push('')
  if (noCandidate.length === 0) lines.push('None — every place this run covered got a picture.')
  for (const row of noCandidate) lines.push(`- **${row.placeName}** — ${row.reason ?? 'unknown reason'}`)
  lines.push('')

  if (failed.length > 0) {
    lines.push(`## Request failures (${failed.length}) — NOT the same as "no candidate"`)
    lines.push('')
    lines.push('These places are UNKNOWN, not empty. Re-run before treating them as work for a human.')
    lines.push('')
    for (const row of failed) lines.push(`- **${row.placeName}** — ${row.reason ?? 'unknown failure'}`)
    lines.push('')
  }

  lines.push('## What parents see while you review')
  lines.push('')
  lines.push(
    'Tier-1 pictures are live on `/browse` and `/place/:id` immediately. Tier-2 pictures are on the ' +
      'row and visible to you with a **review** badge, but parents keep the per-kind illustration ' +
      'until you confirm the picture in the place-photo editor.',
  )
  lines.push('')

  return lines.join('\n')
}

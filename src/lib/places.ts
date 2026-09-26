/**
 * V8 ticket 07: the PLACES seams — the pure, unit-testable decisions behind
 * the directory (see places.test.ts). No React, no Supabase: the pages and
 * db.ts call these, exactly like feed.ts's radius seams.
 *
 * Why a new module instead of more feed.ts: feed.ts owns the drop-in FEED
 * (ordering, day grouping, radius filtering). This owns the place ENTITY —
 * matching, filtering, distance, and labels over a directory row. The one
 * thing they share is the distance math (feed.haversineMiles), which is
 * imported rather than reimplemented.
 */
import {
  cardWhenLabel,
  coordNumber,
  haversineMiles,
  localDayKey,
  mapsHref,
  placeDistanceMiles,
  statedAgeRangeLine,
} from './feed'
import type { DistanceChoice, ZipCoords } from './feed'
import type { Place, PlaceKind } from './types'
import type { ReviewSummary } from './reviews'

/**
 * The distance seams live in feed.ts, next to the haversine math they use and
 * next to filterFeed — the one caller that must EXCLUDE on a null distance
 * while the directory keeps the place. They are re-exported here so a place
 * consumer has one import site (and so places.ts -> feed.ts stays the only
 * direction of that dependency: no cycle).
 */
export { coordNumber, placeDistanceMiles, postDistanceMiles } from './feed'

/**
 * The TRAILING 5-digit zip embedded in a stored address ("5614 22nd Ave.
 * N.W., Seattle, WA 98107" -> "98107"), or null. The `places` table has no zip
 * column — the zip, when present at all, lives inside the address string —
 * so this is the only way a place's zip reaches the gazetteer (V12 t05).
 *
 * The zip is the address's LAST 5-digit run, not its first: a 5-digit
 * NON-zip token (a 10000+ street number, a suite number) can precede the
 * zip, and taking the first would key the gazetteer to the wrong city —
 * 0029's header rule says never a fake pin.
 */
export function zipFromAddress(address: string | null | undefined): string | null {
  if (address === null || address === undefined) return null
  const runs = address.match(/\b\d{5}\b/g)
  if (runs === null) return null
  // .at(-1) is `string | undefined` by type even though a non-null match
  // guarantees a hit; `?? null` maps the (impossible) miss back to null.
  return runs.at(-1) ?? null
}

/**
 * A place's map coordinates (V12 t05): the place's OWN lat/lng first (the
 * 0029 columns, coerced — PostgREST returns numerics as strings at runtime,
 * which is what coordNumber is for), else the gazetteer's coordinates for the
 * zip embedded in the address (the 0012 fallback), else null.
 *
 * The null is 0029's header rule made concrete: a NULL coordinate means
 * UNKNOWN — the map renders NOTHING rather than a fake pin, and never a
 * 404-tile-flooding default view. No browser location access anywhere: every
 * coordinate in this chain is stored in the database.
 */
export function resolveMapCoords(
  place: { lat?: number | string | null; lng?: number | string | null; address?: string | null },
  zipCoords: ReadonlyMap<string, ZipCoords> | null,
): { lat: number; lng: number } | null {
  const lat = coordNumber(place.lat)
  const lng = coordNumber(place.lng)
  if (lat !== null && lng !== null) return { lat, lng }
  const zip = zipFromAddress(place.address)
  if (zip === null || zipCoords === null) return null
  const found = zipCoords.get(zip)
  return found === undefined ? null : { lat: found.lat, lng: found.lng }
}

/**
 * The place kinds the schema allows (the 0029 CHECK constraint, verbatim —
 * the DB is the backstop, this is the app's mirror).
 */
export const PLACE_KINDS = [
  'park',
  'playground',
  'indoor_play',
  'museum',
  'pool',
  'splash_pad',
  'library',
  'beach',
  'trail',
  'other',
] as const

/** The human label for a place kind (the place page + the list rows). */
export function placeKindLabel(kind: PlaceKind | string): string {
  switch (kind) {
    case 'park':
      return 'Park'
    case 'playground':
      return 'Playground'
    case 'indoor_play':
      return 'Indoor play'
    case 'museum':
      return 'Museum'
    case 'pool':
      return 'Pool'
    case 'splash_pad':
      return 'Splash pad'
    case 'library':
      return 'Library'
    case 'beach':
      return 'Beach'
    case 'trail':
      return 'Trail'
    default:
      return 'Place'
  }
}

/** "Indoor" / "Outdoor" — the place page's and the filter's one word. */
export function placeIndoorLabel(place: { indoor: boolean }): string {
  return place.indoor ? 'Indoor' : 'Outdoor'
}

/** `/place/:id` — the one place path builder (links never hand-roll it). */
export function placePath(placeId: string): string {
  return `/place/${encodeURIComponent(placeId)}`
}

/**
 * V23 slice 4 — `/place/:id/details`, the ONE details-path builder.
 *
 * The founder asked for a "Details" action on a place, next to "Start a
 * drop-in", reachable from the map popup, the picker's selection panel, and the
 * place page itself. Three call sites spelling `/place/${id}/details` by hand is
 * exactly how a destination drifts — one of them eventually omits the segment,
 * or encodes the id differently, and the control leads somewhere else. So the
 * path is built here, beside `placePath`, and every caller uses this.
 */
export function placeDetailsPath(placeId: string): string {
  return `/place/${encodeURIComponent(placeId)}/details`
}

/**
 * V23 slice 5 — "search the web for this place", the founder's own suggestion
 * for the details page:
 *
 *   *"you could click a link there that does a Google search in your browser for
 *    that location and then it can just like look up more information. That'd
 *    probably be like the easiest way to not have to maintain a database on all
 *    this but then still like get them to a place where they could learn more
 *    about the place."*
 *
 * That is the whole point of this seam: it buys the parent a route to
 * everything the wider web knows about a park without us curating a row of
 * facts we cannot maintain — the same reasoning that removed the 239 hand-kept
 * photos (V20 t01), and the same fallback family as `placeExternalUrl`, which
 * searches OpenStreetMap.
 *
 * WHAT GOES IN THE QUERY, and why the address earns its place: the directory
 * holds many similarly-named parks ("Baker Park" vs "Baker Park on Crown Hill"),
 * and a name-only search lands a parent on the wrong one. The address is added
 * when present because it is what disambiguates, and omitted cleanly when the
 * row has none (a null/blank address must not leave a stray comma in the URL,
 * which would search for a literal one). `null` for a nameless place — a search
 * for "" is a search for nothing, and the page hides the link rather than
 * offering a control that cannot help.
 */
export function placeWebSearchHref(
  place: Pick<Place, 'name'> & { address?: string | null },
): string | null {
  const name = place.name.trim()
  if (name === '') return null
  const address = (place.address ?? '').trim()
  const query = address === '' ? name : `${name}, ${address}`
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`
}

/** The one label for the `placeWebSearchHref` link — callers never spell it. */
export const PLACE_WEB_SEARCH_LABEL = 'Search the web for this place'

/**
 * The `place_id` insert key — present ONLY when the parent actually picked a
 * place (the `seriesIdField` pattern, V8 ticket 06; the 0021 address lesson
 * before it).
 *
 * Why the spread and not `place_id: input.placeId ?? null`: pre-0030-apply the
 * column does not exist, and a payload that always carries the key would make
 * EVERY insert fail with 42703 — including the free-text posts ("Somewhere
 * else") that are the whole existing corpus, and including the weekly-series
 * insert that today's live suite exercises. Omitted key = the missing column
 * is never touched, so every pre-0030 path stays byte-identical.
 */
export function placeIdField(placeId?: string | null): { place_id?: string } {
  if (typeof placeId !== 'string' || placeId === '') return {}
  return { place_id: placeId }
}

/**
 * V19 t02 — the FEED's map pins: one per drop-in that resolves to a coordinate,
 * each carrying the drop-in's REAL place identity where it has one.
 *
 * The founder's ask was a map on the posts screen showing "drop-ins CLOSEST to
 * you". This is the pure half of that.
 *
 * ---------------------------------------------------------------------------
 * WHY A PIN CARRIES `placeId` AND NOT JUST COORDINATES.
 *
 * The first version returned bare `{ lat, lng }`, and FeedPage synthesised a
 * fake `Place` around each one (`id: 'feed-pin-0'`). The `ocr` review lane
 * caught what that breaks, and it is not cosmetic: the shared map's marker panel
 * offers "Start a drop-in", which navigates to `/new` with
 * `placeId: selected.id`. `playdates.place_id` is a **uuid with an FK to
 * `places(id)`** (migration 0030 — re-verified against the live catalog), so
 * posting from that panel would try to insert the string `'feed-pin-0'` and fail
 * with a raw Postgres error. "Details" was equally broken, linking to
 * `/place/feed-pin-0`.
 *
 * THE FIX IS TO STOP INVENTING IDENTITY. A post that links a directory place
 * already knows which place it is; a post with no `place_id` is free text and
 * has no directory identity to offer. So a pin carries the real id when there is
 * one and null when there is not, and the caller renders such a pin without
 * offering place actions it could not honour.
 * ---------------------------------------------------------------------------
 *
 * THREE RULES, each a decision rather than an implementation detail:
 *
 * 1. **A post with no resolvable coordinate gets NO pin.** Free-text posts
 *    ("Somewhere else") carry `place_coords: null` — they name a place, not a
 *    location — and the map must not invent one. A made-up pin sends a parent to
 *    the wrong park.
 *
 * 2. **Posts at the same PLACE collapse to one pin.** The feed can hold several
 *    drop-ins at one place (a morning and an afternoon session). Two pins on the
 *    identical pixel make an unclickable pile. De-duplication keys on the PLACE
 *    when the post has one and on the coordinate otherwise, so two sessions at
 *    one park are one dot while two genuinely different spots both survive.
 *
 * 3. **Order is preserved from the input.** The caller passes posts in its own
 *    display order; nothing here re-sorts, because a map's draw order is not a
 *    ranking.
 *
 * 4. **A pin KEEPS every drop-in it collapsed (V25 t07).** Rule 2 makes one dot
 *    stand for 1..N drop-ins, so a bubble that names "the" event is a claim the
 *    pin cannot always honour: a morning and an afternoon session at one park
 *    are ONE dot, and naming only one of them presents a choice as the whole
 *    truth. So the collapse ACCUMULATES instead of discarding — the pin carries
 *    every event behind it, in the caller's order — and `feedMapPinEvent`
 *    below picks the SOONEST for the bubble and says how many others share the
 *    dot. The founder's own words, on tapping a blue circle on the feed: *"it
 *    make[s] more sense to tell you the name of the event that's happening
 *    there and some information about that."*
 */
export interface FeedMapPin {
  /** The drop-in's real directory place, or null for a free-text post. */
  placeId: string | null
  /** What to label the pin with: the post's own place text. */
  name: string
  address: string
  lat: number
  lng: number
  /**
   * EVERY drop-in this one dot stands for, in the caller's order — 1..N, never
   * empty for a pin that exists. A post that cannot be named as an event (no
   * id, or no parseable window) still contributes its PIN but no entry here;
   * see `pinEventForPost`.
   */
  events: FeedMapPinEvent[]
}

/**
 * ONE drop-in standing behind a feed pin (V25 t07).
 *
 * `id` is the post's own id and is what the bubble's `/playdate/:id` link is
 * built from, so an event without one is not an event this seam can report.
 */
export interface FeedMapPinEvent {
  /** The drop-in's own `playdates.id`. */
  id: string
  /** The post's own title, trimmed and never empty. */
  title: string
  /** The post's start, as stored (ISO). */
  startsAt: string
  /** The post's end, as stored (ISO). */
  endsAt: string
}

/**
 * The minimal post shape this seam reads — all optional, so
 * `PlaydateWithNeighborhood` satisfies it without a cast, exactly as the
 * previous inline type did.
 */
export interface FeedMapPinPost {
  id?: string | null
  title?: string | null
  starts_at?: string | null
  ends_at?: string | null
  place?: string | null
  address?: string | null
  place_id?: string | null
  place_coords?: { lat?: number | string | null; lng?: number | string | null } | null
}

/** What to call a drop-in whose own title is blank — the same shape of fallback
 *  the pin's own name uses (`Drop-in location`) rather than an empty line. */
const UNTITLED_DROP_IN = 'Drop-in'

/**
 * The event a post contributes to its pin, or null when the post cannot be
 * named as one.
 *
 * TWO REFUSALS, both deliberate:
 *
 *  - **No id.** The bubble's link is `/playdate/:id`, and a post with no id has
 *    no event page behind it. Every real row has one (`playdates.id` is the
 *    primary key), so this is the defensive half of the rule.
 *  - **No parseable window.** The bubble states when the drop-in starts, so an
 *    event whose `starts_at`/`ends_at` do not parse could only be named by
 *    printing "Invalid Date" (`formatTimeWindow`'s behaviour). Both columns are
 *    NOT NULL timestamptz on live data, so this cannot fire there either; it
 *    exists so that a malformed row degrades to the place-only popup — the
 *    pre-V25-t07 behaviour — instead of a popup that lies.
 */
function pinEventForPost(post: FeedMapPinPost): FeedMapPinEvent | null {
  const id = typeof post.id === 'string' ? post.id.trim() : ''
  if (id === '') return null
  const startsAt = typeof post.starts_at === 'string' ? post.starts_at : ''
  const endsAt = typeof post.ends_at === 'string' ? post.ends_at : ''
  if (Number.isNaN(Date.parse(startsAt)) || Number.isNaN(Date.parse(endsAt))) return null
  const title = (post.title ?? '').trim()
  return { id, title: title === '' ? UNTITLED_DROP_IN : title, startsAt, endsAt }
}

export function feedMapPins(posts: ReadonlyArray<FeedMapPinPost>): FeedMapPin[] {
  /** Key -> index in `pins`, so a later drop-in at the same place can be
   *  ACCUMULATED onto the pin its first post created (rule 4) rather than
   *  dropped. A `Set` cannot do that; this is the smallest thing that can. */
  const indexByKey = new Map<string, number>()
  const pins: FeedMapPin[] = []
  for (const post of posts) {
    /**
     * NO GAZETTEER PARAMETER, deliberately. The first version took a
     * `zipCoords` map so `resolveMapCoords` could fall back to a zip found in
     * the address — but that fallback can never fire here, and `ocr` was right
     * to flag the parameter as dead. `listRadiusFeed` stitches each post's
     * coordinates through `placeCoordsFor`, which returns a bare
     * `{ lat, lng } | null` with NO `address` field, so `resolveMapCoords`
     * never sees the address it would need. A parameter that no caller can
     * exercise is worse than none: it advertises behaviour the function does
     * not have. If the feed ever gains address-bearing coordinates, add the
     * parameter back WITH a caller that uses it.
     */
    const coords = resolveMapCoords(post.place_coords ?? {}, null)
    if (coords === null) continue
    const placeId =
      typeof post.place_id === 'string' && post.place_id !== '' ? post.place_id : null
    // Key on the PLACE where the post names one, so every drop-in there is one
    // dot; otherwise on the exact coordinate pair.
    const key = placeId ?? `${coords.lat},${coords.lng}`
    const event = pinEventForPost(post)
    const existing = indexByKey.get(key)
    if (existing !== undefined) {
      // Rule 4: the dot already exists — this drop-in joins it rather than
      // vanishing. The FIRST post at the place still owns the pin's identity
      // (name, address, coordinates), which is unchanged from before.
      if (event !== null) pins[existing].events.push(event)
      continue
    }
    indexByKey.set(key, pins.length)
    pins.push({
      placeId,
      name: (post.place ?? '').trim(),
      address: (post.address ?? '').trim(),
      lat: coords.lat,
      lng: coords.lng,
      events: event === null ? [] : [event],
    })
  }
  return pins
}

/**
 * V25 t07 — WHAT THE TAPPED PIN'S BUBBLE SAYS ABOUT ITS EVENT, ready to render.
 *
 * The founder, on `/`: *"when you click on a blue circle … it make[s] more sense
 * to tell you the name of the event that's happening there and some information
 * about that."* The pin used to carry no event identity at all, so the bubble
 * could only name the PLACE. This is the payload that fixes that, and it is
 * built here — pure, with a sibling test — so the component renders a decision
 * instead of making one.
 *
 * WHY IT CARRIES THE LABELS RATHER THAN THE RAW ROW. The `when` line goes
 * through `cardWhenLabel`, the card's own day + window rule (V25 t05), so a feed
 * card and the bubble over its pin cannot disagree about the same drop-in; the
 * `more` sentence is copy, and copy belongs next to the rule that decides it.
 * `PlaceMap` then has nothing to format and nothing to count.
 *
 * THE SHAPE OF THE ANSWER FOR A PIN THAT STANDS FOR SEVERAL DROP-INS: name the
 * SOONEST and say how many more share the dot. The alternative the ticket allows
 * — listing them all — does not fit this bubble: it is capped at `34vh` of
 * content by `index.css` (measured for a place panel: name + address + one 44px
 * action ≈ 200px of a 287px ceiling at 390×844), so a list would push the place
 * label and the panel's own actions out of reach for every pin with a second
 * session. Naming the soonest is the honest subset, and the count is what keeps
 * it from pretending to be the whole story.
 */
export interface MapPinEvent {
  /** The named drop-in's own id (`playdates.id`). */
  playdateId: string
  /** Its title — the founder's "name of the event". */
  title: string
  /** Its day + window through `cardWhenLabel`: "Sat, Sep 26 · 5 PM–6:30 PM". */
  whenLabel: string
  /** "2 more drop-ins here", or null when this dot stands for ONE drop-in — so
   *  a single-event pin says nothing extra rather than "0 more". */
  moreLabel: string | null
  /** `/playdate/:id` — the tap target that reaches the named EVENT. */
  href: string
}

/**
 * WHICH of a pin's events the bubble names: the SOONEST, by `starts_at`.
 *
 * NOT `events[0]`, and the difference is not hypothetical. Rule 3 keeps the
 * caller's order, and the caller's order happens to be the feed's display order
 * (soonest-first day sections) — but that is the CALLER's decision, and a bubble
 * that reads "the soonest" has to be true of the DATA rather than of a sort this
 * seam did not perform. Two events at the same instant keep input order (the
 * strict `<` below), so the rule is total and stable.
 *
 * An unparseable `starts_at` cannot win and cannot block: it is skipped, and a
 * list whose members are ALL unparseable falls back to its first member (the
 * same defensive posture as `pinEventForPost`, which normally keeps such an
 * event out of the list altogether).
 */
export function soonestFeedPinEvent(
  events: readonly FeedMapPinEvent[],
): FeedMapPinEvent | null {
  if (events.length === 0) return null
  let soonest = events[0]
  let soonestMs = Date.parse(soonest.startsAt)
  for (const event of events.slice(1)) {
    const ms = Date.parse(event.startsAt)
    if (Number.isNaN(ms)) continue
    if (Number.isNaN(soonestMs) || ms < soonestMs) {
      soonest = event
      soonestMs = ms
    }
  }
  return soonest
}

/** How a pin's overflow is stated. One source for the sentence, so the bubble
 *  and any spec assert the same words. */
export function pinMoreDropInsLabel(moreCount: number): string | null {
  if (moreCount <= 0) return null
  return moreCount === 1 ? '1 more drop-in here' : `${moreCount} more drop-ins here`
}

/**
 * The bubble payload for one feed pin — or null when the pin names no event
 * (every one of its posts was unnameable), which leaves the shared popup at
 * exactly its pre-V25-t07 place-only behaviour.
 */
export function feedMapPinEvent(pin: FeedMapPin): MapPinEvent | null {
  const soonest = soonestFeedPinEvent(pin.events)
  if (soonest === null) return null
  return {
    playdateId: soonest.id,
    title: soonest.title,
    whenLabel: cardWhenLabel(soonest.startsAt, soonest.endsAt),
    moreLabel: pinMoreDropInsLabel(pin.events.length - 1),
    // Spelled here rather than at the call site, the same reason `placePath`
    // exists: one builder, so the bubble and (later) anything else that links a
    // drop-in cannot drift to different URLs. `/playdate/:id` is the route
    // `DropInCard` and the detail page already use.
    href: `/playdate/${encodeURIComponent(soonest.id)}`,
  }
}

/**
 * The place a piece of FREE TEXT names, by EXACT name (case- and
 * whitespace-insensitive) — or null.
 *
 * Where this is used and why it is exact rather than fuzzy: the "Recent places"
 * chips and a duplicate prefill both hand /new a place STRING that was typed on
 * an earlier post, long before the directory existed. Those strings are either
 * a directory name already or they are not, and this is the only rule that can
 * decide it without inventing a link. Fuzzy matching here would silently attach
 * "Green Lake playground, near the boathouse" to some other park, which is
 * exactly the failure the seed's human check exists to prevent — so a
 * non-match keeps place_id NULL and the post stays free text (fully supported).
 * The typed text is NEVER rewritten; only the id is attached.
 */
export function resolvePlaceByName(
  place: string | null | undefined,
  places: readonly Place[],
): Place | null {
  const wanted = (place ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
  if (wanted === '') return null
  return (
    places.find((candidate) => candidate.name.replace(/\s+/g, ' ').trim().toLowerCase() === wanted) ??
    null
  )
}

/**
 * The /new (and /browse) place matcher — case-insensitive, prefix matches
 * rank above substring matches, NO fuzzy library (pinned).
 *
 * Ranks, in order: 0 = the NAME starts with the query; 1 = a WORD in the name
 * starts with it ("lake" finds "Green Lake Park"); 2 = the name contains it
 * anywhere; 3 = only the ADDRESS contains it (so a parent who types a street
 * still finds the playground on it). Ties break alphabetically by name, then
 * by id, so the order is STABLE — the same query over the same rows never
 * reshuffles between renders.
 *
 * An empty or whitespace-only query matches NOTHING (returns []): "nothing is
 * typed, nothing is matched" is the caller's decision to render, and a matcher
 * that silently returned the whole directory capped at `limit` would be a
 * different feature wearing this one's name. A non-positive `limit` returns [].
 */
export function matchPlaces(query: string, places: readonly Place[], limit: number): Place[] {
  const needle = query.trim().toLowerCase()
  if (needle === '' || limit <= 0) return []
  const scored: Array<{ rank: number; place: Place }> = []
  for (const place of places) {
    const name = place.name.toLowerCase()
    const address = (place.address ?? '').toLowerCase()
    let rank: number
    if (name.startsWith(needle)) {
      rank = 0
    } else if (name.split(/\s+/).some((word) => word.startsWith(needle))) {
      rank = 1
    } else if (name.includes(needle)) {
      rank = 2
    } else if (address.includes(needle)) {
      rank = 3
    } else {
      continue
    }
    scored.push({ rank, place })
  }
  scored.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank
    const byName = a.place.name.localeCompare(b.place.name)
    if (byName !== 0) return byName
    return a.place.id < b.place.id ? -1 : a.place.id > b.place.id ? 1 : 0
  })
  return scored.slice(0, limit).map((entry) => entry.place)
}

/** How many suggestions the /new autocomplete shows (ticket 07 pin). */
export const PLACE_SUGGESTION_LIMIT = 6

/**
 * How many rows the picker's BROWSE list shows (V9 ticket 01). Deliberately
 * larger than PLACE_SUGGESTION_LIMIT: browsing is "show me the directory",
 * typing is "find this one", and 239 rows rendered inline on a phone would
 * bury the rest of the form. The full directory with its filters is /browse
 * (V8 ticket 07) — this list is the shortcut beside the field.
 */
export const PLACE_BROWSE_LIMIT = 8

/**
 * The /new place picker's label (V9 ticket 01). The ticket's words, verbatim:
 * the field used to read as a plain text box, so nobody discovered that one
 * tap fills place + address. It is now the first field AND it says what it is.
 */
export const PLACE_PICKER_LABEL = 'Where? — pick a place'

/** The visible affordance beside the field that opens the directory list. */
export const BROWSE_PLACES_LABEL = 'Browse places'

/**
 * The picker's text with its ALIAS removed: a single leading `@` is a gesture
 * ("open the picker"), never part of a place name, so it is stripped here and
 * trimmed. This is the ONE rule, used in three places that must agree:
 *
 *  1. MATCHING — what the typed text means for the directory, and what a bare
 *     `@` means (the empty query → the browse list).
 *  2. THE TITLE SEED — /new's "Playdate at <place>" default (V8 ticket 01).
 *     Without this, the most natural use of the alias (type `@`, pick from the
 *     list) seeded the title "Playdate at @" and — because the seed never
 *     overwrites — POSTED it. Found by e2e/post-location, fixed here: the
 *     alias is not text, so it cannot reach a title.
 *  3. THE SUBMITTED PLACE — a parent who types `@` and picks nothing has
 *     typed no place at all, so the validator asks for one instead of
 *     accepting the bare character.
 *
 * What is NOT rewritten: the FIELD's text while the parent types (the
 * resolvePlaceByName pin — the app never moves text under a finger). The
 * alias only disappears from the values the app derives from it.
 */
export function stripPlaceAlias(raw: string): string {
  const trimmed = raw.trim()
  const withoutAlias = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed
  return withoutAlias.trim()
}

/** True when the field's text starts with the `@` picker alias. */
export function usesPlaceAlias(raw: string): boolean {
  return raw.trim().startsWith('@')
}

/**
 * What PICKING a place writes into the /new form — the ticket-01 one-tap rule,
 * as a pure seam so a unit test holds it rather than a React page's handler:
 * the place's name, its address, and the neighbourhood FORM VALUE.
 *
 * THE FORM VALUE, not the database's answer: the form's "no neighbourhood" is
 * `''` (the shape's own rule — see feed.PlaydateFormValues), so a place with
 * none yields `''`, not null.
 *
 * THE PRECEDENCE IS IN THE SIGNATURE, deliberately: this takes ONLY the place.
 * A picked place REPLACES the form's neighbourhood — including replacing it
 * with nothing — so there is no "previous value" it could fall back to.
 *
 * That is a fix, not a style choice (review cycle 1, F1): an earlier version
 * took the place's neighbourhood `?? prev.neighborhoodId`, and on /new that
 * previous value can be a REAL id the parent cannot see. A "Recent places" chip
 * (V8 ticket 01) writes the remembered post's neighbourhood into the form
 * (`applyRecentPlace`), and /new renders NO neighbourhood field (showNeighborhood
 * = false), so tapping a chip for an older post and then picking a directory
 * place — whose neighbourhood is NULL for every one of the 239 seeded rows —
 * kept the chip's id and wrote it. The post then carried the OLD place's
 * neighbourhood next to the NEW place: invisible to the parent, and wrong in the
 * data. With the previous value unreachable, that state cannot be expressed.
 *
 * What this does NOT do: invent a fallback (no "nearest neighbourhood", no
 * host-zip guess). The directory is the only authority on which neighbourhood a
 * place is in, and where it says nothing the honest answer is nothing.
 */
export function placePickPatch(place: Place): {
  place: string
  address: string
  neighborhoodId: string
} {
  return {
    place: place.name,
    // The directory's address is NOT NULL (0029:128 — the seed drops any row
    // without one), so this is the row's street verbatim: no '' fallback is
    // needed and none is invented.
    address: place.address,
    neighborhoodId: place.neighborhood_id ?? '',
  }
}

/**
 * V15 ticket 04: the external URL for a place (the "Learn more" link in the
 * marker panel and the browse list rows). Places have no canonical URL column,
 * so one is derived: an OpenStreetMap search URL for the place's name + city
 * (Seattle — the city the app serves). The caller renders it as a new-tab link
 * (`target="_blank" rel="noopener"`); when this returns null the caller shows
 * the place's details inline instead of a broken link.
 *
 * Returns null only when the name is empty or whitespace-only (defensive — a
 * place without a name cannot be searched anywhere).
 */
export function placeExternalUrl(place: Pick<Place, 'name'>): string | null {
  const name = place.name.trim()
  if (name === '') return null
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(name)},+Seattle`
}

/**
 * V20 t01 — WHERE "Learn more" ACTUALLY GOES.
 *
 * The founder's ruling, in their words: *"instead of using images, we just try
 * to link to the website for that place so people can learn more about it…
 * maybe we have to get rid of the image part of this because I can't police
 * this and fix all the broken images."*
 *
 * The directory's 239 rows were scraped from the city's open data and NO
 * source field carried an operator website, so `places.website_url` starts
 * empty for nearly every row. This seam is what keeps that from being a dead
 * button, and its precedence is the whole of the decision:
 *
 *   1. **A stored, fetchable `website_url` wins.** It is the place's own site —
 *      the thing a parent actually wants — and it is only ever written by the
 *      reviewed backfill, never by a user.
 *   2. **Otherwise the OSM search link** (`placeExternalUrl`). It is not the
 *      operator's site, so it is *labelled as a map search* by the caller
 *      rather than dressed up as the official page. A generic-but-honest link
 *      beats a broken one, and it beats a button that does nothing.
 *   3. **No name and no URL → null.** A place we cannot search for anywhere has
 *      no "learn more" to offer, and the caller renders nothing rather than an
 *      `href=""` (the same rule the photo credit's source link follows).
 *
 * WHY `http`/`https` IS CHECKED AND NOT JUST "non-empty": the column is text
 * with no CHECK constraint (the 0021 lesson — no DB-level shape for a value a
 * human hand-corrects later), so a row could hold anything. A `javascript:`
 * value rendered into an `href` is an injection vector, and the caller puts
 * this straight into an anchor. Only a well-formed http(s) URL is accepted;
 * anything else falls through to the search link exactly as a NULL would.
 *
 * The `kind` of link is returned ALONGSIDE the URL, because a caller must never
 * pair the wrong label with the wrong href — and that is a decision, not a
 * render detail (the build law's split, expressed as a return shape). The
 * DIRECTORY row (`PlaceDirectory.tsx`) and the map panel (`PlaceMap.tsx`) still
 * read it for their labels ("Visit website" vs "Find it on the map"); the place
 * PAGE stopped labelling from it in V25 t04 (both kinds now read "Learn more",
 * because "Find it on the map" sat under a map and made no sense), and keeps
 * `data-link-kind` on the anchor as the honesty channel instead.
 */
export interface PlaceLearnMoreLink {
  url: string
  /** 'website' = the place's own site; 'map-search' = the derived OSM search. */
  kind: 'website' | 'map-search'
}

export function placeLearnMoreLink(
  place: Pick<Place, 'name'> & { website_url?: string | null },
): PlaceLearnMoreLink | null {
  const stored = (place.website_url ?? '').trim()
  if (stored !== '' && /^https?:\/\/\S+$/i.test(stored)) {
    return { url: stored, kind: 'website' }
  }
  const search = placeExternalUrl(place)
  return search === null ? null : { url: search, kind: 'map-search' }
}

/**
 * V25 t04 — THE PLACE PAGE'S TWO OUTBOUND ACTIONS: "Learn more" and "Get
 * directions".
 *
 * The founder, on the page: *"I think inside each place, the information should
 * be sequenced differently… you've got a text description of the place, And
 * then you have two buttons next to each other. Probably one that's like, learn
 * more, that does the Google search on it, and the other one's like, get
 * directions, just like, takes you to, like a map of it."* He said it while
 * pointing at a control labelled "Find it on the map" that sat UNDER the page's
 * map: *"This doesn't really make sense to me because I can see the map above
 * this button."*
 *
 * BOTH DESTINATIONS ALREADY EXIST and this composes them without building a
 * single URL of its own:
 *   * `learnMore` — V20 t01's chain (the verified operator site, else the
 *     derived OSM search, else nothing). Unchanged, still the wider-web door.
 *   * `directions` — `feed.mapsHref`, the SAME href the address link above the
 *     map and the feed card's address row already use. One builder, so the
 *     address and the button cannot drift; `null` on a blank address, and the
 *     page then renders NO "Get directions" control rather than a dead one
 *     (the feed card's no-address convention).
 *
 * WHY THIS IS A SEAM AND NOT TWO INLINE CALLS IN THE PAGE. "Get directions is
 * absent when the place has no address" is an acceptance criterion, and this
 * repo has no component-test harness (vitest runs in the node environment —
 * there is no jsdom, no RTL), so nothing can render-assert the absence. A pure
 * seam can: the sibling tests state the exact pair of facts the page's
 * `!== null` conditionals consume (no address → `directions: null` while
 * `learnMore` survives; an address → `directions` is byte-equal to
 * `mapsHref`). The render test of the PRESENT case lives in
 * `e2e/places.e2e.ts` (V25 t04).
 */
export interface PlaceOutboundLinks {
  /** The V20 t01 chain; null only when the place has neither a usable site nor a name. */
  learnMore: PlaceLearnMoreLink | null
  /** Google Maps for the place's address; null when there is no address to search for. */
  directions: string | null
}

export function placeOutboundLinks(
  place: Pick<Place, 'name'> & { address?: string | null; website_url?: string | null },
): PlaceOutboundLinks {
  return {
    learnMore: placeLearnMoreLink(place),
    directions: mapsHref(place.name, place.address),
  }
}

/**
 * V20 t05 — how big the drawn radius circle is while the parent is still
 * DRAGGING the slider in "Set location", in miles.
 *
 * The founder's ask: *"when you click on set location and you drag the radius,
 * it should expand or grow the red circle in real time over the map. So you can
 * see how much that takes up over the map. This is what Facebook Marketplace
 * does."*
 *
 * BEFORE THIS: the circle was `framingCircle({ geocodeCenter, … })`, and
 * `geocodeCenter` is only ever set by pressing "See places" — so dragging the
 * slider changed a number in the dialog and moved nothing on the map behind it.
 * The parent had to guess, commit, and look.
 *
 * THE PRECEDENCE, and why it is this way round:
 *
 *   1. **A live preview wins when there is one.** Dragging is the action the
 *      parent is performing RIGHT NOW; the map must answer it.
 *   2. **Otherwise the pinned centre**, unchanged — the pre-t05 behaviour, byte
 *      for byte. Closing the dialog clears the preview and the map returns to
 *      whatever the committed centre says.
 *
 * THE CENTRE IS `previewCenter` AND NOT THE COMMITTED ONE, deliberately. A
 * preview exists before any geocode has succeeded *for this address*, so
 * anchoring it on a previously committed centre would draw the new radius
 * around the wrong part of the city — a circle that is precise and wrong, which
 * is worse than no circle.
 *
 * A preview whose radius is not a usable positive number, or whose centre is
 * not finite, is IGNORED (the caller's pinned centre is returned): this value
 * comes off an `<input type="range">` and a NaN reaching `L.circle` blanks the
 * layer. Returning null when there is neither is the existing contract — "no
 * circle to frame", and the map keeps its mount view.
 */
export function radiusPreviewCircle(input: {
  /** The centre the parent is previewing against, or null when there is none. */
  previewCenter: { lat: number; lng: number } | null
  /** The radius in miles currently selected in the dialog. */
  previewMiles: number
  /** The committed geocoded centre (set by "See places"), or null. */
  geocodeCenter: { lat: number; lng: number } | null
  /** The viewer's home pin, the fallback anchor. */
  homePin: { lat: number; lng: number } | null
  /** The radius for the committed/home frame — the map's focus radius. */
  committedMiles: number
}): FramingCircle | null {
  const { previewCenter, previewMiles, geocodeCenter, homePin, committedMiles } = input
  if (
    previewCenter !== null &&
    Number.isFinite(previewCenter.lat) &&
    Number.isFinite(previewCenter.lng) &&
    Number.isFinite(previewMiles) &&
    previewMiles > 0
  ) {
    return { center: previewCenter, radiusMiles: previewMiles }
  }
  return framingCircle({ geocodeCenter, homePin, radiusMiles: committedMiles })
}

/**
 * V18 t04: the credit line to render over a place photo, or null when there is
 * nothing to credit.
 *
 * THIS IS A LICENCE-COMPLIANCE FUNCTION, not decoration. The photos V18 sources
 * from Wikimedia Commons are CC BY / CC BY-SA / CC0 / public domain, and the
 * first two REQUIRE attribution as a condition of use. So the credit is not
 * optional polish that can be dropped when the card looks cramped.
 *
 * It is a seam rather than an inline expression because the render must decide
 * NOTHING (the build law) and because three separate facts have to agree:
 *
 *   1. **No photo ⇒ no credit.** The illustration fallback is the app's own
 *      drawing; crediting its author to Commons would be a lie.
 *   2. **A photo with no stored attribution ⇒ null**, NOT an empty string and
 *      not a placeholder. The backfill writes the attribution line itself
 *      (`buildAttribution`, `commons.ts`), so a missing one means a row was
 *      written outside the pipeline — the render should show nothing rather
 *      than invent a credit.
 *   3. **Whitespace-only counts as missing**, because a card pinned to a corner
 *      label should not reserve space for a string that renders as blank.
 *
 * The `photo_url` check mirrors `PlacePhotoSlot`'s own branch condition
 * exactly (`!== null && !== ''`), so the credit can never appear on a slot that
 * took the illustration branch. Those two conditions are pinned together by a
 * unit test rather than by hope.
 */
export function photoCreditLine(place: Place): string | null {
  const hasPhoto = place.photo_url !== null && place.photo_url !== ''
  if (!hasPhoto) return null
  const credit = (place.photo_attribution ?? '').trim()
  return credit === '' ? null : credit
}

/**
 * The directory, A→Z, capped — the BROWSE list. Deterministic (name, then id,
 * the matchPlaces tiebreak) so the same directory never reshuffles between
 * renders, and NOT a ranking: browsing shows the alphabet, not a guess at
 * relevance. A non-positive limit returns [] (matchPlaces' contract).
 */
export function browsePlaceList(places: readonly Place[], limit: number): Place[] {
  if (limit <= 0) return []
  return [...places]
    .sort((a, b) => {
      const byName = a.name.localeCompare(b.name)
      if (byName !== 0) return byName
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })
    .slice(0, limit)
}

/**
 * What the picker's inline list SHOWS (V9 ticket 01) — the one decision both
 * the typed path and the "Browse places" button funnel through.
 *
 * - a query (after the `@` alias is stripped) → matchPlaces' ranked matches,
 *   exactly as before this ticket.
 * - no query + `browsing` (the Browse button, or a bare `@`) → the directory
 *   itself, A→Z, capped. Without this a bare `@` would render an empty list,
 *   which is not an alias for anything.
 * - no query + not browsing → [] : "nothing typed, nothing matched" stays the
 *   caller's decision to render (and the list stays closed).
 */
export function placePickerMatches(
  raw: string,
  places: readonly Place[],
  limit: number,
  browsing: boolean,
): Place[] {
  const query = stripPlaceAlias(raw)
  if (query !== '') return matchPlaces(query, places, limit)
  return browsing ? browsePlaceList(places, limit) : []
}

/**
 * The "Somewhere else" row's identity in the /new suggestion list: picking it
 * means FREE TEXT — the typed place stays as-is and place_id stays null (the
 * pinned escape hatch; the app must never lock a parent out of meeting at a
 * place the directory does not know).
 */
export const SOMEWHERE_ELSE_LABEL = 'Somewhere else'

/**
 * The place page's age line: "Best for ages 2–5", "Best for ages 5 and up",
 * "Best for ages 3 and under", or null when the data says nothing (the render
 * omits the line — an empty "Best for ages" is not a state).
 *
 * V9 ticket 05: this is now `'Best for ' + feed.statedAgeRangeLine` — the SAME
 * seam a drop-in's own `age_min` / `age_max` pair goes through (the /new "Ages
 * (optional)" chips). The two rows carry the identical shape, so they must
 * carry the identical words: before this, a one-sided band read "5 and up" here
 * and "age 5" on a card, i.e. two spellings of one fact. The output is
 * unchanged, byte for byte (its unit tests below were not touched), and the
 * place page's copy keeps its own "Best for " prefix.
 */
export function placeAgeFitLabel(place: {
  age_min: number | null
  age_max: number | null
}): string | null {
  const range = statedAgeRangeLine(place.age_min, place.age_max)
  return range === null ? null : `Best for ${range}`
}

/**
 * "N upcoming" for a place row — the count of upcoming drop-ins AT that place.
 *
 * Pluralized honestly: 1 is "1 upcoming", 0 is "Nothing planned yet" (a
 * "0 upcoming" chip reads as a bug, and the zero state is information — this
 * place is empty, be the first). `count` null means the count is UNKNOWN (the
 * count query failed, e.g. pre-0030-apply when playdates.place_id does not
 * exist yet): the caller renders NOTHING rather than inventing a zero.
 */
export function placeUpcomingLabel(count: number | null): string | null {
  if (count === null) return null
  if (count === 0) return 'Nothing planned yet'
  return count === 1 ? '1 upcoming' : `${count} upcoming`
}

/**
 * Upcoming drop-ins per place, for the browse list's "N upcoming" chips.
 * Rows with no place_id are skipped (a free-text place is not in the
 * directory, so it counts toward nothing).
 */
export function upcomingCountByPlace(
  posts: ReadonlyArray<{ place_id?: string | null }>,
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const post of posts) {
    const placeId = post.place_id
    if (placeId === null || placeId === undefined || placeId === '') continue
    counts.set(placeId, (counts.get(placeId) ?? 0) + 1)
  }
  return counts
}

/**
 * Upcoming drop-in START TIMES per place, for the browse list's date chips
 * (annotation 15). Rows with no place_id are skipped (a free-text place is not
 * in the directory, so it claims no window). Each value is a sorted array of
 * ISO start times — the ONE datum that lets a window ask "does this place have
 * ANY drop-in on THIS day?" rather than merely "does it have any at all?".
 */
export function groupUpcomingStartTimesByPlace(
  posts: ReadonlyArray<{ place_id?: string | null; starts_at: string }>,
): Map<string, string[]> {
  const byPlace = new Map<string, string[]>()
  for (const post of posts) {
    const placeId = post.place_id
    if (placeId === null || placeId === undefined || placeId === '') continue
    const arr = byPlace.get(placeId) ?? []
    arr.push(post.starts_at)
    byPlace.set(placeId, arr)
  }
  // Sort each place's starts ascending (soonest first) — the same order the
  // place page's "upcoming drop-ins here" list uses.
  for (const arr of byPlace.values()) arr.sort()
  return byPlace
}

/**
 * The directory's DATE CHIPS (the founder's annotation 15): the four windows a
 * parent can filter the list by. 'upcoming' is the UNFILTERED state — every row
 * the other filters allow — so it is the default, not a window.
 */
export type DateWindow = 'upcoming' | 'today' | 'tomorrow' | 'weekend'

/** The chip labels, in render order (the control's single-choice set). */
export const DATE_WINDOW_LABELS: Record<DateWindow, string> = {
  upcoming: 'Upcoming',
  today: 'Today',
  tomorrow: 'Tomorrow',
  weekend: 'Weekend',
}

/** The chip values in render order — the control iterates this. */
export const DATE_WINDOWS: readonly DateWindow[] = ['upcoming', 'today', 'tomorrow', 'weekend']

/**
 * Does a place with the given upcoming drop-in START TIMES fall inside the date
 * window?
 *
 * The window BOUNDARIES are the feed's own day sections (`localDayKey` in
 * feed.ts — "Today" when the local-day key equals now's, "Tomorrow" for the next
 * local day, otherwise a weekday label). This seam asks the question the chips
 * need — "does this place have ANY drop-in whose start falls in that window?" —
 * from the per-place start-time list (db.upcomingStartTimesByPlace):
 *
 * - 'upcoming': never filters (the unfiltered default; everything the other
 *   filters allow passes through).
 * - 'today': at least one start whose local-day key equals now's.
 * - 'tomorrow': at least one start whose local-day key equals tomorrow's
 *   (now + 1 local day, the same arithmetic formatDayLabel uses for its
 *   "Tomorrow" label).
 * - 'weekend': at least one start on the UPCOMING Saturday or Sunday — the
 *   first Saturday/Sunday strictly after today (if today IS Saturday or Sunday,
 *   the weekend is the NEXT one, not the current one). A drop-in starting on a
 *   weekday does NOT satisfy the weekend window.
 *
 * UNKNOWN dates (null — the read failed, or the place has no recorded starts)
 * are NOT claimed by any specific window: we cannot measure them against the
 * filter, so they are excluded from today/tomorrow/weekend but still shown under
 * 'upcoming'. This is the radius convention ("cannot be measured against the
 * filter"), not the distance convention ("never hidden") — a date window is a
 * claim about WHEN, and missing data cannot back that claim. The place is never
 * hidden entirely: 'upcoming' always passes it through.
 */
export function placeInDateWindow(
  startTimes: string[] | null,
  window: DateWindow,
  nowIso: string,
): boolean {
  if (window === 'upcoming') return true
  // Unknown dates cannot be measured against a specific window (radius rule).
  if (startTimes === null || startTimes.length === 0) return false

  const nowDay = localDayKey(nowIso)
  const tomorrowDate = new Date(nowIso)
  tomorrowDate.setDate(tomorrowDate.getDate() + 1)
  const tomorrowDay = localDayKey(tomorrowDate.toISOString())

  if (window === 'today') {
    return startTimes.some((t) => localDayKey(t) === nowDay)
  }
  if (window === 'tomorrow') {
    return startTimes.some((t) => localDayKey(t) === tomorrowDay)
  }
  // 'weekend': the upcoming Saturday + Sunday (strictly after today).
  const nowDow = new Date(nowIso).getDay() // 0=Sun … 6=Sat
  // Days until the next Saturday: if today is Sat (6), the next Sat is +7;
  // if Sun (0), +6; Mon (1) → +5; … Fri (5) → +1.
  const daysToSat = nowDow === 6 ? 7 : 7 - nowDow
  const satDate = new Date(nowIso)
  satDate.setDate(satDate.getDate() + daysToSat)
  const satDay = localDayKey(satDate.toISOString())
  const sunDate = new Date(satDate)
  sunDate.setDate(sunDate.getDate() + 1)
  const sunDay = localDayKey(sunDate.toISOString())
  return startTimes.some((t) => {
    const k = localDayKey(t)
    return k === satDay || k === sunDay
  })
}

/**
 * The honest empty-state copy for a date window that matched nothing: names the
 * window and offers the way back to "Upcoming" (the house empty-state pattern —
 * see RadiusEmptyState's "Nothing within N miles yet." + escapes). The window
 * label comes from DATE_WINDOW_LABELS so the copy can never drift from the
 * chip's own text.
 */
export function dateWindowEmptyCopy(window: Exclude<DateWindow, 'upcoming'>): string {
  return `No ${DATE_WINDOW_LABELS[window].toLowerCase()} plans near you yet — show Upcoming instead.`
}

/** One browse row: the place + the distance the list sorted and filtered on. */
export interface PlaceListRow {
  place: Place
  /** Null = unknown (no coordinates, no home zip) — sorted last, never hidden. */
  distanceMiles: number | null
  /** Upcoming drop-ins here; null = the start-time read failed (unknown). */
  upcomingCount: number | null
  /**
   * The place's aggregate rating (the DB-computed display average + review
   * count), or null when it is unknown: the bulk read failed, or the place has
   * no reviews at all. A null summary NEVER renders as a 0.0 — the card shows
   * nothing instead (the honest zero case, the `upcomingCount` convention).
   */
  ratingSummary: ReviewSummary | null
}

/**
 * The viewer's place filters (the browse screen's controls). Every one of them
 * is OPTIONAL and its "off" value is the one that excludes nothing, so the
 * unfiltered directory is the default state and each control only ever narrows
 * what the parent asked to narrow.
 */
export interface PlaceFilters {
  /** The search box; '' = no search (the whole directory, not an empty list). */
  query: string
  /** null = both kinds; true = indoor only; false = outdoor only. */
  indoor: boolean | null
  /**
   * The distance filter's ceiling in miles, or null for "any distance".
   * Defaulted by the caller to the viewer's radius (the app's discovery
   * model); a place with UNKNOWN distance is kept — see browsePlaces.
   */
  maxMiles: number | null
}

/**
 * The browse list's whole decision, pure + unit-tested: filter, then search,
 * then sort — so BrowsePage is a thin call site and the "why is that place
 * missing" question has exactly one answer in one place.
 *
 * Order of operations, each with its reason:
 * 1. DISTANCE (from the viewer's home zip to the PLACE's coordinates — the
 *    ticket's filter). A place with unknown distance is KEPT even when a
 *    ceiling is set: null is unknown, and an unknown never excludes.
 *    Only a measured, beyond-ceiling distance hides.
 * 2. INDOOR/OUTDOOR, when the parent picked one.
 * 3. SEARCH last, over what survived: the result is what the parent is looking
 *    at, so search must never resurrect a place a filter just excluded.
 *
 * SORT: nearest first, then by name. Unknown-distance places sort LAST (they
 * are still shown, above) rather than first — "we don't know how far this is"
 * belongs at the end of a distance-ordered list, not the top. Ties (and the
 * unknown block) break alphabetically, so the order is stable across renders.
 */
export function browsePlaces(
  places: readonly Place[],
  filters: PlaceFilters,
  viewer: { homeZip: string | null },
  zipCoords: ReadonlyMap<string, ZipCoords>,
  upcomingStartTimes: Map<string, string[]> | null,
  /**
   * Per-place aggregate ratings (the DB-computed display average + count), or
   * null when the bulk read failed — then every row's ratingSummary is null
   * (nothing rendered, never a 0.0). The caller hydrates this map; the pure
   * function only reads it (the injected-dependency rule, like `upcoming`).
   */
  ratings?: ReadonlyMap<string, ReviewSummary> | null,
): PlaceListRow[] {
  const rows: PlaceListRow[] = []
  for (const place of places) {
    const distanceMiles = placeDistanceMiles(place, viewer, zipCoords)
    if (filters.maxMiles !== null && distanceMiles !== null && distanceMiles > filters.maxMiles) {
      continue
    }
    if (filters.indoor !== null && place.indoor !== filters.indoor) continue
    const starts = upcomingStartTimes === null ? null : (upcomingStartTimes.get(place.id) ?? [])
    rows.push({
      place,
      distanceMiles,
      upcomingCount: starts === null ? null : starts.length,
      ratingSummary: ratings === null || ratings === undefined ? null : (ratings.get(place.id) ?? null),
    })
  }

  const searched =
    filters.query.trim() === ''
      ? rows
      : (() => {
          const ranked = matchPlaces(
            filters.query,
            rows.map((row) => row.place),
            rows.length,
          )
          const byId = new Map(rows.map((row) => [row.place.id, row]))
          return ranked.map((place) => byId.get(place.id)).filter((row): row is PlaceListRow =>
            row !== undefined,
          )
        })()

  // Search already ordered by relevance; distance ordering only applies when
  // there is no query (a parent who searched wants the match, not the radius).
  if (filters.query.trim() !== '') return searched

  return [...searched].sort((a, b) => {
    if (a.distanceMiles === null && b.distanceMiles !== null) return 1
    if (a.distanceMiles !== null && b.distanceMiles === null) return -1
    if (a.distanceMiles !== null && b.distanceMiles !== null) {
      const byDistance = a.distanceMiles - b.distanceMiles
      if (byDistance !== 0) return byDistance
    }
    return a.place.name.localeCompare(b.place.name)
  })
}

/**
 * The place page's "upcoming drop-ins here" ordering: soonest first. A thin,
 * named seam so the page (and its test) never hand-rolls the comparison, and
 * so the radius-independent promise is explicit — this list is NOT filtered by
 * distance, because the parent asked about THIS place.
 */
export function sortPlaceUpcoming<T extends { starts_at: string }>(posts: readonly T[]): T[] {
  return [...posts].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
}

/**
 * V13 ticket 05 (A7): how many place rows the /browse list shows before the
 * overflow affordance takes over.
 *
 * The raw unbroken long-list was the complaint: 239 seeded rows rendered
 * inline on a phone bury everything below them. A short lead (the closest
 * places, which are what "nearby" means) plus a single "See all N places"
 * door keeps every row reachable while the screen stays scannable. Mobile-
 * first (max-w-md shell), no new dependencies — the cap is a number, not a
 * library.
 */
export const BROWSE_LIST_LEAD_LIMIT = 6

/** One kind group in the browse list: the kind label + that kind's rows. */
export interface PlaceKindGroup {
  kind: string
  label: string
  rows: PlaceListRow[]
}

/**
 * V13 ticket 05 (A7): group the browse rows by KIND, for the grouped/chips
 * presentation. Pure + unit-tested (no React, no DB — the house pattern).
 *
 * Group order: kinds in their schema order (PLACE_KINDS, the 0029 CHECK
 * constraint's mirror), with an unknown-kind bucket last; within a group the
 * caller's row order is kept (distance-sorted when there is no search query,
 * relevance-ordered when there is — grouping must never re-rank). An empty
 * input yields [] (the caller renders nothing, exactly as today).
 */
export function groupPlacesByKind(rows: readonly PlaceListRow[]): PlaceKindGroup[] {
  const groups = new Map<string, PlaceKindGroup>()
  for (const row of rows) {
    const kind = row.place.kind
    const label = placeKindLabel(kind)
    let group = groups.get(kind)
    if (group === undefined) {
      group = { kind, label, rows: [] }
      groups.set(kind, group)
    }
    group.rows.push(row)
  }
  const ordered = PLACE_KINDS.filter((kind) => groups.has(kind)).map(
    (kind) => groups.get(kind)!,
  )
  // Unknown kinds (a future CHECK value the app does not know yet) keep their
  // own bucket, alphabetized after the known kinds — never dropped.
  const unknownKinds = [...groups.keys()]
    .filter((kind) => !(PLACE_KINDS as readonly string[]).includes(kind))
    .sort()
  for (const kind of unknownKinds) {
    ordered.push(groups.get(kind)!)
  }
  return ordered
}

/**
 * V15 ticket 03: how the browse list orders its rows. 'alpha' is the default
 * (the founder's A–Z); 'distance' reorders by closeness; 'newest' by creation
 * date; 'top-rated' by review average, best first (V24 — the unrated-place
 * rule below). Pure + unit-tested (no React, no DB).
 */
export type SortMode = 'alpha' | 'distance' | 'newest' | 'top-rated'

/**
 * V15 ticket 03: sort browse rows by the chosen mode. Returns a NEW array —
 * the input is never mutated.
 *
 * - 'alpha': A→Z by place name (localeCompare), ties broken by id so the
 *   order is stable across renders (the matchPlaces tiebreak discipline).
 * - 'distance': closest first. When `center` is provided, each row's distance
 *   is measured from that center to the place's OWN coordinates (haversine,
 *   the same math as filterPlacesByRadius) — the geocoded "Set location" path
 *   has no per-row distanceMiles. Otherwise the row's own distanceMiles is
 *   used (the home-zip path). Unknown distances (null / unresolvable) sort
 *   LAST — "we don't know how far this is" belongs at the end of a
 *   distance-ordered list, never the top. Ties break alphabetically.
 * - 'newest': most recent created_at first (descending); missing dates last,
 *   then alphabetical within the unknown block.
 * - 'top-rated': highest display average first. THE UNRATED-PLACE RULE: a row
 *   whose ratingSummary is null (no reviews, or the read failed) NEVER ranks as
 *   if it scored zero — it sorts AFTER every rated row, because a missing
 *   average is the absence of an opinion, not a 0.0. Ties among rated rows
 *   break on review COUNT (more reviews = stronger evidence), then name, then
 *   id — a total deterministic order. The unrated block keeps a stable
 *   alphabetical order (the same tiebreak discipline as the other modes).
 */
export function sortPlaces(
  rows: readonly PlaceListRow[],
  mode: SortMode,
  center?: { lat: number; lng: number },
): PlaceListRow[] {
  const copy = [...rows]
  switch (mode) {
    case 'alpha':
      copy.sort((a, b) => {
        const byName = a.place.name.localeCompare(b.place.name)
        if (byName !== 0) return byName
        return a.place.id < b.place.id ? -1 : a.place.id > b.place.id ? 1 : 0
      })
      return copy
    case 'distance': {
      // Per-row key: measured-from-center when a center is given, else the
      // row's stored distanceMiles. null = unknown → sorts last.
      const key = (row: PlaceListRow): number | null => {
        if (center !== undefined) {
          const lat = row.place.lat
          const lng = row.place.lng
          if (lat === null || lng === null) return null
          return haversineMiles(center, { lat, lng })
        }
        return row.distanceMiles
      }
      copy.sort((a, b) => {
        const da = key(a)
        const db = key(b)
        if (da === null && db !== null) return 1
        if (da !== null && db === null) return -1
        if (da !== null && db !== null && da !== db) return da - db
        const byName = a.place.name.localeCompare(b.place.name)
        if (byName !== 0) return byName
        return a.place.id < b.place.id ? -1 : a.place.id > b.place.id ? 1 : 0
      })
      return copy
    }
    case 'newest': {
      const time = (row: PlaceListRow): number | null => {
        const raw = row.place.created_at
        if (raw === undefined || raw === null || raw === '') return null
        const parsed = Date.parse(raw)
        return Number.isNaN(parsed) ? null : parsed
      }
      copy.sort((a, b) => {
        const ta = time(a)
        const tb = time(b)
        if (ta === null && tb !== null) return 1
        if (ta !== null && tb === null) return -1
        if (ta !== null && tb !== null && ta !== tb) return tb - ta
        const byName = a.place.name.localeCompare(b.place.name)
        if (byName !== 0) return byName
        return a.place.id < b.place.id ? -1 : a.place.id > b.place.id ? 1 : 0
      })
      return copy
    }
    case 'top-rated': {
      // The unrated-place rule: a null summary is the absence of an opinion,
      // not a zero — it sorts after every rated row. Among rated rows: higher
      // display average first; on an equal average, MORE reviews rank first
      // (stronger evidence); then name, then id (the total-order tiebreaks).
      // The unrated block keeps the stable alphabetical order.
      copy.sort((a, b) => {
        const ra = a.ratingSummary
        const rb = b.ratingSummary
        if ((ra === null || !ra.hasReviews) !== (rb === null || !rb.hasReviews)) {
          return ra === null || !ra.hasReviews ? 1 : -1
        }
        if (ra !== null && rb !== null && ra.hasReviews && rb.hasReviews) {
          const avgA = ra.displayAverage ?? 0
          const avgB = rb.displayAverage ?? 0
          if (avgA !== avgB) return avgB - avgA
          if (ra.count !== rb.count) return rb.count - ra.count
        }
        const byName = a.place.name.localeCompare(b.place.name)
        if (byName !== 0) return byName
        return a.place.id < b.place.id ? -1 : a.place.id > b.place.id ? 1 : 0
      })
      return copy
    }
  }
}

/**
 * V15 ticket 02: the browse map rework's pure distance seam — the haversine
 * miles between two lat/lng points. A thin alias over feed.haversineMiles so
 * a place consumer has one import site (the same re-export discipline as
 * placeDistanceMiles above). Pure + unit-tested.
 */
export function distanceMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return haversineMiles(a, b)
}

/**
 * V15 ticket 02: keep only the places whose coordinates fall within
 * `radiusMiles` of `center` (boundary inclusive — the app's existing radius
 * predicate, withinRadius). A place with UNKNOWN coordinates (lat/lng null or
 * unresolvable) is EXCLUDED here: this is a radius filter, not the directory's
 * "unknown never hides" rule — the caller (BrowsePage's "See places") has
 * chosen a specific center and radius, and a place we cannot measure against
 * it cannot be shown as inside it.
 *
 * Places are resolved through resolveMapCoords (their own lat/lng first, else
 * the gazetteer zip embedded in the address) — the same seam the map renders
 * from, so the list and the circle always agree. Pure + unit-tested.
 */
export function filterPlacesByRadius(
  places: readonly Place[],
  center: { lat: number; lng: number },
  radiusMiles: number,
  zipCoords?: ReadonlyMap<string, ZipCoords> | null,
): Place[] {
  if (radiusMiles <= 0) return []
  const kept: Place[] = []
  for (const place of places) {
    const coords = resolveMapCoords(place, zipCoords ?? null)
    if (coords === null) continue
    const distance = distanceMiles(center, coords)
    if (distance <= radiusMiles) kept.push(place)
  }
  return kept
}

/** The circle a map should frame itself on: a center and a radius in miles. */
export interface FramingCircle {
  center: { lat: number; lng: number }
  radiusMiles: number
}

/**
 * V16 t07 item 2: WHICH circle frames the /browse overview map. A pure decision
 * so the component renders what it is given and the page never encodes it.
 *
 * The map is framed by the SEARCH RADIUS, never by the bounds of every place
 * (that fit zoomed out to the whole city and collapsed every marker into an
 * overlapping blob). A geocoded "Set location" center wins when present — that
 * is the center the viewer explicitly chose. Otherwise the viewer's HOME PIN
 * frames the map at their stored radius, so the circle effect stays the sole
 * framing authority in the common no-geocode case. With neither there is no
 * circle to frame and the caller falls back to its mount view.
 *
 * `radiusMiles` <= 0 yields null: a zero-radius circle has no extent to fit and
 * leaflet's fitBounds on a degenerate box zooms to street level.
 *
 * ---
 *
 * V17 t04: the frame also accounts for the SEARCHED subset — `focusPoints`, the
 * coordinates of the FILTERED rows. A parent who typed "pool" wants the camera
 * on the pools, not on the whole radius they happen to live inside.
 *
 * WHERE THIS LINE IS, AND WHY IT IS NOT IN THE COMPONENT. V16 t07 item 2
 * (`93f313b`) DELETED a `fitBounds` over every marker because that fit picks the
 * zoom which fits ALL points — nothing caps how far OUT it may go — so it zoomed
 * to the whole city and collapsed every dot into the blob the founder
 * photographed. That ruling stands; nothing here re-adds a points-fit to
 * `PlaceMap.tsx`. What t04 does instead is give the ONE remaining framing
 * authority (this circle) a second input, so the frame follows the results while
 * staying a circle the radius still governs.
 *
 * THE RADIUS IS A CEILING, NOT A STARTING POINT. The returned radius is
 * `min(radiusMiles, the miles that cover every focus point)`:
 *
 * - points spread wider than the viewer radius -> the radius itself, unchanged;
 *   t04 can never zoom out past it, which is the "never reverts `93f313b`" rule
 *   expressed as arithmetic;
 * - points inside it -> a circle centered on them that just covers them, so a
 *   narrow result set tightens the camera;
 * - absent or EMPTY `focusPoints` -> `{ center, radiusMiles }` verbatim, byte for
 *   byte the pre-t04 return. That identity is the regression guard and is
 *   asserted in `places.test.ts`.
 *
 * A DEGENERATE SUBSET IS NOT A DEGENERATE CIRCLE. One point, or twenty copies of
 * one coordinate, has zero extent — handing Leaflet that circle would zoom to
 * street level (the same failure `radiusMiles <= 0` guards against). So the
 * result radius is floored at `MIN_FOCUS_RADIUS_MILES`: a single match frames a
 * small neighbourhood, never a zero-extent box.
 *
 * The inputs are structural (`{ lat, lng }`), matching the rest of this module —
 * a `PlaceListRow`'s resolved coordinates pass through with no re-projection.
 */
export function framingCircle(input: {
  geocodeCenter: { lat: number; lng: number } | null
  homePin: { lat: number; lng: number } | null
  radiusMiles: number
  /** t04: the SEARCHED subset. Absent/empty = today's behaviour exactly. */
  focusPoints?: ReadonlyArray<{ lat: number; lng: number }>
}): FramingCircle | null {
  const { geocodeCenter, homePin, radiusMiles, focusPoints } = input
  if (!(radiusMiles > 0)) return null

  const base =
    geocodeCenter !== null
      ? { center: geocodeCenter, radiusMiles }
      : homePin !== null
        ? { center: homePin, radiusMiles }
        : null
  if (base === null) return null

  // No searched subset — the pre-t04 return, unchanged. `undefined`, `[]` and an
  // all-unusable array all land here, which is what "falls back to today's
  // radius frame" means for a query with zero placed results.
  if (focusPoints === undefined || focusPoints.length === 0) return base

  const center = focusCenter(focusPoints)
  if (center === null) return base

  /**
   * V19 t01 — THE SEARCH MAY TIGHTEN THE FRAME, NEVER MOVE IT OFF HOME.
   *
   * Found by this slice's own test, and it is a real defect the founder would
   * have seen. `focusCenter` returns the MIDPOINT of the matched points, so a
   * search matching one place 85 miles away returns that place as the centre;
   * the extent around a single point is zero, which floors to
   * `MIN_FOCUS_RADIUS_MILES` (0.5). The old result was therefore a half-mile
   * circle centred on a place 85 miles from home — the home pin vanished off
   * the canvas entirely, which is precisely what D1 forbids ("the map ALWAYS
   * frames tight around home").
   *
   * The rule that fixes it: a search result OUTSIDE the neighbourhood view must
   * not drag the frame to itself. When the matched centre lies beyond the focus
   * radius from the frame's own centre, the search has found something that is
   * not "near me", so the caller keeps the neighbourhood frame and the UI
   * announces the matches instead. Tightening still happens for near matches,
   * which is the behaviour V17 t04 actually wanted.
   *
   * `base.center` is the home pin (or a geocoded centre) — the anchor D1 pins.
   */
  const centerDistance = distanceMiles(base.center, center)
  if (centerDistance > base.radiusMiles) {
    // The matches are outside the neighbourhood view: keep the frame anchored
    // where it was instead of following them.
    return base
  }

  // The tightest circle about `center` that still covers every focus point. The
  // radius can only shrink: `base.radiusMiles` is the ceiling.
  //
  // Non-finite points are skipped. `focusCenter` above already skips them, so
  // this keeps the two halves of the function agreeing about which points count.
  //
  // HONEST SCOPE — this is defence in depth, NOT a live bug fix. A V17 t04
  // review flagged it as a real hole ("`NaN > span` is false, so the frame
  // collapses to the 0.5-mile floor") and I could not reproduce that: traced
  // with the guard REMOVED, a non-finite point anywhere in the list still yields
  // the CORRECT radius, because any later finite point sets `span`, and a list
  // with NO finite point never reaches here at all (`focusCenter` returns null
  // and the caller keeps its radius frame). Recorded so a later reader does not
  // treat this guard as evidence of a defect that was actually present.
  let span = 0
  for (const point of focusPoints) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) continue
    const miles = distanceMiles(center, point)
    if (miles > span) span = miles
  }
  const fitted = Math.max(span, MIN_FOCUS_RADIUS_MILES)
  // V19 t01: the cap that keeps D1 true. `base.radiusMiles` is now the caller's
  // MAP FOCUS radius (`MAP_FOCUS_RADIUS_MILES`), not the picked list radius, so
  // a search can tighten the frame toward its own results but can NEVER widen it
  // past the neighbourhood view. The `Math.min` is unchanged — what changed is
  // the value the caller puts into `base`, which is precisely the point of
  // splitting the two radii.
  return { center, radiusMiles: Math.min(base.radiusMiles, fitted) }
}

/**
 * The focus points' own center: the midpoint of their lat/lng EXTENT (not the
 * mean), so the covering radius above is genuinely tight and every point is
 * inside it by construction. Returns null when no point carries usable
 * coordinates — the caller then keeps its radius frame rather than framing on
 * `NaN`, which would blank the map.
 */
function focusCenter(
  points: ReadonlyArray<{ lat: number; lng: number }>,
): { lat: number; lng: number } | null {
  let minLat = Number.POSITIVE_INFINITY
  let maxLat = Number.NEGATIVE_INFINITY
  let minLng = Number.POSITIVE_INFINITY
  let maxLng = Number.NEGATIVE_INFINITY
  let usable = 0
  for (const point of points) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) continue
    usable += 1
    if (point.lat < minLat) minLat = point.lat
    if (point.lat > maxLat) maxLat = point.lat
    if (point.lng < minLng) minLng = point.lng
    if (point.lng > maxLng) maxLng = point.lng
  }
  if (usable === 0) return null
  return { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 }
}

/**
 * The smallest radius a t04 focus frame may collapse to, in miles.
 *
 * Pinned numerically because the alternative is a zero-extent circle: a single
 * matching place (or several at one coordinate) has no extent at all, and
 * Leaflet's `fitBounds` on a degenerate box zooms to street level — the map
 * would frame one doorway instead of a neighbourhood. Half a mile keeps the
 * tightest search at "a few blocks", which is what a parent searching for one
 * place actually wants to see around it.
 */
export const MIN_FOCUS_RADIUS_MILES = 0.5

/**
 * V19 t01 — HOW FAR THE MAP FRAMES, ALWAYS.
 *
 * The founder's ask, in their words: *"I want the map to be zoomed in as close
 * as possible by default, showing the less-than-1-mile view… this is the value
 * added to make this feel like a neighbourhood feel."*
 *
 * This constant is the whole of D1, so it is worth being precise about what it
 * does and does not control:
 *
 *   - It controls THE MAP'S FRAME — the circle the map fits on open.
 *   - It does NOT control the LIST. The picked radius (`radius_miles`, the
 *     1/5/20/35 ladder) still runs `filterPlacesByRadius`, unchanged. Choosing
 *     35 miles shows far more rows; the map still opens on your own blocks.
 *
 * Those two values were THE SAME VALUE before this slice, which is exactly why
 * the map opened on all of Seattle for a parent whose stored radius is 35 (the
 * founder's own, measured). Splitting them is the fix. **Do not re-merge them**
 * — a diff that feeds the picked radius back into the map frame has reverted
 * this slice, and the map would silently widen again.
 *
 * Why 1 mile and not `MIN_FOCUS_RADIUS_MILES` (0.5): half a mile is the floor
 * for a SEARCH-tightened frame — the tightest a single result may be framed at.
 * The default frame is deliberately a little wider than that, because "what is
 * near me" should show a few streets of context, not one block. The two
 * constants have different jobs and must not be collapsed.
 *
 * A search that narrows results still tightens BELOW this (V17 t04's behaviour,
 * via `framingCircle`'s `focusPoints`); this is the ceiling it can never exceed.
 */
export const MAP_FOCUS_RADIUS_MILES = 1

/**
 * V23 slice 7 — the fraction of the pane a framed radius may occupy, and the
 * correction that makes the circle actually FIT.
 *
 * The circle was hanging outside the map card. Two separate reasons, and the
 * second is the one that survived fixing the first:
 *
 *  1. **Leaflet floors the zoom.** `zoomSnap` defaults to 1, so the fractional
 *     level this function returns was rounded down and the circle rendered at
 *     whatever the whole level drew — 250px of radius inside a 332px pane. That
 *     fix belongs to the map's own options (`zoomSnap: 0`, set in `PlaceMap`),
 *     not here.
 *
 *  2. **The arithmetic above is latitude-blind, and Seattle is far enough north
 *     for that to matter.** It treats one degree of latitude as 69 miles, which
 *     is true at the equator and at every latitude in Mercator, whose whole
 *     point is that north-south and east-west scale are EQUAL. What it ignores is
 *     that Mercator's scale factor is `1 / cos(latitude)` — the map is inflated
 *     as you leave the equator. At Seattle's 47.6 degrees, `cos = 0.674`, so the
 *     true miles per pixel are about a THIRD lower than the formula assumes, and
 *     the drawn circle comes out correspondingly LARGER than requested.
 *
 *     MEASURED on the live dev server (390x844, /browse): asking for a 1-mile
 *     radius on the 332px pane produced a 490px circle — 1.48x the pane, which is
 *     the `1/cos(47.6) = 1.483` factor almost exactly. The circle was centred
 *     correctly (the `panTo` in `PlaceMap`) and still hung over both edges.
 *
 * `FRAME_FILL` is the margin on top of that: even a perfectly sized circle
 * touching both edges of the pane reads as broken, and it hides the stroke. At
 * 0.85 the 1-mile frame leaves ~8% of the pane as visible map on each side,
 * which is what makes the radius legible as a circle rather than a band.
 */
const FRAME_FILL = 0.85

/**
 * The cosine correction for a latitude, clamped to a sane range.
 *
 * `Math.cos` of a non-finite or absurd latitude would return `NaN` (blanking the
 * zoom) or a value near zero (blowing the ratio up to infinity), so the result
 * is floored at 0.1 and falls back to 1 — the pre-slice-7 behaviour — for
 * anything unusable. A caller with no latitude to offer therefore keeps the old
 * result rather than getting a broken one.
 */
function mercatorScale(lat: number): number {
  if (!Number.isFinite(lat)) return 1
  return Math.max(0.1, Math.cos((lat * Math.PI) / 180))
}

/**
 * V20 t05 — the zoom that frames a given radius on a roughly 250px-tall map
 * pane, so the live preview STARTS sensibly on screen.
 *
 * THE PROBLEM THIS SOLVES. With the camera no longer fitting the circle, a
 * circle is drawn at its true geographic size — correct, and the whole point,
 * but it means a 30-mile radius on a map left at neighbourhood zoom is a
 * circle far larger than the pane, and a 1-mile radius is a dot. Opening the
 * "Set location" dialog therefore has to place the camera SOMEWHERE sensible
 * for the radius in hand.
 *
 * The arithmetic, stated so it can be checked rather than trusted:
 *
 *   - At zoom level `z`, a 256px Web-Mercator tile covers
 *     `360 / 2^z` degrees of longitude, so one pixel covers
 *     `360 / (2^z * 256)` degrees.
 *   - One degree of latitude is ~69 miles, and Mercator's scale is uniform in
 *     both axes, so one pixel is `360 * 69 / (2^z * 256)` miles AT THE EQUATOR.
 *   - Moving to latitude `lat` inflates the map by `1 / cos(lat)`, so the true
 *     miles per pixel are that value multiplied by `cos(lat)` — see
 *     `mercatorScale` for the measurement that proved this mattered.
 *
 * Inverting that for a target radius gives the level below. The result is
 * CLAMPED to [0, 19] — Leaflet's own `maxZoom` for the OSM tile layer is 19,
 * and a negative zoom would ask for tiles that do not exist. A non-positive or
 * non-finite radius falls back to the neighbourhood zoom rather than returning
 * `NaN`, which would blank the layer.
 *
 * `panePx` defaults to 250 — the map's own `h-64` (256px) less a little for the
 * attribution bar. It is a parameter rather than a hard-coded constant so the
 * arithmetic is testable at other sizes without a browser, and `PlaceMap` passes
 * the map's own measured size so the three callers (a `45dvh` browse band, a
 * fixed `h-64` detail map, the /new picker) each get arithmetic about themselves.
 *
 * `lat` is optional and defaults to 0, which is exactly the old equator-based
 * result — so every existing caller and test keeps its behaviour until it opts
 * in to the correction.
 *
 * This value is a STARTING POINT ONLY: it is applied when the preview's radius
 * changes, and the parent is then free to zoom the map themselves — the circle
 * redraws at whatever zoom they chose, which is what makes it a measuring tool.
 */
export function zoomForRadius(radiusMiles: number, panePx = 250, lat = 0): number {
  if (!Number.isFinite(radiusMiles) || radiusMiles <= 0 || !(panePx > 0)) {
    return DETAIL_ZOOM_FALLBACK
  }
  // The zoom at which the circle's DIAMETER spans `FRAME_FILL` of the pane — a
  // whole circle plus a margin, not a radius that reaches the edge.
  const milesPerPixelWanted = (2 * radiusMiles) / (panePx * FRAME_FILL)
  const zoom = Math.log2((360 * 69 * mercatorScale(lat)) / (256 * milesPerPixelWanted))
  return Math.max(0, Math.min(19, zoom))
}

/**
 * The zoom used when there is nothing sensible to frame — the same detail zoom
 * the single-place map uses. Kept as a named constant here because
 * `zoomForRadius` returns it and the component seeds its zoom state with it;
 * two copies of "13" would drift.
 */
export const DETAIL_ZOOM_FALLBACK = 13

/**
 * V17 t02: which PLACES the caller follows, as a plain id set — what a browse
 * card's heart reads to decide whether it is filled.
 *
 * WHY THIS EXISTS BESIDE `follows.followTargetsFrom`: that seam is shaped
 * around the FOLLOW ROW (`FollowRowLike` -> `{ followeeIds, placeIds }`) and is
 * the right answer for a surface that asks the follow graph about BOTH kinds
 * at once (the feed's met-before line needs the family half). The browse grid
 * asks one narrow question about one kind — "is THIS place hearted?" — and a
 * grid of 239 cards should not carry a two-set aggregate to answer it.
 *
 * (An earlier attempt returned `Map<placeId, followId>` on the theory that the
 * unfollow path needs the row id. It does not: `db.toggleFollowPlace` resolves
 * the row itself via `findFollowRow`, so the value was dead data. A Set is the
 * honest shape.)
 *
 * A row with a null (or absent) `place_id` is a FAMILY follow and is SKIPPED —
 * the exactly-one-target rule in `follows.validateFollowTarget`; a browse card
 * is never a family. Rows with a blank id are skipped too: a row we cannot
 * identify is not a row we should claim to hold.
 *
 * The input type is structural, not `db.FollowRow`: this module imports no
 * Supabase types, so the seam stays callable from a pure test (and a wider row
 * passes through with no re-projection).
 */
export function placeFollowIdSet(
  rows: ReadonlyArray<{ id?: string | null; place_id?: string | null }>,
): Set<string> {
  const followed = new Set<string>()
  for (const row of rows) {
    if (typeof row.id !== 'string' || row.id === '') continue
    const placeId = row.place_id
    if (placeId === null || placeId === undefined || placeId === '') continue
    followed.add(placeId)
  }
  return followed
}

/**
 * The directory LIST's whole composition, as one pure decision (the build law:
 * the component renders and does not decide). PlaceDirectory used to compute
 * every one of these values inline; this is that block, moved here so a unit
 * test holds it and the component is a thin call site.
 *
 * THE TWO LIST PATHS, and why they differ:
 *
 * - NO geocoded center (`geocodeCenter === null`): the list is `rows` — the
 *   home-zip browse (browsePlaces), narrowed by the modal's kind chips + radius
 *   filter, then ordered by sortPlaces. This is the default state.
 * - A geocoded center ("Set location" → "See places"): the list is `effectiveRows`
 *   instead — the SAME directory filtered to the picked radius about the pin,
 *   with each row's distance re-measured FROM the pin (not nulled), so the rows
 *   leave the unplaced bucket and every card shows a true distance from the pin.
 *   The kind/radius/sort filters do NOT apply on this path: the parent chose an
 *   explicit center + radius, which is its own complete answer.
 *
 * EVERYTHING ELSE IS SHARED: `placed` (the map's markers — always the full
 * home-zip set, never the filtered list), the listed groups, and the two
 * empty-state flags below. (V25 t01 retired the lead/overflow split at
 * `BROWSE_LIST_LEAD_LIMIT`, so the constant is no longer part of this plan's
 * shape — see `placedGroups`.)
 */
export interface DirectoryListPlan {
  /** The home-zip browse rows (before the modal's kind/radius narrowing). */
  rows: PlaceListRow[]
  /** The geocode-center path's rows (re-measured from the pin); = rows when there is no center. */
  effectiveRows: PlaceListRow[]
  /** The kind-filtered, radius-filtered, sorted rows (the no-center path's list). */
  filteredRows: PlaceListRow[]
  /** The list the component actually renders: effectiveRows when a center is set, else filteredRows. */
  listRows: PlaceListRow[]
  /** Rows whose distance resolved (the map's markers; the full placed set, not the filtered list). */
  placed: PlaceListRow[]
  /** The rendered list's unknown-distance rows (the "Not on the map yet" section). */
  unplaced: PlaceListRow[]
  /**
   * V25 t01: the PLACED rows of the rendered list, grouped by kind — what the
   * list container actually renders.
   *
   * WHY IT IS `placed` AND NOT `listRows`: the unplaced rows (no resolvable
   * coordinates) render in their OWN section below the list ("Not on the map
   * yet"), so a grouped list built from `listRows` renders them a SECOND time.
   * The two surfaces partition `listRows` exactly: grouped placed rows + the
   * unplaced rows = every matching row, once each.
   *
   * It replaces the retired lead/overflow pair (`leadRows`/`overflowRows`/
   * `leadGroups`/`overflowGroups`) rather than sitting beside it: nothing read
   * those, and a field nothing reads is a rule nobody owns.
   */
  placedGroups: PlaceKindGroup[]
  /** The shared radius empty state is the honest answer ONLY when the radius is actually the reason nothing shows. */
  radiusIsTheReason: boolean
  /**
   * The radius the shared empty state renders, carried in a TYPE that makes the
   * invariant structural rather than a narrowing accident: non-null EXACTLY
   * when `radiusIsTheReason` is true, and then its `radiusMiles` is a plain
   * `number`. A caller can therefore pass `radiusReason.radiusMiles` straight
   * to RadiusEmptyState after a null check — no control-flow narrowing of a
   * nullable property survives across this object boundary, so the number must
   * live inside the discriminated field where the type itself guarantees it.
   * Null whenever any of the four conditions fails (including `distanceChoice
   * === 'any'`, where maxMiles is null and there is no radius to blame).
   */
  radiusReason: { radiusMiles: number } | null
  /** Nothing at all in the list OR the unplaced section (the generic empty state). */
  nothingMatches: boolean
  /**
   * The date window's empty state is the honest answer ONLY when the window
   * filter is actually the reason nothing shows: a non-'upcoming' window, zero
   * rendered rows, and no search text (a search narrows further, so it is not
   * "the window" alone). Mirrors `radiusIsTheReason`'s discipline.
   */
  dateWindowIsTheReason: boolean
  /**
   * The window the date-window empty state names + offers the escape from,
   * carried in a TYPE that makes the invariant structural (non-null EXACTLY
   * when `dateWindowIsTheReason` is true) — the same shape as `radiusReason`.
   * Null for 'upcoming' (no window to name) and whenever another filter is
   * also narrowing.
   */
  dateWindowReason: Exclude<DateWindow, 'upcoming'> | null
}

export function planDirectoryList(input: {
  /** The loaded directory rows (null while the host's read is in flight). */
  places: readonly Place[] | null
  /** The search box text ('' = no search). */
  query: string
  /** null = both kinds; true = indoor only; false = outdoor only. */
  indoorFilter: boolean | null
  /** 'profile' = the viewer's stored radius; 'any' = no ceiling; a number = picked. */
  distanceChoice: DistanceChoice
  /** The viewer's stored radius in miles (what 'profile' resolves to). */
  viewerRadius: number
  /** The modal's kind chips (empty set = all kinds). */
  selectedKinds: ReadonlySet<string>
  /** Miles from the home pin (the modal's radius filter; null = off). */
  radiusFilter: number | null
  /** The date chip's window ('upcoming' = no date filter — the default state). */
  dateWindow: DateWindow
  /** The modal's sort mode. */
  sortMode: SortMode
  /** The viewer's stored home zip (the distance seam measures from it; null = none). */
  homeZip: string | null
  /** The viewer's home pin coords (null = no home pin). */
  homePin: { lat: number; lng: number } | null
  /** The geocoded "Set location" center (null = the default home-zip path). */
  geocodeCenter: { lat: number; lng: number } | null
  /** The radius picked in the "Set location" dialog, in miles. */
  radiusMiles: number
  /** The gazetteer zip→coords map (null while loading or on failure). */
  zipCoords: ReadonlyMap<string, ZipCoords> | null
  /** Per-place upcoming drop-in start times (null = the read failed → unknown). */
  upcomingStartTimes: Map<string, string[]> | null
  /**
   * The "now" for date-window classification (ISO string). Defaults to the real
   * clock when omitted — injected in tests so fixtures use a fixed date.
   */
  nowIso?: string
  /**
   * Per-place aggregate ratings (the DB-computed display average + count), or
   * null when the bulk read failed — every row's ratingSummary is then null
   * (the card shows nothing, never a 0.0). Hydrated by the caller.
   */
  ratings?: ReadonlyMap<string, ReviewSummary> | null
}): DirectoryListPlan {
  const {
    places,
    query,
    indoorFilter,
    distanceChoice,
    viewerRadius,
    selectedKinds,
    radiusFilter,
    dateWindow,
    sortMode,
    homeZip,
    homePin,
    geocodeCenter,
    radiusMiles,
    zipCoords,
    upcomingStartTimes,
    nowIso: nowIsoOverride,
    ratings,
  } = input
  const nowIso = nowIsoOverride ?? new Date().toISOString()

  const maxMiles =
    distanceChoice === 'profile' ? viewerRadius : distanceChoice === 'any' ? null : distanceChoice

  const coords: ReadonlyMap<string, ZipCoords> = zipCoords ?? new Map()
  const rows = browsePlaces(
    places ?? [],
    { query, indoor: indoorFilter, maxMiles },
    { homeZip },
    coords,
    upcomingStartTimes,
    ratings,
  )

  // The two sections: places we could measure, and places we could not. A place
  // with no coordinates is NEVER dropped (a filter may not hide a place for
  // missing data). `unplaced` is derived from the SAME rows the list renders,
  // so the two sections are disjoint by construction.
  const placed = rows.filter((row) => row.distanceMiles !== null)

  // When the user has geocoded an address via "Set location", the list is
  // filtered to places within the chosen radius of that center. Distances are
  // measured FROM the geocoded center (not nulled), so the rows leave the
  // unplaced bucket and every card shows a true distance from the pin.
  const effectiveRows: PlaceListRow[] = (() => {
    if (geocodeCenter === null) return rows
    const filtered = filterPlacesByRadius(places ?? [], geocodeCenter, radiusMiles, zipCoords)
    return filtered.map((place) => {
      const c = resolveMapCoords(place, zipCoords)
      const starts = upcomingStartTimes === null ? null : (upcomingStartTimes.get(place.id) ?? [])
      return {
        place,
        distanceMiles: c === null ? null : distanceMiles(geocodeCenter, c),
        upcomingCount: starts === null ? null : starts.length,
        ratingSummary: ratings === null || ratings === undefined ? null : (ratings.get(place.id) ?? null),
      }
    })
  })()

  // The LIST is alphabetical by default; the modal's kind chips + radius filter
  // narrow the rows first, then sortPlaces orders them. The MAP still shows the
  // full placed set (the circle overlay communicates the filter visually).
  const filteredRows: PlaceListRow[] = (() => {
    let base = rows
    if (selectedKinds.size > 0) {
      base = base.filter((row) => selectedKinds.has(row.place.kind))
    }
    if (radiusFilter !== null && homePin !== null) {
      const keptIds = new Set(
        filterPlacesByRadius(places ?? [], homePin, radiusFilter, zipCoords).map((p) => p.id),
      )
      base = base.filter((row) => keptIds.has(row.place.id))
    }
    // The date chip (annotation 15): a non-'upcoming' window keeps only places
    // with at least one upcoming drop-in whose start falls in that window —
    // measured from the per-place start-time list, not a count. 'upcoming' never filters.
    if (dateWindow !== 'upcoming') {
      base = base.filter((row) => {
        const starts = upcomingStartTimes === null ? null : (upcomingStartTimes.get(row.place.id) ?? [])
        return placeInDateWindow(starts, dateWindow, nowIso)
      })
    }
    return sortPlaces(base, sortMode, homePin ?? undefined)
  })()

  const listRows = geocodeCenter !== null ? effectiveRows : filteredRows
  const unplaced = listRows.filter((row) => row.distanceMiles === null)
  /**
   * V25 t01: THE LIST IS THE WHOLE LIST, AND NOTHING RENDERS TWICE.
   *
   * The founder reversed the V13 t05 A7 overflow fold — "I want to see all these
   * place cards under the filters below it as a long list" — so every placed row
   * is grouped and rendered, with no lead and no door. The unplaced rows are
   * EXCLUDED from these groups because the component renders them in their own
   * section below the list; including them here would put each of the seed's
   * three coordinate-less places on the page twice, under two different
   * headings ("Distance unknown" in the list, "Not on the map yet" below).
   *
   * So the two surfaces PARTITION `listRows`: `placedGroups` flattens to the
   * placed rows and `unplaced` is the rest, and neither surface is derived from
   * the other.
   */
  const placedRows = listRows.filter((row) => row.distanceMiles !== null)
  const placedGroups = groupPlacesByKind(placedRows)

  // The KIND filter must reach the "Not on the map yet" section too. Distance-
  // shaped filters are deliberately NOT applied there (a place may not be
  // hidden for missing data), but the kind is stated data. The date window is
  // distance-shaped in spirit (it claims a drop-in exists) and applies to the
  // rendered list, which includes that section.
  const filteredUnplaced = (() => {
    let base = unplaced
    if (selectedKinds.size > 0) base = base.filter((row) => selectedKinds.has(row.place.kind))
    if (dateWindow !== 'upcoming') {
      base = base.filter((row) => {
        const starts = upcomingStartTimes === null ? null : (upcomingStartTimes.get(row.place.id) ?? [])
        return placeInDateWindow(starts, dateWindow, nowIso)
      })
    }
    return base
  })()

  // The shared radius empty state is the honest answer ONLY when the radius is
  // actually the reason nothing is showing: no search text, no kind filter.
  const radiusIsTheReason =
    maxMiles !== null && placed.length === 0 && query.trim() === '' && indoorFilter === null
  // The radius travels inside the discriminated field so its NUMBER-ness is a
  // type fact (see DirectoryListPlan.radiusReason), not a narrowing accident:
  // the branch that sets it has already proven maxMiles non-null.
  const radiusReason = radiusIsTheReason ? { radiusMiles: maxMiles } : null
  // The date-window empty state is the honest answer ONLY when the window is
  // actually the reason nothing shows: a real window, zero rendered rows, no
  // search text (a search narrows further, so it is not "the window" alone).
  const dateWindowIsTheReason =
    dateWindow !== 'upcoming' && listRows.length === 0 && filteredUnplaced.length === 0 && query.trim() === ''
  const dateWindowReason = dateWindowIsTheReason ? dateWindow : null
  const nothingMatches = listRows.length === 0 && filteredUnplaced.length === 0

  return {
    rows,
    effectiveRows,
    filteredRows,
    listRows,
    placed,
    unplaced,
    placedGroups,
    radiusIsTheReason,
    radiusReason,
    dateWindowIsTheReason,
    dateWindowReason,
    nothingMatches,
  }
}

import { formatDistanceLabel, placeDistanceMiles, type ZipCoords } from './feed'
import type { Place, PlaceKind, PlacePrefill } from './types'

/**
 * V37 slice A (`P4K2`) — THE EMPTY FEED'S LAUNCHPAD.
 *
 * The founder's usability review, verbatim: *"The biggest gap is the cold start:
 * the drop-in feed was empty at 1, 20, and 35 miles, so a new parent may find a
 * park but still not find another family to meet. I'd make that empty state
 * immediately useful with nearby playgrounds and a clear 'host the first drop-in'
 * action."*
 *
 * THE DIAGNOSIS THIS MODULE ACTS ON (already measured — 234 places, 151 of them
 * playgrounds, ZERO drop-ins): the app has supply of PLACES and no supply of
 * PEOPLE. So the empty state must not show MORE CONTENT; it must convert the one
 * parent who is present into the first HOST, using the place supply that already
 * exists. That is why this module names REAL playgrounds from the same directory
 * read the browse surfaces use, rather than inventing a category or a teaser.
 *
 * ⚠️ WHY IT IS PURE AND ITS OWN MODULE. The build law puts the decision in `lib/`
 * as a pure function with injected dependencies and requires a sibling test. The
 * decision here is "which places may the launchpad name, and in what order" — a
 * rule with real failure modes (see below), not a rendering detail.
 *
 * THE THREE NAMES. A row is only ever produced for a place that:
 *   1. IS a playground — matched against `PlaceKind`'s own `'playground'` member,
 *      not a string typed out at the call site (a typo would silently empty the
 *      list, and the founder's whole point is that the list is NOT empty);
 *   2. has a RESOLVABLE DISTANCE — `placeDistanceMiles` returns a number. A place
 *      whose distance is UNKNOWN cannot sit in a list whose every row states a
 *      distance, and inventing one (or printing "0 mi") would be a lie about a
 *      real park. Unknown-distance playgrounds are simply not named here; the
 *      directory still lists them, so nothing is hidden — see the row's own note.
 *   3. is WITHIN the viewer's radius — the feed is empty BECAUSE nothing is inside
 *      that radius, so "nearby" must mean the same thing here it means everywhere
 *      else, or the launchpad contradicts the line directly above it.
 *
 * ⚠️ ORDER: NEAREST FIRST, and the TIE-BREAK is the place NAME. Nearest-first is
 * the only order that matches the promise ("nearby playgrounds"); name is the
 * stable tie-break so two equidistant playgrounds cannot swap positions between
 * renders (an unstable sort would make the list flicker for no reason and make
 * the sibling test non-deterministic).
 *
 * ⚠️ IT NAMES AT MOST `LAUNCHPAD_PLACE_LIMIT` PLACES. Three is the founder's ask
 * and also a UI budget: the panel's doctrine is ONE obvious action, and a list
 * longer than three starts to read as a directory — which is what the browse door
 * is for. The cap is a constant so the test and the render cannot disagree.
 *
 * This module answers ONE question — "which playgrounds, in what order". It does
 * NOT render, does NOT navigate and does NOT fetch; the caller owns all three.
 */

/** The founder's ask, as a number: "three nearby playgrounds". */
export const LAUNCHPAD_PLACE_LIMIT = 3

/**
 * `PlaceKind`'s playground member, named ONCE. `'playground'` is the schema's own
 * spelling (0029's CHECK constraint, mirrored by the `PlaceKind` union); binding
 * it here means the filter and the test read the same value, and a future rename
 * of the kind breaks in one place rather than silently emptying the list.
 */
export const LAUNCHPAD_PLACE_KIND: PlaceKind = 'playground'

/**
 * ⚠️ THE LAUNCHPAD'S OWN DISTANCE LABEL — and why it is NOT `formatDistanceLabel`.
 *
 * `formatDistanceLabel` (lib/feed.ts) is PINNED to integer miles ("4 mi") and is
 * shared with the browse cards. On a browse card that is fine: the distance is
 * one fact among many, and the card's other content carries the row.
 *
 * On the LAUNCHPAD it is not fine, and this was MEASURED on the real directory
 * rather than reasoned about. Ballard Commons (0.39 mi), Gilman Playground (0.41
 * mi) and Ballard Corners (0.47 mi) are the three nearest playgrounds to zip
 * 98107 — all genuinely sub-mile, so `Math.round` rendered THREE ROWS THAT ALL
 * SAID "0 mi". "0 mi" is not a rounded distance, it is a false one: it reads as
 * "this playground is where you are standing", and it destroys the only thing
 * distinguishing the three rows, making the nearest-first order inexplicable.
 *
 * So the launchpad floors at "<1 mi". It does NOT change the shared formatter —
 * browse's rendering must stay byte-for-byte (acceptance e), and the pinned
 * integer rule is browse's to keep. This is a second, deliberately separate label
 * for a surface where the distance IS a row's whole identity.
 *
 * One mile and up is unchanged (the shared formatter's own output), so the two
 * agree everywhere the shared one is honest; they differ ONLY in the sub-mile
 * band, which is exactly the band where "N mi" cannot express the truth.
 */
export function launchpadDistanceLabel(miles: number): string {
  return miles < 1 ? '<1 mi' : formatDistanceLabel(miles)
}

/** One launchpad row: a real playground, and how far away it is. */
export interface LaunchpadPlace {
  /** The directory row itself — the caller needs `id`/`name` for the prefill. */
  place: Place
  /**
   * The distance in miles, ALWAYS a finite number: a place without one is never
   * named here (see the module note). Rows format it with the SAME
   * `formatDistanceLabel` the browse cards use — one formatting rule, not two.
   */
  distanceMiles: number
  /** `formatDistanceLabel(distanceMiles)`, precomputed so every caller agrees. */
  distanceLabel: string
}

/**
 * The playgrounds the empty feed may name, nearest first, capped at
 * `LAUNCHPAD_PLACE_LIMIT`. EMPTY when the viewer has no zip, the gazetteer is not
 * loaded, or no playground resolves inside the radius — and an empty result means
 * the caller renders its existing state UNCHANGED (never an empty list, never a
 * placeholder row: the state must never be worse than it is today).
 *
 * @param places      the directory, from the SAME read the browse surfaces use
 * @param homeZip     the viewer's home zip, or null/empty when unset
 * @param radiusMiles the radius the (empty) feed just filtered by — "nearby"
 *                    must mean what it means everywhere else on this screen
 * @param zipCoords   the seeded gazetteer, or null when it has not loaded
 */
export function nearbyPlaygrounds(
  places: readonly Place[],
  homeZip: string | null | undefined,
  radiusMiles: number,
  zipCoords: ReadonlyMap<string, ZipCoords> | null,
): LaunchpadPlace[] {
  // No gazetteer, no distances — and a row without a distance cannot be named.
  // This is the same degradation the feed's own distance model takes: unknown is
  // NOT zero and NOT "exclude the real park", it is "do not make a claim here".
  if (zipCoords === null) return []
  const viewer = { homeZip: homeZip ?? null }

  const rows: LaunchpadPlace[] = []
  for (const place of places) {
    if (place.kind !== LAUNCHPAD_PLACE_KIND) continue
    const distanceMiles = placeDistanceMiles(place, viewer, zipCoords)
    // Unknown distance → not nameable (see the module note).
    if (distanceMiles === null) continue
    // Outside the radius the feed just used → not "nearby", and naming it would
    // contradict the honest count line rendered directly above this list.
    if (distanceMiles > radiusMiles) continue
    rows.push({ place, distanceMiles, distanceLabel: launchpadDistanceLabel(distanceMiles) })
  }

  // Nearest first; name breaks ties so the order is TOTAL and stable.
  rows.sort((a, b) => {
    if (a.distanceMiles !== b.distanceMiles) return a.distanceMiles - b.distanceMiles
    return a.place.name.localeCompare(b.place.name)
  })

  return rows.slice(0, LAUNCHPAD_PLACE_LIMIT)
}

/**
 * The PlacePrefill for hosting at one launchpad playground — the SAME router
 * state shape the place page's "Start a drop-in here" button seeds and
 * `App.tsx`'s NewRoute consumes (`state.place`), so the launchpad needs no new
 * prefill path and /new needs no change.
 *
 * ⚠️ `placeId` IS THE REAL PLACE'S ID (unlike `createHerePrefill`, which is the
 * viewer's home and therefore carries `placeId: ''`). That difference matters:
 * a post hosted at a named playground should carry the `place_id` FK, exactly as
 * the place-page prefill does, so the post is linked to the directory row it was
 * created from — and so the launchpad row is not quietly a free-text post.
 *
 * `address` and `neighborhoodId` come off the place row itself when it has them;
 * a place with none passes the same empty/null values the place-page prefill
 * does, because inventing either would be a lie about a real park.
 */
export function launchpadPrefill(row: LaunchpadPlace): PlacePrefill {
  const { place } = row
  return {
    placeId: place.id,
    place: place.name,
    address: place.address,
    neighborhoodId: place.neighborhood_id,
  }
}

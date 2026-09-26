/**
 * V24 slice 10: the MAP VIEW's card strip — the three pure rules behind it.
 *
 * WHY THIS MODULE EXISTS AT ALL. The map view has exactly one piece of
 * interesting behaviour: a horizontally swiped strip of cards and a map that
 * follows it must agree on WHICH CARD IS FOCUSED. `docs/agents/code-structure.md`
 * is the reason the decision is not an `if` inside the component: "If you are
 * writing an `if` that encodes a *rule* inside a `.tsx` file, stop." These are
 * those rules, extracted so they are trivially testable and so there is exactly
 * ONE place that answers each question.
 *
 * The three rules, and the failure each one prevents:
 *
 *  1. `nextCardIndex` — the keyboard/button rule. Prevents an off-by-one that
 *     walks the focus off either end of the strip.
 *  2. `nearestCardIndex` — the scroll rule. Prevents the "two independent
 *     mechanisms" defect: a swipe does not set the index directly, it is mapped
 *     through this one comparison against the cards' real measured centers.
 *  3. `scrollBehaviorFor` — the reduced-motion rule. Prevents an inline ternary
 *     in the component and gives the preference exactly one interpretation.
 *
 * NO React, no DOM, no Leaflet AT RUNTIME: every function below is a plain value
 * in and a plain value out, and the one Leaflet name below is a TYPE-ONLY
 * import (`import type`), which the compiler erases. So this module still ships
 * nothing that touches the map library — but `PLACE_MARKER_STYLE` /
 * `PLACE_MARKER_FOCUSED_STYLE` are CHECKED against Leaflet's own
 * `CircleMarkerOptions`, which is the whole point of the annotation (see the
 * note above those constants).
 */
import type { CircleMarkerOptions } from 'leaflet'

/**
 * Where the focus moves to after a Previous/Next step or an ArrowLeft/ArrowRight.
 *
 * **IT CLAMPS; IT DOES NOT WRAP**, and that is a deliberate choice rather than a
 * simplification:
 *
 *  - A strip that wraps answers "Next" at the last card by jumping to the first
 *    one. On a map that move is a teleport across the city — the pin leaves the
 *    card the parent was reading and lands on a place that was not adjacent on
 *    screen. The strip's visual order IS the spatial order here (it is a map),
 *    so wrapping would break the one thing the strip is for.
 *  - Clamping is also what the native DOM gives an arrow key inside a
 *    `overflow-x` scroller, and what `aria-current` on a list means. A control
 *    that "did nothing" at the end (still shows the last card as current) is
 *    honest: there is no next card.
 *
 * A `delta` that jumps more than one card is clamped the same way — the result
 * is always a legal index, never a caller-visible error.
 *
 * `count <= 0` (an empty strip, which the map view does not render at all but
 * which a caller could still ask about) returns 0: a legal index for "nothing",
 * and the value that makes the caller's own `cards[0]` a harmless undefined
 * rather than a negative-array read.
 */
export function nextCardIndex(current: number, delta: number, count: number): number {
  if (count <= 0) return 0
  const last = count - 1
  return Math.min(last, Math.max(0, current + delta))
}

/**
 * Which card is "the one the parent is looking at", from the strip's own scroll
 * geometry.
 *
 * The strip is `snap-center`, so the card whose CENTER is nearest the visible
 * center is the focused one — that is the same rule the browser's snapping
 * applies, which is why a swipe and this function cannot disagree.
 *
 * `containerCenter` and every entry in `cardCenters` are in the SAME coordinate
 * space (the caller passes scroll-container-relative pixels: `offsetLeft +
 * offsetWidth / 2` against a container center of `scrollLeft + clientWidth / 2`,
 * or both from `getBoundingClientRect`). Mixing spaces is the caller's bug, and
 * it is not detectable here — so the contract is stated rather than guessed at.
 *
 * TIES GO TO THE EARLIER CARD (`<`, not `<=`). Two cards exactly equidistant
 * happens constantly at rest — a two-card strip scrolled to a whole-card offset
 * puts the container center exactly between them — and a rule that flips on a
 * floating-point coin would make the focused id flicker between two values on
 * identical input. Picking the earlier card makes it deterministic; which of the
 * two is "right" is not knowable from geometry alone.
 *
 * An empty list returns 0 — the same harmless-index answer `nextCardIndex`
 * gives, and the value that keeps the caller from reading `[-1]`.
 */
export function nearestCardIndex(
  containerCenter: number,
  cardCenters: readonly number[],
): number {
  let best = 0
  let bestDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < cardCenters.length; index += 1) {
    const center = cardCenters[index]
    // A readonly number[] can still be a sparse array at runtime; a hole must
    // not win the comparison by comparing NaN (every NaN comparison is false,
    // so a hole would otherwise silently keep `best` at 0 forever).
    if (typeof center !== 'number' || Number.isNaN(center)) continue
    const distance = Math.abs(center - containerCenter)
    if (distance < bestDistance) {
      bestDistance = distance
      best = index
    }
  }
  return best
}

/**
 * The `ScrollBehavior` a focus move should use.
 *
 * Reduced motion means NO smooth scrolling anywhere — that is the whole point of
 * the media query, and `scroll-behavior: smooth` in CSS is exactly what it is
 * asking the site to stop doing. `'auto'` is the DOM's spelling of "jump
 * instantly, honouring nothing else"; returning it (rather than `'instant'`,
 * which is not in the `ScrollBehavior` union this repo compiles against) is what
 * keeps the call sites honest.
 *
 * This is a one-line function on purpose. Its value is not the arithmetic, it is
 * that the preference is interpreted in exactly one place instead of in a
 * ternary repeated at every call site — and that the interpretation is pinned by
 * a test, so a later "smooth feels nicer" edit has to argue with an assertion.
 */
export function scrollBehaviorFor(reducedMotion: boolean): ScrollBehavior {
  return reducedMotion ? 'auto' : 'smooth'
}

/**
 * Bring a stored card index back inside a strip of `count` cards.
 *
 * WHY THIS EXISTS AS A RULE rather than as `Math.min(index, count - 1)` at the
 * call site: `focusedIndex` is STATE, and state outlives the array it indexes.
 * Narrowing the search while the map view is open leaves the index pointing past
 * the end of the new set, and the clamp is the answer to "which card is focused
 * now?" — a rule, not an arithmetic convenience. An inline clamp in a `.tsx` is
 * exactly what `docs/agents/code-structure.md` forbids.
 *
 * It is written in terms of `nextCardIndex` with a delta of zero, which is not a
 * trick for its own sake: "normalise a stale index" and "step a valid index" are
 * the same rule, and routing the clamp through the step means the two can never
 * disagree about the ends of the strip — in particular an out-of-range index is
 * CLAMPED rather than wrapping, for the spatial reason `nextCardIndex` documents.
 */
export function clampCardIndex(index: number, count: number): number {
  return nextCardIndex(index, 0, count)
}

/**
 * How many cards the strip renders at once.
 *
 * WHY A CAP EXISTS AT ALL, and it is not a style preference: the strip is
 * `overflow-x: auto` with every card MOUNTED, so the node count is the whole
 * directory. MEASURED on the seeded data with no filter: the directory has 239
 * rows, and the map view mounted 239 card links in one scroller — a strip that
 * takes a visible beat to appear and scrolls badly on a phone, which is the
 * surface it exists for. The map view is not a list with no bottom; the strip is
 * for comparing what is NEARBY.
 *
 * `BROWSE_LIST_LEAD_LIMIT` (6, the list view's own lead) was considered and
 * rejected: that number is tuned for a page of cards you scroll VERTICALLY, and
 * a map wants a wider neighbourhood than a lead paragraph. 40 is roughly the
 * point where the strip stops being a strip and starts being a scrollbar.
 */
export const MAP_STRIP_CARD_LIMIT = 40

/**
 * Split the map view's rows into the cards the strip renders and the rows it
 * must not lose.
 *
 * THE CAP GOVERNS CARDS ONLY, NEVER PINS, and that distinction is the whole
 * reason this function takes a PREDICATE rather than a count. A first version
 * took `placeableCount` and assumed the placeable rows were the first N of the
 * array — which (a) assumed an ordering the caller does not guarantee, since it
 * hands over a kind-grouped array, and (b) let the cap silently truncate the
 * array the MAP was fed from, so a directory of 239 places drew 40 pins. Both
 * were caught in review. `isPlaceable` asks the question directly, per row, so
 * neither the order nor the caller's grouping can change the answer.
 *
 * `cards` — the first `MAP_STRIP_CARD_LIMIT` placeable rows, in the caller's
 * order. `rest` — EVERY other row: the placeable rows past the cap, and every
 * unplaceable row, again in the caller's order. The caller renders `rest` as a
 * linear list under the strip and pins ALL of the placeable rows, so a place is
 * either pinned on the map or in that list, and is never silently dropped.
 */
export function splitStripRows<T>(
  rows: readonly T[],
  isPlaceable: (row: T) => boolean,
): {
  cards: readonly T[]
  rest: readonly T[]
} {
  const cards: T[] = []
  const rest: T[] = []
  for (const row of rows) {
    // Placeable rows fill the strip until the cap; everything after that — and
    // everything unplaceable — goes to `rest`. One pass, so the caller's order is
    // preserved in both parts and the two are disjoint by construction.
    if (isPlaceable(row) && cards.length < MAP_STRIP_CARD_LIMIT) cards.push(row)
    else rest.push(row)
  }
  return { cards, rest }
}

/**
 * The plain and focused appearances of a place pin, as DATA.
 *
 * WHY THEY LIVE IN `lib` rather than beside the map. Two reasons, and the second
 * is the one that matters:
 *
 *  1. They are pure data — no React, no Leaflet, no DOM — so this is where the
 *     build law puts them.
 *  2. THE PLAIN STYLE IS A COMPLETE RESET OF THE FOCUSED STYLE, and that is a
 *     RULE, not a coincidence. The map repaints a pin by calling `setStyle` with
 *     one of these two objects, and Leaflet only writes the properties it is
 *     given. So any property the FOCUSED style sets and the PLAIN style does not
 *     would LEAK onto a pin when it stopped being focused — a pin that keeps a
 *     bigger radius or a different colour after the focus moved away. That
 *     invariant is asserted in the sibling test; keeping the objects here is what
 *     makes it assertable without importing a component.
 *
 * The focused pin is VISIBLY DIFFERENT on three channels, not one — bigger
 * (12 vs 8), heavier (stroke 3 vs 2) and darker (#312e81 vs #4f46e5), with a
 * higher fill opacity — so the distinction survives a colour-blind reader and a
 * monochrome screen. MEASURED: Leaflet writes the radius into the path's `d`
 * arc, so the drawn size is readable as geometry rather than only as colour.
 *
 * **`satisfies CircleMarkerOptions` IS LOAD-BEARING, AND ITS ABSENCE WAS A REAL
 * HOLE** (V24 slice 10, review fix 4). `import type` is erased, so this costs no
 * runtime dependency on Leaflet — but it turns a typo in a Leaflet key
 * (`fillOpactiy`) or a wrong-typed value (`radius: '8'`) into a COMPILE ERROR.
 * It matters because there is no other check: these objects are handed to
 * `L.circleMarker(...)` and `marker.setStyle(...)`, and EXCESS-PROPERTY CHECKING
 * does not apply to a variable that is merely *passed* to a function — an
 * unannotated `{ radius: 8, fillOpactiy: 0.35 }` compiles, and Leaflet silently
 * ignores the key it does not know. `satisfies` (rather than a `: T`
 * annotation) is deliberate: it checks the literal AGAINST the type while
 * keeping the inferred property types, so `PLACE_MARKER_STYLE.radius` stays a
 * plain `number` for the sibling test that compares the two styles.
 */
export const PLACE_MARKER_STYLE = {
  radius: 8,
  color: '#4f46e5',
  weight: 2,
  fillColor: '#4f46e5',
  fillOpacity: 0.35,
} satisfies CircleMarkerOptions

export const PLACE_MARKER_FOCUSED_STYLE = {
  radius: 12,
  color: '#312e81',
  weight: 3,
  fillColor: '#312e81',
  fillOpacity: 0.85,
} satisfies CircleMarkerOptions

/**
 * Should the map view mount a Leaflet map at all? (V24 slice 10, ocr HIGH.)
 *
 * THE DEFECT THIS PREDICATE EXISTS FOR: `PlacesMap` returns `null` when it has
 * nothing to draw, which unmounts its OWN container while the component stays
 * mounted — and its Leaflet instance is created by a once-per-mount effect whose
 * cleanup only runs when the COMPONENT unmounts. That never fires, so
 * `map.remove()` is never called, `mapRef.current` keeps pointing at a destroyed
 * div, and the next widen renders a fresh div that the effect refuses to
 * initialise. The pane is then blank forever.
 *
 * The map view therefore decides whether to render the map at all, ABOVE the
 * component that owns the pitfall. Two cases keep the map alive:
 *
 *  - there are places to plot (obviously), and
 *  - the viewer has a home pin — an empty map is still meaningful then, because
 *    the home pin itself is what is being shown.
 *
 * With neither, there is nothing to draw, so the map must not be mounted at all —
 * which is what makes React run the cleanup and destroy the instance.
 */
export function shouldRenderPlacesMap(
  pinCount: number,
  homePin: { lat: number; lng: number } | null,
): boolean {
  return pinCount > 0 || homePin !== null
}

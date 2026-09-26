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
 * NO React, no DOM, no Leaflet: every function below is a plain value in and a
 * plain value out.
 */

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
 * `placeable` — the rows the map can plot — is capped. `rest` is EVERYTHING else:
 * the placeable rows past the cap, and every unplaceable row. The caller renders
 * `rest` as a linear list under the strip, so a place is either on the map or in
 * that list and is never silently dropped. This is the ONE place the split is
 * decided, which is why it is a tested rule rather than a slice in a `.tsx`.
 *
 * `count` is the number of placeable rows in the caller's own order, and the
 * caller has already filtered for placeability — this function does not need to
 * know how a row's coordinates resolve.
 */
export function splitStripRows<T>(rows: readonly T[], placeableCount: number): {
  cards: readonly T[]
  rest: readonly T[]
} {
  // A count outside the array (a caller bug, or a set that shrank between the
  // two reads) is clamped rather than trusted: `slice` would happily produce an
  // empty `cards` and an all-in-`rest` split, which renders as an empty map view
  // with everything hidden in the sr-only list.
  const usable = Math.max(0, Math.min(placeableCount, rows.length))
  const cards = rows.slice(0, Math.min(usable, MAP_STRIP_CARD_LIMIT))
  // The remaining placeable rows, then the unplaceable ones. The two slices are
  // disjoint and their union with `cards` is the whole array, so no row can be
  // lost or shown twice — which is the property the callers rely on.
  const rest = [...rows.slice(cards.length, usable), ...rows.slice(usable)]
  return { cards, rest }
}

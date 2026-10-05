/**
 * inbox-messenger slice A — the thread's viewport GEOMETRY, decided once.
 *
 * WHY THIS MODULE EXISTS. The inbox thread is the ONE page in the app that is a
 * conversation, and a conversation cannot live inside a document that scrolls:
 * its header is pinned, its message list is the only thing that scrolls, and its
 * composer never moves. That makes /inbox-with-a-thread-open the one route that
 * must OWN its height, while every other route keeps the shell's document
 * scroll exactly as it has it today.
 *
 * Two readers need that fact — the shell (`src/App.tsx`, which gives the route a
 * definite height instead of `min-h-dvh`) and the page (`InboxPage.tsx`, which
 * makes its own column fill it). They get it from HERE, as one pure function,
 * rather than each spelling the condition out (the one-copy rule,
 * `docs/agents/code-structure.md`): the page hands it the two params it already
 * parsed, the shell hands it the same two params off `useLocation().search`.
 *
 * The second half is the same concern on a phone. iOS Safari does not resize the
 * LAYOUT viewport when the software keyboard opens — only the VISUAL viewport
 * shrinks — so a `100dvh`-tall column keeps its full height and the pinned
 * composer ends up behind the keyboard. `window.visualViewport` reports the part
 * of the page still visible; the shortfall is the inset the composer has to be
 * lifted by.
 *
 * House pattern: pure decisions, no Supabase client, no React, no browser —
 * trivially testable (see the sibling `threadGeometry.test.ts`).
 */

/**
 * The smallest shortfall that is a KEYBOARD rather than browser chrome.
 *
 * A threshold rather than an exact measurement, deliberately: on iOS the
 * collapsing URL bar and toolbar move `window.innerHeight` relative to the
 * visual viewport by tens of pixels on their own, and a composer that lifted
 * itself mid-scroll would be worse than one that ignores a 30px delta. The two
 * bounds this is chosen between: the largest chrome delta is under 100px, and
 * the smallest software keyboard (a landscape iPhone keyboard, ~160px) is over
 * it — so the band is empty on the devices this runs on.
 */
export const KEYBOARD_MIN_INSET_PX = 100

/**
 * The two search params that open a thread, as the caller parsed them. Values
 * come from `searchParams.get(...)`, so an absent param is `null`.
 */
export interface InboxThreadParams {
  /** `?thread=<playdateId>` — a playdate-scoped conversation. */
  thread: string | null
  /** `?dm=<profileId>` — a free-form direct message. */
  dm: string | null
}

/**
 * Is a conversation open at this location — i.e. does this render own its own
 * height?
 *
 * `!== null`, not truthiness: this is the page's own render condition (a
 * `?dm=` with an empty value still takes the thread branch over the list), and
 * the shell and the page disagreeing about WHICH locations own the height is
 * exactly the drift this single definition prevents. Pinned in the sibling
 * test with the empty-value case written down rather than assumed.
 */
export function inboxThreadOpen(params: InboxThreadParams): boolean {
  return params.thread !== null || params.dm !== null
}

/**
 * How many CSS pixels to lift the composer by, or 0 when no keyboard is up.
 *
 * - `layoutHeightPx`  — `window.innerHeight` (the layout viewport).
 * - `visualHeightPx`  — `window.visualViewport.height`.
 * - `visualOffsetTopPx` — `window.visualViewport.offsetTop` (the visual viewport
 *   can be scrolled within the layout viewport, so the covered band is the
 *   shortfall MINUS how far down the visible part starts).
 *
 * Never negative, and 0 for a shortfall under `KEYBOARD_MIN_INSET_PX`. A
 * non-finite input (a browser without `visualViewport`, NaN) falls out as 0
 * because every comparison with NaN is false.
 */
export function keyboardInset(
  layoutHeightPx: number,
  visualHeightPx: number,
  visualOffsetTopPx: number,
): number {
  const covered = layoutHeightPx - visualHeightPx - visualOffsetTopPx
  return covered > KEYBOARD_MIN_INSET_PX ? Math.round(covered) : 0
}

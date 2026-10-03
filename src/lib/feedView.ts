/**
 * V21 t09 (A9): the FEED VIEW toggle's pure decision — which of the feed's two
 * views is shown, and what each one shows. No React, no storage: the page
 * holds the state; this module owns the RULES around it.
 *
 * WHY A MODULE AND NOT A STATE MACHINE: the whole feature is two booleans'
 * worth of state (`list` | `map`). The house build law still applies — the
 * DECISION lives here, the page renders — but the decision is deliberately
 * tiny: a default, a label per view, and the one branch rule ("the map band
 * is the primary content in map view"). Anything more would be inventing
 * structure for a two-state toggle.
 */

/** The feed's two views. `list` is the day sections; `map` is the map band. */
export type FeedView = 'list' | 'map'

/**
 * THE DEFAULT VIEW ON EVERY LOAD: list.
 *
 * Founder + wife ruling (V21 t09): "My wife says the default for this page
 * should be list view." The list leads with the soonest drop-ins (the existing
 * day sections already order soonest-first), so the default is the reading
 * order parents actually use.
 *
 * PERSISTENCE DECISION: none. This page persists NO UI state anywhere (no
 * localStorage, no sessionStorage — the repo's persistence patterns are
 * cross-page intents in App.tsx and push prefs in pushClient.ts, neither of
 * which covers a page-local view choice). So every visit starts on the
 * default, list, and the choice resets on reload. That is the ticket's
 * explicit requirement ("List is DEFAULT on every first load"), and inventing
 * a persistence key here would be adding a knob the brief does not ask for.
 */
export const FEED_VIEW_DEFAULT: FeedView = 'list'

/** The button labels, one per view — the toggle row renders both. */
export const FEED_VIEW_LABELS: Record<FeedView, string> = {
  list: 'List',
  map: 'Map',
}

/**
 * Whether the MAP BAND is the primary content for a view.
 *
 * List view: false — the day sections are the content, the map band does not
 * render at all (the founder's ask: "the feed defaults to a LIST"). Map view:
 * true — the map band IS the content, given room, and the day sections do not
 * render (a parent who switched to the map wants the map, not the list under
 * it). The empty-feed and loading states are view-agnostic and always show.
 */
export function feedViewShowsMap(view: FeedView): boolean {
  return view === 'map'
}

/**
 * The RSVP confirmation lightbox (V25 ticket 13) — PURE.
 *
 * WHAT IT IS FOR. The founder, watching a parent say they are going to
 * somebody's drop-in: "It would be cool if after you posted a drop in if there
 * was some kind of lightboxed notification about how you're going to the
 * event." The in-place confirmation (`✓ Going`, the count, "You") already
 * existed; what did not exist anywhere was a moment that says **you're going**
 * and **what happens next**.
 *
 * WHY THE RULES ARE HERE AND NOT IN THE PAGE. Three decisions go wrong quietly
 * and none of them is a rendering detail:
 *
 *  1. **WHEN it may appear.** The state to key on is the ping's `false → true`
 *     RESULT (`PlaydateDetailPage.handlePingToggle`) — not `going`, which is
 *     true on every load of a post the parent already said yes to. Raising it
 *     off `going` alone would greet every returning parent with a
 *     "You're going!" popup they already know. So the transition carries the
 *     prior state and only an actual `false → true` may raise it.
 *  2. **ONCE per ping, and never again.** Dismissing is final for that yes; a
 *     re-render, a re-read or a refresh cannot resurrect it, and taking the
 *     ping back is what makes a later re-ping allowed to confirm again. That is
 *     a set-membership rule over playdate ids — the kind of thing that is
 *     invisible in JSX and obvious in a table test.
 *  3. **THE COPY ONLY CLAIMS WHAT THE APP DOES.** The mockup's example line
 *     promises the parent "you'll be added to the group chat soon". There is no
 *     group chat. The real thread is playdate-scoped, its members are the
 *     post's host plus its pingers, and the parent can reach it (see the
 *     citations on `rsvpConfirmationCopy`). A promise the app cannot keep is a
 *     defect, not copy — so the sentence is built from the affordances that
 *     exist, and it is pinned by a test.
 *
 * Pure, free of React/Supabase (the `trust.ts` / `commentActions.ts`
 * convention): no client, no clock, no DOM.
 */
import { cardWhenLabel } from './feed'

/** The outcome of one ping toggle, reduced to the facts the confirmation
 * decision is allowed to decide on.
 *
 * `wasGoing` is the state BEFORE the tap; `toggled` is whether the write
 * returned at all (a thrown write never confirms — the parent is not going);
 * `going` is what `togglePing` RETURNED (the write path's authoritative result,
 * not the optimistic guess).
 */
export interface PingOutcome {
  kind: 'pinged' | 'unpinged' | 'still-going' | 'still-not-going' | 'failed'
  wasGoing: boolean
  /** False when the write threw — `going` is then meaningless. */
  toggled: boolean
  going: boolean
}

/**
 * Classify a completed ping toggle. `toggled` is false when `togglePing`
 * threw — a failed write must never produce a confirmation, because the parent
 * is not going.
 */
export function classifyPingOutcome(
  wasGoing: boolean,
  toggled: boolean,
  going: boolean,
): PingOutcome {
  if (!toggled) return { kind: 'failed', wasGoing, toggled, going }
  if (wasGoing && going) return { kind: 'still-going', wasGoing, toggled, going }
  if (!wasGoing && !going) return { kind: 'still-not-going', wasGoing, toggled, going }
  return { kind: going ? 'pinged' : 'unpinged', wasGoing, toggled, going }
}

/** The lightbox's whole state: at most one open, plus the pings already shown. */
export interface RsvpConfirmationState {
  /** The playdate whose lightbox is OPEN, or null. */
  pending: string | null
  /**
   * Playdates whose confirmation has ALREADY been raised and dismissed while
   * this page has been mounted. A plain sorted array (not a Set) so the state
   * is trivially comparable in a test and has no hidden mutation.
   */
  confirmed: readonly string[]
}

export const INITIAL_RSVP_CONFIRMATION: RsvpConfirmationState = { pending: null, confirmed: [] }

/**
 * The whole decision: may this finished toggle raise the lightbox, and what
 * does that leave the state as?
 *
 * Returns the SAME state object when nothing may appear — so a caller can key a
 * render on identity, and a table test can assert "unchanged" and not merely
 * "no pending".
 */
export function rsvpConfirmationAfterPing(
  state: RsvpConfirmationState,
  playdateId: string,
  outcome: PingOutcome,
  isHost: boolean,
): RsvpConfirmationState {
  if (outcome.kind === 'pinged') {
    // The host has no ping control — `PlaydateDetailPage.tsx:1564` is the
    // `isHost` gate, `:1933` the branch it selects, and `:2095` the ping control
    // that branch never renders — and the write itself refuses to let them ping
    // their own post, so this is defence in depth rather than a reachable path
    // — but it is the rule, so it is stated and pinned.
    if (isHost) return state
    // ONE raise per ping: a parent who already dismissed this confirmation does
    // not get it again for the same yes.
    if (state.confirmed.includes(playdateId)) return state
    return { pending: playdateId, confirmed: state.confirmed }
  }
  // Taking the ping back makes a later re-ping a genuinely NEW yes, so the
  // next one may confirm again. This is the only thing that clears the memory.
  if (outcome.kind === 'unpinged') return forgetRsvpConfirmation(state, playdateId)
  return state
}

/** Dismiss the open lightbox. Nothing else changes; it cannot re-raise itself. */
export function dismissRsvpConfirmation(state: RsvpConfirmationState): RsvpConfirmationState {
  if (state.pending === null) return state
  return {
    pending: null,
    // Sorted so the array is a comparable value, not insertion-ordered trivia.
    confirmed: [...state.confirmed, state.pending].sort(),
  }
}

/**
 * Forget one playdate's confirmation — the un-ping path (and the reset when the
 * page moves to a different post). Exported because the page needs the reset
 * case on its own, not only as a step inside another transition.
 */
export function forgetRsvpConfirmation(
  state: RsvpConfirmationState,
  playdateId: string,
): RsvpConfirmationState {
  const without = state.confirmed.filter((id) => id !== playdateId)
  const pending = state.pending === playdateId ? null : state.pending
  if (without.length === state.confirmed.length && pending === state.pending) return state
  return { pending, confirmed: without }
}

/**
 * The post-switch reset: given the state, the route id the page was SHOWING
 * before, and the route id it is showing NOW, return the state the page should
 * hold. Returns the SAME object whenever there is nothing to forget.
 *
 * WHY THIS IS A FUNCTION AND NOT AN EFFECT BODY. The first version of the reset
 * lived inline in the page as `forgetRsvpConfirmation(prev, id)` — the id being
 * navigated TO. Because `forgetRsvpConfirmation` is correctly a NO-OP for an id
 * that was never confirmed, that call cleared nothing that mattered: the memory
 * of the post being LEFT survived, and a dialog left open on post B survived a
 * browser Back to an earlier `/playdate/:id` (the same mounted route, so no
 * remount).
 *
 * WHAT MOVING IT HERE DOES, AND WHAT IT DOES NOT DO. It does not by itself stop
 * the page from passing the wrong id: the reason a reverted page still passes
 * the tests beside this function is that NO TEST IMPORTS THE PAGE — the suite
 * only reaches modules a spec imports, and nothing imports
 * `PlaydateDetailPage.tsx`. (It is not an environment limit: that module loads
 * and runs in this Node test env; there is simply no test standing on it.)
 * Pinning the call site therefore needs a SEAM the suite can import — the same
 * move this commit made for the rule — not a DOM test environment. What the
 * extraction buys today: the choice is now a rule with TWO SEPARATE id
 * parameters and a name for each, so the mistake is a visible, reviewable
 * expression rather than an inline argument nobody reads, and the tests can
 * state exactly what each choice yields. `previousRouteId` is the LAST SHOWN
 * route id, whether or not anything was ever confirmed on it — the caller
 * stores it, not a "confirmed" id, because a post the parent merely viewed is
 * exactly what must not be forgotten.
 */
export function rsvpConfirmationOnRouteChange(
  state: RsvpConfirmationState,
  previousRouteId: string | null,
  currentRouteId: string | null,
): RsvpConfirmationState {
  // A first mount (nothing shown before) and a re-render on the same post have
  // nothing to forget, and neither does an empty/unknown route id.
  if (previousRouteId === null || previousRouteId === currentRouteId) return state
  return forgetRsvpConfirmation(state, previousRouteId)
}

/** The facts the lightbox prints about the drop-in it is confirming. */
export interface RsvpConfirmationFacts {
  title: string
  startsAt: string
  endsAt: string
}

/**
 * The event's day and time, in the app's ONE when-line (`cardWhenLabel`), so
 * the confirmation names the drop-in the same way the feed card and the detail
 * page's own info card do — never a second date format.
 */
export function rsvpConfirmationWhen(facts: RsvpConfirmationFacts): string {
  return cardWhenLabel(facts.startsAt, facts.endsAt)
}

/** The three pieces of text the lightbox renders. */
export interface RsvpConfirmationCopy {
  /** The dialog's accessible name and its headline. */
  title: string
  /** The event this confirmation is anchored to. */
  event: string
  /** The honest "what happens next". */
  next: string
}

/**
 * The confirmation's copy, built from the facts — the one place these sentences
 * live, so the claims can be reviewed and pinned rather than scattered through
 * JSX as string literals.
 *
 * WHAT THE `next` SENTENCE IS ALLOWED TO SAY, and what it may NOT:
 *
 *  - MAY: the parent can reach the host and the other families from this
 *    drop-in, and those messages live in Inbox. Verified in the shipped code,
 *    not assumed: a pinger is a conversation participant at the DATABASE level
 *    (`supabase/migrations/0042_messages.sql` — `messages_select_participants`
 *    and `messages_participation_guard` both gate on
 *    `playdates.host_profile_id = auth.uid() OR a going_pings row`), and the
 *    detail page offers the affordance itself (`canMessageHost`,
 *    `PlaydateDetailPage.tsx:1648`, rendered "Message the host" `:2461`, its
 *    text at `:2467`, routing to `/inbox?thread=<playdateId>`), where the
 *    thread lists every participant (`InboxPage.tsx`).
 *  - MAY NOT: "you'll be added to the group chat soon, keep an eye out for the
 *    notification" (the mockup's example). There is no group chat — the thread
 *    is one playdate's conversation, and membership is not something that
 *    happens later: pinging IS becoming a participant, instantly. And the
 *    notification prompt is deliberately deferred off this very page
 *    (`push.ts:575` `isPlaydateDetailPath`, applied at `:629`/`:631`, with the
 *    offer gate at `:714`), so promising a notification here would point at a
 *    moment the app intentionally does not fire.
 *
 * The test beside this module asserts the absence of that promise, so a future
 * copy edit cannot quietly reintroduce it.
 */
export function rsvpConfirmationCopy(facts: RsvpConfirmationFacts): RsvpConfirmationCopy {
  return {
    title: 'You’re going!',
    event: `${facts.title} · ${rsvpConfirmationWhen(facts)}`,
    next:
      'You can message the host and the other families going from the drop-in, ' +
      'and those conversations are in your Inbox.',
  }
}

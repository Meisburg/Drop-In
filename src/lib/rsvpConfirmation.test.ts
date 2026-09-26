import { describe, expect, it } from 'vitest'
import { formatTimeWindow } from './feed'
import {
  INITIAL_RSVP_CONFIRMATION,
  classifyPingOutcome,
  dismissRsvpConfirmation,
  forgetRsvpConfirmation,
  rsvpConfirmationAfterPing,
  rsvpConfirmationCopy,
  rsvpConfirmationOnRouteChange,
  rsvpConfirmationWhen,
} from './rsvpConfirmation'
import type { RsvpConfirmationState } from './rsvpConfirmation'

/**
 * V25 ticket 13 — the RSVP confirmation lightbox's rules.
 *
 * The three things this file exists to hold, in the order the ticket states
 * them:
 *
 *  1. ONLY the ping's `false → true` result may raise it. Every other outcome —
 *     an already-going load, a no-op, taking the ping back, a failed write —
 *     leaves the state UNCHANGED, asserted by identity, not by "no dialog".
 *  2. Dismissing is final for that yes (no re-raise on re-render or refresh),
 *     and taking the ping back is what re-arms it for a genuinely new yes.
 *  3. The copy claims only what the app does — in particular it must NOT
 *     promise a "group chat" the app does not have (the mockup's example line).
 */

/** A playdate id, so the assertions read as ids rather than as strings. */
const POST = 'post-1'
const OTHER = 'post-2'

/** The state the page holds after a lightbox for POST was raised and dismissed. */
const CONFIRMED_POST: RsvpConfirmationState = { pending: null, confirmed: [POST] }

describe('classifyPingOutcome (the toggle reduced to the facts that may decide)', () => {
  const cases: Array<{
    wasGoing: boolean
    toggled: boolean
    going: boolean
    expected: string
  }> = [
    { wasGoing: false, toggled: true, going: true, expected: 'pinged' },
    { wasGoing: true, toggled: true, going: false, expected: 'unpinged' },
    { wasGoing: true, toggled: true, going: true, expected: 'still-going' },
    { wasGoing: false, toggled: true, going: false, expected: 'still-not-going' },
    { wasGoing: false, toggled: false, going: false, expected: 'failed' },
    // A THROWN write can never be a confirmation, whatever the flags claim: the
    // parent is not going (the page keeps `going` where it was and shows an
    // error line).
    { wasGoing: true, toggled: false, going: true, expected: 'failed' },
  ]

  for (const c of cases) {
    it(`wasGoing=${c.wasGoing} toggled=${c.toggled} going=${c.going} → ${c.expected}`, () => {
      expect(classifyPingOutcome(c.wasGoing, c.toggled, c.going).kind).toBe(c.expected)
    })
  }

  it('the confirming case is the one that carries the false → true transition', () => {
    expect(classifyPingOutcome(false, true, true)).toEqual({
      kind: 'pinged',
      wasGoing: false,
      toggled: true,
      going: true,
    })
  })

  it('a thrown write is classified as failed even when the flags would say otherwise', () => {
    // Not reachable from the page (it never passes `toggled: false` with
    // `going: true`), but the classification is total on purpose: a failure can
    // never be read as a ping by a caller that got the flags wrong.
    expect(classifyPingOutcome(true, false, true).kind).toBe('failed')
  })
})

describe('rsvpConfirmationAfterPing — only the false → true result raises it', () => {
  it('raises it for a ping that landed, and carries the playdate with it', () => {
    const next = rsvpConfirmationAfterPing(
      INITIAL_RSVP_CONFIRMATION,
      POST,
      classifyPingOutcome(false, true, true),
      false,
    )
    expect(next.pending).toBe(POST)
  })

  it('DOES NOT raise it when the parent was already going (an already-going load)', () => {
    // The load case matters as much as the tap case: `going` is true on every
    // render of a post the parent already said yes to, so a rule written
    // against `going` would greet every returning parent with the lightbox.
    for (const id of [POST, OTHER]) {
      const next = rsvpConfirmationAfterPing(
        INITIAL_RSVP_CONFIRMATION,
        id,
        classifyPingOutcome(true, true, true),
        false,
      )
      expect(next).toBe(INITIAL_RSVP_CONFIRMATION)
    }
  })

  it('DOES NOT raise it when the ping is taken back', () => {
    const next = rsvpConfirmationAfterPing(
      INITIAL_RSVP_CONFIRMATION,
      POST,
      classifyPingOutcome(true, true, false),
      false,
    )
    expect(next.pending).toBeNull()
  })

  it('DOES NOT raise it for a no-op tap, in either direction', () => {
    const noopOn = rsvpConfirmationAfterPing(
      INITIAL_RSVP_CONFIRMATION,
      POST,
      classifyPingOutcome(false, true, false),
      false,
    )
    const noopOff = rsvpConfirmationAfterPing(
      INITIAL_RSVP_CONFIRMATION,
      POST,
      classifyPingOutcome(true, true, true),
      false,
    )
    expect(noopOn).toBe(INITIAL_RSVP_CONFIRMATION)
    expect(noopOff).toBe(INITIAL_RSVP_CONFIRMATION)
  })

  it('DOES NOT raise it when the write threw', () => {
    const next = rsvpConfirmationAfterPing(
      INITIAL_RSVP_CONFIRMATION,
      POST,
      classifyPingOutcome(false, false, false),
      false,
    )
    expect(next).toBe(INITIAL_RSVP_CONFIRMATION)
  })

  it('DOES NOT raise it for the host (the host has no ping control at all)', () => {
    const next = rsvpConfirmationAfterPing(
      INITIAL_RSVP_CONFIRMATION,
      POST,
      classifyPingOutcome(false, true, true),
      true,
    )
    expect(next).toBe(INITIAL_RSVP_CONFIRMATION)
  })
})

describe('rsvpConfirmationAfterPing / dismiss — one raise per ping, then silence', () => {
  it('does not re-raise for the same ping after it was dismissed', () => {
    const raised = rsvpConfirmationAfterPing(
      INITIAL_RSVP_CONFIRMATION,
      POST,
      classifyPingOutcome(false, true, true),
      false,
    )
    const dismissed = dismissRsvpConfirmation(raised)
    expect(dismissed.pending).toBeNull()
    // The re-render case: the SAME ping outcome arrives again (a re-read, a
    // second render of the same handler result) and must not re-open it.
    const again = rsvpConfirmationAfterPing(
      dismissed,
      POST,
      classifyPingOutcome(false, true, true),
      false,
    )
    expect(again).toBe(dismissed)
  })

  it('a DIFFERENT playdate is unaffected by the dismissal of this one', () => {
    const raised = rsvpConfirmationAfterPing(
      CONFIRMED_POST,
      OTHER,
      classifyPingOutcome(false, true, true),
      false,
    )
    expect(raised.pending).toBe(OTHER)
    expect(raised.confirmed).toEqual([POST])
  })

  it('un-pinging forgets the yes, so a later re-ping may confirm again', () => {
    const unpinged = rsvpConfirmationAfterPing(
      CONFIRMED_POST,
      POST,
      classifyPingOutcome(true, true, false),
      false,
    )
    expect(unpinged.confirmed).toEqual([])
    const rePinged = rsvpConfirmationAfterPing(
      unpinged,
      POST,
      classifyPingOutcome(false, true, true),
      false,
    )
    expect(rePinged.pending).toBe(POST)
  })

  it('an un-ping while the lightbox is OPEN closes it too', () => {
    const open: RsvpConfirmationState = { pending: POST, confirmed: [] }
    const unpinged = rsvpConfirmationAfterPing(
      open,
      POST,
      classifyPingOutcome(true, true, false),
      false,
    )
    expect(unpinged.pending).toBeNull()
  })

  it('dismissing when nothing is open is a no-op (the same object comes back)', () => {
    expect(dismissRsvpConfirmation(INITIAL_RSVP_CONFIRMATION)).toBe(INITIAL_RSVP_CONFIRMATION)
  })

  it('keeps the confirmed list a comparable value (sorted, no duplicates)', () => {
    // Deliberately dismissed in the "wrong" order, so a list that merely
    // remembered insertion order would come back [POST, OTHER].
    const one = dismissRsvpConfirmation({ pending: POST, confirmed: [] })
    const both = dismissRsvpConfirmation({ pending: OTHER, confirmed: one.confirmed })
    expect(both.confirmed).toEqual([OTHER, POST].sort())
  })
})

describe('rsvpConfirmationWhen — the app’s ONE when-line, not a second date format', () => {
  // Local wall clock on purpose (the seam reads the DEVICE's calendar day, the
  // same one the feed card's day half reads).
  const STARTS = new Date(2026, 8, 26, 17, 0).toISOString()
  const ENDS = new Date(2026, 8, 26, 18, 30).toISOString()
  const FACTS = { title: 'Playground time', startsAt: STARTS, endsAt: ENDS }

  it('prints the day and the window, in the card’s own form', () => {
    const when = rsvpConfirmationWhen(FACTS)
    expect(when.startsWith('Sat, Sep 26 · ')).toBe(true)
    expect(when.endsWith(formatTimeWindow(STARTS, ENDS))).toBe(true)
  })

  it('is anchored to the event: the title and the when are both in the copy', () => {
    const copy = rsvpConfirmationCopy(FACTS)
    expect(copy.event).toContain('Playground time')
    expect(copy.event).toContain(rsvpConfirmationWhen(FACTS))
  })
})

describe('rsvpConfirmationCopy — claims the app can keep', () => {
  const FACTS = {
    title: 'Playground time',
    startsAt: new Date(2026, 8, 26, 17, 0).toISOString(),
    endsAt: new Date(2026, 8, 26, 18, 30).toISOString(),
  }

  it('says "You’re going!" — the founder’s own words', () => {
    expect(rsvpConfirmationCopy(FACTS).title).toBe('You’re going!')
  })

  it('states what happens next, and names the affordance that exists', () => {
    const next = rsvpConfirmationCopy(FACTS).next
    // "Message the host" is a real rendered control for a pinger
    // (PlaydateDetailPage.tsx:1612 canMessageHost → the button at :2431).
    expect(next).toContain('message the host')
    // …and where those messages live (InboxPage's thread list).
    expect(next).toContain('Inbox')
  })

  it('NEVER promises a group chat — the mockup’s line is not something the app does', () => {
    const copy = rsvpConfirmationCopy(FACTS)
    for (const text of [copy.title, copy.event, copy.next]) {
      expect(text.toLowerCase()).not.toContain('group chat')
      expect(text.toLowerCase()).not.toContain('added to')
    }
  })

  it('does not promise a notification either: the prompt is deferred off this very page', () => {
    // push.ts:394 (`isPlaydateDetailPath`, applied at :436) defers the opt-in on
    // /playdate/:id on purpose, so telling
    // the parent to "keep an eye out for the notification" here would point at a
    // moment the app deliberately does not fire.
    const copy = rsvpConfirmationCopy(FACTS)
    expect(copy.next.toLowerCase()).not.toContain('notification')
    expect(copy.next.toLowerCase()).not.toContain('keep an eye out')
  })

  it('does not claim membership happens LATER — a ping is membership, now', () => {
    const copy = rsvpConfirmationCopy(FACTS)
    expect(copy.next.toLowerCase()).not.toContain('will be added')
    expect(copy.next.toLowerCase()).not.toContain('soon')
  })
})

describe('forgetRsvpConfirmation — the direct reset seam', () => {
  it('clears the memory for one playdate only', () => {
    const state: RsvpConfirmationState = { pending: null, confirmed: [POST, OTHER] }
    expect(forgetRsvpConfirmation(state, POST).confirmed).toEqual([OTHER])
  })

  it('is a no-op when the playdate was never confirmed', () => {
    expect(forgetRsvpConfirmation(CONFIRMED_POST, OTHER)).toBe(CONFIRMED_POST)
  })
})

/**
 * THE POST-SWITCH RESET — `rsvpConfirmationOnRouteChange`, the rule the page
 * calls when the route id changes (V25 ticket 13 recovery, round 2).
 *
 * The page holds ONE state for the mounted route; navigating between
 * `/playdate/:id` values does not remount it, so the state has to be reset by
 * hand. The first version did that inline, as
 * `forgetRsvpConfirmation(prev, id)` — the id being navigated TO. Because
 * `forgetRsvpConfirmation` is (correctly) a NO-OP for an id that was never
 * confirmed, that cleared nothing that mattered: the memory of the post being
 * LEFT survived, and a dialog left open on post B survived a browser Back to an
 * earlier `/playdate/:id`.
 *
 * WHAT THESE TESTS DO AND DO NOT PIN. They pin the RULE, including the wrong
 * argument choices a caller can now make against it. They do NOT pin the page's
 * call site, and it would be a false comfort to say otherwise: NO TEST IMPORTS
 * THE PAGE, so if the page were reverted to a wrong-id call these tests would
 * still pass. That was measured, not assumed — reverting the call at
 * `PlaydateDetailPage.tsx`'s route-change effect to pass the current id as the
 * previous one leaves this file 35/35.
 *
 * The obstacle is NOT the test environment: `PlaydateDetailPage.tsx` imports and
 * runs in this Node env; nothing simply stands on it. Pinning the call site
 * therefore needs a SEAM the suite can import — the same move that produced this
 * function — not a DOM suite.
 *
 * The extraction still earns its place, and this is the honest claim for it:
 * the decision is now a function with TWO SEPARATE id parameters, so the wrong
 * choice is a named, reviewable expression instead of an invisible inline
 * argument, and the cases below state exactly what each choice yields.
 */
describe('rsvpConfirmationOnRouteChange — which post a navigation forgets', () => {
  it('forgets the post being LEFT, not the one being entered', () => {
    const afterDismissal: RsvpConfirmationState = { pending: null, confirmed: [POST] }
    const switched = rsvpConfirmationOnRouteChange(afterDismissal, POST, OTHER)
    expect(switched.confirmed).toEqual([])
    expect(switched.pending).toBeNull()
  })

  it('passing the id navigated TO as the forgotten id forgets NOTHING (the old call)', () => {
    // The shipped bug's argument choice, expressed against the real function:
    // the caller passes the CURRENT id where the PREVIOUS one belongs. It runs
    // and leaves the memory of POST standing. (This documents the choice; it
    // cannot observe the page — see the note above.)
    const afterDismissal: RsvpConfirmationState = { pending: null, confirmed: [POST] }
    const oldCall = rsvpConfirmationOnRouteChange(afterDismissal, OTHER, OTHER)
    expect(oldCall).toBe(afterDismissal)
    expect(oldCall.confirmed).toEqual([POST])
  })

  it('a dialog left OPEN on the post being left is CLOSED by the switch', () => {
    // Ping on OTHER (its box open) → Back to a previously visited post: the
    // pending box belongs to OTHER, so forgetting OTHER closes it. This is the
    // reachable path the wrong-id call left standing.
    const openOnOther: RsvpConfirmationState = { pending: OTHER, confirmed: [POST] }
    const switched = rsvpConfirmationOnRouteChange(openOnOther, OTHER, POST)
    expect(switched.pending).toBeNull()
    expect(switched.confirmed).toEqual([POST])
  })

  it('a first mount has nothing to forget and returns the SAME object', () => {
    // The page's ref starts null; nothing was shown before, so nothing is
    // forgotten and React discards the update.
    expect(rsvpConfirmationOnRouteChange(INITIAL_RSVP_CONFIRMATION, null, POST)).toBe(
      INITIAL_RSVP_CONFIRMATION,
    )
  })

  it('a re-render on the SAME route is a no-op, so a ping is never forgotten', () => {
    // The case that would be a self-inflicted regression: forgetting the post
    // currently being shown would erase the memory of a yes the parent just
    // dismissed, and the box would re-raise on the next render.
    const afterDismissal: RsvpConfirmationState = { pending: null, confirmed: [POST] }
    expect(rsvpConfirmationOnRouteChange(afterDismissal, POST, POST)).toBe(afterDismissal)
    // …and the same holds while a box is open on the current post.
    const openOnPost: RsvpConfirmationState = { pending: POST, confirmed: [] }
    expect(rsvpConfirmationOnRouteChange(openOnPost, POST, POST)).toBe(openOnPost)
  })

  it('an empty route id is never forgotten', () => {
    // The page normalises ''/undefined to null (the route is not a post yet).
    const afterDismissal: RsvpConfirmationState = { pending: null, confirmed: [POST] }
    expect(rsvpConfirmationOnRouteChange(afterDismissal, null, '')).toBe(afterDismissal)
  })
})

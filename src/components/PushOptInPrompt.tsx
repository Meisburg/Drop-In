import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import {
  DISMISSED_POINTER,
  decidePermissionPrompt,
  isPlaydateDetailPath,
  isPromptSuppressedPath,
  type BrowserPermission,
  type PermissionDecision,
  type PushOptInGate,
  type PushPromptTrigger,
} from '../lib/push'
import {
  armedPushOrigin,
  armedPushTrigger,
  clearArmedPushPrompt,
  currentDecision,
  currentOptInGate,
  currentPermission,
  dismissPushPrompt,
  enablePush,
  markPushPointOffered,
  offeredPushPoints,
  subscribePushArmed,
} from '../lib/pushClient'

/**
 * The post-action notification prompt (V8 ticket 08; V25 ticket 15's three
 * trigger points).
 *
 * THE PIN THIS COMPONENT EXISTS TO HOLD: never on a cold load. It renders
 * nothing until a MEANINGFUL ACTION has been recorded in this tab
 * (sessionStorage — `armPushPromptForAction`, called when an account is created,
 * after a post is created, and after a ping is saved), and it renders nothing at
 * all on /settings (where the real control lives), /onboarding and /new (surfaces
 * the app navigates out of by itself — see `isPromptSuppressedPath`). The whole
 * decision is the pure `decidePermissionPrompt` seam; this file only reads the
 * facts and draws the card.
 *
 * HOW IT LEARNS THAT THE ACTION HAPPENED (fix-round finding B): the arm is
 * written by a PAGE's event handler and this component lives in the SHELL,
 * outside `<Outlet/>` — and a ping saved from a feed card does NOT navigate, so
 * there was nothing to re-render it. Reading sessionStorage on mount and on
 * `pathname` change therefore only ever caught the one action that navigates
 * (a created post). The arm now publishes through
 * `subscribePushArmed` (src/lib/pushClient.ts), which is the observation path;
 * `pathname` is still re-read for the /settings suppression (and, since V25
 * ticket 15, it is also the fact that ends the RSVP deferral — see
 * `isRsvpDeferredAt`).
 *
 * EACH POINT IS OFFERED AT MOST ONCE (V25 ticket 15). The moment this card is
 * actually drawn for a trigger point, the point is recorded as offered
 * (`markPushPointOffered` — localStorage, so it survives a reload), and the pure
 * seam then refuses to ask for it again. "Not now" records the same point and
 * says the pinned fallback sentence on this render (see the button below); a
 * parent who says not-now at signup is still asked after their first post and
 * again when they say they are going.
 *
 * AND WHEN IT MAY NOT ASK (fix-round finding F): a denial or a "Not now" after
 * a real action used to render NOTHING — the fallback sentence the ticket pins
 * ("…pings and cancellations also show up in the While you were away card")
 * only ever appeared on /profile. Now the prompt stands down and says the
 * sentence once, in the same place, then stops. A cold load still renders
 * nothing at all: no trigger, no card, no note.
 */
export function PushOptInPrompt() {
  const { pathname } = useLocation()
  const [permission, setPermission] = useState<BrowserPermission>('unsupported')
  const [decision, setDecision] = useState<PermissionDecision>('unknown')
  const [gate, setGate] = useState<PushOptInGate>({ allowed: true, reason: null })
  const [trigger, setTrigger] = useState<PushPromptTrigger | null>(null)
  const [origin, setOrigin] = useState<string | null>(null)
  const [offered, setOffered] = useState<PushPromptTrigger[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** The sentence said INSTEAD of the prompt, held until it is dismissed or a
   *  new action makes a prompt legal again. */
  const [note, setNote] = useState<string | null>(null)

  const readFacts = useCallback(() => {
    setPermission(currentPermission())
    setDecision(currentDecision())
    setGate(currentOptInGate())
    setTrigger(armedPushTrigger())
    setOrigin(armedPushOrigin())
    setOffered(offeredPushPoints())
  }, [])

  useEffect(() => {
    readFacts()
    // The observation path for a saved ping (see the header). Returns the
    // unsubscribe, so a re-mount cannot leave a listener behind. `pathname`
    // stays in the deps for the same reason it was there before: a client-side
    // hop is a cheap moment to re-read local facts (a decision changed in
    // another tab is in localStorage, which IS shared).
    return subscribePushArmed(readFacts)
  }, [readFacts, pathname])

  // /settings owns this surface (its Notifications section, V11 ticket 06
  // moved it off the read-only /profile), and /onboarding and /new are surfaces
  // the app navigates out of by itself — see isPromptSuppressedPath. The
  // floating prompt stays out of the way on all three.
  const suppressed = isPromptSuppressedPath(pathname)

  // First-use audit (ticket 03): a drop-in's DETAIL page is the one surface
  // whose immediate confirmation — "✓ Going", the count, "You" — must not share
  // the screen with a permission request OR a notification note. The RSVP the
  // parent just made is the whole message. The pure decision seam already
  // refuses to ASK here; this also stands down the fallback notes so the
  // deferral is real visually and not just logically. Leaving the detail page
  // re-reads the facts and the held `note`, so the next feed visit still
  // surfaces whatever this parent's answer deserves.
  //
  // V25 ticket 15: the deferral is decided on the ACTION's route and the live
  // one together (see `isRsvpDeferredAt`), so a ping saved here is offered on
  // the next non-detail surface instead of being swallowed for the tab's life.
  const onDetailPage = isPlaydateDetailPath(pathname)

  const state = decidePermissionPrompt({
    decision,
    permission,
    trigger,
    origin,
    currentPath: pathname,
    offered,
    gate,
  })

  /**
   * The point the parent is looking at IS now offered (V25 ticket 15). Recorded
   * here, the moment the card is drawn, and not when the action was armed: a
   * ping saved on a detail page is armed and then DEFERRED, and the point may
   * not be spent without ever having been put in front of them.
   *
   * The write deliberately does not notify this component's own listeners — the
   * card that is up must not pull itself out from under the parent. The next
   * fact re-read (a route hop, an answer, a new action) sees the point as spent.
   */
  useEffect(() => {
    if (suppressed || onDetailPage) return
    if (!state.ask || trigger === null) return
    markPushPointOffered(trigger)
  }, [suppressed, onDetailPage, state.ask, trigger])

  /**
   * Say the fallback sentence ONCE, and stand the trigger down so it cannot
   * trail the parent around the app: the prompt is a one-shot offer, not a
   * banner. This is the path for the outcomes that are NOT the card's own "Not
   * now" button — a browser denial, a closed gate, an unsupported browser: each
   * is a fact that needs saying without a prompt, and the armed action is
   * consumed with it.
   *
   * It does NOT clear on a cold load (trigger null) — an unsupported browser or
   * an un-installed iOS Safari tab already has its explanation in /settings, and
   * a cold load must stay silent.
   *
   * It does NOT clear on a drop-in's DETAIL page either (first-use audit, ticket
   * 03): the screen suppresses the note as well as the ask, so clearing the
   * trigger there would consume it without ever showing the parent anything —
   * the deferral would silently become a dismissal. Leaving it armed lets the
   * next feed visit surface whatever this parent's answer deserves.
   *
   * A point already offered yields `note: null` (the pure seam's step 6), so
   * this effect cannot re-say a sentence for a spent point.
   */
  useEffect(() => {
    if (suppressed || onDetailPage || trigger === null) return
    if (state.ask) {
      setNote(null)
      return
    }
    if (state.note !== null) {
      setNote(state.note)
      clearArmedPushPrompt()
    }
  }, [suppressed, onDetailPage, trigger, state.ask, state.note])

  if (suppressed) return null

  if (state.ask) {
    return (
      <div
        className="mb-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3"
        data-testid="push-optin-prompt"
      >
        <p className="text-sm font-medium text-indigo-900">Want a heads-up?</p>
        <p className="mt-1 text-xs text-indigo-800">{state.reason}</p>
        {error === null ? null : <p className="mt-1 text-xs text-red-700">{error}</p>}
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            className="min-h-11 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            data-testid="push-optin-turn-on"
            disabled={busy}
            onClick={() => void handleTurnOn()}
          >
            {busy ? 'Turning on…' : 'Turn on notifications'}
          </button>
          <button
            type="button"
            className="min-h-11 rounded-md border border-indigo-300 bg-white px-3 py-2 text-sm font-medium text-indigo-700"
            data-testid="push-optin-not-now"
            onClick={() => {
              // The point is spent for good, and the sentence is said HERE
              // rather than derived from the stored trigger: the stored trigger
              // is cleared with the answer (V25 ticket 15 — a spent point must
              // read as silence, not as the sentence on a loop).
              if (trigger !== null) dismissPushPrompt(trigger)
              setNote(DISMISSED_POINTER)
            }}
          >
            Not now
          </button>
        </div>
      </div>
    )
  }

  // The fallback card: no buttons that could not work, just the honest
  // sentence — an error from a failed turn-on, or the pointer at the inbox.
  // Never on a detail page: the RSVP confirmation owns that screen (ticket 03).
  const message = error ?? note
  if (message === null || onDetailPage) return null

  return (
    <div
      className="mb-3 rounded-xl border border-slate-200 bg-white p-3"
      data-testid="push-optin-note"
    >
      <p className="text-xs text-slate-600">{message}</p>
      <button
        type="button"
        className="mt-2 min-h-11 text-xs font-medium text-indigo-700 underline"
        data-testid="push-optin-note-dismiss"
        onClick={() => {
          setNote(null)
          setError(null)
        }}
      >
        Got it
      </button>
    </div>
  )

  async function handleTurnOn() {
    setBusy(true)
    setError(null)
    const result = await enablePush()
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      readFacts()
      return
    }
    readFacts()
  }
}

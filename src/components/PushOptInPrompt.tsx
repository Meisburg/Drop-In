import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import {
  decidePermissionPrompt,
  isPlaydateDetailPath,
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
  subscribePushArmed,
} from '../lib/pushClient'

/**
 * The post-action notification prompt (V8 ticket 08).
 *
 * THE PIN THIS COMPONENT EXISTS TO HOLD: never on a cold load. It renders
 * nothing until a MEANINGFUL ACTION has been recorded in this tab
 * (sessionStorage — `armPushPromptForAction`, called after a post is created and
 * after a ping is saved), and it renders nothing at all on /settings, where the
 * real control lives. The whole decision is the pure `decidePermissionPrompt`
 * seam; this file only reads the facts and draws the card.
 *
 * HOW IT LEARNS THAT THE ACTION HAPPENED (fix-round finding B): the arm is
 * written by a PAGE's event handler and this component lives in the SHELL,
 * outside `<Outlet/>` — and a ping saved from a feed card does NOT navigate, so
 * there was nothing to re-render it. Reading sessionStorage on mount and on
 * `pathname` change therefore only ever caught the one action that navigates
 * (a created post). The arm now publishes through
 * `subscribePushArmed` (src/lib/pushClient.ts), which is the observation path;
 * `pathname` is still re-read for the /settings suppression.
 *
 * AND WHEN IT MAY NOT ASK (fix-round finding F): a denial or a "Not now" after
 * a real action used to render NOTHING — the fallback sentence the ticket pins
 * ("…pings and cancellations also show up in the While you were away card")
 * only ever appeared on /profile. Now the prompt stands down and says the
 * sentence once, in the same place, then stops (see the effect below). A cold
 * load still renders nothing at all: no trigger, no card, no note.
 */
export function PushOptInPrompt() {
  const { pathname } = useLocation()
  const [permission, setPermission] = useState<BrowserPermission>('unsupported')
  const [decision, setDecision] = useState<PermissionDecision>('unknown')
  const [gate, setGate] = useState<PushOptInGate>({ allowed: true, reason: null })
  const [trigger, setTrigger] = useState<PushPromptTrigger | null>(null)
  const [origin, setOrigin] = useState<string | null>(null)
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
  // moved it off the read-only /profile), so the floating prompt stays out of
  // the way there.
  const suppressed = pathname === '/settings'

  // First-use audit (ticket 03): a drop-in's DETAIL page is the one surface
  // whose immediate confirmation — "✓ Going", the count, "You" — must not share
  // the screen with a permission request OR a notification note. The RSVP the
  // parent just made is the whole message. The pure decision seam already
  // refuses to ASK here; this also stands down the fallback notes so the
  // deferral is real visually and not just logically. Leaving the detail page
  // re-reads the facts and the held `note`, so the next feed visit still
  // surfaces whatever this parent's answer deserves.
  const onDetailPage = isPlaydateDetailPath(pathname)

  const state = decidePermissionPrompt({ decision, permission, trigger, origin, gate })

  /**
   * Say the fallback sentence ONCE, and stand the trigger down so it cannot
   * trail the parent around the app: the prompt is a one-shot offer, not a
   * banner. The parent's answer is already remembered (a denial is in
   * localStorage, "Not now" is the 'dismissed' decision), so clearing the armed
   * trigger changes nothing about what may be asked later.
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
              dismissPushPrompt()
              readFacts()
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

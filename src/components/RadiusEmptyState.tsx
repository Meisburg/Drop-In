import { useState } from 'react'
import { Link } from 'react-router'
import { updateHomeZipRadius } from '../lib/db'
import { hasHomeZip } from '../lib/homeZip'
import { emptyRadiusCopy, radiusEscapes, radiusSaveErrorMessage } from '../lib/feed'
import { useSessionContext } from './SessionProvider'
import { LocationRequiredNotice } from './LocationRequiredNotice'

/**
 * The empty-radius state (V8 ticket 02) — ONE implementation for the feed
 * ("Near you") and Browse, because both screens filter by the same radius and
 * both used to dead-end on the same lie.
 *
 * What was wrong with the old block:
 * - "Nothing happening near you today — post the first one." The list is not
 *   "today": it is whatever has NOT ENDED yet (V9 ticket 04 moved the feed's
 *   cutoff from start-of-today to now, and it was never midnight-based on the
 *   far end either — the day sections render Tomorrow and beyond), so "today"
 *   was simply false — and the empty state was the one place a brand-new
 *   parent could not check it.
 * - It offered one action, a post. On the 5-mile default (`feed.ts`) that is
 *   the ceiling on everything else: with no posts inside 5 miles there is no
 *   way to discover that 35 is possible, so the first visit ends.
 *
 * So: the honest count ("Nothing within N miles yet." — N is the radius the
 * filter just used) plus the escapes (`radiusEscapes`: back to 5, widen to 20,
 * or see everything at 35) plus the post CTA, which stays.
 *
 * The escapes are ALWAYS rendered when they would actually change anything:
 * visibility is not conditional on the escape finding content, so an escape
 * that is still empty never turns this into a second dead end. And a
 * failed write says so (a silent no-op button would be exactly that dead end).
 *
 * The write path is the EXISTING `updateHomeZipRadius` (no new write path):
 * it validates the zip against the seeded gazetteer and the radius against the
 * 1–35 bounds before writing, then `refresh()` lands the new radius in the
 * shared session state — which is what re-runs the page's feed query, since
 * both pages key their load effect on `profile`.
 *
 * V13 ticket 05 (A1): the "past drop-ins" archive line that lived here (V9
 * ticket 04's see-past prop) is GONE. The feed still offers its own
 * archive door under the day sections (FeedPage renders PAST_DROP_INS_LABEL
 * itself); the empty-radius state no longer promises a personal archive from
 * either screen.
 *
 * V16 t06 item 1 added the opt-out prop `showEscapes` (default true), and
 * nothing else: the feed used to render a persistent radius picker directly
 * above this state, so on that one call site the escapes would have been a
 * second row of near-identical radius buttons doing the same job one line
 * apart — the "two controls that look identical" failure. V23 slice 1 removed
 * that picker, and V27 slice 1 stopped the feed opting out of the escapes, so
 * the feed renders them again and this state IS its one-tap widen path. The
 * prop survives for any caller that still wants to suppress them; Browse keeps
 * the defaults. The copy and the post CTA render either way, so suppressing
 * the escapes never turns this state into a dead end.
 *
 * V23 slice 1 adds a SECOND opt-out, `showPostCta` (default true): the feed
 * now has its own primary "Post a drop-in" button in the action row at the top
 * of the page, so rendering it again inside the empty state would put TWO
 * identical CTAs on the same screen — the exact "two post a drop-in buttons"
 * complaint this slice removes. The feed passes `showPostCta={false}`; Browse
 * keeps the default (the CTA is still the only way to post from /browse).
 *
 * V28 slice 2c: 2b removed the app-wide onboarding wall, so a SETTLED no-zip
 * parent now reaches this state from BOTH callers (the feed's empty list and
 * Browse's radiusReason) — where it used to be the radius empty state with
 * every escape disabled: a lie ("Nothing within N miles yet.") whose only
 * controls are inert. The component therefore early-returns the SHARED
 * LocationRequiredNotice (slice 2a) for that case; with a zip present it
 * renders exactly what it rendered before, unchanged.
 */
export function RadiusEmptyState({
  radiusMiles,
  showEscapes = true,
  showPostCta = true,
}: {
  radiusMiles: number
  showEscapes?: boolean
  /** Render the "Post a drop-in" link (default true; the feed opts out). */
  showPostCta?: boolean
}) {
  const { session, profile, refresh } = useSessionContext()
  const [busyRadius, setBusyRadius] = useState<number | null>(null)
  const [escapeError, setEscapeError] = useState<string | null>(null)
  const homeZip = profile?.home_zip ?? ''
  const escapes = showEscapes ? radiusEscapes(radiusMiles) : []
  /**
   * V8 ticket 02 REVIEW ROUND: an escape with nothing to widen FROM (no
   * session, no home zip) must not render as a live control — a button that
   * swallows its own tap is the "second dead end wearing a control's clothes"
   * this component exists to remove. V28 slice 2a fix 1/5: the zip half of the
   * test goes through the ONE predicate (hasHomeZip) — same rule, one
   * definition. V28 slice 2c: the no-zip state is a FLOW, not belt-and-braces
   * — 2b removed the shell's onboarding wall, so the early return below hands
   * a settled no-zip parent to the location notice and this disabled-escape
   * guard now remains only for the in-flight `session === null` case.
   */
  const escapesDisabled = busyRadius !== null || session === null || !hasHomeZip(homeZip)

  /**
   * V28 slice 2c: a SETTLED no-zip parent (profile loaded, `home_zip` unset)
   * gets the shared location notice, not this state — the radius copy would be
   * false (the query returned [] because there is no zip to distance from) and
   * every escape would be disabled above. Both callers (FeedPage, and Browse
   * via radiusReason, whose null distances make the radius "the reason")
   * render through this ONE component, so one early return fixes both. The
   * `profile !== null` half keeps an in-flight profile — which renders exactly
   * what it rendered before, escapes disabled — off the notice.
   */
  if (profile !== null && !hasHomeZip(profile.home_zip)) {
    return <LocationRequiredNotice />
  }

  async function handleEscape(target: number) {
    // One write at a time. An empty home zip cannot be widened FROM (the
    // validator would reject it) — since V28 slice 2b a settled no-zip parent
    // never gets here (the early return above renders the location notice), so
    // this guard is the defensive path only; the button stays inert rather
    // than inventing a zip.
    if (session === null || !hasHomeZip(homeZip) || busyRadius !== null) return
    setBusyRadius(target)
    setEscapeError(null)
    try {
      await updateHomeZipRadius(session.user.id, homeZip, target)
      await refresh()
    } catch (err) {
      // V16 t09: this escape writes the SAME column through the SAME
      // `updateHomeZipRadius` as the feed's handlers, so it shows the same
      // copy decision (radiusSaveErrorMessage) rather than a second wording —
      // and no longer the raw PostgREST CHECK text.
      setEscapeError(radiusSaveErrorMessage(err))
    } finally {
      setBusyRadius(null)
    }
  }

  return (
    <div
      data-testid="empty-radius-state"
      className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm"
    >
      <p className="text-sm text-slate-600">{emptyRadiusCopy(radiusMiles)}</p>
      {escapes.length > 0 ? (
        <div className="flex flex-wrap justify-center gap-2">
          {escapes.map((escape) => (
            <button
              key={escape.radiusMiles}
              type="button"
              disabled={escapesDisabled}
              onClick={() => void handleEscape(escape.radiusMiles)}
              className="flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-indigo-700 transition-colors motion-reduce:transition-none hover:bg-slate-50 disabled:opacity-50"
            >
              {busyRadius === escape.radiusMiles ? 'Updating…' : escape.label}
            </button>
          ))}
        </div>
      ) : null}
      {escapeError !== null ? <p className="text-sm text-red-600">{escapeError}</p> : null}
      {showPostCta ? (
        <Link
          to="/new"
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
        >
          Post a drop-in
        </Link>
      ) : null}
    </div>
  )
}

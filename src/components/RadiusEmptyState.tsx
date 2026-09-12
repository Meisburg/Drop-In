import { useState } from 'react'
import { Link } from 'react-router'
import { updateHomeZipRadius } from '../lib/db'
import { emptyRadiusCopy, PAST_DROP_INS_LABEL, radiusEscapes } from '../lib/feed'
import { useSessionContext } from './SessionProvider'

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
 * filter just used) plus the escapes (`radiusEscapes`: widen to 20, or see
 * everything at 35) plus the post CTA, which stays.
 *
 * The escapes are ALWAYS rendered when they would actually change anything:
 * visibility is not conditional on the widening finding content, so a wider
 * radius that is still empty never turns this into a second dead end. And a
 * failed write says so (a silent no-op button would be exactly that dead end).
 *
 * The write path is the EXISTING `updateHomeZipRadius` (no new write path):
 * it validates the zip against the seeded gazetteer and the radius against the
 * 2–35 bounds before writing, then `refresh()` lands the new radius in the
 * shared session state — which is what re-runs the page's feed query, since
 * both pages key their load effect on `profile`.
 *
 * V9 ticket 04 — `seePastHref`, and why it is a PROP rather than something this
 * component decides: "nothing ahead" is not "nothing ever", and the feed is
 * the screen where a parent would stop visiting because of that impression, so
 * the FEED offers the archive (V8/04's Past list on /profile) from here too.
 * Browse renders this same component for the PLACES directory, which has no
 * personal archive behind it — a "See past drop-ins" link there would promise
 * the viewer their own history from a screen about parks. So the caller that
 * HAS an archive passes the route, and the ones that do not pass nothing
 * (the link is not merely hidden; it does not exist).
 */
export function RadiusEmptyState({
  radiusMiles,
  seePastHref,
}: {
  radiusMiles: number
  /**
   * V9 ticket 04: the viewer's own archive (e.g. feed.PAST_DROP_INS_HREF —
   * /profile's Past list). Omitted = no archive line (Browse).
   */
  seePastHref?: string
}) {
  const { session, profile, refresh } = useSessionContext()
  const [busyRadius, setBusyRadius] = useState<number | null>(null)
  const [widenError, setWidenError] = useState<string | null>(null)
  const homeZip = profile?.home_zip ?? ''
  const escapes = radiusEscapes(radiusMiles)
  /**
   * V8 ticket 02 REVIEW ROUND: an escape with nothing to widen FROM (no
   * session, no home zip) must not render as a live control — a button that
   * swallows its own tap is the "second dead end wearing a control's clothes"
   * this component exists to remove. The shell's onboarding gate keeps that
   * state off these pages, so this is a belt-and-braces guard, not a flow.
   */
  const escapesDisabled = busyRadius !== null || session === null || homeZip === ''

  async function handleEscape(target: number) {
    // One write at a time. An empty home zip cannot be widened FROM (the
    // validator would reject it) — the onboarding gate keeps that state off
    // these pages, and the button stays inert rather than inventing a zip.
    if (session === null || homeZip === '' || busyRadius !== null) return
    setBusyRadius(target)
    setWidenError(null)
    try {
      await updateHomeZipRadius(session.user.id, homeZip, target)
      await refresh()
    } catch (err) {
      setWidenError(err instanceof Error ? err.message : 'Could not widen your radius. Try again.')
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
              className="flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-indigo-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              {busyRadius === escape.radiusMiles ? 'Widening…' : escape.label}
            </button>
          ))}
        </div>
      ) : null}
      {widenError !== null ? <p className="text-sm text-red-600">{widenError}</p> : null}
      {/* V9 ticket 04: the archive line — after the escapes and above the post
          CTA (which stays the last and strongest element; "nothing ahead" is
          usually a supply problem, and posting is the answer to that). It says
          only WHERE the past ones are, never how many — see
          feed.PAST_DROP_INS_LABEL for why it carries no count. */}
      {seePastHref !== undefined ? (
        <Link
          to={seePastHref}
          className="text-sm font-medium text-indigo-600 underline-offset-2 hover:underline"
        >
          {PAST_DROP_INS_LABEL}
        </Link>
      ) : null}
      <Link
        to="/new"
        className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
      >
        Post a drop-in
      </Link>
    </div>
  )
}

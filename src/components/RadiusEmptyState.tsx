import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { updateHomeZipRadius } from '../lib/db'
import { hasHomeZip } from '../lib/homeZip'
import { createHerePrefill } from '../lib/feedCreateHere'
import { emptyRadiusBeyondCopy, emptyRadiusCopy, radiusEscapes, radiusSaveErrorMessage, EMPTY_RADIUS_BROWSE_HEADLINE, EMPTY_RADIUS_BROWSE_LABEL } from '../lib/feed'
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
 * - It offered one action, a post. On the default radius (`feed.ts`) that is
 *   the ceiling on everything else: with no posts inside it there is no
 *   way to discover that 35 is possible, so the first visit ends.
 *
 * So: the honest count ("Nothing within N miles yet." — N is the radius the
 * filter just used) plus the escapes (`radiusEscapes`: back to the default,
 * widen to 20, or see everything at 35) plus the post CTA, which stays.
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
 *
 * meetup-empty-state: a THIRD opt-in prop, `showCreateHere` (default FALSE —
 * only the feed passes it, so the Browse caller is byte-for-byte unchanged).
 * It renders the secondary "Create one here" control: navigate to /new
 * seeded with the viewer's OWN location through the SAME PlacePrefill router
 * state the place pages use (App.tsx NewRoute reads `state.place`). The
 * derivation is the pure seam (lib/feedCreateHere.ts, sibling-tested): the
 * one place this state can name is the viewer's home zip — the home pin the
 * feed's map band draws — and when no place can be named the control does not
 * render, even with the prop on (a button that would seed /new with nowhere
 * is the control-that-swallows-its-tap this component exists to remove).
 * It is NOT the "Post a drop-in" link V23 removed (the raised nav "+" stays
 * the persistent post action): this control carries a location the bare post
 * CTA never did. `showPostCta` stays false on the feed, exactly as it is.
 */
export function RadiusEmptyState({
  radiusMiles,
  showEscapes = true,
  showPostCta = true,
  showBrowseCta = false,
  showCreateHere = false,
  beyondRadiusCount = 0,
}: {
  radiusMiles: number
  showEscapes?: boolean
  /** Render the "Post a drop-in" link (default true; the feed opts out). */
  showPostCta?: boolean
  /**
   * V31 v31-1: render the value-first headline and the door to the places
   * directory (default FALSE — Browse opts in to nothing).
   *
   * It defaults OFF because this component is shared with Browse, where the
   * door would point at the screen the parent is already on: a browse → browse
   * link is a control that cannot do anything. The feed — the one caller whose
   * parent has not seen the directory — passes it.
   *
   * When true, this is the state's ONLY filled control: the radius escapes stay
   * secondary buttons below it, because the panel's finding was about what the
   * screen OFFERS FIRST, not about removing the escapes (they are the feed's
   * one-tap widen path, V27 slice 1).
   */
  showBrowseCta?: boolean
  /**
   * meetup-empty-state: render the secondary "Create one here" control
   * (default FALSE — only the FEED passes it; the Browse caller stays
   * byte-for-byte unchanged). It navigates to /new with the viewer's OWN
   * location as the PlacePrefill router state (`state.place`, the same shape
   * the place pages seed — App.tsx NewRoute). The derivation is the pure seam
   * `createHerePrefill` (lib/feedCreateHere.ts, sibling-tested): it names the
   * viewer's home zip — the home pin the feed's map band draws — and returns
   * null when no place can be named, in which case the control does not
   * render, even with this prop on.
   */
  showCreateHere?: boolean
  /**
   * V29 v29-6: how many drop-ins the SAME fetch found outside this radius but
   * inside the widest one. 0 (the default, and Browse's value today) renders no
   * second line at all — an empty city is not sold a number.
   */
  beyondRadiusCount?: number
}) {
  const { session, profile, refresh } = useSessionContext()
  const navigate = useNavigate()
  const [busyRadius, setBusyRadius] = useState<number | null>(null)
  const [escapeError, setEscapeError] = useState<string | null>(null)
  const homeZip = profile?.home_zip ?? ''
  const escapes = showEscapes ? radiusEscapes(radiusMiles) : []
  /**
   * meetup-empty-state: the "Create one here" prefill. The pure seam names the
   * ONE place this state can name (the viewer's own home zip — the home pin the
   * feed's map band already draws) and returns null when it cannot, so the
   * control below renders only when the tap can actually seed /new with a
   * location (a button that would seed nowhere is the control-that-swallows-
   * its-tap this component exists to remove). Gated on the opt-in prop so the
   * Browse caller — which never passes it — is unchanged.
   */
  const createHere = showCreateHere ? createHerePrefill(homeZip) : null
  /**
   * V8 ticket 02 REVIEW ROUND: an escape with nothing to widen FROM (no
   * session, no home zip) must not render as a live control — a button that
   * swallows its own tap is the "second dead end wearing a control's clothes"
   * this component exists to remove. V28 slice 2a fix 1/5: the zip half of the
   * test goes through the ONE predicate (hasHomeZip) — same rule, one
   * definition. V28 slice 2c (fix 1/5 correction): this guard covers BOTH the
   * in-flight `session === null` case AND the in-flight PROFILE window — while
   * the profile is in flight `homeZip` is `profile?.home_zip ?? ''`, and
   * `!hasHomeZip('')` is true, so the clause EVALUATES true there too (the
   * guard is not wrong — but it is UNREACHABLE there: no current caller
   * renders this component while the profile is in flight, so nothing can
   * actually hit this state with a null profile — the early return's note
   * below carries the three caller citations; cross-referenced here, not
   * restated, so the two comments cannot drift apart). (Slice 2c's first
   * draft said "only the `session === null` case" — that was wrong — and fix
   * 1/5's "the in-flight window is real on these pages" contradicted the early
   * return's note, which fix 2/5 corrects. The settled no-zip parent — the
   * case that matters — is diverted by the early return before the guard is
   * ever consulted. */
  const escapesDisabled = busyRadius !== null || session === null || !hasHomeZip(homeZip)

  /**
   * V28 slice 2c: a SETTLED no-zip parent (profile loaded, `home_zip` unset)
   * gets the shared location notice, not this state — the radius copy would be
   * false (the query returned [] because there is no zip to distance from) and
   * every escape would be disabled above. Both callers (FeedPage, and Browse
   * via radiusReason, whose null distances make the radius "the reason")
   * render through this ONE component, so one early return fixes both.
   * V28 slice 2c fix 1/5: the `profile !== null` half is deliberate
   * belt-and-braces, not a hole a caller falls into — no surface renders this
   * component while the profile is in flight: FeedPage renders "Loading…"
   * while `posts === null` and its feed effect never runs before the profile
   * settles (`FeedPage.tsx` feed effect's `profile === null` gate, ~line 495,
   * empty-state branch ~1248), BrowsePage returns "Loading…" on a null profile
   * (`BrowsePage.tsx` ~313), and NewPlaydatePage's embedded sheet sits behind
   * its own `loading` guard (`NewPlaydatePage.tsx` ~1231). So the notice fires
   * exactly when the state settles; the half only matters if a FUTURE caller
   * forgets to guard on the profile — then it renders what this state always
   * rendered (escapes disabled), never the notice.
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
      {/* V31 v31-1: value first, then the honest count — the headline names no
          number (the line under it does) and promises no content. */}
      {showBrowseCta ? (
        <p className="text-sm font-medium text-slate-700">{EMPTY_RADIUS_BROWSE_HEADLINE}</p>
      ) : null}
      <p className="text-sm text-slate-600">{emptyRadiusCopy(radiusMiles)}</p>
      {/* V29 v29-6: the answer to "is it worth widening?" — only when the same
          read counted something further out, and quoting the same ceiling the
          "See everything" escape writes. No count → no line, so an empty city
          stays an honest dead end with live escapes rather than a number that
          means nothing. */}
      {emptyRadiusBeyondCopy(beyondRadiusCount) !== null ? (
        <p data-testid="empty-radius-beyond" className="text-sm text-slate-600">
          {emptyRadiusBeyondCopy(beyondRadiusCount)}
        </p>
      ) : null}
      {/* V31 v31-1: THE DOOR. The state's one filled control, above the escapes
          — the panel's parents reached for the directory while the screen in
          front of them offered three ways to widen a radius. Deliberately NOT a
          post CTA: `showPostCta` stays false on the feed, so V27's ruling ("the
          raised nav + is the persistent post action") is untouched. */}
      {showBrowseCta ? (
        <Link
          to="/browse"
          data-testid="empty-radius-browse"
          className="flex min-h-11 items-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors motion-reduce:transition-none"
        >
          {EMPTY_RADIUS_BROWSE_LABEL}
        </Link>
      ) : null}
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
      {/* meetup-empty-state: THE LOCATION-SEEDED CREATE. Distinct from the
          "Post a drop-in" link V23 removed — that one carried nothing; this one
          carries the viewer's OWN location (the home zip) through the
          PlacePrefill router state, so the post starts where the parent already
          is. Rendered only when the seam named that place (createHere !== null),
          so it is never a control that swallows its tap. Secondary, below the
          escapes: the escapes answer "is it worth widening?", this answers "or
          start one here". Absent on Browse, which never passes the prop. */}
      {createHere !== null ? (
        <button
          type="button"
          data-testid="empty-radius-create-here"
          onClick={() => navigate('/new', { state: { place: createHere } })}
          className="flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-indigo-700 transition-colors motion-reduce:transition-none hover:bg-slate-50"
        >
          Create one here
        </button>
      ) : null}
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

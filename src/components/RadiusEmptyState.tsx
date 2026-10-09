import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { updateHomeZipRadius } from '../lib/db'
import { hasHomeZip } from '../lib/homeZip'
import { createHerePrefill } from '../lib/feedCreateHere'
import { launchpadPrefill, type LaunchpadPlace } from '../lib/feedLaunchpad'
import { emptyRadiusBeyondCopy, emptyRadiusCopy, nextWidenRadius, radiusEscapes, radiusSaveErrorMessage, WIDEN_SEARCH_LABEL, EMPTY_RADIUS_BROWSE_HEADLINE, EMPTY_RADIUS_BROWSE_LABEL, EMPTY_RADIUS_LAUNCHPAD_HEADLINE, EMPTY_RADIUS_LAUNCHPAD_LINE, EMPTY_RADIUS_LAUNCHPAD_ACTION } from '../lib/feed'
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
 * now has its own primary "Create a drop-in" button in the action row at the top
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
 *
 * empty-state-one-button (Jon's doctrine, 2026-10-08 — "I'm a minimalist and I
 * don't wanna make the user think … there should just be one button here …
 * WIDEN THE SEARCH"): the FEED's empty state offers ONE control, not a row.
 * The feed passes `widenOnly` (default FALSE — the Browse caller keeps the
 * component's full option set, untouched): with it on, the state renders its
 * honest count line (plus the beyond line when the same read counted
 * something) and the SINGLE filled "Widen the search" button, which
 * re-queries at the immediate next radius preset (`nextWidenRadius`:
 * 2 → 5 → 10 → 20 → 35, one step per tap, the count line re-naming itself
 * after each) through the SAME `updateHomeZipRadius` + `refresh()` path the
 * escapes used. At the 35-mile ceiling `nextWidenRadius` is null and the
 * button does not render — a widen that cannot widen is the dead control this
 * component exists to remove — so at the max the state is honestly terminal.
 * Every other control (the browse door + headline, the escape ladder, the
 * location-seeded create, the post CTA) is suppressed in this mode: one
 * button, not four.
 *
 * V37 slice A (`P4K2`, the launchpad): the empty state stops being a dead end by
 * naming up to THREE nearby playgrounds, each with its distance and a control
 * that hosts a drop-in THERE. The feed's cold-start measurement is why: 234
 * places (151 playgrounds) and ZERO drop-ins — supply of PLACES, none of PEOPLE.
 * So the panel does not show more content; it converts the one parent present
 * into the first host, using the place supply that already exists.
 *
 * The playgrounds arrive as a PROP (`playgrounds`), derived by the pure seam
 * `nearbyPlaygrounds` (lib/feedLaunchpad.ts, sibling-tested) from the SAME
 * directory read the browse surfaces use — this component does not fetch, does
 * not know the radius, and does not pick the three. Default EMPTY, so Browse and
 * every other caller render BYTE-FOR-BYTE what they rendered before. An empty
 * list renders NOTHING extra: never an empty list, never a placeholder row — the
 * state must never be worse than it is today.
 *
 * It is gated on `widenOnly` (the feed's mode), because that is the mode whose
 * doctrine it extends: the host action at a NAMED playground becomes that panel's
 * primary control, and the widen button stays the one secondary control. The
 * launchpad therefore replaces no control — it inserts an answer ABOVE them.
 */
export function RadiusEmptyState({
  radiusMiles,
  showEscapes = true,
  showPostCta = true,
  showBrowseCta = false,
  showCreateHere = false,
  widenOnly = false,
  beyondRadiusCount = 0,
  playgrounds = [],
}: {
  radiusMiles: number
  showEscapes?: boolean
  /** Render the "Create a drop-in" link (default true; the feed opts out). */
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
   * empty-state-one-button (Jon's doctrine, 2026-10-08): render the ONE
   * control — the filled "Widen the search" button that re-queries at the
   * immediate next radius preset (`nextWidenRadius`, the single next step on
   * the `RADIUS_MILES_OPTIONS` ladder, not the whole `radiusEscapes` row) —
   * and suppress every other control (the browse door + headline, the escape
   * ladder, the location-seeded create, the post CTA). Default FALSE: the
   * Browse caller keeps the component's full option set, untouched. The
   * honest count line and the beyond line render in this mode too — they are
   * the reason the button exists, not controls.
   */
  widenOnly?: boolean
  /**
   * V29 v29-6: how many drop-ins the SAME fetch found outside this radius but
   * inside the widest one. 0 (the default, and Browse's value today) renders no
   * second line at all — an empty city is not sold a number.
   */
  beyondRadiusCount?: number
  /**
   * V37 slice A (`P4K2`): up to three nearby playgrounds the empty state may
   * name, each with its distance — derived by the pure seam `nearbyPlaygrounds`
   * (lib/feedLaunchpad.ts) from the SAME directory read the browse surfaces use.
   *
   * Default `[]`, and an empty array renders NOTHING: no list, no placeholder row,
   * no "no playgrounds" line. Browse (and every caller that does not pass it)
   * therefore renders byte-for-byte what it rendered before, and the state is
   * never worse than it is today.
   */
  playgrounds?: readonly LaunchpadPlace[]
}) {
  const { session, profile, refresh } = useSessionContext()
  const navigate = useNavigate()
  const [busyRadius, setBusyRadius] = useState<number | null>(null)
  const [escapeError, setEscapeError] = useState<string | null>(null)
  const homeZip = profile?.home_zip ?? ''
  // empty-state-one-button: the widen-only mode (the feed's doctrine — ONE
  // button) never renders the ladder, so it is not even computed there.
  const escapes = showEscapes && !widenOnly ? radiusEscapes(radiusMiles) : []
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
   * empty-state-one-button: the one-step widen target — the IMMEDIATE next
   * preset up the `RADIUS_MILES_OPTIONS` ladder (2 → 5 → 10 → 20 → 35), null
   * at the ceiling. Only the widen-only mode renders it; a null target means
   * the button does not render either (a widen that cannot widen is the dead
   * control this component exists to remove).
   */
  const nextWiden = widenOnly ? nextWidenRadius(radiusMiles) : null
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
          number (the line under it does) and promises no content. The headline
          frames the browse door, so the widen-only mode (which removes the
          door) renders the count without it. */}
      {showBrowseCta && !widenOnly ? (
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
      {/* empty-state-one-button (Jon's doctrine, 2026-10-08): THE ONE
          CONTROL. With `widenOnly` (the feed), the state renders the single
          filled "Widen the search" button — the immediate next radius preset
          (`nextWiden`), re-queried through the SAME `updateHomeZipRadius` +
          `refresh()` path the escapes used, so the count line re-names itself
          with the new radius on the re-render. The button is gated by the
          shared one-write-at-a-time rule (the `escapesDisabled` guard above:
          a write needs a session + a home zip, and one write runs at a time).
          A null target (the 35-mile ceiling) renders NOTHING: a widen that
          cannot widen is the dead control this state exists to remove — at
          the max the state is honestly terminal. Every other control stays in
          the branch below, which the Browse caller — which never passes the
          prop — renders byte-for-byte unchanged. */}
      {widenOnly ? (
        <>
          {/* V37 slice A (`P4K2`): THE LAUNCHPAD. The empty state's reason for
              existing when there is nothing to show — a real playground, its
              distance, and the one control that starts a drop-in THERE.

              ⚠️ RENDERED ONLY WHEN THERE IS SOMETHING TO NAME. `playgrounds` is
              empty when the seam found no playground inside the radius (or no
              gazetteer / no zip), and then this whole block is absent: no empty
              list, no placeholder row, no "no playgrounds" line. The state falls
              through to exactly what it rendered before this slice.

              ⚠️ IT IS THE PRIMARY CONTROL. Jon's doctrine for this panel is ONE
              obvious action, and the one that matters at a cold start is "host
              the first drop-in at this playground" — so the rows' controls are
              the filled ones and the widen button below keeps its place as the
              single secondary escape. No fourth control is added: three is the
              founder's ask and also the cap (LAUNCHPAD_PLACE_LIMIT), and a longer
              list would read as a directory — which is what the browse door is
              for. */}
          {playgrounds.length > 0 ? (
            <div className="flex w-full flex-col gap-2">
              <p className="text-sm font-medium text-slate-700">
                {EMPTY_RADIUS_LAUNCHPAD_HEADLINE}
              </p>
              <p className="text-sm text-slate-600">{EMPTY_RADIUS_LAUNCHPAD_LINE}</p>
              <ul className="flex list-none flex-col gap-2 p-0">
                {playgrounds.map((row) => (
                  <li key={row.place.id}>
                    {/* ⚠️ THE WHOLE ROW IS THE HOST ACTION. An earlier draft put a
                        "Host the first drop-in" label INSIDE each row, repeated three
                        times — which both read as noise and squeezed the place name
                        to an ellipsis ("Ballard C…") at 390px. The headline above the
                        list already states the action once; the row's job is to say
                        WHICH playground, and its accessible name says what tapping it
                        does. That is the action carried once, not three times. */}
                    <button
                      type="button"
                      data-testid="empty-radius-launchpad-place"
                      data-place-id={row.place.id}
                      aria-label={`${EMPTY_RADIUS_LAUNCHPAD_ACTION} at ${row.place.name}, ${row.distanceLabel}`}
                      onClick={() => navigate('/new', { state: { place: launchpadPrefill(row) } })}
                      className="flex w-full min-h-11 items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white px-4 py-2 text-left text-sm font-medium text-indigo-700 outline-none transition-colors motion-reduce:transition-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-indigo-500"
                    >
                      <span className="min-w-0 flex-1 truncate">{row.place.name}</span>
                      {/* The launchpad's own label: the same formatter the browse
                          cards use at 1 mi and up, floored to "<1 mi" below it (see
                          `launchpadDistanceLabel` — three real sub-mile playgrounds
                          all read "0 mi" otherwise). `shrink-0` keeps the distance
                          whole at 390px; the NAME truncates instead. */}
                      <span
                        data-testid="empty-radius-launchpad-distance"
                        className="shrink-0 text-slate-500"
                      >
                        {row.distanceLabel}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {nextWiden !== null ? (
            <button
              type="button"
              data-testid="empty-radius-widen"
              disabled={escapesDisabled}
              onClick={() => void handleEscape(nextWiden)}
              className="flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-indigo-700 transition-colors motion-reduce:transition-none hover:bg-slate-50 disabled:opacity-50"
            >
              {busyRadius === nextWiden ? 'Updating…' : WIDEN_SEARCH_LABEL}
            </button>
          ) : null}
          {escapeError !== null ? <p className="text-sm text-red-600">{escapeError}</p> : null}
        </>
      ) : (
        <>
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
              Create a drop-in
            </Link>
          ) : null}
        </>
      )}
    </div>
  )
}

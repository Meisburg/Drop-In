import type { FormEvent, ReactNode } from 'react'
import { Link } from 'react-router'
import {
  AGE_RANGE_CHIPS,
  durationLabel,
  formatTimeLabel,
  kidLabel,
  PLAYDATE_DURATIONS_MINUTES,
  stepTimeMinutes,
  TIME_STEP_MINUTES,
  TITLE_MAX_LENGTH,
} from '../lib/feed'
import type { AgeBounds, PlaydateFormErrors, PlaydateFormValues, RecentPlace } from '../lib/feed'
import {
  BROWSE_PLACES_LABEL,
  PLACE_PICKER_LABEL,
  placeIndoorLabel,
  placeKindLabel,
  SOMEWHERE_ELSE_LABEL,
} from '../lib/places'
import type { Kid, Neighborhood, Place } from '../lib/types'

/**
 * The drop-in form's FIELD SET (V8 ticket 05), extracted from /new so there
 * is exactly ONE implementation of every field, chip and error — the shared
 * presentational component behind both `/new` (post a drop-in) and
 * `/playdate/:id/edit` (fix one). This is the `groupByDay` promotion
 * precedent: pure presentational markup + the values/handlers it is given;
 * it owns NO state, NO fetching and NO submit logic (the pages do).
 *
 * What the two pages keep for themselves (deliberately NOT here): the /new
 * quick-fill preset card (V8 ticket 01's "we're here until 5" — an
 * affordance for writing a NEW plan, passed in as `preset`), the /new
 * "Recent places" chips (a form-filling convenience, passed in as
 * `recentPlaces` + `onApplyRecentPlace`), and the duplicate banner. The
 * edit page passes neither, so a form that is fixing existing values gets
 * no new-plan shortcuts — and no dead controls.
 *
 * EVERY user-visible string, placeholder, aria-label and control name in
 * here is byte-identical to the /new form it came from: the e2e suite drives
 * /new through the placeholders, the stepper buttons, `start-time-label`,
 * the duration chips and the submit label, so this extraction must be
 * invisible to it.
 *
 * V9 ticket 01 (the one thing that is NOT symmetric between the two pages):
 * the place picker leads /new (`locationFirst`) and the neighbourhood select
 * is gone from it (`showNeighborhood={false}`). The edit form passes neither
 * prop, so it renders exactly the V8 ticket 05 markup — the e2e/post-edit-delete
 * spec keeps driving the same controls, and a post that DOES carry a
 * neighbourhood can still be seen and fixed there.
 *
 * V9 ticket 03 (SUMMARY mode): /new also passes `summaryLines` — the answers
 * read back as text, at the top of the form — and with it the form splits into
 * "the three decisions" (the place picker, the duration chips and the editable
 * title line, all visible) and ONE "More options" disclosure holding the rest
 * (the address, the start date + the 30-minute stepper, "Kids you're bringing",
 * Details, and "Repeat weekly"). The disclosure is collapsed by default and is
 * CONTROLLED from the page (`moreOptionsOpen` / `onToggleMoreOptions`) so the
 * page can open it when a submit fails on a field inside it — this component
 * still owns no state.
 *
 * The TITLE on the summary is a READ-BACK that becomes the input only while it
 * is being edited (`titleEditing` / `onEditTitle`, also page-owned): review
 * cycle 1, F2, because an always-open input would make the title the form's
 * first input and its first tab stop, inverting V9 ticket 01's "the place
 * picker is /new's FIRST field" AC. This way both tickets hold at once.
 */
/** V3 slice 5 (ticket 08): the optional address field's cap (trim only, no DB CHECK). */
export const ADDRESS_MAX_LENGTH = 120
const DAY_MINUTES = 24 * 60

/**
 * V9 ticket 03: the ONE disclosure's copy. "More options" is deliberately
 * plain — it is a door, not a feature name — and the hint says what is behind
 * it, so a parent can tell whether they need to open it without opening it.
 */
export const MORE_OPTIONS_LABEL = 'More options'
export const MORE_OPTIONS_HINT = 'A date, an address, kids, details, or a weekly repeat.'

/** The summary's title read-back: a stable handle for the affordance's e2e. */
export const TITLE_LINE_TESTID = 'title-line'
/** What tells the parent that the read-back line is editable. */
export const TITLE_LINE_HINT = 'Tap the title to change it.'

export interface PlaydateFormFieldsProps {
  values: PlaydateFormValues
  errors: PlaydateFormErrors
  onFieldChange: <K extends keyof PlaydateFormValues>(
    field: K,
    value: PlaydateFormValues[K],
  ) => void
  /**
   * The optional street address. It lives outside PlaydateFormValues (the
   * pinned field set of the V2 form), so it rides its own value + handler.
   */
  address: string
  onAddressChange: (value: string) => void
  /**
   * The neighbourhoods for the select. Optional with a `null` default: V9
   * ticket 01 takes the field off /new entirely (`showNeighborhood={false}`),
   * so that page has nothing to pass — /edit still passes its loaded list.
   * null = still loading (the select renders disabled).
   */
  neighborhoods?: Neighborhood[] | null
  /**
   * V9 ticket 01: render the neighbourhood SELECT? Default TRUE — /edit keeps
   * its exact current markup, placeholders and control names (V8 ticket 05,
   * driven by e2e/post-edit-delete), and only /new turns it off. The
   * neighbourhood stopped being a question there because it is the one thing
   * parents cannot answer; the /edit form still has to be able to show and fix
   * a post that carries one.
   */
  showNeighborhood?: boolean
  /**
   * V9 ticket 01: the LOCATION-FIRST presentation, used by /new alone.
   *
   * ON, the place block becomes the page's FIRST field and says what it is
   * ("Where? — pick a place"), the address reads as the normal case rather than
   * an optional extra (it arrives with the picked place), and the /new-only
   * "Recent places" chips sit directly under it. OFF (the default, and every
   * /edit render) nothing moves: the title comes first, then place, exactly as
   * V8 ticket 05 left it.
   */
  locationFirst?: boolean
  /**
   * V9 ticket 01: opens the picker's inline list in BROWSE mode (the directory,
   * A→Z) instead of the typed matches. Rendered as the visible "Browse places"
   * button BESIDE the field — omitted (as /edit omits it) means no button at
   * all, which is also how the page degrades when the directory could not be
   * read (a button that cannot browse is worse than no button).
   */
  onBrowsePlaces?: () => void
  /** Whether that browse list is currently open (the button's aria-expanded). */
  browsePlacesOpen?: boolean
  /**
   * V9 ticket 03: the SUMMARY read-back — `postSummaryLines(values)` — rendered
   * as the form's FIRST block, one line each, with the editable title line
   * under it. Passing it also switches the form to the "three decisions"
   * layout: the three answers the parent actively gives (place, how long, the
   * title) stay visible, and everything else moves behind the one "More
   * options" disclosure.
   *
   * OMITTED (the default, and every /edit render) means neither: the form
   * renders exactly the V8 ticket 05 markup, with no summary, no disclosure
   * and every field in its own place.
   */
  summaryLines?: string[]
  /**
   * V9 ticket 03: is the summary's title line being EDITED? Off (the default),
   * it renders as the read-back text the parent can tap; on, it is the ordinary
   * title input, in place. Page-owned for two reasons: this component owns no
   * state, and the page is what knows the title is a generated default the
   * parent may want to change.
   */
  titleEditing?: boolean
  onEditTitle?: () => void
  /**
   * V9 ticket 03: is the "More options" disclosure open? Owned by the PAGE
   * (this component owns no state) for one reason: a failed submit must be
   * able to open it — an error for the start date lives in there, and a
   * message rendered inside something the parent collapsed is not a message.
   */
  moreOptionsOpen?: boolean
  onToggleMoreOptions?: () => void
  /**
   * V9 ticket 03: grow every control this form renders to a 44px minimum
   * height (the phone tap-target rule scripts/mobile-audit.mjs enforces on the
   * signed-out routes, which cannot walk /new — it is behind the session).
   *
   * Default FALSE on purpose: /edit keeps rendering the markup V8 ticket 05
   * shipped, byte for byte, so e2e/post-edit-delete keeps driving the controls
   * it knows. Only /new asks for the roomier targets.
   */
  minTouchTargets?: boolean
  /** null = still loading; [] = none yet OR the load failed (same empty state). */
  kids: Kid[] | null
  selectedKidIds: string[]
  onToggleKid: (kidId: string) => void
  /** /new only: the remembered places (no chips row when empty/omitted). */
  recentPlaces?: RecentPlace[]
  /** /new only: one tap fills place + address + neighborhood. */
  onApplyRecentPlace?: (place: RecentPlace) => void
  /**
   * V8 ticket 07: the /new-only place AUTOCOMPLETE — the matches for what the
   * parent has typed, rendered INLINE (in the form's flow, never as an overlay:
   * an absolutely-positioned dropdown over a 375px form would cover the next
   * control, and covering a control is how a tap lands on the wrong thing).
   *
   * All four props are omitted by the EDIT form, which renders exactly the V8
   * ticket 05 markup — no suggestions, no dead controls.
   */
  placeSuggestionsOpen?: boolean
  placeSuggestions?: Place[]
  onPickPlace?: (place: Place) => void
  /** "Somewhere else": keep the typed text, no place link. */
  onSomewhereElse?: () => void
  /** /new only: the quick-fill preset card, rendered inside the form first. */
  preset?: ReactNode
  /**
   * V8 ticket 06: the /new-only "Repeat weekly" control (the series toggle +
   * the weekday it derives from the chosen start date), rendered under the
   * duration chips — next to the time it repeats. Passed in as a slot for the
   * same reason as `preset`: this component owns no state and no submit
   * logic, and the EDIT form must never show it (changing one occurrence of a
   * series is not how a series is edited).
   */
  repeatSlot?: ReactNode
  /**
   * V9 ticket 05: the /new-only "Ages (optional)" chip row (the exported
   * AgeRangeChips above), rendered INSIDE the "More options" disclosure —
   * under the kids picker, which is the same subject ("who's coming / what
   * ages"). Another slot rather than props, for the exact reason `repeatSlot`
   * is one: this component owns no state, and the EDIT form passes nothing, so
   * no dead control appears there.
   */
  agesSlot?: ReactNode
  submitLabel: string
  submittingLabel: string
  submitBusy: boolean
  /** Extra disable condition (the pages' own load states). */
  submitDisabled?: boolean
  submitError: string | null
  onSubmit: (event: FormEvent) => void
}

export function PlaydateFormFields({
  values,
  errors,
  onFieldChange,
  address,
  onAddressChange,
  neighborhoods = null,
  showNeighborhood = true,
  locationFirst = false,
  onBrowsePlaces,
  browsePlacesOpen = false,
  summaryLines,
  titleEditing = false,
  onEditTitle,
  moreOptionsOpen = false,
  onToggleMoreOptions,
  minTouchTargets = false,
  kids,
  selectedKidIds,
  onToggleKid,
  recentPlaces,
  onApplyRecentPlace,
  placeSuggestionsOpen = false,
  placeSuggestions,
  onPickPlace,
  onSomewhereElse,
  preset,
  repeatSlot,
  agesSlot,
  submitLabel,
  submittingLabel,
  submitBusy,
  submitDisabled = false,
  submitError,
  onSubmit,
}: PlaydateFormFieldsProps) {
  const endTotal = values.startMinutes + values.durationMinutes
  // V3 slice 5 (ticket 08): the address's inline error (≤120 after trim;
  // computed at render, like the title's live counter — no separate
  // error state).
  const addressError =
    address.trim().length > ADDRESS_MAX_LENGTH
      ? `Keep the address to ${ADDRESS_MAX_LENGTH} characters.`
      : null
  const chips = recentPlaces ?? []
  // V9 ticket 03: the 44px phone tap-target rule, applied to the controls this
  // form renders only when the page asks for it (`minTouchTargets`, /new).
  // Appending a class keeps every other class byte-identical — /edit's markup
  // is untouched, which is the T2 pin.
  const touch = (classes: string): string => (minTouchTargets ? `${classes} min-h-11` : classes)

  // V9 ticket 01 extracted these blocks as plain values, not components: the
  // /edit render must stay byte-identical to V8 ticket 05's markup, and a
  // fragment renders exactly the nodes the inline JSX did (no wrapper element,
  // no extra DOM). V9 ticket 03 keeps that discipline and adds the blocks the
  // summary layout reorders.
  const titleBlock = (
    <PlaydateTitleField
      value={values.title}
      error={errors.title}
      onChange={(value) => onFieldChange('title', value)}
      minTouchTargets={minTouchTargets}
    />
  )

  // The place LABEL + input, byte-identical to the V8 ticket 05 markup when the
  // Browse affordance is absent (which is every /edit render, and also a /new
  // whose directory failed to load): the label element is the field's whole
  // wrapper, with no extra row div and no extra classes.
  const placeLabel = (
    <label
      className={
        'flex flex-col gap-1 text-sm' +
        // Only inside the browse row does the label need to shrink instead of
        // taking the whole width (flex-1) — a min-w-0 so a long place name
        // cannot push the button off a 375px screen.
        (onBrowsePlaces !== undefined ? ' min-w-0 flex-1' : '')
      }
    >
      {/* V9 ticket 01: /new asks "Where? — pick a place" because the field
          used to read as plain text and nobody discovered the autocomplete.
          /edit keeps the plain "Place" it has always had. */}
      <span className="text-slate-700">{locationFirst ? PLACE_PICKER_LABEL : 'Place'}</span>
      <input
        className={touch(
          'w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ' +
            (errors.place ? 'border-red-400' : 'border-slate-300'),
        )}
        value={values.place}
        onChange={(e) => onFieldChange('place', e.target.value)}
        placeholder="e.g. Green Lake playground, near the boathouse"
        autoComplete="off"
      />
    </label>
  )

  const placeBlock = (
    <>
      {onBrowsePlaces !== undefined ? (
        <div className="flex items-end gap-2">
          {placeLabel}
          {/* V9 ticket 01: the visible BROWSE PLACES affordance. It sits beside
              the field (never as an overlay) and opens the same inline list the
              typing path uses, in browse mode — the directory A→Z.
              `aria-expanded` so the control's state is not colour-only. */}
          <button
            type="button"
            data-testid="browse-places"
            aria-expanded={browsePlacesOpen}
            onClick={onBrowsePlaces}
            className="min-h-11 shrink-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-indigo-700 transition-colors"
          >
            {BROWSE_PLACES_LABEL}
          </button>
        </div>
      ) : (
        placeLabel
      )}
      {errors.place ? <p className="text-sm text-red-600">{errors.place}</p> : null}
      {/* V9 ticket 01: the one-line instruction the old field never gave —
          only on /new (the picker's page). */}
      {locationFirst && onPickPlace !== undefined ? (
        <p className="text-xs text-slate-500">
          Start typing to find one, tap {BROWSE_PLACES_LABEL} to see them all, or type @ — picking
          one fills the address for you.
        </p>
      ) : null}

      {/* V8 ticket 07: the place AUTOCOMPLETE over the seeded directory, in
          the form's flow (see the prop docs). "Somewhere else" is ALWAYS the
          last row — the directory must never be a wall: a parent meeting at a
          friend's building or a place we do not know keeps free text, and the
          post simply carries no place_id. A failed places load passes an empty
          list and the caller keeps this closed, so /new works with no
          directory at all (the pre-0029-apply state). */}
      {placeSuggestionsOpen && onPickPlace !== undefined && onSomewhereElse !== undefined ? (
        <div
          data-testid="place-suggestions"
          className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
        >
          {(placeSuggestions ?? []).map((place) => (
            <button
              key={place.id}
              type="button"
              onClick={() => onPickPlace(place)}
              className="flex min-h-11 flex-col items-start gap-0.5 border-b border-slate-100 px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50"
            >
              <span className="font-medium text-slate-900">{place.name}</span>
              <span className="text-xs text-slate-500">
                {place.address} · {placeKindLabel(place.kind)} · {placeIndoorLabel(place)}
              </span>
            </button>
          ))}
          <button
            type="button"
            data-testid="place-somewhere-else"
            onClick={onSomewhereElse}
            className="flex min-h-11 flex-col items-start gap-0.5 px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50"
          >
            <span className="font-medium text-slate-900">{SOMEWHERE_ELSE_LABEL}</span>
            <span className="text-xs text-slate-500">
              Keep what you typed — it does not have to be in the list.
            </span>
          </button>
        </div>
      ) : null}
    </>
  )

  // V8 ticket 01: the remembered places this parent posted to last —
  // one tap fills place + address + neighborhood. Hidden entirely
  // when there are none (a first-timer sees no empty chip row), and
  // never rendered on the edit form (which passes no chips).
  const recentChipsBlock =
    chips.length > 0 && onApplyRecentPlace !== undefined ? (
      <div className="flex flex-col gap-1">
        <span className="text-xs text-slate-500">Recent places</span>
        <div className="flex flex-wrap gap-2">
          {chips.map((recent) => (
            <button
              key={recent.place}
              type="button"
              onClick={() => onApplyRecentPlace(recent)}
              className={touch(
                'rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors',
              )}
            >
              {recent.place}
            </button>
          ))}
        </div>
      </div>
    ) : null

  // -------------------------------------------------------------------------
  // V9 ticket 03: the fields, as named blocks, so the three layouts below can
  // compose them without a second copy of any markup. /edit's render order and
  // markup are unchanged (the same nodes, in the same order); /new's summary
  // layout keeps the three DECISIONS visible and puts the rest in the one
  // disclosure.

  /* V3 slice 5 (ticket 08): the optional address (≤120, trim only) — under
     place. When present, the detail page's place line becomes a tappable Google
     Maps link (host + signed-out public views). V9 ticket 01: with a place
     picked it is no longer an optional extra but the NORMAL case — the pick
     fills it — so /new drops the "(optional)" marker and says where it came
     from. The Maps link itself is unchanged (V3 ticket 08's seam, untouched).
     V9 ticket 03: on /new this is the MANUAL entry — the normal path fills it
     from the picked place — so it lives behind More options. */
  const addressBlock = (
    <>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-700">
          {locationFirst ? (
            'Address'
          ) : (
            <>
              Address <span className="text-slate-500">(optional)</span>
            </>
          )}
        </span>
        <input
          className={touch(
            'w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ' +
              (addressError !== null ? 'border-red-400' : 'border-slate-300'),
          )}
          value={address}
          onChange={(e) => onAddressChange(e.target.value)}
          placeholder="e.g. 7200 4th Ave NE, near the boathouse"
          autoComplete="off"
        />
      </label>
      {addressError !== null ? <p className="text-sm text-red-600">{addressError}</p> : null}
      {locationFirst ? (
        <p className="-mt-3 text-xs text-slate-500">
          Comes with the place you pick — type one instead if it is not quite right.
        </p>
      ) : null}
    </>
  )

  /* V9 ticket 01: the neighbourhood SELECT is /edit's alone now. It is gated
     (default: shown) rather than deleted, so the edit form keeps rendering —
     and writing — the neighbourhood a post already has. (On /new the prop is
     false, so this block is null and never reaches the disclosure.) */
  const neighborhoodBlock = showNeighborhood ? (
    <>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-700">Neighborhood</span>
        <select
          className={
            'w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ' +
            (errors.neighborhoodId ? 'border-red-400' : 'border-slate-300')
          }
          value={values.neighborhoodId}
          onChange={(e) => onFieldChange('neighborhoodId', e.target.value)}
          disabled={neighborhoods === null}
        >
          <option value="">Pick a neighborhood…</option>
          {(neighborhoods ?? []).map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
      </label>
      {errors.neighborhoodId ? (
        <p className="text-sm text-red-600">{errors.neighborhoodId}</p>
      ) : null}
    </>
  ) : null

  /* The start: a date picker + the 30-minute stepper (V2 slice 1 — the time is
     stepped, never typed). V9 ticket 03: on /new the form opens on today and the
     next slot, so this is the ADJUSTMENT, not the answer — it lives behind More
     options, and the summary reads the day and the window back as text. */
  const startBlock = (
    <div className="flex flex-col gap-1 text-sm">
      <span className="text-slate-700">Start</span>
      <input
        type="date"
        className={touch(
          'w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ' +
            (errors.startDate ? 'border-red-400' : 'border-slate-300'),
        )}
        value={values.startDate}
        onChange={(e) => onFieldChange('startDate', e.target.value)}
      />
      {errors.startDate ? <p className="text-sm text-red-600">{errors.startDate}</p> : null}
      <TimeStepper
        minutes={values.startMinutes}
        onStep={(delta) =>
          onFieldChange('startMinutes', stepTimeMinutes(values.startMinutes, delta))
        }
      />
      {errors.startMinutes ? (
        <p className="text-sm text-red-600">{errors.startMinutes}</p>
      ) : null}
    </div>
  )

  /* V9 ticket 03 (T5): the duration chips stay VISIBLE — the duration is one of
     the three decisions, it is required, and its "Ends …" read-back is the
     line the specs and the parent both read. Only the date/stepper move. */
  const durationBlock = (
    <div className="flex flex-col gap-1 text-sm">
      <span className="text-slate-700">How long</span>
      <div className="flex flex-wrap gap-2">
        {PLAYDATE_DURATIONS_MINUTES.map((minutes) => {
          const selected = values.durationMinutes === minutes
          return (
            <button
              key={minutes}
              type="button"
              aria-pressed={selected}
              onClick={() => onFieldChange('durationMinutes', minutes)}
              className={touch(
                'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ' +
                  (selected
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-slate-300 bg-white text-slate-700'),
              )}
            >
              {durationLabel(minutes)}
            </button>
          )
        })}
      </div>
      {errors.durationMinutes ? (
        <p className="text-sm text-red-600">{errors.durationMinutes}</p>
      ) : null}
      {values.durationMinutes > 0 ? (
        <p className="text-sm text-slate-600">
          Ends {formatTimeLabel(endTotal)}
          {endTotal >= DAY_MINUTES ? ' (next day)' : ''}
        </p>
      ) : null}
    </div>
  )

  /* V3 slice 6 (ticket 09): the "Best for ages" section is REPLACED by the
     "Kids you're bringing" picker — a multi-select of the host's own kids
     (chips: name + age, 0011 kids table; the 375px layout wraps the chips like
     the duration chips). The selection lands in playdate_kids on submit
     (replace-on-duplicate) and shows on the detail page as the "Kids coming"
     line. No kids yet → the designed empty state + the /profile link (the kids
     are edited on the profile, V2 ticket 02). V9 ticket 03: a nice-to-have, not
     a gate — behind More options on /new. */
  const kidsBlock = (
    <div className="flex flex-col gap-1 text-sm">
      <span className="text-slate-700">
        Kids you're bringing <span className="text-slate-500">(optional)</span>
      </span>
      {kids === null ? (
        <p className="text-sm text-slate-500">Loading your kids…</p>
      ) : kids.length === 0 ? (
        <p className="text-sm text-slate-600">
          Add your kids on your profile, then pick the ones coming along.{' '}
          <Link to="/profile" className="text-indigo-600">
            Add kids
          </Link>
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {kids.map((kid) => {
            const selected = selectedKidIds.includes(kid.id)
            return (
              <button
                key={kid.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onToggleKid(kid.id)}
                className={touch(
                  'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ' +
                    (selected
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-slate-300 bg-white text-slate-700'),
                )}
              >
                {/* V9 ticket 05: a kid's first name is optional, so a nameless
                    kid's chip reads "Age 6" rather than " · 6" (feed.kidLabel
                    — the one seam every kid label goes through). A NAMED kid's
                    chip is byte-identical to the V3 line the specs click by
                    accessible name: "Bernie · 6". */}
                {kidLabel(kid.first_name, kid.age)}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )

  const detailsBlock = (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-slate-700">
        Details <span className="text-slate-500">(optional)</span>
      </span>
      <textarea
        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        rows={3}
        value={values.details}
        onChange={(e) => onFieldChange('details', e.target.value)}
        placeholder="Anything parents should know — what to bring, parking, weather plan…"
      />
    </label>
  )

  // V9 ticket 03: the /new-only SUMMARY — the read-back, one line each, with
  // the title under it. It is rendered INSIDE the form (the title is a form
  // field) and it is the form's FIRST block, so the page opens on the read-back.
  //
  // Review cycle 1, F2: the summary's lines are <p> and the title renders as a
  // READ-BACK BUTTON until it is tapped, so the form's first input — and its
  // first tab stop — is still the PLACE PICKER (V9 ticket 01's AC), while the
  // title stays editable in place on the summary (V9 ticket 03's AC).
  const summaryBlock =
    summaryLines === undefined ? null : (
      <div
        data-testid="post-summary"
        className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-slate-50 p-3"
      >
        {summaryLines.map((line, index) => (
          <p
            key={index}
            data-testid="post-summary-line"
            className="text-sm font-medium text-slate-700"
          >
            {line}
          </p>
        ))}
        <div className="mt-1 flex flex-col gap-1">
          {titleEditing ? (
            titleBlock
          ) : (
            <>
              <button
                type="button"
                data-testid={TITLE_LINE_TESTID}
                onClick={onEditTitle}
                className={touch(
                  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-left text-sm font-medium text-slate-900 transition-colors',
                )}
              >
                {values.title}
              </button>
              <p className="text-xs text-slate-500">{TITLE_LINE_HINT}</p>
            </>
          )}
        </div>
      </div>
    )

  // V9 ticket 03: the ONE disclosure. It is a plain button (not <details>) so
  // its state is `aria-expanded`, its contents UNMOUNT when it closes (a field
  // behind a collapsed box is not in the form's flow at all), and the PAGE can
  // open it — a failed submit on the start date must not leave its error inside
  // something the parent collapsed.
  const moreOptionsBlock =
    summaryLines === undefined ? null : (
      <>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            data-testid="more-options"
            aria-expanded={moreOptionsOpen}
            /* Review cycle 1, F7: only while the body EXISTS. A collapsed
               disclosure unmounts it, and an aria-controls pointing at an id
               that is not in the document is a broken relationship, not a
               helpful hint. */
            aria-controls={moreOptionsOpen ? 'more-options-body' : undefined}
            onClick={onToggleMoreOptions}
            className={touch(
              'w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-left text-sm font-medium text-slate-700 transition-colors',
            )}
          >
            {MORE_OPTIONS_LABEL}
          </button>
          <p className="text-xs text-slate-500">{MORE_OPTIONS_HINT}</p>
        </div>
        {moreOptionsOpen ? (
          <div
            id="more-options-body"
            data-testid="more-options-body"
            className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3"
          >
            {addressBlock}
            {neighborhoodBlock}
            {startBlock}
            {repeatSlot}
            {kidsBlock}
            {/* V9 ticket 05: the "Ages (optional)" chips, right under the kids
                picker — the derived range and the stated one are the same fact
                (what age crowd this is), so they read as one pair. /edit passes
                nothing here (the ticket scopes the chips to /new). */}
            {agesSlot}
            {detailsBlock}
          </div>
        ) : null}
      </>
    )

  return (
    <form
      className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      onSubmit={onSubmit}
      noValidate
    >
      {/* V9 ticket 03: /new opens on the SUMMARY — the day, the window and the
          place read back as text, with the editable title line under it — then
          the three decisions (place, how long, Post), then everything else
          behind the one disclosure. V9 ticket 01's order is kept inside that:
          WHERE first, the chips that fill it under it, the quick-fill preset
          (a time shortcut, not a location) after them.
          /edit passes no summaryLines, so it renders the V8 ticket 05 markup
          with no summary and no disclosure. */}
      {summaryLines !== undefined ? (
        <>
          {summaryBlock}
          {placeBlock}
          {recentChipsBlock}
          {preset}
          {durationBlock}
          {moreOptionsBlock}
        </>
      ) : locationFirst ? (
        <>
          {placeBlock}
          {recentChipsBlock}
          {preset}
          {titleBlock}
          {addressBlock}
          {neighborhoodBlock}
          {startBlock}
          {durationBlock}
          {repeatSlot}
          {kidsBlock}
          {detailsBlock}
        </>
      ) : (
        <>
          {preset}
          {titleBlock}
          {placeBlock}
          {recentChipsBlock}
          {addressBlock}
          {neighborhoodBlock}
          {startBlock}
          {durationBlock}
          {repeatSlot}
          {kidsBlock}
          {detailsBlock}
        </>
      )}

      <div className="flex flex-col gap-2">
        <button
          type="submit"
          disabled={submitBusy || submitDisabled}
          className={touch(
            'rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50',
          )}
        >
          {submitBusy ? submittingLabel : submitLabel}
        </button>
        {/* V8 ticket 06: a stable handle for the submit's error line — the
            weekly-series e2e reads it to report the documented pre-0028-apply
            failure (PGRST205 on the missing table) instead of racing the
            error text. */}
        {submitError ? (
          <p data-testid="submit-error" className="text-sm text-red-600">
            {submitError}
          </p>
        ) : null}
      </div>
    </form>
  )
}

/**
 * The "Ages (optional)" chip row (V9 ticket 05).
 *
 * WHY IT EXISTS: the derived range (the ages of the kids the host is bringing)
 * answers only for a host who has kids and picks them. A host with no kids
 * listed — or one who does not want their kids on the post at all — could not
 * say what age crowd this is for, which is the single question another parent
 * asks first ("if it's toddlers you're going to bring your kid to a toddler
 * thing"). These chips are that answer, and they WIN over the derived range
 * when both exist (feed.playdateAgeRangeLine owns the precedence).
 *
 * WHERE IT RENDERS: inside the ONE "More options" disclosure on /new
 * (V9 ticket 03), not among the three decisions — it is optional, and the
 * three answers the parent must give stay visible. `/edit` does not render it
 * at all (the page passes no `agesSlot`), exactly like "Repeat weekly": the
 * ticket scopes the chips to /new, and an edit that does not touch the columns
 * leaves them standing.
 *
 * DESELECT: tapping the pressed chip again clears the answer (aria-pressed
 * false, both columns back to "nothing stated" on the next create). A chip the
 * parent cannot take back would be a trap.
 */
export function AgeRangeChips({
  selected,
  onSelect,
  minTouchTargets = false,
}: {
  /** The pressed range, or null ("nothing stated"). */
  selected: AgeBounds | null
  onSelect: (range: AgeBounds | null) => void
  minTouchTargets?: boolean
}) {
  return (
    <div className="flex flex-col gap-1 text-sm" data-testid="ages-chips">
      <span className="text-slate-700">
        Ages <span className="text-slate-500">(optional)</span>
      </span>
      <div className="flex flex-wrap gap-2">
        {AGE_RANGE_CHIPS.map((chip) => {
          const pressed = selected !== null && selected.min === chip.min && selected.max === chip.max
          return (
            <button
              key={chip.label}
              type="button"
              aria-pressed={pressed}
              onClick={() => onSelect(pressed ? null : { min: chip.min, max: chip.max })}
              className={
                'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ' +
                (minTouchTargets ? 'min-h-11 ' : '') +
                (pressed
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-slate-300 bg-white text-slate-700')
              }
            >
              {chip.label}
            </button>
          )
        })}
      </div>
      <span className="text-xs text-slate-500">
        What ages this drop-in is for. Skip it and your kids’ ages fill it in.
      </span>
    </div>
  )
}

/**
 * The ONE title field (V9 ticket 03).
 *
 * Extracted from the inline `titleBlock` so the /new summary's title (the
 * editable line inside the summary, once it is tapped) and /edit's Title field
 * are the SAME implementation — the V8 ticket 05 rule that there is exactly one
 * implementation of every field, chip and error. On /new the line the parent
 * edits IS this input, seeded by postSummary.generatedTitle from the place they
 * picked; on /edit it is the prefilled Title field, always visible, unchanged.
 *
 * The markup is V8 ticket 05's, node for node: the same <label>, the same live
 * `n/80` counter, the same placeholder (the specs fill by it) and the same red
 * error line. The ONE addition is `minTouchTargets`, which /new passes and
 * /edit does not — so /edit's rendered markup stays byte-identical.
 */
export function PlaydateTitleField({
  value,
  error,
  onChange,
  minTouchTargets = false,
}: {
  value: string
  /** The validator's message for this field, when it has one. */
  error?: string
  onChange: (value: string) => void
  /** V9 ticket 03: /new grows the input to the 44px phone tap-target floor. */
  minTouchTargets?: boolean
}) {
  const titleLength = value.length
  return (
    <>
      <label className="flex flex-col gap-1 text-sm">
        <span className="flex items-center justify-between text-slate-700">
          Title
          <span
            className={
              'text-xs ' + (titleLength > TITLE_MAX_LENGTH ? 'text-red-600' : 'text-slate-500')
            }
          >
            {titleLength}/{TITLE_MAX_LENGTH}
          </span>
        </span>
        <input
          className={
            'w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ' +
            (error ? 'border-red-400' : 'border-slate-300') +
            (minTouchTargets ? ' min-h-11' : '')
          }
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. Playground time at Green Lake"
          autoComplete="off"
        />
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </>
  )
}

/**
 * The 30-minute start-time stepper (V2 slice 1): the time is shown, never
 * typed — each press steps 30 minutes, wrapping at midnight.
 */
function TimeStepper({
  minutes,
  onStep,
}: {
  minutes: number
  onStep: (deltaMinutes: number) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-300 px-1 py-0.5">
      <button
        type="button"
        aria-label="Earlier start time"
        onClick={() => onStep(-TIME_STEP_MINUTES)}
        className="h-11 w-11 rounded-md text-lg text-slate-600 transition-colors hover:bg-slate-100"
      >
        −
      </button>
      <span className="text-sm font-medium tabular-nums text-slate-900" data-testid="start-time-label">
        {formatTimeLabel(minutes)}
      </span>
      <button
        type="button"
        aria-label="Later start time"
        onClick={() => onStep(TIME_STEP_MINUTES)}
        className="h-11 w-11 rounded-md text-lg text-slate-600 transition-colors hover:bg-slate-100"
      >
        +
      </button>
    </div>
  )
}

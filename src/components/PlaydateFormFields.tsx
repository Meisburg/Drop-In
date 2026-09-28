import type { FormEvent, ReactNode } from 'react'
import { Link } from 'react-router'
import {
  durationLabel,
  formatTimeLabel,
  kidLabel,
  PLAYDATE_DURATIONS_MINUTES,
  stepTimeMinutes,
  TIME_STEP_MINUTES,
  TITLE_MAX_LENGTH,
} from '../lib/feed'
import type { PlaydateFormErrors, PlaydateFormValues } from '../lib/feed'
import {
  BROWSE_PLACES_LABEL,
  PLACE_PICKER_LABEL,
  placeIndoorLabel,
  placeKindLabel,
  SOMEWHERE_ELSE_LABEL,
} from '../lib/places'
import type { Kid, Neighborhood, Place } from '../lib/types'
import { errorId, fieldA11y } from '../lib/a11y'

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
 * affordance for writing a NEW plan, passed in as `preset`), and the
 * duplicate banner. The edit page passes neither, so a form that is fixing
 * existing values gets no new-plan shortcuts — and no dead controls.
 * V13 ticket 02 removed the /new "Recent places" chips and the "More options"
 * disclosure; everything they held now sits in the visible flow.
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
 * title line, all visible) and a VISIBLE tail block (V13 t02: disclosure gone) holding the rest
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
  /**
   * V13 ticket 02: the /new-only interactive MAP picker — a Leaflet canvas of
   * the directory's places (DB coordinates only, never browser geolocation),
   * rendered under the place field and its suggestion list. Tapping a marker
   * pre-fills the place field through the SAME pick path as the list rows
   * (`onPickPlace`), so one seam owns what a pick writes. The page passes the
   * whole canvas (a stateless slot, like `preset`) — this component owns no
   * state and /edit passes nothing, so no map appears there.
   */
  mapSlot?: ReactNode
  /**
   * /new only: the quick-start row ("Now", "In an hour", "Tomorrow 10am",
   * "Sat 10am") — a stateless slot like `preset`, rendered under the "When"
   * label and above the date/start steppers it fills. The PAGE owns both the
   * preset values (lib/feed `timePresets`) and the write; /edit passes nothing,
   * so no shortcut appears there.
   */
  timePresetsSlot?: ReactNode
  /**
   * V27 slice 2: the /new-only VIBE CHIPS — a stateless slot like `preset` and
   * `timePresetsSlot`, rendered inside the Details block between its label and
   * its textarea. The PAGE owns the chip list (`lib/vibeChips`) and the write
   * (`applyVibeChip`); this component owns no state. `/edit` passes nothing, so
   * its Details block renders exactly the markup it always has — no chips.
   */
  detailsChipsSlot?: ReactNode
  /** /new only: the quick-fill preset card, rendered inside the form first. */
  preset?: ReactNode
  /**
   * V10 ticket 02: the /new-only SURFACED kids section, rendered ABOVE the
   * visible kids section. The PAGE passes it only when the parent HAS
   * kids (the loaded list is non-empty) — a no-kids parent (or a still-loading
   * list) keeps today's exact form with the picker inside the disclosure. A
   * slot, not props, for the exact reason `preset` is one: this component
   * owns no state, and /edit passes nothing, so no dead control appears there.
   */
  kidsSectionSlot?: ReactNode
  /**
   * V27 slice 1: the form's DOM `id`. Defaults to `'playdate-form'` — the id
   * this form has always been addressable by through its `data-testid`, now
   * made explicit. `/edit` passes nothing, so it keeps the default and its
   * markup. `/new` passes `'new-playdate-form'` so its sticky bar (which sits
   * OUTSIDE this form, above the bottom nav) can submit it through the HTML
   * `form` attribute.
   */
  formId?: string
  /**
   * V27 slice 1: render the in-form submit button at all? Default FALSE —
   * `/edit` renders exactly the submit it always has. `/new` sets this true so
   * the sticky bar's button is the ONE control named "Post drop-in" on that
   * page (a second would be a strict-mode violation for every posting spec).
   * The `submitError` paragraph below is rendered either way, so a failed
   * create still surfaces where it always did.
   */
  hideSubmit?: boolean
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
  minTouchTargets = false,
  kids,
  selectedKidIds,
  onToggleKid,
  placeSuggestionsOpen = false,
  placeSuggestions,
  onPickPlace,
  onSomewhereElse,
  mapSlot,
  timePresetsSlot,
  detailsChipsSlot,
  preset,
  kidsSectionSlot,
  formId = 'playdate-form',
  hideSubmit = false,
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
          'w-full rounded-xl border px-3 py-2.5 text-base outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200 ' +
            (errors.place ? 'border-red-400' : 'border-slate-300'),
        )}
        value={values.place}
        onChange={(e) => onFieldChange('place', e.target.value)}
        placeholder="e.g. Green Lake playground, near the boathouse"
        autoComplete="off"
        {...fieldA11y('place', errors.place ?? null)}
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
            className="min-h-11 shrink-0 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base font-medium text-indigo-700 transition-colors motion-reduce:transition-none "
          >
            {BROWSE_PLACES_LABEL}
          </button>
        </div>
      ) : (
        placeLabel
      )}
      {errors.place ? <p role="alert" id={errorId('place')} className="text-sm text-red-600">{errors.place}</p> : null}
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
              className="flex min-h-11 flex-col items-start gap-0.5 border-b border-slate-100 px-3 py-2.5 text-left text-base transition-colors motion-reduce:transition-none hover:bg-slate-50"
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
            className="flex min-h-11 flex-col items-start gap-0.5 px-3 py-2.5 text-left text-base transition-colors motion-reduce:transition-none hover:bg-slate-50"
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
     from the picked place.
     V15 fix (founder feedback): on /new it now renders DIRECTLY under the
     place field (inside placeBlock's section), because it is the same answer
     as the place — the pick fills it — and it must read as one question. */
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
            'w-full rounded-xl border px-3 py-2.5 text-base outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200 ' +
              (addressError !== null ? 'border-red-400' : 'border-slate-300'),
          )}
          value={address}
          onChange={(e) => onAddressChange(e.target.value)}
          placeholder="e.g. 7200 4th Ave NE, near the boathouse"
          autoComplete="off"
          {...fieldA11y('address', addressError)}
        />
      </label>
      {addressError !== null ? <p role="alert" id={errorId('address')} className="text-sm text-red-600">{addressError}</p> : null}
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
            'w-full rounded-xl border bg-white px-3 py-2.5 text-base outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200 ' +
            (errors.neighborhoodId ? 'border-red-400' : 'border-slate-300')
          }
          value={values.neighborhoodId}
          onChange={(e) => onFieldChange('neighborhoodId', e.target.value)}
          disabled={neighborhoods === null}
          {...fieldA11y('neighborhood', errors.neighborhoodId ?? null)}
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
        <p role="alert" id={errorId('neighborhood')} className="text-sm text-red-600">{errors.neighborhoodId}</p>
      ) : null}
    </>
  ) : null

  /* The start: a date picker + the 30-minute stepper (V2 slice 1 — the time is
     stepped, never typed). V9 ticket 03: on /new the form opens on today and the
     next slot, so this is the ADJUSTMENT, not the answer. V11 ticket 05: on /new
     it surfaces in the visible "When" section (whenBlock) instead of behind More
     options — the summary still reads the day and the window back as text.
     Branches 2/3 (the location-first page and /edit) keep startBlock in the flow
     as-is, so /edit stays byte-identical. */
  const startBlock = (
    <div className="flex flex-col gap-1 text-sm">
      <span className="text-slate-700">Start</span>
      <input
        type="date"
        className={touch(
          'w-full rounded-xl border px-3 py-2.5 text-base outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200 ' +
            (errors.startDate ? 'border-red-400' : 'border-slate-300'),
        )}
        value={values.startDate}
        onChange={(e) => onFieldChange('startDate', e.target.value)}
        {...fieldA11y('start-date', errors.startDate ?? null)}
      />
      {errors.startDate ? <p role="alert" id={errorId('start-date')} className="text-sm text-red-600">{errors.startDate}</p> : null}
      <TimeStepper
        minutes={values.startMinutes}
        onStep={(delta) =>
          onFieldChange('startMinutes', stepTimeMinutes(values.startMinutes, delta))
        }
      />
      {errors.startMinutes ? (
        <p role="alert" id={errorId('start-time')} className="text-sm text-red-600">{errors.startMinutes}</p>
      ) : null}
    </div>
  )

  /* V11 ticket 05: the visible "When" section — the place block's section-label
     style (the ticket pins `text-sm font-semibold text-slate-700`) with startBlock
     under it. Rendered by /new (branch 1) only, in the visible flow; branches 2/3
     keep startBlock in the flow directly, so /edit stays byte-identical. */
  const whenBlock = (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-slate-700">When</span>
      {/* /new's quick-start row (a stateless slot the page owns); branches 2/3
          pass nothing, so /edit keeps its exact markup. */}
      {timePresetsSlot}
      {startBlock}
    </div>
  )

  /* V12 t02: the chip row is its own const. The /new fast path (branch 1) no
     longer renders it in the visible flow — the duration is picked FOR the
     parent (durationValueLine reads it back) and the override chips live at
     the top of the visible tail block; branches 2/3 (the location-first page and /edit)
     keep it in the flow via durationBlock. Tapping any chip writes
     `durationMinutes` (the page records the override and stops re-deriving on
     later start changes). */
  const durationChipsRow = (
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
              'inline-flex min-h-11 items-center rounded-full border px-3 text-base font-medium transition-colors motion-reduce:transition-none ' +
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
  )

  /* V9 ticket 03 (T5): the duration chips stay VISIBLE — the duration is one of
     the three decisions, it is required, and its "Ends …" read-back is the
     line the specs and the parent both read. Only the date/stepper move.
     V12 t02: this is now the BRANCH 2/3 shape (the location-first page and
     /edit); /new renders durationValueLine in the visible flow instead, and
     the override chips in the visible tail block are this same row. */
  const durationBlock = (
    <div className="flex flex-col gap-1 text-sm">
      <span className="text-slate-700">How long</span>
      {durationChipsRow}
      {errors.durationMinutes ? (
        <p role="alert" id={errorId('duration')} className="text-sm text-red-600">{errors.durationMinutes}</p>
      ) : null}
      {values.durationMinutes > 0 ? (
        <p className="text-sm text-slate-600">
          Ends {formatTimeLabel(endTotal)}
          {endTotal >= DAY_MINUTES ? ' (next day)' : ''}
        </p>
      ) : null}
    </div>
  )

  /* V13 ticket 03 (A16/A17): the /new (branch 1) END TIME — a second stepper
     (the same TimeStepper shape as the start, labeled "End" with testid
     `end-time-label`). Stepping it writes `durationMinutes = end − start`
     (wrapping past midnight is allowed, matching the existing `(next day)`
     handling). The "How long" label and the duration-chips row are GONE from
     the /new flow (AC1: no "how long" control, no "Ends …" line on /new);
     branches 2/3 keep durationBlock byte-identical so /edit is untouched. */
  const endBlock = (
    <div className="flex flex-col gap-1 text-sm">
      <span className="text-slate-700">End</span>
      <TimeStepper
        minutes={endTotal}
        onStep={(delta) => {
          const newEnd = stepTimeMinutes(endTotal, delta)
          // duration = end − start (wrap past midnight allowed: if the end
          // wraps below the start, the window crosses midnight and the
          // duration is the difference modulo the day).
          const duration = ((newEnd - values.startMinutes) % DAY_MINUTES + DAY_MINUTES) % DAY_MINUTES
          onFieldChange('durationMinutes', duration)
        }}
        label="end"
        testId="end-time-label"
      />
      {errors.durationMinutes ? (
        <p role="alert" id={errorId('duration')} className="text-sm text-red-600">{errors.durationMinutes}</p>
      ) : null}
    </div>
  )

  /* V13 ticket 03: the /new (branch 1) DURATION read-back is REPLACED by the
     end stepper above. The old `durationValueLine` ("How long / 1h · Ends …")
     is gone from the /new flow (AC1: no "Ends …" line on /new). Branches 2/3
     still use durationBlock (byte-identical to before this ticket). */

  /* V3 slice 6 (ticket 09): the "Best for ages" section is REPLACED by the
     "Kids you're bringing" picker — a multi-select of the host's own kids
     (chips: name + age, 0011 kids table; the 375px layout wraps the chips like
     the duration chips). The selection lands in playdate_kids on submit
     (replace-on-duplicate) and shows on the detail page as the "Kids coming"
line. No kids yet → the designed empty state + the /settings link (the
      kids are edited on the settings page, V11 ticket 06 — V2 ticket 02 put the
      editor on /profile; the V11 reorg moved it). V9 ticket 03: a nice-to-have, not
     a gate — in the visible tail block on /new.
     V10 ticket 02: WHEN THE PARENT HAS KIDS, /new SURFACES this block ABOVE
     the disclosure (kidsSectionSlot — the page's own section, passed in) and
     the disclosure holds the rest. The picker itself is byte-identical: the
     section wrapper differs only in the heading's context (see the slot), so
     the kids-v3 specs' accessible names ("Bernie · 6") keep landing. */
  const kidsBlock = (
    <div className="flex flex-col gap-1 text-sm">
      <span className="text-slate-700">
        Kids you're bringing <span className="text-slate-500">(optional)</span>
      </span>
      {kids === null ? (
        <p className="text-sm text-slate-500">Loading your kids…</p>
      ) : kids.length === 0 ? (
        <p className="text-sm text-slate-600">
          Add your kids in your settings, then pick the ones coming along.{' '}
          <Link to="/settings" className="text-indigo-600">
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
                  'inline-flex min-h-11 items-center rounded-full border px-3 text-base font-medium transition-colors motion-reduce:transition-none ' +
                    (selected
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-slate-300 bg-white text-slate-700'),
                )}
              >
                {/* V15 T05 (A13): a kid's first name is optional, so a nameless
                    kid's chip reads "Age 6" rather than just "6". A NAMED kid's
                    chip now includes the "Age" prefix: "Bernie · Age 6"
                    (feed.kidLabel — the one seam every kid label goes through). */}
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
      {/* V27 slice 2: the one-tap starters, right under the label and above the
          box they fill. A slot the PAGE passes (/new builds it from
          `lib/vibeChips`); `/edit` passes nothing, so no chips appear there. */}
      {detailsChipsSlot}
      <textarea
        className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200"
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
                  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-left text-base font-medium text-slate-900 transition-colors motion-reduce:transition-none ',
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

  // V13 ticket 02: the "More options" disclosure is GONE — everything it held
  // now has a visible home in the branch-1 flow (the ticket's AC: address
  // details moved out of More options, repeat + ages relocated, no disclosure).
  // V15 fix: the address moved UP to sit directly under the place field (see
  // the branch-1 render below), so this tail is repeat/details only.
  // V16 t03 item 1: the ages chip row is gone too, so `detailsBlock` is the
  // whole tail now. Only branch 1 renders this block (branches 2/3 keep their
  // own order), so no extra gating is needed.
  const moreTailBlock =
    summaryLines === undefined ? null : <>{detailsBlock}</>

  return (
    <form
      id={formId}
      className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      data-testid="playdate-form"
      onSubmit={onSubmit}
      noValidate
    >
      {/* V9 ticket 03: /new opens on the SUMMARY — the day, the window and the
          place read back as text, with the editable title line under it — then
          the three decisions (place, the picked time, Post — V12 t02: the
          duration is picked FOR the parent, read back by durationValueLine),
          then everything else behind the one disclosure. V9 ticket 01's order is
          kept inside that: WHERE first, the chips that fill it under it, the
          quick-fill preset (a time shortcut, not a location) after them.
          /edit passes no summaryLines, so it renders the V8 ticket 05 markup
          with no summary and no disclosure. */}
      {summaryLines !== undefined ? (
        <>
          {summaryBlock}
          {placeBlock}
          {/* V15 fix (founder feedback): the address sits DIRECTLY under the
              "Where? — pick a place" field, not down after When. It is the
              same answer as the place — the pick fills it — so the two must
              read as one question. It used to render after When + End, which
              put the auto-filled value far from the field that filled it. */}
          {addressBlock}
          {mapSlot}
          {/* V13 ticket 03: the END stepper replaces the duration read-back —
              three picks (date, start, end), no "how long" control. */}
          {whenBlock}
          {endBlock}
          {/* V13 ticket 02: repeat + ages + details now have visible homes in
              the compact tail before kids (the disclosure is gone). */}
          {moreTailBlock}
          {/* V10 ticket 02: the SURFACED kids section — last, right before Post.
              Only when the page passes it (the parent has kids). A no-kids
              parent (or a still-loading list) keeps the picker in its own
              block below. */}
          {kidsSectionSlot}
          {kidsSectionSlot === undefined ? kidsBlock : null}
        </>
      ) : locationFirst ? (
        <>
          {placeBlock}
          {preset}
          {titleBlock}
          {addressBlock}
          {neighborhoodBlock}
          {startBlock}
          {durationBlock}
          {kidsBlock}
          {detailsBlock}
        </>
      ) : (
        <>
          {preset}
          {titleBlock}
          {placeBlock}
          {addressBlock}
          {neighborhoodBlock}
          {startBlock}
          {durationBlock}
          {kidsBlock}
          {detailsBlock}
        </>
      )}

      <div className="flex flex-col gap-2">
        {hideSubmit ? null : (
          <button
            type="submit"
            disabled={submitBusy || submitDisabled}
            className={touch(
              'rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50',
            )}
            {...fieldA11y('submit', submitError)}
          >
            {submitBusy ? submittingLabel : submitLabel}
          </button>
        )}
        {/* V8 ticket 06: a stable handle for the submit's error line — the
            weekly-series e2e reads it to report the documented pre-0028-apply
            failure (PGRST205 on the missing table) instead of racing the
            error text. */}
        {submitError ? (
          <p role="alert" id={errorId('submit')} data-testid="submit-error" className="text-sm text-red-600">
            {submitError}
          </p>
        ) : null}
      </div>
    </form>
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
            'w-full rounded-xl border px-3 py-2.5 text-base outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200 ' +
            (error ? 'border-red-400' : 'border-slate-300') +
            (minTouchTargets ? ' min-h-11' : '')
          }
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. Playground time at Green Lake"
          autoComplete="off"
          {...fieldA11y('title', error ?? null)}
        />
      </label>
      {error ? <p role="alert" id={errorId('title')} className="text-sm text-red-600">{error}</p> : null}
    </>
  )
}

/**
 * The 30-minute time stepper (V2 slice 1): the time is shown, never
 * typed — each press steps 30 minutes, wrapping at midnight. V13 ticket 03:
 * parameterized with a label + testid so the same component serves both the
 * start and the end steppers (the end's testid is `end-time-label`).
 */
function TimeStepper({
  minutes,
  onStep,
  label = 'start',
  testId = 'start-time-label',
}: {
  minutes: number
  onStep: (deltaMinutes: number) => void
  label?: string
  testId?: string
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-300 px-1 py-0.5">
      <button
        type="button"
        aria-label={`Earlier ${label} time`}
        onClick={() => onStep(-TIME_STEP_MINUTES)}
        className="h-11 w-11 rounded-md text-lg text-slate-600 transition-colors motion-reduce:transition-none hover:bg-slate-100"
      >
        −
      </button>
      <span className="text-sm font-medium tabular-nums text-slate-900" data-testid={testId}>
        {formatTimeLabel(minutes)}
      </span>
      <button
        type="button"
        aria-label={`Later ${label} time`}
        onClick={() => onStep(TIME_STEP_MINUTES)}
        className="h-11 w-11 rounded-md text-lg text-slate-600 transition-colors motion-reduce:transition-none hover:bg-slate-100"
      >
        +
      </button>
    </div>
  )
}

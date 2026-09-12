import type { FormEvent, ReactNode } from 'react'
import { Link } from 'react-router'
import {
  durationLabel,
  formatTimeLabel,
  PLAYDATE_DURATIONS_MINUTES,
  stepTimeMinutes,
  TIME_STEP_MINUTES,
} from '../lib/feed'
import type { PlaydateFormErrors, PlaydateFormValues, RecentPlace } from '../lib/feed'
import type { Kid, Neighborhood } from '../lib/types'

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
 */
export const TITLE_MAX_LENGTH = 80
/** V3 slice 5 (ticket 08): the optional address field's cap (trim only, no DB CHECK). */
export const ADDRESS_MAX_LENGTH = 120
const DAY_MINUTES = 24 * 60

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
  /** null = still loading (the select renders disabled). */
  neighborhoods: Neighborhood[] | null
  /** null = still loading; [] = none yet OR the load failed (same empty state). */
  kids: Kid[] | null
  selectedKidIds: string[]
  onToggleKid: (kidId: string) => void
  /** /new only: the remembered places (no chips row when empty/omitted). */
  recentPlaces?: RecentPlace[]
  /** /new only: one tap fills place + address + neighborhood. */
  onApplyRecentPlace?: (place: RecentPlace) => void
  /** /new only: the quick-fill preset card, rendered inside the form first. */
  preset?: ReactNode
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
  neighborhoods,
  kids,
  selectedKidIds,
  onToggleKid,
  recentPlaces,
  onApplyRecentPlace,
  preset,
  submitLabel,
  submittingLabel,
  submitBusy,
  submitDisabled = false,
  submitError,
  onSubmit,
}: PlaydateFormFieldsProps) {
  const titleLength = values.title.length
  const endTotal = values.startMinutes + values.durationMinutes
  // V3 slice 5 (ticket 08): the address's inline error (≤120 after trim;
  // computed at render, like the title's live counter — no separate
  // error state).
  const addressError =
    address.trim().length > ADDRESS_MAX_LENGTH
      ? `Keep the address to ${ADDRESS_MAX_LENGTH} characters.`
      : null
  const chips = recentPlaces ?? []

  return (
    <form
      className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      onSubmit={onSubmit}
      noValidate
    >
      {preset}

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
            (errors.title ? 'border-red-400' : 'border-slate-300')
          }
          value={values.title}
          onChange={(e) => onFieldChange('title', e.target.value)}
          placeholder="e.g. Playground time at Green Lake"
          autoComplete="off"
        />
      </label>
      {errors.title ? <p className="text-sm text-red-600">{errors.title}</p> : null}

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-700">Place</span>
        <input
          className={
            'w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ' +
            (errors.place ? 'border-red-400' : 'border-slate-300')
          }
          value={values.place}
          onChange={(e) => onFieldChange('place', e.target.value)}
          placeholder="e.g. Green Lake playground, near the boathouse"
          autoComplete="off"
        />
      </label>
      {errors.place ? <p className="text-sm text-red-600">{errors.place}</p> : null}

      {/* V8 ticket 01: the remembered places this parent posted to last —
          one tap fills place + address + neighborhood. Hidden entirely
          when there are none (a first-timer sees no empty chip row), and
          never rendered on the edit form (which passes no chips). */}
      {chips.length > 0 && onApplyRecentPlace !== undefined ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Recent places</span>
          <div className="flex flex-wrap gap-2">
            {chips.map((recent) => (
              <button
                key={recent.place}
                type="button"
                onClick={() => onApplyRecentPlace(recent)}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors"
              >
                {recent.place}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* V3 slice 5 (ticket 08): the optional address (≤120, trim
          only) — under place. When present, the detail page's place
          line becomes a tappable Google Maps link (host + signed-out
          public views). */}
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-700">
          Address <span className="text-slate-500">(optional)</span>
        </span>
        <input
          className={
            'w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ' +
            (addressError !== null ? 'border-red-400' : 'border-slate-300')
          }
          value={address}
          onChange={(e) => onAddressChange(e.target.value)}
          placeholder="e.g. 7200 4th Ave NE, near the boathouse"
          autoComplete="off"
        />
      </label>
      {addressError !== null ? <p className="text-sm text-red-600">{addressError}</p> : null}

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

      <div className="flex flex-col gap-1 text-sm">
        <span className="text-slate-700">Start</span>
        <input
          type="date"
          className={
            'w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ' +
            (errors.startDate ? 'border-red-400' : 'border-slate-300')
          }
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
                className={
                  'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ' +
                  (selected
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-slate-300 bg-white text-slate-700')
                }
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

      {/* V3 slice 6 (ticket 09): the "Best for ages" section is REPLACED by the
    "Kids you're bringing" picker — a multi-select of the host's own kids
    (chips: name + age, 0011 kids table; the 375px layout wraps the chips
    like the duration chips). The selection lands in playdate_kids on
    submit (replace-on-duplicate) and shows on the detail page as the
    "Kids coming" line. No kids yet → the designed empty state + the
    /profile link (the kids are edited on the profile, V2 ticket 02). */}
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
                  className={
                    'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ' +
                    (selected
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-slate-300 bg-white text-slate-700')
                  }
                >
                  {kid.first_name} · {kid.age}
                </button>
              )
            })}
          </div>
        )}
      </div>

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

      <div className="flex flex-col gap-2">
        <button
          type="submit"
          disabled={submitBusy || submitDisabled}
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitBusy ? submittingLabel : submitLabel}
        </button>
        {submitError ? <p className="text-sm text-red-600">{submitError}</p> : null}
      </div>
    </form>
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

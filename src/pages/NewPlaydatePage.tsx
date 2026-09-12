import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useSessionContext } from '../components/SessionProvider'
import {
  createPlaydate,
  listKids,
  listNeighborhoods,
  listRecentOwnPlaces,
  linkKidsToPlaydate,
} from '../lib/db'
import {
  computeEndIso,
  computeStartIso,
  defaultStartDateIso,
  durationLabel,
  formatTimeLabel,
  nextSlotMinutes,
  PLAYDATE_DURATIONS_MINUTES,
  stepTimeMinutes,
  suggestedDurationMinutes,
  TIME_STEP_MINUTES,
  validatePlaydateForm,
} from '../lib/feed'
import type { PlaydateFormErrors, PlaydateFormValues, RecentPlace } from '../lib/feed'
import type { DuplicatePrefill, Kid, Neighborhood } from '../lib/types'

const TITLE_MAX_LENGTH = 80
/** V3 slice 5 (ticket 08): the optional address field's cap (trim only, no DB CHECK). */
const ADDRESS_MAX_LENGTH = 120
const DAY_MINUTES = 24 * 60

/**
 * The /new form's EMPTY base (V8 ticket 01 changed what the form OPENS
 * with, not this): `initialValues` fills the start date and time with today
 * and the next 30-minute slot, so `startDate`/`startMinutes` here are inert
 * placeholders that never render — every path goes through `initialValues`.
 * `durationMinutes: 0` is the real "none picked yet" state (the chips choose
 * a duration; the quick-fill preset can also set it).
 */
const emptyValues: PlaydateFormValues = {
  title: '',
  place: '',
  neighborhoodId: '',
  startDate: '',
  startMinutes: 0,
  durationMinutes: 0,
  ageHint: '',
  details: '',
}

/**
 * The form's MOUNT-ONCE initial values (V8 ticket 01): today's date and the
 * next 30-minute slot, so the spontaneous post ("we're at the park right
 * now") needs no date or time work at all. Computed once from a single
 * mount-time `now` — a per-render recompute would move the fields under the
 * parent's finger.
 *
 * A duplicate prefill still wins on everything it carries (title, place,
 * neighborhood, age hint, details); it deliberately does NOT carry date,
 * time, or duration (pinned in V2: those are always re-entered), so the
 * fresh defaults apply there too.
 */
function initialValues(duplicate: DuplicatePrefill | null, nowIso: string): PlaydateFormValues {
  const defaults: PlaydateFormValues = {
    ...emptyValues,
    startDate: defaultStartDateIso(nowIso),
    startMinutes: nextSlotMinutes(nowIso),
  }
  return duplicate === null ? defaults : { ...defaults, ...duplicate }
}

/**
 * The one title default the /new form applies (V8 ticket 01): a drop-in is
 * titled "Playdate at <place>" only when the parent has not typed a title
 * AND a place is known. Never overwrites typed text, never fires with no
 * place, and the live n/80 counter keeps working because this returns the
 * same value shape the inputs write.
 */
function withDefaultTitle(values: PlaydateFormValues): PlaydateFormValues {
  if (values.title.trim() !== '') return values
  const place = values.place.trim()
  if (place === '') return values
  return { ...values, title: `Playdate at ${place}` }
}

/**
 * /new — post a drop-in (slice 3; time entry reworked in V2 slice 1).
 * Title (≤ 80 chars, live counter), place, neighborhood, and the start:
 * a date picker + a 30-minute-stepper time (no typing) + duration chips
 * (1h / 1.5h / 2h / 3h) — the end time is computed from start + duration,
 * never typed (pinned contract). Optional details.
 *
 * V3 slice 5 (ticket 08): an optional "Address (optional)" field under
 * place (≤120 chars, trim only; an inline error when over). Empty (or
 * whitespace) = omitted from the insert (the address stays null) —
 * existing posts without an address are unaffected.
 *
 * V3 slice 6 (ticket 09): the old optional "Best for ages" section is
 * REPLACED by "Kids you're bringing (optional)" — a multi-select of the
 * host's own kids (chips: name + age, from the 0011 kids table). The
 * age-hint field is gone from /new (the playdates.age_hint DB column
 * stays, just unused in the UI — the duplicate prefill carries it
 * dormant). On submit the selection lands in the 0022 playdate_kids
 * table (replace-on-duplicate) right after the post is created; it
 * shows on the detail page as the "Kids coming" line. No kids yet → a
 * designed empty state + a link to /profile.
 *
 * Validation is the pure validatePlaydateForm; on invalid, inline field
 * errors and nothing is saved. On success the created post is visible in
 * the feed immediately: the page navigates to /, where the feed re-fetches
 * on mount. A failed create (e.g. the playdates table is not applied yet)
 * renders a designed error, never a crash.
 *
 * Duplicate prefill (V2 slice 1): a "Duplicate" on one of the viewer's own
 * posts navigates here with router state (the /new route in App.tsx hands
 * it over as the `duplicate` prop). Everything except the date/time is
 * prefilled — the start date, start time, and duration are always
 * re-entered.
 */
export function NewPlaydatePage({ duplicate }: { duplicate: DuplicatePrefill | null }) {
  const navigate = useNavigate()
  const { loading, session } = useSessionContext()
  // V8 ticket 01: ONE mount-time `now` feeds both the form's default start
  // (today + the next 30-minute slot) and the quick-fill preset (its label
  // and the values it writes) — so the preset can never promise one time and
  // write another, and the fields never shift mid-edit.
  const [mountedNowIso] = useState(() => new Date().toISOString())
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[] | null>(null)
  const [values, setValues] = useState<PlaydateFormValues>(() =>
    initialValues(duplicate, mountedNowIso),
  )
  const [errors, setErrors] = useState<PlaydateFormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  // V3 slice 5 (ticket 08): the optional address (kept out of
  // PlaydateFormValues — the /new form's pinned field set stays
  // untouched; the address is the page-local field below).
  const [address, setAddress] = useState('')
  // V3 slice 6 (ticket 09): the kids picker — the host's own kids (the
  // 0011 kids table). null = still loading; [] = none yet OR the load
  // failed (pre-0011/0022-apply, the documented DB-not-applied
  // discipline): both render the same designed empty state, never a crash.
  const [kids, setKids] = useState<Kid[] | null>(null)
  // The picker's selection (page-local until submit — nothing is saved
  // until the post is created, then linkKidsToPlaydate lands it).
  const [selectedKidIds, setSelectedKidIds] = useState<string[]>([])
  // V8 ticket 01: the "Recent places" chips — the places this parent posted
  // to last (newest first, deduped, capped at 3). [] renders NO chips row,
  // whether that is because they have never posted or because the load
  // failed: the zero-pressure discipline (no error state on /new).
  const [recentPlaces, setRecentPlaces] = useState<RecentPlace[]>([])
  // The session's user id (the kids table's profile_id — the same key
  // ProfilePage's kids load uses).
  const userId = session?.user?.id ?? null

  useEffect(() => {
    let cancelled = false
    listNeighborhoods()
      .then((rows) => {
        if (!cancelled) setNeighborhoods(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Could not load neighborhoods.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  // V3 slice 6 (ticket 09): the host's own kids for the picker (fetched on
  // mount, keyed on the session's user id — the ProfilePage kids-load
  // pattern). A failed load (e.g. the kids table not applied yet)
  // degrades to the designed empty state (add your kids), never a crash.
  useEffect(() => {
    if (userId === null) return
    let cancelled = false
    listKids(userId)
      .then((rows) => {
        if (!cancelled) setKids(rows)
      })
      .catch(() => {
        if (!cancelled) setKids([])
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  // V8 ticket 01: the recent-places chips, fetched once the session settles
  // (the ProfilePage kids-load pattern). A failed load stays [] — no chips
  // row, never an error line (db.listRecentOwnPlaces returns [] with no
  // session rather than throwing; the chips are a convenience, not a feature
  // the form depends on).
  useEffect(() => {
    if (userId === null) return
    let cancelled = false
    listRecentOwnPlaces()
      .then((rows) => {
        if (!cancelled) setRecentPlaces(rows)
      })
      .catch(() => {
        if (!cancelled) setRecentPlaces([])
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  // V3 slice 6 (ticket 09): toggle a kid chip (multi-select, no cap — the
  // host picks whichever of their own kids are coming).
  function toggleKid(kidId: string) {
    setSelectedKidIds((prev) =>
      prev.includes(kidId) ? prev.filter((id) => id !== kidId) : [...prev, kidId],
    )
  }

  function update<K extends keyof PlaydateFormValues>(field: K, value: PlaydateFormValues[K]) {
    setValues((prev) => {
      const next = { ...prev, [field]: value }
      // V8 ticket 01: a place arriving (typed, or via a recent-place chip)
      // seeds the title when the parent has not written one — the same rule
      // the quick-fill preset uses.
      return field === 'place' ? withDefaultTitle(next) : next
    })
    setErrors((prev) => ({ ...prev, [field]: undefined }))
    setSubmitError(null)
  }

  /**
   * V8 ticket 01: one tap fills place + address + neighborhood from a place
   * this parent already posted to (three fields they have told us once
   * already). The address is written even when it is '' — the remembered
   * post had none, and leaving a stale address behind would be worse.
   */
  function applyRecentPlace(recent: RecentPlace) {
    setValues((prev) =>
      withDefaultTitle({ ...prev, place: recent.place, neighborhoodId: recent.neighborhoodId }),
    )
    setAddress(recent.address)
    setErrors((prev) => ({ ...prev, place: undefined, neighborhoodId: undefined }))
    setSubmitError(null)
  }

  // The quick-fill preset's own values — both from the mount-time `now`, so
  // the label it renders is exactly what it writes (see `mountedNowIso`).
  const quickStartMinutes = nextSlotMinutes(mountedNowIso)
  const quickDurationMinutes = suggestedDurationMinutes(mountedNowIso)
  const quickEndLabel = formatTimeLabel(quickStartMinutes + quickDurationMinutes)

  /**
   * V8 ticket 01: "we're here until <the next hour>" — the spontaneous
   * drop-in in one tap. Sets the start (today, next slot) and the duration,
   * and seeds the title once a place is known. Everything it writes stays
   * editable, and nothing is submitted (the parent still confirms).
   */
  function applyQuickFill() {
    setValues((prev) =>
      withDefaultTitle({
        ...prev,
        startDate: defaultStartDateIso(mountedNowIso),
        startMinutes: quickStartMinutes,
        durationMinutes: quickDurationMinutes,
      }),
    )
    setErrors((prev) => ({
      ...prev,
      startDate: undefined,
      startMinutes: undefined,
      durationMinutes: undefined,
    }))
    setSubmitError(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const fieldErrors = validatePlaydateForm(values)
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors)
      return
    }
    // V3 slice 5 (ticket 08): the optional address — trimmed, capped at
    // 120 (the inline error below is the user-facing wall); empty =
    // omitted from the insert (the address stays null).
    const trimmedAddress = address.trim()
    if (trimmedAddress.length > ADDRESS_MAX_LENGTH) {
      // The inline field error is already visible; nothing is saved.
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      // The date + start time are the device's local wall clock; convert to
      // UTC ISO before the timestamptz insert (the stored instant must be
      // the moment the parent meant, whatever their timezone). The end is
      // always computed (start + duration) — never typed.
      const createdPlaydate = await createPlaydate({
        title: values.title.trim(),
        place: values.place.trim(),
        neighborhoodId: values.neighborhoodId,
        startsAt: computeStartIso(values.startDate, values.startMinutes),
        endsAt: computeEndIso(values.startDate, values.startMinutes, values.durationMinutes),
        details: values.details.trim() || undefined,
        address: trimmedAddress.length > 0 ? trimmedAddress : undefined,
      })
      // V3 slice 6 (ticket 09): land the picker's selection in playdate_kids
      // right after the create succeeds (replace-on-duplicate — the post is
      // fresh, so this is effectively the insert). An empty selection
      // skips the call: nothing to link, and the pre-0022-apply path stays
      // green for kid-less posts (the 0021 address lesson — the picker's
      // RED-by-design window only hits when kids ARE selected). If the
      // link fails (e.g. 0022 not applied yet) the post stands but the
      // submit surfaces the error — re-posting (Duplicate) re-links.
      if (selectedKidIds.length > 0) {
        await linkKidsToPlaydate(createdPlaydate.id, selectedKidIds)
      }
      // The feed re-fetches on mount, so the new post appears immediately.
      navigate('/', { replace: true })
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not post your drop-in. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-600">
        Loading…
      </div>
    )
  }

  const titleLength = values.title.length
  const endTotal = values.startMinutes + values.durationMinutes
  // V3 slice 5 (ticket 08): the address's inline error (≤120 after trim;
  // computed at render, like the title's live counter — no separate
  // error state).
  const addressError =
    address.trim().length > ADDRESS_MAX_LENGTH
      ? `Keep the address to ${ADDRESS_MAX_LENGTH} characters.`
      : null

  return (
    <div className="flex flex-col gap-4">
      {/* V3 slice 3 (ticket 06, feedback #8): the "We'll be at the park
          3–5, come by if you like." + "Open invitation, zero pressure."
          helper line is out (the ticket's quick-feedback batch). */}
      <h1 className="text-xl font-semibold text-slate-900">Post a drop-in</h1>

      {duplicate !== null ? (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
          <p className="text-sm font-medium text-indigo-900">
            Duplicating “{duplicate.title}”
          </p>
          <p className="mt-0.5 text-xs text-indigo-700">
            Everything except the date and time is filled in — pick a new start time and
            duration.
          </p>
        </div>
      ) : null}

      {loadError !== null ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-red-600">{loadError}</p>
          <p className="text-xs text-slate-500">
            If you just signed up, the server setup may not be complete yet.
          </p>
        </div>
      ) : (
        <form
          className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          onSubmit={handleSubmit}
          noValidate
        >
          {/* V8 ticket 01: the spontaneous drop-in in one tap — start at the
              next 30-minute slot, run to the next hour. The label states the
              end it will actually write, and both come from the same
              mount-time `now`, so it cannot promise one time and set another.
              Nothing is submitted: the parent still taps Post. */}
          <div className="flex flex-col gap-1 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
            <button
              type="button"
              onClick={applyQuickFill}
              className="min-h-11 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
            >
              We’re here until {quickEndLabel}
            </button>
            <p className="text-xs text-indigo-700">
              Fills the start time ({formatTimeLabel(quickStartMinutes)}) and how long (
              {durationLabel(quickDurationMinutes)}) — then just say where you’ll be.
            </p>
          </div>

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
              onChange={(e) => update('title', e.target.value)}
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
              onChange={(e) => update('place', e.target.value)}
              placeholder="e.g. Green Lake playground, near the boathouse"
              autoComplete="off"
            />
          </label>
          {errors.place ? <p className="text-sm text-red-600">{errors.place}</p> : null}

          {/* V8 ticket 01: the remembered places this parent posted to last —
              one tap fills place + address + neighborhood. Hidden entirely
              when there are none (a first-timer sees no empty chip row). */}
          {recentPlaces.length > 0 ? (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">Recent places</span>
              <div className="flex flex-wrap gap-2">
                {recentPlaces.map((recent) => (
                  <button
                    key={recent.place}
                    type="button"
                    onClick={() => applyRecentPlace(recent)}
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
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 7200 4th Ave NE, near the boathouse"
              autoComplete="off"
            />
          </label>
          {addressError !== null ? (
            <p className="text-sm text-red-600">{addressError}</p>
          ) : null}

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-700">Neighborhood</span>
            <select
              className={
                'w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ' +
                (errors.neighborhoodId ? 'border-red-400' : 'border-slate-300')
              }
              value={values.neighborhoodId}
              onChange={(e) => update('neighborhoodId', e.target.value)}
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
              onChange={(e) => update('startDate', e.target.value)}
            />
            {errors.startDate ? (
              <p className="text-sm text-red-600">{errors.startDate}</p>
            ) : null}
            <TimeStepper
              minutes={values.startMinutes}
              onStep={(delta) => update('startMinutes', stepTimeMinutes(values.startMinutes, delta))}
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
                    onClick={() => update('durationMinutes', minutes)}
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
                      onClick={() => toggleKid(kid.id)}
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
              onChange={(e) => update('details', e.target.value)}
              placeholder="Anything parents should know — what to bring, parking, weather plan…"
            />
          </label>

          <div className="flex flex-col gap-2">
            <button
              type="submit"
              disabled={submitting || neighborhoods === null}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitting ? 'Posting…' : 'Post drop-in'}
            </button>
            {submitError ? <p className="text-sm text-red-600">{submitError}</p> : null}
          </div>
        </form>
      )}
    </div>
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
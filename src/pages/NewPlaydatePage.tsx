import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { ADDRESS_MAX_LENGTH, PlaydateFormFields } from '../components/PlaydateFormFields'
import { useSessionContext } from '../components/SessionProvider'
import {
  createPlaydate,
  createPlaydateSeries,
  ensureSeriesOccurrences,
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
  suggestedDurationMinutes,
  validatePlaydateForm,
} from '../lib/feed'
import type { PlaydateFormErrors, PlaydateFormValues, RecentPlace } from '../lib/feed'
import {
  deviceTimeZone,
  everyWeekdayLabel,
  seriesTimeLabel,
  weekdayFromDateIso,
} from '../lib/series'
import type { DuplicatePrefill, Kid, Neighborhood } from '../lib/types'

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
 * V8 ticket 05: the field set itself (every field, chip and error) is the
 * SHARED PlaydateFormFields component — this page owns only the state, the
 * mount-once defaults, the /new-only affordances (the quick-fill preset,
 * the "Recent places" chips, the duplicate banner) and the submit.
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
 *
 * V8 ticket 06 (migration 0028): "Repeat weekly" — OFF by default, so the
 * form a parent already knows is unchanged unless they ask for it. When it is
 * on, the weekday is derived from the chosen start date (never typed) and said
 * back in words ("every Saturday"), and the submit does three things in order:
 * create the SERIES (weekday + wall-clock start_minutes + the browser's IANA
 * zone — never a UTC instant, so 10 AM stays 10 AM across DST), create the
 * post the parent is looking at with `series_id` set, then top the series'
 * occurrences up to the 21-day horizon. From then on the post is an ordinary
 * drop-in that happens to say ` · weekly`, so pings, the guest list, kids,
 * comments, ICS, share and the signed-out view all work with no changes at all.
 *
 * Pre-0028-apply the series create fails (PGRST205: the table does not exist)
 * and the submit's designed error line says so — the documented red-by-design
 * point, never a crash (the DB-not-applied discipline).
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
  // V8 ticket 06: "Repeat weekly" — OFF by default (a one-off drop-in is the
  // common case, and the form a parent knows must not change under them).
  const [repeatWeekly, setRepeatWeekly] = useState(false)
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
  // V8 ticket 06: the weekday the "Repeat weekly" control is about, derived
  // from the chosen start date ('' until a date is chosen — the pure seam
  // says nothing rather than guessing).
  const repeatWeeklyLabel = everyWeekdayLabel(weekdayFromDateIso(values.startDate))

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
      const trimmedDetails = values.details.trim() || undefined
      // V8 ticket 06: "Repeat weekly" — derive the weekday from the chosen
      // start date (the pure seam: a date with no parts yields null, and
      // validation has already required a date) and create the series FIRST,
      // so the post below can carry its id. The series stores the WALL CLOCK
      // rule + the browser's IANA zone; the instant is never stored (10 AM
      // stays 10 AM across the March and November transitions).
      //
      // This order is also the documented red-by-design point pre-0028-apply:
      // the missing table fails the submit here, before anything is written.
      // A failed POST create AFTER a successful series create would leave an
      // unreferenced series row (no occurrences, invisible in the UI — the
      // series line only renders for a post that points at one); that is
      // preferable to a post that fails for a reason the parent cannot act on.
      const seriesWeekday = weekdayFromDateIso(values.startDate)
      let seriesId: string | undefined
      if (repeatWeekly && seriesWeekday !== null) {
        const series = await createPlaydateSeries({
          title: values.title.trim(),
          place: values.place.trim(),
          address: trimmedAddress.length > 0 ? trimmedAddress : undefined,
          details: trimmedDetails,
          neighborhoodId: values.neighborhoodId,
          weekday: seriesWeekday,
          startMinutes: values.startMinutes,
          durationMinutes: values.durationMinutes,
          timezone: deviceTimeZone(),
        })
        seriesId = series.id
      }
      const createdPlaydate = await createPlaydate({
        title: values.title.trim(),
        place: values.place.trim(),
        neighborhoodId: values.neighborhoodId,
        startsAt: computeStartIso(values.startDate, values.startMinutes),
        endsAt: computeEndIso(values.startDate, values.startMinutes, values.durationMinutes),
        details: trimmedDetails,
        address: trimmedAddress.length > 0 ? trimmedAddress : undefined,
        seriesId,
      })
      // V8 ticket 06: the occurrences the parent is not looking at. The post
      // just created IS this series' first occurrence and the generator
      // skips it (the unique (series_id, starts_at) index + on conflict do
      // nothing), so this only fills in the weeks ahead.
      //
      // Swallowed on purpose: the series and the post are already real, and
      // the host opening this post later re-runs the same generator (the
      // pinned (a)+(b) strategy), so a failed top-up here is transient, not
      // a reason to fail a post that exists. Nothing is silently lost: the
      // weeks simply arrive on the next open.
      if (seriesId !== undefined) {
        await ensureSeriesOccurrences(seriesId).catch(() => {
          /* Swallowed — the host's next open of this post regenerates. */
        })
      }
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
        <PlaydateFormFields
          values={values}
          errors={errors}
          onFieldChange={update}
          address={address}
          onAddressChange={setAddress}
          neighborhoods={neighborhoods}
          kids={kids}
          selectedKidIds={selectedKidIds}
          onToggleKid={toggleKid}
          recentPlaces={recentPlaces}
          onApplyRecentPlace={applyRecentPlace}
          preset={
            /* V8 ticket 01: the spontaneous drop-in in one tap — start at the
               next 30-minute slot, run to the next hour. The label states the
               end it will actually write, and both come from the same
               mount-time `now`, so it cannot promise one time and set another.
               Nothing is submitted: the parent still taps Post. */
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
          }
          /* V8 ticket 06: the "Repeat weekly" control — off by default. The
             weekday is DERIVED from the chosen start date and said back in
             words, so a parent sees the rule they are about to create ("every
             Saturday") rather than having to work it out from the date field.
             Nothing is submitted here; it only arms the series on Post. */
          repeatSlot={
            <div className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <button
                type="button"
                aria-pressed={repeatWeekly}
                data-testid="repeat-weekly"
                onClick={() => setRepeatWeekly((prev) => !prev)}
                className={
                  'min-h-11 w-full rounded-xl border px-4 py-2 text-sm font-medium transition-colors ' +
                  (repeatWeekly
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-slate-300 bg-white text-slate-700')
                }
              >
                Repeat weekly
              </button>
              {repeatWeekly ? (
                repeatWeeklyLabel !== '' ? (
                  <p data-testid="repeat-weekly-label" className="text-xs text-slate-600">
                    Repeats{' '}
                    <span className="font-medium text-indigo-700">{repeatWeeklyLabel}</span> at{' '}
                    {seriesTimeLabel(values.startMinutes)} — the weeks ahead post themselves.
                  </p>
                ) : (
                  <p className="text-xs text-slate-600">
                    Pick a start date and this becomes a standing weekly meetup.
                  </p>
                )
              ) : (
                <p className="text-xs text-slate-500">
                  Off — this is a one-off. Turn it on for a standing meetup.
                </p>
              )}
            </div>
          }
          submitLabel="Post drop-in"
          submittingLabel="Posting…"
          submitBusy={submitting}
          submitDisabled={neighborhoods === null}
          submitError={submitError}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  )
}

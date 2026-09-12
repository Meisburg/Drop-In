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
  listPlaces,
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
  PLACE_BROWSE_LIMIT,
  PLACE_SUGGESTION_LIMIT,
  placePickerMatches,
  placePickPatch,
  resolvePlaceByName,
  stripPlaceAlias,
  usesPlaceAlias,
} from '../lib/places'
// V8 ticket 08: recording the meaningful action that may precede the
// notification opt-in (this page arms it; the shell's PushOptInPrompt decides).
import { armPushPromptForAction } from '../lib/pushClient'
import {
  deviceTimeZone,
  everyWeekdayLabel,
  seriesTimeLabel,
  weekdayFromDateIso,
} from '../lib/series'
import type { DuplicatePrefill, Kid, Place, PlacePrefill } from '../lib/types'

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
function initialValues(
  duplicate: DuplicatePrefill | null,
  placePrefill: PlacePrefill | null,
  nowIso: string,
): PlaydateFormValues {
  const defaults: PlaydateFormValues = {
    ...emptyValues,
    startDate: defaultStartDateIso(nowIso),
    startMinutes: nextSlotMinutes(nowIso),
  }
  // V8 ticket 07: "Start a drop-in here" (the place page) wins over a duplicate
  // prefill — the parent just tapped a place, so that place is what they mean.
  // The title default the form already applies when a place is known and none
  // has been typed (V8 ticket 01's rule) applies here too, so arriving from a
  // place page opens on a complete, postable form rather than one with an empty
  // required field.
  if (placePrefill !== null) {
    return withDefaultTitle({
      ...defaults,
      ...(duplicate === null ? {} : duplicate),
      place: placePrefill.place,
      neighborhoodId: placePrefill.neighborhoodId ?? '',
    })
  }
  return duplicate === null ? defaults : { ...defaults, ...duplicate }
}

/**
 * The one title default the /new form applies (V8 ticket 01): a drop-in is
 * titled "Playdate at <place>" only when the parent has not typed a title
 * AND a place is known. Never overwrites typed text, never fires with no
 * place, and the live n/80 counter keeps working because this returns the
 * same value shape the inputs write.
 *
 * V9 ticket 01: the seed reads the place with its `@` ALIAS stripped
 * (places.stripPlaceAlias) — the alias is a gesture, not text. Without that,
 * the alias's most natural use (type `@`, pick from the list) seeded
 * "Playdate at @" and, because a seed never overwrites, posted it: found by
 * e2e/post-location, which is why this rule lives in the same seam the picker
 * matches with. A bare `@` yields no place and therefore no seed.
 */
function withDefaultTitle(values: PlaydateFormValues): PlaydateFormValues {
  if (values.title.trim() !== '') return values
  const place = stripPlaceAlias(values.place)
  if (place === '') return values
  return { ...values, title: `Playdate at ${place}` }
}

/**
 * /new — post a drop-in (slice 3; time entry reworked in V2 slice 1).
 *
 * V9 ticket 01 (this page's current shape): the FIRST field is the PLACE
 * PICKER, labelled "Where? — pick a place", with a visible "Browse places"
 * button beside it; typing filters the 239 seeded places, and a leading `@` is
 * an alias that opens the same picker. The NEIGHBOURHOOD SELECT IS GONE —
 * "maybe you just put in the address and not a neighborhood because people
 * aren't going to know that" — so a post is postable with a place (picked or
 * typed) and nothing else, and the page no longer fetches the neighbourhoods
 * table at all (that fetch was gating the submit button: a hidden dependency
 * on a question this ticket deletes). The rest of the form is unchanged:
 * Title (≤ 80 chars, live counter), an address that now arrives WITH a picked
 * place, the start (a date picker + a 30-minute-stepper time + duration
 * chips — the end is computed, never typed), kids, details, and "Repeat
 * weekly".
 *
 * V8 ticket 05: the field set itself (every field, chip and error) is the
 * SHARED PlaydateFormFields component — this page owns only the state, the
 * mount-once defaults, the /new-only affordances (the quick-fill preset,
 * the "Recent places" chips, the duplicate banner) and the submit.
 *
 * V3 slice 5 (ticket 08): an optional address field under place (≤120 chars,
 * trim only; an inline error when over). Empty (or whitespace) = omitted from
 * the insert (the address stays null) — existing posts without an address are
 * unaffected. V9 ticket 01: not optional in practice any more — a picked place
 * fills it — but the field stays editable and the Maps link it drives (V3
 * ticket 08's seam) is untouched.
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
 * renders a designed error, never a crash — and V9 ticket 01's documented
 * pre-0035 red is exactly that line: an insert with no neighbourhood 400s on
 * the NOT NULL column (23502) until migration 0035 lands.
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
export function NewPlaydatePage({
  duplicate,
  placePrefill = null,
}: {
  duplicate: DuplicatePrefill | null
  /** V8 ticket 07: the place page's "Start a drop-in here" (router state). */
  placePrefill?: PlacePrefill | null
}) {
  const navigate = useNavigate()
  const { loading, session } = useSessionContext()
  // V8 ticket 01: ONE mount-time `now` feeds both the form's default start
  // (today + the next 30-minute slot) and the quick-fill preset (its label
  // and the values it writes) — so the preset can never promise one time and
  // write another, and the fields never shift mid-edit.
  const [mountedNowIso] = useState(() => new Date().toISOString())
  const [values, setValues] = useState<PlaydateFormValues>(() =>
    initialValues(duplicate, placePrefill, mountedNowIso),
  )
  // V8 ticket 07: the picked place's id — the whole distance-model fix in one
  // piece of state. null = free text ("Somewhere else", or a place typed
  // before the directory existed), and the post then sends no place_id at all.
  const [placeId, setPlaceId] = useState<string | null>(placePrefill?.placeId ?? null)
  // The directory, for the autocomplete. null = not loaded OR the load failed
  // (the DB-not-applied discipline): both render NO suggestions, free text
  // still works, and the "Browse places" button is not rendered at all —
  // /new must never depend on the places table.
  const [places, setPlaces] = useState<Place[] | null>(null)
  /**
   * V9 ticket 01: the picker's ONE state — what the inline list is doing.
   *
   * - 'closed': nothing is showing (a pick, "Somewhere else", or an emptied
   *   field).
   * - 'typing': opened by typing; the list is the ranked matchPlaces result
   *   (an empty query means the list is closed, so this never renders a bare
   *   directory).
   * - 'browse': opened by the BROWSE PLACES button, or by the `@` alias at the
   *   start of the field. A bare `@` therefore shows the directory A→Z (the
   *   alias has to be an alias for something), and typing after it narrows
   *   that list instead of switching modes.
   *
   * Three states, not two booleans: "open" alone cannot say whether an empty
   * query should show the directory or nothing, and that is the whole
   * difference between browsing and typing.
   */
  const [picker, setPicker] = useState<'closed' | 'typing' | 'browse'>('closed')
  const [errors, setErrors] = useState<PlaydateFormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  // V3 slice 5 (ticket 08): the optional address (kept out of
  // PlaydateFormValues — the /new form's pinned field set stays
  // untouched; the address is the page-local field below).
  // V8 ticket 07: "Start a drop-in here" prefills it from the place.
  const [address, setAddress] = useState(placePrefill?.address ?? '')
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

  // V8 ticket 07: the places directory for the autocomplete, fetched once on
  // mount. A failed load (0029 not applied yet) leaves `places` null and the
  // form simply has NO suggestions — the place field stays the free-text field
  // it has always been, so /new works with or without the directory. This is
  // deliberately NOT the page's loadError state: a missing places table must
  // not wall off posting a drop-in.
  useEffect(() => {
    let cancelled = false
    listPlaces()
      .then((rows) => {
        if (!cancelled) setPlaces(rows)
      })
      .catch(() => {
        if (!cancelled) setPlaces(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // V8 ticket 07: a DUPLICATE prefill carries a place STRING but no place id
  // (DuplicatePrefill is pinned, and this ticket does not change its shape), so
  // resolve it against the directory by exact name once the directory arrives.
  // A resolved name re-links the duplicated post to its place — and, with it,
  // to the place's coordinates. A non-match changes nothing: place_id stays
  // null and the text is never rewritten. The same one rule the recent-place
  // chips use (places.resolvePlaceByName).
  useEffect(() => {
    if (places === null || duplicate === null) return
    const resolved = resolvePlaceByName(duplicate.place, places)
    if (resolved !== null) setPlaceId((prev) => prev ?? resolved.id)
  }, [places, duplicate])

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
    // V8 ticket 07: EDITING the place text drops the place link. The post must
    // never claim a directory place it no longer names — "Green Lake Park"
    // typed over a picked "Ballard Playground" is free text again, and its
    // distance goes back to the host-zip fallback rather than silently
    // measuring to Ballard. Typing also opens the picker.
    //
    // V9 ticket 01: the `@` alias (typed at the START of the field) opens the
    // picker in BROWSE mode — the same list the "Browse places" button opens,
    // because an alias for the picker that showed an empty list would not be
    // one.
    //
    // WHAT IS TRUE ABOUT THE TEXT, stated honestly (review cycle 1, F8): while
    // the parent TYPES, the field is never rewritten — they see exactly what
    // they typed, `@` included, which is the resolvePlaceByName pin. But the `@`
    // never reaches a POST: handleSubmit sends `stripPlaceAlias(values.place)`,
    // so the alias character is dropped on the way to the database (and a bare
    // `@` is no place at all, which validation refuses). Everything the parent
    // does NOT type — the place, the address, the seeded title — comes from the
    // same stripped rule.
    if (field === 'place') {
      setPlaceId(null)
      const text = String(value)
      if (usesPlaceAlias(text)) setPicker('browse')
      else setPicker(text.trim() !== '' ? 'typing' : 'closed')
    }
    setErrors((prev) => ({ ...prev, [field]: undefined }))
    setSubmitError(null)
  }

  /**
   * V8 ticket 01: one tap fills place + address + neighborhood from a place
   * this parent already posted to (three fields they have told us once
   * already). The address is written even when it is '' — the remembered
   * post had none, and leaving a stale address behind would be worse.
   *
   * V8 ticket 07: it ALSO carries a place_id when the remembered text is
   * exactly a directory name (places.resolvePlaceByName — no fuzzy matching,
   * no rewriting of the remembered text), so re-posting to the same playground
   * keeps the place's coordinates instead of falling back to the host zip. A
   * remembered place the directory does not know stays free text, unchanged.
   */
  function applyRecentPlace(recent: RecentPlace) {
    setValues((prev) =>
      withDefaultTitle({ ...prev, place: recent.place, neighborhoodId: recent.neighborhoodId }),
    )
    setAddress(recent.address)
    setPlaceId(resolvePlaceByName(recent.place, places ?? [])?.id ?? null)
    setPicker('closed')
    setErrors((prev) => ({ ...prev, place: undefined, neighborhoodId: undefined }))
    setSubmitError(null)
  }

  /**
   * V8 ticket 07: picking a suggestion fills the place, the address and the
   * neighborhood in ONE tap, plus the place_id that makes the post's location
   * the place's coordinates.
   *
   * V9 ticket 01: with the neighbourhood gone from /new there is no visible
   * field here at all — the value still rides `values.neighborhoodId` (so a
   * place that DOES carry one still reaches the insert), and a place with none
   * leaves the post with no neighbourhood: the ordinary, postable case that
   * migration 0035 exists to allow.
   *
   * THE PICK REPLACES THE NEIGHBOURHOOD, INCLUDING WITH NONE (review cycle 1,
   * F1). The earlier version inherited the parent's current value when the place
   * carried none — and on THIS page that value is invisible: a "Recent places"
   * chip writes the remembered post's neighbourhood into the form
   * (applyRecentPlace below) and /new renders no neighbourhood field
   * (showNeighborhood = false), so picking a directory place after tapping a
   * chip kept the OLD place's id and wrote it onto the NEW place. The pure seam
   * now owns that rule and cannot consult the previous value at all
   * (places.placePickPatch takes only the place), so the stale state is not
   * expressible here.
   */
  function pickPlace(place: Place) {
    // The one-tap fill is the pure seam (places.placePickPatch — "what a pick
    // writes into the form", unit-tested), so this page decides only the STATE
    // changes around it: link the place id, close the list, clear the errors.
    const patch = placePickPatch(place)
    setValues((prev) =>
      withDefaultTitle({
        ...prev,
        place: patch.place,
        // '' when the place carries none — see the doc above. Never `prev`.
        neighborhoodId: patch.neighborhoodId,
      }),
    )
    setAddress(patch.address)
    setPlaceId(place.id)
    setPicker('closed')
    setErrors((prev) => ({ ...prev, place: undefined, neighborhoodId: undefined }))
    setSubmitError(null)
  }

  /**
   * V8 ticket 07: "Somewhere else" — the directory is never a wall. Closes the
   * list and keeps exactly what the parent typed as free text (place_id null),
   * so meeting at a friend's building or a brand-new park works the way it
   * always has. V9 ticket 01: that post now carries NO neighbourhood, which is
   * a legal post (the neighbourhood stopped being a question).
   */
  function chooseSomewhereElse() {
    setPlaceId(null)
    setPicker('closed')
  }

  /**
   * V9 ticket 01: the "Browse places" button — a toggle. It opens the same
   * inline list the field's typing opens, in browse mode (the directory,
   * A→Z); tapping it again closes the list, so the affordance that showed the
   * directory is also the one that puts it away.
   */
  function toggleBrowsePlaces() {
    setPicker((prev) => (prev === 'browse' ? 'closed' : 'browse'))
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
    // V9 ticket 01: the place the app will actually write — the field's text
    // with its `@` ALIAS removed (places.stripPlaceAlias). The alias is a
    // gesture for opening the picker, so a parent who typed `@` and picked
    // nothing has typed NO place: validation must ask for one rather than
    // accept the bare character, and neither the post nor the series may carry
    // it. The field itself is never rewritten while they type.
    const placeText = stripPlaceAlias(values.place)
    const fieldErrors = validatePlaydateForm({ ...values, place: placeText })
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
          place: placeText,
          address: trimmedAddress.length > 0 ? trimmedAddress : undefined,
          details: trimmedDetails,
          neighborhoodId: values.neighborhoodId,
          weekday: seriesWeekday,
          startMinutes: values.startMinutes,
          durationMinutes: values.durationMinutes,
          timezone: deviceTimeZone(),
          // V8 ticket 07: the series carries the place too, when one was picked
          // (the key is omitted entirely for free text — placeIdField).
          placeId: placeId ?? undefined,
        })
        seriesId = series.id
      }
      const createdPlaydate = await createPlaydate({
        title: values.title.trim(),
        place: placeText,
        neighborhoodId: values.neighborhoodId,
        startsAt: computeStartIso(values.startDate, values.startMinutes),
        endsAt: computeEndIso(values.startDate, values.startMinutes, values.durationMinutes),
        details: trimmedDetails,
        address: trimmedAddress.length > 0 ? trimmedAddress : undefined,
        seriesId,
        // V8 ticket 07: the picked place. undefined for free text, so the
        // insert payload carries no place_id key at all.
        placeId: placeId ?? undefined,
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
      // V8 ticket 08: a post was just created — one of the two MEANINGFUL
      // actions that may be followed by the notification opt-in (the other is
      // a saved ping). This only records the action; whether a prompt is
      // allowed is the pure decidePermissionPrompt seam's decision.
      armPushPromptForAction('post_created')
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

      {/* V9 ticket 01 (T7): the `loadError` wall is GONE. It existed because
          the neighbourhood select was REQUIRED and its options had to load —
          a form that could not be filled in without them. The neighbourhood is
          no longer a question on this page, so a failed read of that table
          must not block posting a drop-in: there is nothing left for it to
          block. (The places directory keeps its own, older discipline: a
          failed load means no suggestions and no Browse button, never a wall —
          free text is always postable.) */}
      <PlaydateFormFields
        values={values}
        errors={errors}
        onFieldChange={update}
        address={address}
        onAddressChange={setAddress}
        /* V9 ticket 01: /new does not render the neighbourhood select at all.
           The prop's default is "shown" so the EDIT form keeps its exact V8
           ticket 05 markup; this page opts out. */
        showNeighborhood={false}
        /* V9 ticket 01: WHERE first, labelled, with the picker's affordances. */
        locationFirst
        kids={kids}
        selectedKidIds={selectedKidIds}
        onToggleKid={toggleKid}
        recentPlaces={recentPlaces}
        onApplyRecentPlace={applyRecentPlace}
        /* V8 ticket 07: the place autocomplete. It stays CLOSED while the
           directory is unavailable (null), so a pre-0029-apply /new renders
           exactly the form it rendered yesterday.
           V9 ticket 01: the list is whatever `placePickerMatches` decides for
           the field's text + the picker's mode — typed matches, or (in browse
           mode, opened by the button or by a leading `@`) the directory A→Z,
           narrowed by the query when there is one. */
        placeSuggestionsOpen={picker !== 'closed' && places !== null && places.length > 0}
        placeSuggestions={placePickerMatches(
          values.place,
          places ?? [],
          picker === 'browse' ? PLACE_BROWSE_LIMIT : PLACE_SUGGESTION_LIMIT,
          picker === 'browse',
        )}
        onPickPlace={pickPlace}
        onSomewhereElse={chooseSomewhereElse}
        /* V9 ticket 01: the visible Browse places button — passed ONLY when
           the directory actually loaded. A button that cannot browse (or one
           that opens an empty list) is worse than no button, and /new must
           stay usable with no places table at all. */
        onBrowsePlaces={places !== null && places.length > 0 ? toggleBrowsePlaces : undefined}
        browsePlacesOpen={picker === 'browse'}
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
        /* V8's gate here was `neighborhoods === null` — the dead dependency
           T7 of V9 ticket 01 deletes: the form was disabled until a table the
           parent never sees answered. A drop-in is postable with a place and
           nothing else, so nothing on this page can hold the button down. */
        submitError={submitError}
        onSubmit={handleSubmit}
      />
    </div>
  )
}

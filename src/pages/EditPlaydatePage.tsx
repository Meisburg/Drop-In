import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { ADDRESS_MAX_LENGTH, PlaydateFormFields } from '../components/PlaydateFormFields'
import { NAV_ICONS } from '../components/icons'
import { SectionHeader } from '../components/SectionHeader'
import { useSessionContext } from '../components/SessionProvider'
import {
  getPlaydateDetail,
  linkKidsToPlaydate,
  listKids,
  listNeighborhoods,
  listPlaydateKidIds,
  updatePlaydate,
} from '../lib/db'
import {
  computeEndIso,
  computeStartIso,
  isHiddenPost,
  playdateEditFieldsChanged,
  playdateEditKidIdsChanged,
  playdateFormValuesFromPost,
  validatePlaydateForm,
} from '../lib/feed'
import type {
  PlaydateEditOriginal,
  PlaydateFormErrors,
  PlaydateFormValues,
} from '../lib/feed'
import type { Kid, Neighborhood, PlaydateWithNeighborhood } from '../lib/types'

type EditState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'not-found' }
  | {
      status: 'ready'
      /** The row AS STORED — the save's comparison baseline. */
      detail: PlaydateWithNeighborhood
      /**
       * The post's CURRENT playdate_kids selection (the DB truth). The
       * picker edits a separate state; this is what the save compares
       * against — and what makes an untouched selection skip the
       * replace-on-save write entirely (see the failed-read note below).
       */
      kidIds: string[]
    }

/**
 * /playdate/:id/edit — fix a plan instead of cancelling it (V8 ticket 05).
 *
 * The host edits the SAME field set /new posts with (the shared
 * PlaydateFormFields — one implementation of every field, chip and error):
 * title, place, address, neighborhood, details, start date + time, duration
 * and "kids you're bringing". The end time stays computed from start +
 * duration, never typed. Validation is the same pure validatePlaydateForm.
 *
 * SERIES (deliberate absence): ticket 06's standing-playdate series does not
 * exist yet, and this page edits exactly the ONE playdate row it loaded —
 * so there is no "edit the whole series" control anywhere, not even a
 * disabled one. If ticket 06 lands, this route keeps editing the single
 * occurrence and the series scope question is a new decision, not a
 * pre-built dead switch.
 *
 * Host-only, two walls. The RLS `playdates_update_host` policy from 0005 is
 * the DB wall (a non-host write is a silent 0-row 2xx — the 0014 lesson);
 * the UI wall is here: a non-host is redirected to the post's detail page
 * (the `/mod` guard pattern), and the app shell sends a signed-out visitor
 * to that same detail page — the public surface they may already see — for
 * this whole path.
 *
 * NO MIGRATION: the UPDATE policy already ships. The save is a plain
 * `.update()` with no RETURNING (the 42501 lesson) and then navigates to the
 * detail page, which re-reads the row.
 *
 * A save that changes nothing writes NOTHING (the pinned no-op): the pure
 * `playdateEditFieldsChanged` / `playdateEditKidIdsChanged` decide, per
 * half, whether a write happens at all — and the kids half is why a failed
 * (or pre-0022-apply) selection read is harmless: [] compares equal to an
 * untouched picker, so the replace-on-save never empties a selection it
 * could not read.
 */
export function EditPlaydatePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { loading: sessionLoading, session } = useSessionContext()
  const [state, setState] = useState<EditState>({ status: 'loading' })
  const [values, setValues] = useState<PlaydateFormValues>({
    title: '',
    place: '',
    neighborhoodId: '',
    startDate: '',
    startMinutes: 0,
    durationMinutes: 0,
    ageHint: '',
    details: '',
  })
  const [address, setAddress] = useState('')
  const [selectedKidIds, setSelectedKidIds] = useState<string[]>([])
  const [errors, setErrors] = useState<PlaydateFormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[] | null>(null)
  const [kids, setKids] = useState<Kid[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const userId = session?.user?.id ?? null
  const detailPath = id === undefined ? '/' : `/playdate/${id}`

  useEffect(() => {
    let cancelled = false
    listNeighborhoods()
      .then((rows) => {
        if (!cancelled) setNeighborhoods(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          // Only the neighborhood SELECT needs this list: a failed load
          // leaves it disabled (the stored value is already in the field), so
          // the failure costs the ability to CHANGE the neighborhood, not to
          // fix a typo in the title. Its own line, not the submit error — it
          // is not tied to a save.
          setLoadError(
            err instanceof Error ? err.message : 'Could not load neighborhoods.',
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

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

  // The post being edited: fetched once per id (the detail page's fetch —
  // same payload, same not-found). The kids selection is a SECOND read
  // whose failure is deliberately harmless: [] (see the header note).
  useEffect(() => {
    if (id === undefined || id === '') {
      setState({ status: 'not-found' })
      return
    }
    if (sessionLoading) return
    let cancelled = false
    setState({ status: 'loading' })
    void (async () => {
      try {
        const detail = await getPlaydateDetail(id)
        if (cancelled) return
        if (detail === null) {
          setState({ status: 'not-found' })
          return
        }
        const kidIds = await listPlaydateKidIds(id).catch(() => [])
        if (cancelled) return
        const nextValues = playdateFormValuesFromPost(detail)
        setValues(nextValues)
        setAddress(detail.address ?? '')
        setSelectedKidIds(kidIds)
        setState({ status: 'ready', detail, kidIds })
      } catch (err) {
        if (cancelled) return
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : 'Could not load this drop-in.',
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, sessionLoading])

  function update<K extends keyof PlaydateFormValues>(field: K, value: PlaydateFormValues[K]) {
    setValues((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => ({ ...prev, [field]: undefined }))
    setSubmitError(null)
  }

  function toggleKid(kidId: string) {
    setSelectedKidIds((prev) =>
      prev.includes(kidId) ? prev.filter((other) => other !== kidId) : [...prev, kidId],
    )
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (state.status !== 'ready' || submitting) return
    const detail = state.detail
    const fieldErrors = validatePlaydateForm(values)
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors)
      return
    }
    const trimmedAddress = address.trim()
    if (trimmedAddress.length > ADDRESS_MAX_LENGTH) {
      // The inline field error is already visible; nothing is saved.
      return
    }
    const original: PlaydateEditOriginal = {
      title: detail.title,
      place: detail.place,
      address: detail.address ?? null,
      neighborhood_id: detail.neighborhood_id,
      starts_at: detail.starts_at,
      ends_at: detail.ends_at,
      details: detail.details,
      kidIds: state.kidIds,
    }
    const fieldsChanged = playdateEditFieldsChanged(original, values, address)
    const kidsChanged = playdateEditKidIdsChanged(original.kidIds, selectedKidIds)
    if (!fieldsChanged && !kidsChanged) {
      // The pinned no-op: nothing was edited, so nothing is written — not
      // even an identical update. The host lands back on the post.
      navigate(detailPath, { replace: true })
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      if (fieldsChanged) {
        await updatePlaydate(detail.id, {
          title: values.title.trim(),
          place: values.place.trim(),
          neighborhoodId: values.neighborhoodId,
          startsAt: computeStartIso(values.startDate, values.startMinutes),
          endsAt: computeEndIso(values.startDate, values.startMinutes, values.durationMinutes),
          // Empty → null, so clearing details or the address actually
          // clears it (an omitted key would leave the old value behind).
          details: values.details.trim() || null,
          address: trimmedAddress.length > 0 ? trimmedAddress : null,
        })
      }
      // Replace-on-save (the existing linkKidsToPlaydate): delete the
      // post's playdate_kids rows, insert the selection. Only when the
      // selection actually changed.
      if (kidsChanged) {
        await linkKidsToPlaydate(detail.id, selectedKidIds)
      }
      // The detail page re-reads the row on mount, so the edit is visible
      // immediately.
      navigate(detailPath, { replace: true })
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not save your changes. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (sessionLoading || state.status === 'loading') {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-600">
        Loading…
      </div>
    )
  }

  // The UI wall the shell also enforces: no session, no form — the post's
  // detail page (public surface included) is where this path belongs.
  if (session === null) {
    return <Navigate to={detailPath} replace />
  }

  if (state.status === 'error') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm text-red-600">{state.message}</p>
        <p className="text-xs text-slate-500">
          If you just signed up, the server setup may not be complete yet.
        </p>
        <Link to="/" className="flex min-h-11 items-center text-sm text-indigo-600">
          Back to today
        </Link>
      </div>
    )
  }

  if (state.status === 'not-found') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">We couldn’t find this drop-in</h1>
        <p className="text-sm text-slate-600">It may have been removed, or the link is a typo.</p>
        <Link to="/" className="flex min-h-11 items-center text-sm text-indigo-600">
          Back to today
        </Link>
      </div>
    )
  }

  // Host-only (the /mod guard's shape, at page level because the guard needs
  // the loaded row): a non-host — including the signed-out visitor the shell
  // already bounced — never renders the form. A moderator-hidden post is not
  // editable either: the edit form is not a way around the hide (the same
  // posture the detail page takes when it renders the removed state).
  if (state.detail.host_profile_id !== session.user.id || isHiddenPost(state.detail)) {
    return <Navigate to={detailPath} replace />
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader icon={NAV_ICONS.post} title="Edit your drop-in" tagline="Update the plan" />

      {/* The neighborhoods list failed to load: the select stays disabled
          (the stored neighborhood is already in the field, so a save still
          works). Its own line — never the submit error, which is about the
          save. */}
      {loadError !== null ? <p className="text-sm text-red-600">{loadError}</p> : null}

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
        submitLabel="Save changes"
        submittingLabel="Saving…"
        submitBusy={submitting}
        /* Unlike /new, a neighborhoods load failure does NOT block the save:
           the field already holds the stored neighborhood (a valid value),
           so the failure costs the ability to CHANGE it, not to fix a typo
           in the title. */
        submitError={submitError}
        onSubmit={handleSubmit}
      />
    </div>
  )
}

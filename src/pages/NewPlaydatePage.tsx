import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useSessionContext } from '../components/SessionProvider'
import { createPlaydate, listNeighborhoods } from '../lib/db'
import { validatePlaydateForm } from '../lib/feed'
import type { PlaydateFormErrors, PlaydateFormValues } from '../lib/feed'
import type { Neighborhood } from '../lib/types'

const TITLE_MAX_LENGTH = 80

const emptyValues: PlaydateFormValues = {
  title: '',
  place: '',
  neighborhoodId: '',
  startsAt: '',
  endsAt: '',
  ageHint: '',
  details: '',
}

/**
 * /new — post a drop-in (slice 3). Title (≤ 80 chars, live counter),
 * place, neighborhood, start/end (end after start), optional age hint +
 * details. Validation is the pure validatePlaydateForm; on invalid, inline
 * field errors and nothing is saved. On success the created post is
 * visible in the feed immediately: the page navigates to /, where the
 * feed re-fetches on mount. A failed create (e.g. the playdates table is
 * not applied yet) renders a designed error, never a crash.
 */
export function NewPlaydatePage() {
  const navigate = useNavigate()
  const { loading } = useSessionContext()
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[] | null>(null)
  const [values, setValues] = useState<PlaydateFormValues>(emptyValues)
  const [errors, setErrors] = useState<PlaydateFormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

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

  function update<K extends keyof PlaydateFormValues>(field: K, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => ({ ...prev, [field]: undefined }))
    setSubmitError(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const fieldErrors = validatePlaydateForm(values)
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors)
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      // datetime-local values are the device's local time; convert to UTC
      // ISO before the timestamptz insert (the stored instant must be the
      // moment the parent meant, whatever their timezone).
      await createPlaydate({
        title: values.title.trim(),
        place: values.place.trim(),
        neighborhoodId: values.neighborhoodId,
        startsAt: new Date(values.startsAt).toISOString(),
        endsAt: new Date(values.endsAt).toISOString(),
        ageHint: values.ageHint.trim() || undefined,
        details: values.details.trim() || undefined,
      })
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
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    )
  }

  const titleLength = values.title.length

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Post a drop-in</h1>
        <p className="mt-1 text-sm text-slate-500">
          “We’ll be at the park 3–5, come by if you like.” Open invitation, zero
          pressure.
        </p>
      </div>

      {loadError !== null ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-red-600">{loadError}</p>
          <p className="text-xs text-slate-400">
            If you just signed up, the server setup may not be complete yet.
          </p>
        </div>
      ) : (
        <form
          className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          onSubmit={handleSubmit}
          noValidate
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="flex items-center justify-between text-slate-700">
              Title
              <span
                className={
                  'text-xs ' + (titleLength > TITLE_MAX_LENGTH ? 'text-red-600' : 'text-slate-400')
                }
              >
                {titleLength}/{TITLE_MAX_LENGTH}
              </span>
            </span>
            <input
              className={
                'w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ' +
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
                'w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ' +
                (errors.place ? 'border-red-400' : 'border-slate-300')
              }
              value={values.place}
              onChange={(e) => update('place', e.target.value)}
              placeholder="e.g. Green Lake playground, near the boathouse"
              autoComplete="off"
            />
          </label>
          {errors.place ? <p className="text-sm text-red-600">{errors.place}</p> : null}

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-700">Neighborhood</span>
            <select
              className={
                'w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ' +
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

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-700">Start</span>
              <input
                type="datetime-local"
                className={
                  'w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ' +
                  (errors.startsAt ? 'border-red-400' : 'border-slate-300')
                }
                value={values.startsAt}
                onChange={(e) => update('startsAt', e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-700">End</span>
              <input
                type="datetime-local"
                className={
                  'w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ' +
                  (errors.endsAt ? 'border-red-400' : 'border-slate-300')
                }
                value={values.endsAt}
                onChange={(e) => update('endsAt', e.target.value)}
              />
            </label>
          </div>
          {errors.startsAt ? <p className="text-sm text-red-600">{errors.startsAt}</p> : null}
          {errors.endsAt ? <p className="text-sm text-red-600">{errors.endsAt}</p> : null}

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-700">
              Best for ages <span className="text-slate-400">(optional)</span>
            </span>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              value={values.ageHint}
              onChange={(e) => update('ageHint', e.target.value)}
              placeholder="e.g. 2–5"
              autoComplete="off"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-700">
              Details <span className="text-slate-400">(optional)</span>
            </span>
            <textarea
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
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
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
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
import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useSessionContext } from '../components/SessionProvider'
import {
  addKid,
  addMembership,
  BIO_MAX_LENGTH,
  listNeighborhoods,
  MAX_KIDS_PER_PROFILE,
  updateBio,
  uploadAvatar,
  validateAvatarFile,
  validateKid,
} from '../lib/db'
import { resolveOnboardingRedirect } from '../lib/onboarding'
import type { Neighborhood } from '../lib/types'

/**
 * /onboarding — post-signup onboarding (slice 2): the neighborhood picker
 * (required, >= 1) + the V2 ticket-02 optional completion section
 * (photo + bio + kids).
 *
 * V2 slice 2 (ticket 02): the completion step is OPTIONAL — everything
 * below the picker may be skipped, and a parent who skips gets the
 * persistent nudge banner on /profile until photo + bio + kids are all
 * present. One Continue button saves the whole page (neighborhoods always;
 * photo/bio/kids only what was entered) and lands on the feed.
 *
 * Mobile-first multi-select of the seeded Seattle neighborhoods; >= 1
 * required (Continue stays disabled until one is selected). Each selection
 * is written via addMembership, then the shared session state is refreshed
 * before leaving so the shell's gate sees the new memberships.
 */
export function OnboardingPage() {
  const navigate = useNavigate()
  const { session, loading, hasMemberships, refresh } = useSessionContext()

  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The optional completion items (V2 ticket 02).
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [bio, setBio] = useState('')
  const [bioError, setBioError] = useState<string | null>(null)
  const [kidRows, setKidRows] = useState<Array<{ name: string; age: string }>>([])
  const [kidsError, setKidsError] = useState<string | null>(null)

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

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    )
  }

  // Self-contained guard: users who already have memberships (or are signed
  // out) are bounced — the shell applies the same gate one level up.
  const redirect = resolveOnboardingRedirect(session !== null, hasMemberships)
  if (redirect !== null) return <Navigate to={redirect} replace />

  function toggleNeighborhood(neighborhoodId: string) {
    setError(null)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(neighborhoodId)) next.delete(neighborhoodId)
      else next.add(neighborhoodId)
      return next
    })
  }

  // The avatar upload (V2 ticket 02): validated + resized client-side,
  // stored at avatars/<uid>/avatar. A failed upload (0011 not applied yet)
  // surfaces the error but never traps onboarding — the items are
  // optional, and the /profile nudge banner keeps the prompt alive.
  async function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    e.target.value = '' // allow re-picking the same file
    if (file === null || session === null) return
    const fileError = validateAvatarFile(file)
    if (fileError !== null) {
      setPhotoFile(null)
      setPhotoError(fileError)
      return
    }
    setPhotoFile(file)
    setPhotoError(null)
    setPhotoUploading(true)
    try {
      await uploadAvatar(session.user.id, file)
    } catch (err) {
      setPhotoFile(null)
      setPhotoError(
        err instanceof Error ? err.message : 'Could not upload the photo. You can add it later.',
      )
    } finally {
      setPhotoUploading(false)
    }
  }

  function addKidRow() {
    setKidsError(null)
    setKidRows((rows) => [...rows, { name: '', age: '' }])
  }

  function updateKidRow(index: number, patch: { name?: string; age?: string }) {
    setKidsError(null)
    setKidRows((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function removeKidRow(index: number) {
    setKidsError(null)
    setKidRows((rows) => rows.filter((_, i) => i !== index))
  }

  /** A filled-in kid row must validate (pure); blank rows are skipped. */
  function invalidKidRows(): Array<{ index: number; message: string }> {
    const bad: Array<{ index: number; message: string }> = []
    kidRows.forEach((row, index) => {
      if (row.name.trim() === '' && row.age.trim() === '') return
      const age = row.age.trim() === '' ? NaN : Number(row.age)
      const kidError = validateKid(row.name, age)
      if (kidError !== null) bad.push({ index, message: kidError })
    })
    return bad
  }

  async function handleContinue() {
    if (session === null || selected.size === 0 || saving) return
    const badKidRows = invalidKidRows()
    if (badKidRows.length > 0) {
      setKidsError(badKidRows.map((bad) => bad.message).join(' '))
      return
    }
    setSaving(true)
    setError(null)
    setBioError(null)
    setKidsError(null)
    try {
      for (const neighborhoodId of selected) {
        await addMembership(session.user.id, neighborhoodId)
      }
      // The optional items (V2 ticket 02): only what was actually entered.
      // A failure here never traps onboarding (the items are optional —
      // the /profile nudge banner keeps the prompt) — but it is surfaced.
      if (bio.trim() !== '') {
        try {
          await updateBio(session.user.id, bio)
        } catch (err) {
          setBioError(
            err instanceof Error
              ? `${err.message} You can add it later in your profile.`
              : 'Could not save your bio. You can add it later in your profile.',
          )
        }
      }
      const filledKidRows = kidRows.filter((row) => row.name.trim() !== '' || row.age.trim() !== '')
      for (const row of filledKidRows) {
        const age = Number(row.age)
        try {
          await addKid(session.user.id, row.name, age)
        } catch (err) {
          setKidsError(
            err instanceof Error
              ? `${err.message} You can add your kids later in your profile.`
              : 'Could not add your kids. You can add them later in your profile.',
          )
          break
        }
      }
      // Refresh the shared session state before leaving so the shell's
      // onboarding gate (and header) see the new memberships.
      await refresh()
      navigate('/', { replace: true })
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not save your neighborhoods. Try again.',
      )
    } finally {
      setSaving(false)
    }
  }

  if (loadError !== null) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Pick your neighborhoods</h1>
        <p className="text-sm text-red-600">{loadError}</p>
      </div>
    )
  }

  const kidsAtCap = kidRows.length >= MAX_KIDS_PER_PROFILE

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Pick your neighborhoods</h1>
        <p className="mt-1 text-sm text-slate-500">
          You’ll see drop-ins near where your kids hang out. Pick at least one — you can
          change these anytime in your profile.
        </p>
      </div>

      {neighborhoods === null ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          Loading neighborhoods…
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {neighborhoods.map((n) => {
            const isSelected = selected.has(n.id)
            return (
              <button
                key={n.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => toggleNeighborhood(n.id)}
                className={
                  'rounded-lg border px-3 py-2 text-left text-sm transition-colors ' +
                  (isSelected
                    ? 'border-indigo-600 bg-indigo-50 font-medium text-indigo-700'
                    : 'border-slate-300 bg-white text-slate-700')
                }
              >
                {n.name}
              </button>
            )
          })}
        </div>
      )}

      {/* V2 ticket 02: the optional completion step — photo + bio + kids
          (first name + age only, the privacy pin). Skipping is fine: the
          /profile nudge banner keeps prompting until all three are there. */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">
          Tell parents about your family <span className="font-normal text-slate-400">(optional)</span>
        </h2>

        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-slate-700">Photo</span>
            <label className="cursor-pointer self-start rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">
              {photoUploading ? 'Uploading…' : photoFile !== null ? 'Photo added' : 'Add a photo'}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={photoUploading}
                onChange={(e) => void handlePhotoChange(e)}
              />
            </label>
            {photoError !== null ? <p className="text-sm text-red-600">{photoError}</p> : null}
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-700">Bio</span>
            <textarea
              className={
                'w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ' +
                (bioError !== null ? 'border-red-400' : 'border-slate-300')
              }
              value={bio}
              onChange={(e) => {
                setBio(e.target.value)
                setBioError(null)
              }}
              placeholder="A few words about your family (optional)"
              maxLength={BIO_MAX_LENGTH}
              rows={2}
            />
            {bioError !== null ? <span className="text-sm text-red-600">{bioError}</span> : null}
          </label>

          <div className="flex flex-col gap-2 text-sm">
            <span className="text-slate-700">Kids (first name + age only)</span>
            {kidRows.length === 0 ? (
              <button
                type="button"
                onClick={() => addKidRow()}
                className="self-start rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200"
              >
                Add a kid
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                {kidRows.map((row, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                      value={row.name}
                      onChange={(e) => updateKidRow(index, { name: e.target.value })}
                      placeholder="First name"
                      maxLength={30}
                    />
                    <input
                      type="number"
                      min={0}
                      max={17}
                      className="w-20 shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                      value={row.age}
                      onChange={(e) => updateKidRow(index, { age: e.target.value })}
                      placeholder="Age"
                    />
                    <button
                      type="button"
                      onClick={() => removeKidRow(index)}
                      className="shrink-0 rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {kidsAtCap ? null : (
                  <button
                    type="button"
                    onClick={() => addKidRow()}
                    className="self-start rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200"
                  >
                    Add another kid
                  </button>
                )}
              </div>
            )}
            {kidsError !== null ? <p className="text-sm text-red-600">{kidsError}</p> : null}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={selected.size === 0 || saving || neighborhoods === null}
          onClick={() => void handleContinue()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : selected.size > 0 ? `Continue (${selected.size})` : 'Continue'}
        </button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    </div>
  )
}
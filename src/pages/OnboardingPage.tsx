import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useSessionContext } from '../components/SessionProvider'
import { addMembership, listNeighborhoods } from '../lib/db'
import { resolveOnboardingRedirect } from '../lib/onboarding'
import type { Neighborhood } from '../lib/types'

/**
 * /onboarding — post-signup neighborhood picker (slice 2). Mobile-first
 * multi-select of the seeded Seattle neighborhoods; ≥1 required (Continue
 * stays disabled until one is selected). Each selection is written via
 * addMembership, then the shared session state is refreshed before leaving
 * so the shell's gate sees the new memberships.
 */
export function OnboardingPage() {
  const navigate = useNavigate()
  const { session, loading, hasMemberships, refresh } = useSessionContext()

  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  async function handleContinue() {
    if (session === null || selected.size === 0) return
    setSaving(true)
    setError(null)
    try {
      for (const neighborhoodId of selected) {
        await addMembership(session.user.id, neighborhoodId)
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
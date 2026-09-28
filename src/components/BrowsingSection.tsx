import { useEffect, useState } from 'react'
import { getProfile, updateHomeZipRadius } from '../lib/db'
import { DEFAULT_RADIUS_MILES, RADIUS_MILES_OPTIONS, milesWord } from '../lib/feed'
import { settingsErrorMessage } from '../lib/settingsError'
import type { Profile } from '../lib/types'

type Loadable<T> =
  | { status: 'loading' }
  | { status: 'ready'; value: T }
  | { status: 'error'; message: string }

/**
 * The Near you section (V27).
 *
 * The radius was only editable from inside the browse modal or the feed's
 * location sheet — a parent who wanted "show me a wider area" had to know to
 * open a control that looked like a filter. This puts the SAVED discovery
 * radius where a parent goes looking for it, writing through the same
 * `updateHomeZipRadius` path (same validators, same DB columns), so there is
 * one source of truth and no second copy of the rule.
 *
 * The home ZIP stays read-only here on purpose: changing it needs an address →
 * coords geocode (the shared LocationModal already owns that), and a second
 * geocoding path in settings is how two controls drift. The ZIP is stated, and
 * the sentence points at the one place that changes it.
 */
export function BrowsingSection({ userId }: { userId: string }) {
  const [state, setState] = useState<Loadable<Profile>>({ status: 'loading' })
  const [savingMiles, setSavingMiles] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getProfile(userId)
      .then((profile) => {
        if (cancelled) return
        setState(
          profile === null
            ? { status: 'error', message: 'Your profile could not be found.' }
            : { status: 'ready', value: profile },
        )
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setState({
          status: 'error',
          message: settingsErrorMessage(err, "Couldn't load your area."),
        })
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  async function handleRadiusChange(miles: number) {
    if (state.status !== 'ready' || savingMiles !== null) return
    const zip = state.value.home_zip ?? ''
    if (zip === '') {
      setError('Set your home ZIP first — use the location control on your feed.')
      return
    }
    if (miles === (state.value.radius_miles ?? DEFAULT_RADIUS_MILES)) return
    setSavingMiles(miles)
    setError(null)
    setNotice(null)
    try {
      await updateHomeZipRadius(userId, zip, miles)
      setState((prev) =>
        prev.status === 'ready'
          ? { status: 'ready', value: { ...prev.value, radius_miles: miles } }
          : prev,
      )
      setNotice(`Showing drop-ins within ${miles} ${milesWord(miles)}.`)
    } catch (err) {
      setError(settingsErrorMessage(err, "Couldn't save your distance. Nothing changed."))
    } finally {
      setSavingMiles(null)
    }
  }

  if (state.status === 'loading') {
    return <p className="text-sm text-slate-600">Loading…</p>
  }
  if (state.status === 'error') {
    return (
      <p className="text-sm text-slate-600" data-testid="browsing-error">
        {state.message}
      </p>
    )
  }

  const radius = state.value.radius_miles ?? DEFAULT_RADIUS_MILES
  const zip = state.value.home_zip ?? ''

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="settings-radius" className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-800">How far to look</span>
        <span className="text-xs text-slate-500">
          Drop-ins from families within this distance of your home ZIP show in your feed.
        </span>
      </label>
      <select
        id="settings-radius"
        data-testid="settings-radius"
        className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-800 disabled:opacity-50"
        value={radius}
        disabled={savingMiles !== null}
        onChange={(event) => void handleRadiusChange(Number(event.target.value))}
      >
        {RADIUS_MILES_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option} {milesWord(option)}
          </option>
        ))}
      </select>

      <p className="text-sm text-slate-600">
        {zip === ''
          ? 'Your home ZIP is not set yet.'
          : `Your home ZIP is ${zip}. Other parents see distance, not the ZIP.`}
      </p>
      <p className="text-xs text-slate-500">
        To change your home ZIP, use the location control at the top of your feed.
      </p>

      {notice === null ? null : (
        <p className="text-sm text-slate-600" data-testid="browsing-notice" role="status">
          {notice}
        </p>
      )}
      {error === null ? null : (
        <p className="text-sm text-red-600" data-testid="browsing-save-error">
          {error}
        </p>
      )}
    </div>
  )
}

import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { DropInMark } from '../components/DropInMark'
import { useSessionContext } from '../components/SessionProvider'
import { LOGIN_PATH } from '../lib/auth'
import { setNewPassword } from '../lib/db'
import { validateNewPassword } from '../lib/passwordReset'
import { errorId, fieldA11y } from '../lib/a11y'

/**
 * /reset-password — the screen the emailed link lands on (V5 beta readiness).
 *
 * It sits OUTSIDE the app shell (a sibling of /login) on purpose: the recovery
 * token arrives in the URL fragment, supabase-js exchanges it for a session,
 * and there is a window where the user is neither signed out nor signed in.
 * The shell's gate would bounce that window to /login and swallow the token, so
 * this page owns its own three states instead:
 *
 *   - still loading the session  → "Checking your link…"
 *   - settled, no session        → the link is expired/used → back to sign in
 *   - session present            → choose a new password
 */
export function ResetPasswordPage() {
  const { session, loading } = useSessionContext()
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const next = validateNewPassword(password, confirm)
    setErrors(next)
    if (next.password !== undefined || next.confirm !== undefined) return
    setBusy(true)
    setError(null)
    try {
      await setNewPassword(password)
      // The recovery session is a real session, so they are already signed in
      // — land them on the feed rather than making them type it again.
      navigate('/', { replace: true })
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not save the new password. Try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  const inputClasses =
    'w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200'

  return (
    <div className="pt-safe pb-safe mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 bg-slate-50 px-4">
      <div className="flex flex-col items-center gap-2 pb-2">
        <DropInMark className="h-14 w-14 text-indigo-600" />
        <p className="font-display text-2xl font-bold text-indigo-600">Drop In</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {loading ? (
          <p className="text-sm text-slate-600">Checking your link…</p>
        ) : session === null ? (
          <>
            <h1 className="text-xl font-semibold text-slate-900">This link didn’t work</h1>
            <p className="mt-1 text-sm text-slate-600">
              Reset links are good for one use and expire after an hour. Request a fresh one and
              open it on this device.
            </p>
            <Link
              to={LOGIN_PATH}
              className="mt-4 flex min-h-11 items-center text-sm font-medium text-indigo-600"
            >
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-slate-900">Choose a new password</h1>
            <p className="mt-1 text-sm text-slate-600">
              You’re signed in from the email link — set a password and you’re done.
            </p>

            <form className="mt-4 flex flex-col gap-3" onSubmit={(e) => void handleSubmit(e)}>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-700">New password</span>
                <input
                  className={inputClasses + (errors.password !== undefined ? ' border-red-400' : '')}
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setErrors((prev) => ({ ...prev, password: undefined }))
                  }}
                  placeholder="At least 6 characters"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  {...fieldA11y('password', errors.password ?? null)}
                />
                {errors.password !== undefined ? (
                  <span role="alert" id={errorId('password')} className="text-sm text-red-600">{errors.password}</span>
                ) : null}
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-700">Type it again</span>
                <input
                  className={inputClasses + (errors.confirm !== undefined ? ' border-red-400' : '')}
                  type="password"
                  value={confirm}
                  onChange={(e) => {
                    setConfirm(e.target.value)
                    setErrors((prev) => ({ ...prev, confirm: undefined }))
                  }}
                  placeholder="Same password"
                  required
                  autoComplete="new-password"
                  {...fieldA11y('confirm', errors.confirm ?? null)}
                />
                {errors.confirm !== undefined ? (
                  <span role="alert" id={errorId('confirm')} className="text-sm text-red-600">{errors.confirm}</span>
                ) : null}
              </label>

              {error ? <p role="alert" id={errorId('submit')} className="text-sm text-red-600">{error}</p> : null}

              <button
                type="submit"
                disabled={busy}
                className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
                {...fieldA11y('submit', error)}
              >
                {busy ? 'Saving…' : 'Save and continue'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { DropInMark } from '../components/DropInMark'
import { useSessionContext } from '../components/SessionProvider'
import { LOGIN_PATH, resolveAuthRedirect } from '../lib/auth'
import { createProfile, HandleTakenError, signOutUser, supabase } from '../lib/db'

/**
 * Login + signup. Signup collects display_name (the persistent public
 * handle) and creates the caller's profiles row after account creation.
 * A taken handle is surfaced inline on the display_name field: the user
 * stays on the page, fixes the name, and resubmits (the account and
 * session already exist, so the retry re-runs profile creation only).
 */
export function LoginPage() {
  const { session, loading } = useSessionContext()
  const navigate = useNavigate()

  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [displayNameError, setDisplayNameError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /**
   * True while an account created on this page is still missing its
   * profiles row (a taken handle). Keeps the "signed-in users bounce off
   * /login" guard from unmounting the form mid-retry.
   */
  const [awaitingProfile, setAwaitingProfile] = useState(false)

  // Signed-in users don't need the auth screen — unless we just signed them
  // up and the profile row still needs (re)creation on this page.
  if (!loading && session !== null && !awaitingProfile) {
    return <Navigate to={resolveAuthRedirect(LOGIN_PATH, true) ?? '/'} replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    setDisplayNameError(null)
    try {
      if (mode === 'login') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (signInError) throw signInError
        navigate('/', { replace: true })
        return
      }

      const name = displayName.trim()
      if (name.length === 0) throw new Error('Please enter a display name.')

      // Set before the awaits below so the bounce-off guard above can't
      // unmount the page while a session appears mid-signup.
      setAwaitingProfile(true)

      // First submit only: create the account. Retries after a taken
      // handle skip this — the account (and session) already exist.
      if (session === null) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        })
        if (signUpError) {
          setAwaitingProfile(false)
          throw signUpError
        }
        if (data.session === null) {
          // Defensive: if the project ever turns email confirmation on,
          // there is no session yet (it is OFF for V1 — see decisions log).
          setAwaitingProfile(false)
          setNotice('Account created. Check your email to confirm, then sign in.')
          return
        }
      }

      try {
        await createProfile(name)
      } catch (err) {
        if (err instanceof HandleTakenError) {
          // Stay on the page: the user fixes the name and resubmits.
          setDisplayNameError(`“${name}” is already taken — pick a different display name.`)
          return
        }
        setAwaitingProfile(false)
        throw err
      }
      setAwaitingProfile(false)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const inputClasses =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200'

  return (
    <div className="pt-safe pb-safe mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 bg-slate-50 px-4">
      {/* Brand moment: /login sits outside the app shell (no header), so the
          mark lives here — and it is the first thing a new parent sees. */}
      <div className="flex flex-col items-center gap-2 pb-2">
        <DropInMark className="h-14 w-14 text-indigo-600" />
        <p className="text-2xl font-bold text-indigo-600">Drop In</p>
        <p className="text-center text-sm text-slate-500">
          Drop-in playdates for Seattle families.
        </p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">
          {mode === 'login' ? 'Sign in' : 'Create your account'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {mode === 'login'
            ? 'Welcome back. Sign in to see drop-ins near you.'
            : 'Pick a display name — it’s your persistent public handle.'}
        </p>

        <form className="mt-4 flex flex-col gap-3" onSubmit={(e) => void handleSubmit(e)}>
          {mode === 'signup' ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-700">Display name</span>
              <input
                className={
                  inputClasses + (displayNameError !== null ? ' border-red-400' : '')
                }
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value)
                  setDisplayNameError(null)
                }}
                placeholder="e.g. Sam at Green Lake"
                required
                maxLength={40}
                autoComplete="nickname"
              />
              {displayNameError ? (
                <span className="text-sm text-red-600">{displayNameError}</span>
              ) : null}
            </label>
          ) : null}

          {mode === 'signup' && session !== null ? (
            <p className="text-sm text-slate-500">
              Your account is created — pick a different display name and continue.
            </p>
          ) : null}

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-700">Email</span>
            <input
              className={inputClasses}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-700">Password</span>
            <input
              className={inputClasses}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              required
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}

          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy
              ? 'Please wait…'
              : mode === 'login'
                ? 'Sign in'
                : 'Create account'}
          </button>
        </form>
      </div>

      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          className="py-3 text-indigo-600"
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login')
            setError(null)
            setNotice(null)
            setDisplayNameError(null)
          }}
        >
          {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}
        </button>
        {/* Signed-out visitors land here — a "Sign out" control would be
            nonsense on the sign-in screen (it was rendered unconditionally). */}
        {session !== null ? (
          <button
            type="button"
            className="py-3 text-slate-500"
            onClick={() => void signOutUser()}
          >
            Sign out
          </button>
        ) : null}
      </div>
    </div>
  )
}
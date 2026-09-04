import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { LOGIN_PATH, resolveAuthRedirect } from '../lib/auth'
import { createProfile, signOutUser, supabase, useSession } from '../lib/db'

/**
 * Login + signup. Signup collects display_name (the persistent public
 * handle) and creates the caller's profiles row after account creation.
 */
export function LoginPage() {
  const { session, loading } = useSession()
  const navigate = useNavigate()

  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Signed-in users don't need the auth screen.
  if (!loading && session !== null) {
    return <Navigate to={resolveAuthRedirect(LOGIN_PATH, true) ?? '/'} replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
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

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      })
      if (signUpError) throw signUpError

      if (data.session) {
        // Signed up and signed in → create the profiles row, then land on /.
        try {
          await createProfile(name)
        } catch {
          throw new Error(
            'You signed in, but creating your profile failed. Sign out and sign up again.',
          )
        }
        navigate('/', { replace: true })
      } else {
        // Email confirmation is on for this project: no session yet.
        setNotice('Account created. Check your email to confirm, then sign in.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const inputClasses =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200'

  return (
    <div className="flex flex-col gap-4">
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
                className={inputClasses}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Sam at Green Lake"
                required
                maxLength={40}
                autoComplete="nickname"
              />
            </label>
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
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
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
          className="text-indigo-600"
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login')
            setError(null)
            setNotice(null)
          }}
        >
          {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}
        </button>
        <button
          type="button"
          className="text-slate-500"
          onClick={() => void signOutUser()}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
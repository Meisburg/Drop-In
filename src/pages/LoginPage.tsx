import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { DropInMark } from '../components/DropInMark'
import { useSessionContext } from '../components/SessionProvider'
import {
  addressFieldError,
  composeDisplayName,
  displayNameFieldError,
} from '../lib/account'
import { LOGIN_PATH, resolveAuthRedirect } from '../lib/auth'
import {
  createProfile,
  HandleTakenError,
  sendPasswordReset,
  signInWithOAuthProvider,
  signOutUser,
  supabase,
  updateHomeZipRadius,
} from '../lib/db'
import { DEFAULT_RADIUS_MILES } from '../lib/feed'
import { zipFromAddressQuery } from '../lib/geocode'
import {
  RESET_REQUEST_NOTICE,
  resetRequestErrorMessage,
} from '../lib/passwordReset'
import { oauthErrorMessage, resolveOAuthProviders, type OAuthProvider } from '../lib/oauth'
import { errorId, fieldA11y } from '../lib/a11y'

/** Which social buttons this deployment shows (VITE_OAUTH_PROVIDERS; Google by default). */
const OAUTH_PROVIDERS = resolveOAuthProviders(import.meta.env.VITE_OAUTH_PROVIDERS)

/**
 * Login + signup.
 *
 * V20 t06 — SIGNUP ASKS FOR A PERSON, NOT A HANDLE. The form used to collect
 * one field, `display_name`, labelled "Display name" and explained as "your
 * persistent public handle". The founder's report on the live app:
 *
 *   *"when you create your account originally, it should ask not only for your
 *   name, your email and your password, but also your address so that it can
 *   automatically show you results close to you… and also on that Create an
 *   Account page, it shouldn't be your display name. It should say your first
 *   name and last name (2 fields) so that when people search for you in the
 *   Inbox if they want to message you it's really easy to find you."*
 *
 * So: FIRST NAME + LAST NAME (two fields, composed into the public handle by
 * `composeDisplayName`) and a required HOME ADDRESS. The address is what makes
 * the first thing a new parent sees already local — it geocodes (Nominatim,
 * the same seam the browse map's "Set location" uses) and writes `home_zip`,
 * which is exactly the value /onboarding's location step collects by hand.
 *
 * WHAT HAPPENS WHEN THE ADDRESS DOES NOT RESOLVE is the interesting half, and
 * it is deliberately non-blocking: the account IS created, and the parent is
 * sent to /onboarding's zip step with the generic notice telling them to add
 * their zip there. Blocking account creation on a third-party geocoder being
 * reachable — or on Nominatim recognising "Apt 3, 123 Main St" — would fail
 * closed on someone else's downtime, and the fallback path already exists and
 * is already required by the onboarding gate.
 *
 * A taken handle is still surfaced inline: the parent stays on the page, fixes
 * the name, and resubmits (the account and session already exist, so the retry
 * re-runs profile creation only).
 */
export function LoginPage() {
  const { session, loading, refresh } = useSessionContext()
  const navigate = useNavigate()

  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [signupAddress, setSignupAddress] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [addressError, setAddressError] = useState<string | null>(null)
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
    setNameError(null)
    setAddressError(null)
    try {
      // V5: request a reset link. The notice is deliberately neutral — the
      // endpoint answers the same way whether or not the address exists.
      if (mode === 'reset') {
        try {
          await sendPasswordReset(email)
        } catch (err) {
          throw new Error(
            resetRequestErrorMessage(
              err instanceof Error ? err.message : 'Could not send the link.',
            ),
          )
        }
        setNotice(RESET_REQUEST_NOTICE)
        return
      }

      if (mode === 'login') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (signInError) throw signInError
        navigate('/', { replace: true })
        return
      }

      // --- signup ---------------------------------------------------------
      // Both validations run BEFORE the account is created, so a missing name
      // or address never leaves a half-made account behind. (The handle's
      // AVAILABILITY is the one thing that can only be judged after creation —
      // that is the retry path below.)
      const nameProblem = displayNameFieldError(firstName, lastName)
      if (nameProblem !== null) {
        setNameError(nameProblem)
        return
      }
      const addressProblem = addressFieldError(signupAddress)
      if (addressProblem !== null) {
        setAddressError(addressProblem)
        return
      }
      const name = composeDisplayName(firstName, lastName)

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
          setNameError(`“${name}” is already taken — try adding a middle name or initial.`)
          return
        }
        setAwaitingProfile(false)
        throw err
      }

      /**
       * V20 t06: the ADDRESS becomes the home zip, so a brand-new parent lands
       * on a feed that is already about their neighbourhood instead of on
       * /onboarding's "set your location" wall.
       *
       * This runs AFTER the profile row exists — `updateHomeZipRadius` requires
       * it. A geocode failure is NOT an error the parent sees here: it means
       * the zip is still unset, the onboarding gate sends them to /onboarding,
       * and its own copy ("You'll see drop-ins near your home zip…") asks for
       * the zip by hand. That fallback is the whole reason this is allowed to
       * fail quietly, and it is why nothing below can block the account.
       */
      const zip = await zipFromAddressQuery(signupAddress)
      if (zip !== null) {
        try {
          await updateHomeZipRadius(session?.user.id ?? '', zip, DEFAULT_RADIUS_MILES)
        } catch {
          // 0045's CHECK or a pre-0012 project: the onboarding step remains the
          // path that tells the parent what to do. Never fatal here.
        }
      }

      // The shared session state fetched this user's profile BEFORE the row
      // existed (a brand-new account settles as "no profile"), so re-read it
      // now — otherwise the onboarding gate, and V4's handle step for
      // social users, would see a stale null and ask for a name twice.
      await refresh()
      setAwaitingProfile(false)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  /**
   * V4 slice 4: hand the browser to the provider. A provider that is not
   * enabled yet (the console setup in docs/social-login-setup.md) answers with
   * "Unsupported provider: provider is not enabled" — surfaced inline as a
   * sentence, never swallowed.
   */
  async function handleOAuth(provider: OAuthProvider) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await signInWithOAuthProvider(provider)
    } catch (err) {
      setError(
        oauthErrorMessage(
          provider,
          err instanceof Error ? err.message : 'Could not start sign-in.',
        ),
      )
    } finally {
      setBusy(false)
    }
  }

  const inputClasses =
    'w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200'

  return (
    <div className="pt-safe pb-safe mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 bg-slate-50 px-4">
      {/* Brand moment: /login sits outside the app shell (no header), so the
          mark lives here — and it is the first thing a new parent sees. */}
      <div className="flex flex-col items-center gap-2 pb-2">
        <DropInMark className="h-14 w-14 text-indigo-600" />
        <p className="font-display text-2xl font-bold text-indigo-600">Drop In</p>
        <p className="text-center text-sm text-slate-600">
          See what families are up to in your area!
        </p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">
          {mode === 'login'
            ? 'Sign in'
            : mode === 'signup'
              ? 'Create your account'
              : 'Reset your password'}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {mode === 'login'
            ? 'Welcome back. Sign in to see drop-ins near you.'
            : mode === 'signup'
              ? 'Your name is how other parents find you, and your address is how we know what is nearby.'
              : 'Enter your email and we’ll send a link to set a new password.'}
        </p>

        {/* V4 slice 4: social sign-in first — it is one tap, and it is what a
            parent arriving from a shared link will reach for. The email form
            stays below as the fallback that always works. Both are hidden in
            reset mode: the whole point there is one email field. */}
        {mode !== 'reset' ? (
          <>
            <div className="mt-4 flex flex-col gap-2">
              {OAUTH_PROVIDERS.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void handleOAuth(provider.id)}
                  className="flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 disabled:opacity-50"
                >
                  {provider.label}
                </button>
              ))}
            </div>

            <div className="my-4 flex items-center gap-3 text-xs text-slate-500">
              <span className="h-px flex-1 bg-slate-200" />
              or
              <span className="h-px flex-1 bg-slate-200" />
            </div>
          </>
        ) : null}

        <form
          className={`flex flex-col gap-3 ${mode === 'reset' ? 'mt-4' : ''}`}
          onSubmit={(e) => void handleSubmit(e)}
        >
          {/* V20 t06: FIRST NAME + LAST NAME, not one "Display name" box.
              The founder's reason is discoverability in the Inbox: parents
              search for each other by the name they know, and nobody knows
              which handle their friend chose. The two are composed into the
              public handle (`composeDisplayName`), which is still what every
              `@handle` in the app renders.

              `autoComplete` is the browser's own vocabulary — `given-name` and
              `family-name` are what let a phone autofill both halves from the
              contact card in one tap, which is the difference between a form a
              parent finishes and one they abandon. */}
          {mode === 'signup' ? (
            <div className="flex gap-2">
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                <span className="text-slate-700">First name</span>
                <input
                  className={
                    inputClasses + (nameError !== null ? ' border-red-400' : '')
                  }
                  value={firstName}
                  onChange={(e) => {
                    setFirstName(e.target.value)
                    setNameError(null)
                  }}
                  placeholder="Sam"
                  required
                  maxLength={40}
                  autoComplete="given-name"
                  {...fieldA11y('name', nameError)}
                />
              </label>
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                <span className="text-slate-700">Last name</span>
                <input
                  className={
                    inputClasses + (nameError !== null ? ' border-red-400' : '')
                  }
                  value={lastName}
                  onChange={(e) => {
                    setLastName(e.target.value)
                    setNameError(null)
                  }}
                  placeholder="Rivera"
                  maxLength={40}
                  autoComplete="family-name"
                  {...fieldA11y('name', nameError)}
                />
              </label>
            </div>
          ) : null}

          {mode === 'signup' && nameError !== null ? (
            <span role="alert" id={errorId('name')} className="text-sm text-red-600">{nameError}</span>
          ) : null}

          {mode === 'signup' ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-700">Home address</span>
              <input
                className={
                  inputClasses + (addressError !== null ? ' border-red-400' : '')
                }
                value={signupAddress}
                onChange={(e) => {
                  setSignupAddress(e.target.value)
                  setAddressError(null)
                }}
                placeholder="e.g. 7200 4th Ave NE, Seattle"
                required
                autoComplete="street-address"
                {...fieldA11y('address', addressError)}
              />
              {addressError !== null ? (
                <span role="alert" id={errorId('address')} className="text-sm text-red-600">{addressError}</span>
              ) : null}
              {/* Says what the address is FOR, because "why does a playdate app
                  want my address" is the reasonable question at this exact
                  point in the form. It is never shown to anyone: it resolves to
                  a zip and the zip is all that is stored. */}
              <span className="text-xs text-slate-500">
                Used to show drop-ins near you. Other parents never see it.
              </span>
            </label>
          ) : null}

          {mode === 'signup' && session !== null ? (
            <p className="text-sm text-slate-600">
              Your account is created — pick a different name and continue.
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
              {...fieldA11y('submit', error)}
            />
          </label>

          {mode !== 'reset' ? (
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
                {...fieldA11y('submit', error)}
              />
            </label>
          ) : null}

          {error ? <p role="alert" id={errorId('submit')} className="text-sm text-red-600">{error}</p> : null}
          {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}

          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy
              ? 'Please wait…'
              : mode === 'login'
                ? 'Sign in'
                : mode === 'signup'
                  ? 'Create account'
                  : 'Send reset link'}
          </button>

          {/* V5: the conventional place for it — next to the field it rescues. */}
          {mode === 'login' ? (
            <div className="flex justify-end">
              <button
                type="button"
                className="flex min-h-11 items-center text-sm text-slate-600"
                onClick={() => {
                  setMode('reset')
                  setError(null)
                  setNotice(null)
                  setNameError(null)
                  setAddressError(null)
                }}
              >
                Forgot password?
              </button>
            </div>
          ) : null}
        </form>
      </div>

      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          className="py-3 text-indigo-600"
          onClick={() => {
            setMode(mode === 'signup' ? 'login' : 'signup')
            setError(null)
            setNotice(null)
            setNameError(null)
            setAddressError(null)
          }}
        >
          {mode === 'login'
            ? 'New here? Create an account'
            : mode === 'signup'
              ? 'Already have an account? Sign in'
              : 'Back to sign in'}
        </button>
        {/* Signed-out visitors land here — a "Sign out" control would be
            nonsense on the sign-in screen (it was rendered unconditionally). */}
        {session !== null ? (
          <button
            type="button"
            className="py-3 text-slate-600"
            onClick={() => void signOutUser()}
          >
            Sign out
          </button>
        ) : null}
      </div>
    </div>
  )
}
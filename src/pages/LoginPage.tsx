import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { DropInMark } from '../components/DropInMark'
import { useSessionContext } from '../components/SessionProvider'
import { LOGIN_PATH, resolveAuthRedirect } from '../lib/auth'
import { ONBOARDING_PATH } from '../lib/onboarding'
import { progressLabel } from '../lib/firstRun'
import {
  sendPasswordReset,
  signInWithOAuthProvider,
  signOutUser,
  supabase,
} from '../lib/db'
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
 * V28 slice 3b — CARD 1 OF 4 IS THE ACCOUNT, NOT THE PERSON. Signup collects
 * EMAIL + PASSWORD ONLY (decision 4: account first), carries the first run's
 * "1 of 4" label, and sends the new parent to /onboarding — the name card
 * (card 2, V28 slice 3a) creates the profiles row with the same
 * displayNameFieldError / composeDisplayName / createProfile /
 * HandleTakenError seams this page used to run, and the location card
 * (card 4) sets the home zip.
 *
 * (V20 t06, since superseded here: the form collected FIRST NAME + LAST NAME
 * + a HOME ADDRESS, geocoded it, and wrote home_zip on this page. The name
 * and the location have both moved onto the first run's cards; the account
 * stays email + password.)
 *
 * A signed-in user still bounces off /login (resolveAuthRedirect), except
 * while this page's own signup is in flight — the `justSignedUp` guard
 * below keeps the fresh session from unmounting the page mid-handler and
 * sending the new parent to / instead of /onboarding.
 */
export function LoginPage() {
  const { session, loading } = useSessionContext()
  const navigate = useNavigate()

  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /**
   * True from the moment this page's own signup establishes the session, until
   * the navigate below unmounts the page. The shared session subscription
   * re-renders this component the moment the session exists; without the
   * guard, the bounce-off below would send the new parent to / (the pre-V28
   * default) instead of the first run at /onboarding.
   */
  const [justSignedUp, setJustSignedUp] = useState(false)

  // Signed-in users don't need the auth screen — unless THIS page just signed
  // them up (the bounce would steal the /onboarding navigation).
  if (!loading && session !== null && !justSignedUp) {
    return <Navigate to={resolveAuthRedirect(LOGIN_PATH, true) ?? '/'} replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
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
      // V28 slice 3b: the account is card 1 of 4 — email + password only.
      // This page creates NOTHING but the auth account: the name (and its
      // taken-handle retry) now lives on the name card at /onboarding, and
      // the location lives on the area card, so there is no profile row to
      // create and no zip to geocode here.
      //
      // Arm the guard BEFORE the session exists: the shared subscription
      // picks the session up the moment supabase-js establishes it, and the
      // bounce-off guard above must not fire in the same handler.
      setJustSignedUp(true)

      // First submit only: create the account. A signed-in caller (the
      // "signed out on /login" case) already has the account.
      //
      // The signUp response's session is what the shared state picks up;
      // this page never reads a user id off it (the profile row is created
      // by the name card, not here).
      if (session === null) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        })
        if (signUpError) {
          throw signUpError
        }
        if (data.session === null) {
          // Defensive: if the project ever turns email confirmation on,
          // there is no session yet (it is OFF for V1 — see decisions log).
          setJustSignedUp(false)
          setNotice('Account created. Check your email to confirm, then sign in.')
          return
        }
      }

      // The shared session state still holds the pre-signup read (no
      // profile); /onboarding's first card loads the profile itself, so
      // this page needs no refresh of its own.
      // V29 (2026-10-04): signup is NOT a notification trigger point. The ask
      // used to be armed here and spent on the first feed paint — an app the
      // parent had never seen work, on top of an empty feed. The two remaining
      // points are a created post and a saved "I'm going"; see
      // `PushPromptTrigger`. Nothing about the browser permission request
      // changes: it has always belonged to the card's own button click.
      // Card 1 of 4 is done: the first run continues at /onboarding (card 2,
      // the name card, creates the profiles row this account is missing).
      navigate(ONBOARDING_PATH, { replace: true })
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

  // Frontend-design pass: text-base (17px) so iOS never zoom-jumps the form
  // on focus; py-2.5 keeps the field height the controls already measured at.
  const inputClasses =
    'w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200'

  return (
    <div className="pt-safe pb-safe mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 bg-page px-4">
      {/* Brand moment: /login sits outside the app shell (no header), so the
          mark lives here — and it is the first thing a new parent sees.
          Frontend-design pass: the centered logo card was the same template
          chrome the feed pass de-carded, so the masthead is now a printed
          notice heading — mark and wordmark in one terracotta lockup, left
          aligned like every other masthead, with the promise as the quiet
          line under it. Same elements, noticeboard arrangement. */}
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-indigo-600">
          <DropInMark className="h-8 w-8" />
          <span className="font-display text-2xl font-bold">Drop In</span>
        </div>
        {/* V29 v29-8: this line has ONE job and the old one did not do it. "See
            what families are up to in your area!" promised something vague and
            implied knowledge of local activity the signed-out app cannot have.
            Five independent reviewers, reading this exact screen, could not say
            what a "drop-in" was or what they would do with the app. The line now
            names the noun, the payoff and the low commitment in a parent's
            words — and says nothing about activity it cannot see.

            It must stay ONE line at 390px: the page is a portrait-phone layout
            with a measured height budget (scripts/mobile-audit.mjs, v29-4).

            V30 (2026-10-05, founder decision, accepted over impeccable live on
            /login): the line named the noun, the payoff and the cost, but it
            sold the MECHANISM ("no RSVP, no planning") to a parent who has not
            yet been told there is anyone to do it with. It now leads with the
            people and the thing ("Playdates with other families") and lets the
            low commitment trail lighter ("just show up"). Shorter than the line
            it replaces (45 vs 49 characters), so the one-line budget is
            untouched; same 17px body slot, no new colour. */}
        <p className="text-sm text-slate-600">
          <span className="font-medium text-slate-800">Playdates with other families</span>
          {' — '}
          <span className="text-slate-500">just show up.</span>
        </p>
      </header>
      {/* De-carded: the form stands on the page like every other masthead in
          the app — display-face h1, quiet tagline, no box, no gradient, no
          shadow (the uniform card shadow was kit, per the design pass). */}
      <section className="flex flex-col gap-1">
        <h1 className="font-display text-xl font-semibold text-slate-900">
          {mode === 'login'
            ? 'Sign in'
            : mode === 'signup'
              ? 'Create your account'
              : 'Reset your password'}
        </h1>
        {/* V29 v29-8 gave the login branch "Sign in to see drop-ins near you."
            (before that: "Welcome back.", which presumed a returning visitor).
            V31 (2026-10-05, founder decision, accepted over impeccable live on
            /login): the v29 line was read as telling a parent WHY to sign in,
            when the h1 above it already says "Sign in" and the masthead tagline
            over it already says what the app is — the sentence restated both.
            The login branch now renders nothing and the heading hands straight
            to the sign-in control; the sign-up and reset branches keep their
            own lines, which do work the other two do not. */}
        <p className="text-sm text-slate-600">
          {mode === 'login'
            ? null
            : mode === 'signup'
              ? 'Just your email and password — your name and location come right after.'
              : 'Enter your email and we’ll send a link to set a new password.'}
        </p>

        {/* V28 slice 3b: the account is card 1 of the four-card first run. The
            label comes from the same pure source the /onboarding cards use
            (lib/firstRun's progressLabel — "1 of 4", pinned in its test), in
            the same small print FirstRunCard renders it in. */}
        {mode === 'signup' ? (
          <p className="text-xs font-medium text-slate-500">{progressLabel('account')}</p>
        ) : null}

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
                  className="flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-base font-medium text-slate-700 disabled:opacity-50"
                >
                  {provider.label}
                </button>
              ))}
            </div>

            {/* V29 v29-4: the vertical budget of a portrait phone is real — at
                390×664 (a 390-wide phone WITH browser chrome) the original
                my-5 + gap-6 pushed the create-account control 28px below the
                fold, and a centered auth page gives no hint that scrolling
                would reveal it. Trimmed here, measured by
                scripts/mobile-audit.mjs, and every tap target keeps its 44px. */}
            <div className="my-3 flex items-center gap-3 text-xs text-slate-500">
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
            className="min-h-11 rounded-xl bg-indigo-600 px-4 py-3 text-base font-medium text-white disabled:opacity-50"
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
                }}
              >
                Forgot password?
              </button>
            </div>
          ) : null}
        </form>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-base">
        <button
          type="button"
          className="py-3 text-indigo-600"
          onClick={() => {
            setMode(mode === 'signup' ? 'login' : 'signup')
            setError(null)
            setNotice(null)
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

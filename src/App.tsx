import { useEffect } from 'react'
import { BrowserRouter, Link, Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router'
import { SessionProvider, useSessionContext } from './components/SessionProvider'
import { signOutUser } from './lib/db'
import { canModerate } from './lib/moderation'
import {
  HOME_PATH,
  ONBOARDING_PATH,
  resolveOnboardingGate,
  resolveOnboardingRedirect,
  resolveProtectedRedirect,
} from './lib/onboarding'
import { BrowsePage } from './pages/BrowsePage'
import { FeedPage } from './pages/FeedPage'
import { LoginPage } from './pages/LoginPage'
import { ModPage } from './pages/ModPage'
import { NewPlaydatePage } from './pages/NewPlaydatePage'
import { OnboardingPage } from './pages/OnboardingPage'
import { PlaydateDetailPage } from './pages/PlaydateDetailPage'
import { ProfilePage } from './pages/ProfilePage'
import { UserPage } from './pages/UserPage'
import { PLAYDATE_RETURN_KEY, isPlaydateReturnTarget } from './lib/trust'
import type { DuplicatePrefill } from './lib/types'

/** The /mod route path (moderator tools, slice 5). */
const MOD_PATH = '/mod'

/**
 * All app routes (including /onboarding) require a session; a signed-in
 * user without a home zip is sent to /onboarding first (V2 slice 3: the
 * gate keys on home_zip — neighborhoods are display labels only) — but
 * only once the profile load has settled: while any load is in flight (the
 * cold-load race, ticket 06) the shell renders its loading state instead,
 * so a signed-in, zipped user cold-loading a route is never bounced
 * through /onboarding → / and loses the requested route. The gate decision
 * itself lives in lib/onboarding.ts (resolveOnboardingGate, unit-tested).
 *
 * V2 slice 5 (ticket 05): /playdate/:id is the ONE public route — a
 * signed-out visitor may open a drop-in's public surface (the page itself
 * renders it; resolveAuthRedirect allows the path, the onboarding bounce
 * is signed-in-only). The signed-out "I'm coming" flow stores a return
 * target in session storage before the /login hop; this shell applies it
 * only once the gate has settled ('pass' — after a new signup's
 * /onboarding step, never during the ticket-06 loading state).
 *
 * Two slice-5 gates sit on top: a banned user (profile.banned_at set) is
 * rendered the suspended screen instead of any route (no app access), and
 * /mod only renders for moderator-flagged profiles (the pure canModerate
 * guard, unit-tested; the reports RLS is the second wall).
 */
function ProtectedShell() {
  const { session, loading, profile, homeZipSet, suspended, profileLoading } =
    useSessionContext()
  const { pathname } = useLocation()

  // The onboarding-gate decision (ticket 06, V2 slice 3: keys on the home
  // zip, pure + unit-tested in lib/onboarding.ts): 'loading' while the
  // session/profile loads are in flight, 'onboard' only once settled AND
  // the user's home zip is unset, 'suspended' for a banned session (no app
  // access).
  const gate = resolveOnboardingGate({
    sessionLoading: loading,
    profileLoading,
    signedIn: session !== null,
    homeZipSet,
    suspended,
  })

  // V2 slice 5: the signed-out "I'm coming" return target (stored in
  // session storage BEFORE the /login hop by the public detail page; the
  // keys + validator live in lib/trust.ts). This effect only BOOKS THE
  // CLEANUP — it clears the one-shot key when the user lands on the target
  // (the Navigate below does the hop; clearing here, not there, keeps the
  // render pure and makes a re-render never re-apply).
  useEffect(() => {
    const stored = window.sessionStorage.getItem(PLAYDATE_RETURN_KEY)
    if (stored !== null && stored === pathname) {
      window.sessionStorage.removeItem(PLAYDATE_RETURN_KEY)
    }
  }, [pathname])

  // The banned-session gate (slice 5): useSession already signed the user
  // out. Render the suspended screen instead of any route — including the
  // signed-out redirect — so the ban stays visible (no app access).
  if (gate === 'suspended') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-slate-50 px-6 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Suspended</h1>
        <p className="text-sm text-slate-500">
          Your account was suspended by a moderator.
        </p>
        <Link to="/login" className="text-sm text-indigo-600">
          Sign in with a different account
        </Link>
      </div>
    )
  }

  // The loading state (ticket 06): the persisted session and/or the
  // profile + membership fetch is still in flight — render it, never
  // redirect mid-load.
  if (gate === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    )
  }

  // The /mod route guard (slice 5): only a loaded, moderator-flagged
  // profile reaches the mod tools. A null profile (DB not applied / fetch
  // failed) falls through to ModPage's own "can't verify" state.
  if (session !== null && pathname === MOD_PATH && profile !== null && !canModerate(profile)) {
    return <Navigate to={HOME_PATH} replace />
  }

  // V2 slice 5: apply the signed-out "I'm coming" return target — ONLY
  // once the gate has SETTLED ('pass'), so a new signup's /onboarding
  // step (the 'onboard' redirect) and the ticket-06 'loading' state are
  // never navigated past (the pinned decision: the return lands AFTER the
  // onboarding gate settles, with the ping still an explicit tap). The
  // target is validated (isPlaydateReturnTarget — a tampered value is
  // ignored, never navigated to); the effect above clears the one-shot
  // key on landing.
  const storedReturn = gate === 'pass' ? window.sessionStorage.getItem(PLAYDATE_RETURN_KEY) : null
  if (
    storedReturn !== null &&
    isPlaydateReturnTarget(storedReturn) &&
    storedReturn !== pathname
  ) {
    return <Navigate to={storedReturn} replace />
  }

  const signedIn = session !== null
  const redirect =
    pathname === ONBOARDING_PATH
      ? resolveOnboardingRedirect(signedIn, homeZipSet)
      : shellRedirect(signedIn, homeZipSet, pathname)
  if (redirect !== null) return <Navigate to={redirect} replace />

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <Link to="/" className="text-lg font-bold text-indigo-600">
            Playdate
          </Link>
          <div className="flex items-center gap-3">
            {profile ? (
              <Link
                to={`/u/${encodeURIComponent(profile.display_name)}`}
                className="max-w-32 truncate text-sm font-medium text-slate-700"
              >
                @{profile.display_name}
              </Link>
            ) : null}
            {session !== null ? (
              <button
                type="button"
                className="text-sm text-slate-500"
                onClick={() => void signOutUser()}
              >
                Sign out
              </button>
            ) : (
              // V2 slice 5: the only route a signed-out visitor renders is
              // the public detail page — a "Sign in" entry point instead of
              // a sign-out control.
              <Link to="/login" className="text-sm font-medium text-indigo-600">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main
        className={`mx-auto max-w-md px-4 py-4 ${session !== null ? 'pb-24' : 'pb-8'}`}
      >
        <Outlet />
      </main>

      {/* V2 slice 5: the bottom nav is app chrome — signed-out visitors
        (public detail page only) see the sign-up CTAs in the page instead. */}
      {session !== null ? (
        <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white">
          <div className="mx-auto flex max-w-md">
            <NavTab to="/" label="Today" />
            <NavTab to="/browse" label="Browse" />
            <NavTab to="/new" label="Post" />
            <NavTab to="/profile" label="Profile" />
          </div>
        </nav>
      ) : null}
    </div>
  )
}

/** A protected route bounces to its gate target unless it may render as-is. */
function shellRedirect(
  signedIn: boolean,
  homeZipSet: boolean,
  pathname: string,
): string | null {
  const target = resolveProtectedRedirect(signedIn, homeZipSet, pathname)
  return target === pathname ? null : target
}

/**
 * The /new route (V2 slice 1): surfaces the duplicate-prefill router state
 * (navigate('/new', { state: { duplicate } }) from a Duplicate action) as a
 * typed prop — the page itself stays router-state-agnostic.
 */
function NewRoute() {
  const { state } = useLocation()
  const duplicate = (state as { duplicate?: DuplicatePrefill } | null)?.duplicate ?? null
  return <NewPlaydatePage duplicate={duplicate} />
}

function NavTab({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className="flex-1 py-3 text-center text-sm font-medium text-slate-500 active:bg-indigo-50 active:text-indigo-600"
    >
      {label}
    </NavLink>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedShell />}>
            <Route path="/" element={<FeedPage />} />
            <Route path="/browse" element={<BrowsePage />} />
            <Route path="/playdate/:id" element={<PlaydateDetailPage />} />
            <Route path="/new" element={<NewRoute />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/u/:handle" element={<UserPage />} />
            <Route path="/mod" element={<ModPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SessionProvider>
    </BrowserRouter>
  )
}
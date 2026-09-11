import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { BrowserRouter, Link, Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router'
import { DropInMark } from './components/DropInMark'
import { SessionProvider, useSessionContext } from './components/SessionProvider'
import { SplashScreen } from './components/SplashScreen'
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
import { ResetPasswordPage } from './pages/ResetPasswordPage'
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
        <p className="text-sm text-slate-600">
          Your account was suspended by a moderator.
        </p>
        <Link to="/login" className="flex min-h-11 items-center text-sm text-indigo-600">
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
      <div className="flex min-h-dvh items-center justify-center text-sm text-slate-600">
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
      <header className="pt-safe sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-1">
          <Link
            to="/"
            className="flex min-h-11 items-center gap-2 text-lg font-bold text-indigo-600"
          >
            <DropInMark className="h-7 w-7" />
            Drop In
          </Link>
          <div className="flex min-w-0 items-center gap-3">
            {profile ? (
              <Link
                to={`/u/${encodeURIComponent(profile.display_name)}`}
                className="flex min-h-11 min-w-0 max-w-32 items-center truncate text-sm font-medium text-slate-700"
              >
                @{profile.display_name}
              </Link>
            ) : null}
            {session !== null ? (
              <button
                type="button"
                className="flex min-h-11 items-center text-sm text-slate-600"
                onClick={() => void signOutUser()}
              >
                Sign out
              </button>
            ) : (
              // V2 slice 5: the only route a signed-out visitor renders is
              // the public detail page — a "Sign in" entry point instead of
              // a sign-out control.
              <Link to="/login" className="flex min-h-11 items-center text-sm font-medium text-indigo-600">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main
        className={`mx-auto max-w-md px-4 py-4 ${
          session !== null
            ? 'pb-[calc(6rem+env(safe-area-inset-bottom))]'
            : 'pb-[calc(2rem+env(safe-area-inset-bottom))]'
        }`}
      >
        <Outlet />
      </main>

      {/* V2 slice 5: the bottom nav is app chrome — signed-out visitors
        (public detail page only) see the sign-up CTAs in the page instead. */}
      {session !== null ? (
        <nav className="pb-safe fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white">
          <div className="mx-auto flex max-w-md">
            <NavTab to="/" label="Nearby" icon={<NavIcon path={NAV_ICONS.nearby} />} />
            <NavTab to="/browse" label="Browse" icon={<NavIcon path={NAV_ICONS.browse} />} />
            <NavTab to="/new" label="Post" icon={<NavIcon path={NAV_ICONS.post} />} />
            <NavTab to="/profile" label="Profile" icon={<NavIcon path={NAV_ICONS.profile} />} />
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

/**
 * One bottom-nav destination (V6).
 *
 * Two fixes from the first phone feedback, both about discoverability:
 *  - icons above the labels, so the row reads as buttons rather than as words;
 *  - a real ACTIVE state. The old className used Tailwind's `active:` variant,
 *    which is the CSS :active (pressed) pseudo-class — it flashed on tap and
 *    then forgot, so the tab you were on was never marked. NavLink's own
 *    isActive is what we wanted all along.
 *
 * Labels drop to text-xs: with an icon carrying the shape, a 16px tab label
 * would just make the bar tall.
 */
function NavTab({
  to,
  label,
  icon,
}: {
  to: string
  label: string
  icon: ReactNode
}) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex min-h-14 flex-1 flex-col items-center justify-center gap-1 py-2 text-xs font-medium transition-colors ${
          isActive ? 'text-indigo-600' : 'text-slate-600'
        }`
      }
    >
      <span aria-hidden="true">{icon}</span>
      {label}
    </NavLink>
  )
}

/** Bottom-nav glyphs: 24px, stroked, currentColor — one visual family. */
function NavIcon({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  )
}

const NAV_ICONS = {
  nearby: 'M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  browse: 'M4 6h16 M4 12h16 M4 18h16',
  post: 'M12 5v14 M5 12h14',
  profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M5 20a7 7 0 0 1 14 0',
} as const

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        {/* V4 slice 3: the cold-start splash sits ABOVE the routes so it covers
            both the signed-out (login) and signed-in first paint. */}
        <SplashScreen />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {/* Password reset (V5): outside the shell like /login — the recovery
              token lands in the URL fragment and supabase-js needs a moment to
              turn it into a session; the shell's gate would bounce that window. */}
          <Route path="/reset-password" element={<ResetPasswordPage />} />
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
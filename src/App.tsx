import { BrowserRouter, Link, Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router'
import { SessionProvider, useSessionContext } from './components/SessionProvider'
import { signOutUser } from './lib/db'
import { canModerate } from './lib/moderation'
import { HOME_PATH, ONBOARDING_PATH, resolveOnboardingRedirect, resolveProtectedRedirect } from './lib/onboarding'
import { BrowsePage } from './pages/BrowsePage'
import { FeedPage } from './pages/FeedPage'
import { LoginPage } from './pages/LoginPage'
import { ModPage } from './pages/ModPage'
import { NewPlaydatePage } from './pages/NewPlaydatePage'
import { OnboardingPage } from './pages/OnboardingPage'
import { PlaydateDetailPage } from './pages/PlaydateDetailPage'
import { ProfilePage } from './pages/ProfilePage'
import { UserPage } from './pages/UserPage'

/** The /mod route path (moderator tools, slice 5). */
const MOD_PATH = '/mod'

/**
 * All app routes (including /onboarding) require a session; a signed-in
 * user with 0 neighborhood memberships is sent to /onboarding first. The
 * gate decision itself lives in lib/onboarding.ts (unit-tested).
 *
 * Two slice-5 gates sit on top: a banned user (profile.banned_at set) is
 * rendered the suspended screen instead of any route (no app access), and
 * /mod only renders for moderator-flagged profiles (the pure canModerate
 * guard, unit-tested; the reports RLS is the second wall).
 */
function ProtectedShell() {
  const { session, loading, profile, hasMemberships, suspended } = useSessionContext()
  const { pathname } = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    )
  }

  // The banned-session gate (slice 5): useSession already signed the user
  // out. Render the suspended screen instead of any route — including the
  // signed-out redirect — so the ban stays visible (no app access).
  if (suspended) {
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

  // The /mod route guard (slice 5): only a loaded, moderator-flagged
  // profile reaches the mod tools. A null profile (DB not applied / fetch
  // failed) falls through to ModPage's own "can't verify" state.
  if (session !== null && pathname === MOD_PATH && profile !== null && !canModerate(profile)) {
    return <Navigate to={HOME_PATH} replace />
  }

  const signedIn = session !== null
  const redirect =
    pathname === ONBOARDING_PATH
      ? resolveOnboardingRedirect(signedIn, hasMemberships)
      : shellRedirect(signedIn, hasMemberships, pathname)
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
            <button
              type="button"
              className="text-sm text-slate-500"
              onClick={() => void signOutUser()}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-4 pb-24">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-md">
          <NavTab to="/" label="Today" />
          <NavTab to="/browse" label="Browse" />
          <NavTab to="/new" label="Post" />
          <NavTab to="/profile" label="Profile" />
        </div>
      </nav>
    </div>
  )
}

/** A protected route bounces to its gate target unless it may render as-is. */
function shellRedirect(
  signedIn: boolean,
  hasMemberships: boolean,
  pathname: string,
): string | null {
  const target = resolveProtectedRedirect(signedIn, hasMemberships, pathname)
  return target === pathname ? null : target
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
            <Route path="/new" element={<NewPlaydatePage />} />
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
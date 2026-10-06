import { Suspense, lazy, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { BrowserRouter, Link, Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router'
import { subscribeAppLinks } from './lib/appLinks'
import { DropInMark } from './components/DropInMark'
import { NAV_ICONS, NAV_ICONS_FILLED } from './components/icons'
import { LightboxProvider } from './components/ImageLightbox'
import { InboxUnreadProvider, useInboxUnread } from './components/InboxUnreadProvider'
import { PostActionButton } from './components/PostActionButton'
import { PushOptInPrompt } from './components/PushOptInPrompt'
import { SessionProvider, useSessionContext } from './components/SessionProvider'
import { SplashScreen } from './components/SplashScreen'
import { listKids } from './lib/db'
import { nextUnfinishedCard } from './lib/firstRun'
import type { FirstRunCardId } from './lib/firstRun'
import { FIRST_RUN_NUDGE_COPY } from './lib/firstRunCopy'
import { canModerate } from './lib/moderation'
import { markFirstRunDismissed, readFirstRunDismissed } from './lib/firstRunTooltips'
import { armedPushTrigger, setInstallCaptureEnabled, startPushSubscriptionRepair, subscribePushArmed } from './lib/pushClient'
import { inboxThreadOpen, keyboardInset } from './lib/threadGeometry'
import type { Profile } from './lib/types'
import {
  HOME_PATH,
  ONBOARDING_PATH,
  resolveOnboardingGate,
  resolveOnboardingRedirect,
  resolveProtectedRedirect,
} from './lib/onboarding'
import { EditPlaydatePage } from './pages/EditPlaydatePage'
import { FeedPage } from './pages/FeedPage'
import { InboxPage } from './pages/InboxPage'
import { LegalPage } from './pages/LegalPage'
import { PRIVACY_POLICY, PRIVACY_PATH, TERMS_OF_USE, TERMS_PATH } from './lib/legal'
import { LoginPage } from './pages/LoginPage'
import { ModPage } from './pages/ModPage'
import { NewPlaydatePage } from './pages/NewPlaydatePage'
import { OnboardingPage } from './pages/OnboardingPage'
import { PlacePage } from './pages/PlacePage'
import { PlaceDetailsPage } from './pages/PlaceDetailsPage'
import { PlaydateDetailPage } from './pages/PlaydateDetailPage'
import { ProfilePage } from './pages/ProfilePage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { SettingsPage } from './pages/SettingsPage'
import { UserPage } from './pages/UserPage'
import { PLAYDATE_RETURN_KEY, isPlaydateReturnTarget, playdateDetailPathFromEditPath } from './lib/trust'
import type { DuplicatePrefill, PlacePrefill } from './lib/types'

/**
 * V22 slice 10: the /browse route is code-split. It is no longer a nav
 * destination (V21 t02 moved the directory into /new's "Where?" block) — it is
 * reachable by deep link only — so its page (and, through it, the places
 * directory + map chunks) load on demand instead of shipping in the entry.
 */
const LazyBrowsePage = lazy(() => import('./pages/BrowsePage'))

/** The /mod route path (moderator tools, slice 5). */
const MOD_PATH = '/mod'

/**
 * V28 slice 3c — the first-run resume nudge's dismissal, held per tab.
 *
 * "Stays dismissed for the session" (plan, slice 3c): a tab-lifetime
 * dismissal survives the parent bouncing back onto /onboarding and leaving
 * again, but a fresh tab (3a's reset semantics — session storage, not local
 * storage) shows the nudge again.
 *
 * r3-7: the dismissal is now the SHARED first-run dismissal fact. The key
 * and its read/write helpers live in `lib/firstRunTooltips.ts` (the name
 * in exactly one place), and the feed's first-run tooltips read and write
 * the same fact: the nudge owns unfinished runs, the tooltips own finished
 * ones, the two are mutually exclusive, and one stored fact covers both.
 * A locked-down browser degrades to "the surface shows", never a crash —
 * the helpers' own docblocks carry the defensive rule.
 */

/**
 * V28 slice 3c — the resume nudge: one dismissible line for a signed-in
 * parent whose first run is unfinished. The line renders ONLY when
 * nextUnfinishedCard (src/lib/firstRun.ts) returns a card — no card is
 * hard-coded here — so the moment the parent sets a home zip (the run's
 * completion clause, plan V28 item 1) it stands down for good without a
 * page reload.
 *
 * The line itself is GENERIC by design (fix round 1): it says "Finish
 * setting up" + a card-agnostic body and never names the card it points at.
 * V28 r2 slice 8a re-measured the two reasons given for that choice when it was
 * made, because a later slice had falsified both without touching this
 * paragraph: today the cards DO read FIRST_RUN_COPY (OnboardingPage renders the
 * name, kids and area cards from it — `FIRST_RUN_COPY.name/.kids/.area`), and
 * the kids and area cards DO exist (slices 4a/5), while the photo card slice 4b
 * added was deleted in r2 slice 1b with its picker re-homed onto the name card.
 * The generic line is KEPT anyway, and the reason is now the durable one: a
 * nudge that named a card would carry a claim that has to stay true as the run
 * changes, and this one cannot go stale. FIRST_RUN_NUDGE_COPY
 * (src/lib/firstRunCopy.ts) holds the words.
 *
 * Fact sourcing (the slice's decision (a)): hasName / hasZip come free off
 * the shell's session — the profiles row + homeZipSet (3a feeds
 * both, so the nudge needs no new fetch for them; a null profile row IS the
 * name card, because display_name is NOT NULL, so any row is a name). hasKids
 * is the one fact that is NOT free: the shell knows nothing about kids. No
 * cheap substitute saves it — nothing the shell already holds implies hasKids,
 * and a kids read that fails must not be read as "kids is missing", because
 * that is a GUESS of hasKids=false, exactly the silent guessing the brief
 * forbids. So: a lazy listKids read, and ONLY on
 * the routes where the nudge is already eligible (parent signed in, has a
 * profile, has no zip, is not on /onboarding, and the push prompt does not
 * own the slot). The read is best-effort: if it fails, the nudge hides
 * rather than name a card it cannot prove.
 *
 * Mutual exclusion (decision (b)): while a push prompt is ARMed the nudge
 * stands down. The armed trigger is a sessionStorage fact
 * (armPushPromptForAction, src/lib/pushClient.ts), readable via
 * armedPushTrigger() and observable via subscribePushArmed — the same seam
 * the prompt itself consumes, so no cross-component flag is invented. The
 * ask card renders only while its trigger is armed, so the nudge never
 * shares the feed with it.
 *
 * Mounted with the prompt's own seam (navRenders: signed in AND not the
 * first run, so a first run shows neither — plan V28 item 1). The dismissal
 * is announced through the sr-only live region, which exists from mount so a
 * screen reader picks up the change when the line stands down.
 */
function FirstRunNudge({
  session,
  profile,
  homeZipSet,
}: {
  session: Session | null
  profile: Profile | null
  homeZipSet: boolean
}) {
  const [dismissed, setDismissed] = useState(() =>
    typeof window === 'undefined' ? false : readFirstRunDismissed(window.sessionStorage),
  )
  const [pushArmed, setPushArmed] = useState(() => armedPushTrigger() !== null)
  useEffect(() => subscribePushArmed(() => setPushArmed(armedPushTrigger() !== null)), [])
  // The card nextUnfinishedCard will target — undefined means the lazy kids
  // read has not settled yet, and null means "no nudge" (the run is done, or
  // its facts could not be proved).
  const [card, setCard] = useState<FirstRunCardId | null | undefined>(undefined)

  useEffect(() => {
    if (session === null) {
      setCard(null)
      return
    }
    // No profiles row (a first-run parent who left before the name card, or a
    // failed profile read): the next card is the name card — a free fact, no
    // query needed.
    if (profile === null) {
      setCard('name')
      return
    }
    // The free facts say the run is done (a zip is set, and with a name the
    // completion clause holds): nothing to offer.
    if (homeZipSet) {
      setCard(null)
      return
    }
    // The parent has a name and no zip, so the run is unfinished and the
    // answer is kids/area — but only hasKids is unread, and it is not
    // free. One lazy read, cancelled if the facts change mid-flight.
    let cancelled = false
    listKids(session.user.id)
      .then((kids) => {
        if (cancelled) return
        setCard(
          nextUnfinishedCard({
            signedIn: true,
            hasName: true,
            hasKids: kids.length > 0,
            hasZip: false,
          }),
        )
      })
      .catch(() => {
        // Best-effort: an unreadable kids fact must not make the nudge claim
        // a card it cannot prove — hide it, never guess.
        if (!cancelled) setCard(null)
      })
    return () => {
      cancelled = true
    }
  }, [session, profile, homeZipSet])

  const show = card !== null && card !== undefined && !dismissed && !pushArmed && session !== null

  return (
    <>
      {/* The dismissal is announced here: the region exists from mount, so a
          screen reader hears the change when the line stands down. */}
      <div aria-live="polite" className="sr-only">
        {dismissed ? 'Setup reminder dismissed.' : ''}
      </div>
      {show ? (
        <div
          className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-slate-200 bg-white p-3"
          data-testid="first-run-nudge"
        >
          <p className="min-w-0 flex-1 text-sm text-slate-700">
            <span className="font-medium">{FIRST_RUN_NUDGE_COPY.title}</span>{' '}
            <span className="text-slate-600">{FIRST_RUN_NUDGE_COPY.body}</span>
          </p>
          <div className="flex items-center gap-2">
            <Link
              to={ONBOARDING_PATH}
              className="flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-indigo-700 underline outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              {FIRST_RUN_NUDGE_COPY.actionLabel}
            </Link>
            <button
              type="button"
              className="flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-slate-600 outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              onClick={() => {
                setDismissed(true)
                // The shared first-run dismissal fact (r3-7): the same key the
                // feed's tooltips write — one fact, one name (the module's
                // docblock there), both surfaces stood down for the tab.
                markFirstRunDismissed(window.sessionStorage)
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}

/**
 * The keyboard inset as state (inbox-messenger slice A).
 *
 * The DECISION — how many pixels an open keyboard covers — is the pure
 * `keyboardInset` in `lib/threadGeometry.ts`, tested there. This hook is only
 * the subscription: `window.visualViewport` is the one place a browser reports
 * the visible band, and it is reported by event, so the number has to live in
 * state. Inactive routes never subscribe (and never re-render): the effect
 * returns before it touches `visualViewport`.
 */
function useKeyboardInset(active: boolean): number {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    if (!active) return
    const viewport = window.visualViewport
    // A browser without visualViewport (or a sandbox that hides it) degrades to
    // "no keyboard", which is today's behaviour — never a crash.
    if (viewport === null || viewport === undefined) return
    const update = () => {
      setInset(keyboardInset(window.innerHeight, viewport.height, viewport.offsetTop))
    }
    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
    }
  }, [active])
  // Standing down REPORTS zero rather than writing it: the parent can leave the
  // thread with the keyboard up, and the last measured inset must not survive
  // onto the next route. Returning 0 keeps the effect free of a setState that
  // would only feed another render.
  return active ? inset : 0
}

/**
 * All app routes (including /onboarding) require a session; there is NO
 * location bounce (V28 slice 2b — the home-zip requirement moved off the
 * shell and onto the write paths, see
 * docs/adr/0001-home-zip-stops-being-a-gate.md). While any load is in
 * flight (the cold-load race, ticket 06) the shell renders its loading
 * state instead of a route. The gate decision itself lives in
 * lib/onboarding.ts (resolveOnboardingGate, unit-tested).
 *
 * V2 slice 5 (ticket 05): /playdate/:id is public — a signed-out visitor may
 * open a drop-in's public surface (the page itself renders it;
 * resolveAuthRedirect allows the path). ⚠️ IT IS NO LONGER THE ONLY ONE, and
 * this sentence said "the ONE public route" until 2026-10-05: V8 ticket 07
 * added /place/:id (`isPublicPlacePath` in lib/auth.ts), and the public/private
 * split is real at the TABLE level too — the live policies grant `anon` SELECT
 * on `places` (`places_select_public`) and NOT on `reviews`, `place_comments` or
 * `follows`, all of which are `{authenticated}`-only. So a signed-out place page
 * renders the place and must gate every social read in the component. The
 * signed-out "I'm coming" flow stores a return target in session storage before
 * the /login hop; this shell applies it only once the gate has settled ('pass' —
 * never during the ticket-06 loading state).
 *
 * Two slice-5 gates sit on top: a banned user (profile.banned_at set) is
 * rendered the suspended screen instead of any route (no app access), and
 * /mod only renders for moderator-flagged profiles (the pure canModerate
 * guard, unit-tested; the reports RLS is the second wall).
 *
 * V8 ticket 05 adds a third: /playdate/:id/edit is host-only, so a
 * signed-out visitor on that path is sent to the post's detail page (the
 * public surface) instead of /login, which the signed-out gate below would
 * otherwise pick for a non-public path.
 */
function ProtectedShell() {
  const { session, loading, profile, homeZipSet, suspended, profileLoading } =
    useSessionContext()
  // V27 slice 3: the Inbox tab's unread marker (see InboxUnreadProvider).
  const { unreadCount } = useInboxUnread()
  const { pathname, search } = useLocation()

  // inbox-messenger slice A: the ONE location that owns its own height is an
  // open conversation (/inbox?thread=… or ?dm=…). Both this shell and
  // InboxPage ask the SAME predicate (lib/threadGeometry.ts), each handing it
  // the params it already has, so the two can never disagree about which
  // location is a thread — a disagreement would render the thread into a
  // column with no height and look like a CSS bug rather than a drifted
  // condition.
  //
  // Every other route keeps the document scroll it has today; the classes
  // below are ADDED only when this is true.
  const searchParams = new URLSearchParams(search)
  const threadOwnsHeight = inboxThreadOpen({
    thread: searchParams.get('thread'),
    dm: searchParams.get('dm'),
  })

  // …and the phone half of the same geometry: the band an open software
  // keyboard covers. Zero at rest, and zero on every route that is not a
  // thread (the effect is not even subscribed there).
  const keyboardLift = useKeyboardInset(threadOwnsHeight)

  // The onboarding-gate decision (ticket 06, pure + unit-tested in
  // lib/onboarding.ts): 'loading' while the session/profile loads are in
  // flight (routes must not render mid-load), 'suspended' for a banned
  // session (no app access), 'pass' otherwise. V28 slice 2b dropped the
  // onboard decision — a settled signed-in parent passes whether or not
  // their home zip is set; the location requirement now lives at the write
  // paths (lib/homeZip.ts's hasHomeZip). V28 slice 6 (defect #19) re-keyed
  // resolveOnboardingRedirect on the /onboarding route itself: it no longer
  // keys on the zip (the finished parent's bounce to the feed is gone — the
  // run's own finish card is the ending); it takes only signedIn.
  const gate = resolveOnboardingGate({
    sessionLoading: loading,
    profileLoading,
    signedIn: session !== null,
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

  // V8 ticket 08 (fix round): the two things a signed-in session must do for
  // the push repair to be real rather than merely described.
  //   1. `startPushSubscriptionRepair()` — listen for the service worker's
  //      `push-subscription-changed` message AND re-register this device once on
  //      app open. Without it a subscription the browser rotated was never
  //      re-persisted: the sender kept posting to the dead endpoint, the push
  //      service answered 410, and the sender pruned the row — an opted-in
  //      parent silently stopped receiving pushes, with nothing in the app able
  //      to notice. (The old comments claimed this healed "on the next app
  //      open"; nothing except /profile ever ran it.)
  //   2. `setInstallCaptureEnabled(true)` — the ONLY install button lives behind
  //      auth, so only an authed session may suppress the browser's own
  //      `beforeinstallprompt` banner. A signed-out visitor on a public share
  //      link keeps the browser's affordance (see src/lib/pushClient.ts).
  useEffect(() => {
    const authed = session !== null
    setInstallCaptureEnabled(authed)
    if (!authed) return
    return startPushSubscriptionRepair()
  }, [session])

  // The banned-session gate (slice 5): useSession already signed the user
  // out. Render the suspended screen instead of any route — including the
  // signed-out redirect — so the ban stays visible (no app access).
  if (gate === 'suspended') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-page px-6 text-center">
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
  // V25 t12: `bg-page`, like the suspended branch above. This was the one
  // branch rendering a full screen with NO background of its own, and neither
  // <html> nor <body> declares one either (index.html ships only the fixed boot
  // splash), so a cold load that lingered here painted the UA canvas rather
  // than the app's page.
  if (gate === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-page text-sm text-slate-600">
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

  // V8 ticket 05: the post-edit route is host-only. A signed-out visitor
  // never reaches the form — they are sent to the post's own detail page
  // (the public surface they may already see), NOT to /login: the edit route
  // is an ACTION on a public post, so the post is the honest landing spot.
  // This sits with the /mod guard (before the shell's own redirect), so the
  // signed-out gate below never intercepts the edit path first. The page
  // itself carries the same guard for the non-host case (it needs the loaded
  // row to know who the host is).
  const editFallback = session === null ? playdateDetailPathFromEditPath(pathname) : null
  if (editFallback !== null) return <Navigate to={editFallback} replace />

  // V2 slice 5: apply the "I'm coming" return target — ONLY once the gate
  // has SETTLED ('pass'), so the ticket-06 'loading' state is never
  // navigated past (the pinned decision: the return lands AFTER the gate
  // settles, with the ping still an explicit tap). V28 slice 2b note:
  // 'pass' no longer implies a home zip (there is no onboard decision),
  // so this line ALSO fires for a signed-in no-zip parent who tapped
  // "I'm coming" — deliberate: it honours the explicit tap, and the
  // resume nudge (slice 3c) covers the rest. The target is validated
  // (isPlaydateReturnTarget — a tampered value is ignored, never navigated
  // to); the effect above clears the one-shot key on landing.
  const storedReturn = gate === 'pass' ? window.sessionStorage.getItem(PLAYDATE_RETURN_KEY) : null
  if (
    storedReturn !== null &&
    isPlaydateReturnTarget(storedReturn) &&
    storedReturn !== pathname
  ) {
    return <Navigate to={storedReturn} replace />
  }

  const signedIn = session !== null
  // V28 slice 3a (decision 16): the first run renders BARE — no header,
  // no rail / bottom nav, no push prompt. The `pathname === ONBOARDING_PATH`
  // comparison that used to sit inline in the redirect branch below now
  // lives here as a constant, read by BOTH consumers, so there is still
  // exactly one comparison. The seam is shaped so slice 3b's resume nudge
  // hangs off the same constant (on the first run it — and the interview
  // cards — are all that ever shows).
  const isFirstRun = pathname === ONBOARDING_PATH
  // V28 slice 3a: whether the rail / bottom nav ACTUALLY renders — signed-in
  // and not the first-run route. The grid below and <main>'s bottom padding
  // derive from THIS, not from `session`: on /onboarding the session IS
  // non-null, and keeping the two-column grid after suppressing the rail
  // leaves column 1 EMPTY — the exact collapse the V22 slice 9 FIX
  // documents just above (72px <main> on a 1024px viewport). One
  // condition, used in all three places; the first run gets the
  // no-rail padding instead of 6rem of nothing.
  const navRenders = signedIn && !isFirstRun
  const redirect =
    isFirstRun ? resolveOnboardingRedirect(signedIn) : shellRedirect(signedIn, pathname)
  if (redirect !== null) return <Navigate to={redirect} replace />

  return (
    // inbox-messenger slice A: `h-dvh overflow-hidden` ONLY while a thread is
    // open — that is what turns "the document is the scroller" into "the thread
    // column is". With no thread open the class list is byte-for-byte what it
    // has always been (`min-h-dvh`), so every other route's scroll model is
    // untouched.
    <div
      className={`${
        threadOwnsHeight ? 'flex h-dvh flex-col overflow-hidden' : 'min-h-dvh'
      } bg-page text-slate-900`}
    >
      {/* V22 slice 9: the shell is a single column below md (the phone layout,
          pixel-equivalent to before) and a two-column grid at md+ — a left nav
          rail beside the content. The header spans both columns; the rail is
          sticky so it stays in view while the content scrolls. */}
      {/* V22 slice 9 FIX: the two-column grid is only correct when there IS a
          rail to put in column 1. Applying `md:grid-cols-[4.5rem_...]`
          unconditionally left column 1 EMPTY on the public surfaces
          (/playdate/:id, /login, /reset-password) — and `minmax(0,1fr)` then
          gave the content a 1fr of the LEFTOVER width, collapsing <main> to
          72px on a 1024px viewport. The public detail page is the app's share
          surface, so that was the worst possible place to break.
          The column definition is now conditional on whether the rail renders
          (`navRenders` — signed-in AND not the first run: V28 slice 3a keeps
          /onboarding's bare render single-column, so its card is never an
          orphaned 1fr beside an empty column): signed-out pages keep a
          single full-width column at every size, which is also what they
          had before this slice. */}
      <div
        className={`flex flex-col md:items-start ${
          navRenders ? 'md:grid md:grid-cols-[4.5rem_minmax(0,1fr)]' : 'md:grid'
        }${
          // inbox-messenger slice A, the OTHER half of the route's height: the
          // shell column becomes the flex parent of <main> so main can be the
          // thing that fills it (`min-h-0 flex-1`). At md the grid rows are made
          // explicit — `[auto_minmax(0,1fr)]` — because with the default
          // `align-content: stretch` two IMPLICIT auto rows would split the free
          // space equally and stretch the sticky header into a band; and
          // `items-stretch` replaces the base `items-start` so <main> takes the
          // whole 1fr row (the rail beside it keeps its own explicit
          // `md:h-[calc(100dvh-4rem)]`, so its geometry does not move).
          threadOwnsHeight
            ? ' min-h-0 flex-1 md:grid-rows-[auto_minmax(0,1fr)] md:items-stretch'
            : ''
        }`}
      >
        {/* V28 slice 3a (decision 16): the first run renders bare — no header. */}
        {!isFirstRun ? (
          <header className="pt-safe sticky top-0 z-10 border-b border-slate-200 bg-white md:col-span-2">
            <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-1 md:max-w-none">
              <Link
                to="/"
                className="font-display flex min-h-11 items-center gap-2 text-lg font-bold text-indigo-600"
              >
                <DropInMark className="h-7 w-7" />
                Drop In
              </Link>
              <div className="flex min-w-0 items-center gap-3">
                {/* V11 ticket 06: the settings entry point — a gear to the
                    family's editor. Signed-in only (the route is auth-gated by
                    the shell). V29 v29-10: the sign-out button that sat beside
                    it is GONE — a permanent one-tap control in the header of
                    every screen, no confirmation, with a password reset as the
                    cost of a mis-tap. Sign out lives in Settings → Account now
                    (components/AccountSection.tsx). */}
                {session !== null ? (
                  <Link
                    to="/settings"
                    className="flex min-h-11 min-w-11 items-center justify-center text-slate-600"
                    aria-label="Settings"
                  >
                    <NavIcon path={NAV_ICONS.gear} />
                  </Link>
                ) : null}
                {session === null ? (
                  // V2 slice 5: the only route a signed-out visitor renders is
                  // the public detail page — a "Sign in" entry point instead of
                  // a sign-out control. (V29 v29-10 removed the sign-out control
                  // from the header; `ocr` noted this branch read backwards as
                  // `session !== null ? null : …`, so it now leads with the
                  // rendered element like every other conditional in this file.)
                  <Link to="/login" className="flex min-h-11 items-center text-sm font-medium text-indigo-600">
                    Sign in
                  </Link>
                ) : null}
              </div>
            </div>
          </header>
        ) : null}

        {/* V2 slice 5: the bottom nav is app chrome — signed-out visitors
          (public detail page only) see the sign-up CTAs in the page instead.
          At md+ the same four destinations move into a LEFT RAIL (a vertical
          <nav>, sticky under the full-width header); below md it stays the
          fixed bottom bar, byte for byte. V28 slice 3a: it renders for
          `navRenders` (signed-in AND not the first run) — /onboarding
          renders the interview bare. */}
        {navRenders ? (
          <nav
            aria-label="Primary"
            className="pb-safe fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white md:sticky md:top-16 md:z-0 md:h-[calc(100dvh-4rem)] md:border-r md:border-slate-200 md:border-t-0"
          >
            <div className="mx-auto flex max-w-md flex-row md:flex-col">
              <NavTab to="/" label="Drop Ins" testId="nav-tab-drop-ins" icon={<NavIcon path={NAV_ICONS.nearby} />} filledIcon={<NavIcon path={NAV_ICONS_FILLED.nearby} filled />} />
              {/* V14 ticket 01: the inbox — parent↔parent messaging, scoped to
                  the drop-ins both parties are going to (host ↔ pinger). */}
              <NavTab to="/inbox" label="Inbox" testId="nav-tab-inbox" badge={unreadCount} icon={<NavIcon path={NAV_ICONS.inbox} />} filledIcon={<NavIcon path={NAV_ICONS_FILLED.inbox} filled />} />
              {/* V24 slice 05: the Post action returns to the nav's CENTRE as a
                  raised circular "+" (PostActionButton) — an ACTION, not a fifth
                  NavTab destination. This is a DELIBERATE REVERSAL of V22 slice
                  12 (which removed the Post tab citing Apple HIG: "a tab bar
                  supports navigation, not actions"). The founder overrode that
                  ruling on 2026-09-25 after using the app on a phone ("maybe we
                  put it dead center in the middle of the menu bar at the bottom
                  again between inbox and places as this cool post button"), and
                  agreed the HIG deviation is recorded here as a ruling. Do NOT
                  "fix" the nav back to the V22 shape from the old rationale —
                  the override stands. */}
              <PostActionButton />
              <NavTab to="/browse" label="Places" testId="nav-tab-places" icon={<NavIcon path={NAV_ICONS.browse} />} filledIcon={<NavIcon path={NAV_ICONS_FILLED.browse} filled />} />
              <NavTab to="/profile" label="Profile" testId="nav-tab-profile" icon={<NavIcon path={NAV_ICONS.profile} />} filledIcon={<NavIcon path={NAV_ICONS_FILLED.profile} filled />} />
            </div>
          </nav>
        ) : null}

        <main
          className={`w-full px-4 py-4 ${
            navRenders
              ? 'pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-[calc(2rem+env(safe-area-inset-bottom))]'
              : 'pb-[calc(2rem+env(safe-area-inset-bottom))]'
          }${
            // inbox-messenger slice A: while a thread is open, <main> stops
            // being a tall block in a scrolling document and becomes the flex
            // column that CONTAINS the conversation's height — the route's
            // owning half. `overflow-clip` (not `overflow-hidden`) is the load-
            // bearing choice: hidden would leave main a scroll container that
            // the thread's own `scrollIntoView` could scroll from underneath the
            // pinned header, while `clip` cannot be scrolled programmatically at
            // all. The page's scroll region is then the only scroller on screen.
            threadOwnsHeight ? ' flex min-h-0 flex-1 flex-col overflow-clip' : ''
          }`}
          // inbox-messenger slice A: an OPEN software keyboard covers the bottom
          // of the layout viewport, which `dvh` cannot see on iOS (only the
          // VISUAL viewport shrinks). When one is up, the composer clears it
          // instead of the bottom nav — which is behind that keyboard anyway —
          // and keeps a half-rem's gap plus the home-indicator inset.
          style={
            keyboardLift > 0
              ? { paddingBottom: `calc(${keyboardLift}px + 0.5rem + env(safe-area-inset-bottom))` }
              : undefined
          }
        >
          {/* V8 ticket 08: the notification opt-in, mounted once for the whole
              authed shell. It renders nothing unless a meaningful action was
              just recorded in this tab (a post created, or a ping saved) — see
              src/components/PushOptInPrompt.tsx. Signed-out visitors never see
              it, and /profile owns its own copy of the control. V28 slice 3a:
              suppressed on /onboarding by the SAME route condition (decision
              10's mechanism — no second flag). */}
          {navRenders ? <PushOptInPrompt /> : null}
          {/* V28 slice 3c: the resume nudge — the same seam (signed in AND
              past the first run, so the first run shows neither), standing
              down for the rest of the session while a push prompt is armed
              (its own mutual-exclusion decision, inside the component). */}
          {navRenders ? (
            <FirstRunNudge session={session} profile={profile} homeZipSet={homeZipSet} />
          ) : null}
          <div
            className={`mx-auto max-w-md md:max-w-3xl${
              // inbox-messenger slice A: the last link in the chain — the
              // route's own column fills this, so the header can pin, the
              // message list can be the only scroller, and the composer can sit
              // at the bottom of the viewport instead of the bottom of the
              // thread.
              threadOwnsHeight ? ' flex min-h-0 w-full flex-1 flex-col' : ''
            }`}
          >
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

/** A protected route bounces to its gate target unless it may render as-is. */
function shellRedirect(
  signedIn: boolean,
  pathname: string,
): string | null {
  const target = resolveProtectedRedirect(signedIn, pathname)
  return target === pathname ? null : target
}

/**
 * The /new route (V2 slice 1): surfaces the duplicate-prefill router state
 * (navigate('/new', { state: { duplicate } }) from a Duplicate action) as a
 * typed prop — the page itself stays router-state-agnostic.
 *
 * V8 ticket 07 adds a second, INDEPENDENT piece of router state: the place
 * prefill, sent by a place page's "Start a drop-in here"
 * (navigate('/new', { state: { place } })). Two keys rather than one merged
 * object, because they come from different screens and mean different things:
 * a duplicate says "the same plan again", a place prefill says "this place".
 * The page resolves the precedence (the place wins).
 *
 * V12 ticket 04: the route also keys the page on the prefill source (see
 * `prefillKey` below) — a prefill that lands on an already-mounted /new
 * (the Duplicate tap's kids fetch in flight) must remount, not just update
 * the props.
 */
function NewRoute() {
  const { state } = useLocation()
  const routerState = state as { duplicate?: DuplicatePrefill; place?: PlacePrefill } | null
  const duplicate = routerState?.duplicate ?? null
  const placePrefill = routerState?.place ?? null
  /**
   * V12 ticket 04: a prefill source IS the mount's identity. The Duplicate
   * tap is async — the detail page fetches the post's linked kids BEFORE
   * navigating (db.listPlaydateKidIds, best-effort) — so the parent can land
   * on /new WITHOUT the prefill first (a tap on the Post tab while that fetch
   * is in flight), and the prefill navigation then arrives at an
   * ALREADY-MOUNTED page. The page's useState initializers run once per
   * mount, so without a key change the form would open at its defaults while
   * the prop-driven banner already promises the prefill (e2e/post-again.e2e.ts
   * caught exactly this). One key per prefill source: a new source remounts
   * and re-runs every initializer; the SAME source arriving again is a
   * no-op (the prefill is already applied — idempotent).
   */
  const prefillKey =
    duplicate !== null
      ? `duplicate-${duplicate.startsAt}-${duplicate.title}`
      : placePrefill !== null
        ? `place-${placePrefill.placeId}`
        : 'new'
  return (
    <NewPlaydatePage
      key={prefillKey}
      duplicate={duplicate}
      placePrefill={placePrefill}
    />
  )
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
 *
 * V22 slice 9: the SAME component renders in two arrangements. Below md it is
 * the horizontal bottom-bar tab (flex-1 across the 448px column); at md+ the
 * parent <nav> becomes a left rail and this tab stacks vertically (md:flex-col),
 * filling the 72px rail width with its 56px min-height target intact. The active
 * state logic is unchanged — only the arrangement changes.
 */
function NavTab({
  to,
  label,
  icon,
  filledIcon,
  badge,
  testId,
}: {
  to: string
  label: string
  icon: ReactNode
  /** V22 slice 12: the FILLED variant (NAV_ICONS_FILLED) — rendered when the tab
      is active, so "where you are" is a shape change, not a color change. */
  filledIcon?: ReactNode
  /**
   * V27 slice 3: an optional unread count. A marker renders ONLY when it is a
   * finite number > 0, and it is announced — the visible pill carries the
   * digits and the NavLink's `aria-label` says "Inbox, 3 unread", so the state
   * never depends on colour alone. Capped at "99+". `undefined` (the default)
   * leaves the tab exactly as it was.
   */
  badge?: number
  /**
   * r3-7: an optional testid on the tab itself — the first-run tooltips point
   * their steps at the real nav controls (`nav-tab-inbox` et al.). Omitted
   * means no attribute, so the tab is exactly as it was for every other
   * consumer.
   */
  testId?: string
}) {
  let badgeText: string | null = null
  let badgeLabel: string | undefined
  if (badge !== undefined && Number.isFinite(badge) && badge > 0) {
    badgeText = badge > 99 ? '99+' : String(badge)
    badgeLabel = `${label}, ${badge} unread`
  }
  return (
    <NavLink
      to={to}
      end={to === '/'}
      aria-label={badgeLabel}
      data-testid={testId}
      className={({ isActive }) =>
        `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 whitespace-nowrap px-1 py-1.5 text-xs transition-colors motion-reduce:transition-none ${
          isActive ? 'font-semibold text-indigo-600' : 'font-medium text-slate-600'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span aria-hidden="true" className="relative">
            {isActive && filledIcon !== undefined ? filledIcon : icon}
            {badgeText !== null ? (
              <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-xs font-semibold leading-none text-white">
                {badgeText}
              </span>
            ) : null}
          </span>
          {label}
        </>
      )}
    </NavLink>
  )
}

/** Bottom-nav glyphs: 24px, currentColor — one visual family. The nav's ACTIVE
 *  state uses the FILLED variants (NAV_ICONS_FILLED); `filled` switches the svg
 *  from stroke to fill rendering. In-content call sites (SectionHeader etc.)
 *  keep the stroked family and never pass `filled`. */
function NavIcon({ path, filled = false }: { path: string; filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={filled ? 0 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      clipRule={filled ? 'evenodd' : undefined}
      fillRule={filled ? 'evenodd' : undefined}
    >
      <path d={path} />
    </svg>
  )
}

/**
 * SLICE 3 — a SHARED https link (`https://drop-in-mu.vercel.app/playdate/<id>`)
 * opens the app on the screen it names, cold start included.
 *
 * ⚠️ NOT SLICE 2c. That is the custom scheme's OAuth return, subscribed by
 * /login (lib/db.ts's `subscribeNativeOAuthReturn`); this is a web link a parent
 * taps or shares, and `lib/appLinks.ts` explains at length why the two must not
 * be conflated — registering a second `appUrlOpen` listener is what would break
 * 2c's cold start, so the subscription there declines to register for a launch
 * that belongs to the OAuth return.
 *
 * A NAVIGATION, NOT A ROUTE: the link's path is handed to the router, which
 * already owns `/playdate/:id` (and its signed-out bounce) and whose `*`
 * catch-all sends anything unrecognised home — so a link to a stale or
 * hand-edited id lands on a real screen, never a blank one. The decision about
 * which URLs are ours lives in the pure `appLinkPath`; this component only
 * carries the answer to `<Navigate>`.
 *
 * The state setter is the subscription's callback because React guarantees it
 * is stable, so the effect runs ONCE — `useNavigate`'s function is rebuilt on
 * every route change (react-router's `useNavigateUnstable`), which would
 * resubscribe the native listener on every navigation.
 */
function AppLinks() {
  const [target, setTarget] = useState<string | null>(null)
  useEffect(() => subscribeAppLinks(setTarget), [])
  return target === null ? null : <Navigate to={target} />
}

export default function App() {
  return (
    <BrowserRouter>
      <AppLinks />
      <SessionProvider>
        {/* V27 slice 3: one shared unread total for the Inbox nav badge. Inside
            SessionProvider so it reads the shared session; the shell below
            consumes it via useInboxUnread. */}
        <InboxUnreadProvider>
        {/* V6: any photo in the app can open full-screen — the provider owns
            the single overlay instance (see components/ImageLightbox.tsx). */}
        <LightboxProvider>
        {/* V4 slice 3: the cold-start splash sits ABOVE the routes so it covers
            both the signed-out (login) and signed-in first paint. */}
        <SplashScreen />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {/* Password reset (V5): outside the shell like /login — the recovery
              token lands in the URL fragment and supabase-js needs a moment to
              turn it into a session; the shell's gate would bounce that window. */}
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          {/* Release checklist 1.6: the two legal documents are PUBLIC, outside
              the shell. Google wants the privacy-policy URL to work for anyone
              (including a reviewer with no account), and a parent deciding
              whether to sign up should be able to read it before handing over an
              email address. The paths come from lib/legal so the URL cannot
              drift from the copy. */}
          <Route path={PRIVACY_PATH} element={<LegalPage doc={PRIVACY_POLICY} />} />
          <Route path={TERMS_PATH} element={<LegalPage doc={TERMS_OF_USE} />} />
          <Route element={<ProtectedShell />}>
            <Route path="/" element={<FeedPage />} />
            {/* V14 ticket 01: the inbox — conversation list + inline thread
                view (?thread=<playdate_id>). Inside the shell (auth gate). */}
            <Route path="/inbox" element={<InboxPage />} />
            <Route
              path="/browse"
              element={
                /* V22 slice 10: the directory page is lazy (deep-link only);
                   the fallback keeps the shell painting immediately and nothing
                   shifts layout. V27: it mirrors the directory's list-first
                   shape (no visible page header — the search pill carries the
                   page's name), so the header does not flash in and vanish. */
                <Suspense
                  fallback={
                    <div className="flex flex-col gap-4">
                      <h1 className="sr-only">Places</h1>
                      <div
                        role="status"
                        aria-label="Loading places…"
                        className="flex h-64 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-slate-500 shadow-sm"
                      >
                        Loading places…
                      </div>
                    </div>
                  }
                >
                  <LazyBrowsePage />
                </Suspense>
              }
            />
            {/* V8 ticket 07: the place page. Inside the shell so it keeps the
                app chrome — ⚠️ AND IT IS PUBLICLY REACHABLE, which this comment
                denied until 2026-10-05: it used to say a signed-out visitor "is
                sent to /login like any other protected path", and that is not
                what the code does. `resolveAuthRedirect` allows the path signed
                out (`isPublicPlacePath`, lib/auth.ts, V8 ticket 07) and the live
                `places_select_public` policy serves the row to `anon`, so a
                signed-out visitor reads the place. What they CANNOT read is the
                social half: `reviews`, `place_comments` and `follows` are all
                `{authenticated}`-only at the policy level. So every social read
                on this page must be gated in the component (the reviews block
                shows a sign-in prompt and issues no read), and the map/details
                door is the same route either way. The real boundary is the
                TABLE policy, not the shell. */}
            <Route path="/place/:id" element={<PlacePage />} />
            {/* V23 slice 5: the place's RESEARCH page — what parents have said,
                who follows it, a web-search link, what is on there. A separate
                route from /place/:id rather than more blocks on it, because the
                decision page ("is this good for my kid, where is it, start a
                drop-in") must stay short. Both read the same `Place` row through
                the same seam, and `placeDetailsPath` is the ONE builder for the
                link between them. Inside the shell: the wall renders other
                parents' names and 0050 grants no anon SELECT. */}
            <Route path="/place/:id/details" element={<PlaceDetailsPage />} />
            <Route path="/playdate/:id" element={<PlaydateDetailPage />} />
            {/* V8 ticket 05: the host-only edit route — the detail page's own
                row, edited in place. Host-only at two levels: the shell guard
                above (signed-out) and the page's own host check. */}
            <Route path="/playdate/:id/edit" element={<EditPlaydatePage />} />
            <Route path="/new" element={<NewRoute />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            {/* V11 ticket 06: the family's editor, split off the read-only
                /profile (the header gear + /profile's "Edit profile" button
                reach it). Signed-in-only via the shell gate above.
                settings-restructure: /settings is the INDEX (six category
                rows) and /settings/<category> is ONE category's screen. The
                page owns which URL means which screen (`lib/settingsIndex.ts`),
                including the legacy-hash redirect (/settings#privacy →
                /settings/privacy), so both routes render the same component and
                an unknown segment lands back on the index, never on an empty
                screen. */}
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/:category" element={<SettingsPage />} />
            <Route path="/u/:handle" element={<UserPage />} />
            <Route path="/mod" element={<ModPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </LightboxProvider>
        </InboxUnreadProvider>
      </SessionProvider>
    </BrowserRouter>
  )
}

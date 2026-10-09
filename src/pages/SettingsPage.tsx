import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import { AccountSection } from '../components/AccountSection'
import { BackControl } from '../components/BackControl'
import { BrowsingSection } from '../components/BrowsingSection'
import { FollowingSection } from '../components/FollowingSection'
import { NAV_ICONS } from '../components/icons'
import { NotificationsSection } from '../components/NotificationsSection'
import { PrivacySection } from '../components/PrivacySection'
import { SectionHeader } from '../components/SectionHeader'
import { SettingsSection } from '../components/SettingsSection'
import { ThemeToggle } from '../components/ThemeToggle'
import { useSessionContext } from '../components/SessionProvider'
import {
  SETTINGS_CATEGORY_DESCRIPTIONS,
  SETTINGS_INDEX,
  SETTINGS_PANE_MEDIA_QUERY,
  resolveSettingsView,
  settingsCategoryPath,
  settingsRow,
  type SettingsCategoryId,
} from '../lib/settingsIndex'

/**
 * /settings — the signed-in family's app-wide settings, as an INDEX plus one
 * category at a time (settings-restructure slice).
 *
 * WHY IT LOOKS LIKE THIS. V27 shipped six `SettingsSection` blocks stacked in
 * one scroll, and the founder's report was *"really overwhelming … it just
 * seems like a hodgepodge of features"* with his own proposed fix: *"maybe it
 * should be like a left hand pain that has the different settings options. And
 * you pick one and then it populates like what's there."* So:
 *
 *   - **Below `md` (the phone): an index, then a screen.** `/settings` is the
 *     list of six categories; tapping one navigates to `/settings/<id>`, which
 *     renders ONLY that category's body plus a back control.
 *   - **At `md` and up: the same list as a left pane inside `<main>`**, beside
 *     the shell's nav rail, with the selected category's body in the right
 *     column. The shell's grid is untouched — this is a second grid INSIDE
 *     `<main>`, so the rail's geometry does not move.
 *
 * ⚠️ THAT SECOND COLUMN IS A PRODUCT DECISION, NOT A BREAKPOINT. `DESIGN.md`'s
 * One-Column Rule says a desktop layout with a second content column has to be
 * one; the founder asked for this one, and `docs/adr/0004` records the ask, the
 * rule it exceptions, and what survives (this is a NAVIGATION column; the body
 * keeps the phone measure; no other page gains a column from the precedent).
 *
 * THE RULES ARE NOT HERE. Which URL means which screen, and what a legacy hash
 * does, are pure functions in `src/lib/settingsIndex.ts` with a sibling test —
 * the six categories are a data table there, so the phone index and the desktop
 * pane cannot drift, and React only renders. The same module holds the ids that
 * are load-bearing (`/settings#privacy` is advertised copy and may be
 * bookmarked; the hash now REPLACES to `/settings/privacy` instead of scrolling).
 *
 * Sign-out lives in the Account category; account deletion is there too.
 */
export function SettingsPage() {
  const { session, loading } = useSessionContext()
  const userId = session?.user?.id ?? null
  const location = useLocation()
  const wide = useWidePane()
  const view = resolveSettingsView({
    pathname: location.pathname,
    hash: location.hash,
    wide,
  })

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-600">
        Loading…
      </div>
    )
  }

  // A legacy hash, or a `/settings/<unknown>` URL: replace, never push, so Back
  // returns to the screen the parent actually came from.
  if (view.kind === 'redirect') return <Navigate to={view.to} replace />

  const selectedId = view.kind === 'category' ? view.id : null
  const selected = selectedId === null ? null : settingsRow(selectedId)

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        icon={NAV_ICONS.gear}
        title="Settings"
        // The tagline describes the list; a category screen carries the
        // category's own sentence under its heading instead.
        tagline={
          selected === null
            ? 'Notifications, privacy, appearance, and your saved families and places'
            : undefined
        }
      />

      <div className="flex flex-col gap-6 md:grid md:grid-cols-[14rem_minmax(0,1fr)] md:items-start md:gap-8">
        {/* THE PANE. One list, rendered once at every width: the phone's index
            and the desktop's navigation column are the same element, so they
            cannot drift. When a category is open on the phone the list steps
            aside — on the pane it stays, because there it is the navigation. */}
        <div
          data-testid="settings-pane"
          className={`flex-col gap-3 ${selected === null ? 'flex' : 'hidden md:flex'}`}
        >
          <ul data-testid="settings-index" className="flex flex-col gap-2">
            {SETTINGS_INDEX.map((row) => (
              <li key={row.id}>
                <Link
                  to={settingsCategoryPath(row.id)}
                  data-testid={`settings-index-row-${row.id}`}
                  aria-current={row.id === selectedId ? 'page' : undefined}
                  className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm"
                >
                  <IndexGlyph path={NAV_ICONS[row.icon]} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-800">{row.label}</span>
                    <span className="block text-xs text-slate-600">{row.blurb}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* THE BODY. Only the selected category's, and only on the screen that
            owns it — nothing here renders a second copy of any category. */}
        {selected === null ? null : (
          <div className="flex min-w-0 max-w-md flex-col gap-3">
            {/* The phone's way back to the list. Hidden on the pane, where the
                list is already on screen. */}
            <div className="md:hidden">
              <BackControl to="/settings" testId="settings-back" />
            </div>
            <SettingsSection
              id={selected.id}
              title={selected.label}
              description={SETTINGS_CATEGORY_DESCRIPTIONS[selected.id]}
            >
              <CategoryBody id={selected.id} userId={userId} />
            </SettingsSection>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * The one category's controls. A total switch over the id union: adding a
 * seventh category to the table without a body is a type error here, not a blank
 * screen. This is composition (which component renders), not a domain rule.
 */
function CategoryBody({ id, userId }: { id: SettingsCategoryId; userId: string | null }) {
  switch (id) {
    case 'notifications':
      return <NotificationsSection />
    case 'near-you':
      return userId === null ? (
        <p className="text-sm text-slate-600">Sign in to change this.</p>
      ) : (
        <BrowsingSection userId={userId} />
      )
    case 'saved':
      return <FollowingSection />
    case 'privacy':
      return userId === null ? (
        <p className="text-sm text-slate-600">Sign in to see this.</p>
      ) : (
        <PrivacySection userId={userId} />
      )
    case 'appearance':
      return <ThemeToggle />
    case 'account':
      return <AccountSection />
  }
}

/**
 * The desktop pane's question, read from the ONE breakpoint constant
 * (`lib/settingsIndex.ts`). The initial value is read synchronously so a
 * 1280×900 load renders the pane's default category on the first paint rather
 * than flashing the phone index; the listener keeps the two in step when the
 * window is resized.
 */
function useWidePane(): boolean {
  const [wide, setWide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(SETTINGS_PANE_MEDIA_QUERY).matches,
  )
  useEffect(() => {
    const query = window.matchMedia(SETTINGS_PANE_MEDIA_QUERY)
    const onChange = () => setWide(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return wide
}

/**
 * A row's glyph, in the app's stroked family (24px viewBox, stroke 1.8,
 * currentColor — see `components/icons.ts`). Decorative: the row's own label
 * carries the meaning, so the svg is hidden from assistive tech. Rendered here
 * rather than imported because the glyph table is a component module and
 * `lib/settingsIndex.ts` may only NAME a key into it.
 */
function IndexGlyph({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0 text-slate-600"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  )
}

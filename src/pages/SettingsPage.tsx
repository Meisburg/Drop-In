import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { NAV_ICONS } from '../components/icons'
import { NotificationsSection } from '../components/NotificationsSection'
import { SectionHeader } from '../components/SectionHeader'
import { useSessionContext } from '../components/SessionProvider'
import { listMyFollowing, unfollowById, type MyFollowing } from '../lib/db'
// V8 ticket 09: the Following list's family rows reuse the card's 40px avatar
// (the HostAvatar shape) rather than growing a second one.
import { HostAvatar } from '../components/DropInCard'
// V22 slice 14: the appearance switch — light default, dark opt-in.
import { ThemeToggle } from '../components/ThemeToggle'

/**
 * /settings — the signed-in family's app-wide settings page (V15 T07 slimmed it
 * to app-wide controls only; the profile-specific editors all live on /profile).
 *
 * The page keeps:
 * - notifications: the NotificationsSection (push opt-in / status / dismiss).
 * - following: the families and places this parent has bookmarked, with an
 *   Unfollow button on every row (the owner-only 0033 SELECT policy makes this
 *   the only place a follow graph is read in full; no follower counts anywhere).
 *
 * Removed in V15 T07 (A21–A25):
 * - display name input (A23) — moved to /profile (T06 A20 identity block).
 * - nudge banner "Finish your profile" (A24) — deleted; the items it named are
 *   reachable via /profile.
 * - location card (home zip + radius) (A22) — removed; radius is owned by the
 *   browse modal (T02), zip is set during onboarding.
 * - interests textarea (A21) — belongs on /profile ("About the parents" bio).
 * - neighborhoods display-only card (A25) — redundant; discovery is
 *   zip+radius, no neighborhood control exists.
 *
 * Sign-out lives in the app shell header (App.tsx); account deletion is not
 * on this page.
 */
export function SettingsPage() {
  const { session, loading } = useSessionContext()
  const userId = session?.user?.id ?? null

  // V8 ticket 09 (migration 0033): the Following list — the families and
  // places this parent bookmarked (null = still loading). A failed read
  // (pre-0033-apply: PGRST205) renders its own sentence and nothing else the
  // page does changes. `unfollowBusyId` is one row's in-flight unfollow.
  const [following, setFollowing] = useState<MyFollowing | null>(null)
  const [followingError, setFollowingError] = useState<string | null>(null)
  const [unfollowBusyId, setUnfollowBusyId] = useState<string | null>(null)

  // V8 ticket 09: the Following list (the caller's OWN follows — owner-only
  // RLS — named through one batched profiles read and one batched places
  // read). A failed load renders its own sentence in the section below;
  // nothing else on the page depends on it.
  useEffect(() => {
    if (userId === null) return
    let cancelled = false
    setFollowing(null)
    setFollowingError(null)
    listMyFollowing()
      .then((rows) => {
        if (!cancelled) setFollowing(rows)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setFollowingError(
          err instanceof Error ? err.message : 'Could not load your following list.',
        )
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  /**
   * V8 ticket 09: unfollow one row (the DELETE scoped to the caller's own
   * row). On success the row is removed from LOCAL state — the list is the
   * caller's own data, already in hand, so a full re-read would be a second
   * round trip for a fact we just changed. A failure reports in the section
   * and leaves the row standing (never a lie about the state).
   */
  async function handleUnfollow(followId: string) {
    if (unfollowBusyId !== null) return
    setUnfollowBusyId(followId)
    setFollowingError(null)
    try {
      await unfollowById(followId)
      setFollowing((prev) =>
        prev === null
          ? prev
          : {
              families: prev.families.filter((row) => row.followId !== followId),
              places: prev.places.filter((row) => row.followId !== followId),
            },
      )
    } catch (err) {
      setFollowingError(err instanceof Error ? err.message : 'Could not unfollow. Try again.')
    } finally {
      setUnfollowBusyId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-600">
        Loading…
      </div>
    )
  }

  const tagline = 'Appearance, notifications and following'

  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionHeader icon={NAV_ICONS.gear} title="Settings" tagline={tagline} />
      </div>

      {/* V22 slice 14: appearance is a user choice — light default, dark opt-in.
          The switch owns its own persistence (localStorage) and applies the
          theme attribute; it renders before the data-loading sections so a
          settings visit never waits on the network to change the look. */}
      <ThemeToggle />

      {/* V8 ticket 08: the notification surface — opt-in/off, per-kind mutes,
          the install affordance and the recent-alerts fallback. It loads its
          own data and CONTAINS its own failures (pre-apply it renders one
          sentence about the missing tables), so nothing above it changes when
          the push migrations are not installed yet. */}
      <NotificationsSection />

      {/* V8 ticket 09 (migration 0033): the Following list — the families and
          places this parent bookmarked. Counts only (there is no follower list
          anywhere); the rows are the caller's OWN follows, which is the only
          way the owner-only 0033 policy ever returns rows. A failed read
          (pre-apply: PGRST205) is its own sentence — the rest of the page is
          untouched. */}
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-slate-900">Following</h2>
        {/* V25 t08 — THE VOCABULARY, RECONCILED IN ONE DIRECTION. The app calls
            a place bookmark a SAVE (the founder's "heart"): the card's
            `Save`/`Saved` accessible name, the place page's button, and now the
            Places directory's Saved filter. This section keeps its heading and
            its test ids, and the two anchors that pin them are precise:
            e2e/loop-closing.e2e.ts:697 asserts the HEADING ("Following") and
            :704 clicks `unfollow-place` — neither of those may move in this
            ticket. `following-empty` (:158) has no spec anchor today; it is kept
            anyway, because renaming an id is churn a copy change does not
            justify. Only the copy below moved to the save word, so a parent who
            saves a place and comes looking for it is not told they "followed"
            it. */}
        <p className="text-sm text-slate-600">
          The families and places you’ve saved — you’ll see when they’re going to something.
        </p>

        {followingError !== null ? (
          <p data-testid="following-error" className="text-sm text-slate-600">
            Couldn’t load your following list ({followingError}).
          </p>
        ) : following === null ? (
          <p className="text-sm text-slate-600">Loading…</p>
        ) : following.families.length === 0 && following.places.length === 0 ? (
          <p data-testid="following-empty" className="text-sm text-slate-600">
            No saved families or places yet. Save a family on their profile, or a place on its page.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {following.families.length > 0 ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-slate-700">Families</h3>
                <ul className="flex flex-col gap-2">
                  {following.families.map((row) => (
                    <li key={row.followId} className="flex flex-wrap items-center gap-2">
                      <HostAvatar
                        host={{
                          id: row.profileId,
                          display_name: row.handle ?? '?',
                          avatar_url: row.avatarUrl,
                        }}
                      />
                      {row.handle !== null ? (
                        <Link
                          to={`/u/${encodeURIComponent(row.handle)}`}
                          className="text-sm font-medium text-indigo-600"
                        >
                          @{row.handle}
                        </Link>
                      ) : (
                        <span className="text-sm text-slate-600">A family who left Drop In</span>
                      )}
                      <button
                        type="button"
                        data-testid="unfollow-family"
                        disabled={unfollowBusyId === row.followId}
                        onClick={() => void handleUnfollow(row.followId)}
                        className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 disabled:opacity-50"
                      >
                        {unfollowBusyId === row.followId ? 'Updating…' : 'Unfollow'}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {following.places.length > 0 ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-slate-700">Places</h3>
                <ul className="flex flex-col gap-2">
                  {following.places.map((row) => (
                    <li key={row.followId} className="flex flex-wrap items-center gap-2">
                      {row.name !== null ? (
                        <Link
                          to={`/place/${encodeURIComponent(row.placeId)}`}
                          className="text-sm font-medium text-indigo-600"
                        >
                          {row.name}
                        </Link>
                      ) : (
                        <span className="text-sm text-slate-600">A place that left the directory</span>
                      )}
                      <button
                        type="button"
                        data-testid="unfollow-place"
                        disabled={unfollowBusyId === row.followId}
                        onClick={() => void handleUnfollow(row.followId)}
                        className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 disabled:opacity-50"
                      >
                        {unfollowBusyId === row.followId ? 'Updating…' : 'Unfollow'}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )}
      </section>
    </div>
  )
}
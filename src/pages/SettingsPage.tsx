import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { AccountSection } from '../components/AccountSection'
import { BrowsingSection } from '../components/BrowsingSection'
import { HostAvatar } from '../components/DropInCard'
import { NAV_ICONS } from '../components/icons'
import { NotificationsSection } from '../components/NotificationsSection'
import { PrivacySection } from '../components/PrivacySection'
import { SectionHeader } from '../components/SectionHeader'
import { SettingsSection } from '../components/SettingsSection'
import { ThemeToggle } from '../components/ThemeToggle'
import { UndoLine } from '../components/UndoLine'
import { useSessionContext } from '../components/SessionProvider'
import {
  listMyFollowing,
  toggleFollowPlace,
  toggleFollowProfile,
  unfollowById,
  type MyFollowing,
} from '../lib/db'
import { settingsErrorMessage } from '../lib/settingsError'

/** The two kinds of saved target, discriminated so undo calls the right toggle. */
type FollowTarget = { profileId: string } | { placeId: string }

interface RemovedFollow {
  label: string
  target: FollowTarget
}

/**
 * /settings — the signed-in family's app-wide settings (V15 T07 slimmed it to
 * app-wide controls; V27 gave it a real information architecture).
 *
 * Sections, in the order a parent is most likely to want them:
 *   - Notifications (push opt-in, per-kind mutes, quiet hours, email fallback)
 *   - Near you (the saved discovery radius)
 *   - Following & saved (the families and places this parent bookmarked)
 *   - Privacy & safety (what others can see, and the block list)
 *   - Appearance (light / dark / match my phone)
 *   - Account (download your data, delete your account)
 *
 * Every section has a stable id, so copy elsewhere can deep-link to the exact
 * control (`/settings#notifications`); a hash on load is scrolled to. The page
 * still owns no profile editor — the profile fields live on /profile, and the
 * "Your profile" row at the top is the one obvious door between the two.
 *
 * Sign-out lives in the app shell header (App.tsx); account deletion is in the
 * Account section below.
 */
export function SettingsPage() {
  const { session, loading } = useSessionContext()
  const userId = session?.user?.id ?? null
  const location = useLocation()

  // V8 ticket 09 (migration 0033): the Following list — the families and
  // places this parent bookmarked (null = still loading). A failed read
  // (pre-0033-apply: PGRST205) renders its own sentence and nothing else the
  // page does changes. `unfollowBusyId` is one row's in-flight unfollow.
  const [following, setFollowing] = useState<MyFollowing | null>(null)
  const [followingError, setFollowingError] = useState<string | null>(null)
  const [unfollowBusyId, setUnfollowBusyId] = useState<string | null>(null)
  // V27: the optimistic-removal undo. One row at a time, with its target kept
  // so the undo re-follows through the existing toggle instead of a second
  // insert path.
  const [removedFollow, setRemovedFollow] = useState<RemovedFollow | null>(null)
  const [undoBusy, setUndoBusy] = useState(false)

  const reloadFollowing = useCallback(async () => {
    try {
      const rows = await listMyFollowing()
      setFollowing(rows)
      setFollowingError(null)
    } catch (err) {
      setFollowingError(
        settingsErrorMessage(err, "Couldn't load your saved families and places."),
      )
    }
  }, [])

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
          settingsErrorMessage(err, "Couldn't load your saved families and places."),
        )
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  // V27 deep links: `/settings#privacy` must land on the section, not at the
  // top of the page. React Router does not scroll to a hash on its own, and the
  // section headings render immediately (the data inside them may still load),
  // so this is safe to run on the hash alone.
  useEffect(() => {
    if (location.hash === '') return
    const element = document.getElementById(location.hash.slice(1))
    if (element !== null && typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({ block: 'start' })
    }
  }, [location.hash])

  /**
   * V8 ticket 09: unfollow one row (the DELETE scoped to the caller's own
   * row). On success the row is removed from LOCAL state — the list is the
   * caller's own data, already in hand, so a full re-read would be a second
   * round trip for a fact we just changed. V27 keeps the removed row (with its
   * target) behind an Undo line instead of destroying it silently, and the
   * failure report still leaves the row standing.
   */
  async function handleUnfollow(followId: string, label: string, target: FollowTarget) {
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
      setRemovedFollow({ label, target })
    } catch (err) {
      setFollowingError(settingsErrorMessage(err, "Couldn't remove that. Nothing changed."))
    } finally {
      setUnfollowBusyId(null)
    }
  }

  /**
   * Put the removed row back. The follow is re-created through the existing
   * toggle (the row is currently absent, so it inserts), then the list is
   * re-read once — necessary because the re-created row has a NEW follow id,
   * and a locally-restored old id could not be removed again.
   */
  async function handleUndoFollow() {
    if (removedFollow === null || undoBusy) return
    setUndoBusy(true)
    setFollowingError(null)
    try {
      if ('profileId' in removedFollow.target) {
        await toggleFollowProfile(removedFollow.target.profileId)
      } else {
        await toggleFollowPlace(removedFollow.target.placeId)
      }
      await reloadFollowing()
      setRemovedFollow(null)
    } catch (err) {
      setFollowingError(settingsErrorMessage(err, "Couldn't undo that. Please try again."))
    } finally {
      setUndoBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-600">
        Loading…
      </div>
    )
  }

  const tagline = 'Notifications, privacy, appearance, and your saved families and places'

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader icon={NAV_ICONS.gear} title="Settings" tagline={tagline} />

      {/* One obvious door to the profile editor. The editable profile fields
          stay on /profile (V15 T07); a parent who lands here looking for their
          name or kids is pointed there instead of guessing. */}
      <Link
        to="/profile"
        data-testid="settings-profile-link"
        className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
      >
        <span className="text-sm font-medium text-slate-800">Your family profile</span>
        <span className="text-sm text-indigo-600">Name, kids &amp; photos ›</span>
      </Link>

      <SettingsSection
        id="notifications"
        title="Notifications"
        description="What Drop In tells you about, and when it is allowed to."
      >
        <NotificationsSection />
      </SettingsSection>

      <SettingsSection
        id="near-you"
        title="Near you"
        description="How far away the drop-ins you see can be."
      >
        {userId === null ? (
          <p className="text-sm text-slate-600">Sign in to change this.</p>
        ) : (
          <BrowsingSection userId={userId} />
        )}
      </SettingsSection>

      <SettingsSection
        id="saved"
        title="Following & saved"
        description="The families you follow and the places you save. You'll see when they're going to something."
      >
        {followingError !== null ? (
          <p data-testid="following-error" className="text-sm text-slate-600" role="alert">
            {followingError}
          </p>
        ) : null}

        {removedFollow === null ? null : (
          <UndoLine
            message={`Removed ${removedFollow.label}.`}
            busy={undoBusy}
            onUndo={() => void handleUndoFollow()}
          />
        )}

        {following === null ? (
          followingError === null ? (
            <p className="text-sm text-slate-600">Loading…</p>
          ) : null
        ) : following.families.length === 0 && following.places.length === 0 ? (
          <p data-testid="following-empty" className="text-sm text-slate-600">
            No saved families or places yet. Follow a family on their profile, or save a place on
            its page.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {following.families.length > 0 ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-slate-700">Families you follow</h3>
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
                        onClick={() =>
                          void handleUnfollow(
                            row.followId,
                            row.handle === null ? 'that family' : `@${row.handle}`,
                            { profileId: row.profileId },
                          )
                        }
                        className="ml-auto inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 disabled:opacity-50"
                      >
                        {unfollowBusyId === row.followId ? 'Removing…' : 'Remove'}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {following.places.length > 0 ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-slate-700">Places you saved</h3>
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
                        onClick={() =>
                          void handleUnfollow(
                            row.followId,
                            row.name === null ? 'that place' : row.name,
                            { placeId: row.placeId },
                          )
                        }
                        className="ml-auto inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 disabled:opacity-50"
                      >
                        {unfollowBusyId === row.followId ? 'Removing…' : 'Remove'}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        id="privacy"
        title="Privacy & safety"
        description="What other parents can see, and who you have blocked."
      >
        {userId === null ? (
          <p className="text-sm text-slate-600">Sign in to see this.</p>
        ) : (
          <PrivacySection userId={userId} />
        )}
      </SettingsSection>

      <SettingsSection id="appearance" title="Appearance">
        <ThemeToggle />
      </SettingsSection>

      <SettingsSection
        id="account"
        title="Account"
        description="Take your data with you, or close your account."
      >
        <AccountSection />
      </SettingsSection>
    </div>
  )
}

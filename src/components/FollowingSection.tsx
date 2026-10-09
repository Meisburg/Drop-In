import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { HostAvatar } from './DropInCard'
import { useSessionContext } from './SessionProvider'
import { UndoLine } from './UndoLine'
import {
  listMyFollowing,
  toggleFollowPlace,
  toggleFollowProfile,
  unfollowById,
  type MyFollowing,
} from '../lib/db'
import { settingsErrorMessage } from '../lib/settingsError'

/**
 * The `Following & saved` category's body (settings-restructure slice).
 *
 * MOVED, NOT REWRITTEN. These were `SettingsPage`'s `saved` section verbatim
 * (`SettingsPage.tsx:218-329` before the restructure) — the follows list, the
 * per-row Remove button, and the optimistic-removal undo. It is a component now
 * rather than a block on the page for one measured reason: the page renders ONE
 * category at a time, and this body's reads (`listMyFollowing`) used to fire on
 * every /settings mount, including the five screens that show nothing of it. The
 * state lives here so the reads live here too, and only the `saved` screen pays
 * for them.
 *
 * The ids are byte-for-byte what the e2e suite selects on: `following-error`,
 * `following-empty`, `unfollow-family`, `unfollow-place`.
 *
 * V8 ticket 09 (migration 0033): the Following list — the families and places
 * this parent bookmarked (null = still loading). A failed read (pre-0033-apply:
 * PGRST205) renders its own sentence and nothing else here changes.
 * `unfollowBusyId` is one row's in-flight unfollow.
 */
type FollowTarget = { profileId: string } | { placeId: string }

interface RemovedFollow {
  label: string
  target: FollowTarget
}

/** One copy of the load-failure sentence: the initial read and the undo's
 *  re-read report the same failure, and two literals would drift. */
const LOAD_FAILURE = "Couldn't load your saved families and places."

export function FollowingSection() {
  const { session } = useSessionContext()
  const userId = session?.user?.id ?? null

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
      setFollowingError(settingsErrorMessage(err, LOAD_FAILURE))
    }
  }, [])

  // V8 ticket 09: the caller's OWN follows (owner-only RLS — named through one
  // batched profiles read and one batched places read). A failed load renders
  // its own sentence below; nothing else in this category depends on it.
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
        setFollowingError(settingsErrorMessage(err, LOAD_FAILURE))
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  /**
   * V8 ticket 09: unfollow one row (the DELETE scoped to the caller's own row).
   * On success the row is removed from LOCAL state — the list is the caller's
   * own data, already in hand, so a full re-read would be a second round trip
   * for a fact we just changed. V27 keeps the removed row (with its target)
   * behind an Undo line instead of destroying it silently, and the failure
   * report still leaves the row standing.
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
   * re-read once — necessary because the re-created row has a NEW follow id, and
   * a locally-restored old id could not be removed again.
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

  return (
    <>
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
          No saved families or places yet. Follow a family on their profile, or save a place on its
          page.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {following.families.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-slate-700">Families you follow</h3>
              <p className="text-xs text-slate-500">
                This is where you change it: tap Remove next to a family to stop following them.
              </p>
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
              <p className="text-xs text-slate-500">
                This is where you change it: tap Remove next to a place to stop saving it.
              </p>
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
    </>
  )
}

import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useSessionContext } from '../components/SessionProvider'
import { PlacePhotoAdmin } from '../components/PlacePhotoAdmin'
import { banProfile, hidePlaydate, listPlaces, listReports, type ModReport } from '../lib/db'
import { canModerate } from '../lib/moderation'
import type { Place } from '../lib/types'

/**
 * /mod — moderator tools (slice 5): the report list (reason, reporter /
 * reported handles, the reported post, timestamp) with per-item actions —
 * hide a post (playdates.hidden_at) and ban a profile (profiles.banned_at).
 * Both are final in V1 (no unhide/unban UI, V1-minimum).
 *
 * Access: the shell's route guard (App.tsx) redirects non-moderators off
 * this page (the pure canModerate guard, unit-tested) and the reports RLS
 * (migration 0008) is the second wall — a non-moderator's listReports
 * returns 0 rows. Designed 375px-first (the app shell's max-w-md column).
 */
export function ModPage() {
  const { session, loading, profile } = useSessionContext()

  const [reports, setReports] = useState<ModReport[] | null>(null)
  const [reportsError, setReportsError] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [hiddenPostIds, setHiddenPostIds] = useState<ReadonlySet<string>>(new Set())
  const [bannedProfileIds, setBannedProfileIds] = useState<ReadonlySet<string>>(new Set())
  const [confirmBanProfileId, setConfirmBanProfileId] = useState<string | null>(null)

  /**
   * V28 r4 — THE PLACE PHOTO TOOL's own state.
   *
   * `places` is the full directory (~239 rows), loaded ONLY when the moderator
   * opens the tool: a page whose primary job is the report list must not pay for
   * a 239-row read on every visit. `photoQuery` narrows by name, because
   * scrolling 239 rows to find one park is not a tool anyone would use twice.
   *
   * After a save the edited row is patched IN PLACE rather than re-fetching the
   * whole directory — one write should not cost 239 rows of read, and the patch
   * is exactly what was just written.
   */
  const [photoToolOpen, setPhotoToolOpen] = useState(false)
  const [places, setPlaces] = useState<Place[] | null>(null)
  const [placesError, setPlacesError] = useState<string | null>(null)
  const [photoQuery, setPhotoQuery] = useState('')

  // Load the report list once access is established (a moderator profile +
  // a live session). Re-runs when the profile refreshes (e.g. after the
  // shared session state re-fetches).
  useEffect(() => {
    if (loading || session === null || profile === null || !canModerate(profile)) return
    let cancelled = false
    setReports(null)
    setReportsError(null)
    listReports()
      .then((rows) => {
        if (!cancelled) setReports(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setReportsError(err instanceof Error ? err.message : 'Could not load reports.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [loading, session, profile])

  /**
   * V28 r4 — load the directory on FIRST OPEN of the photo tool, not on mount.
   * `places === null` is the not-yet-loaded state and is distinct from `[]`.
   */
  useEffect(() => {
    if (!photoToolOpen || places !== null || placesError !== null) return
    let cancelled = false
    listPlaces()
      .then((rows) => {
        if (!cancelled) setPlaces(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setPlacesError(err instanceof Error ? err.message : 'Could not load places.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [photoToolOpen, places, placesError])

  async function handleHide(item: ModReport) {
    const playdateId = item.report.playdate_id
    if (playdateId === null || busyKey !== null) return
    setBusyKey(`hide:${playdateId}`)
    setActionError(null)
    try {
      await hidePlaydate(playdateId)
      setHiddenPostIds((prev) => new Set([...prev, playdateId]))
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not hide the post. Try again.')
    } finally {
      setBusyKey(null)
    }
  }

  async function handleBan(item: ModReport) {
    const profileId = item.report.reported_profile_id
    if (profileId === null || busyKey !== null) return
    setBusyKey(`ban:${profileId}`)
    setActionError(null)
    try {
      await banProfile(profileId)
      setBannedProfileIds((prev) => new Set([...prev, profileId]))
      setConfirmBanProfileId(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not ban the profile. Try again.')
    } finally {
      setBusyKey(null)
    }
  }

  // The shell redirects non-moderators, and a null profile (the DB not
  // applied yet / a failed fetch) keeps the access check pending — both
  // render a designed state, never a crash.
  if (loading || profile === null) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-600">
        Loading…
      </div>
    )
  }

  if (!canModerate(profile)) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Moderator tools</h1>
        <p className="text-sm text-slate-600">
          Moderator tools are only available to moderator-flagged accounts.
        </p>
        <Link to="/" className="flex min-h-11 items-center text-sm text-indigo-600">
          Back to today
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Moderator tools</h1>
        <p className="mt-1 text-sm text-slate-600">
          Reports, newest first. Hiding a post and banning a profile are
          final in V1 — there is no unhide or unban yet.
        </p>
      </div>

      {/* V28 r4 — THE PLACE PHOTO TOOL.
          The founder: *"many are not relevant or good so i want to be able to
          swap them out myself as the admin."* It sits ABOVE the report list
          because it is a maintenance tool the moderator reaches for
          deliberately, not a queue that demands attention — and it is behind a
          disclosure so the 239-row directory read happens only when opened. */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <button
          type="button"
          data-testid="place-photo-tool-toggle"
          onClick={() => setPhotoToolOpen((open) => !open)}
          className="flex min-h-11 w-full items-center justify-between text-left"
        >
          <span className="text-sm font-medium text-slate-900">Fix a place photo</span>
          <span className="text-sm text-slate-500">{photoToolOpen ? 'Hide' : 'Open'}</span>
        </button>

        {photoToolOpen ? (
          <div className="mt-3 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-700">Find a place</span>
              <input
                type="search"
                data-testid="place-photo-search"
                value={photoQuery}
                onChange={(e) => setPhotoQuery(e.target.value)}
                placeholder="e.g. Green Lake"
                className="min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 text-base outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200"
              />
            </label>

            {placesError !== null ? (
              <p role="alert" className="text-sm text-red-600">
                {placesError}
              </p>
            ) : places === null ? (
              <p className="text-sm text-slate-600">Loading places…</p>
            ) : (
              <PlacePhotoPicker
                places={places}
                query={photoQuery}
                onSaved={(updated) =>
                  setPlaces((current) =>
                    current === null
                      ? current
                      : current.map((row) => (row.id === updated.id ? updated : row)),
                  )
                }
              />
            )}
          </div>
        ) : null}
      </div>

      {reportsError !== null ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-red-600">{reportsError}</p>
          <p className="text-xs text-slate-500">
            If you just set up the server, the moderation tables may not be applied yet.
          </p>
        </div>
      ) : reports === null ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600 motion-reduce:animate-none" />
          Loading reports…
        </div>
      ) : reports.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-slate-600">No reports — clean town.</p>
          <p className="text-xs text-slate-500">New reports from the app will show up here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {reports.map((item) => (
            <ReportCard
              key={item.report.id}
              item={item}
              busyKey={busyKey}
              actionError={actionError}
              hidden={
                item.report.playdate_id !== null && hiddenPostIds.has(item.report.playdate_id)
              }
              banned={
                item.report.reported_profile_id !== null &&
                bannedProfileIds.has(item.report.reported_profile_id)
              }
              confirmingBan={
                item.report.reported_profile_id !== null &&
                confirmBanProfileId === item.report.reported_profile_id
              }
              onHide={() => void handleHide(item)}
              onBan={() => void handleBan(item)}
              onConfirm={() => {
                if (item.report.reported_profile_id !== null) {
                  setConfirmBanProfileId(item.report.reported_profile_id)
                }
              }}
              onCancelConfirm={() => setConfirmBanProfileId(null)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * One report in the mod list (375px-first: every line wraps, the action
 * row uses flex-wrap so Hide + Ban never force horizontal scroll).
 */
function ReportCard({
  item,
  busyKey,
  actionError,
  hidden,
  banned,
  confirmingBan,
  onHide,
  onBan,
  onConfirm,
  onCancelConfirm,
}: {
  item: ModReport
  busyKey: string | null
  actionError: string | null
  hidden: boolean
  banned: boolean
  confirmingBan: boolean
  onHide: () => void
  onBan: () => void
  onConfirm: () => void
  onCancelConfirm: () => void
}) {
  const { report } = item
  const reportedHandle = item.reported !== null ? `@${item.reported}` : 'a post'
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-700">“{report.reason}”</p>
      <p className="text-sm text-slate-600">
        {item.reporter !== null ? `@${item.reporter}` : 'Unknown reporter'} reported{' '}
        {reportedHandle}
      </p>
      {item.postTitle !== null && report.playdate_id !== null ? (
        <Link
          to={`/playdate/${report.playdate_id}`}
          className="break-words text-sm font-medium text-indigo-600"
        >
          Post: “{item.postTitle}”
        </Link>
      ) : null}
      <p className="text-xs text-slate-500">
        {new Date(report.created_at).toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {report.playdate_id !== null ? (
          hidden ? (
            <span className="text-sm font-medium text-emerald-700">Hidden ✓</span>
          ) : (
            <button
              type="button"
              disabled={busyKey !== null}
              onClick={onHide}
              className="rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-medium text-slate-700 disabled:opacity-50"
            >
              {busyKey === `hide:${report.playdate_id}` ? 'Hiding…' : 'Hide post'}
            </button>
          )
        ) : null}

        {report.reported_profile_id !== null ? (
          banned ? (
            <span className="text-sm font-medium text-emerald-700">Banned ✓</span>
          ) : confirmingBan ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-600">
                Ban {reportedHandle}? Final — no unban in V1.
              </span>
              <button
                type="button"
                disabled={busyKey !== null}
                onClick={onBan}
                className="rounded-xl bg-red-600 px-3 py-3 text-sm font-medium text-white disabled:opacity-50"
              >
                {busyKey === `ban:${report.reported_profile_id}` ? 'Banning…' : 'Ban'}
              </button>
              <button
                type="button"
                onClick={onCancelConfirm}
                className="rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-600"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={busyKey !== null}
              onClick={onConfirm}
              className="rounded-xl border border-red-200 bg-white px-3 py-3 text-sm font-medium text-red-700 disabled:opacity-50"
            >
              Ban {reportedHandle}
            </button>
          )
        ) : null}
      </div>
      {actionError !== null ? <p className="text-sm text-red-600">{actionError}</p> : null}
    </div>
  )
}

/**
 * V28 r4 — the place picker behind the photo tool.
 *
 * ONE RESULT AT A TIME, deliberately. A grid of 239 editable rows invites
 * bulk-editing a public directory by accident; the founder's situation is "I
 * looked at this place and the picture is wrong", which is one place at a time.
 * The search box exists because finding that one place among 239 by scrolling is
 * not a tool anyone uses twice.
 *
 * Capped at 12 visible matches: enough to disambiguate a name, small enough that
 * the list never becomes the thing you scroll. The count line says how many were
 * hidden, so a moderator who typed "park" and sees 12 knows to type more.
 */
function PlacePhotoPicker({
  places,
  query,
  onSaved,
}: {
  places: Place[]
  query: string
  onSaved: (updated: Place) => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [savedTick, setSavedTick] = useState(0)
  /**
   * place-photo-crop slice 4 — this surface has no dialog to close (the editor
   * is embedded in the page), so the one sentence a refused copy produces has to
   * be rendered here instead. The photo itself is the confirmation on every
   * other outcome.
   */
  const [photoNotice, setPhotoNotice] = useState<string | null>(null)

  const needle = query.trim().toLowerCase()
  const matches = needle === ''
    ? []
    : places.filter((place) => place.name.toLowerCase().includes(needle))
  const visible = matches.slice(0, 12)
  const selected = places.find((place) => place.id === selectedId) ?? null

  if (needle === '') {
    return <p className="text-sm text-slate-500">Type a name to find a place.</p>
  }

  if (matches.length === 0) {
    return <p className="text-sm text-slate-500">No place matches “{query.trim()}”.</p>
  }

  return (
    <div className="flex flex-col gap-2">
      {selected === null ? (
        <ul className="flex flex-col gap-1" data-testid="place-photo-results">
          {visible.map((place) => (
            <li key={place.id}>
              <button
                type="button"
                data-testid={`place-photo-pick-${place.id}`}
                onClick={() => {
                  setSelectedId(place.id)
                  // The sentence names the place it is about, so it goes with the
                  // row that produced it rather than following the moderator to
                  // the next one.
                  setPhotoNotice(null)
                }}
                className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left text-sm text-slate-700 transition-colors motion-reduce:transition-none hover:bg-slate-50"
              >
                <span className="truncate">{place.name}</span>
                {place.photo_url === null || place.photo_url === '' ? (
                  <span className="ml-auto shrink-0 text-xs text-amber-700">No photo</span>
                ) : null}
              </button>
            </li>
          ))}
          {matches.length > visible.length ? (
            <li className="text-xs text-slate-500">
              {matches.length - visible.length} more — keep typing to narrow it down.
            </li>
          ) : null}
        </ul>
      ) : (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            data-testid="place-photo-back"
            onClick={() => {
              setSelectedId(null)
              setPhotoNotice(null)
            }}
            className="min-h-11 self-start text-sm text-indigo-600"
          >
            ← Choose a different place
          </button>
          <PlacePhotoAdmin
            key={`${selected.id}-${savedTick}`}
            place={places.find((place) => place.id === selected.id) ?? selected}
            onSaved={(notice) => {
              /**
               * place-photo-crop slice 4: a save (or a removal) still refreshes
               * the picker's row — the editor is embedded here rather than in a
               * modal, so it is the row's own new photo that confirms the write.
               * `notice` is set only when a host refused the copy and the pasted
               * link was stored instead; it is reported above the editor.
               */
              setPhotoNotice(notice ?? null)
              setSavedTick((tick) => tick + 1)
              onSaved({ ...selected })
            }}
          />
          {photoNotice !== null ? (
            <p
              role="status"
              data-testid="place-photo-notice"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm"
            >
              {photoNotice}
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}

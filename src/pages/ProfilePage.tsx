import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useSessionContext } from '../components/SessionProvider'
import {
  addMembership,
  HandleTakenError,
  listMemberships,
  listNeighborhoods,
  removeMembership,
  supabase,
  updateDisplayName,
} from '../lib/db'
import { queryMyPlaydatesWithClient, toDuplicatePrefill } from '../lib/feed'
import type { MembershipWithNeighborhood, Neighborhood, Playdate } from '../lib/types'

/**
 * /profile — the signed-in family's own page (slice 2): edit the
 * display_name handle (inline "handle taken" error on a unique violation)
 * and manage neighborhood memberships (all neighborhoods listed, current
 * ones marked, add/remove). Saves refresh the shared session state so the
 * app-shell header picks up the changes.
 *
 * V2 slice 1: the "Your posts" list — the viewer's own drop-ins, newest
 * first — each with a Duplicate action. Duplicate navigates to /new with
 * router-state prefill of everything except the date/time (always
 * re-entered). The own-posts query is the injected-client
 * queryMyPlaydatesWithClient (feed.ts, unit-tested) run against the shared
 * db.ts client — db.ts itself gains no new surface (slice constraint).
 */
export function ProfilePage() {
  const navigate = useNavigate()
  const { session, loading, profile, refresh } = useSessionContext()
  const userId = session?.user?.id ?? null

  const [name, setName] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [nameSaved, setNameSaved] = useState(false)
  const [savingName, setSavingName] = useState(false)

  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[] | null>(null)
  const [memberships, setMemberships] = useState<MembershipWithNeighborhood[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [memberBusyId, setMemberBusyId] = useState<string | null>(null)
  const [memberError, setMemberError] = useState<string | null>(null)

  const [myPosts, setMyPosts] = useState<Playdate[] | null>(null)
  const [postsError, setPostsError] = useState<string | null>(null)

  // Seed the handle field once the profile loads; user typing wins after.
  useEffect(() => {
    if (name === null && profile !== null) setName(profile.display_name)
  }, [name, profile])

  useEffect(() => {
    if (userId === null) return
    let cancelled = false
    setLoadError(null)
    Promise.all([listNeighborhoods(), listMemberships(userId)])
      .then(([rows, userMemberships]) => {
        if (cancelled) return
        setNeighborhoods(rows)
        setMemberships(userMemberships)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : 'Could not load your profile data.')
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  // The "Your posts" list (V2 slice 1): the viewer's own drop-ins, newest
  // first. A failed load (e.g. the playdates table not applied yet) renders
  // a designed error, never a crash — same discipline as the rest of the
  // page.
  useEffect(() => {
    if (userId === null) return
    let cancelled = false
    setMyPosts(null)
    setPostsError(null)
    queryMyPlaydatesWithClient(supabase, userId)
      .then((rows) => {
        if (cancelled) return
        setMyPosts(rows as unknown as Playdate[])
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setPostsError(err instanceof Error ? err.message : 'Could not load your posts.')
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    )
  }

  const memberIds = new Set((memberships ?? []).map((m) => m.neighborhood_id))

  async function handleSaveName(e: FormEvent) {
    e.preventDefault()
    const trimmed = (name ?? '').trim()
    if (userId === null || trimmed === '' || savingName) return
    setSavingName(true)
    setNameError(null)
    setNameSaved(false)
    try {
      await updateDisplayName(userId, trimmed)
      await refresh()
      setNameSaved(true)
    } catch (err) {
      if (err instanceof HandleTakenError) {
        setNameError(`“${trimmed}” is already taken — pick a different display name.`)
      } else {
        setNameError(err instanceof Error ? err.message : 'Could not save your display name.')
      }
    } finally {
      setSavingName(false)
    }
  }

  async function toggleNeighborhood(neighborhoodId: string) {
    if (userId === null || memberBusyId !== null) return
    setMemberBusyId(neighborhoodId)
    setMemberError(null)
    try {
      if (memberIds.has(neighborhoodId)) {
        await removeMembership(userId, neighborhoodId)
      } else {
        await addMembership(userId, neighborhoodId)
      }
      setMemberships(await listMemberships(userId))
      await refresh()
    } catch (err) {
      setMemberError(
        err instanceof Error ? err.message : 'Could not update your neighborhoods.',
      )
    } finally {
      setMemberBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Your family</h1>
        <p className="mt-1 text-sm text-slate-500">
          Your display name is your persistent public handle — it shows on everything you
          post.
        </p>
      </div>

      <form
        className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        onSubmit={handleSaveName}
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-700">Display name</span>
          <input
            className={
              'w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ' +
              (nameError !== null ? 'border-red-400' : 'border-slate-300')
            }
            value={name ?? ''}
            onChange={(e) => {
              setName(e.target.value)
              setNameError(null)
              setNameSaved(false)
            }}
            placeholder="e.g. Sam at Green Lake"
            maxLength={40}
            autoComplete="nickname"
            disabled={savingName}
          />
        </label>
        {nameError ? <p className="text-sm text-red-600">{nameError}</p> : null}
        {nameSaved ? <p className="text-sm text-emerald-700">Saved.</p> : null}
        <button
          type="submit"
          disabled={savingName || (name ?? '').trim() === ''}
          className="self-start rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {savingName ? 'Saving…' : 'Save'}
        </button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Neighborhoods</h2>
        <p className="mt-1 text-sm text-slate-500">
          You see drop-ins in the neighborhoods you follow. Keep at least one.
        </p>

        {loadError !== null ? (
          <p className="mt-3 text-sm text-red-600">{loadError}</p>
        ) : neighborhoods === null || memberships === null ? (
          <p className="mt-3 text-sm text-slate-500">Loading…</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1">
            {neighborhoods.map((n) => {
              const isMember = memberIds.has(n.id)
              const isBusy = memberBusyId === n.id
              return (
                <li key={n.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5">
                  <span className="text-sm text-slate-800">{n.name}</span>
                  <button
                    type="button"
                    aria-pressed={isMember}
                    disabled={isBusy}
                    onClick={() => void toggleNeighborhood(n.id)}
                    className={
                      'rounded-md px-3 py-1 text-xs font-medium ' +
                      (isMember ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-600') +
                      (isBusy ? ' opacity-50' : '')
                    }
                  >
                    {isBusy ? 'Updating…' : isMember ? 'Following' : 'Follow'}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {memberError ? <p className="mt-3 text-sm text-red-600">{memberError}</p> : null}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Your posts</h2>
        <p className="mt-1 text-sm text-slate-500">
          Duplicate one to re-post it — you always pick a new date and time.
        </p>

        {postsError !== null ? (
          <p className="mt-3 text-sm text-red-600">{postsError}</p>
        ) : myPosts === null ? (
          <p className="mt-3 text-sm text-slate-500">Loading…</p>
        ) : myPosts.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No posts yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1">
            {myPosts.map((post) => (
              <li
                key={post.id}
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-800">{post.title}</p>
                  <p className="text-xs text-slate-400">
                    {formatPostWhen(post.starts_at)} · {post.place}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    navigate('/new', { state: { duplicate: toDuplicatePrefill(post) } })
                  }
                  className="shrink-0 rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200"
                >
                  Duplicate
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/** Local "Sep 12 · 3 PM" for an own-post row. */
function formatPostWhen(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString(undefined, { hour: 'numeric' })}`
}
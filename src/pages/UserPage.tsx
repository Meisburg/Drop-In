import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { getProfileByHandle } from '../lib/db'
import type { Profile } from '../lib/types'

type UserPageState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'not-found' }
  | { status: 'ready'; profile: Profile }

/**
 * /u/:handle — a profile's minimal public face (slice 2): the handle + a
 * posts area. The playdates table lands in slice 3, so the posts area
 * shows a "No posts yet" empty state (we deliberately do not create or
 * query playdates here). Unknown handles get a friendly not-found state.
 */
export function UserPage() {
  const { handle } = useParams<{ handle: string }>()
  const [state, setState] = useState<UserPageState>({ status: 'loading' })

  useEffect(() => {
    if (handle === undefined || handle === '') {
      setState({ status: 'not-found' })
      return
    }
    let cancelled = false
    setState({ status: 'loading' })
    getProfileByHandle(handle)
      .then((profile) => {
        if (cancelled) return
        setState(profile === null ? { status: 'not-found' } : { status: 'ready', profile })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : 'Something went wrong.',
        })
      })
    return () => {
      cancelled = true
    }
  }, [handle])

  if (state.status === 'loading') {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm text-red-600">{state.message}</p>
        <Link to="/" className="text-sm text-indigo-600">
          Back to today
        </Link>
      </div>
    )
  }

  if (state.status === 'not-found') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">
          We couldn’t find @{handle ?? '…'}
        </h1>
        <p className="text-sm text-slate-500">
          The handle may be a typo, or this family may not be on Playdate yet.
        </p>
        <Link to="/" className="text-sm text-indigo-600">
          Back to today
        </Link>
      </div>
    )
  }

  const { profile } = state
  const joined = new Date(profile.created_at).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">@{profile.display_name}</h1>
        <p className="mt-1 text-sm text-slate-500">Here since {joined}.</p>
      </div>

      <div>
        <h2 className="text-base font-semibold text-slate-900">Posts</h2>
        <div className="mt-2 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-slate-500">No posts yet.</p>
        </div>
      </div>
    </div>
  )
}
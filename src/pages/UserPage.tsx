import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { ProfileLoadStates, ProfileView } from '../components/ProfileView'
import { getProfileByHandle } from '../lib/db'
import type { ProfileWithKids } from '../lib/types'

type UserPageState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'not-found' }
  | { status: 'ready'; profile: ProfileWithKids }

/**
 * /u/:handle — a profile's public face (slice 2) + the trust controls
 * (slice 4): a block/unblock toggle and a report entry, both hidden on your
 * own profile page.
 *
 * V20 t01: THIS PAGE IS NOW A FETCHER AND A BRANCH. Everything it used to
 * render — the identity block, the pinned optional blocks (kids → about →
 * family photo), the Follow/Message/Block/Report row, the Hosted drop-ins
 * lists — moved to `components/ProfileView.tsx`, because the founder asked
 * that the Profile tab show the SAME view a `@handle` link opens. Two surfaces
 * that must agree are one component, not two renders kept in step by hand.
 *
 * What stayed here is exactly what is specific to the BY-HANDLE entrance: the
 * `useParams` handle, the `getProfileByHandle` read, and the loading /
 * error / not-found branches (rendered by the shared `ProfileLoadStates`).
 * The owner's own surface (/profile) fetches by session instead and passes the
 * same `ProfileView` an Edit toggle as its header slot.
 *
 * The docstrings that explain each block's rules (the privacy gate, the block
 * order, the retention line) moved WITH the JSX to ProfileView — read them
 * there. Nothing about the behavior changed in the move: this page's visitor
 * path renders the identical tree it rendered before the extraction.
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

  if (state.status !== 'ready') {
    return <ProfileLoadStates state={state} handle={handle} />
  }

  return <ProfileView profile={state.profile} />
}

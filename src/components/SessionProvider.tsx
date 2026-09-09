import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { useSession } from '../lib/db'
import type { SessionState } from '../lib/db'

const SessionContext = createContext<SessionState | null>(null)

/**
 * One session-layer instance for the whole app. The app shell's header,
 * the route gates, and every page read this single shared state, so a
 * `refresh()` after a save (onboarding, profile edit) updates the header
 * and the onboarding gate everywhere at once.
 *
 * The shared state also carries the slice-5 banned-session gate: when the
 * signed-in user's profile has banned_at set, useSession signs them out and
 * sets `suspended`, and the shell (App.tsx) renders the suspended screen
 * instead of any app route (no app access).
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const sessionState = useSession()
  return <SessionContext.Provider value={sessionState}>{children}</SessionContext.Provider>
}

/** Shared session state (session, profile, homeZipSet, refresh). */
export function useSessionContext(): SessionState {
  const state = useContext(SessionContext)
  if (state === null) {
    throw new Error('useSessionContext must be used within <SessionProvider>.')
  }
  return state
}
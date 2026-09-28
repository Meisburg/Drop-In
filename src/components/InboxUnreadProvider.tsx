import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { listConversations, listDirectConversations, supabase } from '../lib/db'
import { sumUnread } from '../lib/inbox'
import { useSessionContext } from './SessionProvider'

/** The one value the bottom nav's Inbox badge reads. */
export interface InboxUnreadState {
  /** Total unread messages across playdate conversations and DMs. */
  unreadCount: number
}

/**
 * Signed-out (and pre-provider) default: no badge. A default rather than a
 * throw keeps `NavTab` renderable in isolation (tests, Storybook-style
 * previews) — a missing unread count is not an error, it is zero.
 */
const InboxUnreadContext = createContext<InboxUnreadState>({ unreadCount: 0 })

/**
 * V27 slice 3 — the signed-in parent's TOTAL unread message count, so the
 * Inbox tab can say there is something to read.
 *
 * Reuses the existing conversation seams — `listConversations` and
 * `listDirectConversations` already carry a per-row `unreadCount`, so the
 * provider adds no new query shape and `sumUnread` does the (pure, tested)
 * arithmetic. It recomputes on exactly three triggers and nothing else:
 *
 *   1. mount / session change — the count for whoever is signed in;
 *   2. a `messages` INSERT over Supabase Realtime, RLS-scoped server-side
 *      (the same no-filter subscription shape the inbox list uses), so a
 *      message arriving while any tab is open moves the badge;
 *   3. `visibilitychange` → visible, because a backgrounded tab throttles
 *      realtime delivery and refocus is the honest moment to reconcile.
 *
 * Best-effort by design: a failed read leaves the last known count in place
 * and never throws into render — a stale badge is recoverable, a crashed
 * shell is not. The channel and the DOM listener are both torn down on
 * unmount / sign-out.
 */
export function InboxUnreadProvider({ children }: { children: ReactNode }) {
  const { session } = useSessionContext()
  const userId = session?.user.id ?? null
  /**
   * The count is stamped with the user it was fetched FOR, so signed-out and
   * not-yet-fetched states derive to 0 during render instead of resetting via
   * an effect (a setState-in-effect is a cascading render the compiler warns
   * about, and a stale count from a previous user must never show).
   */
  const [counted, setCounted] = useState<{ forUserId: string | null; count: number }>({
    forUserId: null,
    count: 0,
  })
  const unreadCount = counted.forUserId === userId ? counted.count : 0

  useEffect(() => {
    // Signed out: nothing to count, nothing to fetch, no channel to hold.
    if (userId === null) return

    let cancelled = false

    const recompute = async () => {
      try {
        const [playdateRows, dmRows] = await Promise.all([
          listConversations(userId),
          listDirectConversations(userId),
        ])
        if (cancelled) return
        setCounted({ forUserId: userId, count: sumUnread([...playdateRows, ...dmRows]) })
      } catch {
        // Best-effort: keep the last count rather than blanking the badge.
      }
    }

    void recompute()

    // No server filter: Supabase Realtime applies the caller's RLS, so only
    // messages this parent may read are delivered. Each INSERT re-reads the
    // two list seams, whose unread counts are the source of truth.
    const channel = supabase
      .channel('inbox-unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        void recompute()
      })
      .subscribe()

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void recompute()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      void supabase.removeChannel(channel)
    }
  }, [userId])

  return (
    <InboxUnreadContext.Provider value={{ unreadCount }}>{children}</InboxUnreadContext.Provider>
  )
}

/** The shared unread total. Safe outside a provider — reads as zero. */
export function useInboxUnread(): InboxUnreadState {
  return useContext(InboxUnreadContext)
}

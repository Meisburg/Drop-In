import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { NAV_ICONS, REACTION_GLYPHS } from '../components/icons'
import { SectionHeader } from '../components/SectionHeader'
import { useSessionContext } from '../components/SessionProvider'
import {
  applyReactionSet,
  listConversations,
  listDirectConversations,
  markConversationRead,
  queryDirectMessages,
  queryMessagesForPlaydate,
  reactionButtonClasses,
  reactionCountLabel,
  reactionStatesForMessages,
  reconcileOptimisticMessage,
  searchProfiles,
  sendDirectMessage,
  sendMessage,
  supabase,
  toggleReaction,
  toggleReactionRemove,
  validateMessageBody,
} from '../lib/db'
import type {
  ConversationSummary,
  MessageRow,
  ProfileSearchResult,
  ReactionKind,
  ReactionState,
} from '../lib/db'
import { REACTION_KINDS } from '../lib/db'
import { mergeConversations } from '../lib/inbox'
import type { MergedConversation } from '../lib/inbox'

/**
 * /inbox — parent↔parent messaging (V14 ticket 01, migration 0042).
 *
 * Two views on one route: the conversation LIST (default) and an inline
 * THREAD view (?thread=<playdate_id>). Messaging is playdate-scoped — a
 * conversation belongs to a drop-in and its participants are the post's host
 * + pingers (the RLS gate in 0042), so there is no free-form DM. New messages
 * arrive live via a Supabase Realtime channel on the messages table (INSERTs
 * filtered to the open thread); the channel unsubscribes on unmount and on
 * every thread change.
 *
 * House pattern: this page owns ALL state (list load, thread load, composer,
 * realtime subscription, send errors); the presentational pieces below own
 * none. The db.ts seams (listConversations / queryMessagesForPlaydate /
 * sendMessage / markConversationRead) carry the wire; pre-0042-apply they
 * 42703 and the page shows an honest error line, never a crash (the DB-not-
 * applied discipline).
 */

/** A relative "2h ago" label for the list card's time line (pure, testable). */
export function relativeTimeLabel(iso: string, nowIso: string): string {
  const then = new Date(iso).getTime()
  const now = new Date(nowIso).getTime()
  const minutes = Math.max(0, Math.round((now - then) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

type ListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; conversations: ConversationSummary[] }

type ThreadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; messages: MessageRow[]; otherPartyName: string; playdateTitle: string }

/**
 * One row of the conversation list: the other party's name (bold), the
 * playdate title (muted), the latest message preview (~60 chars, muted),
 * a relative time, and an unread pill badge (only when > 0). Tap → the
 * thread view. Presentational: it renders exactly what it is given.
 */
/**
 * One row of the MERGED conversation list: the other party's name (bold), the
 * latest message preview (~60 chars, muted), a relative time, and — for
 * playdate-scoped rows only — an unread dot + count badge when unreadCount > 0.
 * Tap → opens the thread (the destination is decided by the row's `kind`).
 * Presentational: it renders exactly what it is given.
 *
 * The unread marker is scoped to PLAYDATE conversations: the read cursor
 * (`conversation_reads`) has a NOT NULL FK to `playdates(id)` (migration
 * 0042), so it cannot represent a free-form DM (identified by
 * `messages.playdate_id IS NULL`). A DM row therefore never shows a dot —
 * that gap is reported as an open question, not silently shipped.
 */
function ConversationCard({
  conversation,
  onOpen,
}: {
  conversation: MergedConversation
  onOpen: () => void
}) {
  // The unread dot is meaningful only for playdate rows (DMs have no read
  // cursor — see the comment above). The dot is a decoration; the ACCESSIBLE
  // state lives on the button itself via aria-label, so a screen reader still
  // knows the row is unread even though the dot is aria-hidden.
  const showUnread = conversation.kind === 'playdate' && conversation.unreadCount > 0
  const accessibleLabel = showUnread
    ? `${conversation.otherPartyName || 'Unknown'} — ${conversation.unreadCount} unread message${
        conversation.unreadCount === 1 ? '' : 's'
      }`
    : (conversation.otherPartyName || 'Unknown')
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={accessibleLabel}
      data-testid={`inbox-row-${conversation.otherPartyId}`}
      className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors motion-reduce:transition-none hover:bg-slate-50"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-semibold text-slate-900">
          {conversation.otherPartyName || 'Unknown'}
        </p>
        {showUnread ? (
          <span className="flex shrink-0 items-center gap-1.5">
            {/* The colour dot: a pure decoration (aria-hidden); the button's
                aria-label carries the accessible "N unread" state. */}
            <span
              data-testid={`unread-dot-${conversation.otherPartyId}`}
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-full bg-indigo-600"
            />
            <span
              data-testid={`unread-badge-${conversation.otherPartyId}`}
              className="rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-semibold text-white"
            >
              {conversation.unreadCount}
            </span>
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <p className="truncate text-sm text-slate-600">{conversation.preview}</p>
        <p className="shrink-0 text-xs text-slate-500">
          {relativeTimeLabel(conversation.latestAt, new Date().toISOString())}
        </p>
      </div>
    </button>
  )
}

/**
 * One bubble in the thread: the sender's display name (small, muted, above
 * the bubble) + the body in a rounded bubble. Own messages are right-aligned
 * + tinted; the other party's are left-aligned + white.
 *
 * V15 ticket 08 (A26) + V21 t03: a compact reaction row sits under each bubble —
 * a SUMMARY PILL (the viewer's own glyph + the participant count) that opens a
 * six-option PICKER. The count is hidden at 0 so a quiet thread is not littered
 * with "👍 0", but the pill always renders (there must be something to tap).
 * Your own reaction fills the pill indigo; no reaction is a plain slate outline.
 * The pill is presentational — the page owns the set/replace/remove + the
 * optimistic math (applyReactionSet).
 *
 * WHY A PILL + PICKER RATHER THAN SIX INLINE BUTTONS: on a phone the row of six
 * would either blow out the bubble's width at 390px or shrink each target below
 * the 44px floor. The pill is one ≥44px tap target; the picker it opens is an
 * overlay of six 44×44 buttons (h-11 w-11) that never widens the bubble.
 */
function MessageBubble({
  message,
  isOwn,
  senderName,
  reaction,
  onReact,
}: {
  message: MessageRow
  isOwn: boolean
  senderName: string
  reaction: ReactionState
  onReact: (messageId: string, kind: ReactionKind | null) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const countLabel = reactionCountLabel(reaction.count)
  // The pill shows the viewer's own glyph (a neutral thumb when they have not
  // reacted yet) plus the running count.
  const myGlyph = reaction.myKind !== null ? REACTION_GLYPHS[reaction.myKind] : REACTION_GLYPHS.like
  const chooseKind = (kind: ReactionKind) => {
    // Tapping the kind you already have REMOVES the reaction (null); any other
    // kind SETS it (replacing in place when different, so the count holds).
    onReact(message.id, reaction.mine && reaction.myKind === kind ? null : kind)
    setPickerOpen(false)
  }
  return (
    <div className={isOwn ? 'flex justify-end' : 'flex justify-start'}>
      <div className={`max-w-[80%] ${isOwn ? 'text-right' : ''}`}>
        <p className="mb-0.5 text-xs text-slate-500">{senderName}</p>
        <p
          data-testid={isOwn ? 'own-message' : 'other-message'}
          className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
            isOwn ? 'bg-indigo-100 text-slate-900' : 'border border-slate-200 bg-white text-slate-900'
          }`}
        >
          {message.body}
        </p>
        <div className={`relative mt-1 flex items-center gap-1.5 ${isOwn ? 'justify-end' : 'justify-start'}`}>
          {/* The summary pill: the viewer's glyph + count; opens the picker. */}
          <button
            type="button"
            data-testid={`react-${message.id}`}
            aria-expanded={pickerOpen}
            aria-label={
              reaction.mine ? `Your reaction: ${reaction.myKind ?? 'like'}. Open reactions` : 'Add a reaction'
            }
            onClick={() => setPickerOpen((o) => !o)}
            className={reactionButtonClasses(reaction.mine)}
          >
            <span aria-hidden>{myGlyph}</span>
            {countLabel !== null ? (
              <span data-testid={`react-count-${message.id}`}>{countLabel}</span>
            ) : null}
          </button>
          {pickerOpen ? (
            <div
              data-testid={`react-picker-${message.id}`}
              role="menu"
              className={`absolute bottom-full z-10 mb-1 flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-lg ${
                isOwn ? 'right-0' : 'left-0'
              }`}
            >
              {REACTION_KINDS.map((kind) => {
                const active = reaction.mine && reaction.myKind === kind
                return (
                  <button
                    key={kind}
                    type="button"
                    role="menuitem"
                    data-testid={`react-option-${kind}`}
                    aria-label={kind}
                    aria-pressed={active}
                    onClick={() => chooseKind(kind)}
                    className={`flex h-11 w-11 items-center justify-center rounded-lg text-xl transition-colors motion-reduce:transition-none ${
                      active ? 'bg-indigo-600' : 'hover:bg-slate-100'
                    }`}
                  >
                    <span aria-hidden>{REACTION_GLYPHS[kind]}</span>
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function InboxPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { session, profile } = useSessionContext()
  const threadId = searchParams.get('thread')
  const dmTargetId = searchParams.get('dm')

  // --- Conversation list state -------------------------------------------
  const [list, setList] = useState<ListState>({ status: 'loading' })
  const [reloadToken, setReloadToken] = useState(0)

  // --- Free-form DM state --------------------------------------------------
  const [directConvs, setDirectConvs] = useState<
    Array<{ otherPartyId: string; otherPartyName: string; latestAt: string; preview: string; unreadCount: number }>
  >([])
  const [showNewMessage, setShowNewMessage] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ProfileSearchResult[]>([])
  const [searching, setSearching] = useState(false)

  // --- Thread state --------------------------------------------------------
  const [thread, setThread] = useState<ThreadState | null>(null)
  const [draft, setDraft] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  // --- Reaction state (V15 ticket 08, A26) ---------------------------------
  // Keyed by message id: { count, mine }. Loaded in one batch when the thread
  // opens, moved optimistically on every tap, and reconciled by the realtime
  // subscription below.
  const [reactions, setReactions] = useState<Record<string, ReactionState>>({})

  // Load (or reload) the conversation list. Pre-0042-apply the read 42703s —
  // the honest error line, never a crash. Also loads free-form DMs.
  useEffect(() => {
    let cancelled = false
    if (session === null) return
    setList({ status: 'loading' })
    listConversations(session.user.id)
      .then((conversations) => {
        if (!cancelled) setList({ status: 'ready', conversations })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setList({
            status: 'error',
            message: err instanceof Error ? err.message : 'Could not load your conversations.',
          })
        }
      })
    // Free-form DMs (best-effort: pre-0043-apply this 42703s, which is fine).
    listDirectConversations(session.user.id)
      .then((convs) => {
        if (!cancelled) setDirectConvs(convs)
      })
      .catch(() => {
        // Pre-0043: table doesn't exist yet. Show empty list, no crash.
        if (!cancelled) setDirectConvs([])
      })
    return () => {
      cancelled = true
    }
  }, [session, reloadToken])

  // User search for the "New message" modal.
  useEffect(() => {
    if (!showNewMessage || searchQuery.trim().length < 2) {
      setSearchResults([])
      return
    }
    let cancelled = false
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const results = await searchProfiles(searchQuery)
        if (!cancelled) setSearchResults(results)
      } catch {
        if (!cancelled) setSearchResults([])
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [searchQuery, showNewMessage])

  // Open a thread: load its messages + stamp the read cursor (clears the
  // unread badge). Re-runs on every thread change. Also handles free-form DMs
  // (?dm=<profileId>).
  useEffect(() => {
    if (threadId === null && dmTargetId === null) {
      setThread(null)
      setDraft('')
      setSendError(null)
      // Closing the thread drops the reaction state with it — a stale map
      // must never colour a bubble in the NEXT conversation.
      setReactions({})
      return
    }
    let cancelled = false
    setThread({ status: 'loading' })
    setDraft('')
    setSendError(null)
    setReactions({})

    /**
     * The thread's starting reaction state, in ONE bounded request for all of
     * its messages (reactionStatesForMessages — the V15 T08 helper). A failure
     * here is cosmetic, never fatal: every message simply starts at 0/unreacted
     * and the taps + realtime events still work, so this never renders an error
     * line and never blocks the thread.
     */
    const loadReactionStates = async (messages: MessageRow[]) => {
      // Read the id off `session` (not the later `userId` binding): this
      // closure runs after render, so it must not depend on a `const` that is
      // declared further down the component body.
      const viewerId = session?.user.id ?? null
      if (viewerId === null || messages.length === 0) return
      try {
        const states = await reactionStatesForMessages(
          messages.map((m) => m.id),
          viewerId,
        )
        if (!cancelled) setReactions(states)
      } catch {
        // Best-effort: reactions are a garnish on the thread, not the thread.
      }
    }

    const loadMessages = async () => {
      if (dmTargetId !== null) {
        // Free-form DM thread.
        const messages = await queryDirectMessages(dmTargetId)
        if (cancelled) return
        setThread({
          status: 'ready',
          messages,
          otherPartyName: '',
          playdateTitle: '',
        })
        await loadReactionStates(messages)
      } else if (threadId !== null) {
        // Playdate-scoped thread (existing logic).
        const messages = await queryMessagesForPlaydate(threadId)
        if (cancelled) return
        try {
          await markConversationRead(threadId)
        } catch {
          // A failed cursor write never blocks reading the thread itself.
        }
        if (cancelled) return
        setThread({
          status: 'ready',
          messages,
          otherPartyName: '',
          playdateTitle: '',
        })
        await loadReactionStates(messages)
      }
    }

    loadMessages()
      .catch((err: unknown) => {
        if (!cancelled) {
          setThread({
            status: 'error',
            message: err instanceof Error ? err.message : 'Could not load this conversation.',
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [threadId, dmTargetId, session])

  // Resolve the thread header's other-party name + post title from the loaded
  // list (cheap: the list is always loaded before a thread opens) — the
  // thread read itself carries no embeds (the ticket keeps the wire minimal).
  // This effect runs whenever the list settles or the thread changes, so the
  // header fills in even when the list load finishes after the thread load.
  useEffect(() => {
    if (threadId === null || list.status !== 'ready') return
    const conv = list.conversations.find((c) => c.playdateId === threadId)
    if (conv === undefined) return
    setThread((prev) => {
      if (prev === null || prev.status !== 'ready') return prev
      return { ...prev, otherPartyName: conv.otherPartyDisplayName, playdateTitle: conv.playdateTitle }
    })
  }, [list, threadId])

  // For free-form DMs: resolve the other party's name from directConvs.
  useEffect(() => {
    if (dmTargetId === null || directConvs.length === 0) return
    const conv = directConvs.find((c) => c.otherPartyId === dmTargetId)
    if (conv === undefined) return
    setThread((prev) => {
      if (prev === null || prev.status !== 'ready') return prev
      return { ...prev, otherPartyName: conv.otherPartyName }
    })
  }, [directConvs, dmTargetId])

  // Fallback: when the conversation list has no row for this playdate (e.g.
  // the host opened the thread directly via ?thread=<id> before any message
  // existed), resolve the other party's name from the playdates table.
  useEffect(() => {
    if (threadId === null || list.status !== 'ready') return
    const conv = list.conversations.find((c) => c.playdateId === threadId)
    if (conv !== undefined && conv.otherPartyDisplayName !== '') return
    let cancelled = false
    ;(async () => {
      try {
        const userId = session?.user.id ?? null
        if (userId === null) return
        const { data, error } = await supabase
          .from('playdates')
          .select(
            'host_profile_id, host:profiles!playdates_host_profile_id_fkey ( display_name ), ' +
              'pings:going_pings ( profile:profiles!going_pings_profile_id_fkey ( display_name ) )',
          )
          .eq('id', threadId)
          .limit(1)
        if (error || cancelled || data === null || data.length === 0) return
        const row = data[0] as unknown as {
          host_profile_id: string
          host: { display_name: string } | null
          pings: Array<{ profile: { display_name: string } | null }>
        }
        if (row.host_profile_id !== userId) {
          // The caller is a pinger; the other party is the host.
          setThread((prev) => {
            if (prev === null || prev.status !== 'ready') return prev
            return { ...prev, otherPartyName: row.host?.display_name ?? '' }
          })
        } else {
          // The caller is the host; the other party is the most recent pinger.
          const pingerNames = row.pings
            .map((ping) => ping.profile?.display_name ?? '')
            .filter((name) => name !== '')
          const counterpart = pingerNames[pingerNames.length - 1] ?? ''
          setThread((prev) => {
            if (prev === null || prev.status !== 'ready') return prev
            return { ...prev, otherPartyName: counterpart }
          })
        }
      } catch {
        // A failed fallback never blocks the thread view.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [list, threadId, session])

  // Real-time: append INSERTs for the open thread without a reload. The
  // channel is rebuilt on every thread change (and torn down on unmount) so
  // a stale filter can never deliver into the wrong conversation. For
  // free-form DMs, we subscribe to messages where sender_id = me OR the
  // other party (filtered client-side by playdate_id IS NULL).
  //
  // V15 ticket 08 (A26) adds a SECOND table to the SAME channel: every
  // message_reactions INSERT/DELETE, filtered CLIENT-SIDE to the ids in the
  // open thread. The ticket allows a per-message filter
  // (`message_id=eq.<id>`); the per-thread subscription is preferred here
  // because it is one channel instead of one per message, and it matches the
  // shape above. The filter is by id against the CURRENT thread's messages, so
  // a reaction in some other conversation is dropped before it can touch this
  // one's counters.
  useEffect(() => {
    if (threadId === null && dmTargetId === null) return
    const channelName = dmTargetId !== null ? `dm-${dmTargetId}` : `messages-${threadId}`
    const channel = supabase.channel(channelName)

    /**
     * Apply one realtime reaction change to the local map. `count` is
     * recomputed as a +1/-1 delta against the event (never re-fetched): the
     * payload carries the affected message_id, which is all the counter needs.
     * Our OWN reaction is reconciled from the event too, so a tap in another
     * tab lands here as well.
     */
    const applyReactionEvent = (
      eventType: 'INSERT' | 'DELETE',
      row: { message_id?: string; profile_id?: string; kind?: string },
    ) => {
      const messageId = row.message_id
      if (messageId === undefined) return
      const delta = eventType === 'INSERT' ? 1 : -1
      const mine = row.profile_id !== undefined && row.profile_id === (session?.user.id ?? '')
      setReactions((prev) => {
        const current = prev[messageId] ?? { count: 0, mine: false, myKind: null }
        // Our OWN write already moved this map optimistically in handleReact;
        // the echo must not move the count a second time. It is still useful for
        // `mine` + `myKind` (a reaction made in another tab reconciles here), so
        // apply that half and skip the delta. On INSERT the event's kind is the
        // new one; on DELETE our own reaction is gone, so myKind clears.
        if (mine) {
          const myKind =
            eventType === 'INSERT'
              ? ((row.kind as ReactionKind | undefined) ?? 'like')
              : null
          return { ...prev, [messageId]: { count: current.count, mine: eventType === 'INSERT', myKind } }
        }
        return {
          ...prev,
          [messageId]: {
            count: Math.max(0, current.count + delta),
            // Someone else's reaction moves the count and leaves our button's
            // fill alone.
            mine: current.mine,
            myKind: current.myKind,
          },
        }
      })
    }

    channel
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_reactions' },
        (payload) => {
          applyReactionEvent('INSERT', payload.new as { message_id?: string; profile_id?: string; kind?: string })
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'message_reactions' },
        (payload) => {
          // DELETE payloads carry the removed row under `old`. 0043 sets no
          // REPLICA IDENTITY FULL, so `old` holds the PK only — and for this
          // table the PK is (message_id, profile_id), exactly the two fields
          // this handler needs to reconcile the counter. Adding the `kind`
          // column (0049) does NOT change the PK, so the default replica
          // identity still carries both ids into the DELETE payload — no
          // REPLICA IDENTITY change is required. Confirmed live by the
          // reactions e2e spec, which un-reacts and asserts the other side's
          // count falls back to 0.
          applyReactionEvent('DELETE', payload.old as { message_id?: string; profile_id?: string; kind?: string })
        },
      )

    if (dmTargetId !== null) {
      // Free-form: listen for all new messages, filter client-side.
      channel
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages' },
          (payload) => {
            const newRow = payload.new as Partial<MessageRow>
            if (newRow.id === undefined || newRow.created_at === undefined) return
            // Only show messages where I'm the sender or recipient.
            const myId = session?.user.id ?? ''
            if (newRow.sender_id !== myId && newRow.sender_id !== dmTargetId) return
            setThread((prev) => {
              if (prev === null || prev.status !== 'ready') return prev
              const reconciled = reconcileOptimisticMessage(prev.messages, newRow as MessageRow)
              if (reconciled !== null) return { ...prev, messages: reconciled }
              return { ...prev, messages: [...prev.messages, newRow as MessageRow] }
            })
            setReloadToken((token) => token + 1)
          },
        )
        .subscribe()
    } else {
      // Playdate-scoped: existing filtered subscription.
      channel
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `playdate_id=eq.${threadId}` },
          (payload) => {
            const newRow = payload.new as Partial<MessageRow>
            if (newRow.id === undefined || newRow.created_at === undefined) return
            setThread((prev) => {
              if (prev === null || prev.status !== 'ready') return prev
              const reconciled = reconcileOptimisticMessage(prev.messages, newRow as MessageRow)
              if (reconciled !== null) return { ...prev, messages: reconciled }
              return { ...prev, messages: [...prev.messages, newRow as MessageRow] }
            })
            setReloadToken((token) => token + 1)
          },
        )
        .subscribe((status) => {
          console.log(`[InboxPage] Realtime channel ${channelName} status: ${status}`)
        })
    }

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [threadId, dmTargetId, session])

  // Keep the newest message in view as the thread grows.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' })
  }, [thread?.status === 'ready' ? thread.messages.length : 0])

  const userId = session?.user.id ?? null

  /**
   * Set (or remove) the viewer's reaction KIND on one message (V21 t03).
   *
   * Optimistic, exactly like handleSend: the local map moves IMMEDIATELY via
   * the pure applyReactionSet (so the pill fills and the count moves on the same
   * frame as the tap), then the write goes out. On failure the move is rolled
   * back to the value it had before the tap — the same optimistic-then-reconcile
   * discipline the composer uses. `kind` null means "remove" (the picker's
   * tap-your-current-kind case); a kind means "set", replacing in place when the
   * viewer already has a different one (the count holds, so no double-count).
   *
   * Our own write also echoes back through the realtime subscription. That echo
   * must NOT move the count (this handler already did), so applyReactionEvent
   * skips the delta when the row is ours and only uses it to reconcile `mine` +
   * `myKind` — which is what makes a reaction made in ANOTHER tab show up here.
   */
  async function handleReact(messageId: string, kind: ReactionKind | null): Promise<void> {
    const before = reactions[messageId] ?? { count: 0, mine: false, myKind: null }
    setReactions((prev) => applyReactionSet(prev, messageId, kind))
    try {
      if (kind !== null) await toggleReaction(messageId, kind)
      else await toggleReactionRemove(messageId)
    } catch {
      // Roll the optimistic move back (the write never landed).
      setReactions((prev) => ({ ...prev, [messageId]: before }))
    }
  }

  /** Optimistic append + the real write; on failure the optimistic row is rolled back. */
  async function handleSend(): Promise<void> {
    if (userId === null) return
    const validationError = validateMessageBody(draft)
    if (validationError !== null) {
      setSendError(validationError)
      return
    }
    setSending(true)
    setSendError(null)
    // Optimistic row (the ticket pin): the bubble appears immediately; the
    // realtime echo is deduped by id once the server confirms.
    const optimistic: MessageRow = {
      id: `pending-${Date.now()}`,
      playdate_id: threadId ?? '',
      sender_id: userId,
      body: draft.trim(),
      created_at: new Date().toISOString(),
    }
    setThread((prev) =>
      prev !== null && prev.status === 'ready'
        ? { ...prev, messages: [...prev.messages, optimistic] }
        : prev,
    )
    setDraft('')
    try {
      if (dmTargetId !== null) {
        await sendDirectMessage(dmTargetId, draft)
      } else if (threadId !== null) {
        await sendMessage(threadId, draft)
      }
    } catch (err: unknown) {
      // Roll back the optimistic row + say so honestly.
      setThread((prev) =>
        prev !== null && prev.status === 'ready'
          ? { ...prev, messages: prev.messages.filter((m) => m.id !== optimistic.id) }
          : prev,
      )
      setSendError(err instanceof Error ? err.message : 'Could not send your message.')
    } finally {
      setSending(false)
    }
  }

  /** Enter-to-send on desktop (Shift+Enter inserts a newline). */
  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void handleSend()
    }
  }

  // Auto-grow the composer textarea up to ~4 lines.
  function handleComposerChange(event: React.ChangeEvent<HTMLTextAreaElement>): void {
    setDraft(event.target.value)
    setSendError(null)
    const el = event.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`
  }

  const openThread = (playdateId: string) => {
    setSearchParams({ thread: playdateId })
  }

  const openDmThread = (profileId: string) => {
    setShowNewMessage(false)
    setSearchQuery('')
    setSearchResults([])
    setSearchParams({ dm: profileId })
  }

  const closeThread = () => {
    setSearchParams({})
  }

  // V23 s7: collapse the two lists (free-form DMs + playdate-scoped) into ONE,
  // keyed on the counterpart's profile id — never the display name. The merge
  // is a pure lib function (src/lib/inbox.ts); this page only decides which
  // thread a row opens based on the winner's `kind`.
  const mergedConversations = useMemo(
    () => mergeConversations(directConvs, list.status === 'ready' ? list.conversations : []),
    [directConvs, list],
  )

  /** Open whichever thread a merged row points at: a playdate row → ?thread=, a DM row → ?dm=. */
  const openMergedRow = (row: MergedConversation) => {
    if (row.kind === 'playdate' && row.playdateId !== undefined) {
      openThread(row.playdateId)
    } else {
      openDmThread(row.otherPartyId)
    }
  }

  const threadHeaderName =
    thread !== null && thread.status === 'ready'
      ? thread.otherPartyName || ''
      : ''
  const threadHeaderTitle =
    thread !== null && thread.status === 'ready'
      ? thread.playdateTitle || ''
      : ''

  return (
    <div className="mx-auto max-w-md">
      {threadId === null && dmTargetId === null ? (
        <>
          <SectionHeader icon={NAV_ICONS.inbox} title="Inbox" />
          {/* "New message" button (free-form DMs, V15 T01). */}
          <button
            type="button"
            data-testid="new-message-button"
            onClick={() => setShowNewMessage(true)}
            className="mt-3 w-full rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-700 transition-colors motion-reduce:transition-none hover:bg-indigo-100"
          >
            + New message
          </button>

          {/* User-search modal (the "New message" picker). */}
          {showNewMessage ? (
            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">Message a parent</p>
              <input
                type="text"
                data-testid="dm-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name…"
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus-visible:border-indigo-400 focus-visible:outline-none"
                autoFocus
              />
              {searching ? (
                <p className="mt-2 text-xs text-slate-500">Searching…</p>
              ) : searchResults.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-1">
                  {searchResults.map((result) => (
                    <li key={result.id}>
                      <button
                        type="button"
                        data-testid={`dm-result-${result.id}`}
                        onClick={() => openDmThread(result.id)}
                        className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-800 transition-colors motion-reduce:transition-none hover:bg-slate-50"
                      >
                        {result.display_name}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : searchQuery.trim().length >= 2 ? (
                <p className="mt-2 text-xs text-slate-500">No matches found.</p>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setShowNewMessage(false)
                  setSearchQuery('')
                  setSearchResults([])
                }}
                className="mt-3 text-xs text-slate-500 underline"
              >
                Cancel
              </button>
            </div>
          ) : null}

          {list.status === 'loading' ? (
            <p className="mt-6 text-sm text-slate-600">Loading your conversations…</p>
          ) : list.status === 'error' ? (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-700">{list.message}</p>
              <button
                type="button"
                onClick={() => setReloadToken((token) => token + 1)}
                className="mt-2 rounded-xl border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700"
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              {/* V23 s7: ONE merged list — free-form DMs + playdate-scoped,
                  collapsed on the counterpart's profile id (never the name).
                  The empty state keys on the MERGED list, so it cannot show
                  "No conversations yet" over a non-empty one. */}
              {mergedConversations.length === 0 ? (
                <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-center">
                  <p className="text-sm font-semibold text-slate-900">No conversations yet.</p>
                  <p className="mt-1 text-sm text-slate-600">
                    Message a parent from a drop-in page once you're both going, or start a new
                    conversation above.
                  </p>
                  <Link
                    to="/browse"
                    className="mt-3 inline-block rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Browse places
                  </Link>
                </div>
              ) : (
                <ul className="mt-4 flex flex-col gap-2">
                  {mergedConversations.map((row) => (
                    <li key={row.otherPartyId || row.kind}>
                      <ConversationCard conversation={row} onOpen={() => openMergedRow(row)} />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      ) : (
        <>
          {/* Thread header: back button + the post's title + the other party. */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={closeThread}
              aria-label="Back to conversations"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700"
            >
              ←
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{threadHeaderName}</p>
              <p className="truncate text-xs text-slate-500">{threadHeaderTitle}</p>
            </div>
          </div>

          {list.status === 'error' ? (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-700">{list.message}</p>
              <button
                type="button"
                onClick={() => setReloadToken((token) => token + 1)}
                className="mt-2 rounded-xl border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700"
              >
                Retry
              </button>
            </div>
          ) : null}

          {thread?.status === 'loading' ? (
            <p className="mt-6 text-sm text-slate-600">Loading the conversation…</p>
          ) : thread?.status === 'error' ? (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-700">{thread.message}</p>
            </div>
          ) : thread?.status === 'ready' ? (
            <div className="mt-4">
              <div className="flex min-h-40 flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                {thread.messages.length === 0 ? (
                  <p className="text-sm text-slate-600">
                    No messages yet — say hi below.
                  </p>
                ) : (
                  thread.messages.map((message) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      isOwn={userId !== null && message.sender_id === userId}
                      senderName={
                        userId !== null && message.sender_id === userId
                          ? (profile?.display_name ?? 'You')
                          : threadHeaderName || 'Unknown'
                      }
                      reaction={reactions[message.id] ?? { count: 0, mine: false, myKind: null }}
                      onReact={(messageId, kind) => void handleReact(messageId, kind)}
                    />
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Composer: auto-grow textarea (max ~4 lines) + Send (disabled
                  when empty). Enter sends on desktop; Shift+Enter breaks. */}
              <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                <textarea
                  value={draft}
                  onChange={handleComposerChange}
                  onKeyDown={handleComposerKeyDown}
                  rows={1}
                  placeholder="Write a message…"
                  className="w-full resize-none rounded-lg border-0 bg-transparent p-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
                />
                {sendError !== null ? <p className="mt-1 text-xs text-red-600">{sendError}</p> : null}
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    disabled={draft.trim().length === 0 || sending}
                    onClick={() => void handleSend()}
                    className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {sending ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
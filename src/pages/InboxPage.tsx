import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { NAV_ICONS } from '../components/icons'
import { SectionHeader } from '../components/SectionHeader'
import { useSessionContext } from '../components/SessionProvider'
import {
  listConversations,
  markConversationRead,
  queryMessagesForPlaydate,
  sendMessage,
  supabase,
  validateMessageBody,
} from '../lib/db'
import type { ConversationSummary, MessageRow } from '../lib/db'

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
function ConversationCard({
  conversation,
  onOpen,
}: {
  conversation: ConversationSummary
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:bg-slate-50"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-semibold text-slate-900">
          {conversation.otherPartyDisplayName || 'Unknown'}
        </p>
        {conversation.unreadCount > 0 ? (
          <span
            data-testid={`unread-badge-${conversation.playdateId}`}
            className="shrink-0 rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-semibold text-white"
          >
            {conversation.unreadCount}
          </span>
        ) : null}
      </div>
      <p className="mt-0.5 truncate text-xs text-slate-500">{conversation.playdateTitle}</p>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <p className="truncate text-sm text-slate-600">{conversation.latestMessagePreview}</p>
        <p className="shrink-0 text-xs text-slate-400">
          {relativeTimeLabel(conversation.latestMessageAt, new Date().toISOString())}
        </p>
      </div>
    </button>
  )
}

/**
 * One bubble in the thread: the sender's display name (small, muted, above
 * the bubble) + the body in a rounded bubble. Own messages are right-aligned
 * + tinted; the other party's are left-aligned + white.
 */
function MessageBubble({
  message,
  isOwn,
  senderName,
}: {
  message: MessageRow
  isOwn: boolean
  senderName: string
}) {
  return (
    <div className={isOwn ? 'flex justify-end' : 'flex justify-start'}>
      <div className={`max-w-[80%] ${isOwn ? 'text-right' : ''}`}>
        <p className="mb-0.5 text-xs text-slate-400">{senderName}</p>
        <p
          data-testid={isOwn ? 'own-message' : 'other-message'}
          className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
            isOwn ? 'bg-indigo-100 text-slate-900' : 'border border-slate-200 bg-white text-slate-900'
          }`}
        >
          {message.body}
        </p>
      </div>
    </div>
  )
}

export function InboxPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { session, profile } = useSessionContext()
  const threadId = searchParams.get('thread')

  // --- Conversation list state -------------------------------------------
  const [list, setList] = useState<ListState>({ status: 'loading' })
  const [reloadToken, setReloadToken] = useState(0)

  // --- Thread state --------------------------------------------------------
  const [thread, setThread] = useState<ThreadState | null>(null)
  const [draft, setDraft] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  // Load (or reload) the conversation list. Pre-0042-apply the read 42703s —
  // the honest error line, never a crash.
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
    return () => {
      cancelled = true
    }
  }, [session, reloadToken])

  // Open a thread: load its messages + stamp the read cursor (clears the
  // unread badge). Re-runs on every thread change.
  useEffect(() => {
    if (threadId === null) {
      setThread(null)
      setDraft('')
      setSendError(null)
      return
    }
    let cancelled = false
    setThread({ status: 'loading' })
    setDraft('')
    setSendError(null)
    queryMessagesForPlaydate(threadId)
      .then(async (messages) => {
        if (cancelled) return
        // Stamp the read cursor AFTER the load so the just-read batch does not
        // count as unread (the ticket's "badge clears on open").
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
      })
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
  }, [threadId])

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
  // a stale filter can never deliver into the wrong conversation.
  useEffect(() => {
    if (threadId === null) return
    const channel = supabase
      .channel(`messages-${threadId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `playdate_id=eq.${threadId}` },
        (payload) => {
          const newRow = payload.new as Partial<MessageRow>
          if (newRow.id === undefined || newRow.created_at === undefined) return
          setThread((prev) => {
            if (prev === null || prev.status !== 'ready') return prev
            // Dedupe: a message we sent ourselves already arrived optimistically.
            if (prev.messages.some((m) => m.id === newRow.id)) return prev
            return { ...prev, messages: [...prev.messages, newRow as MessageRow] }
          })
          // A new message also refreshes the list's preview + unread counts.
          setReloadToken((token) => token + 1)
        },
      )
      .subscribe((status) => {
        // Log the subscription status for diagnostics (the e2e real-time test).
        console.log(`[InboxPage] Realtime channel ${threadId} status: ${status}`)
      })
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [threadId])

  // Keep the newest message in view as the thread grows.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' })
  }, [thread?.status === 'ready' ? thread.messages.length : 0])

  const userId = session?.user.id ?? null

  /** Optimistic append + the real write; on failure the optimistic row is rolled back. */
  async function handleSend(): Promise<void> {
    if (threadId === null || userId === null) return
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
      playdate_id: threadId,
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
      await sendMessage(threadId, draft)
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

  const closeThread = () => {
    setSearchParams({})
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
      {threadId === null ? (
        <>
          <SectionHeader
            icon={NAV_ICONS.inbox}
            title="Inbox"
            tagline="Messages from the drop-ins you're both going to."
          />
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
          ) : list.conversations.length === 0 ? (
            <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-center">
              <p className="text-sm font-semibold text-slate-900">No conversations yet.</p>
              <p className="mt-1 text-sm text-slate-600">
                Message a parent from a drop-in page once you're both going.
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
              {list.conversations.map((conversation) => (
                <li key={conversation.playdateId}>
                  <ConversationCard
                    conversation={conversation}
                    onOpen={() => openThread(conversation.playdateId)}
                  />
                </li>
              ))}
            </ul>
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
                  className="w-full resize-none rounded-lg border-0 bg-transparent p-1 text-sm focus:outline-none"
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
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { BackControl } from '../components/BackControl'
// V24 slice 04: the row's FACE reuses the app's ONE avatar primitive (40px,
// `avatar_url` or the deterministic initial circle, plus its own dead-URL
// fallback) instead of a second implementation living in this page.
import { HostAvatar } from '../components/DropInCard'
import { NAV_ICONS, REACTION_GLYPHS } from '../components/icons'
import { SectionHeader } from '../components/SectionHeader'
import { useSessionContext } from '../components/SessionProvider'
import {
  applyReactionSet,
  listConversations,
  listDirectConversations,
  markConversationRead,
  markDirectConversationRead,
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
import {
  activeTodayLabel,
  daySeparatorLabel,
  firstNamedCounterpart,
  groupLabel,
  mergeConversations,
  messageSenderLabel,
  messageTimestampLabel,
  QUICK_REPLIES,
  singleSenderCounterpart,
  threadContextLine,
} from '../lib/inbox'
import type {
  Counterpart,
  DmConversationRow,
  GroupParticipant,
  MergedConversation,
} from '../lib/inbox'
import { localDayKey } from '../lib/feed'

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

/** A stable empty list, so a "no messages yet" memo dep never changes identity. */
const NO_MESSAGES: readonly MessageRow[] = []

type ThreadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; messages: MessageRow[] }

/**
 * One row of the conversation list: the other party's name (bold), the
 * playdate title (muted), the latest message preview (~60 chars, muted),
 * a relative time, and an unread pill badge (only when > 0). Tap → the
 * thread view. Presentational: it renders exactly what it is given.
 */
/**
 * One row of the MERGED conversation list: the other party's name (bold), the
 * latest message preview (~60 chars, muted), a relative time, and an unread
 * dot + count badge when unreadCount > 0. Tap → opens the thread (the
 * destination is decided by the row's `kind`). Presentational: it renders
 * exactly what it is given.
 *
 * The unread marker works for BOTH kinds: playdate conversations use the
 * `conversation_reads` cursor (migration 0042) and free-form DMs use the
 * `direct_conversation_reads` cursor (migration 0051), each keyed on its own
 * conversation identity. Both are stamped when the thread is opened.
 *
 * Every testid this card emits is suffixed with `conversation.mergeKey`, NOT
 * `otherPartyId`: two unresolved rows both carry `otherPartyId === ''`, so an
 * `otherPartyId`-suffixed testid is the SAME string on both rows and cannot
 * address either one. `mergeKeyFor` is the identity that keeps them apart.
 */
function ConversationCard({
  conversation,
  onOpen,
}: {
  conversation: MergedConversation
  onOpen: () => void
}) {
  // The unread dot is a decoration; the ACCESSIBLE state lives on the button
  // itself via aria-label, so a screen reader still knows the row is unread
  // even though the dot is aria-hidden.
  const showUnread = conversation.unreadCount > 0
  const accessibleLabel = showUnread
    ? `${conversation.otherPartyName || 'Unknown'} — ${conversation.unreadCount} unread message${
        conversation.unreadCount === 1 ? '' : 's'
      }`
    : (conversation.otherPartyName || 'Unknown')
  // V24 slice 04: the honest activity line — "Active today" from the
  // counterpart's own last_seen_at cursor (the pure inbox.activeTodayLabel),
  // and NOTHING when that cursor is older or absent. This is deliberately not
  // presence: no subscription, and never the words "now" or "online".
  const activity = activeTodayLabel(conversation.otherPartyLastSeenAt, new Date().toISOString())
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={accessibleLabel}
      data-testid={`inbox-row-${conversation.mergeKey}`}
      className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors motion-reduce:transition-none hover:bg-slate-50"
    >
      <div className="flex items-start gap-3">
        <HostAvatar
          host={{
            id: conversation.otherPartyId,
            display_name: conversation.otherPartyName,
            avatar_url: conversation.otherPartyAvatarUrl,
          }}
        />
        {/* `flex-1 overflow-hidden` — NOT `min-w-0` — on purpose: the thread
            header (this file, below) is also a `div.min-w-0`, and the pre-existing
            diagnostic selector in e2e/inbox.e2e.ts:447 is `div.min-w-0 > p`.
            `overflow-hidden` constrains the flex child for the truncating lines
            exactly as `min-w-0` does (both let a flex item shrink below its
            content size), so the layout is unchanged while the diagnostic can no
            longer resolve to a ROW paragraph instead of the header's. */}
        <div className="flex-1 overflow-hidden">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold text-slate-900">
              {conversation.otherPartyName || 'Unknown'}
            </p>
            {showUnread ? (
              <span className="flex shrink-0 items-center gap-1.5">
                {/* The colour dot: a pure decoration (aria-hidden); the button's
                    aria-label carries the accessible "N unread" state. */}
                <span
                  data-testid={`unread-dot-${conversation.mergeKey}`}
                  aria-hidden="true"
                  className="h-2.5 w-2.5 rounded-full bg-indigo-600"
                />
                <span
                  data-testid={`unread-badge-${conversation.mergeKey}`}
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
          {activity !== null ? (
            <p
              data-testid={`inbox-activity-${conversation.mergeKey}`}
              className="mt-1 text-xs text-slate-500"
            >
              {activity}
            </p>
          ) : null}
        </div>
      </div>
    </button>
  )
}

/** V24 slice 04: the search field's leading magnifying glass (icons.NAV_ICONS.search). */
function SearchGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={NAV_ICONS.search} />
    </svg>
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
  timeLabel,
  failed,
  reaction,
  onReact,
  onRetry,
}: {
  message: MessageRow
  isOwn: boolean
  /**
   * V25 ticket 11: the SENDER's own name, or `null` for no label. A message
   * whose sender the thread cannot name renders NO name line — never the word
   * "Unknown" (which reads as a broken person, the founder's report).
   */
  senderName: string | null
  /**
   * V27 slice 5: this message's local time-of-day (`messageTimestampLabel`).
   * Computed by the page (one `now` per render) and rendered in the meta row at
   * the 14px floor.
   */
  timeLabel: string
  /**
   * V27 slice 5: this optimistic bubble's send failed. It stays visible and
   * wears the `Not sent · Retry` control; a successful send clears the flag.
   */
  failed: boolean
  reaction: ReactionState
  onReact: (messageId: string, kind: ReactionKind | null) => void
  /** V27 slice 5: re-run the SAME send for a failed bubble. */
  onRetry: (message: MessageRow) => void
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
        {senderName !== null ? (
          <p className="mb-0.5 text-xs text-slate-500">{senderName}</p>
        ) : null}
        <p
          data-testid={isOwn ? 'own-message' : 'other-message'}
          className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-2.5 text-base ${
            isOwn ? 'bg-indigo-100 text-slate-900' : 'border border-slate-200 bg-white text-slate-900'
          }`}
        >
          {message.body}
        </p>
        <div className={`relative mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
          {/* V27 s5: the bubble's local time-of-day, at the 14px text floor. */}
          {timeLabel !== '' ? (
            <span data-testid={`message-time-${message.id}`} className="text-sm text-slate-500">
              {timeLabel}
            </span>
          ) : null}
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
          {/* V27 s5: a failed send KEEPS its bubble and offers this control
              instead of vanishing. The 44px floor is on the control itself
              (`min-h-11`), and the body it re-sends is the bubble's own. */}
          {failed ? (
            <button
              type="button"
              data-testid={`retry-${message.id}`}
              aria-label="Not sent. Retry sending this message."
              onClick={() => onRetry(message)}
              className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-red-700 transition-colors motion-reduce:transition-none hover:bg-red-50"
            >
              Not sent · Retry
            </button>
          ) : null}
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
  const [directConvs, setDirectConvs] = useState<DmConversationRow[]>([])
  const [showNewMessage, setShowNewMessage] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ProfileSearchResult[]>([])
  const [searching, setSearching] = useState(false)

  // --- Thread state --------------------------------------------------------
  const [thread, setThread] = useState<ThreadState | null>(null)
  // V25 ticket 11: the counterpart resolved by the playdates-table fallback
  // read. It lives in its OWN state — NOT inside `thread` — because the thread
  // loader's final write (`setThread({status:'ready', …})`, below) always ran
  // after the resolver and WIPED the name, and the resolver's own write was
  // discarded by its readiness guard. A derived header (see the useMemos
  // below) reads this state, so it cannot be clobbered by load ordering.
  const [fallbackCounterpart, setFallbackCounterpart] = useState<Counterpart>({ id: '', name: '' })
  const [fallbackTitle, setFallbackTitle] = useState('')
  // V27 slice 4: the playdate thread's CONTEXT — the drop-in's window/place and
  // its participant set — resolved by the read below. Deliberately its OWN state:
  // routing it through `fallbackCounterpart`/`fallbackTitle` would feed the t11
  // counterpart priority chain and could change a 1:1's header. `?dm=` threads
  // never fill these (the read only runs for a `?thread=` id).
  const [contextStartsAt, setContextStartsAt] = useState<string | null>(null)
  const [contextEndsAt, setContextEndsAt] = useState<string | null>(null)
  const [contextPlaceName, setContextPlaceName] = useState<string | null>(null)
  const [contextParticipants, setContextParticipants] = useState<GroupParticipant[]>([])
  const [draft, setDraft] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  // V27 slice 5: the optimistic rows whose write FAILED. A failed row is kept
  // (never filtered out) and its id lives here so the bubble can wear the
  // `Not sent · Retry` control; the id is cleared when a retry succeeds.
  const [failedIds, setFailedIds] = useState<string[]>([])
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  // V27 slice 5: a quick-reply chip fills the draft AND puts the caret back in
  // the textarea so the parent can amend before Send (a chip never sends).
  const composerRef = useRef<HTMLTextAreaElement | null>(null)

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
      // A failed-send marker belongs to the thread it was made in.
      setFailedIds([])
      // Closing the thread drops the reaction state with it — a stale map
      // must never colour a bubble in the NEXT conversation.
      setReactions({})
      return
    }
    let cancelled = false
    setThread({ status: 'loading' })
    setDraft('')
    setSendError(null)
    setFailedIds([])
    setReactions({})
    // A counterpart resolved for the PREVIOUS thread must never name this one.
    setFallbackCounterpart({ id: '', name: '' })
    setFallbackTitle('')
    // V27 s4: neither must the previous thread's drop-in context paint this one.
    setContextStartsAt(null)
    setContextEndsAt(null)
    setContextPlaceName(null)
    setContextParticipants([])

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
        try {
          // Stamp the DM read cursor so the unread dot clears (the DM mirror
          // of markConversationRead below; migration 0051).
          await markDirectConversationRead(dmTargetId)
        } catch {
          // A failed cursor write never blocks reading the thread itself.
        }
        if (cancelled) return
        setThread({
          status: 'ready',
          messages,
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

  // V25 ticket 11 — the header's counterpart, DERIVED (see the useMemos further
  // down) instead of written into `thread` by readiness-guarded effects.
  //
  // WHY THE EFFECTS WENT AWAY. The old shape had two name setters, both of the
  // form `setThread(prev => prev.status !== 'ready' ? prev : {...})`:
  //   - the list resolver fired while the thread was still 'loading' (the
  //     loader awaits `markConversationRead` first), so it returned `prev`
  //     unchanged, and its deps (`[list, threadId]`) never re-fired;
  //   - the loader's own final write then SET the fields to '' and always ran;
  //   - the playdates fallback carried the same guard, so the host name it
  //     fetched was dropped too.
  // Measured live (evidence `.scratch/v25/evidence/t11b-unknown.json`): 2 of 5
  // loads rendered an EMPTY header + "Unknown" bubbles while the network
  // payloads carried the counterpart's name — a purely client-side ordering
  // loss, intermittent, so a one-shot reorder would not hold. Deriving the name
  // from data at render time cannot lose that race: there is no writer left to
  // wipe it.
  //
  // Fallback read (V25 t11 counterpart + V27 s4 context): resolve the playdate
  // from the `playdates` table for this `?thread=` id.
  //
  // V27 slice 4: this read now ALWAYS runs for a playdate thread — the header
  // needs the drop-in's window/place and participant set even when the
  // conversation-list row already carries a name — and its context lands in the
  // separate `context*` state so it cannot touch the t11 counterpart chain. The
  // counterpart-name fallback keeps its ORIGINAL gate exactly (the list must be
  // ready and must have no named row for this playdate), and a `?dm=` thread
  // never reaches here (`threadId` is null). Its result is never guarded on the
  // thread's readiness.
  useEffect(() => {
    if (threadId === null) return
    let cancelled = false
    ;(async () => {
      try {
        const userId = session?.user.id ?? null
        if (userId === null) return
        const { data, error } = await supabase
          .from('playdates')
          .select(
            'title, starts_at, ends_at, host_profile_id, ' +
              'place:places!playdates_place_id_fkey ( name ), ' +
              'host:profiles!playdates_host_profile_id_fkey ( id, display_name ), ' +
              'pings:going_pings ( profile:profiles!going_pings_profile_id_fkey ( id, display_name ) )',
          )
          .eq('id', threadId)
          .limit(1)
        if (error || cancelled || data === null || data.length === 0) return
        const row = data[0] as unknown as {
          title: string | null
          starts_at: string | null
          ends_at: string | null
          host_profile_id: string
          place: { name: string | null } | null
          host: { id: string; display_name: string } | null
          pings: Array<{ profile: { id: string; display_name: string } | null }>
        }
        // V27 s4: the drop-in context, into its OWN state.
        setContextStartsAt(row.starts_at ?? null)
        setContextEndsAt(row.ends_at ?? null)
        setContextPlaceName(row.place?.name ?? null)
        const participants: GroupParticipant[] = []
        if (row.host !== null) {
          participants.push({ id: row.host.id, name: row.host.display_name })
        }
        for (const ping of row.pings) {
          if (ping.profile !== null) {
            participants.push({ id: ping.profile.id, name: ping.profile.display_name })
          }
        }
        setContextParticipants(participants)
        // The pre-t11 counterpart fallback, unchanged: only when the list is
        // ready AND it has no named row for this playdate.
        if (list.status !== 'ready') return
        const conv = list.conversations.find((c) => c.playdateId === threadId)
        if (conv !== undefined && conv.otherPartyDisplayName !== '') return
        setFallbackTitle(row.title ?? '')
        if (row.host_profile_id !== userId) {
          // The caller is a pinger; the other party is the host.
          setFallbackCounterpart({
            id: row.host_profile_id,
            name: row.host?.display_name ?? '',
          })
        } else {
          // The caller is the host; the other party is the most recent pinger
          // that actually has a display name (the pre-t11 semantics).
          const namedPingers = row.pings.filter(
            (ping) => (ping.profile?.display_name ?? '') !== '',
          )
          const latest = namedPingers[namedPingers.length - 1]?.profile ?? null
          setFallbackCounterpart({ id: latest?.id ?? '', name: latest?.display_name ?? '' })
        }
      } catch {
        // A failed fallback never blocks the thread view.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [list, threadId, session])

  // Real-time: live UPDATE of whichever view is open. The channel is rebuilt
  // on every view change (and torn down on unmount) so a stale filter can
  // never deliver into the wrong conversation. Two shapes:
  //   - thread open — append INSERTs for the open thread without a reload.
  //     For free-form DMs, we subscribe to messages where sender_id = me OR
  //     the other party (filtered client-side by playdate_id IS NULL);
  //   - list view — subscribe to ALL message INSERTs with NO server filter and
  //     bump `reloadToken`, which the list-load effect above keys on.
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
    // List view: no thread is open. Subscribe to ALL message INSERTs with NO
    // server-side filter — Supabase Realtime applies the caller's RLS, so only
    // rows this parent may read are delivered. Each one bumps `reloadToken`,
    // which the list-load effect above keys on (listConversations +
    // listDirectConversations, hence the unread counts). This subscription
    // never writes into `thread` state.
    if (threadId === null && dmTargetId === null) {
      const listChannel = supabase
        .channel('inbox-list')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
          setReloadToken((token) => token + 1)
        })
        .subscribe()
      return () => {
        void supabase.removeChannel(listChannel)
      }
    }
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

  // Returning to the tab refetches the list. A background tab throttles
  // realtime delivery, so on the next visible moment bump `reloadToken` once to
  // reconcile previews/times/unread counts with the server. The listener is
  // removed on unmount.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setReloadToken((token) => token + 1)
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

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

  /**
   * Optimistic append + the real write.
   *
   * V27 slice 5: a FAILED write no longer deletes the optimistic row (the old
   * behaviour made a parent's words disappear with no trace). The bubble stays
   * visible, its id is recorded in `failedIds` so it wears `Not sent · Retry`,
   * and the inline error line still explains why. Retry (`handleRetry`) re-runs
   * the SAME body; the realtime echo then reconciles the `pending-` row via
   * `reconcileOptimisticMessage` (sender+body match).
   */
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
      // KEEP the optimistic row and flag it failed (never filter it out).
      setFailedIds((ids) => (ids.includes(optimistic.id) ? ids : [...ids, optimistic.id]))
      setSendError(err instanceof Error ? err.message : 'Could not send your message.')
    } finally {
      setSending(false)
    }
  }

  /**
   * V27 slice 5: re-send a FAILED bubble.
   *
   * Deliberately uses `message.body` — the body the bubble was created with —
   * NOT the composer draft, so retry re-sends exactly the message the parent
   * wrote. The realtime echo reconciles the `pending-` row by sender+body.
   *
   * GUARD: if the `pending-` row is already gone (the echo landed and replaced
   * it with the real uuid), there is nothing to retry — sending again would
   * duplicate the message. The marker is simply cleared and no wire call fires.
   */
  async function handleRetry(message: MessageRow): Promise<void> {
    if (userId === null) return
    const stillPending =
      thread !== null &&
      thread.status === 'ready' &&
      thread.messages.some((m) => m.id === message.id)
    if (!stillPending) {
      setFailedIds((ids) => ids.filter((id) => id !== message.id))
      return
    }
    setSending(true)
    setSendError(null)
    try {
      if (dmTargetId !== null) {
        await sendDirectMessage(dmTargetId, message.body)
      } else if (threadId !== null) {
        await sendMessage(threadId, message.body)
      } else {
        return
      }
      // Success: drop the marker; the realtime echo reconciles the pending row.
      setFailedIds((ids) => ids.filter((id) => id !== message.id))
    } catch (err: unknown) {
      // Put the marker back and say so honestly.
      setFailedIds((ids) => (ids.includes(message.id) ? ids : [...ids, message.id]))
      setSendError(err instanceof Error ? err.message : 'Could not send your message.')
    } finally {
      setSending(false)
    }
  }

  /**
   * V27 slice 5: a quick-reply chip fills the composer with its body and
   * focuses the textarea. It NEVER sends — the parent may amend first, and Send
   * (or Enter) is still an explicit act.
   */
  function applyQuickReply(body: string): void {
    setDraft(body)
    setSendError(null)
    const el = composerRef.current
    if (el !== null) {
      el.style.height = 'auto'
      el.focus()
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
  //
  // V25: a row whose counterpart could NOT be resolved keeps its own row and
  // carries `mergeKey` (src/lib/inbox.ts `mergeKeyFor`) as its identity, which
  // is what the list key and the card's testids use. `otherPartyId` is '' for
  // every such row, so it cannot tell two of them apart.
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

  // --- V25 ticket 11: the thread's identity, DERIVED at render --------------
  //
  // The counterpart used to be written into `thread` by effects; it is now a
  // useMemo over the data the page already has, so no load ordering can empty
  // it (see the comment above the playdates fallback effect). Priority:
  //   1. the conversation-list / DM row (the richest source, and what the
  //      merged LIST row itself renders);
  //   2. the playdates fallback read, when there is no named list row;
  //   3. the thread's OWN single non-own sender, from the sender embed the
  //      thread read now carries — this is the founder's case: one message
  //      from one parent, whose name the header could not previously keep.
  const listCounterpart = useMemo<Counterpart>(() => {
    if (dmTargetId !== null) {
      const conv = directConvs.find((c) => c.otherPartyId === dmTargetId)
      // The DM target's id is known even before its row loads (we opened the
      // thread with it) — only the NAME depends on the row.
      return { id: dmTargetId, name: conv?.otherPartyName ?? '' }
    }
    if (threadId === null || list.status !== 'ready') return { id: '', name: '' }
    const conv = list.conversations.find((c) => c.playdateId === threadId)
    if (conv === undefined) return { id: '', name: '' }
    return { id: conv.otherPartyId, name: conv.otherPartyDisplayName }
  }, [dmTargetId, threadId, directConvs, list])

  const counterpart = useMemo<Counterpart>(
    () =>
      firstNamedCounterpart([
        listCounterpart,
        fallbackCounterpart,
        singleSenderCounterpart(
          thread !== null && thread.status === 'ready' ? thread.messages : NO_MESSAGES,
          userId,
        ),
      ]),
    [listCounterpart, fallbackCounterpart, thread, userId],
  )

  /** The counterpart is written down once, in the header — never over a bubble. */
  const threadHeaderName = counterpart.name
  const threadHeaderTitle = useMemo(() => {
    if (threadId !== null && list.status === 'ready') {
      const conv = list.conversations.find((c) => c.playdateId === threadId)
      if (conv !== undefined) return conv.playdateTitle
    }
    return fallbackTitle
  }, [threadId, list, fallbackTitle])

  // V27 slice 4: the header's GROUP label, derived from the context read. `null`
  // for a 1:1 (0–1 others) or a DM, so the counterpart name stands unchanged.
  const threadHeaderGroupLabel = useMemo(
    () => groupLabel(contextParticipants, userId),
    [contextParticipants, userId],
  )

  // V27 slice 4: the drop-in context line — `when · place`, decided by the pure
  // `threadContextLine` (inbox.ts). A DM thread has no playdate context, so the
  // line is suppressed outright; a missing half is omitted by the helper, never
  // rendered as `null`/`undefined`/a dangling `·`.
  const threadDropInLine = useMemo(
    () =>
      threadId === null
        ? null
        : threadContextLine(contextStartsAt, contextEndsAt, contextPlaceName),
    [threadId, contextStartsAt, contextEndsAt, contextPlaceName],
  )

  // V27 s5: ONE `now` per render, so every bubble's time and every day
  // separator in this frame are computed against the same instant.
  const nowIso = new Date().toISOString()

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
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 px-4 text-base font-semibold text-indigo-700 transition-colors motion-reduce:transition-none hover:bg-indigo-100"
          >
            + New message
          </button>

          {/* User-search modal (the "New message" picker). */}
          {showNewMessage ? (
            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">Message a parent</p>
              {/* V24 slice 04 (ticket 04): the field's leading magnifying-glass
                  glyph. Decorative (aria-hidden) — the placeholder is still the
                  input's accessible name, the testid and the ≥16px text are
                  unchanged, and only the left padding moves for the icon. */}
              <div className="relative mt-2">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-slate-400"
                >
                  <SearchGlyph />
                </span>
                <input
                  type="text"
                  data-testid="dm-search-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name…"
                  className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-base focus-visible:border-indigo-400 focus-visible:outline-none"
                  autoFocus
                />
              </div>
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
                        className="w-full rounded-lg px-3 py-2.5 text-left text-base text-slate-800 transition-colors motion-reduce:transition-none hover:bg-slate-50"
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
                className="mt-2 inline-flex min-h-11 items-center rounded-xl border border-red-300 bg-white px-3 text-base font-medium text-red-700"
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
                    className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-indigo-600 px-4 text-base font-semibold text-white"
                  >
                    Browse places
                  </Link>
                </div>
              ) : (
                <ul className="mt-4 flex flex-col gap-2">
                  {/* Each row's IDENTITY, not its counterpart id: two
                      unresolved rows both carry otherPartyId === '', so keying
                      on that gives them the same React key (and the same
                      testids inside ConversationCard). */}
                  {mergedConversations.map((row) => (
                    <li key={row.mergeKey}>
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
          {/* Thread header: the shared back control + the post's title + the other party.
              V24 slice 02: the ad-hoc bordered "←" square became BackControl (one
              circular control app-wide); the destination ("conversations") lives in
              the heading below, not inside the control.

              V27 slice 4: a playdate thread's identity block is a LINK back to
              the post (/playdate/:id) and names the group + the drop-in's
              window/place. The link is a SIBLING of BackControl — never an
              ancestor — so it cannot swallow the back tap, and the inner
              `div.min-w-0` is kept so the e2e header selector
              (`div.min-w-0 > p`) still resolves. A DM thread has no playdate to
              link to, so it keeps the plain block. */}
          <div className="flex items-center gap-2">
            <BackControl onClick={closeThread} testId="inbox-back-to-conversations" />
            {threadId !== null ? (
              <Link
                to={`/playdate/${threadId}`}
                data-testid="inbox-thread-playdate-link"
                className="min-w-0 flex-1 rounded-lg transition-colors motion-reduce:transition-none hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {threadHeaderGroupLabel ?? threadHeaderName}
                  </p>
                  <p className="truncate text-xs text-slate-500">{threadHeaderTitle}</p>
                  {threadDropInLine !== null ? (
                    <p
                      data-testid="inbox-thread-context"
                      className="truncate text-xs text-slate-500"
                    >
                      {threadDropInLine}
                    </p>
                  ) : null}
                </div>
              </Link>
            ) : (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{threadHeaderName}</p>
                <p className="truncate text-xs text-slate-500">{threadHeaderTitle}</p>
              </div>
            )}
          </div>

          {list.status === 'error' ? (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-700">{list.message}</p>
              <button
                type="button"
                onClick={() => setReloadToken((token) => token + 1)}
                className="mt-2 inline-flex min-h-11 items-center rounded-xl border border-red-300 bg-white px-3 text-base font-medium text-red-700"
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
                  thread.messages.map((message, index) => {
                    // V27 s5: one separator per DAY — the app's ONE day rule
                    // (localDayKey) decides the boundary, so the thread breaks
                    // exactly where the feed would start a new day section.
                    // The FIRST message always gets its day label.
                    const dayKey = localDayKey(message.created_at)
                    const previous = index > 0 ? thread.messages[index - 1] : null
                    const separatorLabel =
                      previous === null || localDayKey(previous.created_at) !== dayKey
                        ? daySeparatorLabel(message.created_at, nowIso)
                        : ''
                    return (
                      <Fragment key={message.id}>
                        {separatorLabel !== '' ? (
                          <p
                            data-testid={`day-separator-${dayKey}`}
                            className="mt-1 text-center text-sm font-medium text-slate-500"
                          >
                            {separatorLabel}
                          </p>
                        ) : null}
                        <MessageBubble
                          message={message}
                          isOwn={userId !== null && message.sender_id === userId}
                          senderName={messageSenderLabel(message, {
                            viewerId: userId,
                            viewerDisplayName: profile?.display_name ?? null,
                            // The thread-level name is a LAST resort, and only when
                            // the ids match — a group thread can never attribute
                            // one participant's message to another.
                            counterpart,
                          })}
                          timeLabel={messageTimestampLabel(message.created_at, nowIso)}
                          failed={failedIds.includes(message.id)}
                          reaction={reactions[message.id] ?? { count: 0, mine: false, myKind: null }}
                          onReact={(messageId, kind) => void handleReact(messageId, kind)}
                          onRetry={(failedMessage) => void handleRetry(failedMessage)}
                        />
                      </Fragment>
                    )
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* V27 s5: one-tap meetup replies, ABOVE the composer. A chip
                  fills the draft and focuses the textarea; it never sends, so
                  the parent can amend first. Hidden while a send is in flight.
                  Every chip is a 44px (`min-h-11`) control at the 14px floor,
                  and the row scrolls horizontally rather than wrapping at
                  390px. */}
              {!sending ? (
                <div
                  data-testid="quick-replies"
                  className="mt-3 flex gap-2 overflow-x-auto pb-1"
                >
                  {QUICK_REPLIES.map((reply, index) => (
                    <button
                      key={reply.label}
                      type="button"
                      data-testid={`quick-reply-${index}`}
                      onClick={() => applyQuickReply(reply.body)}
                      className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition-colors motion-reduce:transition-none hover:bg-slate-50"
                    >
                      {reply.label}
                    </button>
                  ))}
                </div>
              ) : null}

              {/* Composer: auto-grow textarea (max ~4 lines) + Send (disabled
                  when empty). Enter sends on desktop; Shift+Enter breaks. */}
              <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                <textarea
                  ref={composerRef}
                  value={draft}
                  onChange={handleComposerChange}
                  onKeyDown={handleComposerKeyDown}
                  rows={1}
                  placeholder="Write a message…"
                  className="w-full resize-none rounded-lg border-0 bg-transparent p-1 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
                />
                {sendError !== null ? <p className="mt-1 text-xs text-red-600">{sendError}</p> : null}
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    disabled={draft.trim().length === 0 || sending}
                    onClick={() => void handleSend()}
                    className="inline-flex min-h-11 items-center rounded-xl bg-indigo-600 px-4 text-base font-semibold text-white disabled:opacity-50"
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
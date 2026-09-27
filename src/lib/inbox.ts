/**
 * V23 s7 — the inbox's conversation-list merge.
 *
 * The inbox renders TWO separate lists today: free-form DM conversations and
 * playdate-scoped conversations. Nothing dedupes across them, so a parent who
 * has BOTH a DM thread and a playdate conversation with the caller appears
 * twice. This module collapses those two lists into ONE list, keyed on the
 * counterpart's PROFILE id (never the display name — two parents can share a
 * name, and collapsing on it would merge two real people, which is worse than
 * the duplicate).
 *
 * Each counterpart keeps its newest DM and newest playdate row. A group with
 * both kinds keeps the overall winner's identity and sums those two unread
 * counts; a single-kind group keeps its newest row's count.
 *
 * House pattern: a PURE decision (mergeConversations) + a typed row shape. No
 * Supabase client, no React — trivially testable, mock-free.
 */

import { localDayKey } from './feed'

/** A normalized row of the merged inbox list (one per distinct counterpart). */
export interface MergedConversation {
  /**
   * The counterpart's profile id, and '' when the counterpart could not be
   * resolved. This is NOT a row identity: EVERY unresolved row carries '',
   * so several rows share it at once. It is kept because it is the real
   * profile id for the avatar and for DM navigation; the LIST keys on
   * `mergeKey`.
   */
  otherPartyId: string
  /**
   * THIS ROW's identity in the list — the per-conversation merge key that
   * produced it (`mergeKeyFor`). The list's React key and the row's
   * `data-testid` are built from this, never from `otherPartyId` (which
   * collapses two unresolved playdate rows onto one key and one testid) and
   * never from `latestAt` (a new message changes it).
   */
  mergeKey: string
  /** The counterpart's display name (the bold line). */
  otherPartyName: string
  /** The latest message's body, truncated to ~60 chars. */
  preview: string
  /** The latest message's created_at (ISO). */
  latestAt: string
  /**
   * V24 slice 04: the counterpart's PUBLIC parent avatar (`profiles.avatar_url`)
   * — the row's face, falling back to the initial placeholder when null. The
   * family/kid photos are the PRIVATE bucket and are never shown for someone
   * else's row.
   */
  otherPartyAvatarUrl: string | null
  /**
   * V24 slice 04: the counterpart's retention cursor (`profiles.last_seen_at`,
   * migration 0024). The activity line's ONLY input — see `activeTodayLabel`.
   */
  otherPartyLastSeenAt: string | null
  /** Unread messages for this row, or the sum of a collapsed DM and playdate row. */
  unreadCount: number
  /** Which kind of thread this row opens. */
  kind: 'dm' | 'playdate'
  /** The playdate id (kind === 'playdate' only). */
  playdateId?: string
}

/** A free-form DM conversation row (from listDirectConversationsWithClient). */
export interface DmConversationRow {
  otherPartyId: string
  otherPartyName: string
  otherPartyAvatarUrl: string | null
  otherPartyLastSeenAt: string | null
  latestAt: string
  preview: string
  unreadCount: number
}

/** A playdate-scoped conversation row (a ConversationSummary from db.ts). */
export interface PlaydateConversationRow {
  playdateId: string
  playdateTitle: string
  otherPartyDisplayName: string
  otherPartyId: string
  /** The counterpart's public parent avatar (V24 slice 04) — see MergedConversation. */
  otherPartyAvatarUrl: string | null
  /** The counterpart's retention cursor (V24 slice 04) — see MergedConversation. */
  otherPartyLastSeenAt: string | null
  latestMessagePreview: string
  latestMessageAt: string
  unreadCount: number
}

/**
 * The fields `mergeKeyFor` reads — a subset of every row shape this module
 * merges (`DmConversationRow`, `PlaydateConversationRow`, the internal
 * `Normalized` shape, and `MergedConversation`).
 */
export interface MergeKeyFields {
  /** The counterpart's profile id; '' when the counterpart is unresolved. */
  otherPartyId: string
  /** Which kind of thread this row opens. */
  kind: 'dm' | 'playdate'
  /** The playdate id — present on every playdate-kind row, absent on a DM. */
  playdateId?: string
}

/**
 * The per-conversation MERGE KEY: the identity of one conversation in the
 * merged inbox list.
 *
 * THE DEFECT THIS EXISTS FOR. `c253865` made `mergeConversations` able to
 * emit SEVERAL rows whose `otherPartyId` is `''` (one per unresolved
 * conversation) — which is the point of that fix — but the key that told
 * those rows apart lived only INSIDE `mergeConversations`, and the consumer
 * (`InboxPage.tsx`) keyed both the list and the `data-testid` on
 * `otherPartyId`. Two unresolved playdate rows therefore produced the SAME
 * React key (`row.otherPartyId || row.kind` → `'playdate'`) and the SAME
 * testid (`inbox-row-` + `''`). Exposing the key as this pure function — and
 * on `MergedConversation` as `mergeKey` — gives every row a real identity.
 *
 * THE RULE, in order:
 *   1. a RESOLVED counterpart → its profile id. The id is what distinct
 *      people cannot share, which is why this merge is id-keyed and never
 *      name-keyed;
 *   2. an UNRESOLVED playdate row → `playdate:<playdateId>`. The playdate's
 *      own id IS a durable identity, so two unresolved conversations stay two
 *      rows, and the row's identity does not change when a message arrives;
 *   3. an UNRESOLVED DM row → `dm:unresolved:<unresolvedOrdinal>`, the count
 *      of unresolved DM rows preceding it in this merge. Deliberately NOT
 *      `dm:<latestAt>`: a message timestamp is not an identity — a new
 *      message changes it, and two unresolved conversations whose latest
 *      messages share a timestamp would collapse back into ONE bucket, i.e.
 *      the original bug resurfacing on a tie. An unresolved DM row carries no
 *      id of ANY kind (there is none on `DmConversationRow`, and db.ts's
 *      `listDirectConversationsWithClient` keys its Map on profile PKs — the
 *      sender's or the recipient's — so `''` cannot occur from today's
 *      producer; see the reachability note in `mergeConversations`), so the
 *      ordinal is the only discriminator this module can compute. It is
 *      stable for a given input array; if an unresolved DM row ever becomes
 *      producible, the real fix is a conversation id ON the row.
 *
 * Pure: reads three fields and an ordinal. No I/O, no clock, no mutation.
 */
export function mergeKeyFor(row: MergeKeyFields, unresolvedOrdinal = 0): string {
  if (row.otherPartyId !== '') return row.otherPartyId
  if (row.kind === 'playdate') return `playdate:${row.playdateId}`
  return `dm:unresolved:${unresolvedOrdinal}`
}

/**
 * Collapse a DM row and a playdate row for the SAME counterpart id into one
 * row, preferring the row with the newer `latestAt`. Rows with DIFFERENT
 * counterpart ids never collapse (the same-name-different-id case must stay
 * two rows).
 *
 * Pure: no mutation of the inputs, no I/O. Returns a new array sorted by
 * `latestAt` descending (newest first), matching the inbox's existing sort.
 *
 * Within each kind, the newest row is retained. The overall winner is
 * whichever retained row has the newer `latestAt`; on a tie the PLAYDATE row
 * wins (it carries the richer context: the post title). A group with both
 * kinds sums those retained rows' unreadCounts; a single-kind group keeps its
 * winner's unreadCount.
 *
 * Each emitted row carries its bucket's key as `mergeKey` — the identity the
 * consumer keys the list and the row's testid on. `otherPartyId` cannot serve
 * that role, because every unresolved row carries ''.
 *
 * REACHABILITY of an unresolved row, from the PRODUCERS (db.ts). A
 * `DmConversationRow` can never carry '': `listDirectConversationsWithClient`
 * builds its `byOtherParty` Map from `row.sender_id` (db.ts:4891) or
 * `recipient.id` (db.ts:4905), both profile PKs. A
 * `PlaydateConversationRow` CAN: `listConversationsWithClient` derives
 * `otherPartyId` as `counterpartIds[playdateId] ?? ''` (db.ts:4384-4387) and
 * only reaches that fallback when the caller SENT the last message
 * (`entry.latest.sender_id === userId`), while `counterpartIds` is ''
 * whenever the caller is the HOST and no pinger resolves (db.ts:4305,
 * `lastPinger?.id ?? ''`) — i.e. the host has messaged a playdate that has no
 * visible `going_pings` profile (nobody pinged, or the pinger un-pinged, which
 * DELETEs the row — trust.ts:68-75). Two such playdates produce two unresolved
 * playdate rows all carrying '', which is the collision `mergeKey` exists to
 * resolve.
 */
export function mergeConversations(
  dmRows: DmConversationRow[],
  playdateRows: PlaydateConversationRow[],
): MergedConversation[] {
  // Normalize both kinds into a common internal shape, tagged with their kind.
  type Normalized = {
    otherPartyId: string
    otherPartyName: string
    otherPartyAvatarUrl: string | null
    otherPartyLastSeenAt: string | null
    preview: string
    latestAt: string
    unreadCount: number
    kind: 'dm' | 'playdate'
    playdateId?: string
  }

  const dmNormalized: Normalized[] = dmRows.map((row) => ({
    otherPartyId: row.otherPartyId,
    otherPartyName: row.otherPartyName,
    otherPartyAvatarUrl: row.otherPartyAvatarUrl ?? null,
    otherPartyLastSeenAt: row.otherPartyLastSeenAt ?? null,
    preview: row.preview,
    latestAt: row.latestAt,
    unreadCount: row.unreadCount,
    kind: 'dm',
  }))

  const playdateNormalized: Normalized[] = playdateRows.map((row) => ({
    otherPartyId: row.otherPartyId,
    otherPartyName: row.otherPartyDisplayName,
    otherPartyAvatarUrl: row.otherPartyAvatarUrl ?? null,
    otherPartyLastSeenAt: row.otherPartyLastSeenAt ?? null,
    preview: row.latestMessagePreview,
    latestAt: row.latestMessageAt,
    unreadCount: row.unreadCount,
    kind: 'playdate',
    playdateId: row.playdateId,
  }))

  type CounterpartRows = Partial<Record<Normalized['kind'], Normalized>>
  const byKey = new Map<string, CounterpartRows>()
  // An UNRESOLVED counterpart (otherPartyId === '') must not share one ''
  // bucket: `mergeKeyFor` keys it PER CONVERSATION (the playdate's own id, or
  // an ordinal for a DM) so every distinct conversation keeps its own row
  // instead of collapsing into one survivor that sums their unreadCounts.
  // Only the unresolved-DM case consumes an ordinal, because a DM row is the
  // one shape with no id of any kind — see `mergeKeyFor`.
  let unresolvedDmOrdinal = 0
  for (const row of [...dmNormalized, ...playdateNormalized]) {
    const key = mergeKeyFor(row, unresolvedDmOrdinal)
    if (row.otherPartyId === '' && row.kind === 'dm') unresolvedDmOrdinal += 1
    const counterpartRows = byKey.get(key) ?? {}
    const existing = counterpartRows[row.kind]
    if (
      existing === undefined ||
      row.latestAt > existing.latestAt ||
      (row.latestAt === existing.latestAt && row.kind === 'playdate')
    ) {
      counterpartRows[row.kind] = row
    }
    byKey.set(key, counterpartRows)
  }

  // The BUCKET'S KEY is the row's identity: it is what told these rows apart,
  // so it rides out as `mergeKey` and the consumer keys the list item and the
  // row's testid on it. `otherPartyId` cannot serve that role — it is '' for
  // every unresolved row.
  const merged: MergedConversation[] = Array.from(byKey, ([mergeKey, { dm, playdate }]) => {
    if (dm === undefined) return { ...playdate!, mergeKey }
    if (playdate === undefined) return { ...dm, mergeKey }
    const winner = dm.latestAt > playdate.latestAt ? dm : playdate
    return { ...winner, mergeKey, unreadCount: dm.unreadCount + playdate.unreadCount }
  })
  // Newest first (matches the inbox's existing sort order).
  merged.sort((a, b) => (a.latestAt < b.latestAt ? 1 : -1))
  return merged
}

/**
 * V25 ticket 11 — the thread's per-MESSAGE identity.
 *
 * THE DEFECT THIS EXISTS FOR. The bubble label used to be a THREAD-level value:
 * `threadHeaderName || 'Unknown'` (InboxPage), where `threadHeaderName` came
 * from the conversation's counterpart. Two consequences, both observed live:
 * a single-sender thread whose header had not resolved yet printed the literal
 * "Unknown" over a real parent's message; and in a group thread every
 * non-own bubble wore the COUNTERPART's name, so a third participant's message
 * was attributed to someone else.
 *
 * THE RULE. A bubble is labelled by the message's OWN `sender_id`, resolved to
 * that profile's display name (carried on the row by the thread read's
 * `sender:profiles!messages_sender_id_fkey ( display_name )` embed). The
 * thread-level counterpart name is used ONLY when the message's sender id
 * equals the counterpart's id — never by position, so no participant can be
 * mislabelled as another. When the sender genuinely cannot be named, the label
 * is ABSENT (`null`) rather than the word "Unknown": a missing label is
 * ambiguous, but "Unknown" reads as a broken person, which is what the founder
 * reported.
 */

/** A message row's sender identity — the two fields this module needs. */
export interface MessageSenderFields {
  sender_id: string
  /** The sender's OWN display name, embedded by the thread read; null when absent. */
  sender_display_name?: string | null
}

/** The one participant a thread is "with", as far as the view can tell. */
export interface Counterpart {
  /** The profile id ('' when the view genuinely does not know it). */
  id: string
  /** The display name ('' when unknown — never "Unknown"). */
  name: string
}

/** Blank/absent names are "unknown", never a name. */
function nameOrEmpty(value: string | null | undefined): string {
  return value === null || value === undefined ? '' : value.trim()
}

/** The first candidate that carries a real name, else an unnamed counterpart. */
export function firstNamedCounterpart(
  candidates: ReadonlyArray<Counterpart | null | undefined>,
): Counterpart {
  for (const candidate of candidates) {
    if (candidate !== null && candidate !== undefined && nameOrEmpty(candidate.name) !== '') {
      return { id: candidate.id, name: candidate.name }
    }
  }
  return { id: '', name: '' }
}

/**
 * The thread's single non-own sender — its id and display name — but ONLY when
 * every non-own message in the thread comes from the SAME profile. With two or
 * more distinct non-own senders (a group) it returns null: a group thread has
 * no one counterpart, and picking one would invent an attribution.
 *
 * This is what lets the HEADER survive the thread read: the read carries each
 * message's own sender embed, so a single-sender thread can name itself even
 * when the conversation-list row and the playdates fallback both miss.
 */
export function singleSenderCounterpart(
  messages: readonly MessageSenderFields[],
  viewerId: string | null,
): Counterpart | null {
  const bySenderId = new Map<string, string>()
  for (const message of messages) {
    if (viewerId !== null && message.sender_id === viewerId) continue
    const name = nameOrEmpty(message.sender_display_name)
    const known = bySenderId.get(message.sender_id)
    // First sighting wins unless it was anonymous and a later row carries the name.
    if (known === undefined || (known === '' && name !== '')) {
      bySenderId.set(message.sender_id, name)
    }
  }
  if (bySenderId.size !== 1) return null
  const [id, name] = Array.from(bySenderId.entries())[0]
  return { id, name }
}

/**
 * The label above ONE message bubble, or `null` for NO label at all.
 *
 *  - own message → the viewer's own display name, or "You" when absent;
 *  - another participant → THEIR display name from the message's own row;
 *  - an unnamed participant → the thread counterpart's name, and only when the
 *    sender id IS the counterpart id;
 *  - otherwise → `null` (no label). NEVER the word "Unknown".
 */
export function messageSenderLabel(
  message: MessageSenderFields,
  context: {
    viewerId: string | null
    viewerDisplayName?: string | null
    counterpart?: Counterpart | null
  },
): string | null {
  if (context.viewerId !== null && message.sender_id === context.viewerId) {
    const own = nameOrEmpty(context.viewerDisplayName)
    return own !== '' ? own : 'You'
  }
  const sender = nameOrEmpty(message.sender_display_name)
  if (sender !== '') return sender
  const counterpart = context.counterpart ?? null
  if (counterpart !== null && counterpart.id !== '' && counterpart.id === message.sender_id) {
    const name = nameOrEmpty(counterpart.name)
    if (name !== '') return name
  }
  return null
}

/**
 * V24 slice 04 (ticket 04): the inbox row's ACTIVITY LINE — "Active today",
 * decided purely from the counterpart's retention cursor
 * (`profiles.last_seen_at`, migration 0024).
 *
 * It is deliberately NOT presence. There is no realtime subscription and the
 * words "now" and "online" appear nowhere: the cursor is a coarse timestamp the
 * app already writes (on a feed visit), so the only honest claim it supports is
 * "today". On any other day — or with no cursor at all — the line is ABSENT
 * rather than a lie about a parent who has not opened the app in a week.
 *
 * `localDayKey` is the app's ONE day rule (the feed sections' seam), so "today"
 * means the same thing on this row as it does in the feed.
 */
export function activeTodayLabel(
  lastSeenAtIso: string | null | undefined,
  nowIso: string,
): string | null {
  if (lastSeenAtIso === null || lastSeenAtIso === undefined || lastSeenAtIso === '') return null
  return localDayKey(lastSeenAtIso) === localDayKey(nowIso) ? 'Active today' : null
}

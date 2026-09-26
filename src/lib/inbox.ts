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
  /** The counterpart's profile id (the merge key; '' when unknown). */
  otherPartyId: string
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
  for (const row of [...dmNormalized, ...playdateNormalized]) {
    const key = row.otherPartyId
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

  const merged: MergedConversation[] = Array.from(byKey.values(), ({ dm, playdate }) => {
    if (dm === undefined) return playdate!
    if (playdate === undefined) return dm
    const winner = dm.latestAt > playdate.latestAt ? dm : playdate
    return { ...winner, unreadCount: dm.unreadCount + playdate.unreadCount }
  })
  // Newest first (matches the inbox's existing sort order).
  merged.sort((a, b) => (a.latestAt < b.latestAt ? 1 : -1))
  return merged
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

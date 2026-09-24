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
 * House pattern: a PURE decision (mergeConversations) + a typed row shape. No
 * Supabase client, no React — trivially testable, mock-free.
 */

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
  /** Unread count for this row (playdate cursor or DM cursor; 0 when read). */
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
 * When two rows share a counterpart id, the winner is whichever has the newer
 * `latestAt`; on a tie the PLAYDATE row wins (it carries the richer context:
 * the post title).
 * The losing row's identity is discarded — there is exactly ONE row per
 * counterpart id in the output.
 */
export function mergeConversations(
  dmRows: DmConversationRow[],
  playdateRows: PlaydateConversationRow[],
): MergedConversation[] {
  // Normalize both kinds into a common internal shape, tagged with their kind.
  type Normalized = {
    otherPartyId: string
    otherPartyName: string
    preview: string
    latestAt: string
    unreadCount: number
    kind: 'dm' | 'playdate'
    playdateId?: string
  }

  const dmNormalized: Normalized[] = dmRows.map((row) => ({
    otherPartyId: row.otherPartyId,
    otherPartyName: row.otherPartyName,
    preview: row.preview,
    latestAt: row.latestAt,
    unreadCount: row.unreadCount,
    kind: 'dm',
  }))

  const playdateNormalized: Normalized[] = playdateRows.map((row) => ({
    otherPartyId: row.otherPartyId,
    otherPartyName: row.otherPartyDisplayName,
    preview: row.latestMessagePreview,
    latestAt: row.latestMessageAt,
    unreadCount: row.unreadCount,
    kind: 'playdate',
    playdateId: row.playdateId,
  }))

  // Key on the counterpart id. An empty id ('') is still a valid key: it means
  // "unknown counterpart" and we keep such rows as-is (they cannot collide with
  // a real id, and dropping them would hide conversations).
  const byKey = new Map<string, Normalized>()
  for (const row of [...dmNormalized, ...playdateNormalized]) {
    const key = row.otherPartyId
    const existing = byKey.get(key)
    if (existing === undefined) {
      byKey.set(key, row)
      continue
    }
    // Same counterpart id → prefer the newer latestAt; on a tie the playdate
    // row wins (richer context: the post title).
    if (row.latestAt > existing.latestAt) {
      byKey.set(key, row)
    } else if (row.latestAt === existing.latestAt && row.kind === 'playdate') {
      byKey.set(key, row)
    }
  }

  const merged: MergedConversation[] = Array.from(byKey.values())
  // Newest first (matches the inbox's existing sort order).
  merged.sort((a, b) => (a.latestAt < b.latestAt ? 1 : -1))
  return merged
}
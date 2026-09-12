/**
 * The comment-row action confirm seam (V8 ticket 10): "Delete" on a comment
 * used to fire the moment it was tapped — the row vanished with no question
 * asked and no way back (a hard DELETE, and 0023's parent_id self-FK cascades
 * every reply with it).
 *
 * WHY A STATE MACHINE, NOT A `useState<boolean>`. The confirm that replaced it
 * has real decisions in it, and they are the kind of decisions that go wrong
 * quietly:
 *  - WHICH ROW is armed (one dialog for a whole thread, so the pending action
 *    has to carry the row, its author and its reply count);
 *  - arming while a write is already in flight must be REFUSED (two overlapping
 *    comment writes is exactly the race this page has been bitten by before);
 *  - CONFIRMING must clear the arm as it takes the write (the dialog closes on
 *    the tap, the row shows the busy state);
 *  - CANCEL must clear the arm and nothing else.
 *
 * Pure, free of React/Supabase (the trust.ts / feed.ts convention), so those
 * rules are unit-tested rather than implied by three useState calls.
 *
 * SCOPE (a decision, not an omission): only DELETE is armed. Hide and Unhide
 * ship as one-tap moderator actions — they are reversible by the same button
 * (unhide now exists next to hide), they are the mod's fast path for spam, and
 * putting a modal in front of them was not asked for. The union below is the
 * extension point if that call ever changes.
 */

/** The comment-row actions that ASK BEFORE THEY WRITE. */
export type ConfirmableCommentAction = 'delete'

/** The action armed against one comment row, waiting for a yes or a no. */
export interface PendingCommentAction {
  kind: ConfirmableCommentAction
  commentId: string
  /** Whose comment it is — the dialog names it; "are you sure?" names nothing. */
  authorHandle: string
  /**
   * Replies that ride along with a delete (0023's parent_id self-FK is ON
   * DELETE CASCADE, so a top-level row takes its one-level replies with it).
   * Always 0 on a reply row.
   */
  replyCount: number
}

export interface CommentActionState {
  /** The armed action (null = no dialog). */
  pending: PendingCommentAction | null
  /** A comment write is in flight (the row actions and the composer share this one guard). */
  busy: boolean
}

export const INITIAL_COMMENT_ACTION_STATE: CommentActionState = { pending: null, busy: false }

/** Arm one action: refused while a write is in flight; otherwise the last arm wins. */
export function armCommentAction(
  state: CommentActionState,
  action: PendingCommentAction,
): CommentActionState {
  if (state.busy) return state
  return { pending: action, busy: state.busy }
}

/** Drop the armed action (Cancel, Esc, a backdrop click). The busy flag is untouched. */
export function cancelCommentAction(state: CommentActionState): CommentActionState {
  if (state.pending === null) return state
  return { pending: null, busy: state.busy }
}

/**
 * Take the write: the arm is consumed (the dialog closes with the tap) and the
 * row goes busy. Used by the confirm AND by the un-armed paths (hide, unhide,
 * the composer's own submit) so every comment write shares one in-flight guard.
 * The previous state is ignored on purpose — this transition only ever ends in
 * one place, and taking an argument keeps the machine's transitions uniform.
 */
export function beginCommentAction(_state: CommentActionState): CommentActionState {
  return { pending: null, busy: true }
}

/** The write settled (success or failure): the row's buttons come back, and no
 * stale dialog is resurrected with them. */
export function endCommentAction(state: CommentActionState): CommentActionState {
  if (!state.busy) return state
  return { pending: null, busy: false }
}

export function isCommentActionBusy(state: CommentActionState): boolean {
  return state.busy
}

/** The dialog's copy for the armed action — it names the thing and its consequence. */
export function commentActionDialogCopy(action: PendingCommentAction): {
  title: string
  body: string
  confirmLabel: string
} {
  return {
    title: 'Delete this comment?',
    body:
      `@${action.authorHandle}’s comment goes away for everyone.` +
      (action.replyCount > 0
        ? ` Its ${action.replyCount === 1 ? 'reply' : `${action.replyCount} replies`} go too.`
        : '') +
      ' This can’t be undone.',
    confirmLabel: 'Delete comment',
  }
}

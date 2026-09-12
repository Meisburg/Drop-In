/**
 * Unit tests for the comment-action confirm seam (V8 ticket 10): the arm →
 * confirm/cancel machine behind the comment Delete confirmation.
 *
 * What these tests pin:
 *  - an arm is REFUSED while a comment write is in flight (no second dialog,
 *    no overlapping write);
 *  - arming a second row replaces the first (one dialog per thread);
 *  - Cancel clears the arm and nothing else;
 *  - confirming CONSUMES the arm and goes busy (the dialog closes with the tap);
 *  - settling clears busy;
 *  - the copy names the author, the replies that cascade, and that it is final.
 */
import { describe, expect, it } from 'vitest'
import {
  INITIAL_COMMENT_ACTION_STATE,
  armCommentAction,
  beginCommentAction,
  cancelCommentAction,
  commentActionDialogCopy,
  endCommentAction,
  isCommentActionBusy,
  type CommentActionState,
} from './commentActions'

const DELETE_BERNIE = {
  kind: 'delete' as const,
  commentId: 'comment-1',
  authorHandle: 'bernie-parent',
  replyCount: 0,
}

describe('comment action confirm state machine', () => {
  it('starts with nothing armed and nothing in flight', () => {
    expect(INITIAL_COMMENT_ACTION_STATE).toEqual({ pending: null, busy: false })
    expect(isCommentActionBusy(INITIAL_COMMENT_ACTION_STATE)).toBe(false)
  })

  it('arms an action, then Cancel returns to nothing armed', () => {
    const armed = armCommentAction(INITIAL_COMMENT_ACTION_STATE, DELETE_BERNIE)
    expect(armed.pending).toEqual(DELETE_BERNIE)
    expect(armed.busy).toBe(false)
    expect(cancelCommentAction(armed)).toEqual({ pending: null, busy: false })
  })

  it('arming a different row replaces the previous arm (one dialog per thread)', () => {
    const armed = armCommentAction(INITIAL_COMMENT_ACTION_STATE, DELETE_BERNIE)
    const other = armCommentAction(armed, { ...DELETE_BERNIE, commentId: 'comment-2' })
    expect(other.pending?.commentId).toBe('comment-2')
  })

  it('refuses to arm while a comment write is in flight', () => {
    const busy: CommentActionState = { pending: null, busy: true }
    expect(armCommentAction(busy, DELETE_BERNIE)).toBe(busy)
    // ...and a stale Cancel cannot clear a missing arm either.
    expect(cancelCommentAction(busy)).toBe(busy)
  })

  it('confirming consumes the arm and goes busy; settling comes back', () => {
    const armed = armCommentAction(INITIAL_COMMENT_ACTION_STATE, DELETE_BERNIE)
    const writing = beginCommentAction(armed)
    expect(writing).toEqual({ pending: null, busy: true })
    expect(isCommentActionBusy(writing)).toBe(true)
    expect(endCommentAction(writing)).toEqual({ pending: null, busy: false })
  })

  it('endCommentAction is a no-op when nothing is in flight (idempotent settle)', () => {
    expect(endCommentAction(INITIAL_COMMENT_ACTION_STATE)).toBe(INITIAL_COMMENT_ACTION_STATE)
  })

  it('the composer shares the same in-flight guard (begin/end with no arm)', () => {
    const writing = beginCommentAction(INITIAL_COMMENT_ACTION_STATE)
    expect(writing).toEqual({ pending: null, busy: true })
    expect(isCommentActionBusy(writing)).toBe(true)
  })
})

describe('commentActionDialogCopy', () => {
  it('names the author and says it is final', () => {
    const copy = commentActionDialogCopy(DELETE_BERNIE)
    expect(copy.title).toBe('Delete this comment?')
    expect(copy.body).toContain('@bernie-parent')
    expect(copy.body).toContain('This can’t be undone.')
    expect(copy.confirmLabel).toBe('Delete comment')
  })

  it('names the replies that cascade with a top-level comment (0023 ON DELETE CASCADE)', () => {
    expect(commentActionDialogCopy({ ...DELETE_BERNIE, replyCount: 1 }).body).toContain(
      'Its reply go too.',
    )
    expect(commentActionDialogCopy({ ...DELETE_BERNIE, replyCount: 3 }).body).toContain(
      'Its 3 replies go too.',
    )
  })

  it('a reply row never claims replies of its own', () => {
    const copy = commentActionDialogCopy({ ...DELETE_BERNIE, replyCount: 0 })
    expect(copy.body).not.toContain('go too')
  })
})

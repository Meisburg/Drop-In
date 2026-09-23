import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { errorId, fieldA11y } from '../lib/a11y'
import { useFocusTrap } from './FocusTrap'

/**
 * The delete-a-post confirmation (V8 ticket 05) — the ReportDialog pattern:
 * an in-page modal in a portal (role="dialog", Esc or a backdrop click
 * closes), never window.confirm. Two reasons, both pinned:
 *
 *  - Playwright drives it deterministically. A native confirm() is out of
 *    the DOM entirely (it would need a dialog event hook), so the one
 *    destructive action in the app would be the one action no spec could
 *    assert.
 *  - The copy can name the consequence honestly. Deleting a drop-in is not
 *    a private tidy-up: every family that said they were going loses that,
 *    and the comment thread goes with it. `going_pings` (0007), `comments`
 *    (0013), `playdate_kids` (0022) and `ping_kids` (0026) all cascade from
 *    `playdates`, so this is exactly what happens — the dialog says so
 *    BEFORE the tap, and no client-side cleanup runs afterwards.
 *
 * Focus lands on Cancel (not the destructive button), so a stray Enter
 * cancels rather than deletes.
 */
export function DeletePlaydateDialog({
  title,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  /** The post's title, so the dialog names the thing being deleted. */
  title: string
  /** The delete write is in flight (both buttons disabled, no double-submit). */
  busy: boolean
  /** A failed delete — shown in the dialog, which stays open (nothing was lost). */
  error: string | null
  onConfirm: () => void
  onCancel: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Focus lands on the safe choice when the dialog opens.
  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  // Trap Tab inside the dialog; restore focus to the trigger on close.
  useFocusTrap(dialogRef, true)

  // Esc closes (same as a backdrop click), unless the write is in flight.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel, busy])

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-playdate-dialog-title"
        data-testid="delete-playdate-dialog"
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-lg"
      >
        <h2 id="delete-playdate-dialog-title" className="text-base font-semibold text-slate-900">
          Delete this drop-in?
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          “{title}” goes away for everyone, along with every family’s “I’m going” and all
          the comments on it. This can’t be undone.
        </p>
        {error !== null ? <p role="alert" id={errorId('submit')} className="mt-2 text-sm text-red-600">{error}</p> : null}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            data-testid="confirm-delete-playdate"
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            {...fieldA11y('submit', error)}
          >
            {busy ? 'Deleting…' : 'Delete drop-in'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

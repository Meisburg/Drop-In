import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { fieldA11y } from '../lib/a11y'
import { useFocusTrap } from './FocusTrap'

/**
 * The one in-page confirmation dialog (V8 ticket 10) — the DeletePlaydateDialog
 * pattern, generalized: a portal modal (role="dialog", Esc or a backdrop click
 * closes), never window.confirm. Same two pins that put the post delete in the
 * DOM:
 *
 *  - Playwright drives it deterministically (a native confirm() is out of the
 *    DOM entirely, so the destructive actions would be the ones no spec could
 *    assert);
 *  - the copy NAMES the consequence — every caller passes a body that says
 *    what actually happens, never a bare "are you sure?".
 *
 * Focus lands on Cancel (never the destructive button), so a stray Enter
 * cancels instead of destroying something.
 *
 * Callers today: the comment delete confirm and the kid-row Remove confirm —
 * both destructive. The `destructive: false` branch (a plain indigo confirm)
 * has no caller left since the unsaved-changes guard went (V12 t01); it stays
 * as the component's ordinary-confirm mode.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  busyLabel,
  busy = false,
  destructive = true,
  testId,
  onConfirm,
  onCancel,
}: {
  title: string
  body: string
  confirmLabel: string
  /** The label while the write is in flight (defaults to confirmLabel). */
  busyLabel?: string
  busy?: boolean
  /** Red confirm button + the focus-on-Cancel rule (a plain confirm otherwise). */
  destructive?: boolean
  testId?: string
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
        aria-labelledby="confirm-dialog-title"
        data-testid={testId ?? 'confirm-dialog'}
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-lg"
      >
        <h2 id="confirm-dialog-title" className="text-base font-semibold text-slate-900">
          {title}
        </h2>
        <p className="mt-2 text-sm text-slate-600">{body}</p>
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
            data-testid="confirm-dialog-confirm"
            className={
              'rounded-xl px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ' +
              (destructive ? 'bg-red-600' : 'bg-indigo-600')
            }
            {...fieldA11y('submit', null)}
          >
            {busy ? (busyLabel ?? confirmLabel) : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

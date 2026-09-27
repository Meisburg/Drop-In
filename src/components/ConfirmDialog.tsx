import { useRef } from 'react'
import { fieldA11y } from '../lib/a11y'
import { ModalShell } from './ModalShell'

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
 * V25 ticket 13 moved the modal MECHANICS — portal, backdrop, `role="dialog"`,
 * `aria-modal`, the accessible name, the focus trap, Escape and the scroll lock
 * — into `ModalShell`, so the RSVP confirmation lightbox could be a second
 * consumer of ONE shell rather than a third copy of it. This component keeps
 * what is specific to a CONFIRMATION and nothing else: the two buttons, which
 * one takes focus, and the destructive styling. The move was NOT byte-identical
 * (`ModalShell.tsx:21-30` is the list of what changed): the panel gained
 * `tabIndex={-1}` and the 140ms `modal-pop` entrance, a wrapper `<div>` now
 * holds the heading and the optional dismiss control, the static
 * `confirm-dialog-title` became a generated `aria-labelledby`, and the shell
 * adds a body scroll lock this component never had. The two buttons, their ids,
 * their labels and the dismissal rules are unchanged.
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

  return (
    <ModalShell
      title={title}
      testId={testId ?? 'confirm-dialog'}
      busy={busy}
      onDismiss={onCancel}
      initialFocusRef={cancelRef}
    >
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
    </ModalShell>
  )
}

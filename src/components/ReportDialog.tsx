import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { FormEvent } from 'react'
import { createReport } from '../lib/db'
import { validateReportReason } from '../lib/trust'

/**
 * The report flow (slice 4): a reason (required, inline-validated) + submit
 * → createReport. A post report passes playdateId (the post's host is the
 * reported profile); a profile report passes profileId only. Success shows a
 * calm "a moderator will look at it" state — no further handling in V1
 * (the mod tools land in slice 5).
 *
 * Accessible enough for V1: focus lands in the dialog on open, and Esc or a
 * backdrop click closes it. Rendered into document.body (portal) so it is
 * never a DOM descendant of an interactive element — in DropInCard the
 * dialog sits inside the card's <Link>, which must stay the card, not a
 * container.
 */
export function ReportDialog({
  targetLabel,
  playdateId,
  profileId,
  onClose,
}: {
  /** "this drop-in" or "@handle" — the report target, in the dialog title. */
  targetLabel: string
  /** Set for a post report; the post's host is the reported profile. */
  playdateId?: string
  /** Set for a profile report. */
  profileId?: string
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Focus lands in the dialog when it opens.
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  // Esc closes (same as a backdrop click).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const error = validateReportReason(reason)
    if (error !== null) {
      setReasonError(error)
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      await createReport({ playdateId, profileId, reason: reason.trim() })
      setDone(true)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not send the report. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-dialog-title"
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-lg"
      >
        <h2 id="report-dialog-title" className="text-base font-semibold text-slate-900">
          Report {targetLabel}
        </h2>

        {done ? (
          <div className="mt-3 flex flex-col gap-3">
            <p className="text-sm text-slate-500">Thanks — a moderator will look at it.</p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
            >
              Close
            </button>
          </div>
        ) : (
          <form className="mt-3 flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-700">
                What happened? <span className="text-slate-400">(required)</span>
              </span>
              <textarea
                ref={textareaRef}
                rows={3}
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value)
                  setReasonError(null)
                }}
                placeholder="e.g. The post shared a home address instead of a public meet-up."
                aria-invalid={reasonError !== null}
                className={
                  'w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ' +
                  (reasonError !== null ? 'border-red-400' : 'border-slate-300')
                }
              />
            </label>
            {reasonError !== null ? <p className="text-sm text-red-600">{reasonError}</p> : null}
            {submitError !== null ? <p className="text-sm text-red-600">{submitError}</p> : null}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {submitting ? 'Sending…' : 'Send report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  )
}
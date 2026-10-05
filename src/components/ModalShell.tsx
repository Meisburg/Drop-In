import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from './FocusTrap'

/**
 * The app's one portal-modal shell (V25 ticket 13) — the backdrop, the
 * `role="dialog"` / `aria-modal` wrapper, the accessible name, the focus trap,
 * Escape and backdrop dismissal, the scroll lock, and the top-right dismiss
 * control. Callers supply the title and the body; nothing else about a modal is
 * decided here.
 *
 * WHY THIS EXISTS NOW. `ConfirmDialog` was the house confirmation dialog and
 * carried its own portal + backdrop + `role="dialog"` + trap + Escape + close
 * handling. The RSVP confirmation lightbox (V25 ticket 13) needed the same
 * mechanics, and its ticket says plainly: reuse `ConfirmDialog`'s shape "or
 * generalize it — do **not** add a third dialog implementation". So those
 * mechanics moved here and the RSVP lightbox became the SECOND consumer of one
 * shell instead of a second copy of it.
 *
 * WHAT CHANGED FOR `ConfirmDialog`'S EXISTING CALLERS (not byte-identical, and
 * the first version of this comment claimed it was): the panel gained
 * `tabIndex={-1}` (so the panel itself can take focus when the dialog has no
 * control to send it to), the 140ms `modal-pop` entrance, a wrapper `<div>`
 * around the heading and the optional dismiss control, a GENERATED
 * `aria-labelledby` id in place of the static `confirm-dialog-title`, and the
 * scroll lock it never had. So a comment-delete confirm now animates in and
 * locks the page behind it. Nothing about the two buttons, their ids, their
 * labels or the dismissal rules changed — but "byte-for-byte" was wrong and is
 * corrected here.
 *
 * THE EXACT SEMANTICS THIS OWNS:
 *
 *  - a portal to `document.body` over a `bg-slate-900/40` backdrop, the panel
 *    `w-full max-w-sm` at `z-50`;
 *  - `role="dialog"`, `aria-modal="true"`, and a REAL accessible name via
 *    `aria-labelledby` wired to the rendered `<h2>` (not an `aria-label`
 *    duplicating the visible title);
 *  - focus moved INTO the dialog on open and Tab trapped there (`useFocusTrap`,
 *    the shared seam). **Restoring focus to the opener on close is NOT
 *    performed today** (V25 ticket 13 recovery; follow-up ticket recorded by
 *    the orchestrator). The reason is an effect-ordering bug in this shell, not
 *    in the trap, and it is established by READING the order below rather than
 *    by a logged run: the focus-into-dialog effect at the top of this component
 *    is declared BEFORE the `useFocusTrap` call, so React runs it first, the
 *    trap's effect then captures `document.activeElement` — the dialog's own
 *    first control, by then — as "previously focused", and when the dialog
 *    unmounts that control is no longer in the document, so
 *    `FocusTrap.tsx`'s `document.contains(previouslyFocused)` guard skips the
 *    restore and `document.activeElement` falls to `<body>`. The same order is
 *    what makes the affected set exact: a caller whose focus-into-dialog effect
 *    is declared before `useFocusTrap` loses the restore, which is this shell
 *    (hence `ConfirmDialog.tsx` and `RsvpConfirmationDialog.tsx`, the only two
 *    consumers), `DeletePlaydateDialog.tsx:45-53` and `ReportDialog.tsx:45-53`.
 *    `LocationModal.tsx` and `NewPlaydatePage.tsx:380` call `useFocusTrap`
 *    directly and have no focus-into-dialog effect at all (LocationModal's
 *    effect at `:88` only clears a draft), so for them the trap captures the
 *    real opener and the restore DOES run. `CropPhotoDialog` uses no trap.
 *    Closing the dialog still leaves the parent on the same page with the action
 *    intact — which is what this ticket requires — the four surfaces above are
 *    simply not re-focused onto the control that opened them;
 *  - Escape and a backdrop click both dismiss, and BOTH yield while `busy` is
 *    true (a write in flight must not be dismissed out from under itself);
 *  - the page behind cannot scroll (`document.body.style.overflow = 'hidden'`,
 *    restored to whatever it was — the ImageLightbox pattern), which the ticket
 *    requires of the lightbox and which is correct for every modal here;
 *  - the top-right dismiss control is the caller's to request (`dismissLabel`),
 *    because a dialog that already renders its own Cancel must not grow a second
 *    way out. The RSVP lightbox has NO other control, so dismissing it is
 *    reachable by pointer and by keyboard from the one button.
 *
 * DELIBERATE NON-GOALS. It does not render a title bar, a close glyph of its
 * own, a footer, or any size beyond `max-w-sm` — every one of those differs per
 * dialog and belongs to the caller's children. It does not own `z` beyond the
 * house `z-50`; a dialog that must out-stack Leaflet passes its own token
 * (`lib/stacking.ts` documents that band).
 */
export function ModalShell({
  title,
  testId,
  onDismiss,
  busy = false,
  dismissLabel,
  describedBy,
  zClass = 'z-50',
  initialFocusRef,
  children,
}: {
  /** The dialog's visible heading — and, via `aria-labelledby`, its accessible name. */
  title: string
  /** The element id the specs hook onto (the house `data-testid` convention). */
  testId: string
  /** Escape, a backdrop click, or the dismiss control. */
  onDismiss: () => void
  /** A write is in flight: dismissals are refused while true. */
  busy?: boolean
  /**
   * Render a top-right dismiss control with this accessible name. Omit it for a
   * dialog that already offers its own way out (ConfirmDialog's Cancel).
   */
  dismissLabel?: string
  /** The id of a body paragraph that describes the dialog, when there is one. */
  describedBy?: string
  /**
   * The stacking class for the backdrop, defaulting to the house `z-50`.
   *
   * A dialog shown over a Leaflet map MUST pass `MODAL_OVER_LEAFLET_Z_CLASS`
   * (`z-[1100]`): Leaflet's own control wrappers sit at `z-index: 1000`, so at
   * `z-50` the map's zoom box and attribution paint ON TOP of a dimmed backdrop
   * and its dialog — the defect `src/lib/stacking.ts` records as having shipped
   * before. This prop is what the doc above always promised ("passes its own
   * token") and did not exist until v30-10's `ocr` lane found a caller that
   * needed it.
   */
  zClass?: string
  /** Where focus lands on open (defaults to the dismiss control, if rendered). */
  initialFocusRef?: React.RefObject<HTMLButtonElement | null>
  children: ReactNode
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const dismissRef = useRef<HTMLButtonElement>(null)
  // A real accessible name, always wired: the heading is rendered from `title`,
  // so the labelledby reference cannot dangle.
  const rawId = useId()
  const titleId = `modal-shell-title-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`

  // Focus lands inside the dialog when it opens. The caller can name the target
  // (ConfirmDialog sends it to Cancel, never the destructive button); otherwise
  // it goes to the dismiss control; with neither, the panel itself is the
  // fallback so focus is never left on the page behind an `aria-modal`.
  //
  // Mount-only on purpose: the refs and the caller's `initialFocusRef` are
  // stable for the dialog's whole life, and re-running this would steal focus
  // mid-interaction (typing in the dialog would jump to the first control).
  useEffect(() => {
    const target = initialFocusRef?.current ?? dismissRef.current ?? dialogRef.current
    target?.focus()
  }, [initialFocusRef])

  // Focus is moved INTO the dialog by the effect above and Tab is trapped here.
  // Focus is NOT restored to the opener on close — see the semantics block at the
  // top of this file for the measurement and the follow-up ticket.
  useFocusTrap(dialogRef, true)

  // Esc closes (same as a backdrop click), unless the write is in flight.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onDismiss()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onDismiss, busy])

  // The page behind a modal does not scroll while it is open (the ImageLightbox
  // pattern). Restored to whatever it was, so a dialog opening over another
  // locked surface cannot unlock it on the way out.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  return createPortal(
    <div
      className={`fixed inset-0 ${zClass} flex items-center justify-center bg-slate-900/40 p-4`}
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onDismiss()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        data-testid={testId}
        tabIndex={-1}
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-lg animate-modal-pop motion-reduce:animate-none"
      >
        <div className="flex items-start justify-between gap-2">
          <h2 id={titleId} className="text-base font-semibold text-slate-900">
            {title}
          </h2>
          {dismissLabel === undefined ? null : (
            <button
              ref={dismissRef}
              type="button"
              disabled={busy}
              onClick={onDismiss}
              aria-label={dismissLabel}
              data-testid={`${testId}-dismiss`}
              className="-mr-1 -mt-1 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 disabled:opacity-50"
            >
              {/* The glyph is decoration: the accessible name is `dismissLabel`. */}
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )}
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}

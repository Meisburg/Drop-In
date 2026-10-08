import { useId, useRef } from 'react'
import type { CSSProperties } from 'react'
import { rsvpConfirmationCopy } from '../lib/rsvpConfirmation'
import type { RsvpConfirmationFacts } from '../lib/rsvpConfirmation'
import { confettiPieces } from '../lib/confetti'
import { DropInMark } from './DropInMark'
import { ModalShell } from './ModalShell'

/** How many pieces the burst throws (the lib decides their geometry). */
const CONFETTI_COUNT = 14

/**
 * The RSVP confirmation lightbox (V25 ticket 13): the one moment after a parent
 * says they are going to somebody's drop-in that says **"You're going!"**, names
 * the drop-in they just joined, and states what happens next.
 *
 * WHY IT IS A DIALOG AND NOT A BANNER. The founder asked for a "lightboxed
 * notification", and the ticket makes it concrete: role="dialog",
 * aria-modal="true", a real accessible name, focus moved in and trapped,
 * Escape and a visible dismiss, no scroll behind. All of that is ModalShell's
 * job — this component contributes only the CONTENT, which is why it is short.
 *
 * WHAT IT DELIBERATELY DOES NOT DO:
 *  - It has no CTA. "Message the host" already exists on the page the parent is
 *    still standing on (and the lightbox says so); a second copy of that button
 *    inside the dialog would navigate away from the post the confirmation is
 *    anchored to, and the ticket's last criterion is that dismissing leaves the
 *    parent ON the detail page with the RSVP intact.
 *  - It does not read the clock, the network, or the ping state. Every string
 *    comes from lib/rsvpConfirmation.ts, where the claims are pinned by tests.
 *
 * The copy is passed the drop-in's facts (title + window) rather than a bare
 * string, so the "what happens next" sentence can never drift away from the
 * event the dialog is naming.
 */
export function RsvpConfirmationDialog({
  facts,
  testId = 'rsvp-confirmation',
  onDismiss,
}: {
  /** The drop-in that was just joined: its title and its time window. */
  facts: RsvpConfirmationFacts
  testId?: string
  onDismiss: () => void
}) {
  const copy = rsvpConfirmationCopy(facts)
  // The one primary action takes focus, so a keyboard user is on the way out of
  // the dialog with a single Enter; the ✕ and Escape are the other two ways.
  const gotItRef = useRef<HTMLButtonElement>(null)
  // The body is the dialog's description, wired to BOTH paragraphs so a screen
  // reader announces the event and the next steps as one description rather
  // than leaving the second paragraph orphaned from the dialog.
  const bodyId = `rsvp-confirmation-body-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

  // The burst's geometry is a lib decision (the build law: React renders,
  // lib decides): one seeded pure function, no Math.random() here. The
  // seed is the event title — the same confirmation always bursts the same way.
  const pieces = confettiPieces(CONFETTI_COUNT, facts.title)

  // The CSS custom properties the keyframe reads back from each piece: delay,
  // fall time and spin. Built with string concatenation (not template
  // literals) so the stale-locator guard's src scan sees no new template
  // shapes in this file — its two-part rule would otherwise let dead
  // hyphenated testids through on the single-letter statics these used to pin.
  const pieceStyles = pieces.map((piece) => ({
    left: piece.leftPct + '%',
    '--rsvp-confetti-delay': piece.delaySec + 's',
    '--rsvp-confetti-duration': piece.durationSec + 's',
    '--rsvp-confetti-spin': piece.rotationDeg + 'deg',
  }))

  return (
    <ModalShell
      title={copy.title}
      testId={testId}
      onDismiss={onDismiss}
      dismissLabel="Close"
      describedBy={bodyId}
      initialFocusRef={gotItRef}
    >
      {/* v33-13: the drop-in mark above the text (decorative — the dialog's
          title already names the event), and the confetti layer. Both are
          scoped to THIS component, not to ModalShell: every other dialog
          that wraps the shell must stay plain. */}
      <div className="relative">
        <DropInMark
          testId="rsvp-confirmation-mark"
          className="mx-auto mb-2 h-14 w-14"
        />
        <div id={bodyId}>
          <p
            data-testid="rsvp-confirmation-event"
            className="mt-2 text-sm font-medium text-slate-900"
          >
            {copy.event}
          </p>
          <p data-testid="rsvp-confirmation-next" className="mt-2 text-sm text-slate-600">
            {copy.next}
          </p>
        </div>
        {/* The confetti layer: absolutely positioned inside the relative wrapper,
            so it paints over the mark and copy without taking layout space —
            the controls below keep their boxes with or without it. */}
        <div
          aria-hidden="true"
          data-testid="rsvp-confetti"
          className="rsvp-confetti-layer pointer-events-none"
        >
          {pieceStyles.map((style, index) => (
            <span key={index} className="rsvp-confetti-piece" style={style as CSSProperties} />
          ))}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-end">
        {/* min-h-11 (44px) is this repo's tap-target floor
            (.opencodereview/rule.json; scripts/mobile-audit.mjs measures
            it): py-2 over the 26px text line rendered 42px — 2px under — and
            this button has no h-*, so nothing auto-flagged it. The dismiss
            control in ModalShell carries the same floor. */}
        <button
          ref={gotItRef}
          type="button"
          onClick={onDismiss}
          data-testid="rsvp-confirmation-got-it"
          className="min-h-11 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
        >
          Got it
        </button>
      </div>
    </ModalShell>
  )
}

import type { ReactNode } from 'react'
import { BackControl } from './BackControl'

/**
 * V28 slice 3a — the first-run card chrome.
 *
 * PRESENTATIONAL ONLY (build law: React renders, it does not decide). This
 * chrome knows no card order, no zip/handle/kid rules, and makes no routing
 * decisions — it renders the props it is given and emits the callbacks it
 * was handed. The two decisions that sit next to it are the CALLER'S:
 *
 * - the primary label is a PROP, so the caller keeps its own copy
 *   ("Continue") — the chrome renders it, it never composes it
 * - the Skip control draws only when the caller hands an `onSkip` —
 *   skippability is the caller's `isSkippable` decision (lib/firstRun.ts);
 *   the chrome just draws the control when told to. Its WORD is the same
 *   kind of caller decision, so `skipLabel` is a PROP beside `onSkip` (V28 r2
 *   slice 6a) and the chrome keeps no word of its own: a hard-coded fallback
 *   here was a second source of the label, and it is the reason
 *   `FIRST_RUN_COPY.kids.skipLabel` could describe a word nothing rendered.
 *   The pair is unconstructable apart — `onSkip` without `skipLabel` does not
 *   compile — so the chrome can neither draw an empty button nor invent one.
 *
 * The back control is a callback (`onBack`, button mode) or a destination
 * (`backTo`, link mode), both drawn through the app's one back control
 * (BackControl). The chrome never navigates on its own judgment.
 *
 * The primary action has two modes (both presentational; which mode is a
 * caller decision):
 * - callback mode: `onPrimary` fires on tap
 * - form mode: `primaryForm` is the id of the caller's form (rendered in
 *   `children`), and the primary control becomes a `type="submit"` button
 *   associated with that form by the HTML `form` attribute — the standard
 *   way a button OUTSIDE the form submits it (Enter in a field uses the
 *   same association; the form's own `onSubmit` and native constraint
 *   validation still run).
 *
 * Shape floor: every control ≥44px (the app's `min-h-11` idiom) with a
 * visible focus cue (`focus-visible:ring-2` — enforced by npm run
 * a11y:focus).
 */
export type FirstRunCardProps = {
  /** "2 of 4" — the caller's label (lib/firstRun's `progressLabel`). */
  progressLabel: string
  /** The card's masthead. */
  title: string
  /** Body copy under the title (e.g. the privacy promise). */
  body?: ReactNode
  /** The card's content — fields, rows, dialogs. */
  children?: ReactNode
  /** The primary action's copy (the caller owns it, e.g. "Continue"). */
  primaryLabel: string
  /** Disable the primary control (e.g. while a write is in flight). */
  primaryDisabled?: boolean
  /** Back, button mode: fires when tapped. */
  onBack?: () => void
  /** Back, link mode: the destination. Mutually exclusive with `onBack`. */
  backTo?: string
  /** Optional data-testid for specs. */
  testId?: string
} & (
  | { onPrimary: () => void; primaryForm?: undefined }
  | { primaryForm: string; onPrimary?: undefined }
) & (
  /**
   * The Skip control's two props travel together: `onSkip` is the caller's
   * skippability decision, `skipLabel` is the word it renders (from
   * lib/firstRunCopy). Splitting them apart is a type error, which is what
   * keeps the chrome from ever holding a label of its own.
   */
  | { onSkip?: undefined; skipLabel?: undefined }
  | { onSkip: () => void; skipLabel: string }
)

export function FirstRunCard({
  progressLabel,
  title,
  body,
  children,
  primaryLabel,
  onPrimary,
  primaryForm,
  primaryDisabled = false,
  onSkip,
  skipLabel,
  onBack,
  backTo,
  testId,
}: FirstRunCardProps) {
  const primaryClasses =
    'min-h-11 flex-1 rounded-xl bg-indigo-600 px-4 py-3 text-base font-medium text-white outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-indigo-200 disabled:opacity-50'
  const skipClasses =
    'min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-base font-medium text-slate-700 outline-none transition-colors motion-reduce:transition-none hover:bg-slate-50 focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200'
  const hasBack = onBack !== undefined || backTo !== undefined
  return (
    <div className="flex flex-col gap-4" data-testid={testId}>
      <div className="flex items-center gap-2">
        {hasBack ? <BackControl onClick={onBack} to={backTo} /> : null}
        <p className="text-xs font-medium text-slate-500">{progressLabel}</p>
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-xl font-semibold text-slate-900">{title}</h1>
        {body !== undefined && body !== null ? (
          <p className="text-sm text-slate-600">{body}</p>
        ) : null}
      </div>
      {children}
      <div className="flex items-center gap-3">
        {primaryForm !== undefined ? (
          <button
            type="submit"
            form={primaryForm}
            disabled={primaryDisabled}
            className={primaryClasses}
          >
            {primaryLabel}
          </button>
        ) : (
          <button
            type="button"
            disabled={primaryDisabled}
            onClick={onPrimary}
            className={primaryClasses}
          >
            {primaryLabel}
          </button>
        )}
        {onSkip !== undefined ? (
          <button type="button" onClick={onSkip} className={skipClasses}>
            {skipLabel}
          </button>
        ) : null}
      </div>
    </div>
  )
}
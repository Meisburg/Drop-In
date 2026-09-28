import { useEffect, useRef } from 'react'
import { useFocusTrap } from './FocusTrap'
import { NAV_ICONS } from './icons'
import { MODAL_OVER_LEAFLET_Z_CLASS } from '../lib/stacking'

/**
 * V27 — ONE DROPDOWN'S OPTION LIST, as a bottom sheet.
 *
 * THE FOUNDER'S ASK, verbatim: *"you've got three prominent filters that have
 * drop downs that when clicked populate info like this"*, with a reference
 * screenshot of a bottom sheet listing single-choice options (Any day / Starting
 * soon / Today / …) and a filled dot beside the selected one.
 *
 * WHAT THIS COMPONENT OWNS: the sheet chrome only — the backdrop, the focus
 * trap, Escape-to-close, the option rows and the selected dot. It holds NO
 * filter state: the caller passes the current `value`, the options, and an
 * `onSelect` callback, so the same sheet serves the type, distance and when
 * controls (and any future one) instead of three near-identical copies. That is
 * the "one implementation" rule this repo keeps paying for: a second copy is
 * how the type chips and the sheet's chips drifted apart before.
 *
 * A11Y: `role="dialog"` + `aria-modal` + a labelled close button; every option
 * is `min-h-11` (44px), carries `aria-pressed`, and marks the selection with a
 * filled dot as well as weight/colour (never colour alone), in the house chip
 * pattern. The dot is `aria-hidden` — `aria-pressed` is the accessible state.
 */
export interface FilterOption<T extends string | number> {
  value: T
  label: string
}

export function PlaceFilterSheet<T extends string | number>({
  open,
  title,
  testId,
  options,
  value,
  onSelect,
  onClose,
}: {
  /** Render the sheet at all (the caller owns the open state). */
  open: boolean
  /** The sheet's heading, which also names the dialog to a screen reader. */
  title: string
  /** The root test id (each option gets `${testId}-option-<value>`). */
  testId: string
  /** The single-choice options, in render order. */
  options: readonly FilterOption<T>[]
  /** The current selection (the dot + pressed state). */
  value: T
  /** Commit a choice. The sheet closes itself after the call. */
  onSelect: (value: T) => void
  /** Close without choosing. */
  onClose: () => void
}) {
  const sheetRef = useRef<HTMLDivElement>(null)
  useFocusTrap(sheetRef, open)

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      data-testid={testId}
      className={`fixed inset-0 ${MODAL_OVER_LEAFLET_Z_CLASS} flex items-end justify-center bg-black/40 sm:items-center`}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="pb-safe w-full max-w-md rounded-t-2xl bg-white p-2 shadow-xl sm:rounded-2xl"
      >
        <div className="mb-1 flex items-center justify-between px-2 pt-1">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            data-testid={`${testId}-close`}
            onClick={onClose}
            aria-label="Close"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-slate-500 outline-none transition-colors motion-reduce:transition-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={NAV_ICONS.close} />
            </svg>
          </button>
        </div>

        <ul className="flex flex-col">
          {options.map((option) => {
            const selected = option.value === value
            return (
              <li key={String(option.value)}>
                <button
                  type="button"
                  data-testid={`${testId}-option-${String(option.value)}`}
                  aria-pressed={selected}
                  onClick={() => {
                    onSelect(option.value)
                    onClose()
                  }}
                  className={
                    'flex min-h-11 w-full items-center justify-between rounded-xl px-3 py-2 text-left text-base outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-indigo-500 ' +
                    (selected
                      ? 'font-semibold text-indigo-700'
                      : 'text-slate-700 hover:bg-slate-50')
                  }
                >
                  <span>{option.label}</span>
                  {selected ? (
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 shrink-0 rounded-full bg-indigo-600"
                    />
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

export { PlaceFilterSheet as default }

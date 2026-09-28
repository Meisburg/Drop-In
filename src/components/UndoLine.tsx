/**
 * The "Removed. Undo" line (V27).
 *
 * The settings lists gained destructive one-tap actions (remove a saved place,
 * unblock a family) that used to be irreversible. A confirmation dialog for a
 * reversible list row would be heavier than the action deserves, so the row is
 * removed optimistically and this line offers the way back — the same pattern a
 * parent already expects from a mail app.
 *
 * `role="status"` is deliberate: the app's audit found error and status text was
 * visible but never announced, and this is status text. It renders only while an
 * undo is still available; the caller owns that window.
 */
export function UndoLine({
  message,
  actionLabel = 'Undo',
  busy = false,
  onUndo,
}: {
  message: string
  actionLabel?: string
  busy?: boolean
  onUndo: () => void
}) {
  return (
    <div
      role="status"
      data-testid="undo-line"
      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
    >
      <span className="text-sm text-slate-700">{message}</span>
      <button
        type="button"
        onClick={onUndo}
        disabled={busy}
        data-testid="undo-action"
        className="inline-flex min-h-11 shrink-0 items-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 disabled:opacity-50"
      >
        {busy ? 'Undoing…' : actionLabel}
      </button>
    </div>
  )
}

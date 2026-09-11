import { useState } from 'react'
import { setPingKids } from '../lib/db'
import type { Kid } from '../lib/types'

/**
 * "Who's coming with you?" (V6, migration 0026).
 *
 * First phone feedback: "it only says like one going as in like the parent, but
 * it doesn't show the kids that are going... you're trying to set this up for
 * kids to have a play date with other kids." A ping records the parent; this is
 * how the kids half gets collected.
 *
 * WHERE IT LIVES (the UX call): on the DETAIL page, not the card. The card's
 * "I'm going" pill is a one-tap gesture and a picker behind it would kill it —
 * so the card says you're coming in one tap, and this refines it when you have
 * the attention to spare. It only renders once you are actually going (the
 * schema's FK to going_pings would reject the rows otherwise).
 *
 * Writes are REPLACE + optimistic: the chip flips immediately, the row set is
 * saved whole, and a failure puts the chip back with a message rather than
 * leaving the UI lying about who is coming.
 */
export function KidsComingPicker({
  playdateId,
  kids,
  selected,
  onChange,
  onSaved,
}: {
  playdateId: string
  kids: Kid[]
  selected: string[]
  onChange: (next: string[]) => void
  /**
   * Fired only AFTER the write lands. The optimistic `onChange` is what keeps
   * the chip instant; this is what the page uses to re-read the names line, and
   * it must not fire early — re-reading before the row exists is a race the
   * end-to-end check caught (the chip flipped back off while the card, loaded
   * later, already counted the kid).
   */
  onSaved?: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle(kidId: string) {
    const next = selected.includes(kidId)
      ? selected.filter((id) => id !== kidId)
      : [...selected, kidId]
    const previous = selected
    onChange(next)
    setBusy(true)
    setError(null)
    try {
      await setPingKids(playdateId, next)
      onSaved?.()
    } catch (err) {
      onChange(previous)
      setError(
        err instanceof Error ? err.message : 'Could not save who is coming with you.',
      )
    } finally {
      setBusy(false)
    }
  }

  if (kids.length === 0) return null

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <p className="text-sm font-medium text-slate-700">Who’s coming with you?</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {kids.map((kid) => {
          const active = selected.includes(kid.id)
          return (
            <button
              key={kid.id}
              type="button"
              aria-pressed={active}
              disabled={busy}
              onClick={() => void toggle(kid.id)}
              className={`flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors disabled:opacity-60 ${
                active
                  ? 'border-green-600 bg-green-600 text-white'
                  : 'border-slate-300 bg-white text-slate-700'
              }`}
            >
              <span aria-hidden="true">{active ? '✓' : '+'}</span>
              {kid.first_name}
              {kid.age !== null && kid.age !== undefined ? ` · ${kid.age}` : ''}
            </button>
          )
        })}
      </div>
      {selected.length === 0 ? (
        <p className="mt-1 text-sm text-slate-600">
          Just you so far — tap a name if you’re bringing them.
        </p>
      ) : null}
      {error !== null ? <p className="mt-1 text-sm text-red-600">{error}</p> : null}
    </div>
  )
}

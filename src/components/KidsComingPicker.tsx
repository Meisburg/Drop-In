import { useEffect, useRef, useState } from 'react'
import { setPingKids } from '../lib/db'
import { kidLabel } from '../lib/feed'
import type { Kid } from '../lib/types'

/**
 * "Who's coming with you?" (V6, migration 0026; batched in V8 ticket 10).
 *
 * First phone feedback: "it only says like one going as in like the parent, but
 * it doesn't show the kids that are going... you're trying to set up for kids
 * to have a play date with other kids." A ping records the parent; this is how
 * the kids half gets collected.
 *
 * WHERE IT LIVES (the UX call): on the DETAIL page, not the card. The card's
 * "I'm going" pill is a one-tap gesture and a picker behind it would kill it —
 * so the card says you're coming in one tap, and this refines it when you have
 * the attention to spare. It only renders once you are actually going (the
 * schema's FK to going_pings would reject the rows otherwise).
 *
 * ONE WRITE PER CONFIRM (V8 ticket 10). The old picker wrote on EVERY chip tap
 * and disabled every chip while that write was in the air — so the second kid
 * could not be tapped until the first one's round trip came back, and a parent
 * with three kids paid three sequential trips to say one thing. The chips are
 * now a local MULTI-SELECT (instant, never disabled, no per-tap request) and
 * the selection is saved whole by one "Save" — the same one write the server
 * has always wanted (setPingKids is a REPLACE: delete-then-insert of the whole
 * set).
 *
 * THE RACE THIS MUST NOT REINTRODUCE (caught end-to-end once already): the
 * detail page re-reads the "Kids coming" names line via `onSaved`, and that
 * re-read may only fire AFTER the write landed — firing it early showed the
 * card counting a kid the page still said nothing about. So: optimistic
 * `onChange` on confirm, ONE in-flight guard (`busy`), `onSaved()` strictly
 * after the await, and a failure puts the committed selection back exactly as
 * it was with a visible message.
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
   * the chips instant; this is what the page uses to re-read the names line,
   * and it must not fire early — re-reading before the row exists is a race the
   * end-to-end check caught (the chip flipped back off while the card, loaded
   * later, already counted the kid).
   */
  onSaved?: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /**
   * The pending selection (what the chips show) and whether it is a real edit:
   * `dirty` is the seed guard. A re-list from the page (an "I'm going" toggle,
   * a session change) must not drop chips the parent has already tapped.
   */
  const [draft, setDraft] = useState<string[]>(selected)
  const dirty = useRef(false)

  useEffect(() => {
    if (dirty.current) return
    setDraft(selected)
  }, [selected])

  const changed = !sameSelection(draft, selected)

  function toggle(kidId: string) {
    if (busy) return
    dirty.current = true
    setError(null)
    setDraft((prev) =>
      prev.includes(kidId) ? prev.filter((id) => id !== kidId) : [...prev, kidId],
    )
  }

  async function save() {
    if (busy || !changed) return
    const previous = selected
    const next = draft
    onChange(next) // optimistic: the committed selection is what the page holds
    dirty.current = false
    setBusy(true)
    setError(null)
    try {
      await setPingKids(playdateId, next)
      // ONLY after the write landed (the pin above).
      onSaved?.()
    } catch (err) {
      // The write failed: the page's selection goes back, and so do the chips
      // (the draft follows `selected` again — nothing is left claiming to be
      // saved that is not).
      onChange(previous)
      setDraft(previous)
      setError(
        err instanceof Error ? err.message : 'Could not save who is coming with you.',
      )
    } finally {
      setBusy(false)
    }
  }

  function cancel() {
    if (busy) return
    dirty.current = false
    setDraft(selected)
    setError(null)
  }

  if (kids.length === 0) return null

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <p className="text-sm font-medium text-slate-700">Who’s coming with you?</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {kids.map((kid) => {
          const active = draft.includes(kid.id)
          return (
            <button
              key={kid.id}
              type="button"
              aria-pressed={active}
              disabled={busy}
              onClick={() => toggle(kid.id)}
              data-testid="kid-chip"
              className={`flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors motion-reduce:transition-none disabled:opacity-60 ${
                active
                  ? 'border-green-700 bg-green-700 text-white'
                  : 'border-slate-300 bg-white text-slate-700'
              }`}
            >
              <span aria-hidden="true">{active ? '✓' : '+'}</span>
              {/* V9 ticket 05: a kid's first name is optional, so this reads
                  "Age 6" for a nameless kid (feed.kidLabel) rather than just a
                  check mark next to nothing. A named kid's chip is unchanged. */}
              {kidLabel(kid.first_name, kid.age)}
            </button>
          )
        })}
      </div>
      {selected.length === 0 && !changed ? (
        <p className="mt-1 text-sm text-slate-600">
          Just you so far — tap a name if you’re bringing them.
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="save-kids-coming"
          disabled={busy || !changed}
          onClick={() => void save()}
          className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        {changed ? (
          <button
            type="button"
            disabled={busy}
            onClick={cancel}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 disabled:opacity-50"
          >
            Cancel
          </button>
        ) : null}
        {changed ? (
          <span className="text-xs text-slate-500">
            Nothing is saved until you tap Save.
          </span>
        ) : null}
      </div>
      {error !== null ? <p className="mt-1 text-sm text-red-600">{error}</p> : null}
    </div>
  )
}

/**
 * Same SELECTION (order-insensitive — the row set is the meaning; the read
 * back from ping_kids has no guaranteed order, so an order mismatch must never
 * read as "you have unsaved changes").
 */
function sameSelection(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const inB = new Set(b)
  return a.every((id) => inB.has(id))
}

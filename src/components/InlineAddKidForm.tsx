import { useState, type ReactNode } from 'react'
import { addKid, listKids, validateKid, MAX_KIDS_PER_PROFILE } from '../lib/db'
import { isAtKidCap } from '../lib/inlineAddKid'
import type { Kid } from '../lib/types'
import { useSessionContext } from './SessionProvider'

/**
 * V37 slice B (`T6N3`) — ADD A KID WITHOUT LEAVING THE FLOW.
 *
 * The founder's usability review, verbatim: *"I'd also bring 'add your kids' into
 * the outing flow instead of stopping the parent and sending them to Settings."*
 *
 * THE DEFECT THIS CLOSES. The outing flow already degraded gracefully — a parent
 * with no kids got a designed empty state rather than a crash — but the recovery
 * path it offered was a trip to Settings, which ABANDONS A HALF-WRITTEN OUTING.
 * The parent was stopped at the exact moment they were most committed: place
 * chosen, time picked, kids missing.
 *
 * ⚠️ THIS IS THE SAME FORM, NOT A SECOND KID SCHEMA. The fields (First name
 * optional, Age 0–17), the limits (`MAX_KIDS_PER_PROFILE`), the validation
 * (`validateKid`) and the error copy are the SAME seams the profile/settings
 * editor uses (`ProfilePage.tsx`'s in-place add row), and the WRITE is the same
 * `addKid` — which itself re-validates and re-enforces the cap, so this surface
 * cannot drift from that one even if it tried. There is one kid schema; this is
 * another door onto it.
 *
 * ⚠️ IT RETURNS THE PARENT TO THE FLOW. The form never navigates. On success it
 * calls `onKidAdded` with the refreshed list and the caller keeps every field it
 * already had — the draft is untouched because nothing unmounts. On FAILURE it
 * stays exactly where it is, draft intact, showing the existing error copy (the
 * `err.message` the write path throws, with the same fallback string the profile
 * editor uses). Never a crash, never a lost draft.
 */
export function InlineAddKidForm({
  /**
   * Called after a successful add with the parent's REFRESHED kid list (re-read
   * through the same `listKids` the profile editor uses). The caller updates its
   * own state; nothing here navigates, so the surrounding form never loses a
   * field.
   */
  onKidAdded,
  /**
   * Optional extra line under the fields — used by the flow to say WHY this is
   * being asked now ("so you can pick who's coming"). Kept a node so callers own
   * their own copy; this component owns the form, not the conversation.
   */
  hint,
  kidCount,
}: {
  onKidAdded: (kids: Kid[]) => void
  /**
   * How many kids the parent already has — the caller's loaded list length. The
   * cap is then the SAME `MAX_KIDS_PER_PROFILE` the profile editor reads, so the
   * two surfaces cannot tell a parent two different things about how many fit.
   */
  kidCount: number
  hint?: ReactNode
}) {
  const { session } = useSessionContext()
  const userId = session?.user.id ?? null
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /**
   * The cap is the SAME constant the profile editor reads, and it disables the
   * form rather than letting the write throw — the identical rule, so a parent
   * cannot be told two different things about how many kids fit.
   */
  const atCap = isAtKidCap(kidCount, MAX_KIDS_PER_PROFILE)

  async function handleAdd() {
    // An empty age field must not coerce to 0 (`Number('')` is 0) — NaN trips the
    // pure validateKid before any insert, exactly as the profile editor does.
    const ageValue = age === '' ? NaN : Number(age)
    const kidError = validateKid(name, ageValue)
    if (userId === null || busy) return
    if (kidError !== null) {
      setError(kidError)
      return
    }
    setBusy(true)
    setError(null)
    try {
      // The SAME write the profile/settings editor performs. `addKid` re-checks
      // validateKid and MAX_KIDS_PER_PROFILE, so this call cannot bypass either.
      await addKid(userId, name, ageValue)
      const rows = await listKids(userId)
      setName('')
      setAge('')
      onKidAdded(rows)
    } catch (err) {
      // The parent stays HERE, with their draft intact, and sees the write path's
      // own message (the profile editor's fallback, verbatim).
      setError(err instanceof Error ? err.message : 'Could not add your kid. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div data-testid="inline-add-kid" className="flex flex-col gap-2">
      {hint !== undefined ? <p className="text-sm text-slate-600">{hint}</p> : null}
      <div className="flex items-center gap-2">
        <input
          className={
            'min-w-0 flex-1 rounded-xl border px-3 py-2.5 text-base outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200 ' +
            (error !== null ? 'border-red-400' : 'border-slate-300')
          }
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
          placeholder="First name"
          aria-label="Kid first name"
          maxLength={30}
          disabled={atCap || busy}
        />
        <input
          type="number"
          min={0}
          max={17}
          className={
            'w-20 shrink-0 rounded-xl border px-3 py-2.5 text-base outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200 ' +
            (error !== null ? 'border-red-400' : 'border-slate-300')
          }
          value={age}
          onChange={(e) => {
            setAge(e.target.value)
            setError(null)
          }}
          placeholder="Age"
          aria-label="Kid age"
          disabled={atCap || busy}
        />
        <button
          type="button"
          data-testid="inline-add-kid-submit"
          onClick={() => void handleAdd()}
          disabled={atCap || busy}
          className="shrink-0 rounded-md bg-indigo-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Adding…' : 'Add kid'}
        </button>
      </div>
      {atCap ? (
        <p data-testid="inline-add-kid-cap" className="text-sm text-slate-600">
          That’s {MAX_KIDS_PER_PROFILE} kids — the most a profile can list. Remove one to add
          another.
        </p>
      ) : null}
      {error !== null ? (
        <p data-testid="inline-add-kid-error" role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  )
}

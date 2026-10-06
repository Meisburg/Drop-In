import { useEffect, useState } from 'react'
import { useSessionContext } from './SessionProvider'
import { getMyReview, saveReview, type ReviewRow } from '../lib/db'
import {
  REVIEW_BODY_MAX_LENGTH,
  REVIEW_SCORE_MAX,
  validateReviewBody,
  validateReviewScore,
} from '../lib/reviews'

/**
 * V24 ticket 06 — the review form on a place's details page.
 *
 * ONE submit: a 1–5 star score (REQUIRED) plus an optional comment. The star
 * control is a LABELLED RADIO GROUP — one choice among five is exactly what a
 * radio group announces to a screen reader, and arrow keys move between the
 * five. NOT five buttons, NOT a slider. Submit is DISABLED until a score is
 * chosen; the required/optional split is stated up front so a validation error
 * is never a surprise.
 *
 * ONE REVIEW PER PARENT PER PLACE: the composite primary key
 * (place_id, author_profile_id) makes a second INSERT fail in the database, so
 * the form LOADS the parent's existing review (if any) into the control and
 * UPDATES on save (the db.saveReviewWithClient upsert), never a blind insert.
 * After submitting, the saved row renders below without a full-page reload.
 *
 * SIGNED-OUT visitors do not reach this component: the details page sits inside
 * the ProtectedShell, which sends them to /login like every other protected
 * route. When the session is present but the profile row has not settled yet
 * (profileLoading), the form shows its own loading line rather than a broken
 * control — following the page's signed-out posture of degrading separately.
 *
 * Build law: no domain rules live here. Score/body validation is delegated to
 * src/lib/reviews.ts (validateReviewScore / validateReviewBody); this component
 * only renders and emits callbacks.
 *
 * `onSaved` (the reviews-inline slice) is emitted ONCE a save has landed AND
 * the row has been read back, so a caller that mounts this form inside a modal
 * can close it and re-read its own list. The details page passes nothing and is
 * unchanged. It is the write's outcome, not an optimistic guess: a save that
 * failed emits nothing, so the modal stays open with the error line visible.
 */
export function ReviewForm({
  placeId,
  onSaved,
}: {
  placeId: string
  /** Called after a successful save, once the saved row has been read back. */
  onSaved?: () => void
}) {
  const { session, profile, profileLoading } = useSessionContext()
  const [existing, setExisting] = useState<ReviewRow | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [score, setScore] = useState<number | null>(null)
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState<ReviewRow | null>(null)

  // Load the parent's existing review (if any) into the control. A failed read
  // (most likely 0052 not applied) degrades SEPARATELY from the page itself:
  // the form says it is unavailable rather than taking the whole page down.
  useEffect(() => {
    if (session === null || profile === null) return
    let cancelled = false
    ;(async () => {
      try {
        const row = await getMyReview(placeId)
        if (cancelled) return
        setExisting(row)
        if (row !== null) {
          setScore(row.score)
          setBody(row.body ?? '')
        }
      } catch {
        if (!cancelled) setLoadError('Your review could not be loaded.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [placeId, session, profile])

  // Re-validate as the parent types: the moment the value becomes legal the
  // error clears, mirroring the place-comment composer's "the error belongs to
  // the value that produced it".
  const bodyProblem = saveError !== null ? null : validateReviewBody(body)
  const scoreProblem =
    score === null ? validateReviewScore(Number.NaN) : validateReviewScore(score)

  async function handleSave() {
    if (session === null || profile === null || saving || score === null) return
    const problem =
      validateReviewScore(score) ?? validateReviewBody(body)
    if (problem !== null) {
      setSaveError(problem)
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      await saveReview(placeId, score, body)
      // Read the row back from the DB rather than rendering an optimistic copy:
      // the row we show is the row the DB returned (including its real
      // created_at / updated_at), so the form never shows a review that failed
      // to save.
      const row = await getMyReview(placeId)
      setSaved(row)
      setExisting(row)
      // The save landed and the row is real: the caller may now close its
      // modal and re-read the list it renders (the reviews-inline slice).
      onSaved?.()
    } catch {
      setSaveError('That did not save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  // Signed out (or the profile row still settling): no broken form, just the
  // page's own loading line. The ProtectedShell already keeps anon out; this
  // guard covers the brief window where a session exists but the profile fetch
  // has not settled (ticket 06's profileLoading).
  if (session === null || profile === null) {
    return (
      <p className="text-sm text-slate-600">
        {profileLoading ? 'Loading…' : 'Sign in to leave a review.'}
      </p>
    )
  }

  const stars: number[] = []
  for (let s = 1; s <= REVIEW_SCORE_MAX; s += 1) stars.push(s)

  return (
    <div className="flex flex-col gap-3">
      {/* The radio group: one labelled choice among five. The fieldset carries
          the group label ("Rate this place") and the required/optional split
          up front, so a validation error is never a surprise. Arrow keys move
          between the five radios natively; each input keeps a real accessible
          name (its visible label) and a focus-visible ring. */}
      <fieldset
        aria-describedby={scoreProblem !== null ? 'review-score-error' : undefined}
        data-testid="review-star-group"
      >
        <legend className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Rate this place
        </legend>
        <p className="mt-1 text-xs text-slate-500">
          Stars are required · a comment is optional
        </p>
        <div className="mt-2 flex items-center gap-1">
          {stars.map((s) => {
            const checked = score === s
            return (
              <label
                key={s}
                className={
                  'flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl border px-2 transition-colors motion-reduce:transition-none ' +
                  (checked
                    ? 'border-indigo-300 bg-indigo-50'
                    : 'border-slate-300 bg-white hover:bg-slate-50')
                }
              >
                <input
                  type="radio"
                  name={`review-score-${placeId}`}
                  value={s}
                  checked={checked}
                  onChange={() => {
                    setScore(s)
                    setSaveError(null)
                  }}
                  className="sr-only"
                  aria-label={`${s} star${s === 1 ? '' : 's'}`}
                />
                <StarGlyph filled={checked} />
                <span className="ml-1.5 text-sm font-medium text-slate-700">{s}</span>
              </label>
            )
          })}
        </div>
        {scoreProblem !== null ? (
          <p role="alert" id="review-score-error" className="mt-1 text-sm text-red-600">
            {scoreProblem}
          </p>
        ) : null}
      </fieldset>

      {/* The optional comment. One write path (saveReview), the validator's own
          sentence on rejection, and a live count that turns red at the cap —
          the parent sees the limit before they hit it (the wall's pattern). */}
      <div className="flex flex-col gap-1">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-700">Add a comment (optional)</span>
          <textarea
            data-testid="review-comment-input"
            className="min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2 text-base outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-200"
            value={body}
            maxLength={REVIEW_BODY_MAX_LENGTH}
            placeholder="What should we know? Is parking easy? What should we bring?"
            onChange={(e) => {
              setBody(e.target.value)
              setSaveError(null)
            }}
            aria-describedby={
              bodyProblem !== null ? 'review-body-error' : undefined
            }
            aria-invalid={bodyProblem !== null}
          />
        </label>
        <div className="flex items-center justify-between gap-2">
          <span
            className={
              'text-xs ' +
              (body.trim().length > REVIEW_BODY_MAX_LENGTH
                ? 'text-red-600'
                : 'text-slate-500')
            }
          >
            {body.trim().length}/{REVIEW_BODY_MAX_LENGTH}
          </span>
          <button
            type="button"
            data-testid="review-submit"
            onClick={() => void handleSave()}
            disabled={saving || score === null}
            className="min-h-11 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors motion-reduce:transition-none disabled:opacity-50"
          >
            {saving ? 'Saving…' : existing !== null ? 'Update review' : 'Save review'}
          </button>
        </div>
        {bodyProblem !== null ? (
          <p role="alert" id="review-body-error" className="text-sm text-red-600">
            {bodyProblem}
          </p>
        ) : null}
        {saveError !== null ? (
          <p role="alert" className="text-sm text-red-600">
            {saveError}
          </p>
        ) : null}
      </div>

      {/* After submitting, the parent sees their review without a reload. */}
      {loadError !== null ? (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          {loadError}
        </p>
      ) : null}
      {saved !== null ? (
        <div
          data-testid="review-saved"
          className="rounded-xl border border-green-200 bg-green-50 p-3"
        >
          <p className="text-sm text-slate-800">
            You rated this place{' '}
            <span className="font-medium">
              {saved.score} star{saved.score === 1 ? '' : 's'}
            </span>
            {saved.body !== null && saved.body.trim().length > 0
              ? ` — “${saved.body.trim()}”`
              : '.'}
          </p>
        </div>
      ) : null}
    </div>
  )
}

/**
 * A 24px star glyph, stroked like the app's icon family (24px viewBox, stroke
 * 1.8, currentColor). Filled when the radio is checked, outlined otherwise —
 * the two states differ by fill AND by the surrounding chip's border/bg, so
 * the selected state is not color-only. Decorative: the input's aria-label is
 * the accessible name.
 */
function StarGlyph({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z" />
    </svg>
  )
}

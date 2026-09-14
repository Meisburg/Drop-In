/**
 * V10 ticket 03 — the CLIENT half of "Describe it instead": one sentence →
 * the prefill-playdate edge function → structured fields → these pure seams
 * → the /new form's existing state. The LLM never writes: the summary is the
 * review surface and Post is the only door (createPlaydate).
 *
 * WHY THIS IS ITS OWN MODULE: the merge rules are pure and unit-testable
 * without React or a network (the house pattern — feed.ts's seams), and the
 * page keeps only state changes around them. The edge function has its OWN
 * guard (a duplicate of the whitelist, pinned by the Deno-side numbers); the
 * two exist because the server must not trust the model AND the client must
 * not trust the server.
 */
import {
  PLAYDATE_DURATIONS_MINUTES,
  TIME_STEP_MINUTES,
  TITLE_MAX_LENGTH,
  isDuration,
  isSteppedTime,
  validatePlaydateForm,
} from './feed'
import type { PlaydateFormValues } from './feed'

/** The fields the edge function may return (the ticket's pinned whitelist). */
export interface PrefillFields {
  title?: string
  place?: string
  startDate?: string
  startMinutes?: number
  durationMinutes?: number
  ageHint?: string
  details?: string
}

/** What a successful prefill hands the page (one patch, applied once). */
export interface MergePrefillResult {
  /** The FULL next values (the merge writes onto a copy of the page's own). */
  values: PlaydateFormValues
  /** The fields that arrived (the page can show a quiet count if it wants). */
  applied: Array<keyof PrefillFields>
}

/** Legal ISO date (YYYY-MM-DD) that really parses — "2026-02-31" is not one. */
function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00`)
  return !Number.isNaN(parsed.getTime()) && value === localDateKeyOf(parsed)
}

/** The parse's own round-trip: the same key a re-render would read back. */
function localDateKeyOf(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * The response's guard: keep ONLY the seven known fields with legal values.
 * Unknown keys are DROPPED (never spread into the form), an off-grid
 * startMinutes or a fifth duration chip or an unparseable date is DROPPED
 * (never coerced) — the same backstop rules the edge function applies, so
 * neither side alone is load-bearing.
 *
 * `ageHint` is kept as a STRING: PlaydateFormValues still carries the field
 * (V2 pinned the shape), but /new no longer renders or writes it — the
 * summary does not read it back, and the submit omits the column. Carrying
 * it would put a value on a field the parent cannot see, so it is DROPPED
 * here too (the V9 ticket 01 rule: the neighbourhood key exists, the /new
 * form does not ask).
 */
export function prefillFieldsFrom(raw: unknown): PrefillFields {
  const out: PrefillFields = {}
  if (raw === null || typeof raw !== 'object') return out
  const r = raw as Record<string, unknown>

  if (typeof r.title === 'string') {
    const title = r.title.trim()
    if (title !== '') out.title = title.slice(0, TITLE_MAX_LENGTH)
  }
  if (typeof r.place === 'string') {
    const place = r.place.trim()
    if (place !== '') out.place = place.slice(0, 120)
  }
  if (isIsoDate(r.startDate)) out.startDate = r.startDate
  if (typeof r.startMinutes === 'number' && Number.isInteger(r.startMinutes)) {
    if (r.startMinutes >= 0 && r.startMinutes < 24 * 60) {
      const snapped = Math.round(r.startMinutes / TIME_STEP_MINUTES) * TIME_STEP_MINUTES
      out.startMinutes = snapped % (24 * 60)
    }
  }
  if (typeof r.durationMinutes === 'number' && isDuration(r.durationMinutes)) {
    out.durationMinutes = r.durationMinutes
  }
  // ageHint deliberately NOT carried — see the doc above.
  if (typeof r.details === 'string') {
    const details = r.details.trim()
    if (details !== '') out.details = details.slice(0, 500)
  }
  return out
}

/**
 * The ONE merge the button press applies: the arrived fields write onto the
 * form's values, clamped to the form's own rules (grid time, pinned chip
 * set, title cap with the generated-title fallback for an EMPTY arrival —
 * the parent's own title is never overwritten by a missing one).
 *
 * NEVER touched: `neighborhoodId` (the LLM may not set it — a place pick
 * fills it later), and the kids selection lives on the page, not here.
 *
 * The caller (the page) runs the RESULT through validatePlaydateForm before
 * rendering errors — but nothing here may produce an invalid field in the
 * first place: every write is clamped to what the validator accepts.
 */
export function mergePrefill(
  prev: PlaydateFormValues,
  fields: PrefillFields,
): MergePrefillResult {
  const next: PlaydateFormValues = { ...prev }
  const applied: Array<keyof PrefillFields> = []

  if (fields.title !== undefined) {
    next.title = fields.title
    applied.push('title')
  }
  if (fields.place !== undefined) {
    next.place = fields.place
    applied.push('place')
  }
  if (fields.startDate !== undefined) {
    next.startDate = fields.startDate
    applied.push('startDate')
  }
  if (fields.startMinutes !== undefined && isSteppedTime(fields.startMinutes)) {
    next.startMinutes = fields.startMinutes
    applied.push('startMinutes')
  }
  if (
    fields.durationMinutes !== undefined &&
    (PLAYDATE_DURATIONS_MINUTES as readonly number[]).includes(fields.durationMinutes)
  ) {
    next.durationMinutes = fields.durationMinutes
    applied.push('durationMinutes')
  }
  if (fields.details !== undefined) {
    next.details = fields.details
    applied.push('details')
  }
  return { values: next, applied }
}

/**
 * The thin caller: POST { text, todayIso, timezone } to the function with the
 * session's bearer, parse the response's `fields` through the guard.
 *
 * The fetch is INJECTED (the mockable-client pattern) so the unit tests pin
 * the request body EXACTLY — the privacy pin's own test: only the three keys
 * cross, nothing else, ever.
 */
export async function prefillFetch(
  text: string,
  todayIso: string,
  timezone: string,
  fetchImpl: typeof fetch,
): Promise<PrefillFields> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/prefill-playdate`
  const { supabase } = await import('./db')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token ?? ''
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ text, todayIso, timezone }),
  })
  if (!response.ok) {
    throw new Error(`prefill http ${response.status}`)
  }
  const body = (await response.json()) as { fields?: unknown }
  return prefillFieldsFrom(body?.fields)
}

/**
 * The page's post-merge validation gate: the merged values must pass the
 * SAME validator a hand-filled form passes. Returns the errors object ({}
 * when postable). The page renders them in its existing error flow — a
 * prefill that produces an invalid form is a FORM ERROR, not a crash.
 */
export function prefillErrors(values: PlaydateFormValues) {
  return validatePlaydateForm(values)
}
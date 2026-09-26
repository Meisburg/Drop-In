/**
 * The /settings EMAIL opt-out control — the PURE half (migration 0053).
 *
 * The same shape as `decideOptInControl` / `pushOptInGate` in src/lib/push.ts:
 * every fact is injected (the column value as read, whether a write is in
 * flight), the function reads no global, no env and no `window`, and it returns
 * a small result object the component renders verbatim. React renders; this
 * decides.
 *
 * WHY THE "UNKNOWN" CASE IS THE WHOLE POINT OF THIS MODULE. `profiles.email_optout`
 * is an OPT-OUT column: `false` means email is ALLOWED, `true` means the parent
 * asked us to stop. So the two failure readings are not symmetric —
 *
 *   * rendering a failed read as the default (checked = on) is a cosmetic
 *     misstatement: the parent sees the on state, can see the note saying we
 *     could not read it, and a click still writes what they chose;
 *   * rendering a failed read as "email is off" is a SILENT UNSUBSCRIBE: the
 *     control claims a preference the parent never expressed, and on a
 *     pre-0053 project (the column is absent, so the read 42703s) it would do
 *     that to everybody.
 *
 * Hence rule (c) below: `undefined` renders the DEFAULT (checked), never the
 * opt-out state, and says so in the note. `undefined` is not a value the
 * database can produce — the column is NOT NULL — so it only ever means "the
 * read did not come back".
 */

/**
 * The facts the control needs — all injected. No globals, no env, no window.
 */
export interface EmailOptoutFacts {
  /**
   * `profiles.email_optout` as read, or `undefined` when the read did not come
   * back at all: the project is pre-0053 (the column is absent, so PostgREST
   * answers 42703) or the read failed. NOT the same as `false`.
   */
  optout: boolean | undefined
  /** Whether a write is in flight — the control must not double-submit. */
  saving: boolean
  /**
   * Whether the FIRST read is still in flight. Optional, so the two pinned
   * facts above are enough on their own (see emailOptout.test.ts).
   */
  loading?: boolean
}

export interface EmailOptoutControl {
  /** The checkbox/switch state: true = email is allowed. */
  checked: boolean
  /** Whether the control refuses input (a write in flight, or no value yet). */
  disabled: boolean
  /** One honest sentence about the state; '' when there is nothing to say. */
  note: string
}

/**
 * The sentence for a read that did not come back. It must SAY that it is
 * showing the default — a silent default-on is indistinguishable from a stored
 * "on", and the parent is owed the difference.
 */
export const EMAIL_OPTOUT_UNKNOWN_NOTE =
  "We couldn't read your email setting, so this shows the default: email is on. Nothing has changed."

/** The sentence shown while the first read is still in flight. */
export const EMAIL_OPTOUT_LOADING_NOTE = 'Checking your email setting…'

/**
 * The single decision point for the email opt-out control. Rules, in order:
 *
 *  a. `optout === true`      → checked FALSE: the parent opted out, email is
 *                              off.
 *  b. `optout === false`     → checked TRUE: email is allowed. This is the
 *                              column's default, so a parent who never touched
 *                              the toggle reads exactly like one who turned it
 *                              on.
 *  c. `optout === undefined` → checked TRUE **and a note**: a failed read must
 *                              never render as "email is off" (see the header).
 *  d. `saving === true`      → disabled TRUE, whatever the value: no double
 *                              submit, and the control must not fight the write
 *                              that is already in flight.
 *
 * `loading === true` (the first read, before any value exists) is disabled with
 * its own sentence — it is deliberately NOT the failed-read note, because
 * "we couldn't read it" would be a lie while the read is simply still running.
 */
export function decideEmailOptoutControl(facts: EmailOptoutFacts): EmailOptoutControl {
  if (facts.loading === true) {
    return { checked: true, disabled: true, note: EMAIL_OPTOUT_LOADING_NOTE }
  }
  return {
    // Rules a–c in one expression, and it fails OPEN on purpose: only an
    // explicit `true` may ever render the control as "email is off".
    checked: facts.optout !== true,
    disabled: facts.saving,
    note: facts.optout === undefined ? EMAIL_OPTOUT_UNKNOWN_NOTE : '',
  }
}

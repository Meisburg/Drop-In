/**
 * The /settings autosave settle rule (V12 t01): the pure decision for the
 * indicator when a pass comes back with an EMPTY plan (the in-flight pass's
 * writes advanced the baseline past the draft, or an in-flight edit was
 * reverted, so the re-armed follow-up has nothing to write).
 *
 * SettingsPage owns the timer + the writes; this module owns the settle
 * decision, extracted so the coalesced no-op path is unit-testable without a
 * browser. The page's `autosaveMachine` ref carries the plain
 * `AutosaveMachine` flags plus the debounce `timer`.
 */

/** The indicator's states (SettingsPage's `saveStatus`). */
export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error'

/**
 * The autosave machine's in/out flags. `pending` is set ONLY when an edit
 * lands while a pass is running (the coalesce), and is ALWAYS consumed at
 * pass completion — before the re-armed follow-up fires.
 */
export type AutosaveMachine = {
  /** A pass is writing right now. */
  running: boolean
  /** An edit landed mid-flight: the completion re-arms a follow-up pass. */
  pending: boolean
}

/**
 * A pass planned EMPTY: settle the indicator — unconditionally. The settle
 * does NOT gate on the machine's flags (the V12 t01 fix): `pending` is
 * consumed at pass completion, before the re-armed follow-up fires, so it is
 * always false at the empty-plan branch and gating on it left "Saving…"
 * stuck after a coalesced pass. The rule is a plain state transition: a pass
 * that wrote nothing settles "Saving…" to "Saved."; every other state passes
 * through untouched, so a "Saved." line persists after an empty follow-up
 * (no flicker) and "idle"/"error" are never disturbed.
 */
export function autosaveEmptyPass(
  _machine: AutosaveMachine,
  status: AutosaveStatus,
): AutosaveStatus {
  return status === 'saving' ? 'saved' : status
}

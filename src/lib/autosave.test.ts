/**
 * Unit tests for the /settings autosave settle decision (V12 t01): what the
 * indicator does when a pass comes back with an EMPTY plan.
 *
 * The one thing these tests exist for — the coalesced no-op seam: an edit
 * that lands while a pass is running is coalesced; the in-flight pass's
 * completion CONSUMES the coalesce flag and re-arms a follow-up pass WITHOUT
 * touching the indicator, which still reads "Saving…". When the follow-up
 * plans empty (its writes advanced the baseline past the draft, or the edit
 * was reverted), the settle must run even though the coalesce flag no longer
 * says so — otherwise the indicator is stuck on "Saving…" forever (the AC1
 * contract in .scratch/v12/issues/01-settings-autosave.md).
 *
 * The no-flicker cases guard the other side: a pass that lands (status
 * "Saved.") re-arms an empty follow-up, and that follow-up must leave
 * "Saved." alone rather than flickering the line back to idle.
 */
import { describe, expect, it } from 'vitest'
import {
  autosaveEmptyPass,
  type AutosaveMachine,
  type AutosaveStatus,
} from './autosave'

/**
 * The machine exactly as the re-armed follow-up pass sees it: the in-flight
 * pass has finished (`running` back to false) and its completion already
 * consumed the coalesce flag (`pending` back to false) — BEFORE the timer
 * re-armed. That is the moment the empty-plan settle runs.
 */
const FOLLOW_UP_MACHINE: AutosaveMachine = { running: false, pending: false }

describe('autosaveEmptyPass (empty-plan settle)', () => {
  it('settles "Saving…" to "Saved." when the coalesced follow-up plans empty (V12 t01 regression)', () => {
    // The in-flight pass left the indicator on "Saving…" (its completion
    // re-armed instead of settling), and the follow-up has nothing to write.
    const status: AutosaveStatus = 'saving'
    expect(autosaveEmptyPass(FOLLOW_UP_MACHINE, status)).toBe('saved')
  })

  it('leaves "Saved." alone — the "Saved." line persists after an empty follow-up (no flicker)', () => {
    // A pass that wrote landed and settled the indicator; baseline advanced,
    // the re-armed timer fires into an empty plan, and the line must hold.
    const status: AutosaveStatus = 'saved'
    expect(autosaveEmptyPass(FOLLOW_UP_MACHINE, status)).toBe('saved')
  })

  it('leaves "idle" and "error" alone (the settle is a no-op for states it did not create)', () => {
    expect(autosaveEmptyPass(FOLLOW_UP_MACHINE, 'idle')).toBe('idle')
    expect(autosaveEmptyPass(FOLLOW_UP_MACHINE, 'error')).toBe('error')
  })
})

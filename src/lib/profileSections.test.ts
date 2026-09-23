/**
 * Unit tests for V21 t08's profile-section-order seam (src/lib/profileSections.ts).
 *
 * WHAT THIS FILE ACTUALLY DOES: it pins the DECLARED constants and the predicate.
 * It asserts that PROFILE_SECTIONS is the founder-pinned sequence, that each
 * surface's DECLARED section list (PROFILE_VIEW_SECTIONS from ProfileView,
 * PROFILE_EDIT_SECTIONS from ProfilePage) is a legal subsequence of it, and that
 * isInPinnedOrder / sectionsInPinnedOrder behave correctly on known inputs.
 *
 * WHAT IT CANNOT DO — and why this slice adds a second mechanism: those declared
 * lists are hand-maintained literals that MIRROR the JSX. The mirror can drift:
 * V21 t08 shipped exactly that drift (the constant said ['user','kids','parents']
 * while the edit-mode DOM rendered parents before kids), and this test stayed
 * green because it only ever saw the constant. A comment is not a check, and a
 * constant that mirrors nothing is not a check either. The mechanism that catches
 * JSX drift is scripts/profile-order-check.mjs: it launches the built app with the
 * signed-in marker session, enters edit mode on /profile, reads the RENDERED
 * section headings in DOM order, maps them to pinned keys, and exits non-zero when
 * the sequence is not a legal subsequence of the pinned order. Run it after any
 * reorder of a profile card; this file keeps the declared data honest, the script
 * keeps the JSX honest.
 */
import { describe, expect, it } from 'vitest'
import {
  PROFILE_SECTIONS,
  isInPinnedOrder,
  sectionsInPinnedOrder,
  type ProfileSectionKey,
} from './profileSections'
// The two surfaces' declared section orders (the data each surface exports so
// this test can assert on its REAL JSX order without importing React).
import { PROFILE_VIEW_SECTIONS } from '../components/ProfileView'
import { PROFILE_EDIT_SECTIONS } from '../pages/ProfilePage'

// ---------------------------------------------------------------------------
// The two surfaces' declared section orders.
//
// Each surface exports its own list (the data above) mirroring the order its
// JSX lays cards out in. This file asserts every such declaration is a legal
// subsequence of the pinned sequence — it pins the DECLARED constants, not the
// rendered DOM. The rendered-DOM direction is scripts/profile-order-check.mjs
// (see the file header above): reorder a card and that script fails, even if
// the constant below was forgotten to move with it.
// ---------------------------------------------------------------------------

describe('the pinned profile section order (V21 t08)', () => {
  it('pins the founder-asked sequence user → kids → parents → dropins', () => {
    // The single source of truth. If this changes, every surface that derives
    // from it moves with it — and the per-surface assertions below re-check.
    expect(PROFILE_SECTIONS).toEqual(['user', 'kids', 'parents', 'dropins'])
  })

  it('the read view renders all four sections in the pinned order', () => {
    // Fails if the read view ever drops a section OR reorders two of them.
    expect(isInPinnedOrder(PROFILE_VIEW_SECTIONS)).toBe(true)
    // And it is the FULL sequence (no omissions on the read view): the read
    // view is the complete face of a profile, so it must carry every section.
    expect([...PROFILE_VIEW_SECTIONS]).toEqual([...PROFILE_SECTIONS])
  })

  it('the edit surface renders its sections in the pinned relative order', () => {
    // Fails if the edit surface reorders any of its cards (e.g. puts "About the
    // kids" after the parents group, which was the pre-fix drift).
    expect(isInPinnedOrder(PROFILE_EDIT_SECTIONS)).toBe(true)
    // It is a subsequence of the pinned order (it may omit sections it does
    // not support — today that is 'dropins' — but never reorder the rest).
    expect(sectionsInPinnedOrder(PROFILE_EDIT_SECTIONS)).toEqual([...PROFILE_EDIT_SECTIONS])
  })

  it('the edit surface deliberately omits only the drop-ins section', () => {
    // Documents WHY the edit list is shorter than the read list: the omission
    // is 'dropins' and nothing else. If a future slice adds a drop-ins section
    // to the editor, it must add the key here AND flip this expectation.
    const omitted = PROFILE_SECTIONS.filter((key) => !PROFILE_EDIT_SECTIONS.includes(key))
    expect(omitted).toEqual(['dropins'])
  })
})

describe('isInPinnedOrder (the anti-drift predicate)', () => {
  it('accepts the full pinned sequence', () => {
    expect(isInPinnedOrder(['user', 'kids', 'parents', 'dropins'])).toBe(true)
  })

  it('accepts a legal subsequence (a surface that omits sections)', () => {
    expect(isInPinnedOrder(['user', 'parents'])).toBe(true)
    expect(isInPinnedOrder(['user'])).toBe(true)
    expect(isInPinnedOrder([])).toBe(true)
  })

  it('rejects a reordered pair (the exact drift this ticket kills)', () => {
    // Kids after parents — the pre-fix edit-surface shape. Must fail.
    expect(isInPinnedOrder(['user', 'parents', 'kids'])).toBe(false)
    // Drop-ins before the parents group. Must fail.
    expect(isInPinnedOrder(['user', 'kids', 'dropins', 'parents'])).toBe(false)
  })

  it('rejects an unknown section key', () => {
    expect(isInPinnedOrder(['user', 'kids', 'parents', 'dropins', 'unknown'] as unknown as ProfileSectionKey[])).toBe(false)
  })

  it('sectionsInPinnedOrder returns the corrected order for a drifted input', () => {
    // A drifted caller gets back the PINNED order of the same keys — the
    // comparison against its raw list is what the test uses to detect drift.
    expect(sectionsInPinnedOrder(['user', 'parents', 'kids'])).toEqual(['user', 'kids', 'parents'])
  })
})
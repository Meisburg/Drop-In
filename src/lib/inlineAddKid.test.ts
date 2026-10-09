import { describe, expect, it } from 'vitest'
import { isAtKidCap, newlyAddedKidIds, selectionAfterAdd } from './inlineAddKid'

/**
 * V37 slice B (`T6N3`) — the bookkeeping that returns a parent to the flow.
 *
 * The form and the write are reused wholesale; what these cases cover is the part
 * that decides whether the parent lands back IN the outing or merely back ON the
 * page. Each case names the defect it detects.
 */
describe('newlyAddedKidIds — which kid did the add create', () => {
  const kid = (id: string) => ({ id })

  it('names the one id present after and absent before', () => {
    expect(newlyAddedKidIds([kid('a'), kid('b')], [kid('a'), kid('b'), kid('c')])).toEqual(['c'])
  })

  it('⚠️ DEFECT — is NOT "the last row" (the coincidence that breaks on reorder)', () => {
    // `listKids` happens to return a stable order today, so "take the last row"
    // would pass a naive test and break the day that order changes. Here the new
    // kid lands FIRST, where a last-row rule names the wrong child entirely — and
    // the parent would see a sibling pre-selected on a drop-in they are not
    // coming to.
    expect(
      newlyAddedKidIds([kid('a'), kid('b')], [kid('c'), kid('a'), kid('b')]),
    ).toEqual(['c'])
  })

  it('names EVERY new id, in the refreshed list’s own order', () => {
    // A second device (or a retry) can add more than one; the rule must not stop
    // at the first.
    expect(newlyAddedKidIds([kid('a')], [kid('z'), kid('a'), kid('y')])).toEqual(['z', 'y'])
  })

  it('is empty when nothing is new — an unchanged list must not read as an add', () => {
    expect(newlyAddedKidIds([kid('a')], [kid('a')])).toEqual([])
    // The first-ever kid for a parent with an empty list IS new.
    expect(newlyAddedKidIds([], [kid('a')])).toEqual(['a'])
    expect(newlyAddedKidIds([], [])).toEqual([])
  })

  it('ignores a REMOVAL — a delete is not an add', () => {
    expect(newlyAddedKidIds([kid('a'), kid('b')], [kid('a')])).toEqual([])
  })

  it('⚠️ PAIRING HALF — it CAN return a non-empty list, so the empty cases are not vacuous', () => {
    expect(newlyAddedKidIds([], [kid('n')])).toHaveLength(1)
  })
})

describe('selectionAfterAdd — the parent comes back with the kid already coming', () => {
  it('adds the new kid to the existing selection', () => {
    expect(selectionAfterAdd(['a'], ['b'])).toEqual(['a', 'b'])
  })

  it('⚠️ DEFECT — never UNPICKS a sibling (an add must not cost a selection)', () => {
    // The parent had two kids coming; adding a third must leave all three. A rule
    // that REPLACED the selection with "the new kid" would silently drop the
    // siblings off the drop-in they were already going to.
    expect(selectionAfterAdd(['a', 'b'], ['c'])).toEqual(['a', 'b', 'c'])
  })

  it('does not double-add an id that is somehow already selected', () => {
    expect(selectionAfterAdd(['a', 'b'], ['b'])).toEqual(['a', 'b'])
  })

  it('is a no-op when nothing was added — an unchanged list cannot change the picker', () => {
    expect(selectionAfterAdd(['a', 'b'], [])).toEqual(['a', 'b'])
    expect(selectionAfterAdd([], [])).toEqual([])
  })

  it('preserves the previous order, then appends in the list’s order', () => {
    expect(selectionAfterAdd(['b', 'a'], ['y', 'z'])).toEqual(['b', 'a', 'y', 'z'])
  })
})

describe('isAtKidCap — one ceiling, read by both editors', () => {
  it('is true at and above the cap, false below', () => {
    expect(isAtKidCap(0, 5)).toBe(false)
    expect(isAtKidCap(4, 5)).toBe(false)
    // ⚠️ AT the cap is AT it: the boundary is inclusive, matching
    // `addKid`'s own `existing.length >= MAX_KIDS_PER_PROFILE` throw.
    expect(isAtKidCap(5, 5)).toBe(true)
    expect(isAtKidCap(6, 5)).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { MAX_PARENT_CARDS, nextParentPosition, parentCardList, parentCardSaveLabel, parentNameRows } from './parentCards'
import type { ParentCard } from './types'

/**
 * V19 t05 — the parent-card rules.
 *
 * The cap and the order are both enforced in the database too (a CHECK on
 * `position` and a unique index on `(profile_id, position)`). These tests pin
 * the RENDER-side guarantees, which are a different promise: the database
 * refuses a third card, and this makes sure the page could not draw one even if
 * a row predated the constraint.
 */
function card(over: Partial<ParentCard>): ParentCard {
  return {
    id: 'c1',
    profile_id: 'p1',
    name: 'Jon',
    photo_url: null,
    about: null,
    position: 1,
    ...over,
  }
}

describe('parentCardList', () => {
  it('returns cards in SLOT order, not input order', () => {
    // A database round trip is not guaranteed to hand them back in position
    // order, and a partner swapping places between loads is a visible bug.
    const out = parentCardList([card({ id: 'b', position: 2 }), card({ id: 'a', position: 1 })])
    expect(out.map((c) => c.id)).toEqual(['a', 'b'])
  })

  it('caps at two even if more rows exist', () => {
    // Belt-and-braces against a row that predates the 0047 constraint. A
    // three-parent render on a two-parent layout is the failure this prevents.
    const out = parentCardList([
      card({ id: 'a', position: 1 }),
      card({ id: 'b', position: 2 }),
      card({ id: 'c', position: 3 }),
    ])
    expect(out).toHaveLength(MAX_PARENT_CARDS)
    expect(out.map((c) => c.id)).toEqual(['a', 'b'])
  })

  it('drops a nameless card — a blank frame is not a parent', () => {
    const out = parentCardList([card({ id: 'a', position: 1, name: '   ' }), card({ id: 'b', position: 2 })])
    expect(out.map((c) => c.id)).toEqual(['b'])
  })

  it('handles null and empty without throwing', () => {
    expect(parentCardList(null)).toEqual([])
    expect(parentCardList([])).toEqual([])
  })

  it('keeps a card that has words but no photo', () => {
    // A card with words and no picture is COMPLETE, not half-finished.
    const out = parentCardList([card({ about: 'Loves the beach', photo_url: null })])
    expect(out).toHaveLength(1)
  })
})

describe('nextParentPosition', () => {
  it('gives slot 1 to the first parent', () => {
    expect(nextParentPosition([])).toBe(1)
  })

  it('gives slot 2 to the second', () => {
    expect(nextParentPosition([card({ position: 1 })])).toBe(2)
  })

  it('returns null at the cap', () => {
    // Null is what lets the page HIDE the add control rather than offer a
    // button whose write the database would refuse.
    expect(nextParentPosition([card({ position: 1 }), card({ position: 2 })])).toBeNull()
  })

  it('reuses a freed slot after a removal', () => {
    // Removing parent 1 then adding another must fill slot 1, not jump to a
    // gap or overflow past the cap.
    expect(nextParentPosition([card({ position: 2 })])).toBe(1)
  })

  it('treats null as empty', () => {
    expect(nextParentPosition(null)).toBe(1)
  })
})

describe('parentCardSaveLabel (V24 slice 02 — one save-state pattern)', () => {
  // The label walks the same 'idle' | 'saving' | 'saved' | 'error' machine the
  // profile autosave runs (lib/autosave.ts AutosaveStatus). These tests pin the
  // button's own wording at each state, so a page cannot invent a second one.

  it('says "Add parent" for a new card at idle and "Save" for an existing one', () => {
    expect(parentCardSaveLabel('idle', true)).toBe('Add parent')
    expect(parentCardSaveLabel('idle', false)).toBe('Save')
  })

  it('says "Saving…" while in flight', () => {
    expect(parentCardSaveLabel('saving', true)).toBe('Saving…')
    expect(parentCardSaveLabel('saving', false)).toBe('Saving…')
  })

  it('says "Saved" after a successful write (the dwell back to idle is the caller\'s)', () => {
    expect(parentCardSaveLabel('saved', true)).toBe('Saved')
    expect(parentCardSaveLabel('saved', false)).toBe('Saved')
  })

  it('surfaces the error message in the label when present', () => {
    expect(parentCardSaveLabel('error', false, 'Could not save that parent. Try again.')).toBe(
      'Error: Could not save that parent. Try again.',
    )
  })

  it('falls back to "Try again" when the error carries no message', () => {
    expect(parentCardSaveLabel('error', false, null)).toBe('Try again')
    expect(parentCardSaveLabel('error', false, '')).toBe('Try again')
    expect(parentCardSaveLabel('error', false)).toBe('Try again')
  })
})

describe('parentNameRows (V24 slice 11A — the names the READ surface shows)', () => {
  // The read surface renders the family's parent names. A name is a LINK only
  // when we can say WHICH card is the linked account, and the only evidence the
  // schema holds is that the card's name matches that account's handle. These
  // tests pin that rule, including its refusals — the refusals are the privacy
  // posture ("a parent card alone is not a link").

  it('returns every card as a plain name when there is no linked account', () => {
    expect(parentNameRows([card({}), card({ id: 'c2', name: 'Nicole', position: 2 })], null)).toEqual([
      { key: 'c1', name: 'Jon', handle: null },
      { key: 'c2', name: 'Nicole', handle: null },
    ])
  })

  it('links the ONE card whose name is the linked account, and leaves the rest plain', () => {
    const rows = parentNameRows(
      [card({}), card({ id: 'c2', name: 'Nicole', position: 2 })],
      { handle: 'Nicole' },
    )
    expect(rows).toEqual([
      { key: 'c1', name: 'Jon', handle: null },
      { key: 'c2', name: 'Nicole', handle: 'Nicole' },
    ])
  })

  it('matches case- and @-insensitively, the way the handshake compares handles', () => {
    const rows = parentNameRows([card({ name: '  @nicole ' })], { handle: 'Nicole' })
    expect(rows[0]?.handle).toBe('Nicole')
  })

  it('does NOT guess: a near miss stays plain text', () => {
    // "Nicole" is not "Nicole Rivera". A prefix match would put a real profile
    // behind a name whose owner never linked it — the one failure mode this
    // rule must not have.
    const rows = parentNameRows([card({ name: 'Nicole' })], { handle: 'Nicole Rivera' })
    expect(rows[0]?.handle).toBeNull()
  })

  it('links only the FIRST card bearing the name — one partner is one person', () => {
    const rows = parentNameRows(
      [card({ id: 'a', name: 'Nicole' }), card({ id: 'b', name: 'Nicole', position: 2 })],
      { handle: 'nicole' },
    )
    expect(rows.map((row) => row.handle)).toEqual(['nicole', null])
  })

  it('is empty for a family with no cards, and for the still-loading null', () => {
    expect(parentNameRows([], { handle: 'Nicole' })).toEqual([])
    expect(parentNameRows(null, { handle: 'Nicole' })).toEqual([])
  })

  it('keeps the slot order and the two-card cap (the parentCardList rules)', () => {
    const rows = parentNameRows(
      [
        card({ id: 'second', name: 'Nicole', position: 2 }),
        card({ id: 'first', name: 'Jon', position: 1 }),
        card({ id: 'third', name: 'Extra', position: 3 }),
      ],
      null,
    )
    expect(rows.map((row) => row.name)).toEqual(['Jon', 'Nicole'])
  })

  it('drops a nameless card rather than rendering a blank name', () => {
    expect(parentNameRows([card({ name: '   ' })], { handle: 'Jon' })).toEqual([])
  })
})

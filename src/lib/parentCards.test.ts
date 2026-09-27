import { describe, expect, it } from 'vitest'
import { MAX_PARENT_CARDS, nextParentPosition, parentCardAboutText, parentCardList, parentCardPhotoSrc, parentCardSaveLabel, parentNameRows } from './parentCards'
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

describe('parentNameRows (V24 slice 11A — the names the READ surface shows; V25 t09 added the photo and the about)', () => {
  // The read surface renders the family's parent names. A name is a LINK only
  // when we can say WHICH card is the linked account, and the only evidence the
  // schema holds is that the card's name matches that account's handle. These
  // tests pin that rule, including its refusals — the refusals are the privacy
  // posture ("a parent card alone is not a link").
  //
  // V25 t09: each row also carries the card's own `about` and `photo`, because
  // the founder asked for a horizontal ROW per parent (photo · name ·
  // description). The name/handle expectations below were extended, not
  // loosened: the same rule, the same refusals.

  it('returns every card as a plain name when there is no linked account', () => {
    expect(parentNameRows([card({}), card({ id: 'c2', name: 'Nicole', position: 2 })], null)).toEqual([
      { key: 'c1', name: 'Jon', handle: null, about: null, photo: null },
      { key: 'c2', name: 'Nicole', handle: null, about: null, photo: null },
    ])
  })

  it('links the ONE card whose name is the linked account, and leaves the rest plain', () => {
    const rows = parentNameRows(
      [card({}), card({ id: 'c2', name: 'Nicole', position: 2 })],
      { handle: 'Nicole' },
    )
    expect(rows).toEqual([
      { key: 'c1', name: 'Jon', handle: null, about: null, photo: null },
      { key: 'c2', name: 'Nicole', handle: 'Nicole', about: null, photo: null },
    ])
  })

  it('carries each card’s own about and photo — one row per parent', () => {
    const rows = parentNameRows(
      [
        card({ about: '  Loves the beach  ' }),
        card({
          id: 'c2',
          name: 'Nicole',
          position: 2,
          about: null,
          photo_url: 'https://example.test/nicole.jpg',
        }),
      ],
      null,
    )
    expect(rows.map((row) => ({ about: row.about, photo: row.photo }))).toEqual([
      { about: 'Loves the beach', photo: null },
      { about: null, photo: 'https://example.test/nicole.jpg' },
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

describe('parentCardAboutText (V25 t09 — the row’s description half)', () => {
  it('trims the card’s words', () => {
    expect(parentCardAboutText('  Loves the beach  ')).toBe('Loves the beach')
  })

  it('answers null for absent and blank words, so no empty paragraph renders', () => {
    expect(parentCardAboutText(null)).toBeNull()
    expect(parentCardAboutText(undefined)).toBeNull()
    expect(parentCardAboutText('')).toBeNull()
    expect(parentCardAboutText('   \n ')).toBeNull()
  })
})

describe('parentCardPhotoSrc (V25 t09 — THE SCHEMA WALL, stated as a rule)', () => {
  // `parent_cards.photo_url` is a PRIVATE-BUCKET object path (0047), and there
  // is no parent-photo mint, no path convention and no storage policy for that
  // class — so a path cannot be turned into something an <img> can load. These
  // tests pin the honest consequence: the row renders a value the browser can
  // fetch AS GIVEN, and refuses to paint a broken image for anything else.

  it('passes through a source the browser can fetch as given', () => {
    expect(parentCardPhotoSrc('https://example.test/p.jpg')).toBe('https://example.test/p.jpg')
    expect(parentCardPhotoSrc('http://example.test/p.jpg')).toBe('http://example.test/p.jpg')
    expect(parentCardPhotoSrc('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA')
    expect(parentCardPhotoSrc('blob:https://app.test/1234')).toBe('blob:https://app.test/1234')
  })

  it('trims, and answers null for absent or empty', () => {
    expect(parentCardPhotoSrc('  https://example.test/p.jpg  ')).toBe(
      'https://example.test/p.jpg',
    )
    expect(parentCardPhotoSrc(null)).toBeNull()
    expect(parentCardPhotoSrc(undefined)).toBeNull()
    expect(parentCardPhotoSrc('')).toBeNull()
    expect(parentCardPhotoSrc('   ')).toBeNull()
  })

  it('REFUSES a bare object path — it would render as a broken image, not a photo', () => {
    // The shape migration 0047 documents. No mint exists for it, so rendering
    // it is a lie about there being a picture; the row simply has no image.
    expect(parentCardPhotoSrc('11111111-1111-1111-1111-111111111111/parents/1.jpg')).toBeNull()
    expect(parentCardPhotoSrc('kid-photos/1111/parents/1.jpg')).toBeNull()
  })
})

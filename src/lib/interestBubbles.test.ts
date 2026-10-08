/**
 * The sibling test for `interestBubbles` — v35-B (`muzjx0we`).
 *
 * ⚠️ THE DEFECT THIS TEST NAMES: **an unknown interest silently getting a
 * wrong emoji.** The module's contract is that a category it does not recognise
 * keeps its text and gets NO emoji. The failure mode is a fallback — a `?? '✨'`
 * default, or a substring scan loose enough that "earth science" wears 🎨
 * because it contains "art". Either way the page states something the data does
 * not support, and the parent never learns the mapping missed.
 *
 * MUTATION PROOF (run, and recorded in `.scratch/v35-b-report.md`): add a
 * default glyph to `emojiForInterest` (or swap the whole-word scan for a
 * substring one) and the unknown-category legs below go red. The test is
 * load-bearing, not decorative.
 */
import { describe, expect, it } from 'vitest'
import { emojiForInterest, interestBubbles } from './interestBubbles'

describe('interestBubbles — the split', () => {
  it('splits the founder’s own example, and keeps the order he typed', () => {
    // The annotation's example verbatim: "if they're a book lover, it should
    // say 'Book Lover 📕'".
    const bubbles = interestBubbles('Book Lover, Coffee, Hiking')
    expect(bubbles).toEqual([
      { text: 'Book Lover', emoji: '📕' },
      { text: 'Coffee', emoji: '☕' },
      { text: 'Hiking', emoji: '🥾' },
    ])
  })

  it('handles the separators a parent actually types', () => {
    // Semicolons, slashes, ampersands, "and", and a newline all mean "next
    // category" — the data is prose, so the split has to follow the prose.
    expect(interestBubbles('Books; Coffee / Hiking & Camping\nGardening').map((b) => b.text)).toEqual(
      ['Books', 'Coffee', 'Hiking', 'Camping', 'Gardening'],
    )
    expect(interestBubbles('Books and Coffee').map((b) => b.text)).toEqual(['Books', 'Coffee'])
  })

  it('the order is the parent’s order, and a stable list stays stable', () => {
    // Acceptance (e): no reshuffle between renders. Two calls with the same
    // input must return the same sequence — this catches a `sort()` creeping in
    // "for tidiness", which would move a parent's first interest.
    const typed = 'Yoga, Books, Coffee, Hiking'
    const first = interestBubbles(typed)
    const second = interestBubbles(typed)
    expect(first.map((b) => b.text)).toEqual(['Yoga', 'Books', 'Coffee', 'Hiking'])
    expect(second).toEqual(first)
  })

  it('empty inputs yield no bubbles (the block’s own gate still decides)', () => {
    expect(interestBubbles(null)).toEqual([])
    expect(interestBubbles(undefined)).toEqual([])
    expect(interestBubbles('')).toEqual([])
    expect(interestBubbles('   ')).toEqual([])
    expect(interestBubbles(' , ; / ')).toEqual([])
  })

  it('keeps duplicates the parent typed (this module does not edit their words)', () => {
    expect(interestBubbles('Coffee, Coffee').map((b) => b.text)).toEqual(['Coffee', 'Coffee'])
  })
})

describe('emojiForInterest — the mapping, and its unknown rule', () => {
  it('maps a known category, case- and punctuation-insensitively', () => {
    expect(emojiForInterest('coffee')).toBe('☕')
    expect(emojiForInterest('Coffee')).toBe('☕')
    expect(emojiForInterest('COFFEE')).toBe('☕')
    expect(emojiForInterest('Coffee!')).toBe('☕')
    expect(emojiForInterest('  coffee  ')).toBe('☕')
  })

  it('maps a two-word category the founder named, exactly', () => {
    expect(emojiForInterest('Book Lover')).toBe('📕')
    expect(emojiForInterest('TV show')).toBe('📺')
  })

  it('finds a keyword inside a looser phrase', () => {
    // The tolerant lane: a parent who wrote "sci-fi books" still gets 📕.
    expect(emojiForInterest('sci-fi books')).toBe('📕')
    expect(emojiForInterest('reading novels')).toBe('📕')
  })

  /**
   * ⚠️ THE HEART OF THE TEST — the unknown rule, three ways.
   */
  it('THE DEFECT: an unknown category gets NO emoji, never a wrong or random one', () => {
    expect(emojiForInterest('Competitive Napping')).toBeNull()
    expect(emojiForInterest('Quantum Tunnelling')).toBeNull()
    expect(emojiForInterest('Kombucha Brewing')).toBeNull()
  })

  it('an unknown category is not silently matched by a SUBSTRING of a known one', () => {
    // A substring scan would dress these in a wrong glyph and the page would
    // look confident and be wrong — the defect this test exists for.
    // "cartwheels" contains "car"; "earthbound" contains "art"; "heartbeat"
    // contains "art" too. None is a category the vocabulary knows.
    expect(emojiForInterest('cartwheels')).toBeNull()
    expect(emojiForInterest('earthbound')).toBeNull()
    expect(emojiForInterest('heartbeat')).toBeNull()
    expect(emojiForInterest('scarfwearing')).toBeNull()
    // ...and the tolerant lane still works when the known word stands ALONE as
    // a word: "scarf knitting circle" really is knitting.
    expect(emojiForInterest('scarf knitting circle')).toBe('🧶')
  })

  it('an unknown category keeps its text and drops only the emoji', () => {
    // The founder's rule, at the seam the component reads: "never a blank
    // bubble". The text survives; only the glyph is absent.
    const bubbles = interestBubbles('Coffee, Competitive Napping, Hiking')
    expect(bubbles).toEqual([
      { text: 'Coffee', emoji: '☕' },
      { text: 'Competitive Napping', emoji: null },
      { text: 'Hiking', emoji: '🥾' },
    ])
    // The unknown entry is never dropped and never emptied.
    expect(bubbles[1].text).toBe('Competitive Napping')
    expect(bubbles[1].emoji).toBeNull()
  })

  it('a blank category has no emoji (nothing to map)', () => {
    expect(emojiForInterest('')).toBeNull()
    expect(emojiForInterest('   ')).toBeNull()
  })
})

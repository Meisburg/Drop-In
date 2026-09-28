/**
 * V27 slice 2 — the "vibe chips" that turn /new's optional Details field into
 * an inviting one-tap sentence.
 *
 * THE RULE LIVES HERE, NOT IN THE PAGE. A parent who cannot think of what to
 * write should not face a blank box: four starter sentences name the ordinary
 * kinds of drop-in, and tapping one writes it into Details. Deciding WHAT a tap
 * writes (and that a second tap on the same chip is a no-op) is a domain rule,
 * so it is a pure function with a sibling test (docs/agents/code-structure.md).
 * The page only renders `VIBE_CHIPS` and calls `applyVibeChip`.
 *
 * APPEND, NEVER REPLACE. A chip is a starter, not a mode: a parent who has
 * already typed their own sentence keeps it, and the chip lands under it on a
 * new line. The one exception is an EMPTY (or whitespace-only) field — there is
 * nothing to append to, so the chip's sentence IS the field.
 *
 * IDEMPOTENT BY TEXT, NOT BY INDEX. "Already there" is answered by
 * `current.includes(chip.text)`, so tapping the same chip twice never
 * duplicates its sentence — even after other chips have been added around it.
 */

/** One starter sentence, with the label the button shows and the text it writes. */
export interface VibeChip {
  id: string
  label: string
  text: string
}

/**
 * The four starters, in the order the form renders them. `text` is the exact
 * sentence the Details field receives; `label` is the shorter button copy.
 */
export const VIBE_CHIPS: readonly VibeChip[] = [
  { id: 'playground', label: 'Playground hang', text: 'Playground hang — all ages welcome' },
  { id: 'stroller', label: 'Stroller walk', text: 'Stroller walk — easy pace' },
  { id: 'pickup', label: 'Pickup game', text: 'Pickup game — all levels' },
  { id: 'snacks', label: 'Snacks welcome', text: 'Bring a snack to share' },
]

/**
 * What tapping `chip` writes into the Details field.
 *
 * - empty (or whitespace-only) → the chip's sentence alone;
 * - the field already contains the sentence → the field, UNCHANGED (so a second
 *   tap is a no-op and never duplicates);
 * - otherwise → the existing text (right-trimmed) + a newline + the sentence.
 */
export function applyVibeChip(current: string, chip: VibeChip): string {
  if (current.trim() === '') return chip.text
  if (current.includes(chip.text)) return current
  return `${current.trimEnd()}\n${chip.text}`
}

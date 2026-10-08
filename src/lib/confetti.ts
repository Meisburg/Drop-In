/**
 * The RSVP confirmation's confetti geometry (v33-13) — PURE.
 *
 * WHY IT IS A LIB DECISION AND NOT A RENDER. The component renders the pieces;
 * this module decides where they sit, when they fall, how long they live and
 * which colour each takes. `Math.random()` is not allowed in the component:
 * the seeded pure function is the seam the build law asks for (React renders,
 * `lib/` decides), and a fixed seed makes the layout deterministic — the same
 * dialog always bursts the same way, which is what keeps it testable without a
 * DOM.
 *
 * THE BOUNDS ARE THE CONTRACT. Every horizontal position lands inside 0–100 %
 * of the layer (no piece escapes the dialog's own box), every duration and
 * delay is positive, and the whole burst settles before `MAX_TOTAL_MS` — the
 * animation is a moment, not a loop. The sibling test asserts all four, named
 * for what they protect rather than the mechanism.
 */

/** One confetti piece: its CSS-ready geometry + colour slot. */
export interface ConfettiPiece {
  /** Horizontal start, as a percentage of the layer's width (0–100). */
  leftPct: number
  /** Stagger before the piece starts falling, seconds. */
  delaySec: number
  /** Fall time, seconds. */
  durationSec: number
  /** Spin through the fall, degrees. */
  rotationDeg: number
  /** Index into the layer's palette (the CSS owns the actual colours). */
  colorIndex: number
}

/** How long the whole burst may take to settle, ms (delay + duration, max). */
export const MAX_TOTAL_MS = 2500

const MIN_DURATION_MS = 900
const MAX_DURATION_MS = 1600
const MAX_DELAY_MS = 400
/** Four slots: the brand terracotta, park green, amber, and a warm slate. */
const COLOR_SLOTS = 4

/**
 * A small integer hash (FNV-1a over the seed string), so the seed can be a
 * readable value like the playdate id rather than a pre-mixed number.
 */
function hashSeed(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * mulberry32: a tiny deterministic PRNG. Same seed → same stream, on every
 * engine, with no dependency. Returns values in [0, 1).
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The piece list for one burst: `count` pieces, each with a position, stagger,
 * fall time, spin and colour slot — all derived from `seed` alone.
 */
export function confettiPieces(count: number, seed: string): ConfettiPiece[] {
  const rand = mulberry32(hashSeed(seed))
  const pieces: ConfettiPiece[] = []
  for (let i = 0; i < count; i += 1) {
    const durationMs = MIN_DURATION_MS + Math.floor(rand() * (MAX_DURATION_MS - MIN_DURATION_MS + 1))
    const delayMs = Math.floor(rand() * (MAX_DELAY_MS + 1))
    pieces.push({
      leftPct: Math.round(rand() * 1000) / 10,
      delaySec: delayMs / 1000,
      durationSec: durationMs / 1000,
      rotationDeg: Math.floor(rand() * 720) - 360,
      colorIndex: Math.floor(rand() * COLOR_SLOTS),
    })
  }
  return pieces
}

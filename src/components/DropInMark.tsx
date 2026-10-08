/**
 * The Drop In mark (V7): the playground — a slide under a tree, standing on the
 * ground line.
 *
 * It replaces the droplet in the same release that replaced indigo (see the
 * colour block in index.css). The droplet said "water", and water was never the
 * product. A slide and a tree say "outside, playing, kids" in one glance, and
 * the tree is what keeps the slide alone from reading as office equipment.
 *
 * Inline SVG rather than an asset file, for the reason the droplet version
 * already had: it stays crisp at the 28px the header uses. The slide is drawn in
 * `currentColor`, so it matches the wordmark it sits beside without needing a
 * second colour decision.
 *
 * TWO VARIANTS, because the mark lands on two very different fields:
 *
 *  - 'color' (default) — a light surface (the header, the login card). The slide
 *    takes currentColor, which is the brand terracotta everywhere it is used, and
 *    the tree keeps its park green.
 *  - 'mono' — a field of brand colour (the splash). Everything is currentColor
 *    and depth comes from OPACITY instead of hue, because a green tree on the
 *    terracotta splash field reads as Christmas.
 *
 * THE SAME GEOMETRY IS DRAWN IN FOUR OTHER PLACES. If the mark changes, all five
 * move together:
 *   assets/drop-in-icon.svg   the app icon (regenerate: scripts/build-icons.sh)
 *   public/favicon.svg        the browser tab
 *   index.html                the static boot splash (first painted frame)
 *   scripts/build-splash.mjs  the iOS startup images
 */

/** Park green — the canopy that catches the light (the emerald-* tints in CSS). */
const TREE = '#93c066'
/** The shaded canopy and the ground line. */
const TREE_DEEP = '#7fae54'
/** The trunk — warm bark, so the tree reads as a tree and not as a green disc. */
const BARK = '#6b4a34'

export function DropInMark({
  className,
  variant = 'color',
  testId,
}: {
  className?: string
  variant?: 'color' | 'mono'
  /** Optional `data-testid` for a caller that pins the mark in a spec. */
  testId?: string
}) {
  const mono = variant === 'mono'
  const slide = 'currentColor'
  const tree = mono ? 'currentColor' : TREE
  const treeDeep = mono ? 'currentColor' : TREE_DEEP
  const bark = mono ? 'currentColor' : BARK

  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" data-testid={testId}>
      {/* The tree. Two overlapping canopies give it a shape at 28px; a single
          circle would read as a dot. */}
      <circle cx="15" cy="21" r="10" fill={tree} />
      <circle cx="23" cy="26" r="6.5" fill={treeDeep} fillOpacity={mono ? 0.75 : 1} />
      <rect x="12.5" y="28" width="5" height="18" rx="2.5" fill={bark} />

      {/* The slide: the chute, its platform, and the ladder that gets you up
          there. All one colour — they are one object. */}
      <path
        d="M38 19 L51 41"
        stroke={slide}
        strokeWidth="8.5"
        strokeLinecap="round"
        fill="none"
      />
      <rect x="28" y="12" width="14" height="9" rx="4.5" fill={slide} />
      <path
        d="M31.5 22 L31.5 45 M37.5 22 L37.5 45"
        stroke={slide}
        strokeWidth="3.6"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M31.5 30 L37.5 30 M31.5 37.5 L37.5 37.5"
        stroke={slide}
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />

      {/* The ground line. It is what makes a tree and a slide a PLACE rather than
          two icons that happen to be near each other — and it is the descendant
          of the droplet's landing ripple, kept deliberately quiet. */}
      <rect
        x="7"
        y="48"
        width="50"
        height="6.5"
        rx="3.25"
        fill={treeDeep}
        fillOpacity={mono ? 0.45 : 1}
      />
    </svg>
  )
}

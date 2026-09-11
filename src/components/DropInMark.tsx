/**
 * The Drop In mark (V4 slice 2): a droplet landing on the water it just
 * disturbed. Inline SVG rather than an asset file so it inherits
 * `currentColor` and stays crisp at the 24–28px the header uses.
 *
 * The raster app icons come from assets/drop-in-icon.svg (same geometry,
 * white on indigo) — regenerate with scripts/build-icons.sh.
 */
export function DropInMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path
        d="M32 6 C32 6 19 25 19 34 a13 13 0 0 0 26 0 C45 25 32 6 32 6 Z"
        fill="currentColor"
      />
      <path
        d="M12 52 Q32 62 52 52"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.45"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </svg>
  )
}

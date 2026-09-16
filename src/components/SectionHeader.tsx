/**
 * The restrained section header (V11 ticket 04) — a compact gradient band,
 * NOT a hero: a small stroked glyph in a soft tile, the page's single h1, and
 * a one-line tagline that says what THIS screen is for. No images; the
 * feed/cards stay above the fold. The component owns the h1, so a page that
 * renders it renders no other.
 */
export function SectionHeader({
  icon,
  title,
  tagline,
}: {
  /** An SVG path from NAV_ICONS (the shared 24px stroked glyph family). */
  icon: string
  title: string
  tagline: string
}) {
  return (
    <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-slate-50 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d={icon} />
          </svg>
        </div>
        <div className="flex flex-col">
          <h1 className="font-display text-lg font-semibold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-600">{tagline}</p>
        </div>
      </div>
    </div>
  )
}
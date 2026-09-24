/**
 * The page masthead — a printed notice heading, not a card.
 *
 * V11 ticket 04 shipped this as a compact gradient "band": a rounded border, an
 * `indigo-50 → white → slate-50` wash, and an icon in a tinted tile. Reviewed
 * against the frontend-design lens (docs/design-review/frontend-design-pass.md)
 * it was the single most-repeated device in the app — the identical card opened
 * Feed, Places, Profile, Settings, and Inbox — so it read as template chrome
 * rather than as each screen's own voice. It was also *broken* in dark mode:
 * `via-white` is not re-pointed by the dark token block (that only overrides
 * `.bg-white`), so the band painted a glaring white gradient on the dark page.
 *
 * This is the de-chromed replacement: no box, no gradient, no icon tile. The
 * screen's name is set in the display face at the top of the page and the
 * optional tagline sits under it, so the first thing a parent sees is the page
 * itself rather than a component. The `icon` prop is accepted and ignored so the
 * existing call sites keep compiling while the chrome is removed — a page title
 * does not need a pictogram to be legible.
 *
 * The component still OWNS the page's single `h1`, so a page that renders it
 * renders no other. The tagline is OPTIONAL: a screen whose purpose is obvious
 * from its title (Inbox) renders title-only rather than an empty line.
 */
export function SectionHeader({
  title,
  tagline,
}: {
  /** Kept for call-site compatibility; deliberately not rendered. */
  icon?: string
  title: string
  /** Omit when the title alone says what the screen is for. */
  tagline?: string
}) {
  return (
    <header className="flex flex-col gap-0.5 pt-0.5">
      <h1 className="font-display text-xl font-semibold text-slate-900">{title}</h1>
      {tagline === undefined || tagline === '' ? null : (
        <p className="text-sm text-slate-600">{tagline}</p>
      )}
    </header>
  )
}

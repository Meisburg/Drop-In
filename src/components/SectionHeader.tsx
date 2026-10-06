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
  testId,
}: {
  /** Kept for call-site compatibility; deliberately not rendered. */
  icon?: string
  title: string
  /** Omit when the title alone says what the screen is for. */
  tagline?: string
  /**
   * An optional testid on the masthead itself. ⚠️ IT IS NO LONGER THE FIRST-RUN
   * TOUR'S TARGET: r3-7 pointed the "Drop Ins" step here (`feed-section-header`),
   * and the founder overruled that on 2026-10-05 — the first lightbox must ring
   * the Drop Ins NAV ICON, because a parent has to be able to press the thing
   * being taught (see `lib/firstRunTooltips.ts`'s target docblock for his words
   * and the measurement). The id is kept because `FeedPage` still passes it and
   * a screen's own masthead is a reasonable anchor for a future reader; nothing
   * locates it today. Omitted everywhere else, so it never leaks a locator onto
   * another screen.
   */
  testId?: string
}) {
  return (
    <header data-testid={testId} className="flex flex-col gap-0.5 pt-0.5">
      <h1 className="font-display text-xl font-semibold text-slate-900">{title}</h1>
      {tagline === undefined || tagline === '' ? null : (
        <p className="text-sm text-slate-600">{tagline}</p>
      )}
    </header>
  )
}

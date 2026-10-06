import type { ReactNode } from 'react'

/**
 * One named category screen on /settings (V27; settings-restructure changed what
 * carries the id).
 *
 * It still renders the SAME three things: a stable id, a heading tied to the
 * section for assistive tech, and the scroll margin.
 *
 * ⚠️ WHAT MOVED. V27 stacked six of these in one scroll and the id was the hash
 * target of a deep link (`/settings#privacy`). The page is now an index plus one
 * category at a time, so the id is the URL SEGMENT (`/settings/privacy`), and the
 * old hash `<Navigate replace>`s to that path rather than scrolling to it. The
 * id is therefore still load-bearing — it is the six strings
 * `src/lib/settingsIndex.ts` owns and the app's advertised copy points at — and
 * the scroll margin stays with it: the heading is still an id'd in-page anchor,
 * and whether the hash redirect or a future caller needs the margin is not this
 * component's call to make.
 *
 * Presentational only: it renders what it is given.
 */
export function SettingsSection({
  id,
  title,
  description,
  children,
}: {
  id: string
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="flex scroll-mt-4 flex-col gap-3"
    >
      <div>
        <h2
          id={`${id}-heading`}
          className="font-display text-lg font-semibold text-slate-900"
        >
          {title}
        </h2>
        {description === undefined ? null : (
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        )}
      </div>
      {children}
    </section>
  )
}

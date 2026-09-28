import type { ReactNode } from 'react'

/**
 * One named block on /settings (V27). The page grew from three stacked cards to
 * six named sections, and every one needs the SAME three things: a stable id so
 * other copy can deep-link to it (`/settings#privacy`), a heading tied to the
 * section for assistive tech, and the scroll margin that keeps the heading clear
 * of the top of the viewport when that deep link lands.
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

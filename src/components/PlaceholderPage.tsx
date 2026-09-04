import type { ReactNode } from 'react'

/**
 * Minimal mobile-first placeholder for routes whose real screens land in a
 * later slice (see plan.md Slices).
 */
export function PlaceholderPage({
  title,
  note,
  children,
}: {
  title: string
  note?: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
      {note ? <p className="text-sm text-slate-500">{note}</p> : null}
      {children}
    </div>
  )
}
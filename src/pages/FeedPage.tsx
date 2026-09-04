import { Link } from 'react-router'

/**
 * Today's drop-ins (slice 3 fills in the real feed).
 * Placeholder with a designed empty state, mobile-first.
 */
export function FeedPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-900">Today</h1>
      <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm text-slate-500">
          Nothing happening in your neighborhoods today.
        </p>
        <Link
          to="/new"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
        >
          Post the first drop-in
        </Link>
      </div>
    </div>
  )
}
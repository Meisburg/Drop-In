import { PLACE_KIND_ICONS } from './icons'
import type { PlaceKind } from '../lib/types'

/**
 * v30-6 — the per-kind place illustration, in ONE place.
 *
 * It was inline in the directory card's photo slot (V17 built the per-kind
 * glyph set, V27 restored the slot). The place page now draws the same fallback
 * for a place with no picture, so the markup lives here and both surfaces render
 * it — one illustration rule, two callers, no second copy to drift.
 *
 * It is DECORATIVE by construction: `aria-hidden`, and the place's name is
 * always adjacent in text. The colour is a per-kind tint, never the only
 * channel — the kind is also a word on both surfaces.
 */
const KIND_ACCENTS: Record<string, string> = {
  playground: 'text-emerald-500',
  indoor_play: 'text-violet-500',
  museum: 'text-amber-600',
  pool: 'text-sky-500',
  splash_pad: 'text-cyan-500',
  library: 'text-rose-500',
  beach: 'text-orange-500',
  other: 'text-slate-500',
}

export function PlaceKindArt({
  kind,
  className = 'h-14 w-14',
}: {
  kind: PlaceKind
  className?: string
}) {
  return (
    <div
      aria-hidden="true"
      className="flex h-full w-full items-center justify-center bg-slate-50"
    >
      <svg
        viewBox="0 0 24 24"
        className={`${className} ${KIND_ACCENTS[kind] ?? 'text-slate-400'}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={PLACE_KIND_ICONS[kind]} />
      </svg>
    </div>
  )
}

export { KIND_ACCENTS }

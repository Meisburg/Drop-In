import { useEffect, useState } from 'react'
import { DropInMark } from './DropInMark'
import { useSessionContext } from './SessionProvider'

/**
 * The cold-start splash (V4 slice 3) — two layers, deliberately:
 *
 *  1. `index.html` paints a static brand splash inside #root, so the very
 *     first frame (before the JS bundle has parsed) is already the brand
 *     rather than a white flash. React clears that markup on mount.
 *  2. This overlay continues from that exact frame — same colour, same mark,
 *     same position — and decides when to get out of the way.
 *
 * V7: the surface is `bg-indigo-500` (the brand hue), NOT `bg-indigo-600`.
 * 600 is the AA-safe tone used for buttons and links, where white text has to
 * clear 4.5:1; this is decorative artwork, and it must match the static boot
 * splash in index.html (#e8552f), the app icon and the manifest theme colour
 * exactly — otherwise a cold start shows two different oranges in a row.
 *
 * Dismissal is "settled AND a floor, or a hard cap":
 *  - the floor stops a fast session load from flashing the logo for 3 frames,
 *  - the cap stops a slow network from holding the app hostage.
 *
 * It renders once per page load and is never re-shown on in-app navigation —
 * that is what makes it feel like an app launch instead of a page transition.
 */
const MIN_VISIBLE_MS = 650
const MAX_VISIBLE_MS = 2000
const FADE_MS = 320

export function SplashScreen() {
  const { loading, profileLoading } = useSessionContext()
  const [floorPassed, setFloorPassed] = useState(false)
  const [capped, setCapped] = useState(false)
  const [fading, setFading] = useState(false)
  const [mounted, setMounted] = useState(true)

  // Hand off from the static boot splash in index.html. React normally clears
  // the container on mount, but removing it explicitly means the splash can
  // never get stuck if that ever changes.
  useEffect(() => {
    document.getElementById('boot-splash')?.remove()
  }, [])

  useEffect(() => {
    const floor = window.setTimeout(() => setFloorPassed(true), MIN_VISIBLE_MS)
    const cap = window.setTimeout(() => setCapped(true), MAX_VISIBLE_MS)
    return () => {
      window.clearTimeout(floor)
      window.clearTimeout(cap)
    }
  }, [])

  const settled = !loading && !profileLoading
  const done = capped || (settled && floorPassed)

  useEffect(() => {
    if (!done) return
    setFading(true)
    const unmount = window.setTimeout(() => setMounted(false), FADE_MS)
    return () => window.clearTimeout(unmount)
  }, [done])

  if (!mounted) return null

  return (
    <div
      aria-hidden="true"
      data-testid="splash"
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-indigo-500 text-white transition-opacity duration-300 motion-reduce:transition-none ${
        fading ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      <DropInMark className="h-28 w-28" variant="mono" />
      {/* The wordmark under the mark. Same face and weight as the header's, so
          the splash and the app read as one thing across the handoff rather
          than as two different logos. `mono` because this is a field of brand
          colour: a green tree on it would read as Christmas. */}
      <p className="font-display text-2xl font-bold">Drop In</p>
    </div>
  )
}

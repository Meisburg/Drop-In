import { useEffect, useState } from 'react'

/** The media query this hook reads. Kept as a const so the string is written once. */
const QUERY = '(prefers-reduced-motion: reduce)'

/**
 * Does the viewer's OS/browser ask for reduced motion? (V24 slice 10.)
 *
 * FIRST USE IN THIS APP — before this slice, `src/` had zero
 * `prefers-reduced-motion` handling; the house convention was the Tailwind
 * `motion-reduce:transition-none` utility, which covers CSS transitions but
 * cannot reach a JS `scrollIntoView({ behavior })` call. The map view's
 * recentre is such a call, so the preference has to be readable from JS.
 *
 * WHAT IT OWNS, and why each half is here rather than at the call site:
 *
 *  1. **The default when there is no `matchMedia`.** Older/embedded engines and
 *     the vitest Node environment have no `window.matchMedia`; the honest answer
 *     there is `false` (animate), because nothing has ASKED for reduced motion.
 *     Defaulting to `true` would silently strip animation from every browser
 *     that cannot express the preference — the opposite of the rule's intent.
 *  2. **It tracks a LIVE change.** A viewer who flips the OS setting with the app
 *     open gets the new answer on the next render (`addEventListener('change')`),
 *     rather than only after a reload. The initial value is read in the state
 *     initialiser, not an effect, so the first paint already uses the real
 *     preference — a `useEffect` would animate the very first recentre for a
 *     viewer who asked for none.
 *  3. **The listener is removed on unmount**, keyed to the same query object the
 *     hook subscribed with. The map view mounts and unmounts on every trip
 *     between list and map, so a leaked listener would accumulate.
 *
 * What it deliberately does NOT own: the *decision* of which `ScrollBehavior`
 * that preference implies. That is `scrollBehaviorFor` in `src/lib/mapStrip.ts`,
 * a pure function with its own test. This hook answers a question about the
 * browser; the module answers a question about the app.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia(QUERY).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const query = window.matchMedia(QUERY)
    // Re-read on subscribe: the preference can change between the initialiser
    // and this effect (a render interrupted by a paint), and the listener alone
    // would not report a change that already happened.
    setReduced(query.matches)
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches)
    query.addEventListener('change', onChange)
    return () => {
      query.removeEventListener('change', onChange)
    }
  }, [])

  return reduced
}

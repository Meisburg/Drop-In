import { useEffect } from 'react'
import type { RefObject } from 'react'
import { nextTrapTarget, shouldInterceptTab } from '../lib/focusTrap'

/**
 * Traps Tab/Shift+Tab inside `ref.current` while `active`, and restores focus
 * to the element that had it when the trap activated (the trigger). Used by
 * the three portal dialogs so keyboard focus cannot escape an open dialog, and
 * returns to the opener on close. Hand-written — no dependency.
 *
 * The WRAP DECISION lives in `lib/focusTrap.ts` as a pure function, because
 * this repo's test environment has no DOM (every other test is `src/lib/*`),
 * and adding jsdom would mean a new dependency. The DOM work — querying,
 * focusing, listening — stays here; only the "where does Tab go next" question
 * is pure, and that is the part with the edge cases worth pinning.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return

    // Record who had focus before the dialog opened, so we can give it back.
    const previouslyFocused = document.activeElement as HTMLElement | null

    function getFocusable(): HTMLElement[] {
      const root = ref.current
      if (root === null) return []
      return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null && !el.hidden,
      )
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Tab') return
      const root = ref.current
      if (root === null) return
      const focusable = getFocusable()

      // Where should Tab go, and must we intervene at all? Both are pure
      // decisions (see lib/focusTrap.ts) — this effect only applies them.
      const current = document.activeElement as HTMLElement | null
      const currentIndex = focusable.indexOf(current as HTMLElement)
      const indexInside = current !== null && root.contains(current) ? currentIndex : -1
      const targetIndex = nextTrapTarget(focusable.length, indexInside, event.shiftKey)

      if (targetIndex === null) {
        // Nothing focusable in the dialog: keep focus from leaving entirely.
        event.preventDefault()
        return
      }
      // A move that stays inside the dialog needs no handling — letting the
      // browser do it preserves normal tab order.
      if (!shouldInterceptTab(focusable.length, indexInside)) return

      event.preventDefault()
      focusable[targetIndex].focus()
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      // Restore focus to the trigger; guard against it having been removed.
      if (previouslyFocused !== null && document.contains(previouslyFocused) && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus()
      }
    }
  }, [active, ref])
}
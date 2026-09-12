import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { ConfirmDialog } from './ConfirmDialog'

/**
 * The unsaved-changes guard (V8 ticket 10): while a form is dirty, leaving the
 * page asks first.
 *
 * WHY IT EXISTS. /profile seeds its fields from the profile row and then drops
 * them on any navigation — type a bio, tap "Today" in the bottom nav, and the
 * typing is simply gone with nothing said. Autosave would be the other honest
 * answer; this is the one the ticket calls "enough", and it is the one that
 * never writes something a parent did not ask for.
 *
 * HOW IT CATCHES A NAVIGATION. Two mechanisms, because there are two ways off
 * a page:
 *
 *  1. `beforeunload` — a refresh, a tab close, a typed URL, an external link.
 *     The browser owns that prompt; we only arm it.
 *  2. THE APP'S OWN LINKS. The app is a `BrowserRouter` (not a data router),
 *     so react-router's `useBlocker` is not available. Instead this hook
 *     listens in the CAPTURE phase on `document` — an ancestor of React 18's
 *     root container — and cancels the click of a same-origin in-app link
 *     before React Router's `<Link>` handler sees it. `<Link>` checks
 *     `event.defaultPrevented` and skips the navigation, so the dialog below
 *     is the only thing that moves the page afterwards.
 *
 * It deliberately does NOT intercept: modified clicks (⌘/Ctrl/middle-click
 * open in a new tab — the current page keeps its state), `target="_blank"`,
 * `download`, external origins, or a link to the path already on screen.
 * Programmatic navigation (navigate() in a click handler) is not covered —
 * nothing on /profile navigates programmatically while dirty.
 */
export function useUnsavedChangesGuard(dirty: boolean): { dialog: ReactNode } {
  const navigate = useNavigate()
  const [pendingHref, setPendingHref] = useState<string | null>(null)

  // (1) The browser-level prompt: refresh / tab close / leaving the app.
  useEffect(() => {
    if (!dirty) return
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      // Legacy browsers need returnValue set; the string is ignored by all
      // current ones (the browser shows its own sentence).
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  // (2) The app's own links.
  useEffect(() => {
    if (!dirty) return
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target
      const anchor =
        target instanceof Element ? target.closest<HTMLAnchorElement>('a[href]') : null
      if (anchor === null) return
      if (anchor.target === '_blank' || anchor.hasAttribute('download')) return
      let url: URL
      try {
        url = new URL(anchor.href, window.location.href)
      } catch {
        return
      }
      if (url.origin !== window.location.origin) return
      // A link back to this same page is not leaving.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
      event.preventDefault()
      setPendingHref(`${url.pathname}${url.search}${url.hash}`)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [dirty])

  if (pendingHref === null) return { dialog: null }

  return {
    dialog: (
      <ConfirmDialog
        testId="unsaved-changes-dialog"
        destructive={false}
        title="Leave without saving?"
        body="Your edits haven’t been saved yet. Leaving this page drops them."
        confirmLabel="Leave without saving"
        onConfirm={() => {
          const href = pendingHref
          setPendingHref(null)
          navigate(href)
        }}
        onCancel={() => setPendingHref(null)}
      />
    ),
  }
}

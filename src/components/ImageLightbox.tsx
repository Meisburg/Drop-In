import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { IMAGE_LIGHTBOX_Z_CLASS } from '../lib/db'

/**
 * Full-screen photo viewer (V6).
 *
 * First phone feedback: "if I were looking at an event a stranger posted, the
 * first thing I'd do is tap their profile picture to see a bigger picture...
 * I expect them to expand to the size of my phone screen."
 *
 * Tapping ANY photo opens it; tapping anywhere closes it (the human asked for
 * tap-again-to-dismiss). Escape and an explicit close button exist because a
 * tap-to-dismiss-only overlay is a trap for keyboard and screen-reader users.
 *
 * Provided through context rather than threaded as props: photos live in five
 * different components (the detail host line, comment rows, the public host
 * avatar, a profile header, kid rows) and threading an onExpand callback
 * through each of their parents would touch far more code than it protects.
 */
const LightboxContext = createContext<{ open: (src: string, alt: string) => void } | null>(null)

export function LightboxProvider({ children }: { children: ReactNode }) {
  const [photo, setPhoto] = useState<{ src: string; alt: string } | null>(null)
  const open = useCallback((src: string, alt: string) => setPhoto({ src, alt }), [])
  const close = useCallback(() => setPhoto(null), [])
  return (
    <LightboxContext.Provider value={{ open }}>
      {children}
      {photo !== null ? (
        <ImageLightbox src={photo.src} alt={photo.alt} onClose={close} />
      ) : null}
    </LightboxContext.Provider>
  )
}

export function ImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string
  alt: string
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    // The overlay owns the viewport while it is open — the page behind must not
    // scroll under a fixed full-bleed photo.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
      className={`fixed inset-0 ${IMAGE_LIGHTBOX_Z_CLASS} flex items-center justify-center bg-black/90 p-4`}
    >
      <img src={src} alt={alt} className="max-h-full max-w-full object-contain" />
      <button
        type="button"
        aria-label="Close photo"
        onClick={onClose}
        className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/20 text-white"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  )
}

/**
 * Wraps a photo so a tap opens it full-screen. With no `src` there is nothing
 * to enlarge (an initial-fallback circle) and the children render untouched —
 * so callers never have to branch.
 */
export function PhotoButton({
  src,
  alt,
  children,
  // 44px minimum TAP AREA around a 40px photo: the visible avatar keeps its
  // size, the target meets the floor. The mobile audit caught this at 40px the
  // moment the contrast rule made it re-read every button.
  className = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
}: {
  src?: string | null
  alt: string
  children: ReactNode
  className?: string
}) {
  const context = useContext(LightboxContext)
  if (src === undefined || src === null || src === '' || context === null) {
    return <>{children}</>
  }
  return (
    <button
      type="button"
      aria-label={`See ${alt} full screen`}
      className={className}
      onClick={(event) => {
        // A photo can sit inside a card <Link> or next to one — enlarging it
        // must never navigate.
        event.preventDefault()
        event.stopPropagation()
        context.open(src, alt)
      }}
    >
      {children}
    </button>
  )
}

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { IMAGE_LIGHTBOX_Z_CLASS } from '../lib/stacking'
import { nextTrapTarget } from '../lib/focusTrap'
import {
  clampGalleryIndex,
  galleryAltAt,
  galleryPhotoAt,
  galleryPhotosAreSteppable,
  galleryLabelAt,
  galleryPhotosFrom,
  galleryPositionLabel,
  galleryStepLabel,
  photosAreTiled,
  stepGalleryIndex,
  GALLERY_GRID_CLASS,
  GALLERY_SINGLE_CLASS,
  GALLERY_TILE_CLASS,
} from '../lib/photoGallery'
import type { GalleryPhoto } from '../lib/photoGallery'

/**
 * Full-screen photo viewer (V6), single photo OR a gallery (V25 t10).
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
 *
 * ---------------------------------------------------------------------------
 * V25 t10: ONE VIEWER, TWO ARRIVAL SHAPES.
 *
 * The founder's ticket asks that the viewer "steps between the photos in the
 * grid (next/previous, with keyboard support)" while it "stays one component"
 * and the existing single-photo call sites "keep working unchanged". Both are
 * true here:
 *
 *   - `open(src, alt)` keeps its exact signature (host avatars, comment rows,
 *     kid rows, the parent rows, the profile header), and now simply becomes a
 *     one-photo gallery. No call site changes.
 *   - `openGallery(photos, index)` is the grid's door: it opens the viewer ON a
 *     chosen photo and turns on the counter + next/previous controls.
 *   - `ImageLightbox` is still ONE component. The single-photo props stay
 *     (`src`/`alt`) and the gallery is an optional `photos` array; nothing about
 *     the dialog element, its aria-label, its close button, Escape, the
 *     tap-to-dismiss overlay or the body scroll lock changes between the two.
 *
 * WHAT THE DATA ALLOWS, said plainly here because this is the file a future
 * reader will open: the profile stores exactly ONE family photo
 * (`profiles.family_photo_url`, one `family_photo_url` column, one
 * `<uid>/family/photo.<ext>` object). So today `openGallery` is always called
 * with a ONE-photo array. The grid/counter/arrows are real code on a real path
 * (that is what the live spec's "1 of 1" reads), and they are correct for N
 * photos — but a genuinely multi-photo grid cannot exist until the schema can
 * hold a second photo. That is a schema decision, not a client one, and V25 t10
 * deliberately does not add a migration. See `src/lib/photoGallery.ts`'s header.
 *
 * WHAT DID NOT CHANGE, and is pinned by live specs (grep for `getByRole('dialog')`
 * and `Close photo`): the dialog's `role`, `aria-modal`, `aria-label` (the alt),
 * the 44px close button, `document.body.style.overflow` locking and restoring,
 * and Escape closing. The ADDITIONS are next/previous buttons (44px, disabled
 * for a one-photo gallery), ArrowLeft/ArrowRight, a "1 of 3" counter, per-photo
 * alts ("…, photo 2") and focus handling: on open, focus moves to the dialog's
 * close button, Tab/Shift+Tab are trapped inside the dialog, and on close focus
 * returns to the element that opened it. Without the trap, a keyboard user who
 * tabbed past the last control would reach the page BEHIND a modal overlay.
 */
const LightboxContext = createContext<{
  open: (src: string, alt: string) => void
  openGallery: (photos: readonly GalleryPhoto[], index: number) => void
} | null>(null)

/**
 * What counts as a keyboard stop inside the viewer — the same list
 * `components/FocusTrap.tsx` uses (kept here rather than exported from it so
 * this slice does not widen that seam's public surface; the strings are the
 * browser's, not a policy).
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

export function LightboxProvider({ children }: { children: ReactNode }) {
  // The viewer's state is the ARRAY plus where we are in it. `photos.length === 0`
  // is "nothing is open" — the same single source the old `photo === null` was,
  // so there is no second flag that could disagree with the array.
  const [gallery, setGallery] = useState<{ photos: GalleryPhoto[]; index: number }>({
    photos: [],
    index: 0,
  })
  const open = useCallback(
    (src: string, alt: string) => setGallery({ photos: galleryPhotosFrom(src, alt), index: 0 }),
    [],
  )
  const openGallery = useCallback(
    (photos: readonly GalleryPhoto[], index: number) => {
      const galleryPhotos = galleryPhotosFrom(null, '', photos)
      setGallery({
        photos: galleryPhotos,
        // Clamp against the FILTERED array's length: `galleryPhotosFrom`
        // drops entries with an empty `src`, so clamping against the
        // caller's pre-filter `photos.length` would open a DIFFERENT
        // photo than the one tapped whenever a dropped entry sits before
        // it (an off-by-N, latent while every gallery holds one photo).
        index: clampGalleryIndex(galleryPhotos.length, index),
      })
    },
    [],
  )
  const close = useCallback(() => setGallery({ photos: [], index: 0 }), [])
  const step = useCallback(
    (delta: number) =>
      setGallery((current) => ({
        photos: current.photos,
        index: stepGalleryIndex(current.photos.length, current.index, delta),
      })),
    [],
  )
  const photo = galleryPhotoAt(gallery.photos, gallery.index)
  return (
    <LightboxContext.Provider value={{ open, openGallery }}>
      {children}
      {photo !== null ? (
        <ImageLightbox
          photos={gallery.photos}
          index={gallery.index}
          onClose={close}
          onStep={step}
        />
      ) : null}
    </LightboxContext.Provider>
  )
}

export function ImageLightbox({
  src,
  alt,
  photos,
  index = 0,
  onClose,
  onStep,
}: {
  /** The single-photo arrival shape (historical call sites, unchanged). */
  src?: string
  alt?: string
  /** The gallery arrival shape: the array being viewed, in render order. */
  photos?: readonly GalleryPhoto[]
  index?: number
  onClose: () => void
  /** Next/previous; the provider owns the index. Absent = the controls are inert. */
  onStep?: (delta: number) => void
}) {
  // One door for both shapes, so the viewer has exactly one notion of "the photo
  // I am showing" and the counter and the arrows cannot disagree with the <img>.
  const list = galleryPhotosFrom(src, alt ?? '', photos)
  const at = clampGalleryIndex(list.length, index)
  const current = galleryPhotoAt(list, at)
  const steppable = galleryPhotosAreSteppable(list.length)
  const dialogRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // The stepping closure is written INLINE so it reads THIS render's
    // `steppable`/`onStep`: hoisting it out would force it into the dependency
    // list, and oxlint's react-compiler rule refuses a `useCallback` whose
    // `onStep` dependency "may be modified later" (measured: 2 new warnings on
    // the file). A keydown listener re-registered when Escape's identity changes
    // costs nothing and keeps the dependency list honest: `[onClose]`.
    const stepInline = (delta: number) => {
      if (steppable) onStep?.(delta)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key === 'ArrowRight') stepInline(1)
      if (event.key === 'ArrowLeft') stepInline(-1)
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
  }, [onClose, steppable, onStep])

  // FOCUS (V25 t10). The overlay is `aria-modal="true"`, which PROMISES the
  // keyboard is now inside it; before this slice focus stayed on the page
  // behind, so Tab walked straight out of the dialog.
  //
  // WHY THIS IS NOT `components/FocusTrap.tsx` (the seam the three portal
  // dialogs use) — MEASURED, not preferred. Two independent obstacles, both
  // reproduced on this build with a live probe:
  //   1. `useFocusTrap` filters focusable children with `offsetParent !== null`,
  //      and `offsetParent` is ALWAYS null for an element whose containing block
  //      is `fixed`. This viewer's root must be `fixed` (frozen by the specs and
  //      by `IMAGE_LIGHTBOX_Z_CLASS`), so the trap saw ZERO controls. (The
  //      controls now live in a `relative` wrapper below, which fixes the
  //      filter — see the comment there.)
  //   2. Even then, `shouldInterceptTab(1, 0)` is FALSE by the seam's own rule
  //      ("a move that stays inside needs no handling"), so the browser's
  //      default ran and focus left the modal: a one-photo gallery has exactly
  //      one control, and focus landed on <body> INSIDE an aria-modal overlay.
  //      `lib/focusTrap.ts` is untouched — changing `shouldInterceptTab` would
  //      change the three dialogs that depend on it, which is out of this
  //      slice's scope.
  // So this viewer asks `nextTrapTarget` (the same pure decision table) and
  // ALWAYS applies its answer: with one control, Tab and Shift+Tab both land on
  // the close button; with arrows present it steps (and wraps) between them.
  // Focus returns to whatever opened the viewer when it closes.
  const closeRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus({ preventScroll: true })
    return () => {
      // Give focus back to the tile that opened the viewer, so a keyboard user
      // resumes where they were rather than at the top of the document. Guarded:
      // the opener can be gone (a re-render replaced it).
      if (opener !== null && document.contains(opener)) opener.focus({ preventScroll: true })
    }
  }, [])

  /** The arrow controls' click handler — the same no-op rule as the keys. */
  const stepBy = (delta: number) => {
    if (steppable) onStep?.(delta)
  }

  const trapTab = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return
    const root = dialogRef.current
    if (root === null) return
    const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (el) => !el.hidden,
    )
    const active = document.activeElement
    const indexInside =
      active !== null && root.contains(active) ? focusable.indexOf(active as HTMLElement) : -1
    const target = nextTrapTarget(focusable.length, indexInside, event.shiftKey)
    event.preventDefault()
    if (target !== null) focusable[target]?.focus()
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={galleryAltAt(list, at)}
      // The gallery's own count, for a reader that needs to know the viewer was
      // given an ARRAY rather than a single pair (the live spec reads it).
      data-photo-count={list.length}
      onClick={onClose}
      onKeyDown={trapTab}
      className={`fixed inset-0 ${IMAGE_LIGHTBOX_Z_CLASS} flex items-center justify-center bg-black/90 p-4`}
    >
      {/* WHY THE CONTROLS LIVE IN THIS WRAPPER (keep them in here). The overlay
          itself must be `fixed` (full-bleed, above every other layer — this is
          pinned by the specs and by `IMAGE_LIGHTBOX_Z_CLASS`), and this wrapper
          is what the `absolute` controls position against: the root is their
          containing block only while it is positioned, so giving the ROOT
          `relative` "to be safe" is not harmless — Tailwind emits `.fixed`
          before `.relative`, so the class list would silently become
          `position: relative` and the overlay would stop being an overlay
          (measured on this slice: the dialog landed at the bottom of the
          document, y=844 at a 390px viewport).
          The wrapper also carries the `offsetParent` fix that
          `components/FocusTrap.tsx` needs, recorded here because the next reader
          will ask why a `relative` div exists around the whole viewer: an
          element whose containing block is FIXED reports `offsetParent === null`,
          so a trap that filters on it (the seam's rule) saw zero controls while
          the buttons were direct children of this root. This viewer's own trap
          does not filter that way any more (see the focus comment above), but
          the wrapper stays because the positioning depends on it. */}
      <div className="relative flex items-center justify-center">
        {current !== null ? (
          <img
            data-testid="lightbox-photo"
            src={current.src}
            alt={galleryAltAt(list, at)}
            // `max-h-full` used to say "the viewport minus the root's p-4";
            // inside this shrink-to-fit wrapper a percentage would resolve
            // against the IMAGE's own box (circular), so the same bound is
            // stated explicitly. The old percentage was ignored on engines
            // without `dvh` (iOS < 15.4), which is also this bound's floor.
            className="max-h-[calc(100dvh-2rem)] max-w-full object-contain"
          />
        ) : null}
        <button
          ref={closeRef}
          type="button"
          aria-label="Close photo"
          onClick={onClose}
          className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/20 text-white"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        {/* The position line renders at EVERY count: at 1 of 1 it is the viewer
            saying "this is the whole set" (and the live proof that the gallery
            handed it an ARRAY rather than a bare src), and from 2 up it sits
            between the arrows. The arrows themselves only exist when there is
            somewhere to step, so a lone photo never gets a control that would
            step nowhere. */}
        <p
          data-testid="lightbox-position"
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-sm text-white"
        >
          {galleryPositionLabel(list.length, at)}
        </p>
        {steppable ? (
          <button
            type="button"
            aria-label={galleryStepLabel('previous', list.length, at)}
            onClick={(event) => {
              event.stopPropagation()
              stepBy(-1)
            }}
            className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-white transition-colors motion-reduce:transition-none hover:bg-white/30"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
        ) : null}
        {steppable ? (
          <button
            type="button"
            aria-label={galleryStepLabel('next', list.length, at)}
            onClick={(event) => {
              event.stopPropagation()
              stepBy(1)
            }}
            className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-white transition-colors motion-reduce:transition-none hover:bg-white/30"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Wraps a photo so a tap opens it full-screen. With no `src` there is nothing
 * to enlarge (an initial-fallback circle) and the children render untouched —
 * so callers never have to branch.
 *
 * V25 t10 adds ONE optional prop, `gallery`: the photos this button opens, in
 * order, with this button's own photo at `galleryIndex`. Absent (every existing
 * call site) the button opens the single `src`, exactly as before.
 */
export function PhotoButton({
  src,
  alt,
  children,
  gallery,
  galleryIndex = 0,
  // 44px minimum TAP AREA around a 40px photo: the visible avatar keeps its
  // size, the target meets the floor. The mobile audit caught this at 40px the
  // moment the contrast rule made it re-read every button.
  className = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
  dataTestId,
}: {
  src?: string | null
  alt: string
  children: ReactNode
  /** The grid this button belongs to (V25 t10); omitted = a single photo. */
  gallery?: readonly GalleryPhoto[]
  /** This button's position inside `gallery`. */
  galleryIndex?: number
  className?: string
  dataTestId?: string
}) {
  const context = useContext(LightboxContext)
  // The gate stays `src`: a button with no fetchable photo of its own is never a
  // button, whether or not a gallery was passed.
  if (src === undefined || src === null || src === '' || context === null) {
    return <>{children}</>
  }
  return (
    <button
      type="button"
      data-testid={dataTestId}
      aria-label={`See ${alt} full screen`}
      className={className}
      onClick={(event) => {
        // A photo can sit inside a card <Link> or next to one — enlarging it
        // must never navigate.
        event.preventDefault()
        event.stopPropagation()
        if (gallery !== undefined && gallery.length > 0) {
          context.openGallery(gallery, galleryIndex)
          return
        }
        context.open(src, alt)
      }}
    >
      {children}
    </button>
  )
}

/**
 * The family-photo BLOCK (V25 t10): one full-width photo, or — the day the
 * schema can hold several — a tiled grid of them, each tile opening the shared
 * viewer on ITSELF.
 *
 * WHERE THE TILING DECISION LIVES: `photosAreTiled` (src/lib/photoGallery.ts),
 * unit-tested. This component only paints what those functions answer, which is
 * why the grid's own arithmetic is provable without a browser.
 *
 * THE "no tile for one photo" RULE IS THE HONEST ONE: `photosAreTiled(1)` is
 * false, so a single family photo renders as itself — the block's full width, its
 * own aspect ratio, NO height cap — which is precisely the founder's first ask
 * ("Fill the space of the phone so that it doesn't look weird"). A square tile
 * around a lone photo would crop it to look like a grid that is not there.
 */
export function FamilyPhotoBlock({
  photos,
  label,
  loading,
  decoding,
  roundedClassName = 'rounded-xl',
}: {
  photos: readonly GalleryPhoto[]
  /** The block's ONE alt ("@ana’s family photo"); numbering is added per tile. */
  label: string
  loading?: 'eager' | 'lazy'
  decoding?: 'async' | 'sync' | 'auto'
  roundedClassName?: string
}) {
  if (photos.length === 0) return null
  const tiled = photosAreTiled(photos.length)
  return (
    <div data-testid="family-photo-grid" className={tiled ? GALLERY_GRID_CLASS : 'flex'}>
      {photos.map((photo, index) => {
        const alt = galleryLabelAt(label, photos.length, index)
        return (
          <PhotoButton
            key={photo.src}
            src={photo.src}
            alt={alt}
            gallery={photos}
            galleryIndex={index}
            dataTestId="family-photo-button"
            className={tiled ? GALLERY_TILE_CLASS : `${GALLERY_SINGLE_CLASS} ${roundedClassName}`}
          >
            <img
              data-testid="family-photo"
              src={photo.src}
              alt={alt}
              loading={loading}
              decoding={decoding}
              className={
                tiled
                  ? `h-full w-full object-cover ${roundedClassName}`
                  : `block w-full ${roundedClassName}`
              }
            />
          </PhotoButton>
        )
      })}
    </div>
  )
}

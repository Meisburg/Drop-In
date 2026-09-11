import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CropPhotoDialog } from './CropPhotoDialog'
import { validateAvatarFile } from '../lib/db'
import type { CropRect } from '../lib/photoCrop'

/**
 * THE REUSABLE CROP STEP (photo-crop ticket 03).
 *
 * Decoding, the dialog, the bitmap's lifetime and the busy flag are identical at
 * all three upload sites (`uploadAvatar` from onboarding and from the profile,
 * and `uploadKidPhoto`), so they live here and those sites supply only what to do
 * with the result.
 *
 * ONE DECODE, TWO CONSUMERS: the dialog previews the bitmap and the encoder crops
 * the same bitmap, so a 12MP phone photo is decoded once rather than once per
 * stage. The hook owns its lifetime — closed on cancel, on Escape, after the
 * upload settles, and on unmount — because an ImageBitmap holds its decoded
 * pixels (~48MB for a 12MP photo) until it is closed.
 *
 * Split out of `CropPhotoDialog.tsx` rather than exported beside it: a module that
 * exports a component AND a hook breaks React Fast Refresh for that file, which
 * the repo's lint already flags.
 */
export function useCropStep(
  onConfirm: (source: ImageBitmap, rect: CropRect) => Promise<void> | void,
): {
  /** Decode and open the crop step. Returns a message to show, or null. */
  beginCrop: (file: File) => Promise<string | null>
  /** Render this next to the upload control. */
  dialog: ReactNode
  /** True while the confirmed upload is in flight. */
  busy: boolean
} {
  const [pending, setPending] = useState<ImageBitmap | null>(null)
  const [busy, setBusy] = useState(false)
  // The current bitmap, in a ref as well as state: the confirm path reads `pending`
  // from its own closure (so it cannot act on a stale one), while cancel/beginCrop
  // and the unmount cleanup need "whatever is current right now" without being
  // re-created on every change.
  const pendingRef = useRef<ImageBitmap | null>(null)
  useEffect(() => {
    pendingRef.current = pending
  }, [pending])
  // Guards the decode race below: a bitmap that resolves after unmount has no
  // consumer and must be closed by the code that created it.
  const mountedRef = useRef(true)

  const beginCrop = useCallback(async (file: File): Promise<string | null> => {
    // The ≤5MB / image-only gate lives HERE, and deliberately not in the upload
    // functions any more: by the time those run the file has been decoded, so
    // there is no File left to measure. One gate, in one place, running BEFORE the
    // decode and before the dialog — so a rejected file never costs either.
    const fileError = validateAvatarFile(file)
    if (fileError !== null) return fileError
    try {
      /*
       * NO imageOrientation OPTION HERE, DELIBERATELY. This is a regression fix.
       *
       * The crop step originally passed `{ imageOrientation: 'from-image' }` to be
       * explicit about EXIF. That member is a WebIDL ENUM, and WebIDL THROWS a
       * TypeError when an enum member carries a value the engine does not know —
       * unknown dictionary KEYS are ignored, unknown enum VALUES are not. The
       * `from-image` value only exists in Chrome/Edge 112+, Firefox 111+ and
       * Safari 16+, and Vite 8's own build-target floor is chrome111/edge111/
       * firefox114/safari16.4 — i.e. Chrome and Edge 111 are INSIDE this project's
       * declared support envelope. On those engines the call threw, the catch below
       * turned it into "Could not read that image. Try a different photo.", and so
       * every single photo upload became impossible, with a message that blamed the
       * user's file for a bug in this line.
       *
       * It also bought nothing: `from-image` is the DEFAULT in every engine that has
       * the value, so plain `createImageBitmap(file)` honours EXIF identically. On an
       * engine old enough to lack the value, that engine's own default applies
       * (historically "none", i.e. EXIF ignored) — a photo that may arrive rotated,
       * which is strictly better than a photo that cannot be uploaded at all, and is
       * exactly the behaviour this app shipped with before the crop step existed.
       */
      const bitmap = await createImageBitmap(file)
      if (bitmap.width === 0 || bitmap.height === 0) {
        bitmap.close()
        return 'That image has no readable pixels. Try a different photo.'
      }
      // Decoding takes 50-300ms for a phone photo, which is long enough to navigate
      // away in. Nothing will ever consume this bitmap then, and the unmount cleanup
      // has already run and found nothing — so release it here instead of leaking a
      // ~48MB decode per abandoned pick.
      if (!mountedRef.current) {
        bitmap.close()
        return null
      }
      // The superseded bitmap is closed OUTSIDE the state updater: an updater must
      // be pure (StrictMode invokes it twice on purpose), and releasing GPU-backed
      // pixels is exactly the kind of side effect that must not ride along with it.
      const superseded = pendingRef.current
      setPending(bitmap)
      superseded?.close()
      return null
    } catch {
      return 'Could not read that image. Try a different photo.'
    }
  }, [])

  const cancel = useCallback(() => {
    const abandoned = pendingRef.current
    setPending(null)
    abandoned?.close()
  }, [])

  const confirm = useCallback(
    async (rect: CropRect) => {
      if (pending === null) return
      const source = pending
      setBusy(true)
      try {
        // Awaited BEFORE the close: the encoder reads this bitmap, so closing it
        // first would blank the upload instead of the preview.
        await onConfirm(source, rect)
      } finally {
        setBusy(false)
        setPending(null)
        source.close()
      }
    },
    [onConfirm, pending],
  )

  // Closed on unmount too, or navigating away mid-crop leaks the decode.
  //
  // The flag is re-armed in the effect BODY rather than assumed true: StrictMode
  // deliberately runs mount -> cleanup -> mount, so a flag that is only ever
  // lowered would stay false for the rest of the session in dev and quietly reject
  // every photo.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      pendingRef.current?.close()
    }
  }, [])

  return {
    beginCrop,
    busy,
    dialog:
      pending === null ? null : (
        <CropPhotoDialog
          image={pending}
          busy={busy}
          onCancel={cancel}
          onConfirm={(rect) => void confirm(rect)}
        />
      ),
  }
}

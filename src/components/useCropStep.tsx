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

  const beginCrop = useCallback(async (file: File): Promise<string | null> => {
    // The ≤5MB / image-only gate lives HERE, and deliberately not in the upload
    // functions any more: by the time those run the file has been decoded, so
    // there is no File left to measure. One gate, in one place, running BEFORE the
    // decode and before the dialog — so a rejected file never costs either.
    const fileError = validateAvatarFile(file)
    if (fileError !== null) return fileError
    try {
      // imageOrientation is stated rather than assumed: phone photos carry an EXIF
      // tag, and if the preview and the encode disagreed about it the crop would be
      // applied to a rotated image.
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      if (bitmap.width === 0 || bitmap.height === 0) {
        bitmap.close()
        return 'That image has no readable pixels. Try a different photo.'
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
  useEffect(
    () => () => {
      pendingRef.current?.close()
    },
    [],
  )

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

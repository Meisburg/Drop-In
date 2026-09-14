import { useEffect, useState } from 'react'
import { signedFamilyPhotoUrls } from '../lib/db'
import { familyPhotoObjectPath } from '../lib/photoStorage'

/**
 * THE FAMILY-PHOTO READ PATH (V9 ticket 11), identical at both render sites
 * (`/profile`'s family-photo card and `/u/:handle`'s header), so it lives here
 * rather than being written twice — the `useCropStep` reasoning: when the same
 * non-obvious step is needed at N sites, one hook is what keeps them from
 * drifting apart.
 *
 * `storedValue` is what the DATABASE holds (`profiles.family_photo_url`: an
 * object path, never a URL — see `photoStorage.ts`); the return value is a URL
 * that is valid for `FAMILY_PHOTO_URL_TTL_SECONDS`, or null when there is no
 * photo or the mint failed.
 *
 * THE FOUR PROPERTIES THIS HOOK OWNS, all of them pinned by the ticket:
 *  1. BATCHED. It uses the storage API's plural form (`createSignedUrls`, one
 *     request for the whole list) and a page calls it once — this app renders at
 *     most one family photo per page, and the sibling db function dedupes the
 *     list if a future page passes several.
 *  2. BEST-EFFORT. The db function never throws; a failure lands as null and the
 *     page renders without an image. No error state, no spinner that never
 *     resolves — a decoration is never worth telling a parent something is
 *     broken when nothing they can do would fix it.
 *  3. NEVER PERSISTED. The URL lives in this component's state and nowhere else;
 *     nothing writes it back, so an expired URL can never be served from the
 *     database.
 *  4. NO STALE IMAGE. The resolved value carries the path it was minted for, and
 *     anything that does not match the CURRENT path renders as null. Without
 *     that, a re-upload (or navigating from one family's profile to another's)
 *     would briefly paint the PREVIOUS family's photo under the new family's
 *     name — the one failure mode of this hook that would be a real problem
 *     rather than a missing image.
 *
 * A value that cannot be minted (empty, URL-shaped, a kid-photo path) resolves
 * to null rather than being attempted — `familyPhotoObjectPath` is the door.
 */
export function useFamilyPhotoUrl(storedValue: string | null | undefined): string | null {
  // The RESOLVED value carries the path it belongs to, so a result that does not
  // match the current path can never be rendered (property 4 below) — the check
  // is a render-time comparison rather than a state clear, which also keeps the
  // effect from calling setState synchronously (the repo's lint rule, and the
  // cascading render it warns about).
  const [resolved, setResolved] = useState<{ path: string; url: string } | null>(null)
  // The normalised path is the effect's dependency, not the raw stored value:
  // `kid-photos/uid/family/photo.jpg` and `uid/family/photo.jpg` are the same
  // image and must not re-mint against each other.
  const objectPath = familyPhotoObjectPath(storedValue)

  useEffect(() => {
    if (objectPath === null) return
    let cancelled = false
    signedFamilyPhotoUrls([objectPath])
      .then((minted) => {
        if (!cancelled) setResolved({ path: objectPath, url: minted[objectPath] ?? '' })
      })
      .catch(() => {
        // Unreachable by contract (the db function swallows its own failures)
        // — kept so a future change there can never turn a missing decoration
        // into an unhandled rejection.
        if (!cancelled) setResolved({ path: objectPath, url: '' })
      })
    return () => {
      cancelled = true
    }
  }, [objectPath])

  if (objectPath === null) return null
  if (resolved === null || resolved.path !== objectPath || resolved.url === '') return null
  return resolved.url
}

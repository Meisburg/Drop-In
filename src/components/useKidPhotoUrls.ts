import { useEffect, useMemo, useState } from 'react'
import { signedKidPhotoUrls } from '../lib/db'
import type { Kid } from '../lib/types'

/**
 * THE KID-PHOTO READ PATH (V12 t04; widened by V25 t14): the profile page's kid
 * list, and the ONE place in the app where a kid photo is ever minted or
 * rendered.
 *
 * `kids` is the RLS-filtered kid list the page holds (the same rows /settings
 * edits, for the owner); the return value is a `kid.id → signed URL` map, valid
 * for `FAMILY_PHOTO_URL_TTL_SECONDS`, or `{}` when nothing can be shown. Only a
 * kid whose `avatar_url` is SET gets a mint: that column is the marker that a
 * photo object lives at the canonical `<uid>/kids/<kidId>` path, and a kid
 * without one has no image to render (the best-effort degradation, never an
 * error state).
 *
 * THE FOUR PROPERTIES THIS HOOK OWNS, the family-photo hook's (pinned by the
 * ticket):
 *  1. BATCHED. One `createSignedUrls` call for the whole kid list, never one
 *     per kid — the db function batches and dedupes.
 *  2. BEST-EFFORT. The db function never throws; a failure (bucket not applied,
 *     an outage, a policy refusal, or an object that was never uploaded) lands
 *     as a missing entry and the kid row renders without its photo. No error
 *     state, no spinner that never resolves.
 *  3. NEVER PERSISTED. The URLs live in this component's state and nowhere
 *     else; nothing writes them back, so an expired URL can never be served
 *     from the database.
 *  4. NO STALE IMAGE. The resolved value carries the key it was minted for, and
 *     anything that does not match the CURRENT key renders as nothing — so a
 *     kid added or removed (which changes the key) can never briefly paint the
 *     previous mint's photos under the new list.
 *
 * WHO MAY MINT, stated as it now is (V25 t14): ANY SIGNED-IN PARENT. Migration
 * 0054 dropped the owner check from the kid class's storage SELECT policy and
 * kept the `[2] = 'kids'` class guard, so `ownerProfileId` is the profile WHOSE
 * KIDS these are — not the viewer — and the caller decides whether there is a
 * session at all by passing `null`. The caller's other half of the contract is
 * the list it passes: `kids` must be the RLS-filtered rows the database
 * actually returned to this viewer (0040 filters the embed row by row), never a
 * list assembled client-side.
 */
export function useKidPhotoUrls(
  ownerProfileId: string | null,
  kids: Kid[] | null,
): Record<string, string> {
  // The ids that CLAIM to have a photo (`avatar_url` set). A kid whose
  // `avatar_url` is null/empty is skipped: there is no object to mint for, so
  // it renders name + age with no image. Memoised so the effect below only
  // re-runs when the set actually changes, not on every render.
  const photoKidIds = useMemo(() => {
    if (ownerProfileId === null) return []
    const ids: string[] = []
    for (const kid of kids ?? []) {
      if (typeof kid.avatar_url === 'string' && kid.avatar_url.trim() !== '') ids.push(kid.id)
    }
    return ids
  }, [ownerProfileId, kids])

  // '' when there is nothing to mint; otherwise the profile id + the kid ids, so
  // a change to either re-mints. This is what property 4 keys on.
  const mintKey = photoKidIds.length === 0 ? '' : `${ownerProfileId}:${photoKidIds.join('|')}`

  // The RESOLVED value carries the key it belongs to, so a result that does not
  // match the current key can never be rendered (property 4) — a render-time
  // comparison rather than a state clear, which also keeps the effect from
  // calling setState synchronously (the repo's lint rule).
  const [resolved, setResolved] = useState<{ key: string; urls: Record<string, string> }>({
    key: '',
    urls: {},
  })

  useEffect(() => {
    if (mintKey === '') return
    const owner = ownerProfileId
    if (owner === null) return
    let cancelled = false
    signedKidPhotoUrls(owner, photoKidIds)
      .then((urls) => {
        if (!cancelled) setResolved({ key: mintKey, urls })
      })
      .catch(() => {
        // Unreachable by contract (the db function swallows its own failures)
        // — kept so a future change there can never turn a missing decoration
        // into an unhandled rejection.
        if (!cancelled) setResolved({ key: mintKey, urls: {} })
      })
    return () => {
      cancelled = true
    }
  }, [ownerProfileId, mintKey, photoKidIds])

  if (resolved.key !== mintKey) return {}
  return resolved.urls
}
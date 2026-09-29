/**
 * V28 slice 4b: the ONE definition of "the profile has an avatar" (the
 * build law: the rule lives in lib, the pages only call it).
 *
 * Semantics replicate the resume nudge's EXISTING derivation
 * (src/App.tsx's inline `avatar_url !== undefined && !== null && !== ''`):
 * null, undefined AND the empty string all count as NO avatar. The whole
 * reason this module exists is that the rule was written inline in three
 * subtly different forms (the nudge; ProfilePage's avatar branch, which
 * drops the empty-string clause; and a `photo_url` check in lib/places.ts
 * that is a DIFFERENT field pinned to its own render site — not this
 * predicate). One predicate, one test, no class of drift.
 *
 * The `url is string` predicate is the narrowing half: a truthy result
 * leaves the value a real, non-empty URL (what an `<img src>` expects),
 * so call sites keep the same narrowing the old inline checks gave —
 * the predicate never claims more than the check does.
 */
export function hasAvatarUrl(url: string | null | undefined): url is string {
  return url != null && url !== ''
}
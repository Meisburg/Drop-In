/**
 * V28 slice 4b: the ONE definition of "the profile has an avatar" (the
 * build law: the rule lives in lib, the pages only call it).
 *
 * Semantics: null, undefined AND the empty string all count as NO avatar.
 *
 * WHY IT EXISTS, re-measured at 8d1170d (V28 r2 slice 8a — the original
 * three-form history is now TWO forms, and one of them is this module):
 * the rule was written inline in three subtly different places.
 *   - the resume nudge's inline `avatar_url !== undefined && !== null && !== ''`
 *     — GONE: V28 r2 slice 1b deleted the photo card and with it the nudge's
 *     `hasPhoto` fact, so nothing in src/App.tsx tests avatar presence any
 *     more (`grep -n avatar_url src/App.tsx` → zero hits);
 *   - ProfilePage's identity card, which dropped the empty-string clause —
 *     now CALLS this predicate, so the clause cannot drift again;
 *   - a `photo_url` check in lib/places.ts, which is a DIFFERENT field pinned
 *     to its own render site — not this predicate.
 * So today ProfilePage.tsx's avatar branch is the one caller, and the
 * `url is string` narrowing below is what lets it keep the shape the inline
 * check gave.
 *
 * The `url is string` predicate is the narrowing half: a truthy result
 * leaves the value a real, non-empty URL (what an `<img src>` expects),
 * so call sites keep the same narrowing the old inline checks gave —
 * the predicate never claims more than the check does.
 */
export function hasAvatarUrl(url: string | null | undefined): url is string {
  return url != null && url !== ''
}
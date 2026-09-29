/**
 * V28 slice 2a fix 1/5: the ONE definition of "the viewer has a home zip"
 * (the build law: the rule lives in lib, the pages only call it).
 *
 * Semantics replicate the onboarding gate's EXISTING derivation
 * (lib/db.ts's `setHomeZipSet` — `home_zip != null && home_zip !== ''`):
 * null, undefined AND the empty string all count as UNSET. No trimming, no
 * new validation — changing what counts as set would change the gate's
 * behaviour, which is out of scope for this slice. The whole reason this
 * module exists: a guard written inline twice can drift from the wall it
 * replaces, and a `== null` check silently treats '' as SET — looser than
 * the wall. One predicate, one test, no class of drift.
 *
 * The `zip is string` predicate is the narrowing half: a truthy result
 * leaves the value a real, non-empty zip string (what a gazetteer lookup
 * expects), so call sites keep the same narrowing the old inline
 * `=== null || === undefined` checks gave — the predicate never claims
 * more than the check does.
 */
export function hasHomeZip(zip: string | null | undefined): zip is string {
  return zip != null && zip !== ''
}
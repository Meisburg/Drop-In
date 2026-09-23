/**
 * V21 t08: THE PINNED PROFILE SECTION ORDER — one array, both surfaces.
 *
 * The founder pinned the profile's section order as "user, kid, parents,
 * drop-ins (in that order)". Both profile surfaces — the READ view
 * (`ProfileView`, rendered by `/u/:handle` and by `/profile`'s read mode) and
 * the EDIT surface (`ProfilePage`'s edit mode) — must lay their sections out in
 * exactly this sequence.
 *
 * WHY THIS EXISTS. The two surfaces used to keep their own section orders by
 * hand, and they had drifted: the edit surface put "About the kids" LAST while
 * the read view put it SECOND. A comment saying "keep them in sync" is not a
 * mechanism — someone reorders one card and the other silently goes stale. This
 * module is the structural fix: ONE array both surfaces derive from, plus a
 * pure helper each surface calls to compute ITS section list (a surface may
 * omit a section it does not support, but the RELATIVE ORDER of what it renders
 * must always match the pinned sequence). `profileSections.test.ts` asserts the
 * equivalence directly — flip any section on either surface and the test fails.
 *
 * THE SECTIONS (the four tokens the ticket pins):
 *  - 'user'    — the identity block: avatar + display name + "Here since"
 *                (read view) / "Your photo & name" card (edit surface).
 *  - 'kids'    — "About the kids" (read view) / the kids editor card (edit).
 *  - 'parents' — "About the parents" (bio + interests + family photo, read view)
 *                / "About the parents" bio card + "The parents" parent cards +
 *                "Linked parent" (edit surface — all three are the parents
 *                group, kept together between kids and… nothing; see below).
 *  - 'dropins' — the hosted drop-ins lists (Upcoming/Past, read view only; the
 *                edit surface intentionally has no drop-ins section — V16 t04
 *                removed the "Hosted drop-ins" card from /profile, and posts
 *                are managed from /new, not from the profile editor).
 *
 * NOTE ON 'parents': the read view folds the parents group into ONE card (bio +
 * interests + family photo); the edit surface splits it into three cards (bio,
 * parent cards, linked parent). They are the SAME section for ordering purposes
 * — the people who run the household, between the kids and the hosted history —
 * so both surfaces emit the single token 'parents' and render their own shape
 * of it in that slot.
 */

/** The four profile sections, in the founder-pinned order. */
export const PROFILE_SECTIONS = ['user', 'kids', 'parents', 'dropins'] as const

/** One profile section key. */
export type ProfileSectionKey = (typeof PROFILE_SECTIONS)[number]

/**
 * The subset of sections a surface actually renders, in the pinned relative
 * order. A surface MAY omit sections it does not support (the edit surface
 * omits 'dropins'), but it may never REORDER the ones it keeps: the result is
 * always a subsequence of `PROFILE_SECTIONS`.
 *
 * Pure + unit-tested: pass the keys the surface renders (in the order its JSX
 * emits them) and get back the same keys filtered to the pinned sequence — so
 * if a surface ever emits a section out of order, the returned list differs
 * from the input and the anti-drift test catches it.
 */
export function sectionsInPinnedOrder(
  rendered: readonly ProfileSectionKey[],
): ProfileSectionKey[] {
  // Keep only the known keys, in the PINNED order (not the caller's order).
  // If the caller's order already matches the pinned order, the output equals
  // the input; if it does not, the output is the corrected order — which is
  // exactly what the test compares against the caller's raw list to detect
  // drift.
  return PROFILE_SECTIONS.filter((key) => (rendered as readonly string[]).includes(key))
}

/**
 * True when `rendered` is ALREADY in the pinned relative order (i.e. it is a
 * subsequence of `PROFILE_SECTIONS`). This is the assertion the anti-drift
 * test runs per surface: feed it the section keys a surface emits, in the
 * order its JSX lays them out, and it answers whether that order is legal.
 * Any reorder (or an unknown key) makes it false.
 */
export function isInPinnedOrder(rendered: readonly ProfileSectionKey[]): boolean {
  const corrected = sectionsInPinnedOrder(rendered)
  if (corrected.length !== rendered.length) return false
  for (let i = 0; i < rendered.length; i += 1) {
    if (corrected[i] !== rendered[i]) return false
  }
  return true
}
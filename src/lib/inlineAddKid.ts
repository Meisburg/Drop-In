/**
 * V37 slice B (`T6N3`) — the pure rules behind the in-flow add-a-kid.
 *
 * The founder: *"I'd also bring 'add your kids' into the outing flow instead of
 * stopping the parent and sending them to Settings."* The form itself is
 * `InlineAddKidForm`, and the write is the existing `addKid`; what is NEW here is
 * the bookkeeping that makes the parent land back IN the flow rather than merely
 * back on the page. That decision is a rule with real failure modes, so it lives
 * in `lib/` as a pure function (the build law) rather than inline in a `.tsx`.
 */

/**
 * WHICH KIDS ARE NEW — the ids in `after` that were not in `before`.
 *
 * ⚠️ WHY BY DIFFERENCE AND NOT BY POSITION. The obvious shortcut is "take the last
 * row" (`listKids` returns them in a stable order). That is a COINCIDENCE, not a
 * rule: it silently breaks the day the read's ordering changes, or the day the add
 * is followed by anything else that touches the list — and the failure is invisible,
 * because the parent still sees a kid, just the WRONG one pre-selected on a
 * drop-in their child is not coming to.
 *
 * The difference of two id sets is the actual question ("what did my add create"),
 * so it is correct regardless of order, paging, or a concurrent write by another
 * device in the same family.
 *
 * Pure and order-preserving: `after`'s own order is kept, so the caller's selection
 * order is the list's order rather than Set iteration order.
 */
export function newlyAddedKidIds(
  before: readonly { id: string }[],
  after: readonly { id: string }[],
): string[] {
  const known = new Set(before.map((kid) => kid.id))
  const added: string[] = []
  const seen = new Set<string>()
  for (const kid of after) {
    if (known.has(kid.id) || seen.has(kid.id)) continue
    seen.add(kid.id)
    added.push(kid.id)
  }
  return added
}

/**
 * The selection AFTER an in-flow add: every id already selected, PLUS the newly
 * created kid — and nothing removed.
 *
 * ⚠️ WHY THE NEW KID IS ADDED RATHER THAN LEFT FOR A TAP. The brief forbids "a
 * second tap to resume". A parent who just typed their kid's name and age has
 * unambiguously said that kid is coming along; leaving the new chip unpressed
 * would make them find it and tap it, which is exactly the extra step this slice
 * exists to remove. Their EXISTING selections are untouched — an add must never
 * silently unpick a sibling.
 *
 * Deduped and order-stable: the result is the previous selection order, then any
 * newly added ids in the order the refreshed list returned them.
 */
export function selectionAfterAdd(
  selected: readonly string[],
  addedIds: readonly string[],
): string[] {
  const next = [...selected]
  const present = new Set(next)
  for (const id of addedIds) {
    if (present.has(id)) continue
    present.add(id)
    next.push(id)
  }
  return next
}

/**
 * Is the add form at the profile's kid cap? The SAME `MAX_KIDS_PER_PROFILE` the
 * profile/settings editor enforces — passed in rather than imported so this stays
 * pure and so the caller and this rule cannot read two different ceilings.
 *
 * At the cap the form disables rather than letting the write throw: the profile
 * editor's own behaviour, so a parent is never told two different things about how
 * many kids fit on one profile.
 */
export function isAtKidCap(kidCount: number, maxKids: number): boolean {
  return kidCount >= maxKids
}

# V16 t03 item 1 — PRE-STAGED BRIEFS (both rulings ready to dispatch)

Written 2026-09-21 (round 16). The founder has not yet ruled between (i) and
(ii). Rather than idle, BOTH briefs are written out below, fully code-verified,
so dispatch is a copy-paste the moment a ruling arrives. Nothing here is
speculative: every path and line number was read from the code this round.

## What is actually at stake (re-verified round 16)

The Ages chips (`PlaydateFormFields.tsx:847`, rendered by exactly ONE consumer at
`NewPlaydatePage.tsx:1064`) are the ONLY way a host sets a **stated** age range.
`ageRange` feeds the submit at `NewPlaydatePage.tsx:865-866` → `ageRangeFields`
(`src/lib/feed.ts:1522-1529`) → `playdates.age_min` / `age_max` (migration 0037).

Verified this round: `ageRangeFields` returns `{}` when either bound is null —
so a chipless post writes NO keys, byte-identical to a pre-0037 post. That is why
removal is *safe* mechanically; the question is purely product.

**Option (ii) is implementable with existing machinery** — verified, not assumed:
- `cardAgeRangeLabel(post, kidAges)` already exists (`src/lib/feed.ts:1484`) and
  composes `playdateAgeRangeLine`, which already implements the
  stated-wins-over-derived precedence. The derivation from kids' ages is
  therefore ALREADY WRITTEN and tested; (ii) reuses it at WRITE time instead of
  inventing anything.
- The kids picked at post time are already on hand in `NewPlaydatePage` (the
  `kids` multi-select that feeds `ageRangeFields`' sibling `playdate_kids` write).

---

## BRIEF A — if the founder rules (ii): derive the stated range from the kids

**Deliverable:** delete the Ages chips UI; compute `ageMin`/`ageMax` from the
selected kids' ages; write them via the existing `ageRangeFields`.

**Scope:**
1. `src/components/PlaydateFormFields.tsx` — remove the `agesSlot` render and the
   `AgeRangeChips` component + its `AGE_RANGE_CHIPS` list IF nothing else
   consumes them (grep first; the list is exported).
2. `src/pages/NewPlaydatePage.tsx` — remove `ageRange` state and the `agesSlot`
   prop; derive the bounds from the selected kids, using the SAME derivation
   `playdateAgeRangeLine` already uses (do NOT invent a second one — call the
   existing helper).
3. `src/lib/feed.ts` — if a thin wrapper is needed to turn selected kids into
   `{ageMin, ageMax}`, it is a PURE function with a sibling test.
4. Tests — e2e `post-fast`/`post-edit-delete` may assert the chips; update them.
   Unit-test the derivation including: no kids selected (writes nothing), one
   kid, kids with unknown ages.

**Gate:** `npm run build && npm run test && npm run lint`; targeted e2e on
`post-fast`, `post-edit-delete`, `post-again`.

**Do NOT:** touch migration 0037 (columns stay), or change the card's
stated-over-derived precedence (it becomes belt-and-braces).

---

## BRIEF B — if the founder rules (i): remove the chips, ages always derived

**Deliverable:** delete the Ages chips UI and the stated-age WRITE path entirely.

**Scope:**
1. As Brief A items 1 and 4.
2. `src/pages/NewPlaydatePage.tsx` — remove `ageRange` state and the `agesSlot`
   prop; do NOT derive anything.
3. `src/lib/feed.ts` — `ageRangeFields` becomes unused by /new. **Do not delete
   it** unless a grep proves zero callers; it may be used by /edit. Record the
   outcome either way.
4. **Document the now-dead precedence:** the comment at
   `NewPlaydatePage.tsx:1055-1061` pins "the stated range wins over the derived
   one". With no UI writing the stated columns, that rule survives only for
   HISTORICAL posts. Say so in the comment rather than deleting the rule —
   existing posts still carry `age_min`/`age_max` and the card must keep honoring
   them.

**Gate:** as Brief A.

**Do NOT:** drop the `age_min`/`age_max` columns. Existing rows use them.

---

## Recommendation (unchanged, restated once for the record)

**(ii).** It gives the founder what they asked for (a shorter form) without
silently degrading every future card, and it reuses derivation logic that
already exists and is already tested. (i) is the smaller diff but its cost is
paid invisibly: months of posts with no stated range, discoverable only by
noticing a card that says less than it used to.

Cost if (ii) is wrong: a host who wants a range WIDER than their own kids loses
that ability. If that use case matters to the founder, the answer is not (i) or
(ii) — it is keeping the chips.

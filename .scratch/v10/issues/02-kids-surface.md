# 02: Kids you're bringing — surface it for parents who have kids

**What to build:** On /new, when the loaded `kids` list is non-empty, render
"Kids you're bringing" as its OWN section ABOVE the "More options" disclosure
(same section styling the place block uses). The disclosure keeps date,
address, details, repeat — everything except kids. When `kids` is empty or
still loading, /new renders EXACTLY today's form (kids stay inside the
disclosure behind their current empty-state line; nothing new appears).

**Why:** audit finding #2 — the host's own kids are the one thing a mom is
most likely to want on a post, and today that is +2 taps (open disclosure,
scroll). Surfacing for the parents who HAVE kids costs nothing for the
parents who don't (the disclosure hint text updates accordingly).

**Status:** COMPLETE (2026-09-14, commit `f688ab0`)

## Completion evidence

- Unit 804/804 (no seam changes needed — the picker's data path was untouched;
  the hint constant lives beside MORE_OPTIONS_HINT as MORE_OPTIONS_HINT_WITHOUT_KIDS).
- E2E 74/74 full suite — 3 new in `kids-surface.e2e.ts` (surfaced section with
  DOM order + hint swap + one-picker guarantee + selection lands on the detail
  line; no-kids form byte-identical). kids-v3, kid-names-privacy, golden-path,
  post-fast, post-edit-delete, feed-ages, post-again all pass unedited.
- Lint 0 errors; build exit 0; tsc clean (app + node).
- AC checklist: surfaced above the disclosure for ≥1 kid ✓ · absent (not
  disabled) for 0 kids / loading, /edit unchanged ✓ · submit path untouched ✓
  · 44px targets ✓.

## Mechanics (pinned)

- The kids picker is page state (`selectedKidIds`) + `toggleKid` — it MOVES in
  the layout; nothing about its data, validation, or submit path changes.
  `PlaydateFormFields.tsx` takes a new optional slot prop (the
  `preset`/`agesSlot` pattern — the component owns no state; the page passes
  the section). /edit does NOT pass it: edit keeps kids inside the disclosure,
  byte-identical markup (the showNeighborhood precedent, V9 t01).
- "More options" hint copy changes ONLY when kids are surfaced
  (from "…kids, details…" to "A date, an address, details, or a weekly
  repeat.") — one constant, unit-pinned, because the hint must say what is
  actually behind the door (V9 t03's MORE_OPTIONS_HINT contract).
- E2E specs that drive the kids picker through the disclosure must keep
  passing WITHOUT editing expectations where the picker is still in the
  disclosure (no-kid parents); specs using seeded kids open /new with kids
  present and may now find the picker above the disclosure — update the
  HELPER (`fixtures.ts` `openMoreOptions` precedent: add `kidsSection`)
  rather than weakening assertions.

## Acceptance criteria

- [ ] Parent with ≥1 kid: kids section visible above "More options" on /new,
      ≥44px touch targets (minTouchTargets pattern from AgeRangeChips),
      selection state identical to today's (`data-testid` preserved)
- [ ] Parent with 0 kids / loading: form is byte-identical to today's
      (asserted by the existing e2e passing unmodified for the no-kid cases)
- [ ] /edit: kids picker still inside the disclosure, markup unchanged
- [ ] Submit path unchanged: playdate_kids rows land exactly as before
      (golden-path.e2e.ts stays green without edits)
- [ ] `npm run build && npm run test && npx playwright test
      e2e/kids-v3.e2e.ts e2e/golden-path.e2e.ts e2e/post-fast.e2e.ts` exit 0

**Migration check:** NONE. `supabase/` untouched.

**Depends on:** nothing (parallel-safe with ticket 01 except one-writer
serialization; recommend 01 → 02 order since both touch NewPlaydatePage).
SENTINEL: DIRECTORY-POLISH-SORT-CAFE-K5W3

Slice: browse directory polish — sort dropdown, "Best first" label, Cafe removal,
pill spacing, bigger rating (Jon's review notes).
Repo: ~/Projects/playdate-app. Base: HEAD. Do not push.
OWN WORKTREE — derived from THIS FILENAME (/tmp/pd-wt/directory-polish).
Commit on branch directory-polish; never touch main or another lane's path.
⚠️ HOT FILE: PlaceDirectory.tsx. Do NOT run this in parallel with another slice that
touches PlaceDirectory (create-language, place-page-polish).

## The notes (Jon, 2026-10-08)
- `mv0crqvw` (PlaceDirectory ~1313): "this should be a SORT DROPDOWN here. And when you
  click on it, there's options to sort the list based on what you think would be most
  useful to parents looking for a place to host a drop-in."
- `mv0cq2io` (PlaceDirectory ~1313): "What is Best first based off of? I'd like to know
  what that is referring to." → the label must EXPLAIN itself (a one-line hint or
  tooltip; "best" = highest rated, then most-reviewed, then name).
- `mv0cpqfi` (PlaceDirectory ~1003): remove the "Cafe" pill (redundant with the
  existing coffee-nearby filter), AND make the pills sit next to each other with even
  spacing (no blank gaps).
- `mv0ctaar` (PlaceDirectory ~1871): the star rating should be larger and more
  prominent (it is the strongest social proof).

## ORCHESTRATOR DECISIONS (resolved — do NOT re-litigate these)

You have already spent a full run deliberating the two ambiguous items. They are now
decided. Implement exactly this; if you disagree, note it in the report and follow the
decision anyway.

**D1 — the "Cafe" pill (item 3).** The row's *kind chips* (`PLACE_KIND_CHIP_KINDS`) carry
NO cafe chip. The thing Jon sees as "a Cafe" is the **coming-soon placeholder pill
labelled `Food/Cafe`** (`comingSoonKinds`, PlaceDirectory.tsx ~841). He says it is
redundant with the coffee-nearby filter. DECISION: **rename that placeholder's label
`Food/Cafe` → `Food`** (keep `id: 'food'`, keep `data-testid="place-kind-placeholder-food"`,
keep the "Coming soon! Want to request local food spots?" copy). Do NOT delete the pill,
do NOT touch `PLACE_KIND_CHIP_KINDS`, do NOT touch the coffee-nearby filter. Rationale:
the redundancy is the "Cafe" half only; the food-request channel is not redundant. This
also keeps every spec green (`toContainText('Food')`, `containsText('food')` still hold).
Update the comment that says "the two categories the DATA CANNOT EXPRESS (no food/cafe…)"
to reflect that the food door no longer claims a cafe.

**D2 — pill spacing (item 4).** Do NOT spend a run measuring widths. The complaint is
perceptual: a left-aligned wrapped row leaves a large ragged right margin that reads as
"blank spaces". DECISION: keep the row wrapping and left-aligned (do NOT justify-center),
and tighten the inter-pill spacing so the group reads as one cluster: the kind-chip row
(`place-kind-chip-row`, ~line 1002) and the overflow panel row (~line 1146) go from
`gap-2` to `gap-1.5`. Nothing else about the anatomy changes. Verify no 390px overflow
with a targeted e2e assertion at the existing 390px viewport; do not build a measurement
harness.

## Work
1. **Sort as a dropdown.** Replace the segmented `places-sort-control` (Best first /
   A–Z buttons) with ONE dropdown control (`<select>` or a menu button) offering the
   same SortMode options. Keep `data-testid="places-sort-control"` on the wrapper; the
   individual options keep their own testids if a spec asserts them (check first).
2. **"Best first" self-explains.** Whatever label the dropdown shows for the default
   must say what it means — e.g. "Best first (top rated)" — or carry an adjacent
   one-line hint. No jargon left undefined.
3. **The "Cafe" → "Food" placeholder.** Per decision D1 above: rename the coming-soon
   placeholder label `Food/Cafe` → `Food` (id stays `food`, testid stays
   `place-kind-placeholder-food`). It is NOT in `placeKindChips` — it is `comingSoonKinds`
   (~line 841). Do not delete it, do not touch the chip set or the coffee-nearby filter.
4. **Pill spacing.** Per decision D2 above: `gap-2` → `gap-1.5` on the kind-chip row and
   the overflow panel row only. No justify-center, no measurement harness.
5. **Bigger rating.** Increase the star rating's size/weight on the place rows so it
   is the most prominent piece of social proof.

## What must NOT change
- The sort MODES available (top-rated / A–Z) and their behavior.
- The coffee-nearby filter and the food coming-soon placeholder (only the "Cafe" half of
  that label goes, per D1).
- The filter logic in `planDirectoryList` — this is presentation.
- Update any spec that names a removed/changed testid in the SAME diff.

## Acceptance
1. Sort is a single dropdown; its default option's meaning is stated (top-rated first).
2. The placeholder reads "Food" (no "Cafe"); coffee-nearby still works; `place-kind-placeholder-food` survives.
3. Chips sit with even spacing, no blank gaps, at 390px.
4. The rating is visibly larger/more prominent than before.
5. No red spec; renamed-testid specs updated in the same diff; 390px no overflow.

## Gate
ALLOW_CONFIG_CHANGE="vite.config.ts: another lane's unstaged dev-only change, not this slice" npm run verify
ALLOW_CONFIG_CHANGE="vite.config.ts: …" npm run guards   # GUARDS: PASS
Run the directory specs (places.e2e.ts) on a private port 4210-4218. The gate must be fully green. Stage BY PATH ONLY.

Report .scratch/directory-polish-report.md, then reply:
Sentinel: DIRECTORY-POLISH-SORT-CAFE-K5W3
Status: DONE | BLOCKED
Commit: <sha7>

# 03: Place detail — drop the "Ages not listed yet." nag

**What to build:** On a place's detail page (`/place/:slug`), when the place
carries no age data the page shows an "Ages not listed yet." line. Remove
that line: a place with no age data simply shows NO age line. Places WITH
age data keep their age line ("Ages 4–8", from `placeAgeFitLabel`) unchanged.
Also remove the e2e assertion that pins the nag.

**Why:** Founder directive (V11): the line reads as a nag for data the place
owner never had to fill in — most places will never have ages. Silence is
the honest state.

**Status:** TODO

## Mechanics (pinned)

- `src/pages/PlacePage.tsx` (lines 356-360): today it renders
  `{ageFit !== null ? <p className="mt-2 text-sm text-slate-600">{ageFit}</p> : <p ...>Ages not listed yet.</p>}`
  where `ageFit = placeAgeFitLabel(place)` (line 291). New: render the
  `<p>{ageFit}</p>` ONLY when `ageFit !== null` (else `null`). `placeAgeFitLabel`
  itself is unchanged — its null return just stops being displayed.
- `e2e/places.e2e.ts`:
  - Line 153: `await expect(page.getByText('Ages not listed yet.')).toBeVisible()`
    — delete the assertion (the spec's setup seeds a place with no ages, so
    it now simply asserts the age line is ABSENT — add a
    `await expect(page.getByText('Ages not listed yet.')).toHaveCount(0)` or
    the equivalent "no age line" assertion so the spec still says something).
  - Line 11 module-doc bullet references the "honest age line" — update the
    comment to match.
- Nothing else renders that string (grep "Ages not listed" across `src/` →
  only PlacePage).

## Acceptance criteria

- [ ] Place with no age data: no age line of any kind renders (no "not
      listed yet", no empty "Ages —" stub); layout has no gap where the line
      used to be.
- [ ] Place with age data: the "Ages N–M" line renders exactly as before.
- [ ] `places.e2e.ts` updated (assertion removed/replaced); `npm run build &&
      npm run test` exit 0; full e2e suite green.

**Migration check:** NONE. `supabase/` untouched.

**Depends on:** nothing. Recommend running AFTER ticket 02 (both touch
`places`-domain files + the same e2e spec, so a single review pass).
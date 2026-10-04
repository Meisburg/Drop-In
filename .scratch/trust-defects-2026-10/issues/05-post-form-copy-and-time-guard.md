# 05 — Two post-form gaps: the bare "@", and no time-of-day rule

**Status:** ready-for-agent
**Type:** Usability Improvement + Product Improvement
**Source:** Perplexity PCR 006 + PCR 004 → `D9`

## What happens

**(a) The unexplained token.** The place field's help text reads exactly:
`Start typing to find one, tap Browse places to see them all, or type @ — picking
one fills the address for you.` (`src/components/PlaydateFormFields.tsx:373-377`).
The `@` alias feature is real (`src/lib/places.ts:807-817`, used at
`places.ts:1133`, `postSummary.ts:95`, `NewPlaydatePage.tsx:1136-1141`), but the
sentence never says what `@` *does*. It is the first field on the form.

**(b) No time-of-day sanity.** `nextSlotMinutes` rounds **up** to the next
half-hour (`src/lib/feed.ts:1948-1953`), which is correct, and
`validatePlaydateForm` only checks the 30-minute grid (`src/lib/feed.ts:911-935`).
So a post created at 05:30 offers a 05:30 playdate and nothing objects. The
review reported this as "Now defaults to 5:30 AM"; the default is not fixed — the
reviewer's clock was — but a 05:30 start being unguarded is the real finding.

## Acceptance criteria

1. The help text states what `@` does in a parent's words, or drops the token
   from the sentence entirely. A **rendered** assertion pins the new copy.
2. A drop-in starting at an hour the product considers unreasonable is either
   refused with an explanation or flagged before submit. The chosen rule lives in
   a comment and is pinned by a **unit test in `src/lib/feed.test.ts`**.
3. The rule is pure and lives in `lib/` — not in the page.
4. `Now`, `In an hour`, `Tomorrow 10am`, `Sat 10am` all still work
   (`src/lib/feed.ts:2027-2064`).

## Verification

```bash
npm run verify
npm run test:e2e -- e2e/time-presets.e2e.ts e2e/place-directory-in-new.e2e.ts
```

## Likely files

- `src/components/PlaydateFormFields.tsx` — the copy
- `src/lib/feed.ts` + `src/lib/feed.test.ts` — the time rule

## Considerations

- Whatever the time rule is, it must not block the ordinary case: a parent at a
  playground at 07:00 starting a drop-in now is the product working as designed.
  The narrow, defensible rule is "a start time in the small hours of *today*",
  not "any early hour".
- If the rule is a warning rather than a block, it must be dismissible and must
  not appear for the time presets, which are already sane.
- The copy fix must survive the `copy-taxonomy` guard if the string it touches is
  declared there (`scripts/guards/copy-taxonomy-guard.mjs`).

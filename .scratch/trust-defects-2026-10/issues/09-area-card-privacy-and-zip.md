# 09 — The area card must state the privacy promise, and offer ZIP as a peer

**Status:** ready-for-agent
**Type:** Usability Improvement
**Source:** ChatGPT PCR 002 + Grok PCR 005 → `D8`
**Decision (founder, 2026-10-04):** add the privacy line **and** render ZIP as a
visible peer option, not a fallback unlocked by failure.

## What happens

The area card's required field is labelled `Home address`
(`src/pages/OnboardingPage.tsx:1809`) and carries **no statement about who can
see it**. The only privacy sentence — "still private and never shown to other
parents" — lives inside the **failure-only** note (`:1958-1961`), which a parent
who types a resolvable address never sees. The ZIP field renders only once
`zipFallbackShown` is true (`:1978`), which is set on resolution failure or
permission denial (`:1035,1111,1119,1208,1218`). The card is required and
non-skippable (`:962-963`).

So: a parent who wants to give a ZIP rather than a street address must first
submit a street address and have it fail. The card copy is otherwise good —
`Where do you live?` / `We use your neighborhood to show nearby drop-ins. An
address works best; a ZIP code works too.` (`src/lib/firstRunCopy.ts:103-104`).

## Acceptance criteria

1. The privacy promise appears **at the field**, before submission, for both
   paths — the same promise the product already makes elsewhere (never shown to
   other parents).
2. A parent can choose ZIP **without** submitting an address first, and that
   choice is visible without scrolling past the address field.
3. The address path still geocodes into `home_zip`; the failure path still lands
   on ZIP with an explanation; account creation is never blocked by a geocode
   failure.
4. Nothing more precise than the existing model is stored or exposed (`home_zip`
   + radius). If the typeahead holds a transient address, it is not persisted.
5. Rendered assertions cover both paths: address resolves → feed; ZIP chosen
   directly → feed.

## Verification

```bash
npm run verify
npm run test:e2e -- e2e/signup-zip-fallback.e2e.ts e2e/onboarding-gate.e2e.ts
```

## Likely files

- `src/pages/OnboardingPage.tsx` — the area card (~`:1773-2050`)
- `src/lib/firstRunCopy.ts` — the copy (`:102-106`)
- `src/lib/firstRun.ts` / `src/lib/firstRun.test.ts` if the card's shape changes

## Considerations

- ⚠️ **This deliberately supersedes a settled decision.** `task-state.md:56`
  records "the area card asks the address with ZIP fallback", and
  `.scratch/first-use-discovery-audit/spec.md:27-29` scoped the batch to making
  the *fallback legible* only. The founder's 2026-10-04 decision changes that to
  a peer offer. **Record the supersession in the report** so the reviewer judges
  against the new decision, not the old one.
- Check `docs/adr/0001-home-zip-stops-being-a-gate.md` before changing what the
  card requires — ZIP must stay sufficient.
- The address field is one of the run's required answers; do not make it
  optional as a side effect of this ticket.
- The `copy-field` / `copy-taxonomy` guards read the copy modules. A new const
  must be *consumed* by the app or explicitly allowed, with a written reason.

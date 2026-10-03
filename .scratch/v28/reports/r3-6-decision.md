# r3-D3 — r3-6: delete the ending, ADD a feed landing, keep HowItWorksCard for r3-7

**Decided by the human 2026-10-03**, after the measurement stop
(`r3-6-measurement.md`) found that the slice's deletion boundary was ambiguous.

## The measured conflict, and the ruling

**r3-6 REMOVES the card that V28 slice 6's defect #19 installed, and must therefore
introduce the very "feed bounce" #19 forbade.** That reversal is intended (the human's
item 2: "start by exploring other people's drop-ins"), and it is now recorded rather
than left to be discovered — the same discipline as r3-3/A14 and r3-5.

**The human's ruling:**

> Delete the ending screen, add a feed landing, **keep `HowItWorksCard` for r3-7.**

## What that means precisely

1. **A NEW feed landing is added.** `resolveOnboardingRedirect` still returns `null` for a
   signed-in parent (`lib/onboarding.ts:69-72`, pinned by `onboarding.test.ts:64`), so
   nothing bounces them today. The finish path must now navigate to `/`. This is
   **new behaviour**, not a deletion, and it is the #19 reversal.

2. **`HowItWorksCard` stays, and its testid `first-run-finish-card` stays with it.** The
   component is no longer RENDERED, but it is not deleted — r3-7 (tooltips) is its likely
   consumer, and `firstRunTour.ts` + `TOUR_TAXONOMY_CLAIMS` are guard-coupled (r3-8 owns
   that reconciliation). **Deleting it here would pre-decide r3-7.**

3. **Therefore the 12 testid hits do NOT get renamed — they get REPOINTED to whatever the
   walk now lands on.** The specs must assert the NEW truth (the parent is in the app, on
   the feed), not a card that no longer renders.

4. **⚠️ `signup-zip-fallback.e2e.ts:568`'s `not.toBeVisible()` MUST BE REPLACED, not
   renamed.** Its meaning is "a stale save did NOT already render the ending". With the
   ending gone it would be **vacuously true** — green while testing nothing (the D-030
   shape). Its replacement must assert the parent is **still on the area card** (the real
   discriminator), which is what the surrounding lines already assert.

5. **`e2e/fixtures.ts`'s `finishSignup` changes its landing assertion** from "the ending
   card appears, tap its CTA" to "the feed appears" — because the walk now lands there.
   **19 spec files ride that helper**, so this is the highest-blast-radius edit in the
   slice and the browser lane is the only thing that can prove it.

## Not in scope

- The **8d radius-select divergence** — untouched, still open.
- **`firstRunTour.ts` / `TOUR_TAXONOMY_CLAIMS`** — not deleted; r3-7 and r3-8 own them.
- **r3-7 work** — not started.

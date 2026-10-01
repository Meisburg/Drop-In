# Slice 5 — FIX ROUND 3 (resume the builder) — FINAL ROUND

Round 2 **passed both lanes**: the reviewer returned **PASS** (*"the commit message carries raw FAIL blocks with
test counts, not paraphrase… 12 static `it()`s + 2 generated = the claimed 14 green"*) and the verifier returned
**PASS** across `verify` plus **three** runs of the fix-pinning spec and one run of the pair.

Six review findings and three `ocr` findings remain, all non-blocking — **and one pair of them is the same defect
seen from two sides, which makes it structural rather than cosmetic.**

---

## A — THE ONE REAL FIX: single-source the guard's derivation (closes FOUR findings at once)

The reviewer, `firstRunTour.test.ts:159-160`:
> the negative half derives `withheldKinds` **by label** (`!offeredLabels.has(placeKindLabel(kind))`) while the
> vacuity guard at `:183` counts **kinds**. A withheld kind whose label collides with an offered kind's label is
> silently dropped from the loop **and the guard stays green** so long as one other withheld kind remains.

`ocr`, `e2e/signup-zip-fallback.e2e.ts:207`:
> this filters by **kind membership** and needs an `as readonly string[]` cast, while the unit test builds a
> **Set of labels**. **The two derivations differ.**

**And the escape one-liner now exists in THREE places** — `firstRunTour.test.ts:59-61`, an inline copy in the same
test's property (`:217`), and the e2e's (`:217`) — which both lanes flagged as drift (`ocr`: *"a missed
metacharacter in one silently over-matches the pin"*).

**So this is not four small fixes; it is one missing module.** Build **ONE** exported implementation that both the
unit test **and** the e2e spec import:

- **the withheld categories** — and note the two derivations must be reconciled deliberately, not averaged: say
  in a comment **which one is correct and why** (they disagree today, and one of them is the reason the guard can
  go green while the loop drops a kind);
- **the escaped pattern** for a category, built once.

**Place it in `src/lib/firstRunTour.ts`** (its sibling test already exists, so the build law's sibling rule is
satisfied) — or in a new `src/lib/` module **if and only if you ship its sibling test**. **One implementation, two
callers.** This is the batch's standing rule: **the second occurrence of a defect class gets a guard, not another
one-off fix.**

## B — [REAL, and it contradicts this module's own pinned invariant] `ocr`: the body's framing

`firstRunTour.ts:103`. The body frames **every** listed control as *"how you move around the app"* — **but the
third entry is the centre Post action, which this module's own header and `App.tsx:489-499` record as "an ACTION,
not a fifth NavTab destination."** **Posting is not a way to move around the app, and this module is the one that
insists on that.** `ocr` is right. **Reframe so the sentence does not classify Post as navigation.**

## C — [REAL, honesty class] The reviewer: device classes vs width

`firstRunTour.ts:99` maps the `md` **breakpoint** to **device classes** (*"a phone" / "a tablet or desktop"*).
**The app switches on width, not on device class** — so the sentence is *marginally stronger than the classes
warrant*, which is this slice's own defect class in miniature. **Reword to what `App.tsx` actually switches on**
(a narrow screen / a wider one, or name the breakpoint).

## D — [REAL, same class R6 fixed] The reviewer: the CTA is still a literal

`e2e/signup-zip-fallback.e2e.ts:222` — `'Go to your feed'` **restates `TOUR_PRIMARY_LABEL`**, which is the
identifier this batch pinned deliberately. R6 imported the title and the lines; **the CTA is still a literal.**
Import it. (The **pin's existence** is ruled fine — only the restatement changes.)

## E — [cosmetic, fold in] The reviewer: a one-directional failure message

`firstRunTour.test.ts:138-140` — the pairing assertion is symmetric but its message is not; a body naming only the
rail fails with *"puts the controls at the bottom"*, mis-describing the failure. **Make the message follow the
direction that actually failed.**

## Accepted, do NOT fix (my rulings, with reasons)

- **Irregular plurals** (`test.ts:198`, `\b<label>s?\b`): **latent — every current label is regular.** Recorded,
  not fixed.
- **The duplicated-escape residue:** closed by **A**.
- **The e2e's `as readonly string[]` cast:** closed by **A**.

---

## Acceptance

1. **One** implementation of the withheld-category derivation and **one** of the escape, **imported by both**
   callers; no `as readonly string[]` cast in the spec; **and a comment naming which derivation was correct.**
2. **Prove the guard can still fail**: mutate so a withheld category is silently dropped and show the guard
   catching it (or show, with the red output, why the reconciliation makes that state unreachable).
3. The body does not classify Post as navigation, and names no device class.
4. The CTA is imported; the assertion message follows the failed direction.
5. `npm run verify` exits 0 — counts **and** raw pasted red in the report **and** the commit.

## Verify

`signup-zip-fallback` ×3, `zip-radius` + `loop-closing` once. **Four named flake modes now** — the fourth is a
teardown `close()` on an already-closed context. Re-run once before believing any red. Do not poll for a
background job; kill listeners **by port**.

## Report

**`Committed as: <sha7>`**, which derivation was correct and why, the guard's red output, and the counts.

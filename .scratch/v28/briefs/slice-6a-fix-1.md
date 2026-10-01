# Slice 6a — FIX ROUND 1 (resume the builder)

**Your slice was reviewed by a lane I specifically told to ATTACK the guard rather than audit it, and it found a
real defect — the same class you built the guard to close, one rung inward.** The product change passed clean:
every judgement about the prop, the type, the value change and the registration came back **met**, and the reviewer
**explicitly cleared your scope question**: *"`SkippableFirstRunCardCopy` is not scope — it is the minimal honest
fix... a type carries no value so there is no second source of the word, and it cannot re-open the defect — widening
back makes `skipLabel` optional again and fails to COMPILE at the prop rather than silently rendering nothing."*
And on rejecting `?? ''`: *"that fallback IS the defect."* **Both of your declared brief-defects were upheld.**

Now the blocking finding.

## F1 — [BLOCKING] Field identity is a BARE NAME, so a sibling shape's read counts

`copy-field-consumption-guard.mjs:288` + `:375`: the guard keys a declared field by its name **within the module**,
and a read on **any binding imported from that module** satisfies it. **`firstRunCopy.ts` declares TWO shapes
sharing names** — `interface FirstRunCardCopy` and the untyped `FIRST_RUN_NUDGE_COPY` (`:100-107`) — and both have
`title` and `body`.

**So `FIRST_RUN_NUDGE_COPY.title` at `src/App.tsx:195` is accepted as the consumption of
`FirstRunCardCopy.title`.** The reviewer's evidence is your **own clean-run output**:
*"read — title (interface FirstRunCardCopy) at src/App.tsx:195"* — **that line is the NUDGE's `<span>`, not a
card's title.**

**Falsification input, its words:** *"delete every card's `title` read (`OnboardingPage.tsx:1342` and its three
siblings) and the guard still reports `title` READ and exits 0 — **the skipLabel defect, re-opened for any field
name shared between two shapes in one module.** Same for `body`."*

**And it is not in your `KNOWN LIMITS`** (`:60-75`) — and it is precisely the name-collision class **your header's
exclusion #4 claims to close**, one rung inward. **That is why it is blocking: the guard's stated rule and its
implementation disagree, and the disagreement is the defect it exists to catch.**

**THE FIX — key declared fields by their DECLARING SHAPE**, and require the matching read's root to be a binding
**that shape actually names**. The reviewer's minimum acceptable fallback, **only if the real fix is genuinely
disproportionate**: *"name the root binding in the reported evidence and record the limit in KNOWN LIMITS"* — with
the reason stated. **Do not silently choose the fallback.**

**AND SEED IT:** delete a card's `title` read **while `FIRST_RUN_NUDGE_COPY.title` stays** — the one input that
separates the fixed guard from the broken one. **That seed is the proof; without it this is an assertion.**

## F2 — [REAL, same class one rung outward] The consumer exclusion admits every OTHER test file

`:415-418` excludes only the module and **its own** test. So **any other `src/**/*.test.*` counts as a consumer
file** — and can buy exactly the immunity your header rails against. Latent today (only `firstRunCopy.test.ts`
imports the module), and **the same argument you made about the module's own test applies to every test**:
*"if a test counted, every unread field could buy immunity by asserting about itself."* **A test in another file
asserting about the field is the same immunity, one file over.** Fix the exclusion, or state the limit.

## F3 — [minor, safe direction] A destructured read is not recognized

`:375`: `const { skipLabel } = FIRST_RUN_COPY.kids` would be reported as **unread** (a false alarm — the safe
direction). Not in `KNOWN LIMITS`. **Either support it or list it.** A known limit that is written down is a limit;
one that is not is a surprise.

## Accepted — do NOT change these (my rulings, with the reviewer's reasoning)

- **`SkippableFirstRunCardCopy` stays.** Cleared as the minimal honest fix; rejecting `?? ''` was right.
- **The value change stays.** The reviewer's argument: *"once the prop is wired the module's value IS the rendered
  word; keeping `'Skip for now'` would have changed the UI and broken six e2e sites that locate the control by
  name"* — it lists them.
- **500 lines is justified, not over-engineered** — it is in-family (`fixture-marker` 637, `vacuous-absence` 506,
  `stale-locator` 405) and the batch's "fourth instance → build a guard" rule authorizes it. **The reviewer's
  suggestion for the ~180-line hand-rolled stripper is real but out of scope:** `typescript@~6.0.2` is already a
  devDependency, so an AST walk would delete that section **and** close F1 — but no existing guard parses with TS,
  so switching here is a cross-cutting change. **Noted for a future slice, not done now.**
- **`COPY_MODULES` being a hand-maintained list of one** is documented, and the rule's prose being wider than its
  enforcement is stated. Acceptable. **Do not grow it here.**
- **No `src/components/FirstRunCard.test.tsx`** — the sibling-test rule is scoped to `lib/`, so this is not a
  violation; the type forbids the bad pairing and e2e covers the word. Accepted.

## And one thing your report claimed that the reviewer could not verify — say what you observed, not more

Your ladder said the zero-fields tripwire *"fired **twice** during development and caught two real parser bugs (a
wrong brace index, a wrong literal depth)."* **The reviewer: *"the 'fired twice during development' claim has no
artifact in the diff — unverifiable, and not load-bearing."*** **It is right, and I acted on that claim** (it is
now a standing rule). **The RULE survives because the MECHANISM is verified in your code** — zero declared fields
is a finding (`:409-411`), a vanished module is a finding (`:399`), and the check requires both counts non-zero
(`check.mjs:139-143`). **But the anecdote is a claim like any other.** *A claim that is nearly right is still a
claim* — **and the ledger now records the mechanism as the evidence, not the story.**

## Acceptance

1. **F1 fixed by declaring shape**, `KNOWN LIMITS` and the header rule updated to match the implementation, **and
   the seed proves it**: delete a card's `title` read while the nudge's stays → **red**; restore → green. **Paste
   both.**
2. **F2 fixed or explicitly limited**, with the reason.
3. **F3 supported or listed.**
4. `npm run verify` exits 0 — counts and raw red in the report **and** the commit.
5. **Your `.check.mjs` still proves the checker fires** — including the no-match case.

## Verify

`npm run verify`, plus **both guard artifacts run directly**, plus `e2e/signup-zip-fallback.e2e.ts` once and
`e2e/onboarding-resume.e2e.ts` once (**this fix touches only `scripts/`; say so, and say why the product specs
still matter**).

**Four named flake modes** — re-run once before believing any red. Kill listeners **by port**.

## Report

**`Committed as: <sha7>`**, the shape-keying fix and what it does differently in one sentence, the seed's red and
green, the counts, and anything else the brief did not anticipate.

## F4 — [REAL, and `ocr` found it from a different direction] The skippable card's identity now has TWO sources

`ocr`, `firstRunCopy.ts:51`:

> The identity of "the skippable card" is now stated in **two independent places**: `isSkippable` in
> `src/lib/firstRun.ts` (`return card === 'kids'`) and this **hard-coded `kids` key in the annotation**. The comment
> above the interface says `isSkippable` is what decides, but **the type restates the decision instead of deriving
> it**, so the two can drift silently in one direction: **if `kids` stops being skippable, this annotation still
> REQUIRES `skipLabel` on it — i.e. it re-institutes exactly the required-but-unread field this slice removed**
> (only the new copy-field guard catches it, at guard time rather than at type time).

**And note the disagreement, because it is instructive rather than confusing:** the REVIEWER said *"drift against
`isSkippable` is caught at compile time"* — **it is right about the direction it checked, and `ocr` is right about
the other one.** The type requires `skipLabel` on `kids`; nothing derives **which** card is skippable from the
authority. **Both lanes are correct; only one of them looked at both directions.** Neither claim is withdrawn.

**THE FIX `ocr` proposes, and I am adopting it:** derive the shape from the authority instead of restating it —
`export type SkippableFirstRunCardId = Extract<FirstRunCardId, 'kids'>` in `firstRun.ts` (or a `SKIPPABLE_CARDS`
constant that `isSkippable` also reads), then a mapped type here so the skippable entry is the only one carrying
`skipLabel`. **It keeps totality, keeps `skipLabel` required on the skippable entry, and removes the second source
of truth.** *One authority, derived everywhere -- the same rule the escape dedupe and the withheld-category guard
were each fixed by, now applied to a TYPE.*

**If you find that a mapped type cannot express this without weakening the prop's requiredness, STOP and say so with
the reason** rather than settling for a comment. **A comment saying "`isSkippable` decides" is not a derivation.**

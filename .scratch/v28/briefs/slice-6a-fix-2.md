# Slice 6a — FIX ROUND 2 (resume the builder)

Both lanes **PASSED** round 1. The reviewer **reproduced your seed independently** (old guard → exit 0, fixed guard
→ exit 1), **attacked F1 and could not break it** (alias of the sibling const, destructured read, chain inside a
string, chain inside a JSX attribute — all still correct), and verified the single-authority change with its own
`tsc --strict` probe. The verifier confirmed the gate and **independently proved the `tsc -b` vacuity retraction**.

**Then `ocr` returned SIXTEEN findings, and most are real defects in the parser.** I measured three myself and they
reproduce. **That is the cost of a 600-line hand-rolled parser, and it is the shape of this round.**

## THE RULE I AM SCOPING BY — and it is a split by DIRECTION, not by severity

**Fix everything that can fire on CLEAN code, and everything that can make the guard LIE.** Leave as a stated limit
everything that merely makes it *miss* something reachable only by contrivance.

**Why:** *a guard that fires on clean code gets bypassed, and a guard that can pass vacuously is not a guard* — but a
guard that misses a contrived input, **and says so**, is still a guard. **The first two are defects; the third is a
limit.** This batch has already ruled that a guard which pretends to be total is worse than one that states what it
covers.

## FIX THESE — false positives, false passes, or a checker that can lie

**A — [`ocr` #12, and I CONFIRMED IT] The silently-skipped case became an un-allowlistable HARD finding.**
`:396-400`: any exported const whose annotation contains `<`, `>` or `: Type` now pushes
*"names no shape this module declares — its fields cannot be judged"*. **Previously this was a silent skip.** The
consequence: **a future unrelated exported const in a copy module BREAKS THE BUILD, and cannot be excused.** Restore
a documented, deliberate escape for "not a shape we judge" — **or make the message name what the author should do.**
Do not leave clean code failing.

**B — [`ocr` #13 + the REVIEWER] The keyword set is incomplete, and `as` is a FALSE PASS.** `:160-178`
(`stringCanStart`) — I am **adopting the reviewer's finding and this one together.** The reviewer measured that
`(FIRST_RUN_COPY.name.primaryLabel as 'kidsCopy.title')` makes the guard report the card's field **read** and exit
**0**. **A string counting as a read is exactly your exclusion 5: the guard LIES.** `ocr` adds `extends`
(`<T extends 'a'>`) and **tagged templates**. **Fix the mechanism, not the three inputs** — say what rule decides
whether a quote opens a string, and make the rule follow it. **Seed it.**

**C — [`ocr` #4, and I CONFIRMED IT] The annotation group is UNBOUNDED.** `:383`:
`/\bexport\s+const\s+([A-Za-z_$][\w$]*)\s*([\s\S]*?)=\s*\{/g` — `([\s\S]*?)` can cross statement boundaries, so for
`export const A = ['x']` followed by `export const B = { … }` **the first match binds A's NAME to B's LITERAL** —
a wrong shape attribution, which is a false-positive generator downstream. **Bound it to its own statement.**

**D — [`ocr` #1, and I CONFIRMED IT] The authority is not tied to the id union.** `firstRun.ts:43`:
`export const SKIPPABLE_CARDS = ['kids'] as const` — **nothing constrains it to `FirstRunCardId`.** A typo
(`'kidz'`) or a card rename makes `SkippableFirstRunCardId` a type **outside** the union, and the whole point of this
round was that the authority cannot drift. **Tie it: `satisfies readonly FirstRunCardId[]`, or a signature that
fails to compile otherwise.** Show me the compile error for a typo.

**E — [`ocr` #3] An ALIASED IMPORT misses its reads.** `:551` keys `constShapes` by the **exported** const name,
while `importedBindings` returns the **local** name (`spec.trim().split(/\s+as\s+/).pop()`). So
`import { FIRST_RUN_COPY as copy }` yields `copy`, which is not a key — **its reads are missed, so a field that IS
read is reported unread: a false positive.** Map local → exported, and seed it.

**F — [`ocr` #6] A FORWARD-REFERENCED alias produces a hard finding.** `:363`: `aliases` is populated in source
order, so an alias referencing a later alias resolves to an empty set, the const's annotation yields
`named.size === 0`, and it falls into `unresolved` — **clean code, hard finding.** Make resolution order-independent,
**or do not push a hard finding when the cause is our own resolution order** — say which and why.

**G — [`ocr` #2] Dead property.** `:514` drops `ownTest` from the destructuring, so the `ownTest` property on
`COPY_MODULES` (`:125`) is now read nowhere. **Delete it**, or say why it stays.

**H — [`ocr` #10] The checker can crash instead of failing.** `check.mjs:93`: `pristine` is built **before** the
`try`, so if `src/lib/firstRun.test.ts` is renamed or deleted, `readFileSync` **throws outside the try** — a crash
rather than a finding. **Move it inside, or handle the absence as a finding.**

**I — [`ocr` #14] VERIFY BEFORE FIXING — I could not reproduce this one.** It says `check.mjs:236`'s `editFile` uses
`String.replace`, i.e. **first occurrence only**, while that seed's premise is *"delete **every** card's `title`
read"* — so a single surviving read would leave the seed passing for the wrong reason. **My grep for `editFile` found
nothing, so the name may differ and the finding may be wrong.** **Check it: if the seed does not delete every
occurrence, that is a SEED HONESTY defect and it is in scope; if it does, say so and drop it.**

## RECORD AS LIMITS — do NOT fix these (my ruling; write them into `KNOWN LIMITS`)

They are *misses* on inputs that are contrived or unreachable today, and they are honest once written down:
- **#5** every identifier in an annotation is treated as a shape (`Record<CardIdIface, FirstRunCardCopy>` would
  judge `CardIdIface` too).
- **#7** a **direct read on the `Record` binding** (`FIRST_RUN_COPY.title`) satisfies the field by root attribution —
  the reviewer's "per-const, not per-value" limit. **Same ruling as theirs: record it.**
- **#8** a destructure counts as consumption even when the bound variable is never used.
- **#9** the guard re-reads each consumer file per field × consumer (a performance nit, not a correctness one).
- **#11** the `constShapes.has(b)` filter makes the `import * as ns` branch dead — a namespace read is missed (the
  **safe** direction).
- **#15** `isSkippable` still has **no caller in `src/`** outside its own module and test; the comment calling
  `SKIPPABLE_CARDS` "THE AUTHORITY" overstates by one rung because what actually decides the rendered control is the
  **prop pairing**. Pre-existing. **Fix the COMMENT only** if it is one line; otherwise record it.
- **#16** the mapped type derives which entry **must** carry `skipLabel`, not which entries **may** — the base
  interface still declares `skipLabel?: string`, so a non-skippable entry would typecheck with one. **A test pins it
  undefined; the type does not.** Record it, **unless** it is a one-line change.

## ⚠️ AND THE REAL CLOSURE, WHICH IS NOT THIS ROUND

**Eleven parser defects from one lane pass is evidence that the PARSER is the problem, not the individual rules.**
The reviewer already noted the fix: **`typescript@~6.0.2` is already a devDependency, so an AST walk would delete
the ~180-line hand-rolled comment/string stripper and close most of the list above by construction** — it declined
because no existing guard parses with TS, making it cross-cutting. **I am recording it as a named future slice, not
doing it here.** **Say in your report which of these findings an AST walk would have prevented.** That sentence is
part of the evidence for that future slice.

## Acceptance

1. Every FIXED item has **a seed that fails against the pre-fix guard**, and **the false-positive fixes must
   additionally be shown passing on a clean tree** (the whole point of A, D, E, F, H is that clean code stops
   failing).
2. Every LIMIT is written into `KNOWN LIMITS` **with the input that reaches it**.
3. `npm run verify` exits 0 — counts and raw red in the report and the commit.
4. **I is settled** — reproduced and fixed, or not reproducible and dropped.
5. **Your `.check.mjs` still proves the checker fires**, no-match case included.

## Verify

`npm run verify`, `npm run typecheck`, both guard artifacts directly, `signup-zip-fallback` ×2,
`onboarding-resume` ×1. **Four named flake modes** — re-run once before believing any red. Kill listeners **by
port**. **Do not poll for a background job** — foreground, or keep the PID and `wait $PID`.

## Report

**`Committed as: <sha7>`**, then a table: item → fixed or recorded → **the evidence**. Plus which findings an AST
walk would have prevented. Plus anything the brief did not anticipate.

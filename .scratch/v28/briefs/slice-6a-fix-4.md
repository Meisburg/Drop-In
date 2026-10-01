# Slice 6a — FIX ROUND 4: **attribute reads by SYMBOL, not by name**

*(Fresh builder on purpose: the fix is structural, and a builder who did not design the name-keyed table will not
defend it. Read `docs/agents/code-structure.md` first. Worktree
`/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, branch `Meisburg/onboarding`.)*

## Why this is round four, and why it is NOT another patch

**This class has now fired THREE times:**
1. **Fix-1 review:** *"field identity is a bare name within the module, and a read on any binding imported from that
   module satisfies it"* — the nudge's `title` satisfied the card's.
2. **The reviewer's `ladder:` at the time:** shape attribution is **per-const, not per-value**.
3. **This round:** *"root attribution is by name, not by binding/scope, so a **same-named local** manufactures
   consumption at exit 0."*

**Each time it was patched by making the name-matching cleverer.** The guard is an AST walk now and it *still*
decides identity by comparing strings — `roots` is a name-keyed table. **So the fix is not a fourth name rule: it is
to ask the TYPE CHECKER.** `typescript` is already imported and the gate already runs `tsc`, so a real program is
available. **Use symbols and types instead of names and you close all three instances by construction** —
`getSymbolAtLocation` answers "which declaration is this", and `getTypeAtLocation` answers "what shape is this
value", which is the question the name table has been approximating.

## A8 — [BLOCKING, and it is the ORIGINAL DEFECT passing the guard] A same-named local manufactures a read

The reviewer's reproduction **compiles with zero TS errors** and the guard **exits 0**:

```ts
// the real read deleted from the kids card, then:
const zzRenderSkip = (kidsCopy: { skipLabel: string }) => kidsCopy.skipLabel
// … skipLabel={zzRenderSkip({ skipLabel: 'Skip' })}    // a hard-coded word, in the chrome
```

`tsc --noEmit -p tsconfig.app.json` → **zero errors in that file**; the guard prints
`read — FirstRunCardCopy.skipLabel … at src/pages/OnboardingPage.tsx:1339` and **exits 0.** **That is the exact
original defect** — a hard-coded word in the chrome while the field *looks* read — **passing an 860-line guard
built to catch it.**

**It also falsifies two things the file says about itself:** the universal claim at `:89-90` (*"none of them can
report a word as read when it is not, which is the direction that matters"*) and **the defence used for the sibling
Record ruling at `:110-111`** (*"cannot exist in clean code"*) — **this input does exist in clean code.** Correct
both, and **seed A8.**

## A9 — [BLOCKING] A rest-element destructure of a copy value makes a REAL read invisible

```ts
const { ...zzRest } = FIRST_RUN_COPY.kids
skipLabel={zzRest.skipLabel}          // a real read
```
**tsc clean, oxlint clean, guard exit 1** naming both `skipLabel` fields — **a false positive on clean code.**
Header `:53` says a destructuring of a copy value **is** consumption, unqualified, and it is not in `KNOWN LIMITS`.

**And the reviewer's `ladder:` is the right diagnosis:** *"this is the class seed 21 already exists for — 'a false
alarm at the very style seed 9 was added to support' — **one rung down belongs in the walk, not in a third note**."*
**Seed it, and follow the rest element rather than noting it.**

## Also required

- **Header corrections, each with a seed**: `:89-90` (the universal claim A8 falsifies), `:53` (destructuring,
  incomplete), `:104` (**names a `namespace imports` line label that the rewrite prints as
  `limit—— namespace import …` at `:664` — no such labelled line exists**).
- **`srcFiles` matches only `.(ts|tsx)`** while `isTestFile` accepts `[cm]?[jt]sx?`. **A future `.mts`/`.cts`
  consumer would be silently skipped** — a missed read. Align the two. *(Cheap, and it is the "instrument with a
  blind spot" class.)*
- **`unfollowed.push` at `:640` is dead weight** — `:643` pushes unconditionally. Clean it.
- **`parseFile` reads `sf.parseDiagnostics`, which is NOT public API.** A TypeScript rename would **silently disable
  the K1c fence**; today only seed 26's assertion catches it. **Say whether you can make that fence loud** (e.g.
  assert the property exists), and if not, record it as a known limit. *(This is the "an instrument that reports
  nothing looks like a clean repo" class — worth one line of defence.)*
- **⚠️ ONE BASELINE PER SEED.** My last brief demanded that a seed fail against **two** versions; the reviewer
  confirmed that is **unsatisfiable** — *"a seed that catches a regression is by construction green against the
  version that was right."* **So state, per seed, the ONE version it must be red against, and say which.** Also
  note the reviewer's nuance: **seed 26 is red on `be29027` only because of its added `does not PARSE` half** — the
  older guard exited 1 there with the *correct* finding. **Do not let a table flatten that.**

## Acceptance

1. **A8's input makes the guard FAIL** — and the fix is symbol/type based, not another name rule.
2. **A9's input makes the guard PASS**, because the read is real.
3. **All seeds green on the current tree**, with **each new seed shown red against the one baseline you name**.
4. **The existing two-sided property is preserved:** the reviewer independently measured **6 red vs `a03fc54`**
   (17, 24, 25, 26, 27, 28) and **11 red vs `be29027`** (15, 16, 17, 18, 19, 20, 21, 22, 24, 26, 27), **39 ✓ / 0 ✗**
   on the current tree. **Reproduce or correct those numbers, do not assume them.**
5. **`npm run verify` exit 0**, **`npm run typecheck` exit 0**, both guard artifacts exit 0 directly, and **the guard
   still fails when it matches nothing.**
6. **If a full `ts.createProgram` makes the guard too slow or too fragile to live in the gate, STOP and report the
   measurement** — a slow guard that people route around is worse than a name table. Say the cost in seconds.

## Verify

`npm run verify`, `npm run typecheck`, both guard artifacts directly, `signup-zip-fallback` **once**,
`onboarding-resume` **once** — **one browser spec at a time** (the model has been OOM-killed twice; it holds ~50 GB
of 62).

**Four named flake modes** — re-run once before believing any red. Kill listeners **by port**. Never poll for a
background job. **Never write a large file in one tool call** — a previous builder died that way; use small edits.

## Report

**`Committed as: <sha7>` from `git log --oneline -1`**, then: lines deleted vs added, **the one baseline per new
seed**, the measured cost of the checker in seconds, and anything the brief did not anticipate.

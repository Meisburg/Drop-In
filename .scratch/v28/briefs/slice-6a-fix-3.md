# Slice 6a — FIX ROUND 3: **replace the scanner with a TypeScript AST walk**

*(You are the third round on this guard. **This one is not another patch.** Read why before you plan.)*

You are `orchestrator-builder`. **Read `docs/agents/code-structure.md` before writing.** Worktree
`/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, branch `Meisburg/onboarding`.

## RULED: stop patching the hand-rolled scanner. Rewrite it on the AST.

**The evidence, and it is decisive:**
- `ocr` found **16 defects, 11 of them parser-shaped**.
- Fix round 2 fixed nine of them — **and introduced or retained two BLOCKING defects**, one of which is a
  **regression against the fix-1 guard**.
- Three rounds of patching a lexer, each round finding more lexer bugs. **That is the definition of a class that
  should be made unconstructable rather than policed.**
- **Both fix-1 reviewers and `ocr` independently reached the same conclusion:** *"an AST walk would have prevented
  every blocking item"* — and `typescript@~6.0.2` **is already a devDependency**, so it is available to a
  `node scripts/guards/*.mjs` run and to CI.

**Your own list from last round is the specification** — you already enumerated what an AST closes by construction:
`blankNonCode`, `stringEnd`, `skipString`, `skipRegex`, `exportedConsts`, `importedBindings`, `aliasesOf`,
`destructuredReads` — **roughly two thirds of the file gets DELETED.** Keep the CLI, the rule, the allowlist
format, the output lines and the seeds.

## THE TWO BLOCKING DEFECTS YOU MUST CLOSE — both measured by the reviewer, on the `a03fc54` tree

**K1 — the string rule does not decide whether a quote IS AN OPENER.** `:83`, `:111`, `:244` claim the rule *"can
only hide, never manufacture"*. **False as written:** it decides whether a quote **has a same-line partner**, not
whether it opens. An **odd** number of apostrophes in JSX text before a real literal **pairs the apostrophe with the
literal's opening quote**, blanks through it, and **then scans the literal's BODY as code** — orphaning the closer.
With the real `skipLabel` read deleted, these three all make the guard report the field **READ and exit 0**:
```
It's 'kidsCopy.skipLabel' here                                  (fix-1 guard: exit 1)
What's next? See {'docs.kidsCopy.skipLabel'}                   (fix-1 guard: exit 1)  <- REGRESSION
const zzCont = 'abc<newline>kidsCopy.skipLabel'                (fix-1 guard: exit 1)  <- REGRESSION
```
**Seed 15 covers only the `as` case. There is no seed for pairing-shift. Add one per input above.**

**K2 — a copy read inside a TEMPLATE HOLE is invisible, and the code claims the opposite.** `:341` says *"A
template hole is CODE: scan it (so a real read inside `${…}` counts)"* — but the closing-backtick blank at `:337`
**erases the hole contents that were just scanned.** Measured: `skipLabel={`${kidsCopy.skipLabel}`}` →
**`FAIL … READ BY NOTHING`**. **This is the "fires on CLEAN code" class, and a template literal is the most natural
way to render words.** *An AST gets this free: a template hole is an expression node.*

## Also required

- **L1**: `patternLeaves` (`:662`) manufactures reads from **computed-key destructures** — measured
  `patternLeaves(' [k]: title ')` → `["k","title"]`, so `const { [k]: title } = FIRST_RUN_COPY.kids` counts the
  **local binding** as a read. Same lying direction. **An AST distinguishes the key from the binding.**
- **L2**: **de-export `FirstRunCopyByCard`** (`firstRunCopy.ts:63`). The reviewer de-exported it in a sandbox and the
  guard still reported `declared fields: 8` and PASSED — **so the justification recorded for exporting it is
  measurably false and it is public surface with no consumer.** Keep the type; drop the `export`.
- **L3**: the item-A skip line (`:791`) **names no remedy**, and a const skipped that way is invisible in the exit
  code. Make the line say what the author should do, **or** make the skip visible in the summary counts. Say which.
- **L4**: **seed 20's mutation uses `writeFileSync`** (`check.mjs:493`), bypassing `editFile`'s premise check that
  this round made an invariant. **Route it through `editFile`** — an invariant with one hole is a hole.
- **L5**: **item I's rule is now load-bearing, so apply it to the NEW seeds too**: each new seed asserts its own
  premise, and — per this round's hard-won rule — **each new seed must be shown to FAIL against the code before
  this round's change.** *A seed that is green against the broken version is not a regression test.*

## Acceptance — the shape of the proof I want

1. **All 28 existing seeds pass**, and the **8 that fail against the pre-fix code** (`15,16,17,18,19,20,21,22` — the
   reviewer measured this) **still fail against the code they were written to catch.** You can verify that
   yourself with `git archive`.
2. **K1's three inputs and K2's template-hole input each get a seed that FAILS against `a03fc54`** — and for K1's
   two regressions, **also against `be29027`**, since they are regressions from that state.
3. **The guard still passes on the real tree** (3 shapes, 8 shape-qualified fields, 2 consumer files, exit 0).
4. **The deleted machinery is actually deleted** — name what went and how many lines the file lost.
5. `npm run verify` exits 0 (`tsc -b` catches syntax/type errors in the walk), **`npm run typecheck` exits 0**, both
   guard artifacts exit 0, **and the guard still fails when it matches nothing.**
6. **If `import ts from 'typescript'` cannot work in a `node *.mjs` guard here, STOP and report that** with the
   exact error — **do not fall back to patching the lexer.** That is a real possible outcome and I want it named
   rather than worked around.

## Verify

`npm run verify`, `npm run typecheck`, both guard artifacts directly, `signup-zip-fallback` **once**,
`onboarding-resume` **once** — **one browser spec at a time**, because the machine is at its memory limit
(62 GB total, ~0 available, the model holds ~50).

**Four named flake modes** — re-run once before believing any red. Kill listeners **by port**, never `pkill -f`.
**Do not poll for a background job** — foreground, or keep the PID and `wait $PID`.

## Report

**`Committed as: <sha7>`** (and record the id from `git log --oneline -1`, never from memory — I got that wrong
this session), then: lines deleted vs added, the K1/K2 seeds with their pre-fix exits, which seeded failures you
verified independently, and anything the brief did not anticipate.

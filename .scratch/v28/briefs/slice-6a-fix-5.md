# Slice 6a — FIX ROUND 5 (fresh builder, CLOUD model): a MEASUREMENT round

*(Round 5 of the batch's five-round cap. The reviewer's verdict: **the mechanism needs no change** — it attacked the
new checker-based attribution with `any`, type assertions, interface widening, alias chains and the nearest real
over-report in the repo, and **could not break it.** What it found instead is that **this slice's own numbers do not
reproduce.** So this round is about the guard telling the truth about itself.)*

You are `orchestrator-builder` on the **cloud** model. Read `docs/agents/code-structure.md` before writing. Worktree
`/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, branch `Meisburg/onboarding`.

## ⚠️ THE SHAPE OF THIS ROUND, and why it matters more than it looks

**Three of the last report's numbers are wrong, and each is wrong in the direction that flatters the work.** The
reviewer measured every one. **This guard exists to catch copy that overstates what is true — and its own header
overstates what is true about itself.** That is not a nit in a slice whose entire subject is *"a claim must be
measured, not asserted."*

## THE FOUR BLOCKING FINDINGS — all measured by the reviewer, all reproducible

**M1 — `:229`: "735 lines to 818 total" does NOT reproduce.** The file is **735 lines at `dde111a`** and **849 at
`860893c`** (`wc -l`; 850 by `split('\n')`). **Wrong by 31 lines, in the flattering direction.**
**And the header two lines later says:** *"A header that overstates its own diff is the same defect this guard
exists to catch, so the measured number stays."* **The guard's own sentence, violated by the guard's own header.**

**M2 — `:239`: "it invokes the guard 28 times" is wrong; it is 32.** The reviewer enumerated all 32 `r = run(`
call sites with line numbers (`329, 348, 360, 375, 390, 401, 431, 449, 465, 475, 480, 488, 496, 506, 525, 542, 558,
581, 616, 633, 648, 693, 712, 734, 760, 777, 809, 843, 872, 891, 909, 940`). **28 is 32 minus the four
`run(guardWithAllowlist(...))` runs — which each execute a full copy of the guard and build a program.** *"So the
cost sentence understates its own cost driver by 14%."*

**M3 — the previous round's "counts correction" is ITSELF false, and you inherited it.** The claim was *"39 seeds is
a SEED count, not a CHECK count (41 checks on HEAD, 46 now)"*. **Measured: on `dde111a` the seed count is 28 and the
check count is 39** — exactly the *"check 39 ✓ / 0 ✗"* that round's own report gave. **41 is a raw count of `check(`
call sites, two of which fire only on failure.** Today: **33 seeds, 46 checks** — the 46 is right.
**Correct the sentence, and correct the number you wrote in the same breath as correcting a number.** *That is the
third time in four rounds that a count here was "corrected" into another wrong count.*

**M4 — `ladder:` the new self-report line is asserted by NO SEED.** `:775-779` prints the `limit——` line for
`any`-typed reads, and the header claims *"the blind spot is in the run and not only in this comment"* (`:138-145`)
— **but no check asserts it.** `check.mjs` mentions `limit——` only in prose (`:129`, `:884`, `:893`). **Seed 17
asserts the skipped-const line and seed 33 asserts the parse fence, so the pattern already exists; this is the one
line that skipped it.** **And the last review returned this exact class** — the `namespace imports` line the rewrite
never emitted — *"so it belongs a rung down, not in a fifth note."* **Seed it.**

## THE NON-BLOCKING FINDINGS, all of which I am ruling IN because they are the same class

- **⚠️ A documented limit DISAPPEARED while its behaviour did not change.** The fix-3 bullet *"a copy value carried
  by … a function parameter, a re-export, a **JSX spread** is not followed"* was **deleted**; parameters and
  re-exports are now genuinely followed, **but a spread (`<Card {...copy} />`) still contributes no field-named read,
  and `KNOWN LIMITS` no longer mentions it** — while the section still opens *"Each one names the INPUT."*
  **Restore the spread bullet.** *A limit that gets deleted by proximity to a fix is how a limit stops existing.*
- **The data-flow over-report is stated but UNFENCED**, unlike the parse limit which is fenced by seed 26 precisely
  because it *"could point the other way."* And the reviewer's sharpest line: the nearest reaching input is **not
  hypothetical** — *"any consumer prop type structurally like `{title, body, primaryLabel, skipLabel?}` would do it;
  today `FirstRunCardProps` escapes only because `body` is `ReactNode` — **an accident of an unrelated field, not a
  guard property.**"* **Fence it, or say why it cannot be fenced.**
- **Parameter destructuring is not walked** (`bindingReads` is reached only from `ts.isVariableDeclaration`), so
  `const render = ({ skipLabel }: FirstRunCardCopy) => …` is a missed read. Safe direction, **undocumented.**
- **Evidence form:** the report gave per-command numbers but no verbatim transcript, *"and three of the same
  report's numbers do not reproduce, which is the more serious form of the same defect."* **So: paste raw tails.**

## Acceptance

1. **M1-M3 corrected to the MEASURED number**, with the command you measured it with shown in the report.
2. **M4 seeded** — a check that asserts the `limit——` line appears for an `any`-typed read.
3. **The JSX-spread bullet restored** to `KNOWN LIMITS`; the data-flow over-report fenced or explained; the
   parameter-destructuring miss documented.
4. **Every count in the header is one you measured in this round**, and the header **stops quoting numbers it does
   not re-measure** — either re-measure them or delete the number. *A header that must be re-measured on every edit
   is a header that will be wrong again.*
5. **All seeds green** (46 checks today), **each new seed naming ONE baseline**, and **the two-sided property
   preserved**: **6 red vs `a03fc54`**, **11 red vs `be29027`**, **5 red vs `340d016`** — reproduce or correct, and
   say which you reproduced.
6. `npm run verify` exit 0 and `npm run typecheck` exit 0, **with raw output tails pasted**.

## Verify

`npm run verify`, `npm run typecheck`, both guard artifacts directly. **e2e is NOT required** — the previous round's
call was correct and the reviewer upheld it: the diff is two files under `scripts/guards/`, nothing under `src/`, no
runtime or config surface, and `verify` is the project's gate which includes the guard lane.

## Report

**`Committed as: <sha7>` from `git log --oneline -1`**, the measured number and the command for each of M1-M3, the
new seed's baseline, the raw output tails for `verify` and `typecheck`, and anything the brief did not anticipate.

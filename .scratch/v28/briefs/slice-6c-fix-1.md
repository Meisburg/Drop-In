# Slice 6c — FIX ROUND 1 (queued; dispatched when the verifier lands)

Read `docs/agents/code-structure.md`. **Small edits only.** Report to `.scratch/v28/reports/slice-6c-fix-1.md` with
raw tails, committed with the slice.

**The dedupe itself PASSED review** — it verified independently: **5 at base → 1**, the base `firstRunTour.ts:301`
and the new module's `:37` diff **IDENTICAL**, all four converted sites import it, and the guard + check +
`lib-sibling` + `no-bypass` + oxlint all green. **The blockers are the new guard's stated scope, and one measurement
in the report that has since become false.**

## G1 — [BLOCKING] The stated scope is not the implemented scope, in BOTH directions

**`regexp-escape-guard.mjs:31-36`** (and the printed claim at **`:125`**, echoed in the report at `:232-234`) states a
scope that **`SKIP_DIRS` at `:73-84` does not implement.** Measured by the reviewer:
- **(a) A copy planted in a TRACKED `.scratch` code file PASSES SILENTLY.** `git ls-files` shows **23 tracked
  `.scratch/**/*.mjs`**, and the reviewer's seed at `.scratch/v4/zz-probe.mjs` returned **exit=0** while `git grep`
  sees such a file. **So the header's "gitignored harness state" is FALSE for those 23 files.**
- **(b) `.vitest/` is gitignored** (*"Vitest's own cache directory. Never source, never committed."*) **and is NOT in
  `SKIP_DIRS`** — so **a generated cache file containing the literal FAILS the guards lane.** The reviewer's seed at
  `.vitest/cache.mjs` returned **exit=1**.

*"This is the same class — a stated boundary that is not the mechanism — this batch has already paid for four times."*

**Fix the implementation and the sentence so they are the same thing:** either drop `.scratch` from the skip (and say
which tracked files are then counted), or **state which tracked `.scratch` files are uncounted and why**; **and add
`.vitest`.** *A guard that fires on a cache file is a guard people route around; a guard that misses 23 tracked files
while saying it skips "harness state" is a guard whose boundary is a story.*

## G2 — [BLOCKING] The report's headline measurement is now FALSE under its own command

`.scratch/v28/reports/slice-6c.md:63-64` presents
`git grep --untracked --fixed-strings -- "$PAT" -- . | wc -l → 1` as the after-count. **At `ce3479c`/`32e9f48` that
command returns 16 — 15 of them the report's own quotations — and the report never says so.**

**⚠️ And the builder's warning about exactly this never reached the artifact:** the reviewer grepped and found
**no 15/16/self-hit sentence, in the report or in either commit message.** *It told me in its return message, which is
ephemeral; the artifact of record is what the next reader gets.* **So: put the caveat in the report** — that the
authoritative instrument is the guard (which reports exactly one hit in code), and that a naive re-run of that command
now returns the report's own quotations.

## G3 — [`SCAN_EXT` excludes `.mts`] `:86`

A copy inside a **`.d.mts`** is a **silent PASS** (measured: a `src/lib/zz.d.mts` seed → exit 0). The header does list
the extensions it scans, so this is minor — **add `.mts` or state it.**

## G4 — [the batch's own rule 1, unmet] `docs/agents/borrowed-guards.md:165-177`

> *"Write the rule into `docs/agents/code-structure.md` first, then the guard."*

**The diff touches no `docs/` file and nothing in `docs/` states the one-copy rule** (grepped). **Write the rule into
`docs/agents/code-structure.md`**, in the shape that file uses. *The batch's guard-authoring standard is not optional
because the guard is good.*

## ACCEPTED — do NOT change these (my rulings)

- **The `.d.mts` drift is the named cost of my ruling**, and the reviewer stated it precisely: `tsc` never reads the
  `.mjs` (`allowJs` off, and `tsconfig.app.json` is `config-guard` PROTECTED), so **typecheck checks call sites
  against the declaration and never the declaration against the implementation.** *Nothing deterministic catches it;
  a behaviour change would usually fail the sibling test.* **Accepted, with the cost written down.**
- **`lib-sibling-guard.sh:72` cannot see the new module** (it globs `*.ts` only; prints "55 modules" before and
  after). **Accepted by my ruling — the widening to `*.mjs`/`*.mts` is a named future item, not this round's job.**

## Acceptance

1. **G1's implementation and sentence agree**, and **both directions have a case**: a tracked `.scratch` copy is
   either caught or explicitly uncounted; a `.vitest` file **does not** fail the lane. *Show both.*
2. **G2's caveat is in the report**, naming the guard as the authoritative instrument.
3. **G3** done or stated. **G4** written into `docs/agents/code-structure.md`.
4. `npm run verify` exit 0 (**70 files / 2030 tests**, **81 warnings / 0 errors** — baseline must not move);
   `regexp-escape-guard.mjs` + its check exit 0; `run-all.sh` exit 0.
5. **If a behaviour change is required, prove the before/after** rather than asserting it.

## Report

**`Committed as: <sha7>`**, a per-finding fixed-or-stated table with the measurement behind each, and the two
demonstrations acceptance 1 asks for.

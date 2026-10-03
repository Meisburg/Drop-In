# Reviewer brief — V28 r2 slice 6c, fix round 1 (fresh context, judge the diff)

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

You did not write this and you must not assume it is sound. **Everything the builder reported is a claim;
`git diff` and the commands you run are evidence.** Findings must cite `file:line`.

## The diff under review

- **Base:** `c484648` — `git diff c484648..HEAD`
- **Slice commit:** `c2ec32e` — the four on-disk files + the two briefs + the new report
- **HEAD:** `50009ae` — a **report-only micro commit** (writes the slice sha into the report and corrects a
  stale `--stat` figure). **Its diff is one `.scratch` report file and nothing else — confirm that
  yourself and then review the code at `c2ec32e`.**

The four code/doc files in scope: `scripts/guards/regexp-escape-guard.mjs`,
`scripts/guards/regexp-escape-guard.check.mjs`, `docs/agents/code-structure.md`, and
`.scratch/v28/reports/slice-6c.md`.

## What the round was asked to do — judge against THIS, not against the builder's table

`.scratch/v28/briefs/slice-6c-fix-1.md` is the round's brief; `.scratch/v28/briefs/slice-6c-fix-1-completion.md`
is the completion round's. **Read both.** Its acceptance items, verbatim in substance:

1. **G1's implementation and its sentence agree**, and **both directions have a case**: a copy in a
   TRACKED `.scratch` code file is either caught or **explicitly uncounted**; **and** a `.vitest` file
   does **not** fail the lane. *Show both.*
2. **G2's caveat is in the report**, naming the guard as the authoritative instrument.
3. **G3** done or stated; **G4** written into `docs/agents/code-structure.md`.
4. **`npm run verify` exit 0 (70 files / 2030 tests / 81 warnings / 0 errors)**, guard + its check exit 0,
   `run-all.sh` exit 0 — **the baseline must not move.**
5. **If a behaviour change is required, prove the before/after rather than asserting it.**

**G1–G4 themselves are in `.scratch/v28/briefs/slice-6c-fix-1.md`** — read the findings there; this brief
does not restate them so that you judge against the original text.

## The probes that matter most — do these, do not reason about them

1. **Does the header's stated SCOPE equal `SKIP_DIRS` + `SCAN_EXT` as implemented?** Read both and compare
   clause by clause. The whole finding G1 exists because a previous header claimed a boundary the code did
   not implement. **Look for the same class in the new text, in either direction.**
2. **Reproduce the `.scratch` skip claim.** The header now says git tracks **262** files under `.scratch/`
   with 23 `.mjs`. **Measure it** — note the number moves as files are committed, and the header is
   supposed to carry the re-measuring command. Is 262 defensible as the figure it names, and does the text
   say so honestly, or does it still read as an invariant?
3. **Reproduce the `.vitest` before/after.** The check's case 5 comment asserts the seed *"returned exit 1
   before this round — measured"*. Take the **pre-round** guard (`git show c484648:scripts/guards/regexp-escape-guard.mjs`)
   and run the current check against it. **Do cases 5 and 6 fail against the old guard?** If they pass
   either way they are not regression tests. **Verify the same for case 4** — the report says case 4 passes
   against both and pins the sentence rather than the skip; is that honestly stated?
4. **Is the guard still a detector and not a story?** Run it. Confirm exactly one hit, in the sanctioned
   file, exit 0 — and that a seeded copy in `src/`, `e2e/`, `scripts/`, and a `.d.mts` is caught.
5. **Check for the batch's recurring class — a stated boundary that is not the mechanism.** Specifically:
   the printed scope line at the guard's exit; the `.check.mjs` case comments; the new section in
   `docs/agents/code-structure.md`. **Does any sentence describe behaviour the code does not have?**
6. **G4's shape.** Does the new section in `docs/agents/code-structure.md` state a rule the guard actually
   enforces, in that file's own voice? `docs/agents/borrowed-guards.md:165-177` is the standard it is
   supposed to meet — read it.
7. **Any number in the report or a commit message that does not reproduce.** This round found *two* stale
   figures in work it inherited and *two* of its own (self-referential `--stat` arithmetic). Treat every
   number as suspect and re-measure the ones that decide anything.

## Rulings you must NOT overturn (they are the orchestrator's, not the builder's)

- **The dedupe itself (5 → 1)** — passed review and verify.
- **`.scratch` stays in `SKIP_DIRS`.** The brief offered "drop it and state which files are then counted"
  as an option; the report says walking `.scratch` fails the lane on a frozen review-lane snapshot
  (`.scratch/guard-a03fc54.mjs:635`). **Verify that claim** — if it is true, keeping the skip and stating
  the hole is the correct half of the choice.
- **The `.d.mts` declaration-drift cost** and **`lib-sibling-guard.sh:72` globbing `*.ts` only** — named,
  accepted, out of this round's scope.

## Verdict

**`PASS` | `NEEDS_CHANGES` | `BLOCKED`**, then findings, each with `file:line` and the measurement behind it.
**A finding with no reproduction is an opinion — label it as one or drop it.** If you cannot verify
something, say so explicitly rather than passing it.
